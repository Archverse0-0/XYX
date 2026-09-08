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
import { CircleAdapter } from '../../../packages/circle-adapter/src/index.js';
import { ProtectedJobService } from '../../../packages/erc8183/service.js';
const cfg=loadConfig(apiConfig);
const db=poolFor(cfg.DATABASE_URL),graph=new GraphClient(cfg.GRAPH_URL,cfg.GRAPH_DEPLOYMENT_ID);
const planner=new Planner(cfg.LLM_COMPLETIONS_URL,cfg.LLM_MODEL,cfg.LLM_API_KEY);
const runtime=new BuyerRuntime(db,graph,cfg.ARC_RPC_URL,planner,cfg.CIRCLE_AGENT_ADDRESS as Address,cfg.WITNESS_URL,cfg.INTERNAL_SERVICE_TOKEN,cfg.MAX_GRAPH_LAG_BLOCKS);
const protectedJobs=cfg.CIRCLE_PROVIDER_WALLET&&cfg.CIRCLE_PROVIDER_ADDRESS ? new ProtectedJobService(cfg.ARC_RPC_URL,'0x0747EEf0706327138c69792bF28Cd525089e4583',new CircleAdapter(cfg.CIRCLE_AGENT_ADDRESS),new CircleAdapter(cfg.CIRCLE_PROVIDER_WALLET)) : null;
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
  const validation=error instanceof z.ZodError;
  req.log.error({code:validation?'INVALID_INPUT':'OPERATION_STOPPED'},'API operation stopped');
  reply.code(validation?400:503).send({error:validation?'INVALID_INPUT':'DEPENDENCY_OR_OPERATION_UNAVAILABLE'});
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
  if(run.created)void runtime.run(run.row.id);
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
  let cursor=z.coerce.number().int().nonnegative().parse(req.headers['last-event-id']??0);
  reply.hijack();reply.raw.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive','X-Accel-Buffering':'no'});
  let closed=false;req.raw.on('close',()=>{closed=true;});
  const deadline=Date.now()+55000; // Reconnect revalidates the access token and resumes from durable event IDs.
  while(!closed&&Date.now()<deadline){
    const {rows}=await db.query('SELECT id,type,data FROM run_events WHERE run_id=$1 AND id>$2 ORDER BY id LIMIT 100',[runId,cursor]);
    for(const row of rows){cursor=Number(row.id);reply.raw.write(`id: ${row.id}\nevent: ${row.type}\ndata: ${JSON.stringify(row.data)}\n\n`);}
    reply.raw.write(': heartbeat\n\n');await new Promise(resolve=>setTimeout(resolve,1000));
  }
  reply.raw.end();
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
app.get('/api/v1/jobs',async()=>graph.query('query {jobs(first:100,orderBy:createdAt,orderDirection:desc){id client provider evaluator budget status createdAt expiredAt transactionHash}}'));
app.post('/api/v1/jobs',async(req,reply)=>{
  if(!protectedJobs||!cfg.CIRCLE_PROVIDER_ADDRESS)return reply.code(503).send({error:'PROTECTED_JOB_NOT_CONFIGURED'});
  const input=z.object({provider:z.string().regex(/^0x[0-9a-fA-F]{40}$/).default(cfg.CIRCLE_PROVIDER_ADDRESS),budgetUsdc:z.string().regex(/^(0|[1-9]\d*)(\.\d{1,6})?$/),expiresAt:z.number().int(),description:z.string().min(1).max(2000)}).strict().parse(req.body);
  const key=z.string().uuid().parse(req.headers['idempotency-key']);const existing=await db.query('SELECT * FROM protected_job_runs WHERE user_id=$1 AND idempotency_key=$2',[owners.get(req),key]);if(existing.rowCount)return existing.rows[0];
  const evaluator=cfg.XYX_EVALUATOR_ADDRESS;const created=await protectedJobs.create(input.provider,evaluator,input.expiresAt,input.description);
  const row=await db.query(`INSERT INTO protected_job_runs(id,user_id,idempotency_key,job_id,state,specification,client_address,provider_address,evaluator_address,expired_at,amount_usdc)
    VALUES(gen_random_uuid(),$1,$2,$3,'OPEN',$4,$5,$6,$7,to_timestamp($8),$9) RETURNING *`,[owners.get(req),key,created.jobId.toString(),JSON.stringify(input),cfg.CIRCLE_AGENT_ADDRESS,input.provider,evaluator,input.expiresAt,input.budgetUsdc]);
  return reply.code(202).send({...row.rows[0],createTxHash:created.txHash,next:'Provider must setBudget before funding.'});
});
app.post('/api/v1/jobs/:jobId/fund',async(req,reply)=>{
  if(!protectedJobs)return reply.code(503).send({error:'PROTECTED_JOB_NOT_CONFIGURED'});const {jobId}=z.object({jobId:z.string().regex(/^\d+$/)}).parse(req.params);const input=z.object({budgetUsdc:z.string().regex(/^(0|[1-9]\d*)(\.\d{1,6})?$/)}).strict().parse(req.body);const found=await db.query('SELECT * FROM protected_job_runs WHERE job_id=$1 AND user_id=$2',[jobId,owners.get(req)]);if(!found.rowCount)return reply.code(404).send({error:'NOT_FOUND'});const row=found.rows[0];const budgetTx=await protectedJobs.setBudget(jobId,input.budgetUsdc);const fundTx=await protectedJobs.approveAndFund(jobId,input.budgetUsdc);await db.query("UPDATE protected_job_runs SET state='FUNDED',amount_usdc=$2 WHERE id=$1",[row.id,input.budgetUsdc]);return {jobId,budgetTx,fundTx,state:'FUNDED'};
});
app.post('/api/v1/jobs/:jobId/submit',async(req,reply)=>{
  if(!protectedJobs)return reply.code(503).send({error:'PROTECTED_JOB_NOT_CONFIGURED'});const {jobId}=z.object({jobId:z.string().regex(/^\d+$/)}).parse(req.params);const {deliverableHash}=z.object({deliverableHash:hex32}).strict().parse(req.body);const found=await db.query('SELECT * FROM protected_job_runs WHERE job_id=$1 AND user_id=$2',[jobId,owners.get(req)]);if(!found.rowCount)return reply.code(404).send({error:'NOT_FOUND'});const tx=await protectedJobs.submit(jobId,deliverableHash);await db.query("UPDATE protected_job_runs SET state='SUBMITTED',deliverable_hash=$2 WHERE id=$1",[found.rows[0].id,deliverableHash]);return {jobId,txHash:tx,state:'SUBMITTED'};
});
app.get('/api/v1/jobs/:jobId',async(req)=>{
  const {jobId}=z.object({jobId:z.string().regex(/^\d+$/)}).parse(req.params);
  return graph.query('query($id:ID!){job(id:$id){id client provider evaluator budget status createdAt expiredAt deliverableHash reasonHash evidenceHash transactionHash}}',{id:jobId});
});
app.post('/api/v1/jobs/:jobId/evaluate',async(req,reply)=>{
  const {jobId}=z.object({jobId:z.string().regex(/^\d+$/)}).parse(req.params);const input=z.object({decision:z.union([z.literal(1),z.literal(2)]),evidenceHash:hex32,reasonHash:hex32,expiresAt:z.number().int()}).strict().parse(req.body);
  const found=await db.query("SELECT * FROM protected_job_runs WHERE job_id=$1 AND user_id=$2 AND state='SUBMITTED'",[jobId,owners.get(req)]);if(!found.rowCount)return reply.code(404).send({error:'SUBMITTED_JOB_NOT_FOUND'});
  const response=await fetch(new URL('/internal/resolve-job',cfg.WITNESS_URL),{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${cfg.INTERNAL_SERVICE_TOKEN}`},body:JSON.stringify({jobId,...input}),signal:AbortSignal.timeout(120000)});if(!response.ok)return reply.code(503).send({error:'EVALUATOR_UNAVAILABLE'});const result=await response.json();await db.query("UPDATE protected_job_runs SET state=$2,verdict=$3,tx_hash=$4 WHERE id=$1",[found.rows[0].id,input.decision===1?'COMPLETED':'REJECTED',JSON.stringify(input),result.txHash]);return result;
});
await app.listen({host:'127.0.0.1',port:cfg.API_PORT});
const close=async()=>{await app.close();await db.end();};process.on('SIGTERM',close);process.on('SIGINT',close);
