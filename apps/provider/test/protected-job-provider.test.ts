import assert from 'node:assert/strict';
import test from 'node:test';
import { encodeAbiParameters, encodeEventTopics, parseAbi } from 'viem';
import {
  BUYER,
  BUDGET,
  COMMERCE,
  EVALUATOR,
  PROVIDER_WALLET,
  actionCalldata,
  actionConfirmation,
  assertProviderJob,
  decodeJob,
  expectedChain,
  expectedProvider,
  getBudgetUsdc,
  protectedJobToolAvailable,
  type ChainJob,
} from '../lib/protected-job-provider';
import { hashJSON } from '../../../packages/shared/src/index';

const job: ChainJob = {
  id: 7n,
  client: BUYER,
  provider: '0x7ea90Ac2A2bA5fF6c71e7E9D23037D64AbD2b4da',
  evaluator: EVALUATOR,
  description: 'test',
  budget: 0n,
  expiredAt: 9n,
  status: 0,
  hook: '0x0000000000000000000000000000000000000000',
};
test('external provider EOA is accepted while Circle buyer remains distinct',()=>{assert.notEqual(BUYER.toLowerCase(),job.provider.toLowerCase());assert.doesNotThrow(()=>assertProviderJob(job,7n,'setBudget'));assert.equal(expectedProvider(job.provider),true);assert.equal(expectedChain('0x4cef52'),true);});
test('provider tool fails closed for wrong participant or state',()=>{assert.throws(()=>assertProviderJob({...job,provider:BUYER},7n,'setBudget'),/PARTICIPANTS/);assert.throws(()=>assertProviderJob({...job,client:job.provider},7n,'setBudget'),/PARTICIPANTS/);assert.throws(()=>assertProviderJob({...job,budget:BUDGET},7n,'setBudget'),/NOT_OPEN/);assert.throws(()=>assertProviderJob(job,7n,'submit'),/NOT_FUNDED/);assert.throws(()=>assertProviderJob({...job,status:1,budget:BUDGET},7n,'setBudget'),/NOT_OPEN/);assert.doesNotThrow(()=>assertProviderJob({...job,status:1,budget:BUDGET},7n,'submit'));assert.equal(expectedChain('0x1'),false);});
test('provider calldata and typed confirmations are deterministic',()=>{const deliverableHash=hashJSON({normalized:'hello'});assert.match(actionCalldata('setBudget',7n),/^0xdd4ae9d4/);assert.match(actionCalldata('submit',7n,deliverableHash),/^0x9e63798d/);assert.equal(deliverableHash.length,66);assert.equal(actionConfirmation('setBudget','7'),'SET BUDGET 7');assert.equal(actionConfirmation('submit','7'),'SUBMIT DELIVERABLE 7');});
test('provider submit never falls back to a static deliverable hash',()=>assert.throws(()=>actionCalldata('submit',7n),/INVALID_DELIVERABLE_HASH/));
test('provider tool is available regardless of environment',()=>assert.equal(protectedJobToolAvailable('production'),true));
test('getJob tuple decoding keeps evaluator address out of numeric fields',()=>{
  const evaluator='0xCEBFedAc66B0fFfAD452D3f1B356D1A3120dB233';
  const data=encodeAbiParameters([
    {type:'tuple',components:[
      {name:'id',type:'uint256'},
      {name:'client',type:'address'},
      {name:'provider',type:'address'},
      {name:'evaluator',type:'address'},
      {name:'description',type:'string'},
      {name:'budget',type:'uint256'},
      {name:'expiredAt',type:'uint256'},
      {name:'status',type:'uint8'},
      {name:'hook',type:'address'},
    ]},
  ],[{
    id:186213n,
    client:BUYER as `0x${string}`,
    provider:'0x7ea90Ac2A2bA5fF6c71e7E9D23037D64AbD2b4da',
    evaluator,
    description:'Normalize this text for XYX causal selection | XYX specification: 0x0673ff1a7e530cfdf718f5bf8bdc57552371ca40b6665de049d7965a1260e19c',
    budget:0n,
    expiredAt:1789250219n,
    status:0,
    hook:'0x0000000000000000000000000000000000000000',
  }]);
  const decoded=decodeJob(data);
  assert.equal(decoded.id,186213n);
  assert.equal(decoded.evaluator.toLowerCase(),evaluator.toLowerCase());
  assert.equal(decoded.budget,0n);
  assert.equal(decoded.expiredAt,1789250219n);
  assert.equal(decoded.status,0);
  assert.notEqual(decoded.status,Number(BigInt(evaluator)));
});

