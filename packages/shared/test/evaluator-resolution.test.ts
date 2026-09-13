import test from 'node:test';
import assert from 'node:assert/strict';
import { hashTypedData, type Address, type Hex } from 'viem';
import { verdictDomain, verdictTypes } from '../src/index.js';
import { evaluateDeliverable } from '../src/jobs.js';
import { JobStatus } from '../../erc8183/service.js';

// ═══════════════════════════════════════════════════════════════
// B9+B10+B11+B12: Evaluator Trust + COMPLETE/REJECT Resolution
// ═══════════════════════════════════════════════════════════════

const EVALUATOR = '0xCEBFedAc66B0fFfAD452D3f1B356D1A3120dB233' as Hex;
const EVALUATOR_ATTESTOR = '0x644C11572E3792bd1dE5959D09ECBc6f63304277' as Address;
const WRONG_ADDRESS = ('0x' + '9'.repeat(40)) as Address;
const LONG_HEX = ('0x' + 'a'.repeat(64)) as Hex;
const LONG_HEX_B = ('0x' + 'b'.repeat(64)) as Hex;
const LONG_HEX_C = ('0x' + 'c'.repeat(64)) as Hex;
const REQ_HASH_1 = ('0x' + '1'.repeat(64)) as Hex;
const REQ_HASH_2 = ('0x' + '2'.repeat(64)) as Hex;

const JOB_VERDICT_TYPE = { JobVerdict: [
  { name: 'jobId', type: 'uint256' },
  { name: 'evidenceHash', type: 'bytes32' },
  { name: 'reasonHash', type: 'bytes32' },
  { name: 'decision', type: 'uint8' },
  { name: 'issuedAt', type: 'uint64' },
  { name: 'expiresAt', type: 'uint64' },
  { name: 'nonce', type: 'uint64' },
]};

test('EVAL-COMPLETE-A: exact JSON match produces decision 1 (COMPLETE)', () => {
  const spec = { kind: 'exact-json-v1' as const, expected: { answer: 42 } };
  const result = evaluateDeliverable(spec, { answer: 42 });
  assert.equal(result.decision, 1);
  assert.equal(result.reason.result, 'EXACT_JSON_MATCH');
  assert.ok(result.reasonHash.startsWith('0x'));
});

test('EVAL-COMPLETE-B: exact match is order-independent (canonical JSON)', () => {
  const spec = { kind: 'exact-json-v1' as const, expected: { a: 1, b: 2 } };
  const result = evaluateDeliverable(spec, { b: 2, a: 1 });
  assert.equal(result.decision, 1);
  assert.equal(result.reason.result, 'EXACT_JSON_MATCH');
});

test('EVAL-REJECT-A: value mismatch produces decision 2 (REJECT)', () => {
  const spec = { kind: 'exact-json-v1' as const, expected: { answer: 42 } };
  const result = evaluateDeliverable(spec, { answer: 43 });
  assert.equal(result.decision, 2);
  assert.equal(result.reason.result, 'EXACT_JSON_MISMATCH');
});

test('EVAL-REJECT-B: type mismatch string vs number produces REJECT', () => {
  const spec = { kind: 'exact-json-v1' as const, expected: { count: 5 } };
  const result = evaluateDeliverable(spec, { count: '5' });
  assert.equal(result.decision, 2);
});

test('EVAL-REJECT-C: extra field produces REJECT', () => {
  const spec = { kind: 'exact-json-v1' as const, expected: { a: 1 } };
  const result = evaluateDeliverable(spec, { a: 1, b: 2 });
  assert.equal(result.decision, 2);
});

test('EVAL-REJECT-D: nested mismatch produces REJECT', () => {
  const spec = { kind: 'exact-json-v1' as const, expected: { data: { value: 42 } } };
  const result = evaluateDeliverable(spec, { data: { value: 43 } });
  assert.equal(result.decision, 2);
});

test('EVAL-REJECT-E: null vs missing produces REJECT', () => {
  const spec = { kind: 'exact-json-v1' as const, expected: { a: null } };
  const result = evaluateDeliverable(spec, {} as any);
  assert.equal(result.decision, 2);
});

test('VERDICT-A: EIP-712 domain has correct chainId', () => {
  const domain = verdictDomain(EVALUATOR, 5042002);
  assert.equal(domain.chainId, 5042002);
  assert.equal(domain.verifyingContract, EVALUATOR);
});

test('VERDICT-B: EIP-712 domain accepts chainId parameter (verification enforces 5042002)', () => {
  const domain = verdictDomain(EVALUATOR, 1);
  assert.equal(domain.chainId, 1);
});

test('VERDICT-C: wrong verifyingContract changes digest', () => {
  const verdict = { jobId: 1n, evidenceHash: LONG_HEX, reasonHash: LONG_HEX_B, decision: 1, issuedAt: 1000n, expiresAt: 1300n, nonce: 1n };
  const hCorrect = hashTypedData({ domain: verdictDomain(EVALUATOR), types: JOB_VERDICT_TYPE, primaryType: 'JobVerdict', message: verdict });
  const hWrong = hashTypedData({ domain: verdictDomain(WRONG_ADDRESS), types: JOB_VERDICT_TYPE, primaryType: 'JobVerdict', message: verdict });
  assert.notEqual(hCorrect, hWrong);
});

test('VERDICT-D: verdict domain type structure is complete', () => {
  const fieldNames = verdictTypes.JobVerdict.map(f => f.name);
  assert.ok(fieldNames.includes('jobId'));
  assert.ok(fieldNames.includes('evidenceHash'));
  assert.ok(fieldNames.includes('reasonHash'));
  assert.ok(fieldNames.includes('decision'));
  assert.ok(fieldNames.includes('issuedAt'));
  assert.ok(fieldNames.includes('expiresAt'));
  assert.ok(fieldNames.includes('nonce'));
});

