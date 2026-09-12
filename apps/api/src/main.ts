import Fastify from 'fastify';
import { verifyAccessToken } from '@privy-io/node';
import { z } from 'zod';
import { formatUnits, type Address } from 'viem';
import { loadConfig, apiConfig } from '../../../packages/shared/src/config.js';
import { poolFor, createRun } from '../../../packages/shared/src/storage.js';
import { arcClient, usdcBalance } from '../../../packages/shared/src/chain.js';
import { GraphClient } from '../../../packages/shared/src/graph.js';
import { hex32, intentSchema } from '../../../packages/shared/src/index.js';
import { BuyerRuntime, policySchema } from '../../buyer-agent/src/runtime.js';
import { Planner } from '../../buyer-agent/src/planner.js';
import { registerJobs } from './jobs.js';
import { apiError } from '../../../packages/shared/src/api-errors.js';
const cfg=loadConfig(apiConfig);
const db=poolFor(cfg.DATABASE_URL),graph=new GraphClient(cfg.GRAPH_URL,cfg.GRAPH_DEPLOYMENT_ID);
const planner=new Planner(cfg.LLM_COMPLETIONS_URL,cfg.LLM_MODEL,cfg.LLM_API_KEY);
const runtime=new BuyerRuntime(db,graph,cfg.ARC_RPC_URL,planner,cfg.CIRCLE_AGENT_ADDRESS as Address,cfg.WITNESS_URL,cfg.INTERNAL_SERVICE_TOKEN,cfg.MAX_GRAPH_LAG_BLOCKS);
const app=Fastify({bodyLimit:32768,logger:{redact:['req.headers.authorization','req.body','res.body']}});
const owners=new WeakMap<object,string>();
app.addHook('onRequest',async(req,reply)=>{
  if(['/healthz','/readyz'].includes(req.url))return;
  try {
    const token=req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];if(!token)throw new Error('MISSING_TOKEN');
    const claims=await verifyAccessToken({access_token:token,app_id:cfg.PRIVY_APP_ID,verification_key:cfg.PRIVY_VERIFICATION_KEY.replaceAll('\\n','\n')});
    // This reference runtime has one Circle wallet. Never let another Privy user spend it.
    if(claims.user_id!==cfg.OPERATOR_PRIVY_DID)throw new Error('WALLET_NOT_OWNED');owners.set(req,claims.user_id);
  }catch{return reply.code(401).send({error:'UNAUTHORIZED'});}
});
app.setErrorHandler((error,req,reply)=>{
  const result=apiError(error);
  req.log.error({code:result.error},'API operation stopped');
  reply.code(result.status).send({error:result.error});
});
const health=async()=>{
  const checks:Record<string,boolean>={};
  await Promise.all(Object.entries({postgres:()=>db.query('SELECT 1'),graph:()=>graph.meta(),arc:async()=>{
    if(await arcClient(cfg.ARC_RPC_URL).getChainId()!==5042002)throw new Error('WRONG_CHAIN');
  },witness:async()=>{
    const res=await fetch(new URL('/healthz',cfg.WITNESS_URL),{headers:{authorization:`Bearer ${cfg.INTERNAL_SERVICE_TOKEN}`},signal:AbortSignal.timeout(30000)});
    if(!res.ok)throw new Error('WITNESS_NOT_READY');
  }}).map(async([name,check])=>{try{await check();checks[name]=true;}catch{checks[name]=false;}}));
  return {ready:Object.values(checks).every(Boolean),checks};
};
for(const path of ['/healthz','/readyz'])app.get(path,async(_,reply)=>{const status=await health();return reply.code(status.ready?200:503).send(status);});
app.get('/api/v1/wallet',async()=>{const b=await usdcBalance(arcClient(cfg.ARC_RPC_URL),cfg.CIRCLE_AGENT_ADDRESS as Address);return {address:cfg.CIRCLE_AGENT_ADDRESS,chainId:5042002,decimals:b.decimals,balance:formatUnits(b.balance,b.decimals)};});
app.post('/api/v1/agent/runs',async(req,reply)=>{
  const input=z.object({objective:z.string().min(1).max(10000),policy:policySchema}).strict().parse(req.body);
  const key=z.string().uuid().parse(req.headers['idempotency-key']);
  if(!(await health()).ready)return reply.code(503).send({error:'LIVE_DEPENDENCIES_NOT_READY'});
  const run=await createRun(db,owners.get(req)!,key,input.objective,input.policy);
  if(run.created)void runtime.run(run.row.id).catch(()=>req.log.error({code:'RUN_PERSISTENCE_UNAVAILABLE'},'Run requires inspection'));
  return reply.code(202).send({runId:run.row.id,status:run.row.status});
});
app.get('/api/v1/agent/runs/:runId',async(req,reply)=>{
  const {runId}=z.object({runId:z.string().uuid()}).parse(req.params);
  const {rows}=await db.query('SELECT id,status,selected_endpoint_key,error_code,cancel_requested FROM agent_runs WHERE id=$1 AND user_id=$2',[runId,owners.get(req)]);
  if(!rows.length)return reply.code(404).send({error:'NOT_FOUND'});return rows[0];
});
app.post('/api/v1/agent/runs/:runId/stop',async(req,reply)=>{
  const {runId}=z.object({runId:z.string().uuid()}).parse(req.params);
  const {rowCount}=await db.query('UPDATE agent_runs SET cancel_requested=true WHERE id=$1 AND user_id=$2',[runId,owners.get(req)]);
  return reply.code(rowCount?202:404).send({stopRequested:!!rowCount,notice:'A payment that has been sent cannot be cancelled.'});
});
app.get('/api/v1/agent/runs/:runId/events',async(req,reply)=>{
  const {runId}=z.object({runId:z.string().uuid()}).parse(req.params);
  const exists=await db.query('SELECT id FROM agent_runs WHERE id=$1 AND user_id=$2',[runId,owners.get(req)]);
  if(!exists.rowCount)return reply.code(404).send({error:'NOT_FOUND'});
  let cursor=z.string().regex(/^(0|[1-9]\d{0,18})$/).refine(id=>BigInt(id)<=9223372036854775807n).parse(req.headers['last-event-id']??'0');
  reply.hijack();reply.raw.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive','X-Accel-Buffering':'no'});
  let closed=false;const onClose=()=>{closed=true;};reply.raw.on('close',onClose);
  const deadline=Date.now()+55000; // Reconnect revalidates the access token and resumes from durable event IDs.
  try {while(!closed&&Date.now()<deadline){
    const {rows}=await db.query('SELECT id,type,data FROM run_events WHERE run_id=$1 AND id>$2 ORDER BY id LIMIT 100',[runId,cursor]);
    for(const row of rows){if(closed)break;cursor=String(row.id);reply.raw.write(`id: ${row.id}\nevent: ${row.type}\ndata: ${JSON.stringify(row.data)}\n\n`);}
    if(reply.raw.writableLength>1024*1024)break; // Slow clients reconnect from their last durable cursor.
    reply.raw.write(': heartbeat\n\n');await new Promise(resolve=>setTimeout(resolve,1000));
  }}catch{if(!closed)reply.raw.write('event: stream.unavailable\ndata: {}\n\n');}
  finally {reply.raw.removeListener('close',onClose);reply.raw.end();}
});
app.post('/api/v1/risk/evaluate',async(req)=>{
  const input=z.object({intent:intentSchema,objective:z.string().min(1).max(10000)}).strict().parse(req.body);
  const {decision,rejections}=await runtime.assess(input.intent,input.objective);return {decision,rejections};
});
app.get('/api/v1/services',async()=>graph.query('query { endpoints(first:100,orderBy:lastObservedAt,orderDirection:desc){id providerKey receiptCount scoredSuccesses scoredFailures excludedOutcomes lastObservedAt} _meta {block{number}} }'));
app.get('/api/v1/services/:endpointKey',async(req)=>{
  const {endpointKey}=z.object({endpointKey:hex32}).parse(req.params);
  return graph.query('query($id:ID!){endpoint(id:$id){id providerKey receiptCount scoredSuccesses scoredFailures receipts(first:100,orderBy:observedAt,orderDirection:desc){id outcome observedAt evidenceURI transactionHash}}}',{id:endpointKey.toLowerCase()});
});
app.get('/api/v1/receipts/:receiptHash',async(req)=>{
  const {receiptHash}=z.object({receiptHash:hex32}).parse(req.params);
  return graph.query(`query($id:ID!){receipt(id:$id){id providerKey endpoint{id} payer amountPaid specHash paymentHash requestHash responseHash evidenceHash evidenceURIHash evidenceURI latencyMs httpStatus outcome observedAt blockNumber transactionHash providerAgentRegistry providerAgentId}}`,{id:receiptHash.toLowerCase()});
});
registerJobs(app,db,graph,cfg,req=>owners.get(req)!);
await app.listen({host:'127.0.0.1',port:cfg.API_PORT});
const close=async()=>{await app.close();await db.end();};process.on('SIGTERM',close);process.on('SIGINT',close);
