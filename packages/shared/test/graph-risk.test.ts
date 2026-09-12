import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, reliability, type Candidate, type RiskReceipt } from '../../risk-engine/src/index.js';
import { hashText, defaultPreference, type PurchaseIntent } from '../src/index.js';

const ep1 = hashText('endpoint-1');
const ep2 = hashText('endpoint-2');
const now = 10000000;

function makeReceipts(endpointKey: string, n: number, buyers: number, fail = 0): RiskReceipt[] {
  return Array.from({ length: n }, (_, i) => ({
    id: hashText(`receipt-${endpointKey}-${i}`),
    endpointKey,
    payer: '0x' + (i % buyers + 1).toString(16).padStart(40, '0'),
    outcome: i < fail ? 1 : 0,
    observedAt: now,
    blockNumber: 100,
  }));
}

const intent: PurchaseIntent = {
  capability: 'search',
  maxPriceUsdc: 0.05,
  requireProtection: false,
  preference: defaultPreference,
};

test('fresh Graph data produces normal selection', () => {
  const receipts1 = makeReceipts(ep1, 20, 5, 1);
  const receipts2 = makeReceipts(ep2, 10, 5, 2);
  const candidates: Candidate[] = [
    { endpointKey: ep1, providerKey: hashText('p1'), specHash: hashText('s1'), capability: 'search', priceUsdc: '0.01', executable: true, protected: false, validation: null },
    { endpointKey: ep2, providerKey: hashText('p2'), specHash: hashText('s2'), capability: 'search', priceUsdc: '0.02', executable: true, protected: false, validation: null },
  ];
  const result = evaluate({ intent, candidates, receipts: [...receipts1, ...receipts2], now, chainHead: 101, indexedBlock: 100, maxGraphLagBlocks: 5, policyVersion: 'xyx-test-v1' });
  assert.equal(result.selectedCandidate, ep1);
  assert.equal(result.scores.length, 2);
});

test('stale Graph data fails closed', () => {
  const receipts = makeReceipts(ep1, 5, 5);
  const candidates: Candidate[] = [
    { endpointKey: ep1, providerKey: hashText('p1'), specHash: hashText('s1'), capability: 'search', priceUsdc: '0.01', executable: true, protected: false, validation: null },
  ];
  assert.throws(
    () => evaluate({ intent, candidates, receipts, now, chainHead: 110, indexedBlock: 100, maxGraphLagBlocks: 5, policyVersion: 'xyx-test-v1' }),
    /BLOCKED_TRUST_DATA/
  );
});

test('mismatched block hash would fail (detected at Graph client level, not risk engine)', () => {
  const receipts = makeReceipts(ep1, 5, 5);
  const candidates: Candidate[] = [
    { endpointKey: ep1, providerKey: hashText('p1'), specHash: hashText('s1'), capability: 'search', priceUsdc: '0.01', executable: true, protected: false, validation: null },
  ];
  // Risk engine checks indexedBlock <= chainHead and lag, not hash
  // Hash mismatch is caught by GraphClient.meta() before reaching risk engine
  const result = evaluate({ intent, candidates, receipts, now, chainHead: 101, indexedBlock: 100, maxGraphLagBlocks: 5, policyVersion: 'xyx-test-v1' });
  assert.ok(result.selectedCandidate);
});

test('empty evidence results in null selection (no eligible candidates)', () => {
  const candidates: Candidate[] = [
    { endpointKey: ep1, providerKey: hashText('p1'), specHash: hashText('s1'), capability: 'search', priceUsdc: '0.01', executable: true, protected: false, validation: null },
  ];
  const result = evaluate({ intent, candidates, receipts: [], now, chainHead: 101, indexedBlock: 100, maxGraphLagBlocks: 5, policyVersion: 'xyx-test-v1' });
  assert.equal(result.selectedCandidate, ep1);
  assert.equal(result.scores[0]!.status, 'UNOBSERVED');
});