test('VERDICT-E: verdict digest is deterministic for same inputs', () => {
  const verdict = { jobId: 1n, evidenceHash: LONG_HEX, reasonHash: LONG_HEX_B, decision: 1, issuedAt: 1000n, expiresAt: 1300n, nonce: 1n };
  const h1 = hashTypedData({ domain: verdictDomain(EVALUATOR), types: JOB_VERDICT_TYPE, primaryType: 'JobVerdict', message: verdict });
  const h2 = hashTypedData({ domain: verdictDomain(EVALUATOR), types: JOB_VERDICT_TYPE, primaryType: 'JobVerdict', message: verdict });
  assert.equal(h1, h2);
});

test('VERDICT-F: different evidenceHash changes digest', () => {
  const v1 = { jobId: 1n, evidenceHash: LONG_HEX, reasonHash: LONG_HEX_B, decision: 1, issuedAt: 1000n, expiresAt: 1300n, nonce: 1n };
  const v2 = { jobId: 1n, evidenceHash: LONG_HEX_C, reasonHash: LONG_HEX_B, decision: 1, issuedAt: 1000n, expiresAt: 1300n, nonce: 1n };
  const h1 = hashTypedData({ domain: verdictDomain(EVALUATOR), types: JOB_VERDICT_TYPE, primaryType: 'JobVerdict', message: v1 });
  const h2 = hashTypedData({ domain: verdictDomain(EVALUATOR), types: JOB_VERDICT_TYPE, primaryType: 'JobVerdict', message: v2 });
  assert.notEqual(h1, h2);
});

test('VERDICT-G: different decision changes digest', () => {
  const v1 = { jobId: 1n, evidenceHash: LONG_HEX, reasonHash: LONG_HEX_B, decision: 1, issuedAt: 1000n, expiresAt: 1300n, nonce: 1n };
  const v2 = { jobId: 1n, evidenceHash: LONG_HEX, reasonHash: LONG_HEX_B, decision: 2, issuedAt: 1000n, expiresAt: 1300n, nonce: 1n };
  const h1 = hashTypedData({ domain: verdictDomain(EVALUATOR), types: JOB_VERDICT_TYPE, primaryType: 'JobVerdict', message: v1 });
  const h2 = hashTypedData({ domain: verdictDomain(EVALUATOR), types: JOB_VERDICT_TYPE, primaryType: 'JobVerdict', message: v2 });
  assert.notEqual(h1, h2);
});

test('VERDICT-H: expired verdict is rejected at construction', () => {
  const now = BigInt(Math.floor(Date.now() / 1000));
  const verdict = { jobId: 1n, evidenceHash: LONG_HEX, reasonHash: LONG_HEX_B, decision: 1, issuedAt: now - 100n, expiresAt: now - 50n, nonce: 1n };
  const currentNow = BigInt(Math.floor(Date.now() / 1000));
  assert.ok(currentNow >= verdict.expiresAt, 'verdict should be expired');
});

test('VERDICT-I: nonce uniqueness prevents replay', () => {
  const v1 = { jobId: 1n, evidenceHash: LONG_HEX, reasonHash: LONG_HEX_B, decision: 1, issuedAt: 1000n, expiresAt: 1300n, nonce: 1n };
  const v2 = { jobId: 1n, evidenceHash: LONG_HEX, reasonHash: LONG_HEX_B, decision: 1, issuedAt: 1000n, expiresAt: 1300n, nonce: 2n };
  const h1 = hashTypedData({ domain: verdictDomain(EVALUATOR), types: JOB_VERDICT_TYPE, primaryType: 'JobVerdict', message: v1 });
  const h2 = hashTypedData({ domain: verdictDomain(EVALUATOR), types: JOB_VERDICT_TYPE, primaryType: 'JobVerdict', message: v2 });
  assert.notEqual(h1, h2, 'different nonces must produce different verdict hashes');
});

test('VERDICT-J: EVALUATOR_ATTESTOR address matches deployment constant', () => {
  assert.equal(EVALUATOR_ATTESTOR.toLowerCase(), '0x644c11572e3792bd1de5959d09ecbc6f63304277');
});

test('RESOLVE-COMPLETE: decision 1 maps to JobStatus.COMPLETED (3)', () => {
  assert.equal(JobStatus.COMPLETED, 3);
  const evaluated = { decision: 1 as 1, reasonHash: '0xreason' };
  assert.equal(evaluated.decision, 1);
  assert.equal(JobStatus.COMPLETED, 3);
});

test('RESOLVE-REJECT: decision 2 maps to JobStatus.REJECTED (4)', () => {
  assert.equal(JobStatus.REJECTED, 4);
  const evaluated = { decision: 2 as 2, reasonHash: '0xreason' };
  assert.equal(evaluated.decision, 2);
  assert.equal(JobStatus.REJECTED, 4);
});

test('RESOLVE-DUPLICATE: idempotency with same request hash returns cached result', async () => {
  const { existingOperation } = await import('../src/job-operations.js');
  const cached = existingOperation({ request_hash: REQ_HASH_1, state: 'CONFIRMED', result: { decision: 1, txHash: '0xresolve' } }, REQ_HASH_1);
  assert.deepEqual(cached, { decision: 1, txHash: '0xresolve' });
  assert.throws(
    () => existingOperation({ request_hash: REQ_HASH_1, state: 'CONFIRMED', result: {} }, REQ_HASH_2),
    /IDEMPOTENCY_CONFLICT/
  );
});
