import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Address } from 'viem';
import type { apiConfig } from '../../../packages/shared/src/config.js';
import type { DB } from '../../../packages/shared/src/storage.js';
import type { GraphClient } from '../../../packages/shared/src/graph.js';
import { hashJSON, canonicalJSON, atomicAmount } from '../../../packages/shared/src/index.js';
import { assertJobBudget, assertJobExpiry, canonicalJobSpec, createJobSchema, jobIdSchema, usdcAmount } from '../../../packages/shared/src/jobs.js';
import { jobOperation, withJobLock } from '../../../packages/shared/src/job-operations.js';
import { ProtectedJobReconciler } from '../../../packages/shared/src/reconciler.js';
import { evidenceStorageFromEnvironment } from '../../../packages/shared/src/evidence.js';
import { CircleAdapter } from '../../../packages/circle-adapter/src/index.js';
import { ProtectedJobService, jobEvent } from '../../../packages/erc8183/service.js';
import { type Hex, parseAbiItem } from 'viem';

type Config=z.output<typeof apiConfig>;
export function registerJobs(app:FastifyInstance,db:DB,graph:GraphClient,cfg:Config,owner:(req:FastifyRequest)=>string) {
  const service=cfg.PROTECTED_JOB_PROVIDER_ADDRESS
    ? new ProtectedJobService(cfg.ARC_RPC_URL,cfg.ERC8183_ADDRESS as Address,new CircleAdapter(cfg.CIRCLE_AGENT_ADDRESS),cfg.PROTECTED_JOB_PROVIDER_ADDRESS as Address):null;
  const storage=evidenceStorageFromEnvironment(cfg);if(!storage)throw new Error('IPFS_STORAGE_CONFIGURATION_REQUIRED');
  const reconciler=service ? new ProtectedJobReconciler(db,cfg.ARC_RPC_URL,cfg.ERC8183_ADDRESS as Address,cfg.XYX_EVALUATOR_ADDRESS as Address,cfg.CIRCLE_AGENT_ADDRESS as Address) : null;
  const configured=()=>{if(!service)throw new Error('PROTECTED_JOB_NOT_CONFIGURED');return service;};
  const owned=async(req:FastifyRequest)=>{
    const {jobId}=z.object({jobId:jobIdSchema}).parse(req.params);
    const {rows}=await db.query('SELECT * FROM protected_job_runs WHERE job_id=$1 AND user_id=$2',[jobId,owner(req)]);
    if(rows.length!==1)throw new Error('JOB_NOT_FOUND');
    const row=rows[0];
    if(row.commerce_address?.toLowerCase()!==cfg.ERC8183_ADDRESS.toLowerCase()||
      row.client_address?.toLowerCase()!==cfg.CIRCLE_AGENT_ADDRESS.toLowerCase()||
      row.provider_address?.toLowerCase()!==cfg.PROTECTED_JOB_PROVIDER_ADDRESS?.toLowerCase()||
      row.evaluator_address?.toLowerCase()!==cfg.XYX_EVALUATOR_ADDRESS.toLowerCase())throw new Error('JOB_CONFIGURATION_CHANGED');
    return row;
  };
  app.get('/api/v1/jobs',async()=>graph.query('query {jobs(first:100,orderBy:createdAt,orderDirection:desc){id client provider evaluator budget status createdAt expiredAt transactionHash}}'));
  app.get('/api/v1/job-runs',async(req)=>{
    const {rows}=await db.query(`SELECT id,job_id,state,specification,amount_usdc,tx_hash,deliverable_hash,deliverable_uri,created_at,
      (SELECT jsonb_agg(jsonb_build_object('operation',operation,'state',state,'result',result)) FROM job_operations WHERE job_run_id=r.id) AS operations
      FROM protected_job_runs r WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100`,[owner(req)]);
    return {source:'operational',configured:!!service,maxJobUsdc:cfg.MAX_JOB_USDC,provider:cfg.PROTECTED_JOB_PROVIDER_ADDRESS??null,runs:rows};
  });
  app.post('/api/v1/jobs',async(req,reply)=>{
    const svc=configured();
    const input=createJobSchema.parse(req.body);
    assertJobBudget(input.budgetUsdc,cfg.MAX_JOB_USDC);
    if(input.provider.toLowerCase()!==svc.provider.toLowerCase())throw new Error('PROVIDER_WALLET_MISMATCH');
    const key=z.string().uuid().parse(req.headers['idempotency-key']);
    const connection=await db.connect();
    let row;
    try {
      await connection.query('BEGIN');
      await connection.query('INSERT INTO users(id) VALUES($1) ON CONFLICT DO NOTHING',[owner(req)]);
      const inserted=await connection.query(`INSERT INTO protected_job_runs(id,user_id,idempotency_key,state,specification,client_address,provider_address,evaluator_address,commerce_address,expired_at,amount_usdc)
        VALUES(gen_random_uuid(),$1,$2,'PREPARING',$3,$4,$5,$6,$7,to_timestamp($8),$9)
        ON CONFLICT(user_id,idempotency_key) DO NOTHING RETURNING *`,
        [owner(req),key,JSON.stringify(input),cfg.CIRCLE_AGENT_ADDRESS,input.provider,cfg.XYX_EVALUATOR_ADDRESS,cfg.ERC8183_ADDRESS,input.expiresAt,input.budgetUsdc]);
      row=inserted.rows[0]??(await connection.query('SELECT * FROM protected_job_runs WHERE user_id=$1 AND idempotency_key=$2',[owner(req),key])).rows[0];
      if(hashJSON(row.specification)!==hashJSON(input))throw new Error('IDEMPOTENCY_CONFLICT');
      if(row.commerce_address!==cfg.ERC8183_ADDRESS||row.evaluator_address!==cfg.XYX_EVALUATOR_ADDRESS||row.client_address!==cfg.CIRCLE_AGENT_ADDRESS)throw new Error('JOB_CONFIGURATION_CHANGED');
      await connection.query('COMMIT');
    }catch(error){await connection.query('ROLLBACK');throw error;}finally{connection.release();}
    const result=await withJobLock(db,row.id,async()=>{
      const created=await jobOperation(db,row.id,'create',input,async opKey=>{
        assertJobExpiry(input.expiresAt);
        return svc.create(input.provider,cfg.XYX_EVALUATOR_ADDRESS,input.expiresAt,input.description+' | XYX specification: '+hashJSON(canonicalJobSpec(input)),opKey);
      },reconciler ?? undefined);
      await db.query("UPDATE protected_job_runs SET job_id=$2,state=CASE WHEN state='PREPARING' THEN 'OPEN' ELSE state END,tx_hash=COALESCE(tx_hash,$3) WHERE id=$1",[row.id,created.jobId,created.txHash]);
      return {runId:row.id,...created};
    });
    return reply.code(202).send(result);
  });
  app.post('/api/v1/jobs/:jobId/fund',async(req)=>{
    const svc=configured(),row=await owned(req);
    const {budgetUsdc}=z.object({budgetUsdc:usdcAmount}).strict().parse(req.body);
    const amount=assertJobBudget(budgetUsdc,cfg.MAX_JOB_USDC);
    if(amount!==atomicAmount(row.specification.budgetUsdc,6))throw new Error('JOB_BUDGET_MISMATCH');
    return withJobLock(db,row.id,async()=>{
      const job=await svc.verifyParticipants(row.job_id,cfg.XYX_EVALUATOR_ADDRESS);
      if(job.status===1&&row.state==='FUNDED')return {jobId:row.job_id,state:'FUNDED',txHash:row.tx_hash};
      if(job.status!==0||job.expiredAt<=BigInt(Math.floor(Date.now()/1000)))throw new Error('JOB_STATE_CONFLICT');
      if(job.budget!==amount) {
        // Re-read on-chain state to handle race condition: provider may have set budget
        const fresh=await svc.read(row.job_id);
        if(fresh.status===1)return {jobId:row.job_id,state:'FUNDED',txHash:row.tx_hash};
        if(fresh.budget!==amount)throw new Error('PROVIDER_BUDGET_REQUIRED');
      }
      const txHash=await jobOperation(db,row.id,'approve',{amount:amount.toString()},key=>svc.approve(budgetUsdc,key),reconciler ?? undefined);
      const fundTxHash=await jobOperation(db,row.id,'fund',{amount:amount.toString()},key=>svc.fund(row.job_id,key),reconciler ?? undefined);
      if((await svc.read(row.job_id)).status!==1)throw new Error('JOB_STATE_CONFLICT');
      await db.query("UPDATE protected_job_runs SET state='FUNDED',tx_hash=$2 WHERE id=$1",[row.id,fundTxHash]);
      return {jobId:row.job_id,state:'FUNDED',txHash:fundTxHash};
    });
  });
  app.post('/api/v1/jobs/:jobId/submit',async(req)=>{
    const svc=configured(),row=await owned(req);
    const {deliverable}=z.object({deliverable:z.unknown().refine(v=>v!==undefined)}).strict().parse(req.body);
    if(Buffer.byteLength(canonicalJSON(deliverable))>16000)throw new Error('DELIVERABLE_TOO_LARGE');
    const deliverableHash=hashJSON(deliverable);
    return withJobLock(db,row.id,async()=>{
      const job=await svc.verifyParticipants(row.job_id,cfg.XYX_EVALUATOR_ADDRESS);
      if(job.status===2&&row.state==='SUBMITTED'&&row.deliverable_hash===deliverableHash)return {jobId:row.job_id,state:'SUBMITTED',txHash:row.submission_tx_hash};
      if(job.status===3||job.status===4)throw new Error('JOB_ALREADY_RESOLVED');
      if(job.status>2) {
        // Job is SUBMITTED or beyond — find the JobSubmitted event on-chain to verify deliverable hash
        const head=await svc.client.getBlockNumber();
        const scanFrom=head>10000n?head-10000n:0n;
        const rawLogs=await (svc.client as any).getLogs({address:cfg.ERC8183_ADDRESS,event:{type:'event',name:'JobSubmitted',inputs:[{type:'indexed',indexed:true,internalType:'uint256',name:'jobId'},{type:'indexed',indexed:true,internalType:'address',name:'provider'},{type:'bytes32',indexed:false,internalType:'bytes32',name:'deliverable'}]},args:{jobId:BigInt(row.job_id)},fromBlock:scanFrom,toBlock:'latest'});
        const matching=(rawLogs as any[]).filter((l:any)=>l.args?.provider?.toLowerCase()===job.provider.toLowerCase());
        if(!matching.length)throw new Error('SUBMISSION_EVIDENCE_UNAVAILABLE');
        const latest=matching.sort((a:any,b:any)=>Number(b.blockNumber)-Number(a.blockNumber))[0];
        const observedHash=latest.args?.deliverable?.toLowerCase();
        if(observedHash!==deliverableHash.toLowerCase())throw new Error('DELIVERABLE_MISMATCH');
        await db.query("UPDATE protected_job_runs SET state='SUBMITTED',deliverable_hash=$2,deliverable_uri='ipfs://pending',submission_tx_hash=$3 WHERE id=$1",
          [row.id,deliverableHash,latest.transactionHash]);
        return {jobId:row.job_id,state:'SUBMITTED',txHash:latest.transactionHash};
      }
      if(job.status!==1||job.expiredAt<=BigInt(Math.floor(Date.now()/1000)))throw new Error('JOB_STATE_CONFLICT');
      if(row.deliverable_hash&&row.deliverable_hash!==deliverableHash)throw new Error('IDEMPOTENCY_CONFLICT');
      throw new Error('PROVIDER_SUBMISSION_REQUIRED');
    });
  });
  app.get('/api/v1/jobs/:jobId',async(req)=>{
    const {jobId}=z.object({jobId:jobIdSchema}).parse(req.params);
    return graph.query('query($id:ID!){job(id:$id){id client provider evaluator budget status createdAt expiredAt deliverableHash reasonHash evidenceHash transactionHash}}',{id:jobId});
  });
  app.post('/api/v1/jobs/:jobId/evaluate',async(req,reply)=>{
    const row=await owned(req);z.object({}).strict().parse(req.body??{});
    const response=await fetch(new URL('/internal/resolve-job',cfg.WITNESS_URL),{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${cfg.INTERNAL_SERVICE_TOKEN}`},body:JSON.stringify({jobId:row.job_id}),signal:AbortSignal.timeout(120000)});
    if(!response.ok)return reply.code(409).send({error:'EVALUATION_REQUIRES_INSPECTION',reconciliationRequired:true});
    return z.object({jobId:jobIdSchema,decision:z.union([z.literal(1),z.literal(2)]),txHash:z.string().regex(/^0x[0-9a-fA-F]{64}$/)}).parse(await response.json());
  });
}