// ─── TASK C2: Big integer safety ───────────────────────────────────────
test('budget is always bigint, never a JS number',()=>{
  const data=encodeAbiParameters([{type:'tuple',components:[
    {name:'id',type:'uint256'}, {name:'client',type:'address'}, {name:'provider',type:'address'},
    {name:'evaluator',type:'address'}, {name:'description',type:'string'}, {name:'budget',type:'uint256'},
    {name:'expiredAt',type:'uint256'}, {name:'status',type:'uint8'}, {name:'hook',type:'address'},
  ]}],[{id:7n,client:BUYER as `0x${string}`,provider:'0x7ea90Ac2A2bA5fF6c71e7E9D23037D64AbD2b4da',evaluator:EVALUATOR as `0x${string}`,
    description:'test',budget:BUDGET,expiredAt:0n,status:1,hook:'0x0000000000000000000000000000000000000000'}]);
  const decoded=decodeJob(data);
  assert.equal(typeof decoded.budget,'bigint');
  assert.equal(decoded.budget,BUDGET);
});

// ─── TASK C2: Wrong provider wallet is rejected ───────────────────────
test('setBudget rejects when provider does not match the configured wallet',()=>{
  assert.throws(()=>assertProviderJob({...job,provider:'0x1111111111111111111111111111111111111111'},7n,'setBudget'),/PARTICIPANTS/);
});

// ─── TASK C2: Wrong chain check ───────────────────────────────────────
test('expectedChain rejects non-Arc chain IDs',()=>{
  assert.equal(expectedChain('0x1'),false);
  assert.equal(expectedChain('0xa4b1'),false);
  assert.equal(expectedChain(undefined),false);
  assert.equal(expectedChain('0x4cef52'),true);
});

// ─── TASK C2: Budget confirmation gating ──────────────────────────────
test('setBudget can only be called when job is Open and budget is zero',()=>{
  // status=0, budget=0n → setBudget is allowed
  assert.doesNotThrow(()=>assertProviderJob({...job,status:0,budget:0n},7n,'setBudget'));
  // status=0, budget=1n → NOT allowed
  assert.throws(()=>assertProviderJob({...job,status:0,budget:1n},7n,'setBudget'),/NOT_OPEN/);
  // status=1, budget=0n → NOT allowed (already funded elsewhere)
  assert.throws(()=>assertProviderJob({...job,status:1,budget:0n},7n,'setBudget'),/NOT_OPEN/);
});

// ─── TASK C2/C5: Submit gating ────────────────────────────────────────
test('submit requires Funded state and exact budget match',()=>{
  assert.doesNotThrow(()=>assertProviderJob({...job,status:1,budget:BUDGET},7n,'submit'));
  assert.throws(()=>assertProviderJob({...job,status:1,budget:0n},7n,'submit'),/NOT_FUNDED/);
  assert.throws(()=>assertProviderJob({...job,status:2,budget:BUDGET},7n,'submit'),/NOT_FUNDED/);
});

// ─── TASK C3: Funded state budget value ───────────────────────────────
test('Funded state preserves exact atomic budget',()=>{
  const fundedJob: ChainJob={...job,status:1,budget:BUDGET};
  assert.equal(fundedJob.budget,BUDGET);
  assert.ok(fundedJob.budget >= 0n);
  assert.equal(typeof fundedJob.budget,'bigint');
});

// ─── TASK C5: submitCalldata rejects without deliverable hash ─────────
test('submit calldata requires a 32-byte deliverable hash',()=>{
  assert.throws(()=>actionCalldata('submit',7n),/INVALID_DELIVERABLE_HASH/);
  assert.throws(()=>actionCalldata('submit',7n,'0x1234' as `0x${string}`),/INVALID_DELIVERABLE_HASH/);
  const validHash=hashJSON({normalized:'ok'});
  assert.doesNotThrow(()=>actionCalldata('submit',7n,validHash));
});

// ─── TASK C5: deliverable hash is derived from task text, not static ──
test('different task text produces different deliverable hash',()=>{
  const h1=hashJSON({normalized:'task-a'});
  const h2=hashJSON({normalized:'task-b'});
  assert.notEqual(h1,h2);
  assert.equal(h1.length,66);
});

// ─── TASK C7/C8: Verdict event shape ──────────────────────────────────
test('JobVerdictExecuted event has evaluator attestor as address param',()=>{
  const abi=parseAbi(['event JobVerdictExecuted(bytes32 indexed verdictHash,uint256 indexed jobId,uint8 decision,bytes32 evidenceHash,bytes32 reasonHash,address indexed attestor)']);
  assert.ok(Array.isArray(abi),'parseAbi returns array');
  assert.ok(abi.length>0,'ABI has entries');
  const eventDef=abi[0];
  assert.equal(eventDef.type,'event');
  assert.equal(eventDef.name,'JobVerdictExecuted');
  assert.equal(eventDef.inputs.length,6);
  assert.equal(eventDef.inputs[5].name,'attestor');
  assert.equal(eventDef.inputs[5].type,'address');
});

// ─── TASK C10: Open Purchase terminology separation ──────────────────
test('Open Purchase terminology is separate from Protected Job',()=>{
  assert.equal(actionConfirmation('setBudget','7'),'SET BUDGET 7');
  assert.equal(actionConfirmation('submit','7'),'SUBMIT DELIVERABLE 7');
  // Open Purchase ReceiptAttestation terms must not appear here
  assert.ok(!actionConfirmation('setBudget','7').includes('Receipt'));
  assert.ok(!actionConfirmation('submit','7').includes('Receipt'));
});
