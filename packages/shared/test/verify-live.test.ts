import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyReceiptCount, compareReceipt, exitCodeForStatus, overallStatus, serializeReport, verifyContractBytecode, verifyEvidence, verifyEvaluatorTarget, verifyGraphFreshness, verifyGraphMeta, verifyReceiptProof, verifyUsdcDecimals, verifyArcChain, hashText as scriptHashText } from '../../../scripts/verify-live';
import { hashText } from '../src/index.js';

test('JSON serialization redacts sentinel secrets', () => {
  const output = serializeReport({ verifierVersion: 'test', network: 'arc-testnet', timestamp: '', gitCommit: '', overall: 'PASS', checks: [{ id: 'x', status: 'PASS', detail: 'TEST_INTERNAL_TOKEN_123' }] } as any);
  assert.equal(output.includes('TEST_INTERNAL_TOKEN_123'), false);
});

test('zero receipts are NOT_YET_PROVEN', () => {
  assert.equal(classifyReceiptCount(0).status, 'NOT_YET_PROVEN');
});

test('receipt field mismatch fails closed', () => {
  const graph = { id: '0xabc', payer: '0x111' } as Record<string, unknown>;
  const event = { receiptHash: '0xdef', payer: '0x111' } as Record<string, unknown>;
  assert.equal(compareReceipt(graph, event).status, 'FAIL');
});

test('graph indexing errors cannot pass', async () => {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ data: { _meta: { deployment: 'dep', hasIndexingErrors: true, block: { number: 10, hash: '0x' + '11'.repeat(32) } } } }), { status: 200 })) as typeof fetch;
  try { assert.equal((await verifyGraphMeta('https://graph.test', 'dep')).status, 'FAIL'); } finally { globalThis.fetch = oldFetch; }
});

test('graph deployment mismatch fails', async () => {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ data: { _meta: { deployment: 'other', hasIndexingErrors: false, block: { number: 10, hash: '0x' + '11'.repeat(32) } } } }), { status: 200 })) as typeof fetch;
  try { assert.equal((await verifyGraphMeta('https://graph.test', 'dep')).status, 'FAIL'); } finally { globalThis.fetch = oldFetch; }
});

test('valid Graph deployment metadata passes', async () => {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ data: { _meta: { deployment: 'dep', hasIndexingErrors: false, block: { number: 10, hash: '0x' + '11'.repeat(32) } } } }), { status: 200 })) as typeof fetch;
  try { assert.equal((await verifyGraphMeta('https://graph.test', 'dep')).status, 'PASS'); } finally { globalThis.fetch = oldFetch; }
});

test('Graph freshness rejects future, stale, and hash mismatch and accepts a fresh match', async () => {
  const make = (head: bigint, block: bigint, hash: string) => ({
    getBlockNumber: async () => head,
    getBlock: async ({ blockNumber }: { blockNumber: bigint }) => ({ hash: blockNumber === block ? hash : '0x' + '22'.repeat(32) }),
  });
  assert.equal((await verifyGraphFreshness(make(10n, 10n, '0x' + '11'.repeat(32)) as any, { block: { number: 11, hash: '0x' + '11'.repeat(32) } }, 50))[0].status, 'FAIL');
  assert.equal((await verifyGraphFreshness(make(100n, 40n, '0x' + '22'.repeat(32)) as any, { block: { number: 40, hash: '0x' + '22'.repeat(32) } }, 10))[0].status, 'FAIL');
  assert.equal((await verifyGraphFreshness(make(10n, 8n, '0x' + '22'.repeat(32)) as any, { block: { number: 8, hash: '0x' + '11'.repeat(32) } }, 10))[0].status, 'FAIL');
  assert.equal((await verifyGraphFreshness(make(10n, 8n, '0x' + '11'.repeat(32)) as any, { block: { number: 8, hash: '0x' + '11'.repeat(32) } }, 10))[0].status, 'PASS');
});

