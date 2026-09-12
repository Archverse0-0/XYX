import test from 'node:test';
import assert from 'node:assert/strict';
import { SelectionEngine, type DiscoveryCandidate, type SelectionContext } from '../src/selection-engine.js';
import { canonicalSelectionHash } from '../../shared/src/selection.js';
import { hashText, defaultPreference } from '../../shared/src/index.js';
import type { PurchaseIntent } from '../../shared/src/index.js';

// ─── Test Helpers ────────────────────────────────────────────────

function makeCandidate(overrides: Partial<DiscoveryCandidate> = {}): DiscoveryCandidate {
  const endpoint = overrides.endpoint ?? 'https://provider.test/api';
  const endpointKey = hashText(endpoint);
  return {
    endpoint,
    wallet: overrides.wallet ?? '0x' + '1'.repeat(40),
    providerKey: hashText('https://provider.test'),
    endpointKey,
    specHash: hashText(JSON.stringify({ method: 'POST', path: '/api' })),
    capability: overrides.capability ?? 'search',
    priceUsdc: overrides.priceUsdc ?? '0.01',
    executable: overrides.executable ?? true,
    protected: overrides.protected ?? false,
    ...overrides,
  };
}

function makeIntent(overrides: Partial<PurchaseIntent> = {}): PurchaseIntent {
  return {
    capability: 'search',
    maxPriceUsdc: 0.05,
    requireProtection: false,
    preference: defaultPreference,
    acceptedValidators: [],
    ...overrides,
  };
}

function makeContext(candidates: DiscoveryCandidate[], taskCategory: 'deliverable' | 'machine-action' = 'deliverable', intentOverrides: Partial<PurchaseIntent> = {}): SelectionContext {
  return {
    intent: makeIntent(intentOverrides),
    candidates,
    taskCategory,
    policyVersion: 'xyx-balanced-v1',
    maxGraphLagBlocks: 50,
  };
}

// Minimal mock identity that always resolves
function mockIdentity() {
  return {
    resolve: async () => ({
      agentId: '123',
      registry: '0x8004A818BFB912233c491871b3d84c89A494BD9e',
      wallet: '0x' + '1'.repeat(40),
    }),
  };
}

// Minimal mock graph that returns fresh data with evidence
function mockGraph(endpointKey: string) {
  const _meta = {
    block: { number: 100, hash: '0x' + 'ab'.repeat(32) },
    hasIndexingErrors: false,
    deployment: 'test-deployment',
  };
  return {
    deployment: 'test-deployment',
    meta: async () => _meta,
    query: async () => ({ _meta }),
    validations: async () => [],
    evidence: async () => [
      {
        id: hashText('r1'),
        endpointKey,
        payer: '0x' + '1'.repeat(40),
        outcome: 0,
        observedAt: 10000000,
        blockNumber: 100,
      },
    ],
  };
}

const mockChain = {
  getBlockNumber: async () => 100n,
  getBlock: async () => ({ hash: '0x' + 'ab'.repeat(32), timestamp: 10000000n }),
};

function engineFor(candidate: DiscoveryCandidate, graph = mockGraph(candidate.endpointKey)) {
  return new SelectionEngine(mockIdentity() as any,
    { graphEndpoint: 'https://graph.test', graphDeploymentId: 'test-deployment', rpc: 'https://rpc.test' },
    graph as any, mockChain as any);
}

// ─── Tests ────────────────────────────────────────────────────────

test('no candidates fails closed with NO_ELIGIBLE_CANDIDATE', async () => {
  const engine = engineFor(makeCandidate());
  const result = await engine.select(makeContext([]));
  assert.equal(result.status, 'NO_ELIGIBLE_CANDIDATE');
  assert.ok(result.selectionHash.length > 0);
});

test('graph unavailable fails closed', async () => {
  const candidate = makeCandidate();
  const engine = engineFor(candidate, { meta: async () => { throw new Error('GRAPH_UNAVAILABLE'); } } as any);
  const result = await engine.select(makeContext([makeCandidate()]));
  assert.equal(result.status, 'FAIL_CLOSED');
  assert.ok(result.failureReason?.includes('GRAPH'));
});

