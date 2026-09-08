import Ajv from 'ajv';
import { randomUUID } from 'node:crypto';
import { createWalletClient, decodeEventLog, erc20Abi, hashTypedData, http, zeroAddress, type Address, type Hex } from 'viem';
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
const ajv=new Ajv({strict:false,allErrors:true,validateFormats:false});
export class Witness {
  readonly circle:CircleAdapter;
  readonly client:ReturnType<typeof arcClient>;
  readonly signer:ReturnType<typeof privateKeyToAccount>;
  readonly evaluatorSigner:ReturnType<typeof privateKeyToAccount>;
  readonly relayer:ReturnType<typeof createWalletClient>;
  constructor(readonly db:DB,readonly rpc:string,readonly wallet:Address,readonly registry:Address,readonly evaluator:Address,
    signerKey:Hex,relayerKey:Hex,evaluatorKey:Hex,readonly storage:EvidenceStorage,readonly graph:GraphClient,readonly maxLag:number) {
    this.signer=privateKeyToAccount(signerKey);const account=privateKeyToAccount(relayerKey);
    this.evaluatorSigner=privateKeyToAccount(evaluatorKey);
    if(new Set([account.address.toLowerCase(),this.signer.address.toLowerCase(),this.evaluatorSigner.address.toLowerCase(),wallet.toLowerCase()]).size!==4)throw new Error('SIGNER_SEPARATION_REQUIRED');
    this.relayer=createWalletClient({account,chain:arcTestnet,transport:http(rpc,{retryCount:0})});
    this.circle=new CircleAdapter(wallet);this.client=arcClient(rpc);
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
        if(row.state==='RECEIPT_SIGNED')return this.anchor(row.id);
        // Unknown payment state must be reconciled by an operator, never blindly retried.
        throw new Error('EXECUTION_REQUIRES_RECONCILIATION');
      }
      const {rows}=await this.db.query(`SELECT r.*,i.intent,s.snapshot FROM agent_runs r JOIN purchase_intents i ON i.run_id=r.id
        JOIN LATERAL(SELECT snapshot FROM candidate_snapshots WHERE run_id=r.id ORDER BY id DESC LIMIT 1)s ON true WHERE r.id=$1`,[runId]);
      const run=rows[0];if(!run||run.status!=='SELECTED'||run.cancel_requested)throw new Error('RUN_NOT_EXECUTABLE');
      const intent=intentSchema.parse(run.intent);
      if(intent.requireProtection)throw new Error('PROTECTION_REQUIRED');
      const plan=(run.snapshot.plans as ExecutionPlan[]).find(p=>p.candidate.endpointKey===run.selected_endpoint_key);
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
        payer:this.wallet,providerIdentity:{registry:null,agentId:null},
        payment:{amount:terms.price,asset:'USDC',referenceHash:settlement.transaction,network:settlement.network},
        request:{method:id.method,urlHash:hashText(latest.resource),bodyHash:observation.requestHash},
        response:{httpStatus:observation.httpStatus,bodyHash:observation.responseHash,contentType:observation.contentType},
        timing:{latencyMs:observation.latencyMs},outcome,observedAt:observation.observedAt};
      await event(this.db,runId,'verification.completed',{outcome,httpStatus:observation.httpStatus});
      const stored=await this.storage.persist(bundle);
      await this.db.query('INSERT INTO evidence_records(execution_id,evidence_hash,evidence_uri,evidence_uri_hash,bundle) VALUES($1,$2,$3,$4,$5)',[executionId,stored.evidenceHash,stored.evidenceURI,stored.evidenceURIHash,JSON.stringify(bundle)]);
      await event(this.db,runId,'evidence.persisted',stored);
      const nonce=BigInt((await this.db.query("SELECT nextval('witness_nonce') AS nonce")).rows[0].nonce);
      const receipt={providerKey:id.providerKey,endpointKey:id.endpointKey,specHash:plan.candidate.specHash,payer:this.wallet,amountPaid:amount,
        paymentHash:settlement.transaction,requestHash:observation.requestHash,responseHash:observation.responseHash,evidenceHash:stored.evidenceHash,evidenceURIHash:stored.evidenceURIHash,
        latencyMs:observation.latencyMs,httpStatus:observation.httpStatus,outcome,observedAt:BigInt(observation.observedAt),nonce,providerAgentRegistry:zeroAddress,providerAgentId:0n};
      const typed={domain:receiptDomain(this.registry),types:receiptTypes,primaryType:'ReceiptAttestation' as const,message:receipt};
      const signature=await this.signer.signTypedData(typed);const digest=hashTypedData(typed);
      const signed=JSON.stringify({receipt,signature,uri:stored.evidenceURI},(_,v)=>typeof v==='bigint'?v.toString():v);
      await this.db.query("UPDATE execution_attempts SET state='RECEIPT_SIGNED',signed_receipt=$2,receipt_hash=$3,outcome=$4 WHERE id=$1",[executionId,signed,digest,outcome]);
      return this.anchor(executionId);
    } finally {await lock.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',[runId]);lock.release();}
  }
  async anchor(executionId:string) {
    const row=(await this.db.query('SELECT * FROM execution_attempts WHERE id=$1',[executionId])).rows[0];
    if(!row?.signed_receipt)throw new Error('SIGNED_RECEIPT_UNAVAILABLE');
    const {receipt:r,signature,uri}=row.signed_receipt;
    const receipt={...r,amountPaid:BigInt(r.amountPaid),observedAt:BigInt(r.observedAt),nonce:BigInt(r.nonce),providerAgentId:BigInt(r.providerAgentId)};
    let hash=row.arc_tx_hash as Hex|null;
    if(!await this.client.readContract({address:this.registry,abi:receiptAnchorAbi,functionName:'anchored',args:[row.receipt_hash]})) {
      if(!hash) {
        // Multiple relayer operations use a DB lock; no local in-memory nonce assumptions.
        const connection=await this.db.connect();
        try {
          await connection.query("SELECT pg_advisory_lock(hashtextextended('xyx-relayer',0))");
          const {request}=await this.client.simulateContract({address:this.registry,abi:receiptAnchorAbi,functionName:'anchorReceipt',args:[receipt,uri,signature],account:this.relayer.account!});
          hash=await this.relayer.writeContract(request);
          await this.db.query('UPDATE execution_attempts SET arc_tx_hash=$2 WHERE id=$1',[executionId,hash]);
          const tx=await this.client.waitForTransactionReceipt({hash,timeout:60000});if(tx.status!=='success')throw new Error('ANCHOR_REVERTED');
        } finally {await connection.query("SELECT pg_advisory_unlock(hashtextextended('xyx-relayer',0))");connection.release();}
      } else {const tx=await this.client.waitForTransactionReceipt({hash,timeout:60000});if(tx.status!=='success')throw new Error('ANCHOR_REVERTED');}
    }
    // A relayer crash may lose the tx hash after broadcast; recover the actual event from the chain.
    if(!hash) {
      const {parseAbiItem}=await import('viem');
      const logs=await this.client.getLogs({address:this.registry,event:parseAbiItem('event ReceiptAnchored(bytes32 indexed receiptHash,bytes32 indexed endpointKey,bytes32 indexed providerKey,address payer,uint128 amountPaid,bytes32 specHash,bytes32 paymentHash,bytes32 requestHash,bytes32 responseHash,bytes32 evidenceHash,bytes32 evidenceURIHash,uint32 latencyMs,uint16 httpStatus,uint8 outcome,uint64 observedAt,address providerAgentRegistry,uint256 providerAgentId,string evidenceURI)'),args:{receiptHash:row.receipt_hash},fromBlock:BigInt(process.env.EVIDENCE_START_BLOCK??'0'),toBlock:'latest'});
      hash=logs[0]?.transactionHash??null;if(!hash)throw new Error('ANCHOR_EVENT_UNAVAILABLE');
    }
    await this.db.query("UPDATE execution_attempts SET state='RECEIPT_ANCHORED',arc_tx_hash=$2,finished_at=now() WHERE id=$1",[executionId,hash]);
    await event(this.db,row.run_id,'receipt.anchored',{receiptHash:row.receipt_hash,arcTxHash:hash});
    return {receiptHash:row.receipt_hash,arcTxHash:hash};
  }
  async resolveJob(jobId:string,decision:1|2,evidenceHash:Hex,reasonHash:Hex,expiresAt:number) {
    if(!/^\d+$/.test(jobId)||decision!==1&&decision!==2||expiresAt<=Math.floor(Date.now()/1000)||expiresAt>Math.floor(Date.now()/1000)+900)throw new Error('INVALID_VERDICT');
    const job=await this.client.readContract({address:this.evaluator,abi:[{type:'function',name:'agenticCommerce',stateMutability:'view',inputs:[],outputs:[{type:'address'}]}] as const,functionName:'agenticCommerce'}).catch(()=>null);
    if(!job)throw new Error('EVALUATOR_UNAVAILABLE');
    const commerceAbi=[{type:'function',name:'getJob',stateMutability:'view',inputs:[{name:'jobId',type:'uint256'}],outputs:[{type:'tuple',components:[{name:'id',type:'uint256'},{name:'client',type:'address'},{name:'provider',type:'address'},{name:'evaluator',type:'address'},{name:'description',type:'string'},{name:'budget',type:'uint256'},{name:'expiredAt',type:'uint256'},{name:'status',type:'uint8'},{name:'hook',type:'address'}]}]}] as const;
    const state=await this.client.readContract({address:job as Address,abi:commerceAbi,functionName:'getJob',args:[BigInt(jobId)]});
    if(Number(state.status)!==2||state.evaluator.toLowerCase()!==this.evaluator.toLowerCase())throw new Error('JOB_NOT_SUBMITTED_TO_XYX');
    const nonce=BigInt((await this.db.query("SELECT nextval('evaluator_nonce') AS nonce")).rows[0].nonce);
    const verdict={jobId:BigInt(jobId),evidenceHash,reasonHash,decision,issuedAt:BigInt(Math.floor(Date.now()/1000)),expiresAt:BigInt(expiresAt),nonce};
    const signature=await this.evaluatorSigner.signTypedData({domain:verdictDomain(this.evaluator),types:verdictTypes,primaryType:'JobVerdict',message:verdict});
    const {request}=await this.client.simulateContract({address:this.evaluator,abi:evaluatorAbi,functionName:'resolveJob',args:[verdict,signature],account:this.relayer.account!});
    const tx=await this.relayer.writeContract(request);const receipt=await this.client.waitForTransactionReceipt({hash:tx,timeout:60000});if(receipt.status!=='success')throw new Error('VERDICT_TX_FAILED');return {txHash:tx,decision,jobId};
  }
}
