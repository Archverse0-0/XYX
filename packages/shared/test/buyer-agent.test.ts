import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, type Candidate, type RiskReceipt } from '../../risk-engine/src/index.js';
import { hashText, hashJSON, defaultPreference, type PurchaseIntent, serviceIdentity, atomicAmount } from '../src/index.js';
import { validationScore } from '../../erc8004/client.js';

// Buyer Agent integration test — exercises the decision path:
// PurchaseIntent → candidates → risk evaluation → deterministic selection
// This test uses controlled fixtures, NOT live marketplace/Graph calls.

const ep1 = hashText('https://api.example.com/search');
const ep2 = hashText('https://api.other.com/search');
const now = 10000000;

function makeReceipts(endpointKey: string, n: number, buyers: number, fail = 0): RiskReceipt[] {
  return Array.from({ length: n }, (_, i) => ({
    id: hashText(`r-${endpointKey}-${i}`),
    endpointKey,
    payer: '0x' + (i % buyers + 1).toString(16).padStart(40, '0'),
    outcome: i < fail ? 1 : 0,
    observedAt: now,
    blockNumber: 100,
  }));
}

test('hard maxPrice cannot be overridden by candidate metadata', () => {
  const intent: PurchaseIntent = { capability: 'search', maxPriceUsdc: 0.02, requireProtection: false, preference: defaultPreference };
  const candidates: Candidate[] = [
    { endpointKey: ep1, providerKey: hashText('p1'), specHash: hashText('s1'), capability: 'search', priceUsdc: '0.03', executable: true, protected: false, validation: null },
  ];
  const result = evaluate({ intent, candidates, receipts: makeReceipts(ep1, 10, 5), now, chainHead: 101, indexedBlock: 100, maxGraphLagBlocks: 5, policyVersion: 'xyx-test' });
  assert.equal(result.selectedCandidate, null);
  assert.equal(result.rejectedCandidates[0]?.reason, 'OVER_BUDGET');
});

test('incompatible payment route is rejected', () => {
  const intent: PurchaseIntent = { capability: 'search', maxPriceUsdc: 0.05, requireProtection: false, preference: defaultPreference };
  const candidates: Candidate[] = [
    { endpointKey: ep1, providerKey: hashText('p1'), specHash: hashText('s1'), capability: 'search', priceUsdc: '0.01', executable: false, protected: false, validation: null },
  ];
  const result = evaluate({ intent, candidates, receipts: makeReceipts(ep1, 10, 5), now, chainHead: 101, indexedBlock: 100, maxGraphLagBlocks: 5, policyVersion: 'xyx-test' });
  assert.equal(result.selectedCandidate, null);
  assert.equal(result.rejectedCandidates[0]?.reason, 'PAYMENT_INCOMPATIBLE');
});

test('stale Graph fails closed — BLOCKED_TRUST_DATA', () => {
  const intent: PurchaseIntent = { capability: 'search', maxPriceUsdc: 0.05, requireProtection: false, preference: defaultPreference };
  const candidates: Candidate[] = [
    { endpointKey: ep1, providerKey: hashText('p1'), specHash: hashText('s1'), capability: 'search', priceUsdc: '0.01', executable: true, protected: false, validation: null },
  ];
  assert.throws(
    () => evaluate({ intent, candidates, receipts: makeReceipts(ep1, 10, 5), now, chainHead: 110, indexedBlock: 100, maxGraphLagBlocks: 5, policyVersion: 'xyx-test' }),
    /BLOCKED_TRUST_DATA/
  );
});

test('provider response/metadata cannot authorize spending beyond maxPrice', () => {
  const intent: PurchaseIntent = { capability: 'search', maxPriceUsdc: 0.01, requireProtection: false, preference: defaultPreference };
  const candidates: Candidate[] = [
    { endpointKey: ep1, providerKey: hashText('p1'), specHash: hashText('s1'), capability: 'search', priceUsdc: '0.009', executable: true, protected: false, validation: null },
    { endpointKey: ep2, providerKey: hashText('p2'), specHash: hashText('s2'), capability: 'search', priceUsdc: '0.011', executable: true, protected: false, validation: null },
  ];
  const result = evaluate({ intent, candidates, receipts: [...makeReceipts(ep1, 10, 5), ...makeReceipts(ep2, 10, 5)], now, chainHead: 101, indexedBlock: 100, maxGraphLagBlocks: 5, policyVersion: 'xyx-test' });
  assert.equal(result.selectedCandidate, ep1);
  assert.ok(result.rejectedCandidates.some(r => r.reason === 'OVER_BUDGET'));
});

test('deterministic same input gives deterministic same selection', () => {
  const intent: PurchaseIntent = { capability: 'search', maxPriceUsdc: 0.05, requireProtection: false, preference: defaultPreference };
  const candidates: Candidate[] = [
    { endpointKey: ep1, providerKey: hashText('p1'), specHash: hashText('s1'), capability: 'search', priceUsdc: '0.01', executable: true, protected: false, validation: null },
    { endpointKey: ep2, providerKey: hashText('p2'), specHash: hashText('s2'), capability: 'search', priceUsdc: '0.02', executable: true, protected: false, validation: null },
  ];
  const receipts = [...makeReceipts(ep1, 20, 5, 1), ...makeReceipts(ep2, 10, 5, 2)];
  const r1 = evaluate({ intent, candidates, receipts, now, chainHead: 101, indexedBlock: 100, maxGraphLagBlocks: 5, policyVersion: 'xyx-test' });
  const r2 = evaluate({ intent, candidates, receipts, now, chainHead: 101, indexedBlock: 100, maxGraphLagBlocks: 5, policyVersion: 'xyx-test' });
  assert.deepEqual(r1, r2);
});

