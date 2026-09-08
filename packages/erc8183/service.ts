import { decodeEventLog, parseAbiItem, type Address, type Hex } from 'viem';
import { z } from 'zod';
import { CircleAdapter } from '../circle-adapter/src/index.js';
import { arcClient, ARC_USDC } from '../shared/src/chain.js';
import { atomicAmount, address, decimal, hex32 } from '../shared/src/index.js';
import artifact from './AgenticCommerce.abi.json' with { type: 'json' };
const abi=artifact as readonly unknown[];
const commerceEvent=parseAbiItem('event JobCreated(uint256 indexed jobId,address indexed client,address indexed provider,address evaluator,uint256 expiredAt,address hook)');
const txSchema=z.object({id:z.string(),state:z.string().optional(),txHash:hex32.optional()});
export class ProtectedJobService {
  readonly client:ReturnType<typeof arcClient>;
  constructor(readonly rpc:string,readonly contract:Address,readonly buyer:CircleAdapter,readonly provider:CircleAdapter) { this.client=arcClient(rpc); }
  private async tx(result:unknown,label:string):Promise<Hex> {
    const parsed=txSchema.parse(result);if(!parsed.txHash)throw new Error(`${label.toUpperCase()}_TX_UNKNOWN`);
    const receipt=await this.client.waitForTransactionReceipt({hash:parsed.txHash as Hex,timeout:60000});if(receipt.status!=='success')throw new Error(`${label.toUpperCase()}_FAILED`);return parsed.txHash as Hex;
  }
  async create(providerAddress:string,evaluator:string,expiresAt:number,description:string) {
    address.parse(providerAddress);address.parse(evaluator);if(!Number.isSafeInteger(expiresAt)||expiresAt<=Math.floor(Date.now()/1000)||expiresAt>Math.floor(Date.now()/1000)+30*86400)throw new Error('INVALID_EXPIRY');
    if(!description||description.length>2000)throw new Error('INVALID_DESCRIPTION');
    const tx=await this.tx(await this.buyer.execute('createJob(address,address,uint256,string,address)',[providerAddress,evaluator,String(expiresAt),description,'0x0000000000000000000000000000000000000000'],this.contract),'create_job');
    const receipt=await this.client.getTransactionReceipt({hash:tx});for(const log of receipt.logs){try{const decoded=decodeEventLog({abi:[commerceEvent],data:log.data,topics:log.topics});if(decoded.eventName==='JobCreated')return {jobId:decoded.args.jobId,txHash:tx};}catch{}}
    throw new Error('JOB_ID_NOT_FOUND');
  }
  async setBudget(jobId:string,amount:string) {if(!/^\d+$/.test(jobId))throw new Error('INVALID_JOB_ID');decimal.parse(amount);return this.tx(await this.provider.execute('setBudget(uint256,uint256,bytes)',[jobId,atomicAmount(amount,6).toString(),'0x'],this.contract),'set_budget');}
  async approveAndFund(jobId:string,amount:string) {if(!/^\d+$/.test(jobId))throw new Error('INVALID_JOB_ID');const value=atomicAmount(amount,6);const approve=await this.buyer.execute('approve(address,uint256)',[this.contract,value.toString()],ARC_USDC);await this.tx(approve,'approve');return this.tx(await this.buyer.execute('fund(uint256,bytes)',[jobId,'0x'],this.contract),'fund');}
  async submit(jobId:string,deliverableHash:string) {if(!/^\d+$/.test(jobId))throw new Error('INVALID_JOB_ID');hex32.parse(deliverableHash);return this.tx(await this.provider.execute('submit(uint256,bytes32,bytes)',[jobId,deliverableHash,'0x'],this.contract),'submit');}
}
