import { createPublicClient, decodeEventLog, encodeFunctionData, http, type Address, type Hex } from 'viem';
import { arcTestnet } from 'viem/chains';
import { commerceABI, type ChainJob, type ProviderAction } from './protected-job-provider';

export type TxState = 'IDLE'|'PREPARING'|'SIMULATION_READY'|'AWAITING_WALLET'|'WALLET_REJECTED'|'BROADCAST'|'CONFIRMED'|'FAILED'|'RECONCILIATION_REQUIRED';
type Configuration = { erc8183Address:string; providerWallet:string; evaluatorAddress:string; buyerAddress:string; budget:bigint; arcRpcUrl:string };
type Simulation = { action:ProviderAction; jobId:string; deliverableHash?:Hex };

export class ProviderWalletService {
  private readonly client;
  private simulation: Simulation | null = null;
  constructor(readonly config: Configuration) {
    this.client=createPublicClient({chain:arcTestnet,transport:http(config.arcRpcUrl,{retryCount:0})});
  }
  reset(){this.simulation=null;}
  invalidateSimulation(){this.simulation=null;}
  requiresConfirmation(action:ProviderAction,jobId:string){return action==='setBudget'?`SET BUDGET ${jobId}`:`SUBMIT DELIVERABLE ${jobId}`;}
  private async read(jobId:string):Promise<ChainJob>{
    const result=await this.client.readContract({address:this.config.erc8183Address as Address,abi:commerceABI,functionName:'getJob',args:[BigInt(jobId)]}) as readonly [bigint,Address,Address,Address,string,bigint,bigint,number,Address];
    return {id:result[0],client:result[1],provider:result[2],evaluator:result[3],description:result[4],budget:result[5],expiredAt:result[6],status:Number(result[7]),hook:result[8]};
  }
  async inspectJob(jobId:string,action:ProviderAction){
    const job=await this.read(jobId);const errors:string[]=[];
    if(job.id!==BigInt(jobId))errors.push('jobId');
    if(job.client.toLowerCase()!==this.config.buyerAddress.toLowerCase())errors.push('buyer');
    if(job.provider.toLowerCase()!==this.config.providerWallet.toLowerCase())errors.push('provider');
    if(job.evaluator.toLowerCase()!==this.config.evaluatorAddress.toLowerCase())errors.push('evaluator');
    const stateValid=action==='setBudget'?(job.status===0&&job.budget===0n):(job.status===1&&job.budget===this.config.budget);
    return {job,participantsValid:errors.length===0,validationErrors:errors,chainMatch:await this.client.getChainId()===5042002,
      providerMatch:job.provider.toLowerCase()===this.config.providerWallet.toLowerCase(),stateValid,
      budgetValid:action==='setBudget'?job.budget===0n:job.budget===this.config.budget};
  }
  prepareCalldata(action:ProviderAction,jobId:string,deliverableHash?:Hex):Hex {
    if(!/^\d+$/.test(jobId))throw new Error('INVALID_JOB_ID');
    if(action==='submit'&&!/^0x[0-9a-fA-F]{64}$/.test(deliverableHash??''))throw new Error('INVALID_DELIVERABLE_HASH');
    return encodeFunctionData({abi:commerceABI,functionName:action,args:action==='setBudget'
      ? [BigInt(jobId),this.config.budget,'0x']
      : [BigInt(jobId),deliverableHash!,'0x']});
  }
  async simulate(action:ProviderAction,jobId:string,deliverableHash?:Hex){
    try {
      const inspection=await this.inspectJob(jobId,action);
      if(!inspection.participantsValid||!inspection.chainMatch||!inspection.stateValid||!inspection.budgetValid)throw new Error('JOB_PRECONDITION_FAILED');
      const data=this.prepareCalldata(action,jobId,deliverableHash);
      await this.client.call({account:this.config.providerWallet as Address,to:this.config.erc8183Address as Address,data});
      this.simulation={action,jobId,deliverableHash};return {success:true as const};
    }catch(error){this.simulation=null;return {success:false as const,error:error instanceof Error?error.message:'SIMULATION_FAILED'};}
  }
  async broadcastAndVerify(txHash:Hex){
    const expected=this.simulation;if(!expected)throw new Error('STALE_OR_MISSING_SIMULATION');
    this.simulation=null;
    try {
      const receipt=await this.client.waitForTransactionReceipt({hash:txHash,timeout:60_000});
      if(receipt.status!=='success')return {receiptStatus:'reverted' as const,eventsVerified:false,postStateValid:false};
      if(receipt.from.toLowerCase()!==this.config.providerWallet.toLowerCase())
        return {receiptStatus:'success' as const,eventsVerified:false,postStateValid:false,error:'TRANSACTION_SIGNER_MISMATCH'};
      const eventName=expected.action==='setBudget'?'BudgetSet':'JobSubmitted';
      const matches=receipt.logs.flatMap(log=>{
        if(log.address.toLowerCase()!==this.config.erc8183Address.toLowerCase())return [];
        try {const decoded=decodeEventLog({abi:commerceABI,data:log.data,topics:log.topics,strict:true});return decoded.eventName===eventName?[decoded.args as unknown as Record<string,unknown>]:[];}catch{return [];}
      });
      const event=matches[0];
      const eventsVerified=matches.length===1&&String(event?.jobId)===expected.jobId&&
        (expected.action==='setBudget'?event?.amount===this.config.budget:
          String(event?.provider).toLowerCase()===this.config.providerWallet.toLowerCase()&&
          String(event?.deliverable).toLowerCase()===expected.deliverableHash?.toLowerCase());
      const job=await this.read(expected.jobId);
      const postStateValid=expected.action==='setBudget'?(job.status===0&&job.budget===this.config.budget):job.status===2;
      return {receiptStatus:'success' as const,eventsVerified,postStateValid,error:eventsVerified&&postStateValid?undefined:'EVENT_OR_STATE_MISMATCH'};
    }catch(error){return {receiptStatus:'unknown' as const,eventsVerified:false,postStateValid:false,error:error instanceof Error?error.message:'RECEIPT_UNAVAILABLE'};}
  }
}
