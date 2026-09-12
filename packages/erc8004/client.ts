import { lookup } from 'node:dns';
import { Agent, fetch } from 'undici';
import ipaddr from 'ipaddr.js';
import { z } from 'zod';
import type { Abi, Address } from 'viem';
import { arcClient } from '../shared/src/chain.js';
import { address } from '../shared/src/index.js';
import identityABI from './IdentityRegistry.abi.json' with {type:'json'};
import deployment from './IdentityRegistry.deployment.json' with {type:'json'};

const registrations=z.object({registrations:z.array(z.object({agentRegistry:z.string(),agentId:z.union([z.string().regex(/^\d+$/),z.number().int().safe().nonnegative()])})).max(20)});
export type ProviderIdentity={registry:Address;agentId:string};
export const isPublicAddress=(value:string)=>ipaddr.process(value).range()==='unicast';
async function publicJSON(input:string) {
  const url=new URL(input);
  if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443')throw new Error('IDENTITY_URL_UNSAFE');
  const hostname=url.hostname.replace(/^\[|\]$/g,'');
  if(ipaddr.isValid(hostname)&&!isPublicAddress(hostname))throw new Error('IDENTITY_URL_UNSAFE');
  // Resolve and filter at connection time, not just a preflight vulnerable to DNS rebinding.
  const dispatcher=new Agent({connect:{lookup(host,options,callback){
    lookup(host,{all:true,verbatim:true},(error,answers)=>{
      if(error)return callback(error,'',4);
      if(!answers.length||answers.some(a=>!isPublicAddress(a.address)))return callback(new Error('IDENTITY_URL_UNSAFE'),'',4);
      if(options.all)callback(null,answers);else callback(null,answers[0].address,answers[0].family);
    });
  }}});
  try {
    const response=await fetch(url,{dispatcher,redirect:'error',signal:AbortSignal.timeout(5000)});
    if(!response.ok||!response.body)throw new Error('IDENTITY_UNAVAILABLE');
    const chunks:Uint8Array[]=[];let length=0;
    for await(const chunk of response.body){length+=chunk.length;if(length>65536)throw new Error('IDENTITY_TOO_LARGE');chunks.push(chunk);}
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  }finally{await dispatcher.destroy();}
}
export class ERC8004Client {
  readonly client:ReturnType<typeof arcClient>;
  constructor(rpc:string){this.client=arcClient(rpc);}
  async resolve(endpoint:string,payee:string,blockNumber:bigint):Promise<ProviderIdentity|null> {
    try {
      if(await this.client.getChainId()!==deployment.chainId)return null;
      const origin=new URL(endpoint).origin;
      const domain=registrations.parse(await publicJSON(origin+'/.well-known/agent-registration.json'));
      const expectedRegistry=`eip155:${deployment.chainId}:${deployment.address}`.toLowerCase();
      const candidates=domain.registrations.filter(r=>r.agentRegistry.toLowerCase()===expectedRegistry);
      // Ambiguous mappings remain unmapped. Never choose an identity by name or order.
      if(candidates.length!==1)return null;
      const agentId=BigInt(candidates[0].agentId);if(agentId>=2n**256n)return null;
      const contract={address:deployment.address as Address,abi:identityABI as Abi,blockNumber};
      const [uri,wallet]=await Promise.all([
        this.client.readContract({...contract,functionName:'tokenURI',args:[agentId]}),
        this.client.readContract({...contract,functionName:'getAgentWallet',args:[agentId]}),
      ]);
      if(address.parse(wallet).toLowerCase()!==payee.toLowerCase())return null;
      const metadata=z.object({services:z.array(z.object({endpoint:z.string()})).max(100)}).parse(await publicJSON(z.string().parse(uri)));
      if(!metadata.services.some(s=>s.endpoint===endpoint))return null;
      return {registry:deployment.address as Address,agentId:agentId.toString()};
    }catch{return null;} // Optional identity failure never excludes a provider by itself.
  }
}

export function validationScore(rows:Array<{validator:string;response:number;updatedAt:number;id:string}>,
  accepted:Array<{address:string;weight:number}>,now:number):number|null {
  let numerator=0,denominator=0;
  for(const validator of [...accepted].sort((a,b)=>a.address.toLowerCase().localeCompare(b.address.toLowerCase()))) {
    const latest=rows.filter(r=>r.validator.toLowerCase()===validator.address.toLowerCase()&&r.updatedAt<=now&&r.updatedAt>=now-30*86400)
      .sort((a,b)=>b.updatedAt-a.updatedAt||(a.id<b.id?-1:a.id>b.id?1:0))[0];
    if(!latest)continue;
    if(!Number.isFinite(latest.response)||latest.response<0||latest.response>100)throw new Error('INVALID_VALIDATION_RESPONSE');
    numerator+=validator.weight*latest.response/100;denominator+=validator.weight;
  }
  return denominator?numerator/denominator:null;
}
