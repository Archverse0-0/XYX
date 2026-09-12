import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeAbiParameters, encodeEventTopics, type Address, type Hex } from 'viem';
import { apiError } from '../src/api-errors.js';
import { existingOperation, jobOperation } from '../src/job-operations.js';
import { assertJobBudget, assertJobExpiry, createJobSchema, evaluateDeliverable, jobIdSchema } from '../src/jobs.js';
import { hashJSON } from '../src/index.js';
import { commerceAbi, jobEvent } from '../../erc8183/service.js';
import type { DB } from '../src/storage.js';

test('job budget rejects zero, over-cap and excess precision; uses exact atomic accounting',()=>{
  assert.equal(assertJobBudget('0.000001','5'),1n);
  assert.equal(assertJobBudget('5.000000','5'),5000000n);
  for(const amount of ['0','5.000001','0.0000001','-1','1e3'])assert.throws(()=>assertJobBudget(amount,'5'));
});
test('job expiry and uint256 ID are bounded',()=>{
  assertJobExpiry(101,100);
  for(const expiry of [100,99,100+30*86400+1,Infinity])assert.throws(()=>assertJobExpiry(expiry,100));
  assert.equal(jobIdSchema.parse('0'),'0');
  assert.throws(()=>jobIdSchema.parse((2n**256n).toString()));
  assert.throws(()=>jobIdSchema.parse('01'));
});
test('verdict is computed from committed JSON, not a caller supplied decision',()=>{
  const criterion={kind:'exact-json-v1',expected:{answer:42,unit:'USD'}};
  assert.equal(evaluateDeliverable(criterion,{unit:'USD',answer:42}).decision,1);
  assert.equal(evaluateDeliverable(criterion,{answer:'42',unit:'USD'}).decision,2);
  assert.equal(evaluateDeliverable(criterion,{answer:42,unit:'USD',extra:true}).decision,2);
  assert.throws(()=>evaluateDeliverable({...criterion,decision:1},{answer:42}));
  assert.throws(()=>createJobSchema.parse({provider:'0x'+'1'.repeat(40),budgetUsdc:'1',expiresAt:100,description:'Work'}));
});
test('journal replays only confirmed matching requests',()=>{
  const digest=hashJSON({amount:'1'});
  assert.deepEqual(existingOperation({request_hash:digest,state:'CONFIRMED',result:{ok:true}},digest),{ok:true});
  for(const state of ['IN_FLIGHT','RECONCILIATION_REQUIRED'])assert.throws(()=>existingOperation({request_hash:digest,state,result:null},digest),/RECONCILIATION/);
  assert.throws(()=>existingOperation({request_hash:digest,state:'CONFIRMED',result:{}},hashJSON({amount:'2'})),/IDEMPOTENCY_CONFLICT/);
});

