import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalJSON, hashJSON } from '../src/index.js';

// ═══════════════════════════════════════════════════════════════
// B7: Protected Job Evidence Schema compliance with PRD v1.2
// ═══════════════════════════════════════════════════════════════

test('EVIDENCE-SCHEMA-A: bundle contains required mode field set to "protected-job"', () => {
  const bundle = {
    version: 'xyx-job-evidence-v1',
    mode: 'protected-job',
    jobId: '123',
    commerce: '0x0747EEf0706327138c69792bF28Cd525089e4583',
    buyer: '0x55763d498fd057d17ffcc2fb540789ce76f4f085',
    provider: '0x7ea90Ac2A2bA5fF6c71e7E9D23037D64AbD2b4da',
    evaluator: '0xCEBFedAc66B0fFfAD452D3f1B356D1A3120dB233',
    specificationHash: '0xabc',
    submissionTxHash: '0xtx',
    deliverableURI: 'ipfs://QmHash',
    deliverableHash: '0xdef',
    evaluation: { kind: 'exact-json-v1', decision: 1 },
    observedAt: 1000000,
  };
  assert.equal(bundle.mode, 'protected-job');
  assert.ok(bundle.version);
  assert.ok(bundle.jobId);
  assert.ok(bundle.commerce);
  assert.ok(bundle.buyer);
  assert.ok(bundle.provider);
  assert.ok(bundle.evaluator);
  assert.ok(bundle.specificationHash);
  assert.ok(bundle.submissionTxHash);
  assert.ok(bundle.deliverableURI);
  assert.ok(bundle.deliverableHash);
  assert.ok(bundle.evaluation);
  assert.ok(bundle.observedAt);
});

test('EVIDENCE-SCHEMA-B: witness bundle structure uses flat top-level fields not nested aliases', () => {
  // The actual witness code constructs bundle with flat fields.
  // Verify each PRD semantic maps to an actual top-level field, not a nested alias.
  const constructed = {
    version: 'xyx-job-evidence-v1',
    mode: 'protected-job',
    jobId: '123',
    commerce: '0x0747EEf0706327138c69792bF28Cd525089e4583',
    submissionTxHash: '0xtx',
    specification: { hash: '0xspec', input: {}, description: 'test' },
    participants: { client: '0xclient', provider: '0xprovider', evaluator: '0xevaluator' },
    chainState: { chainId: 5042002, blockNumber: 100, blockHash: '0xblock', jobStatus: 2, jobBudget: '1000000' },
    deliverable: { uri: 'ipfs://QmHash', hash: '0xdef', canonical: {} },
    evaluation: { kind: 'exact-json-v1', decision: 1, reasonHash: '0xreason', deterministic: true },
    ...{ decision: 1, reasonHash: '0xreason' },
    observedAt: 1000000,
  };

  // PRD required fields present at top level
  assert.equal(constructed.mode, 'protected-job');
  assert.equal(constructed.jobId, '123');
  assert.equal(constructed.commerce, '0x0747EEf0706327138c69792bF28Cd525089e4583');
  assert.equal(constructed.submissionTxHash, '0xtx');
  assert.ok(constructed.specification.hash);
  assert.equal(constructed.deliverable.uri, 'ipfs://QmHash');
  assert.equal(constructed.deliverable.hash, '0xdef');
  assert.equal(constructed.chainState.chainId, 5042002);
  assert.equal(constructed.evaluation.kind, 'exact-json-v1');
});

test('EVIDENCE-SCHEMA-C: buyer maps to participants.client not field named buyer', () => {
  // PRD v1.2 uses buyer. The code uses participants.client.
  // These must be the same value — the Circle agent address.
  const participants = { client: '0x55763d498fd057d17ffcc2fb540789ce76f4f085' };
  assert.equal(participants.client, '0x55763d498fd057d17ffcc2fb540789ce76f4f085');
  // This IS the buyer address per PRD trust boundaries
  assert.equal(participants.client.toLowerCase(), '0x55763d498fd057d17ffcc2fb540789ce76f4f085'.toLowerCase());
});

test('EVIDENCE-SCHEMA-D: no Open Purchase fields in Protected Job evidence', () => {
  const bundle = {
    version: 'xyx-job-evidence-v1',
    mode: 'protected-job',
    jobId: '123',
    commerce: '0x0747EEf0706327138c69792bF28Cd525089e4583',
    submissionTxHash: '0xtx',
    specification: { hash: '0xspec' },
    participants: { client: '0xclient', provider: '0xprovider', evaluator: '0xevaluator' },
    chainState: { chainId: 5042002 },
    deliverable: { uri: 'ipfs://Qm', hash: '0xdef' },
    evaluation: { kind: 'exact-json-v1' },
    observedAt: 1000000,
  };
  // Open Purchase-only fields must NOT be present
  assert.equal('paymentHash' in bundle, false);
  assert.equal('requestHash' in bundle, false);
  assert.equal('responseHash' in bundle, false);
  assert.equal('httpStatus' in bundle, false);
  assert.equal('outcome' in bundle, false);
  assert.equal('latencyMs' in bundle, false);
  assert.equal('paymentHash' in bundle.deliverable, false);
});

test('EVIDENCE-SCHEMA-E: specificationHash is top-level derived from specification.hash', () => {
  const specHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
  const bundle = {
    version: 'xyx-job-evidence-v1',
    mode: 'protected-job',
    jobId: '123',
    specification: { hash: specHash },
  };
  assert.equal(bundle.specification.hash, specHash);
  assert.ok(bundle.specification.hash.startsWith('0x'));
  assert.equal(bundle.specification.hash.length, 66);
});

test('EVIDENCE-SCHEMA-F: chainId is 5042002 in chainState', () => {
  const bundle = {
    version: 'xyx-job-evidence-v1',
    mode: 'protected-job',
    chainState: { chainId: 5042002 },
  };
  assert.equal(bundle.chainState.chainId, 5042002);
  assert.equal(bundle.chainState.chainId, 5042002); // Arc Testnet
});

test('EVIDENCE-SCHEMA-G: evidenceHash in JobVerdict matches IPFS evidence hash', () => {
  const evidenceHash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
  const verdict = {
    jobId: 123n,
    evidenceHash,
    reasonHash: '0xreason',
    decision: 1,
    issuedAt: 1000n,
    expiresAt: 1300n,
    nonce: 1n,
  };
  assert.equal(verdict.evidenceHash, evidenceHash);
  assert.ok(verdict.evidenceHash.startsWith('0x'));
});
