import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { initiateDeveloperControlledWalletsClient, type CircleDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';
import { address, decimal, hex32, serviceIdentity } from '../../shared/src/index.js';

const exec=promisify(execFile);
// Circle CLI is installed globally. CIRCLE_CLI_PATH is available for deployments
// where the global binary is outside the service user's PATH.
const cli=process.env.CIRCLE_CLI_PATH??'circle';
const observer=fileURLToPath(new URL('./observe.mjs',import.meta.url));
export const discoveryItem=z.object({resource:z.string().url(),metadata:z.object({
  provider:z.object({name:z.string()}),method:z.string(),description:z.string(),
  input:z.record(z.unknown()).optional(),output:z.record(z.unknown()).optional(),
})});
export type DiscoveryItem=z.infer<typeof discoveryItem>;
export const estimateSchema=z.object({price:decimal,chain:z.string(),scheme:z.string(),seller:address});
export type PaymentTerms=z.infer<typeof estimateSchema>;
const observationSchema=z.object({httpStatus:z.number().int(),contentType:z.string().nullable(),responseHash:hex32,requestHash:hex32,
  body:z.string(),settlement:z.string().nullable(),latencyMs:z.number().int(),observedAt:z.number().int()});
export type CapturedResponse=z.infer<typeof observationSchema>;

// execFile with explicit arguments: marketplace strings never become shell commands.
export async function circle(args:string[], observe?:{url:string;file:string;mode?:string}):Promise<unknown> {
  const env:NodeJS.ProcessEnv={PATH:process.env.PATH,HOME:process.env.HOME,
    CIRCLE_CLI_HOME:process.env.CIRCLE_CLI_HOME,
    // The CLI requires an explicit local acknowledgement before live commands.
    // This value is never inferred or accepted by the application.
    CIRCLE_ACCEPT_TERMS: process.env.CIRCLE_ACCEPT_TERMS,
    NODE_OPTIONS: `--import=${observer}`,
    XYX_OBSERVE_URL:observe?.url,XYX_OBSERVE_FILE:observe?.file,XYX_OBSERVE_MODE:observe?.mode} as unknown as NodeJS.ProcessEnv;
  try {
    const {stdout}=await exec(cli,[...args,'--output','json'],
      {timeout:120000,maxBuffer:4*1024*1024,env});
    const envelope=JSON.parse(stdout) as {data?:unknown;error?:unknown};
    if(envelope.error || envelope.data===undefined)throw new Error('INVALID_CIRCLE_OUTPUT');
    return envelope.data;
  } catch { throw new Error('CIRCLE_COMMAND_FAILED'); } // stderr may contain auth/payment headers.
}
export class CircleAdapter {
  private readonly developerWallet:CircleDeveloperControlledWalletsClient|null;
  constructor(readonly wallet:string) {
    address.parse(wallet);
    const apiKey=process.env.CIRCLE_API_KEY;
    const entitySecret=process.env.CIRCLE_ENTITY_SECRET;
    this.developerWallet=apiKey&&entitySecret ? initiateDeveloperControlledWalletsClient({apiKey,entitySecret}) : null;
  }
  private requireDeveloperWallet():CircleDeveloperControlledWalletsClient {
    if(!this.developerWallet)throw new Error('CIRCLE_DEVELOPER_WALLET_CONFIG_REQUIRED');
    return this.developerWallet;
  }
  // Marketplace discovery/payment still uses the documented PRD CLI boundary.
  // Wallet liveness and contract execution use Circle's Developer-Controlled Wallets SDK.
  async search(query:string):Promise<DiscoveryItem[]> {
    if(!query || query.startsWith('-') || query.length>200) throw new Error('INVALID_SEARCH');
    const raw=await circle(['services','search',query,'--limit','20']);
    return z.object({items:z.array(discoveryItem)}).parse(raw).items;
  }
  async inspect(item:DiscoveryItem,body:unknown) {
    serviceIdentity(item.resource,item.metadata.method);
    const dir=await mkdtemp(join(tmpdir(),'xyx-inspect-'));const file=join(dir,'observation.json');
    try {
      await circle(['services','inspect',item.resource,'-X',item.metadata.method,'-d',JSON.stringify(body)],{url:new URL(item.resource).href,file,mode:'inspect'});
      const raw=JSON.parse(await readFile(file,'utf8')) as {httpStatus:number;body:string;paymentRequired:string|null};
      if(raw.httpStatus!==402)throw new Error('PAYMENT_REQUIREMENTS_UNAVAILABLE');
      const payment=JSON.parse(Buffer.from(raw.paymentRequired??raw.body,'base64').toString('utf8'));
      return z.object({accepts:z.array(z.object({scheme:z.string(),network:z.string(),asset:address,payTo:address,amount:decimal.optional(),maxAmountRequired:decimal.optional()}).passthrough())}).parse(payment);
    } finally {await rm(dir,{recursive:true,force:true});}
  }
  async estimate(item:DiscoveryItem,body:unknown,cap:string):Promise<PaymentTerms> {
    serviceIdentity(item.resource,item.metadata.method);decimal.parse(cap);
    return estimateSchema.parse(await circle(['services','pay',item.resource,'--address',this.wallet,'--chain','ARC-TESTNET',
      '--max-amount',cap,'--estimate','-X',item.metadata.method,'-d',JSON.stringify(body)]));
  }
  async pay(item:DiscoveryItem,body:unknown,cap:string):Promise<{output:unknown;observation:CapturedResponse|null}> {
    serviceIdentity(item.resource,item.metadata.method);decimal.parse(cap);
    const dir=await mkdtemp(join(tmpdir(),'xyx-witness-'));
    const file=join(dir,'observation.json');
    try {
      let output:unknown=null;
      try {output=await circle(['services','pay',item.resource,'--address',this.wallet,'--chain','ARC-TESTNET',
        '--max-amount',cap,'--timeout','30','-X',item.metadata.method,'-d',JSON.stringify(body)],{url:new URL(item.resource).href,file});}
      catch {/* The request may have paid. Preserve observation and never retry automatically. */}
      let observation:CapturedResponse|null=null;
      try {observation=observationSchema.parse(JSON.parse(await readFile(file,'utf8')));} catch {/* Unknown outcome is not a failure claim. */}
      return {output,observation};
    } finally {await rm(dir,{recursive:true,force:true});}
  }
  async session() {
    const client=this.requireDeveloperWallet();
    const response=await client.listWallets({address:this.wallet,blockchain:'ARC-TESTNET'});
    const wallets=response.data?.wallets??[];
    if(!wallets.some(item=>item.address.toLowerCase()===this.wallet.toLowerCase()&&item.blockchain==='ARC-TESTNET'&&item.state==='LIVE'))
      throw new Error('CIRCLE_DEVELOPER_WALLET_NOT_LIVE');
    return {wallets};
  }
  async execute(signature:string,parameters:string[],contract:string,idempotencyKey:string=randomUUID()):Promise<{id:string;state?:string;txHash?:string}> {
    z.string().uuid().parse(idempotencyKey);
    if(!/^0x[0-9a-fA-F]{40}$/.test(contract)||!signature||signature.includes(';')||signature.includes(' '))throw new Error('INVALID_CONTRACT_CALL');
    for(const parameter of parameters)if(parameter.length>4096||/[\r\n]/.test(parameter))throw new Error('INVALID_CONTRACT_PARAMETER');
    const client=this.requireDeveloperWallet();
    const created=await client.createContractExecutionTransaction({
      abiFunctionSignature:signature,
      abiParameters:parameters,
      contractAddress:contract,
      walletAddress:this.wallet,
      blockchain:'ARC-TESTNET',
      fee:{type:'level',config:{feeLevel:'MEDIUM'}},
      idempotencyKey,
    });
    const initial=z.object({id:z.string(),state:z.string()}).parse(created.data);
    let state=initial.state;
    let txHash:string|undefined;
    for(let attempt=0;attempt<30;attempt++) {
      const current=await client.getTransaction({id:initial.id});
      const transaction=current.data?.transaction;
      if(transaction) {
        state=transaction.state;
        txHash=transaction.txHash;
        if(['COMPLETE','FAILED','DENIED','CANCELLED','STUCK'].includes(state))break;
      }
      await new Promise(resolve=>setTimeout(resolve,2000));
    }
    const parsed=z.object({id:z.string(),state:z.string().optional(),txHash:hex32.optional()}).passthrough().parse({id:initial.id,state,txHash});
    if(parsed.state && ['FAILED','DENIED','CANCELLED','STUCK'].includes(parsed.state))throw new Error('CIRCLE_CONTRACT_EXECUTION_FAILED');
    return parsed;
  }
}