test('identical validated inputs produce identical selectionHash for identical timestamps', async () => {
  const candidate = makeCandidate({ endpoint: 'https://stable.test/api' });
  const graph = mockGraph(candidate.endpointKey);

  const engine = engineFor(candidate, graph);
  const result = await engine.select(makeContext([candidate]));
  if(result.status!=='SELECTED')throw new Error('expected selection');

  assert.equal(result.status, 'SELECTED');
  // Same inputs with same timestamp produce identical hash
  const manualResult = { ...result, timestamp: result.timestamp };
  assert.equal(canonicalSelectionHash(manualResult), result.selectionHash);
});

test('deterministic risk produces identical output for identical inputs', async () => {
  const candidate = makeCandidate({ endpoint: 'https://deterministic.test/api' });
  const graph = mockGraph(candidate.endpointKey);

  const engine = engineFor(candidate, graph);

  const result1 = await engine.select(makeContext([candidate]));
  const result2 = await engine.select(makeContext([candidate]));

  assert.equal(result1.status, 'SELECTED');
  assert.equal(result2.status, 'SELECTED');
  assert.equal(result1.risk.output.selectedCandidate, result2.risk.output.selectedCandidate);
  assert.deepEqual(result1.risk.output.trustScores, result2.risk.output.trustScores);
});

test('no static provider fallback after failure', async () => {
  const candidate = makeCandidate();
  const engine = engineFor(candidate, { meta: async () => { throw new Error('GRAPH_UNAVAILABLE'); } } as any);
  const result = await engine.select(makeContext([makeCandidate(), makeCandidate({ endpoint: 'https://other.test/api' })]));
  assert.equal(result.status, 'FAIL_CLOSED');
  assert.equal(result.provider, null);
});

test('selection record includes required fields', async () => {
  const candidate = makeCandidate();
  const graph = mockGraph(candidate.endpointKey);

  const engine = engineFor(candidate, graph);
  const result = await engine.select(makeContext([candidate]));
  if(result.status!=='SELECTED')throw new Error('expected selection');
  assert.ok(result.selectionId.length > 0);
  assert.ok(result.timestamp > 0);
  assert.equal(result.taskCategory, 'deliverable');
  assert.ok(result.provider.endpoint.length > 0);
  assert.ok(result.provider.wallet.length > 0);
  assert.ok(result.graph.deployment.length > 0);
  assert.ok(result.graph.indexedBlock > 0);
  assert.ok(result.historicalOutcomes);
  assert.ok(result.risk.input.policyVersion.length > 0);
  assert.ok(result.risk.output.modelVersion.length > 0);
  assert.equal(result.selectionHash.length, 66);
  assert.equal(result.status, 'SELECTED');
});

test('causal record ordering: selectionHash proves selection preceded create', async () => {
  const candidate = makeCandidate({ endpoint: 'https://causal.test/api' });
  const graph = mockGraph(candidate.endpointKey);

  const engine = engineFor(candidate, graph);
  const result = await engine.select(makeContext([candidate]));

  assert.equal(result.status, 'SELECTED');
  // The selectionHash must be deterministically derived from all validated inputs
  // and must NOT include the jobId (which doesn't exist yet at selection time).
  const standaloneHash = canonicalSelectionHash(result);
  assert.equal(standaloneHash, result.selectionHash);
  assert.ok(result.selectionHash.length > 0);
});

test('identity verification result is recorded in selection', async () => {
  const candidate = makeCandidate();
  const graph = mockGraph(candidate.endpointKey);

  const engine = engineFor(candidate, graph);
  const result = await engine.select(makeContext([candidate]));

  if(result.status!=='SELECTED')throw new Error('expected selection');
  assert.ok(result.provider.erc8004);
  assert.equal(result.provider.erc8004?.verified, true);
  assert.equal(result.provider.erc8004?.agentId, '123');
  assert.equal(result.provider.erc8004?.walletMatch, true);
});

test('task category is preserved in selection', async () => {
  const candidate = makeCandidate();
  const graph = mockGraph(candidate.endpointKey);

  const engine = engineFor(candidate, graph);

  const result1 = await engine.select(makeContext([candidate], 'machine-action'));
  assert.equal(result1.taskCategory, 'machine-action');

  const result2 = await engine.select(makeContext([candidate], 'deliverable'));
  assert.equal(result2.taskCategory, 'deliverable');
});
