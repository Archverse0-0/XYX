import { decodeEventLog, type Abi, type Address, type Hex } from 'viem';
import { z } from 'zod';
import { CircleAdapter } from '../circle-adapter/src/index.js';
import { arcClient, ARC_USDC } from '../shared/src/chain.js';
import { atomicAmount, address, hex32 } from '../shared/src/index.js';
import { assertJobExpiry, jobIdSchema, usdcAmount } from '../shared/src/jobs.js';
import artifact from './AgenticCommerce.abi.json' with { type: 'json' };
export const commerceAbi=artifact as Abi;
export const chainJobSchema=z.object({id:z.bigint(),client:address,provider:address,evaluator:address,
  description:z.string(),budget:z.bigint(),expiredAt:z.bigint(),status:z.number().int(),hook:address});
export type ChainJob=z.infer<typeof chainJobSchema>;
type ChainLog={address:string;data:Hex;topics:readonly Hex[]};
export function jobEvent(logs:readonly ChainLog[],contract:string,eventName:string) {
  const matches:Record<string,unknown>[]=[];
  for(const log of logs) {
    if(log.address.toLowerCase()!==contract.toLowerCase())continue;
    try {
      const decoded=decodeEventLog({abi:commerceAbi,data:log.data,topics:log.topics as [Hex,...Hex[]],strict:true});
      if(decoded.eventName===eventName)matches.push(decoded.args as unknown as Record<string,unknown>);
    }catch {/* Unrelated or malformed event. */}
  }
  if(matches.length!==1)throw new Error('JOB_EVENT_UNVERIFIED');
  return matches[0];
}
const txSchema=z.object({id:z.string(),state:z.string().optional(),txHash:hex32.optional()});
export class ProtectedJobService {
  readonly client:ReturnType<typeof arcClient>;
  constructor(readonly rpc:string,readonly contract:Address,readonly buyer:CircleAdapter,readonly provider:Address) { this.client=arcClient(rpc);address.parse(provider); }
  async read(jobId:string):Promise<ChainJob> {
    return chainJobSchema.parse(await this.client.readContract({address:this.contract,abi:commerceAbi,functionName:'getJob',args:[BigInt(jobIdSchema.parse(jobId))]}));
  }
  async verifyParticipants(jobId:string,evaluator:string) {
    const job=await this.read(jobId);
    if(job.id!==BigInt(jobId)||job.client.toLowerCase()!==this.buyer.wallet.toLowerCase()||job.provider.toLowerCase()!==this.provider.toLowerCase()||job.evaluator.toLowerCase()!==evaluator.toLowerCase())throw new Error('JOB_PARTICIPANTS_MISMATCH');
    return job;
  }
  private async tx(result:unknown,label:string):Promise<Hex> {
    const parsed=txSchema.parse(result);if(!parsed.txHash)throw new Error(`${label.toUpperCase()}_TX_UNKNOWN`);
    const receipt=await this.client.waitForTransactionReceipt({hash:parsed.txHash as Hex,timeout:60000});if(receipt.status!=='success')throw new Error(`${label.toUpperCase()}_FAILED`);return parsed.txHash as Hex;
  }
  async create(providerAddress:string,evaluator:string,expiresAt:number,description:string,key:string) {
    address.parse(providerAddress);address.parse(evaluator);assertJobExpiry(expiresAt);
    if(providerAddress.toLowerCase()!==this.provider.toLowerCase())throw new Error('PROVIDER_WALLET_MISMATCH');
    if(!description||description.length>4096)throw new Error('INVALID_DESCRIPTION');
    const tx=await this.tx(await this.buyer.execute('createJob(address,address,uint256,string,address)',[providerAddress,evaluator,String(expiresAt),description,'0x0000000000000000000000000000000000000000'],this.contract,key),'create_job');
    const receipt=await this.client.getTransactionReceipt({hash:tx});
    const event=jobEvent(receipt.logs,this.contract,'JobCreated');
    if(String(event.client).toLowerCase()!==this.buyer.wallet.toLowerCase()||String(event.provider).toLowerCase()!==providerAddress.toLowerCase()||String(event.evaluator).toLowerCase()!==evaluator.toLowerCase()||event.expiredAt!==BigInt(expiresAt))throw new Error('JOB_EVENT_UNVERIFIED');
    return {jobId:String(event.jobId),txHash:tx};
  }
  async approve(amount:string,key:string) {const value=atomicAmount(usdcAmount.parse(amount),6);return this.tx(await this.buyer.execute('approve(address,uint256)',[this.contract,value.toString()],ARC_USDC,key),'approve');}
  async fund(jobId:string,key:string) {jobIdSchema.parse(jobId);return this.tx(await this.buyer.execute('fund(uint256,bytes)',[jobId,'0x'],this.contract,key),'fund');}
  async refund(jobId:string,key:string) {jobIdSchema.parse(jobId);return this.tx(await this.buyer.execute('claimRefund(uint256)',[jobId],this.contract,key),'refund');}
}