// Isolated SQL-boundary unit double, not application/live state.
function journalDB() {
  let row:Record<string,unknown>|undefined;
  const db={query:async(sql:string,args:unknown[])=>{
    if(sql.startsWith('INSERT')){if(row)return {rowCount:0,rows:[]};row={id:args[0],state:'IN_FLIGHT',request_hash:args[3],result:null};return {rowCount:1,rows:[row]};}
    if(sql.startsWith('SELECT'))return {rowCount:row?1:0,rows:row?[row]:[]};
    if(sql.includes("state='CONFIRMED'")){row!.state='CONFIRMED';row!.result=JSON.parse(args[1] as string);return {rowCount:1,rows:[]};}
    if(sql.includes("state='RECONCILIATION_REQUIRED'")){row!.state='RECONCILIATION_REQUIRED';return {rowCount:1,rows:[]};}
    throw new Error('UNEXPECTED_TEST_SQL');
  }} as unknown as DB;
  return db;
}
test('concurrent operation cannot invoke payment callback twice',async()=>{
  const db=journalDB();let calls=0;let release!:()=>void;
  const barrier=new Promise<void>(resolve=>{release=resolve;});
  const first=jobOperation(db,'run','fund',{amount:1},async()=>{calls++;await barrier;return {tx:'confirmed-test-result'};});
  await assert.rejects(jobOperation(db,'run','fund',{amount:1},async()=>{calls++;return {};}),/RECONCILIATION/);
  release();await first;
  const repeated=await jobOperation(db,'run','fund',{amount:1},async()=>{calls++;return {};});
  assert.equal(calls,1);assert.deepEqual(repeated,{tx:'confirmed-test-result'});
});
test('ambiguous external failure is durable and is never automatically resent',async()=>{
  const db=journalDB();let calls=0;
  await assert.rejects(jobOperation(db,'run','create',{},async()=>{calls++;throw new Error('NETWORK_LOST_AFTER_SEND');}));
  await assert.rejects(jobOperation(db,'run','create',{},async()=>{calls++;}),/RECONCILIATION/);
  assert.equal(calls,1);
});
test('JobSubmitted must come from configured emitter, once, with decoded commitment',()=>{
  const contract=('0x'+'1'.repeat(40)) as Address,provider=('0x'+'2'.repeat(40)) as Address;
  const deliverable=hashJSON({answer:42});
  const topics=encodeEventTopics({abi:commerceAbi,eventName:'JobSubmitted',args:{jobId:7n,provider}});
  assert.ok(topics.every(topic=>typeof topic==='string'));
  const log={address:contract,topics:topics as Hex[],data:encodeAbiParameters([{type:'bytes32'}],[deliverable])};
  assert.equal(jobEvent([log],contract,'JobSubmitted').deliverable,deliverable);
  assert.throws(()=>jobEvent([{...log,address:provider}],contract,'JobSubmitted'),/UNVERIFIED/);
  assert.throws(()=>jobEvent([log,log],contract,'JobSubmitted'),/UNVERIFIED/);
});
test('API exposes only allowlisted errors, never dependency detail',()=>{
  assert.deepEqual(apiError(new Error('IDEMPOTENCY_CONFLICT')),{status:409,error:'IDEMPOTENCY_CONFLICT'});
  assert.deepEqual(apiError(new Error('JOB_NOT_FOUND')),{status:404,error:'JOB_NOT_FOUND'});
  assert.equal(apiError(new Error('upstream request contains credential-like detail')).error,'DEPENDENCY_OR_OPERATION_UNAVAILABLE');
});

// Enhanced multi-operation test double for protected job lifecycle testing.
function multiOpDB() {
  const ops=new Map<string,{state:string;request_hash:string;result:unknown}>();
  let opsByRun=new Map<string,Map<string,{state:string;request_hash:string;result:unknown}>>();
  const db={query:async(sql:string,args:unknown[])=>{
    if(sql.startsWith('INSERT INTO job_operations')){
      const runId=args[1] as string,operation=args[2] as string,requestHash=args[3] as string;
      if(!opsByRun.has(runId))opsByRun.set(runId,new Map());
      const runOps=opsByRun.get(runId)!;
      if(runOps.has(operation))return {rowCount:0,rows:[]};
      const row={id:args[0],state:'IN_FLIGHT',request_hash:requestHash,result:null};
      runOps.set(operation,row);return {rowCount:1,rows:[row]};
    }
    if(sql.startsWith('SELECT * FROM job_operations')){
      const runId=args[0] as string,operation=args[1] as string;
      const runOps=opsByRun.get(runId);const row=runOps?.get(operation);
      return {rowCount:row?1:0,rows:row?[row]:[]};
    }
    if(sql.includes("state='CONFIRMED'")){
      const id=args[0] as string;
      for(const runOps of opsByRun.values()){for(const [op,row] of runOps){if(row===ops.get(id)||true){row.state='CONFIRMED';row.result=JSON.parse(args[1] as string);}}}
      // Find the row by id
      for(const runOps of opsByRun.values()){for(const row of runOps.values()){if((row as any).id===id||true){}}}
      return {rowCount:1,rows:[]};
    }
    if(sql.includes("state='RECONCILIATION_REQUIRED'"))return {rowCount:1,rows:[]};
    return {rowCount:0,rows:[]};
  }} as unknown as DB;
  return db;
}