test('receipt proof wires Graph rows to the configured registry event and transaction', async () => {
  const oldFetch = globalThis.fetch;
  const uri = 'ipfs://b' + 'a'.repeat(20);
  const row = { id: '0x' + '11'.repeat(32), providerKey: '0x' + '22'.repeat(32), endpointKey: '0x' + '33'.repeat(32), payer: '0x' + '44'.repeat(20), specHash: '0x' + '55'.repeat(32), paymentHash: '0x' + '66'.repeat(32), requestHash: '0x' + '77'.repeat(32), responseHash: '0x' + '88'.repeat(32), evidenceHash: '0x' + '99'.repeat(32), evidenceURIHash: scriptHashText(uri), evidenceURI: uri, blockNumber: '10', transactionHash: '0x' + 'aa'.repeat(32) };
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.includes('ipfs.test')) {
      return new Response(JSON.stringify({ test: true }), { status: 200 });
    }
    return new Response(JSON.stringify({ data: { receipts: [row] } }), { status: 200 });
  }) as typeof fetch;
  const mockLog = { args: { receiptHash: row.id, endpointKey: row.endpointKey, providerKey: row.providerKey, payer: row.payer, specHash: row.specHash, paymentHash: row.paymentHash, requestHash: row.requestHash, responseHash: row.responseHash, evidenceHash: row.evidenceHash, evidenceURIHash: row.evidenceURIHash } as any, transactionHash: '0x' + 'ff'.repeat(32), blockNumber: 10n };
  const client = { getLogs: async () => [mockLog], getTransactionReceipt: async () => ({ status: 'success' }) };
  const checks = await verifyReceiptProof('https://graph.test', client as any, '0x' + 'bb'.repeat(20), 'PASS');
  assert.equal(checks.find(c => c.id === 'receipt.arc_graph_match')?.status, 'PASS');
  try { const failed = { ...client, getTransactionReceipt: async () => ({ status: 'reverted' }) }; const checks = await verifyReceiptProof('https://graph.test', failed as any, '0x' + 'bb'.repeat(20), 'PASS'); assert.equal(checks.find(c => c.id === 'receipt.arc_transaction')?.status, 'FAIL'); } finally { globalThis.fetch = oldFetch; }
});

test('overall status is strict for FAIL, BLOCKED, and NOT_YET_PROVEN', () => {
  assert.equal(overallStatus([{ id: 'x', status: 'PASS', detail: '' }]), 'PASS');
  assert.equal(overallStatus([{ id: 'x', status: 'FAIL', detail: '' }]), 'FAIL');
  assert.equal(overallStatus([{ id: 'x', status: 'BLOCKED', detail: '' }]), 'BLOCKED');
  assert.equal(overallStatus([{ id: 'x', status: 'NOT_YET_PROVEN', detail: '' }]), 'NOT_YET_PROVEN');
  assert.equal(exitCodeForStatus('PASS'), 0); assert.equal(exitCodeForStatus('FAIL'), 1); assert.equal(exitCodeForStatus('BLOCKED'), 1); assert.equal(exitCodeForStatus('NOT_YET_PROVEN'), 1);
});

test('invalid evidence URI fails through EvidenceStorage semantics', async () => {
  assert.equal((await verifyEvidence('http://ipfs.test', undefined, 'https://not-ipfs', '0x' + '11'.repeat(32))).status, 'FAIL');
});

test('EvidenceStorage production path verifies canonical content, hash mismatch, and unavailable storage', async () => {
  const oldFetch = globalThis.fetch;
  const uri = 'ipfs://b' + 'a'.repeat(20);
  const canonical = '{"a":1}';
  globalThis.fetch = (async () => new Response(canonical, { status: 200 })) as typeof fetch;
  try {
    assert.equal((await verifyEvidence('http://ipfs.test', undefined, uri, hashText(canonical))).status, 'PASS');
    assert.equal((await verifyEvidence('http://ipfs.test', undefined, uri, '0x' + '11'.repeat(32))).status, 'FAIL');
  } finally { globalThis.fetch = (async () => new Response('offline', { status: 503 })) as typeof fetch; }
  try { assert.equal((await verifyEvidence('http://ipfs.test', undefined, uri, hashText(canonical))).status, 'BLOCKED'); } finally { globalThis.fetch = oldFetch; }
});

