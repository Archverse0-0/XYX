import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, type Observation } from '../../shared/src/verify.js';
import { hashJSON, hashText, canonicalJSON, receiptDomain, receiptTypes, verdictDomain, verdictTypes, Outcome } from '../../shared/src/index.js';

// Witness integration test — exercises the evidence and outcome classification path
// without requiring live Circle/Arc/IPFS dependencies.

const REGISTRY = '0x' + 'a'.repeat(40);
const EVALUATOR = '0x' + 'b'.repeat(40);

test('outcome classification: success case', () => {
  const obs: Observation = { payment: 'accepted', requestValid: true, responseReceived: true, httpStatus: 200, schemaValid: true, timedOut: false, providerTimeoutProven: false, withinDeclaredLimits: false };
  assert.equal(classify(obs), Outcome.SUCCESS);
});

test('outcome classification: payment failure does not become provider failure', () => {
  const obs: Observation = { payment: 'failed', requestValid: true, responseReceived: false, httpStatus: 0, schemaValid: null, timedOut: false, providerTimeoutProven: false, withinDeclaredLimits: false };
  assert.equal(classify(obs), Outcome.PAYMENT_FAILED);
  assert.ok(classify(obs) > 4, 'payment failures must be excluded from provider reliability (outcome > 4)');
});

test('outcome classification: rail error does not become provider failure', () => {
  const obs: Observation = { payment: 'rail_error', requestValid: true, responseReceived: false, httpStatus: 0, schemaValid: null, timedOut: false, providerTimeoutProven: false, withinDeclaredLimits: false };
  assert.equal(classify(obs), Outcome.PAYMENT_RAIL_ERROR);
  assert.ok(classify(obs) > 4, 'rail errors must be excluded from provider reliability (outcome > 4)');
});

test('outcome classification: client invalid request does not become provider failure', () => {
  const obs: Observation = { payment: 'accepted', requestValid: false, responseReceived: false, httpStatus: 0, schemaValid: null, timedOut: false, providerTimeoutProven: false, withinDeclaredLimits: false };
  assert.equal(classify(obs), Outcome.CLIENT_INVALID_REQUEST);
  assert.ok(classify(obs) > 4, 'client errors must be excluded from provider reliability (outcome > 4)');
});

test('outcome classification: ambiguous payment state', () => {
  const obs: Observation = { payment: 'unknown', requestValid: true, responseReceived: false, httpStatus: 0, schemaValid: null, timedOut: false, providerTimeoutProven: false, withinDeclaredLimits: false };
  assert.equal(classify(obs), Outcome.AMBIGUOUS);
});

test('outcome classification: provider timeout', () => {
  const obs: Observation = { payment: 'accepted', requestValid: true, responseReceived: false, httpStatus: 0, schemaValid: null, timedOut: true, providerTimeoutProven: true, withinDeclaredLimits: false };
  assert.equal(classify(obs), Outcome.PROVIDER_TIMEOUT);
});

test('outcome classification: provider HTTP error', () => {
  const obs: Observation = { payment: 'accepted', requestValid: true, responseReceived: true, httpStatus: 500, schemaValid: null, timedOut: false, providerTimeoutProven: false, withinDeclaredLimits: false };
  assert.equal(classify(obs), Outcome.PROVIDER_HTTP_ERROR);
});

test('outcome classification: rate limit within declared limits', () => {
  const obs: Observation = { payment: 'accepted', requestValid: true, responseReceived: true, httpStatus: 429, schemaValid: null, timedOut: false, providerTimeoutProven: false, withinDeclaredLimits: true };
  assert.equal(classify(obs), Outcome.PROVIDER_RATE_LIMIT);
});

test('outcome classification: rate limit outside declared limits is ambiguous', () => {
  const obs: Observation = { payment: 'accepted', requestValid: true, responseReceived: true, httpStatus: 429, schemaValid: null, timedOut: false, providerTimeoutProven: false, withinDeclaredLimits: false };
  assert.equal(classify(obs), Outcome.AMBIGUOUS);
});

