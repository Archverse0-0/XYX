import { z } from 'zod';
import { hex32 } from './index.js';
import { receiptSchema, type RiskReceipt } from '../../risk-engine/src/index.js';
const metaSchema=z.object({_meta:z.object({deployment:z.string(),hasIndexingErrors:z.boolean(),block:z.object({number:z.number().int().nonnegative(),hash:hex32.nullable()})})});
export class GraphClient {
  constructor(readonly endpoint:string,readonly deployment:string) {if(!endpoint||!deployment) throw new Error('GRAPH_NOT_CONFIGURED');}
  async query<T>(query:string,variables:Record<string,unknown>={}):Promise<T> {
    const res=await fetch(this.endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query,variables}),signal:AbortSignal.timeout(15000)});
    if(!res.ok) throw new Error('BLOCKED_TRUST_DATA');
    const json=await res.json() as {errors?:unknown;data?:T};
    if(json.errors||!json.data) throw new Error('BLOCKED_TRUST_DATA');return json.data;
  }
  async meta() {
    const data=metaSchema.parse(await this.query('query { _meta { deployment hasIndexingErrors block { number hash } } }'));
    if(data._meta.hasIndexingErrors||data._meta.deployment!==this.deployment) throw new Error('BLOCKED_TRUST_DATA');
    return data._meta;
  }
  async validations(agentId:string,block:number) {
    const schema=z.array(z.object({id:z.string(),validator:z.string().regex(/^0x[0-9a-fA-F]{40}$/),response:z.number().int().min(0).max(100),updatedAt:z.coerce.number().int().safe().nonnegative()}));
    const all:z.infer<typeof schema>=[];let cursor='';
    for(let page=0;page<200;page++) {
      const data=await this.query<{validations:unknown}>(`query($agent:String!,$cursor:ID!,$block:Int!){validations(first:1000,orderBy:id,orderDirection:asc,block:{number:$block},where:{agent:$agent,id_gt:$cursor}){id validator response updatedAt}}`,{agent:agentId,cursor,block});
      const rows=schema.parse(data.validations);all.push(...rows);
      if(rows.length<1000)return all;
      const next=rows.at(-1)!.id;if(next<=cursor)throw new Error('GRAPH_PAGINATION_ERROR');cursor=next;
    }
    throw new Error('EVIDENCE_LIMIT_EXCEEDED');
  }
  async evidence(keys:string[],now:number,block:number):Promise<RiskReceipt[]> {
    const receipts:RiskReceipt[]=[];
    for(const key of keys) {
      hex32.parse(key);let cursor='';
      for(let page=0;;page++) {
        if(page>=200)throw new Error('EVIDENCE_LIMIT_EXCEEDED'); // Never rank silently truncated history.
        const result=await this.query<{receipts:Array<Record<string,unknown>>}>(`query($key:String!,$since:BigInt!,$until:BigInt!,$cursor:ID!,$block:Int!){
          receipts(first:1000,orderBy:id,orderDirection:asc,block:{number:$block},where:{endpoint:$key,observedAt_gte:$since,observedAt_lte:$until,id_gt:$cursor}){
            id payer outcome observedAt blockNumber endpoint { id }
          }
        }`,{key:key.toLowerCase(),since:String(now-30*86400),until:String(now),cursor,block});
        if(!Array.isArray(result.receipts))throw new Error('BLOCKED_TRUST_DATA');
        for(const row of result.receipts) receipts.push(receiptSchema.parse({...row,endpointKey:(row.endpoint as {id:string}).id,observedAt:Number(row.observedAt),blockNumber:Number(row.blockNumber)}));
        if(result.receipts.length<1000)break;
        const next=String(result.receipts.at(-1)!.id);if(next<=cursor)throw new Error('GRAPH_PAGINATION_ERROR');cursor=next;
      }
    }
    return receipts;
  }
}