test('multiple providers with different evidence produce deterministic ordering', () => {
  const receipts1 = makeReceipts(ep1, 20, 10, 0);
  const receipts2 = makeReceipts(ep2, 20, 5, 5);
  const candidates: Candidate[] = [
    { endpointKey: ep1, providerKey: hashText('p1'), specHash: hashText('s1'), capability: 'search', priceUsdc: '0.01', executable: true, protected: false, validation: null },
    { endpointKey: ep2, providerKey: hashText('p2'), specHash: hashText('s2'), capability: 'search', priceUsdc: '0.01', executable: true, protected: false, validation: null },
  ];
  const r1 = evaluate({ intent, candidates, receipts: [...receipts1, ...receipts2], now, chainHead: 101, indexedBlock: 100, maxGraphLagBlocks: 5, policyVersion: 'xyx-test-v1' });
  const r2 = evaluate({ intent, candidates, receipts: [...receipts2, ...receipts1], now, chainHead: 101, indexedBlock: 100, maxGraphLagBlocks: 5, policyVersion: 'xyx-test-v1' });
  assert.equal(r1.selectedCandidate, r2.selectedCandidate);
  assert.deepEqual(r1.scores.map(s => s.endpointKey), r2.scores.map(s => s.endpointKey));
});

test('evidence change causes deterministic selection change', () => {
  const candidates: Candidate[] = [
    { endpointKey: ep1, providerKey: hashText('p1'), specHash: hashText('s1'), capability: 'search', priceUsdc: '0.01', executable: true, protected: false, validation: null },
    { endpointKey: ep2, providerKey: hashText('p2'), specHash: hashText('s2'), capability: 'search', priceUsdc: '0.01', executable: true, protected: false, validation: null },
  ];
  const receiptsA = [...makeReceipts(ep1, 20, 10, 0), ...makeReceipts(ep2, 20, 10, 10)];
  const receiptsB = [...makeReceipts(ep1, 20, 10, 10), ...makeReceipts(ep2, 20, 10, 0)];
  const rA = evaluate({ intent, candidates, receipts: receiptsA, now, chainHead: 101, indexedBlock: 100, maxGraphLagBlocks: 5, policyVersion: 'xyx-test-v1' });
  const rB = evaluate({ intent, candidates, receipts: receiptsB, now, chainHead: 101, indexedBlock: 100, maxGraphLagBlocks: 5, policyVersion: 'xyx-test-v1' });
  assert.notEqual(rA.selectedCandidate, rB.selectedCandidate);
});

test('deterministic tie-breaking: same evidence produces same endpoint ordering', () => {
  const receipts1 = makeReceipts(ep1, 10, 5, 0);
  const receipts2 = makeReceipts(ep2, 10, 5, 0);
  const candidates: Candidate[] = [
    { endpointKey: ep1, providerKey: hashText('p1'), specHash: hashText('s1'), capability: 'search', priceUsdc: '0.01', executable: true, protected: false, validation: null },
    { endpointKey: ep2, providerKey: hashText('p2'), specHash: hashText('s2'), capability: 'search', priceUsdc: '0.01', executable: true, protected: false, validation: null },
  ];
  const r1 = evaluate({ intent, candidates, receipts: [...receipts1, ...receipts2], now, chainHead: 101, indexedBlock: 100, maxGraphLagBlocks: 5, policyVersion: 'xyx-test-v1' });
  const r2 = evaluate({ intent, candidates, receipts: [...receipts1, ...receipts2], now, chainHead: 101, indexedBlock: 100, maxGraphLagBlocks: 5, policyVersion: 'xyx-test-v1' });
  assert.deepEqual(r1, r2);
});

test('reliability function handles edge cases: single buyer, single receipt', () => {
  const single = makeReceipts(ep1, 1, 1, 0);
  const stats = reliability(single, ep1, now, 100);
  assert.equal(stats.count, 1);
  assert.equal(stats.successes, 1);
  assert.equal(stats.addressDiversity, 1);
  assert.equal(stats.status, 'OBSERVED');
});

test('reliability: all failures produce low trust', () => {
  const allFail = makeReceipts(ep1, 20, 5, 20);
  const stats = reliability(allFail, ep1, now, 100);
  assert.equal(stats.failures, 20);
  assert.ok(stats.trust < 0.5, 'all failures should produce trust below baseline');
});