test('outcome classification: schema mismatch', () => {
  const obs: Observation = { payment: 'accepted', requestValid: true, responseReceived: true, httpStatus: 200, schemaValid: false, timedOut: false, providerTimeoutProven: false, withinDeclaredLimits: false };
  assert.equal(classify(obs), Outcome.PROVIDER_SCHEMA_MISMATCH);
});

test('receipt domain is chain-separated', () => {
  const d1 = receiptDomain(REGISTRY as `0x${string}`, 5042002);
  const d2 = receiptDomain(REGISTRY as `0x${string}`, 1);
  assert.equal(d1.chainId, 5042002);
  assert.equal(d2.chainId, 1);
  assert.notEqual(hashJSON(d1), hashJSON(d2));
});

test('verdict domain is chain-separated', () => {
  const d1 = verdictDomain(EVALUATOR as `0x${string}`, 5042002);
  const d2 = verdictDomain(EVALUATOR as `0x${string}`, 1);
  assert.equal(d1.chainId, 5042002);
  assert.equal(d2.chainId, 1);
});

test('receipt types include all required fields', () => {
  const fieldNames = receiptTypes.ReceiptAttestation.map(f => f.name);
  assert.ok(fieldNames.includes('providerKey'));
  assert.ok(fieldNames.includes('endpointKey'));
  assert.ok(fieldNames.includes('specHash'));
  assert.ok(fieldNames.includes('payer'));
  assert.ok(fieldNames.includes('amountPaid'));
  assert.ok(fieldNames.includes('paymentHash'));
  assert.ok(fieldNames.includes('requestHash'));
  assert.ok(fieldNames.includes('responseHash'));
  assert.ok(fieldNames.includes('evidenceHash'));
  assert.ok(fieldNames.includes('evidenceURIHash'));
  assert.ok(fieldNames.includes('latencyMs'));
  assert.ok(fieldNames.includes('httpStatus'));
  assert.ok(fieldNames.includes('outcome'));
  assert.ok(fieldNames.includes('observedAt'));
  assert.ok(fieldNames.includes('nonce'));
  assert.ok(fieldNames.includes('providerAgentRegistry'));
  assert.ok(fieldNames.includes('providerAgentId'));
});

test('verdict types include all required fields', () => {
  const fieldNames = verdictTypes.JobVerdict.map(f => f.name);
  assert.ok(fieldNames.includes('jobId'));
  assert.ok(fieldNames.includes('evidenceHash'));
  assert.ok(fieldNames.includes('reasonHash'));
  assert.ok(fieldNames.includes('decision'));
  assert.ok(fieldNames.includes('issuedAt'));
  assert.ok(fieldNames.includes('expiresAt'));
  assert.ok(fieldNames.includes('nonce'));
});

test('canonical JSON is deterministic for evidence bundles', () => {
  const bundle = { version: 'xyx-evidence-v1', providerKey: hashText('p'), endpointKey: hashText('e'), outcome: 0 };
  const c1 = canonicalJSON(bundle);
  const c2 = canonicalJSON({ ...bundle, providerKey: bundle.providerKey });
  assert.equal(c1, c2);
});

test('canonical JSON rejects lossy values that would break evidence', () => {
  assert.throws(() => canonicalJSON(undefined));
  assert.throws(() => canonicalJSON(NaN));
  assert.throws(() => canonicalJSON(Infinity));
  assert.throws(() => canonicalJSON(1n));
});

test('evidence hash is deterministic', () => {
  const evidence = { version: 'xyx-evidence-v1', outcome: 0, amount: '0.01' };
  const h1 = hashText(canonicalJSON(evidence));
  const h2 = hashText(canonicalJSON(evidence));
  assert.equal(h1, h2);
});
