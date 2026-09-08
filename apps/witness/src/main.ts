import Fastify from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { type Hex, type Address, parseAbi } from 'viem';
import { loadConfig, witnessConfig } from '../../../packages/shared/src/config.js';
import { hex32 } from '../../../packages/shared/src/index.js';
import { poolFor } from '../../../packages/shared/src/storage.js';
import { GraphClient } from '../../../packages/shared/src/graph.js';
import { EvidenceStorage } from '../../../packages/shared/src/evidence.js';
import { Witness } from './service.js';
const cfg=loadConfig(witnessConfig);
const db=poolFor(cfg.DATABASE_URL);
const graph=new GraphClient(cfg.GRAPH_URL,cfg.GRAPH_DEPLOYMENT_ID);
const storage=new EvidenceStorage(cfg.IPFS_API_URL,cfg.IPFS_AUTHORIZATION);
const witness=new Witness(db,cfg.ARC_RPC_URL,cfg.CIRCLE_AGENT_ADDRESS as Address,cfg.EVIDENCE_REGISTRY_ADDRESS as Address,cfg.XYX_EVALUATOR_ADDRESS as Address,cfg.WITNESS_PRIVATE_KEY as Hex,cfg.RELAYER_PRIVATE_KEY as Hex,cfg.EVALUATOR_PRIVATE_KEY as Hex,storage,graph,cfg.MAX_GRAPH_LAG_BLOCKS);
const app=Fastify({bodyLimit:32768,logger:{redact:['req.headers.authorization','req.body','res.body']}});
app.addHook('onRequest',async(req,reply)=>{
  const actual=Buffer.from(req.headers.authorization??''),expected=Buffer.from(`Bearer ${cfg.INTERNAL_SERVICE_TOKEN}`);
  if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return reply.code(401).send({error:'UNAUTHORIZED'});
});
app.setErrorHandler((error,req,reply)=>{req.log.error({code:error instanceof Error?error.name:'ERROR'},'Witness operation stopped');reply.code(409).send({error:'WITNESS_OPERATION_STOPPED',reconciliationRequired:true});});
app.get('/healthz',async(_,reply)=>{
  const checks:Record<string,boolean>={};
  await Promise.all(Object.entries({postgres:()=>db.query('SELECT 1'),arc:()=>witness.client.getChainId(),graph:()=>graph.meta(),circle:()=>witness.circle.session(),marketplace:()=>witness.circle.search('search'),evidence:()=>storage.health(),signer:async()=>{
    const abi=parseAbi(['function hasRole(bytes32,address) view returns(bool)','function paused() view returns(bool)']);
    const {keccak256,toHex}=await import('viem');
    if(await witness.client.getChainId()!==5042002)throw new Error('WRONG_CHAIN');
    if(!await witness.client.readContract({address:cfg.EVIDENCE_REGISTRY_ADDRESS as Address,abi,functionName:'hasRole',args:[keccak256(toHex('ATTESTOR_ROLE')),witness.signer.address]}))throw new Error('SIGNER_NOT_AUTHORIZED');
    if(await witness.client.readContract({address:cfg.EVIDENCE_REGISTRY_ADDRESS as Address,abi,functionName:'paused'}))throw new Error('PAUSED');
  }}).map(async([name,check])=>{try{await check();checks[name]=true;}catch{checks[name]=false;}}));
  const ready=Object.values(checks).every(Boolean);return reply.code(ready?200:503).send({ready,checks});
});
app.post('/internal/execute',async(req)=>{
  const body=z.object({runId:z.string().uuid(),executionId:z.string().uuid(),idempotencyKey:z.string().uuid()}).strict().parse(req.body);
  if(body.runId!==body.idempotencyKey)throw new Error('INVALID_IDEMPOTENCY');
  return witness.execute(body.runId,body.executionId,body.idempotencyKey);
});
app.post('/internal/anchor/:executionId',async(req)=>{
  const {executionId}=z.object({executionId:z.string().uuid()}).parse(req.params);return witness.anchor(executionId);
});
app.post('/internal/resolve-job',async(req)=>{
  const body=z.object({jobId:z.string().regex(/^\d+$/),decision:z.union([z.literal(1),z.literal(2)]),evidenceHash:hex32,reasonHash:hex32,expiresAt:z.number().int()}).strict().parse(req.body);
  return witness.resolveJob(body.jobId,body.decision,String(body.evidenceHash) as Hex,String(body.reasonHash) as Hex,body.expiresAt);
});
await app.listen({host:'127.0.0.1',port:cfg.WITNESS_PORT});
const close=async()=>{await app.close();await db.end();};process.on('SIGTERM',close);process.on('SIGINT',close);
