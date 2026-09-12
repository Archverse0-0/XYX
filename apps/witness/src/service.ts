import Ajv from 'ajv';
import { randomUUID } from 'node:crypto';
import { createWalletClient, decodeEventLog, erc20Abi, hashTypedData, http, recoverTypedDataAddress, zeroAddress, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arcTestnet } from 'viem/chains';
import { z } from 'zod';
import { CircleAdapter } from '../../../packages/circle-adapter/src/index.js';
import { hashJSON, hashText, atomicAmount, intentSchema, receiptDomain, receiptTypes, verdictDomain, verdictTypes, hex32, serviceIdentity } from '../../../packages/shared/src/index.js';
import { classify } from '../../../packages/shared/src/verify.js';
import { arcClient, ARC_USDC, usdcBalance } from '../../../packages/shared/src/chain.js';
import { receiptAnchorAbi, evaluatorAbi } from '../../../packages/shared/src/abi.js';
import { EvidenceStorage } from '../../../packages/shared/src/evidence.js';
import { GraphClient } from '../../../packages/shared/src/graph.js';
import { event, type DB } from '../../../packages/shared/src/storage.js';
import type { ExecutionPlan } from '../../buyer-agent/src/runtime.js';
import { commerceAbi, chainJobSchema, jobEvent } from '../../../packages/erc8183/service.js';
import { assertJobBudget, canonicalJobSpec, createJobSchema, evaluateDeliverable, jobIdSchema } from '../../../packages/shared/src/jobs.js';
import { jobOperation, withJobLock } from '../../../packages/shared/src/job-operations.js';
import { ProtectedJobReconciler } from '../../../packages/shared/src/reconciler.js';
import { ERC8004Client } from '../../../packages/erc8004/client.js';
const ajv=new Ajv({strict:false,allErrors:true,validateFormats:false});
export class Witness {
  readonly circle:CircleAdapter;
  readonly client:ReturnType<typeof arcClient>;
  readonly signer:ReturnType<typeof privateKeyToAccount>;
  readonly evaluatorSigner:ReturnType<typeof privateKeyToAccount>;
  readonly relayer:ReturnType<typeof createWalletClient>;
  readonly reconciler:ProtectedJobReconciler;
  constructor(readonly db:DB,readonly rpc:string,readonly wallet:Address,readonly registry:Address,readonly evaluator:Address,
    signerKey:Hex,relayerKey:Hex,evaluatorKey:Hex,readonly storage:EvidenceStorage,readonly graph:GraphClient,readonly maxLag:number,
    readonly commerce:Address,readonly maxJobUsdc:string,readonly evidenceStartBlock:number=0) {
    this.signer=privateKeyToAccount(signerKey);const account=privateKeyToAccount(relayerKey);
    this.evaluatorSigner=privateKeyToAccount(evaluatorKey);
    if(new Set([account.address.toLowerCase(),this.signer.address.toLowerCase(),this.evaluatorSigner.address.toLowerCase(),wallet.toLowerCase()]).size!==4)throw new Error('SIGNER_SEPARATION_REQUIRED');
    this.relayer=createWalletClient({account,chain:arcTestnet,transport:http(rpc,{retryCount:0})});
    this.circle=new CircleAdapter(wallet);this.client=arcClient(rpc);
    this.reconciler=new ProtectedJobReconciler(db,rpc,commerce,evaluator,wallet);
  }
  async execute(runId:string,executionId:string,key:string) {
    const lock=await this.db.connect();
    try {
      const got=await lock.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS acquired',[runId]);
      if(!got.rows[0].acquired)throw new Error('EXECUTION_BUSY');
      const previous=await this.db.query('SELECT * FROM execution_attempts WHERE run_id=$1',[runId]);
      if(previous.rows.length) {
        const row=previous.rows[0];
        if(row.state==='RECEIPT_ANCHORED')return {receiptHash:row.receipt_hash,arcTxHash:row.arc_tx_hash};
        if(row.state==='RECEIPT_SIGNED')return this.anchor(row.id as string);
        // Unknown payment state must be reconciled by an operator, never blindly retried.
        throw new Error('EXECUTION_REQUIRES_RECONCILIATION');
      }
      const {rows}=await this.db.query(`SELECT r.*,i.intent,s.snapshot FROM agent_runs r JOIN purchase_intents i ON i.run_id=r.id
        JOIN LATERAL(SELECT snapshot FROM candidate_snapshots WHERE run_id=r.id ORDER BY id DESC LIMIT 1)s ON true WHERE r.id=$1`,[runId]);
      const run=rows[0] as any;if(!run||run.status!=='SELECTED'||run.cancel_requested)throw new Error('RUN_NOT_EXECUTABLE');
      const intent=intentSchema.parse(run.intent);
      if(intent.requireProtection)throw new Error('PROTECTION_REQUIRED');
      const plan=((run.snapshot as any).plans as ExecutionPlan[]).find(p=>p.candidate.endpointKey===run.selected_endpoint_key);
      if(!plan)throw new Error('SELECTION_NOT_FOUND');
      const id=serviceIdentity(plan.item.resource,plan.item.metadata.method);
      if(id.endpointKey!==plan.candidate.endpointKey||!plan.item.metadata.input||!ajv.validate(plan.item.metadata.input,plan.body))throw new Error('CLIENT_INVALID_REQUEST');
      // Discover again to bind current schemas, not only current price.
      const latest=(await this.circle.search(intent.query??intent.capability)).find(p=>p.resource===plan.item.resource&&p.metadata.method===plan.item.metadata.method);
      if(!latest||hashJSON(latest.metadata)!==hashJSON(plan.item.metadata))throw new Error('SERVICE_TERMS_CHANGED');
      const requirements=await this.circle.inspect(latest,plan.body);
      const terms=await this.circle.estimate(latest,plan.body,String(intent.maxPriceUsdc));
      if(hashJSON(terms)!==hashJSON(plan.terms)||hashJSON(requirements)!==hashJSON(plan.requirements))throw new Error('PAYMENT_TERMS_CHANGED');
      if(terms.chain!=='ARC-TESTNET')throw new Error('PAYMENT_INCOMPATIBLE');
      const {balance,decimals}=await usdcBalance(this.client,this.wallet);
      const amount=atomicAmount(terms.price,decimals);
      if(amount>atomicAmount(String(intent.maxPriceUsdc),decimals)||amount>balance||amount>=2n**128n)throw new Error('BUDGET_EXCEEDED');
      const meta=await this.graph.meta();const head=await this.client.getBlockNumber();
      if(head<BigInt(meta.block.number)||head-BigInt(meta.block.number)>BigInt(this.maxLag))throw new Error('BLOCKED_TRUST_DATA');
      if((await this.client.getBlock({blockNumber:BigInt(meta.block.number)})).hash!==meta.block.hash)throw new Error('BLOCKED_TRUST_DATA');
      const providerIdentity=await new ERC8004Client(this.rpc).resolve(latest.resource,terms.seller,BigInt(meta.block.number));
      if(plan.candidate.validation!==null&&hashJSON(providerIdentity)!==hashJSON(plan.providerIdentity??null))throw new Error('PROVIDER_IDENTITY_CHANGED');
      await this.storage.health();
      await event(this.db,runId,'payment.preflight.completed',{price:terms.price,chain:terms.chain});
      // Commit payment intent before contacting Circle. UNIQUE(run_id) prevents double spending.
      const started=await this.db.query(`INSERT INTO execution_attempts(id,run_id,idempotency_key,endpoint_key,state,payment_amount)
        SELECT $1,$2,$3,$4,'PAYMENT_PENDING',$5 FROM agent_runs WHERE id=$2 AND NOT cancel_requested RETURNING id`,[executionId,runId,key,id.endpointKey,terms.price]);
      if(!started.rowCount)throw new Error('CANCELLED');
      await event(this.db,runId,'payment.started',{executionId});
      const result=await this.circle.pay(latest,plan.body,String(intent.maxPriceUsdc));
      if(!result.observation)throw new Error('PAYMENT_OUTCOME_UNKNOWN');
      const observation=result.observation;
      // Store only hashes and public metadata. Raw response is validated in memory then discarded.
      await this.db.query("UPDATE execution_attempts SET state='RESPONSE_CAPTURED',observation=$2 WHERE id=$1",[executionId,JSON.stringify({...observation,body:undefined})]);
      if(!observation.settlement)throw new Error('PAYMENT_SETTLEMENT_UNVERIFIED');
      const settlement=z.object({success:z.literal(true),transaction:hex32,network:z.literal('eip155:5042002')}).passthrough().parse(JSON.parse(Buffer.from(observation.settlement,'base64').toString('utf8')));
      const tx=await this.client.waitForTransactionReceipt({hash:settlement.transaction as Hex,timeout:60000});
      if(tx.status!=='success')throw new Error('PAYMENT_FAILED');
      const transfers=tx.logs.flatMap(log=>{
        if(log.address.toLowerCase()!==ARC_USDC.toLowerCase())return [];
        try {const event=decodeEventLog({abi:erc20Abi,data:log.data,topics:log.topics});return event.eventName==='Transfer'?[event.args]:[];}catch{return [];}
      });
      if(!transfers.some(t=>t.from.toLowerCase()===this.wallet.toLowerCase()&&t.to.toLowerCase()===terms.seller.toLowerCase()&&t.value===amount))throw new Error('PAYMENT_TRANSFER_UNVERIFIED');
      await this.db.query("UPDATE execution_attempts SET state='PAYMENT_SETTLED',payment_ref=$2 WHERE id=$1",[executionId,settlement.transaction]);
      await event(this.db,runId,'payment.completed',{transaction:settlement.transaction,amount:terms.price});
      let valid:boolean|null=null;
      if(latest.metadata.output) {
        try {valid=!!ajv.validate(latest.metadata.output,JSON.parse(Buffer.from(observation.body,'base64').toString('utf8')));}catch{valid=false;}
      }
      const outcome=classify({payment:'accepted',requestValid:true,responseReceived:true,httpStatus:observation.httpStatus,schemaValid:valid,timedOut:false,providerTimeoutProven:false,withinDeclaredLimits:false});
      const bundle={version:'xyx-evidence-v1',providerKey:id.providerKey,endpointKey:id.endpointKey,specHash:plan.candidate.specHash,
        payer:this.wallet,providerIdentity:providerIdentity??{registry:null,agentId:null},
        payment:{amount:terms.price,asset:'USDC',referenceHash:settlement.transaction,network:settlement.network},
        request:{method:id.method,urlHash:hashText(latest.resource),bodyHash:observation.requestHash},
        response:{httpStatus:observation.httpStatus,bodyHash:observation.responseHash,contentType:observation.contentType},
        timing:{latencyMs:observation.latencyMs},outcome,observedAt:observation.observedAt};
      await event(this.db,runId,'verification.completed',{outcome,httpStatus:observation.httpStatus});
      const stored=await this.storage.persist(bundle) as any;
      await this.db.query('INSERT INTO evidence_records(execution_id,evidence_hash,evidence_uri,evidence_uri_hash,bundle) VALUES($1,$2,$3,$4,$5)',[executionId,stored.evidenceHash,stored.evidenceURI,stored.evidenceURIHash,JSON.stringify(bundle)]);
      await event(this.db,runId,'evidence.persisted',stored);
      const nonce=BigInt((await this.db.query("SELECT nextval('witness_nonce') AS nonce")).rows[0].nonce as number);
      const receipt={providerKey:id.providerKey,endpointKey:id.endpointKey,specHash:plan.candidate.specHash,payer:this.wallet,amountPaid:amount,
        paymentHash:settlement.transaction,requestHash:observation.requestHash,responseHash:observation.responseHash,evidenceHash:stored.evidenceHash,evidenceURIHash:stored.evidenceURIHash,
        latencyMs:observation.latencyMs,httpStatus:observation.httpStatus,outcome,observedAt:BigInt(observation.observedAt),nonce,providerAgentRegistry:providerIdentity?.registry??zeroAddress,providerAgentId:BigInt(providerIdentity?.agentId??'0')};
      const typed={domain:receiptDomain(this.registry),types:receiptTypes,primaryType:'ReceiptAttestation' as const,message:receipt};
      const signature=await this.signer.signTypedData(typed);const digest=hashTypedData(typed);
      const signed=JSON.stringify({receipt,signature,uri:stored.evidenceURI},(_,v)=>typeof v==='bigint'?v.toString():v);
      await this.db.query("UPDATE execution_attempts SET state='RECEIPT_SIGNED',signed_receipt=$2,receipt_hash=$3,outcome=$4 WHERE id=$1",[executionId,signed,digest,outcome]);
      return this.anchor(executionId);
    } finally {await lock.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',[runId]);lock.release();}
  }
  async anchor(executionId:string) {
    const row=(await this.db.query('SELECT * FROM execution_attempts WHERE id=$1',[executionId])).rows[0] as any;
    if(!row?.signed_receipt)throw new Error('SIGNED_RECEIPT_UNAVAILABLE');
    const {receipt:r,signature,uri}=(row.signed_receipt as unknown as {receipt:any,signature:string,uri:string});
    const receipt={...r,amountPaid:BigInt(r.amountPaid),observedAt:BigInt(r.observedAt),nonce:BigInt(r.nonce),providerAgentId:BigInt(r.providerAgentId)};
    let hash=row.arc_tx_hash as Hex|null;
    if(!await this.client.readContract({address:this.registry,abi:receiptAnchorAbi,functionName:'anchored',args:[row.receipt_hash as Hex]})) {
      if(!hash) {
        // Multiple relayer operations use a DB lock; no local in-memory nonce assumptions.
        const connection=await this.db.connect();
        try {
          await connection.query("SELECT pg_advisory_lock(hashtextextended('xyx-relayer',0))");
          const {request}=await (this.client.simulateContract as any)({address:this.registry,abi:receiptAnchorAbi,functionName:'anchorReceipt',args:[receipt,uri,signature],account:this.relayer.account});
          hash=await this.relayer.writeContract(request);
          await this.db.query('UPDATE execution_attempts SET arc_tx_hash=$2 WHERE id=$1',[executionId,hash]);
          const tx=await this.client.waitForTransactionReceipt({hash,timeout:60000});if(tx.status!=='success')throw new Error('ANCHOR_REVERTED');
        } finally {await connection.query("SELECT pg_advisory_unlock(hashtextextended('xyx-relayer',0))");connection.release();}
      } else {const tx=await this.client.waitForTransactionReceipt({hash,timeout:60000});if(tx.status!=='success')throw new Error('ANCHOR_REVERTED');}
    }
    // A relayer crash may lose the tx hash after broadcast; recover the actual event from the chain.
    if(!hash) {
      const {parseAbiItem}=await import('viem');
      const logs=await this.client.getLogs({address:this.registry,event:parseAbiItem('event ReceiptAnchored(bytes32 indexed receiptHash,bytes32 indexed endpointKey,bytes32 indexed providerKey,address payer,uint128 amountPaid,bytes32 specHash,bytes32 paymentHash,bytes32 requestHash,bytes32 responseHash,bytes32 evidenceHash,bytes32 evidenceURIHash,uint32 latencyMs,uint16 httpStatus,uint8 outcome,uint64 observedAt,address providerAgentRegistry,uint256 providerAgentId,string evidenceURI)'),args:{receiptHash:row.receipt_hash},fromBlock:BigInt(this.evidenceStartBlock),toBlock:'latest'});
      hash=logs[0]?.transactionHash??null;if(!hash)throw new Error('ANCHOR_EVENT_UNAVAILABLE');
    }
    await this.db.query("UPDATE execution_attempts SET state='RECEIPT_ANCHORED',arc_tx_hash=$2,finished_at=now() WHERE id=$1",[executionId,hash]);
    await event(this.db,row.run_id as string,'receipt.anchored',{receiptHash:row.receipt_hash,arcTxHash:hash});
    return {receiptHash:row.receipt_hash,arcTxHash:hash};
  }
  async resolveJob(jobId:string) {
    jobIdSchema.parse(jobId);
    const found=await this.db.query('SELECT * FROM protected_job_runs WHERE job_id=$1 AND commerce_address=$2',[jobId,this.commerce]);
    if(found.rows.length!==1)throw new Error('JOB_NOT_FOUND');
    const runId=found.rows[0].id as string;
    return withJobLock(this.db,runId,async()=>{
      const row=(await this.db.query('SELECT * FROM protected_job_runs WHERE id=$1',[runId])).rows[0] as any;
      const cached=await this.db.query("SELECT * FROM job_operations WHERE job_run_id=$1 AND operation='evaluate'",[runId]);
      if(cached.rows.length) {
        // Try reconciliation before blocking
        const { reconcileOperation } = await import('../../../packages/shared/src/job-operations.js');
        const parsedInput=createJobSchema.parse(typeof row.specification==='string'?JSON.parse(row.specification):row.specification);
        const requestHash = hashJSON({specificationHash:hashJSON(canonicalJobSpec(parsedInput)),deliverableHash:row.deliverable_hash});
        const reconciliation = await reconcileOperation(this.reconciler, cached.rows[0], requestHash);
        if (reconciliation.status === 'RECOVERED_CONFIRMED') {
          const result=z.object({jobId:jobIdSchema,decision:z.union([z.literal(1),z.literal(2)]),txHash:hex32}).parse(reconciliation.result);
          if((await this.client.getTransactionReceipt({hash:result.txHash as Hex})).status!=='success')throw new Error('VERDICT_TX_FAILED');
          await this.db.query("UPDATE protected_job_runs SET state=$2,tx_hash=$3 WHERE id=$1",[runId,result.decision===1?'COMPLETED':'REJECTED',result.txHash]);
          return result;
        }
        if (reconciliation.status === 'SAFE_TO_RETRY') {
          // Clear old operation and allow fresh attempt
          await this.db.query("DELETE FROM job_operations WHERE job_run_id=$1 AND operation='evaluate'",[runId]);
        } else if (reconciliation.status === 'CANONICAL_CONFLICT') {
          throw new Error('JOB_CANONICAL_CONFLICT');
        } else {
          throw new Error('JOB_RECONCILIATION_REQUIRED');
        }
      }
      const input=createJobSchema.parse(typeof row.specification==='string'?JSON.parse(row.specification):row.specification);
      const specification=canonicalJobSpec(input);
      const canonicalSpecHash=hashJSON(specification);
      assertJobBudget(input.budgetUsdc,this.maxJobUsdc);
      const configuredCommerce=await this.client.readContract({address:this.evaluator,abi:[{type:'function',name:'agenticCommerce',stateMutability:'view',inputs:[],outputs:[{type:'address'}]}] as const,functionName:'agenticCommerce'});
      if(configuredCommerce.toLowerCase()!==this.commerce.toLowerCase())throw new Error('ERC8183_CONFIGURATION_MISMATCH');
      const state=chainJobSchema.parse(await this.client.readContract({address:this.commerce,abi:commerceAbi,functionName:'getJob',args:[BigInt(jobId)]}));
      if(state.id!==BigInt(jobId)||state.status!==2||state.evaluator.toLowerCase()!==this.evaluator.toLowerCase()||
        state.client.toLowerCase()!==this.wallet.toLowerCase()||state.provider.toLowerCase()!==input.provider.toLowerCase()||
        state.budget!==atomicAmount(input.budgetUsdc,6)||state.description!==input.description+' | XYX specification: '+canonicalSpecHash)
        throw new Error('JOB_COMMITMENT_MISMATCH');
      if(new Set([this.relayer.account!.address,this.signer.address,this.evaluatorSigner.address,this.wallet,state.provider].map(value=>value.toLowerCase())).size!==5)
        throw new Error('SIGNER_SEPARATION_REQUIRED');
      if(!row.submission_tx_hash||!row.deliverable_uri||!row.deliverable_hash)throw new Error('DELIVERABLE_UNAVAILABLE');
      const submitted=await this.client.getTransactionReceipt({hash:hex32.parse(row.submission_tx_hash) as Hex});
      if(submitted.status!=='success')throw new Error('SUBMISSION_UNCONFIRMED');
      const observed=jobEvent(submitted.logs,this.commerce,'JobSubmitted');
      if(observed.jobId!==BigInt(jobId)||(observed.provider as string).toLowerCase()!==state.provider.toLowerCase()||
        (observed.deliverable as string).toLowerCase()!==row.deliverable_hash.toLowerCase())throw new Error('DELIVERABLE_COMMITMENT_MISMATCH');
      const deliverable=await this.storage.readJSON(row.deliverable_uri,row.deliverable_hash);
      const evaluated=evaluateDeliverable(input.evaluation,deliverable);
      const metaBlock=Number(await this.client.getBlockNumber());
      const meta=await this.client.getBlock({blockNumber:BigInt(metaBlock)});
      const bundle={version:'xyx-job-evidence-v1',jobId,commerce:this.commerce,submissionTxHash:row.submission_tx_hash,
        specification:{hash:canonicalSpecHash,input:row.specification,description:state.description},
        participants:{client:state.client,provider:state.provider,evaluator:state.evaluator},
        chainState:{chainId:5042002,blockNumber:metaBlock,blockHash:meta.hash,jobStatus:state.status,jobBudget:state.budget.toString()},
        deliverable:{uri:row.deliverable_uri,hash:row.deliverable_hash,canonical:deliverable},
        evaluation:{kind:'exact-json-v1',decision:evaluated.decision,reasonHash:evaluated.reasonHash,deterministic:true},
        ...evaluated,observedAt:Math.floor(Date.now()/1000)};
      const stored=await this.storage.persist(bundle) as any;
      const result=await jobOperation(this.db,runId as string,'evaluate',
        {specificationHash:canonicalSpecHash,deliverableHash:row.deliverable_hash},
        async()=>{
        const nonce=BigInt((await this.db.query("SELECT nextval('evaluator_nonce') AS nonce")).rows[0].nonce as number);
        const now=BigInt(Math.floor(Date.now()/1000));
        const rawMaxVerdictLifetime=await this.client.readContract({address:this.evaluator,abi:evaluatorAbi,functionName:'maxVerdictLifetime'});
        if(typeof rawMaxVerdictLifetime!=='bigint')throw new Error('UNEXPECTED_VERDICT_LIFETIME');
        const maxVerdictLifetime=rawMaxVerdictLifetime;
        if(maxVerdictLifetime===0n||maxVerdictLifetime>300n)throw new Error('UNEXPECTED_VERDICT_LIFETIME');
        const verdict={jobId:BigInt(jobId),evidenceHash:stored.evidenceHash,reasonHash:evaluated.reasonHash,decision:evaluated.decision,issuedAt:now,expiresAt:now+maxVerdictLifetime,nonce};
        const signature=await this.evaluatorSigner.signTypedData({domain:verdictDomain(this.evaluator),types:verdictTypes,primaryType:'JobVerdict',message:verdict});
        const recovered=await recoverTypedDataAddress({domain:verdictDomain(this.evaluator),types:verdictTypes,primaryType:'JobVerdict',message:verdict,signature});
        if(recovered.toLowerCase()!==this.evaluatorSigner.address.toLowerCase())throw new Error('VERDICT_SIGNER_MISMATCH');
        if(now>=verdict.expiresAt)throw new Error('VERDICT_EXPIRED');
        const connection=await this.db.connect();
        try {
          await connection.query("SELECT pg_advisory_lock(hashtextextended('xyx-relayer',0))");
          await this.db.query('UPDATE protected_job_runs SET verdict=$2,signature=$3,evaluation_evidence_uri=$4 WHERE id=$1',
            [runId,JSON.stringify(verdict,(_,v)=>typeof v==='bigint'?v.toString():v),signature,stored.evidenceURI]);
          const {request}=await this.client.simulateContract({address:this.evaluator,abi:evaluatorAbi,functionName:'resolveJob',args:[verdict,signature],account:this.relayer.account!});
          const txHash=await this.relayer.writeContract(request);
          await this.reconciler.recordBroadcast(runId,'evaluate',txHash);
          await this.db.query('UPDATE protected_job_runs SET tx_hash=$2 WHERE id=$1',[runId,txHash]);
          const receipt=await this.client.waitForTransactionReceipt({hash:txHash,timeout:60000});
          if(receipt.status!=='success')throw new Error('VERDICT_TX_FAILED');
          const verdictEvents=receipt.logs.flatMap(log=>{
            if(log.address.toLowerCase()!==this.evaluator.toLowerCase())return [];
            try {
              const decoded=decodeEventLog({abi:evaluatorAbi,data:log.data,topics:log.topics,strict:true});
              return decoded.eventName==='JobVerdictExecuted'?[decoded.args as unknown as Record<string,unknown>]:[];
            } catch{return [];}
          });
          if(verdictEvents.length!==1)throw new Error('VERDICT_EVENT_UNVERIFIED');
          const verdictEvent=verdictEvents[0];
          if(String(verdictEvent.verdictHash).toLowerCase()!==hashTypedData({domain:verdictDomain(this.evaluator),types:verdictTypes,primaryType:'JobVerdict',message:verdict}).toLowerCase()||
            String(verdictEvent.jobId)!==jobId||verdictEvent.decision!==evaluated.decision||
            String(verdictEvent.evidenceHash).toLowerCase()!==stored.evidenceHash.toLowerCase()||
            String(verdictEvent.reasonHash).toLowerCase()!==evaluated.reasonHash.toLowerCase()||
            String(verdictEvent.attestor).toLowerCase()!==this.evaluatorSigner.address.toLowerCase())throw new Error('VERDICT_EVENT_MISMATCH');
          const finalState=chainJobSchema.parse(await this.client.readContract({address:this.commerce,abi:commerceAbi,functionName:'getJob',args:[BigInt(jobId)]}));
          if(finalState.status!==(evaluated.decision===1?3:4))throw new Error('FINAL_JOB_STATE_MISMATCH');
          return {jobId,decision:evaluated.decision,txHash};
        }finally{try{await connection.query("SELECT pg_advisory_unlock(hashtextextended('xyx-relayer',0))");}finally{connection.release();}}
      },this.reconciler);
      await this.db.query("UPDATE protected_job_runs SET state=$2 WHERE id=$1",[runId,result.decision===1?'COMPLETED':'REJECTED']);
      return result;
    });
  }
}