test('ERC-8004 unavailable mapping does not fabricate identity', () => {
  const intent: PurchaseIntent = { capability: 'search', maxPriceUsdc: 0.05, requireProtection: false, preference: defaultPreference };
  const candidates: Candidate[] = [
    { endpointKey: ep1, providerKey: hashText('p1'), specHash: hashText('s1'), capability: 'search', priceUsdc: '0.01', executable: true, protected: false, validation: null },
  ];
  const result = evaluate({ intent, candidates, receipts: makeReceipts(ep1, 10, 5), now, chainHead: 101, indexedBlock: 100, maxGraphLagBlocks: 5, policyVersion: 'xyx-test' });
  assert.equal(result.selectedCandidate, ep1);
  assert.equal(result.scores[0]!.validation, null);
});

test('validation affects scoring only when actually available', () => {
  const intent: PurchaseIntent = { capability: 'search', maxPriceUsdc: 0.05, requireProtection: false, preference: defaultPreference };
  const c1: Candidate = { endpointKey: ep1, providerKey: hashText('p1'), specHash: hashText('s1'), capability: 'search', priceUsdc: '0.01', executable: true, protected: false, validation: 0.9 };
  const c2: Candidate = { endpointKey: ep2, providerKey: hashText('p2'), specHash: hashText('s2'), capability: 'search', priceUsdc: '0.01', executable: true, protected: false, validation: null };
  const receipts = [...makeReceipts(ep1, 10, 5, 0), ...makeReceipts(ep2, 10, 5, 0)];
  const result = evaluate({ intent, candidates: [c1, c2], receipts, now, chainHead: 101, indexedBlock: 100, maxGraphLagBlocks: 5, policyVersion: 'xyx-test' });
  assert.equal(result.selectedCandidate, ep1);
});

test('capability mismatch rejects candidate', () => {
  const intent: PurchaseIntent = { capability: 'search', maxPriceUsdc: 0.05, requireProtection: false, preference: defaultPreference };
  const candidates: Candidate[] = [
    { endpointKey: ep1, providerKey: hashText('p1'), specHash: hashText('s1'), capability: 'translation', priceUsdc: '0.01', executable: true, protected: false, validation: null },
  ];
  const result = evaluate({ intent, candidates, receipts: makeReceipts(ep1, 10, 5), now, chainHead: 101, indexedBlock: 100, maxGraphLagBlocks: 5, policyVersion: 'xyx-test' });
  assert.equal(result.selectedCandidate, null);
  assert.equal(result.rejectedCandidates[0]?.reason, 'CAPABILITY_MISMATCH');
});

test('protection requirement rejects unprotected candidates', () => {
  const intent: PurchaseIntent = { capability: 'search', maxPriceUsdc: 0.05, requireProtection: true, preference: defaultPreference };
  const candidates: Candidate[] = [
    { endpointKey: ep1, providerKey: hashText('p1'), specHash: hashText('s1'), capability: 'search', priceUsdc: '0.01', executable: true, protected: false, validation: null },
  ];
  const result = evaluate({ intent, candidates, receipts: makeReceipts(ep1, 10, 5), now, chainHead: 101, indexedBlock: 100, maxGraphLagBlocks: 5, policyVersion: 'xyx-test' });
  assert.equal(result.selectedCandidate, null);
  assert.equal(result.rejectedCandidates[0]?.reason, 'PROTECTION_REQUIRED');
});

test('serviceIdentity produces consistent endpointKey for same URL', () => {
  const id1 = serviceIdentity('https://api.example.com/search', 'POST');
  const id2 = serviceIdentity('https://api.example.com/search', 'post');
  assert.equal(id1.endpointKey, id2.endpointKey);
  assert.equal(id1.providerKey, id2.providerKey);
});

test('serviceIdentity rejects non-HTTPS URLs', () => {
  assert.throws(() => serviceIdentity('http://api.example.com/search', 'POST'), /INVALID_SERVICE_URL/);
});

test('atomicAmount correctly converts USDC amounts', () => {
  assert.equal(atomicAmount('0.01', 6), 10000n);
  assert.equal(atomicAmount('1.000000', 6), 1000000n);
  assert.equal(atomicAmount('0.000001', 6), 1n);
});

test('policy hash is deterministic for same intent', () => {
  const intent: PurchaseIntent = { capability: 'search', maxPriceUsdc: 0.05, requireProtection: false, preference: defaultPreference };
  const candidates: Candidate[] = [
    { endpointKey: ep1, providerKey: hashText('p1'), specHash: hashText('s1'), capability: 'search', priceUsdc: '0.01', executable: true, protected: false, validation: null },
  ];
  const r1 = evaluate({ intent, candidates, receipts: makeReceipts(ep1, 5, 5), now, chainHead: 101, indexedBlock: 100, maxGraphLagBlocks: 5, policyVersion: 'xyx-test' });
  const r2 = evaluate({ intent, candidates, receipts: makeReceipts(ep1, 5, 5), now, chainHead: 101, indexedBlock: 100, maxGraphLagBlocks: 5, policyVersion: 'xyx-test' });
  assert.equal(r1.policyHash, r2.policyHash);
});