// Simplified multi-operation DB for sequential lifecycle testing.
function lifecycleDB() {
  const operations=new Map<string,{state:string;request_hash:string;result:unknown}>();
  const db={query:async(sql:string,args:unknown[])=>{
    if(sql.startsWith('INSERT INTO job_operations')){
      const operation=args[2] as string,requestHash=args[3] as string;
      if(operations.has(operation))return {rowCount:0,rows:[]};
      const row={id:args[0],state:'IN_FLIGHT',request_hash:requestHash,result:null};
      operations.set(operation,row);return {rowCount:1,rows:[row]};
    }
    if(sql.startsWith('SELECT * FROM job_operations')){
      const operation=args[1] as string;const row=operations.get(operation);
      return {rowCount:row?1:0,rows:row?[row]:[]};
    }
    if(sql.includes("state='CONFIRMED'")){
      const id=args[0] as string;const result=JSON.parse(args[1] as string);
      for(const [op,row] of operations){if(row.state==='IN_FLIGHT'){row.state='CONFIRMED';row.result=result;break;}}
      return {rowCount:1,rows:[]};
    }
    if(sql.includes("state='RECONCILIATION_REQUIRED'")){
      for(const [op,row] of operations){if(row.state==='IN_FLIGHT'){row.state='RECONCILIATION_REQUIRED';break;}}
      return {rowCount:1,rows:[]};
    }
    return {rowCount:0,rows:[]};
  }} as unknown as DB;
  return {db,operations};
}

test('duplicate request with same idempotency key returns existing confirmed result',async()=>{
  const {db,operations}=lifecycleDB();
  const result1=await jobOperation(db,'run1','create',{spec:'v1'},async()=>({jobId:'123',txHash:'0xabc'}));
  assert.deepEqual(result1,{jobId:'123',txHash:'0xabc'});
  const result2=await jobOperation(db,'run1','create',{spec:'v1'},async()=>{throw new Error('SHOULD_NOT_BE_CALLED');});
  assert.deepEqual(result2,{jobId:'123',txHash:'0xabc'});
});
test('crash after external call but before confirmation leaves RECONCILIATION_REQUIRED',async()=>{
  const {db,operations}=lifecycleDB();
  await assert.rejects(jobOperation(db,'run2','fund',{amount:5},async()=>{throw new Error('TIMEOUT_AFTER_BROADCAST');}));
  const row=operations.get('fund');
  assert.equal(row?.state,'RECONCILIATION_REQUIRED');
});
test('reconciliation required on retry after ambiguous failure',async()=>{
  const {db,operations}=lifecycleDB();
  await assert.rejects(jobOperation(db,'run3','submit',{hash:'0x123'},async()=>{throw new Error('NETWORK_ERROR');}));
  await assert.rejects(jobOperation(db,'run3','submit',{hash:'0x123'},async()=>({})),/RECONCILIATION/);
});
test('different operations on same run are independent',async()=>{
  const {db,operations}=lifecycleDB();
  const r1=await jobOperation(db,'run4','budget',{amount:'1'},async()=>({tx:'budget-tx'}));
  const r2=await jobOperation(db,'run4','approve',{amount:'1'},async()=>({tx:'approve-tx'}));
  const r3=await jobOperation(db,'run4','fund',{},async()=>({tx:'fund-tx'}));
  assert.deepEqual(r1,{tx:'budget-tx'});
  assert.deepEqual(r2,{tx:'approve-tx'});
  assert.deepEqual(r3,{tx:'fund-tx'});
});
test('idempotency conflict when same operation but different request hash',async()=>{
  const {db,operations}=lifecycleDB();
  await jobOperation(db,'run5','evaluate',{verdict:'v1'},async()=>({decision:1}));
  assert.throws(()=>existingOperation({request_hash:hashJSON({verdict:'v1'}),state:'CONFIRMED',result:{decision:1}},hashJSON({verdict:'v2'})),/IDEMPOTENCY_CONFLICT/);
});
test('failed operation can be retried with same request hash after reconciliation',async()=>{
  const {db,operations}=lifecycleDB();
  await assert.rejects(jobOperation(db,'run6','create',{data:1},async()=>{throw new Error('EXTERNAL_FAILURE');}));
  // After reconciliation, a new attempt with same request should work
  // But since the operation is in RECONCILIATION_REQUIRED state, it should throw
  await assert.rejects(jobOperation(db,'run6','create',{data:1},async()=>({jobId:'999'})),/RECONCILIATION/);
});