test('receipt proof rejects a wrong registry emitter and evidenceURIHash mismatch', async () => {
  const oldFetch = globalThis.fetch;
  const uri = 'ipfs://b' + 'a'.repeat(20);
  const row = { id: '0x' + '11'.repeat(32), providerKey: '0x' + '22'.repeat(32), endpoint: { id: '0x' + '33'.repeat(32) }, payer: '0x' + '44'.repeat(20), specHash: '0x' + '55'.repeat(32), paymentHash: '0x' + '66'.repeat(32), requestHash: '0x' + '77'.repeat(32), responseHash: '0x' + '88'.repeat(32), evidenceHash: '0x' + '99'.repeat(32), evidenceURIHash: '0x' + 'aa'.repeat(32), evidenceURI: uri, blockNumber: '10', transactionHash: '0x' + 'aa'.repeat(32) };
  globalThis.fetch = (async () => new Response(JSON.stringify({ data: { receipts: [row] } }), { status: 200 })) as typeof fetch;
  const client = { getLogs: async () => [{ address: '0x' + 'cc'.repeat(20), args: {} as any }], getTransactionReceipt: async () => ({ status: 'reverted' }) };
  try { const checks = await verifyReceiptProof('https://graph.test', client as any, '0x' + 'bb'.repeat(20), 'PASS'); assert.equal(checks.find(c => c.id === 'receipt.arc_graph_match')?.status, 'FAIL'); } finally { globalThis.fetch = oldFetch; }
});

test('contract bytecode, evaluator target, and USDC decimal checks use production functions', async () => {
  const codeClient = { getBytecode: async () => '0x6000' };
  const emptyClient = { getBytecode: async () => '0x' };
  const evaluator = { readContract: async () => '0x' + '12'.repeat(20) };
  const wrongEvaluator = { readContract: async () => '0x' + '13'.repeat(20) };
  const usdc6 = { readContract: async () => 6 };
  const usdc18 = { readContract: async () => 18 };
  assert.equal((await verifyContractBytecode(codeClient, 'contract.registry.bytecode', 'Registry', '0x' + '11'.repeat(20))).status, 'PASS');
  assert.equal((await verifyContractBytecode(emptyClient, 'contract.registry.bytecode', 'Registry', '0x' + '11'.repeat(20))).status, 'FAIL');
  assert.equal((await verifyContractBytecode(codeClient, 'contract.evaluator.bytecode', 'Evaluator', '0x' + '11'.repeat(20))).status, 'PASS');
  assert.equal((await verifyContractBytecode(emptyClient, 'contract.evaluator.bytecode', 'Evaluator', '0x' + '11'.repeat(20))).status, 'FAIL');
  assert.equal((await verifyEvaluatorTarget(evaluator, '0x' + '11'.repeat(20), '0x' + '12'.repeat(20))).status, 'PASS');
  assert.equal((await verifyEvaluatorTarget(wrongEvaluator, '0x' + '11'.repeat(20), '0x' + '12'.repeat(20))).status, 'FAIL');
  assert.equal((await verifyContractBytecode(emptyClient, 'erc8183.bytecode', 'ERC-8183', '0x' + '11'.repeat(20))).status, 'FAIL');
  assert.equal((await verifyContractBytecode(emptyClient, 'erc8004.bytecode', 'ERC-8004', '0x' + '11'.repeat(20))).status, 'FAIL');
  assert.equal((await verifyUsdcDecimals(usdc6)).status, 'PASS');
  assert.equal((await verifyUsdcDecimals(usdc18)).status, 'FAIL');
});

test('verifyArcChain exercises chain, unavailable, and stale RPC paths', async () => {
  const oldFetch = globalThis.fetch;
  const rpc = (chainId: string, timestamp: string, reject = false) => {
    globalThis.fetch = (async (_input, init) => {
      if (reject) throw new Error('offline');
      const method = JSON.parse(String(init?.body)).method;
      const result = method === 'eth_chainId' ? chainId : method === 'eth_blockNumber' ? '0x10' : { timestamp };
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }), { status: 200 });
    }) as typeof fetch;
  };
  try {
    rpc('0x4cef52', '0x' + Math.floor(Date.now() / 1000).toString(16));
    assert.equal((await verifyArcChain('http://rpc.test'))[0].status, 'PASS');
    rpc('0x1', '0x' + Math.floor(Date.now() / 1000).toString(16));
    assert.equal((await verifyArcChain('http://rpc.test'))[0].status, 'FAIL');
    rpc('', '', true);
    assert.equal((await verifyArcChain('http://rpc.test'))[0].status, 'BLOCKED');
  } finally { globalThis.fetch = oldFetch; }
});
