import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { CircleAdapter, type DiscoveryItem, type PaymentTerms } from '../../../packages/circle-adapter/src/index.js';
import { hashJSON, serviceIdentity, atomicAmount, defaultPreference, preferences, type PurchaseIntent } from '../../../packages/shared/src/index.js';
import { evaluate, type Candidate } from '../../../packages/risk-engine/src/index.js';
import { GraphClient } from '../../../packages/shared/src/graph.js';
import { arcClient, usdcBalance, ARC_USDC } from '../../../packages/shared/src/chain.js';
import { event, type DB } from '../../../packages/shared/src/storage.js';
import { Planner } from './planner.js';
import type { Address } from 'viem';

export const policySchema=z.object({maxPriceUsdc:z.number().finite().positive().max(10000),minimumTrust:z.number().min(0).max(1).optional(),
  minimumEvidenceCount:z.number().int().nonnegative().optional(),requireProtection:z.boolean(),preference:preferences.default(defaultPreference)}).strict();
export type ExecutionPlan={item:DiscoveryItem;body:unknown;terms:PaymentTerms;requirements:unknown;candidate:Candidate};
export class BuyerRuntime {
  readonly circle:CircleAdapter;
  constructor(readonly db:DB,readonly graph:GraphClient,readonly rpc:string,readonly planner:Planner,readonly wallet:Address,readonly witnessURL:string,readonly internalToken:string,readonly maxLag:number){this.circle=new CircleAdapter(wallet);}
  async cancelled(runId:string){const {rows}=await this.db.query('SELECT cancel_requested FROM agent_runs WHERE id=$1',[runId]);if(rows[0]?.cancel_requested)throw new Error('CANCELLED');}
  async assess(intent:PurchaseIntent,objective:string) {
    const items=await this.circle.search(intent.query??intent.capability);
    const plans:ExecutionPlan[]=[];const rejections:Array<{url:string;reason:string}>=[];
    for(const item of items) {
      try {
        const body=await this.planner.request(objective,item,intent.capability);
        const requirements=await this.circle.inspect(item,body);
        const terms=await this.circle.estimate(item,body,String(intent.maxPriceUsdc));
        if(terms.chain!=='ARC-TESTNET')throw new Error('PAYMENT_INCOMPATIBLE');
        if(!requirements.accepts.some(a=>a.network==='eip155:5042002'&&a.asset.toLowerCase()===ARC_USDC.toLowerCase()&&a.scheme==='exact'&&a.payTo.toLowerCase()===terms.seller.toLowerCase()&&BigInt(a.amount??a.maxAmountRequired??'-1')===atomicAmount(terms.price,6)))throw new Error('PAYMENT_INCOMPATIBLE');
        const id=serviceIdentity(item.resource,item.metadata.method);
        const spec={...id,price:{asset:'USDC',amount:terms.price,supportedPaymentNetwork:terms.chain,paymentScheme:terms.scheme},request:item.metadata.input??null,response:item.metadata.output??null};
        plans.push({item,body,terms,requirements,candidate:{providerKey:id.providerKey,endpointKey:id.endpointKey,specHash:hashJSON(spec),capability:intent.capability,priceUsdc:terms.price,executable:true,protected:false,validation:null}});
      }catch(error){rejections.push({url:item.resource,reason:error instanceof Error?error.message:'INSPECTION_FAILED'});}
    }
    const client=arcClient(this.rpc);const meta=await this.graph.meta();
    const block=await client.getBlock({blockNumber:BigInt(meta.block.number)});
    if(block.hash?.toLowerCase()!==meta.block.hash?.toLowerCase())throw new Error('BLOCKED_TRUST_DATA');
    const head=Number(await client.getBlockNumber());const now=Number(block.timestamp);
    const receipts=await this.graph.evidence(plans.map(p=>p.candidate.endpointKey),now,meta.block.number);
    const decision=evaluate({intent,candidates:plans.map(p=>p.candidate),receipts,now,chainHead:head,indexedBlock:meta.block.number,maxGraphLagBlocks:this.maxLag,policyVersion:'xyx-balanced-v1'});
    return {plans,rejections,receipts,decision};
  }
  async run(runId:string) {
    try {
      const acquired=await this.db.query("UPDATE agent_runs SET status='PLANNING' WHERE id=$1 AND status='QUEUED' RETURNING *",[runId]);
      if(!acquired.rowCount)return;const run=acquired.rows[0];
      await this.cancelled(runId);
      const intent=await this.planner.intent(run.objective,policySchema.parse(run.policy_json));
      await this.db.query('INSERT INTO purchase_intents(run_id,intent) VALUES($1,$2)',[runId,JSON.stringify(intent)]);
      await event(this.db,runId,'intent.parsed',{...intent,query:undefined});
      await event(this.db,runId,'marketplace.search.started',{});
      const snapshot=await this.assess(intent,run.objective);
      await this.db.query('INSERT INTO candidate_snapshots(run_id,snapshot,decision) VALUES($1,$2,$3)',[runId,JSON.stringify(snapshot),JSON.stringify(snapshot.decision)]);
      await event(this.db,runId,'marketplace.search.completed',{count:snapshot.plans.length});
      await event(this.db,runId,'marketplace.compatibility.checked',{rejected:snapshot.rejections});
      await event(this.db,runId,'graph.query.completed',snapshot.decision.context);
      await event(this.db,runId,'risk.completed',snapshot.decision);
      const selected=snapshot.plans.find(p=>p.candidate.endpointKey===snapshot.decision.selectedCandidate);
      if(!selected)throw new Error('NO_ELIGIBLE_CANDIDATE');
      await this.cancelled(runId);
      const {balance,decimals}=await usdcBalance(arcClient(this.rpc),this.wallet);
      if(balance<atomicAmount(selected.terms.price,decimals))throw new Error('INSUFFICIENT_BALANCE');
      await this.db.query("UPDATE agent_runs SET status='SELECTED',selected_endpoint_key=$2,policy_hash=$3 WHERE id=$1",[runId,selected.candidate.endpointKey,snapshot.decision.policyHash]);
      await event(this.db,runId,'provider.selected',{endpointKey:selected.candidate.endpointKey});
      const executionId=randomUUID();
      const response=await fetch(new URL('/internal/execute',this.witnessURL),{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${this.internalToken}`},body:JSON.stringify({runId,executionId,idempotencyKey:runId}),signal:AbortSignal.timeout(240000)});
      if(!response.ok)throw new Error('WITNESS_EXECUTION_PENDING_OR_FAILED');
      const result=await response.json();await event(this.db,runId,'run.completed',result);
      await this.db.query("UPDATE agent_runs SET status='COMPLETED',finished_at=now() WHERE id=$1",[runId]);
    } catch(error) {
      const code=error instanceof Error?error.message:'RUN_FAILED';
      await this.db.query("UPDATE agent_runs SET status='FAILED',error_code=$2,finished_at=now() WHERE id=$1 AND status NOT IN ('COMPLETED','CANCELLED')",[runId,code]);
      await event(this.db,runId,'run.failed',{code});
    }
  }
}
