import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeAbiParameters, encodeEventTopics, type Address, type Hex } from 'viem';
import { hashJSON } from '../src/index.js';
import { canonicalJobSpec } from '../src/jobs.js';
import { jobOperation } from '../src/job-operations.js';
import { commerceAbi } from '../../erc8183/service.js';
import { ProtectedJobReconciler, type OperationRow } from '../src/reconciler.js';
import type { DB } from '../src/storage.js';
import { CircleAdapter } from '../../circle-adapter/src/index.js';
import { ProtectedJobService } from '../../erc8183/service.js';

const COMMERCE = ('0x' + 'aa'.repeat(20)) as Address;
const BUYER = ('0x' + 'bb'.repeat(20)) as Address;
const PROVIDER = ('0x' + 'cc'.repeat(20)) as Address;
const EVALUATOR = ('0x' + 'dd'.repeat(20)) as Address;
const ZERO = '0x0000000000000000000000000000000000000000' as Address;
const TX = ('0x' + '11'.repeat(32)) as Hex;
const EXPIRES_AT = 2_000_000_000;
const REQUEST = {
  provider: PROVIDER,
  budgetUsdc: '0.01',
  expiresAt: EXPIRES_AT,
  description: 'Normalize this text:   hello   protected   XYX',
  evaluation: { kind: 'exact-json-v1' as const, expected: { ok: true, result: { normalized: 'hello protected XYX' } } },
};
const EXPECTED_DESCRIPTION = `${REQUEST.description} | XYX specification: ${hashJSON(canonicalJobSpec(REQUEST))}`;

type StoredOperation = OperationRow & { canonical_snapshot: string; external_operation_id: string | null; tx_hash: string | null };

function createDB(opts: { operation?: Partial<StoredOperation>; jobId?: string | null } = {}) {
  const operations = new Map<string, StoredOperation>();
  const key = 'run:create';
  if (opts.operation) {
    operations.set(key, {
      id: 'op-1', job_run_id: 'run', operation: 'create', request_hash: hashJSON(REQUEST), state: 'RECONCILIATION_REQUIRED',
      result: null, external_operation_id: null, tx_hash: null, broadcast_at: null, confirmed_at: null,
      reconciliation_attempts: 0, last_reconciliation_at: null, canonical_snapshot: JSON.stringify(REQUEST), ...opts.operation,
    });
  }
  const db = {
    query: async (sql: string, args: unknown[] = []) => {
      if (sql.includes('INSERT INTO job_operations')) {
        if (operations.has(key)) return { rowCount: 0, rows: [] };
        const row: StoredOperation = {
          id: String(args[0]), job_run_id: 'run', operation: 'create', request_hash: String(args[3]), state: 'IN_FLIGHT', result: null,
          external_operation_id: null, tx_hash: null, broadcast_at: null, confirmed_at: null, reconciliation_attempts: 0,
          last_reconciliation_at: null, canonical_snapshot: String(args[4]),
        };
        operations.set(key, row);
        return { rowCount: 1, rows: [row] };
      }
      if (sql.includes('SELECT * FROM job_operations WHERE job_run_id=$1')) {
        const row = operations.get(key);
        return { rowCount: row ? 1 : 0, rows: row ? [row] : [] };
      }
      if (sql.includes('reconciliation_attempts')) return { rowCount: 1, rows: [] };
      if (sql.includes('external_operation_id = COALESCE')) {
        const row = operations.get(key)!;
        if (args[1]) row.external_operation_id = String(args[1]);
        if (args[2]) row.tx_hash = String(args[2]);
        return { rowCount: 1, rows: [] };
      }
      if (sql.includes("state = 'CONFIRMED'")) {
        const row = [...operations.values()].find(item => item.id === args[0]);
        if (row) { row.state = 'CONFIRMED'; row.result = JSON.parse(String(args[1])); row.tx_hash = args[3] ? String(args[3]) : row.tx_hash; }
        return { rowCount: 1, rows: [] };
      }
      if (sql.includes("state='CONFIRMED'")) {
        const row = [...operations.values()].find(item => item.id === args[0]);
        if (row) { row.state = 'CONFIRMED'; row.result = JSON.parse(String(args[1])); }
        return { rowCount: 1, rows: [] };
      }
      if (sql.includes("state='RECONCILIATION_REQUIRED'")) {
        operations.get(key)!.state = 'RECONCILIATION_REQUIRED';
        return { rowCount: 1, rows: [] };
      }
      if (sql.includes('protected_job_runs WHERE id = $1')) return { rowCount: 1, rows: [{
        job_id: opts.jobId ?? null, specification: REQUEST, client_address: BUYER,
        provider_address: PROVIDER, evaluator_address: EVALUATOR, commerce_address: COMMERCE,
      }] };
      return { rowCount: 0, rows: [] };
    },
  } as unknown as DB;
  return { db, operations };
}

function jobLog(jobId: bigint, evaluator: Address = EVALUATOR, expiredAt: bigint = BigInt(EXPIRES_AT), client: Address = BUYER, provider: Address = PROVIDER) {
  const topics = encodeEventTopics({ abi: commerceAbi, eventName: 'JobCreated', args: { jobId, client, provider } });
  const data = encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }, { type: 'address' }], [evaluator, expiredAt, ZERO]);
  return { address: COMMERCE, topics: topics as Hex[], data };
}

function fakeChain(logs: unknown[] = [jobLog(1n)], jobs: Record<string, unknown> = {}) {
  const defaultJob = {
    id: 1n, client: BUYER, provider: PROVIDER, evaluator: EVALUATOR,
    description: EXPECTED_DESCRIPTION, budget: 0n, expiredAt: BigInt(EXPIRES_AT), status: 0, hook: ZERO,
  };
  return {
    getChainId: async () => 5042002,
    getTransactionReceipt: async () => ({ status: 'success', logs, from: BUYER, to: COMMERCE, transactionHash: TX }),
    readContract: async ({ args }: { args: [bigint] }) => jobs[String(args[0])] ?? { ...defaultJob, id: args[0] },
    getBlockNumber: async () => 100n,
    getLogs: async () => logs,
    getBlock: async () => ({ timestamp: BigInt(Math.floor(EXPIRES_AT / 2)) }),
  };
}

function reconciler(db: DB, chain: Record<string, unknown>, lookup?: (id: string) => Promise<{ id: string; state: string; txHash?: string } | null>) {
  const instance = new ProtectedJobReconciler(db, 'https://rpc.testnet.arc.io', COMMERCE, EVALUATOR, BUYER, lookup);
  Object.defineProperty(instance, 'client', { value: chain, writable: false });
  return instance;
}

test('create progress persists Circle operation id and later tx hash before confirmation', async () => {
  const { db, operations } = createDB();
  const result = await jobOperation(db, 'run', 'create', REQUEST, async (_id, report) => {
    await report({ externalOperationId: 'circle-op-1' });
    await report({ externalOperationId: 'circle-op-1', txHash: TX });
    return { jobId: '1', txHash: TX };
  });
  assert.deepEqual(result, { jobId: '1', txHash: TX });
  assert.equal(operations.get('run:create')?.external_operation_id, 'circle-op-1');
  assert.equal(operations.get('run:create')?.tx_hash, TX);
});

test('external Circle operation id recovers the Arc receipt without re-executing', async () => {
  const { db, operations } = createDB({ operation: { external_operation_id: 'circle-op-1' } });
  const chain = fakeChain();
  let executed = 0;
  const result = await jobOperation(db, 'run', 'create', REQUEST, async () => { executed++; return { jobId: 'wrong', txHash: TX }; },
    reconciler(db, chain, async id => ({ id, state: 'COMPLETE', txHash: TX })));
  assert.deepEqual(result, { jobId: '1', txHash: TX });
  assert.equal(executed, 0);
  assert.equal(operations.get('run:create')?.state, 'CONFIRMED');
});

test('persisted tx hash with missing job id recovers job id from JobCreated', async () => {
  const { db } = createDB({ operation: { tx_hash: TX }, jobId: null });
  const result = await jobOperation(db, 'run', 'create', REQUEST, async () => { throw new Error('SHOULD_NOT_RUN'); }, reconciler(db, fakeChain()));
  assert.deepEqual(result, { jobId: '1', txHash: TX });
});

test('persisted job id is independently verified against exact participants and specification', async () => {
  const { db } = createDB({ operation: {}, jobId: '1' });
  const result = await jobOperation(db, 'run', 'create', REQUEST, async () => { throw new Error('SHOULD_NOT_RUN'); }, reconciler(db, fakeChain()));
  assert.deepEqual(result, { jobId: '1', txHash: null });
});

test('no durable identifier remains STILL_AMBIGUOUS and never rebroadcasts', async () => {
  const { db } = createDB();
  const chain = fakeChain([]);
  let executed = 0;
  await assert.rejects(jobOperation(db, 'run', 'create', REQUEST, async () => { executed++; throw new Error('LOST'); }, reconciler(db, chain)), /RECONCILIATION/);
  await assert.rejects(jobOperation(db, 'run', 'create', REQUEST, async () => { executed++; return { jobId: '2', txHash: TX }; }, reconciler(db, chain)), /RECONCILIATION/);
  assert.equal(executed, 1);
});

test('known tx with mismatched JobCreated context is a canonical conflict', async () => {
  const { db } = createDB({ operation: { tx_hash: TX } });
  const wrong = fakeChain([jobLog(1n, ('0x' + 'ee'.repeat(20)) as Address)]);
  await assert.rejects(jobOperation(db, 'run', 'create', REQUEST, async () => { throw new Error('SHOULD_NOT_RUN'); }, reconciler(db, wrong)), /CANONICAL_CONFLICT/);
});

test('unbound chain candidates are never searched or guessed automatically', async () => {
  const { db } = createDB();
  const chain = fakeChain([jobLog(1n), jobLog(2n)]);
  let searches = 0;
  chain.getLogs = async () => { searches++; return [jobLog(1n), jobLog(2n)]; };
  await assert.rejects(jobOperation(db, 'run', 'create', REQUEST, async () => { throw new Error('LOST'); }, reconciler(db, chain)), /RECONCILIATION/);
  await assert.rejects(jobOperation(db, 'run', 'create', REQUEST, async () => ({ jobId: '2', txHash: TX }), reconciler(db, chain)), /RECONCILIATION/);
  assert.equal(searches, 0);
});

test('reconciliation recovery is idempotent and does not execute create twice', async () => {
  const { db } = createDB({ operation: { tx_hash: TX } });
  const chain = fakeChain();
  let executed = 0;
  const run = async () => jobOperation(db, 'run', 'create', REQUEST, async () => { executed++; return { jobId: '2', txHash: TX }; }, reconciler(db, chain));
  assert.deepEqual(await run(), { jobId: '1', txHash: TX });
  assert.deepEqual(await run(), { jobId: '1', txHash: TX });
  assert.equal(executed, 0);
});

function adapter(sdk: Record<string, unknown>): CircleAdapter {
  // Do not initialize a real SDK or read credentials in these tests.
  return Object.assign(Object.create(CircleAdapter.prototype), { wallet: BUYER, developerWallet: sdk });
}

test('actual Circle adapter journals its id before a polling crash, then reconciles without a second SDK create', async () => {
  const { db, operations } = createDB();
  let creates = 0;
  let failed = true;
  const buyer = adapter({
    createContractExecutionTransaction: async () => { creates++; return { data: { id: 'circle-op-1', state: 'INITIATED' } }; },
    getTransaction: async () => {
      assert.equal(operations.get('run:create')?.external_operation_id, 'circle-op-1');
      if (failed) throw new Error('POLL_CONNECTION_LOST');
      return { data: { transaction: { id: 'circle-op-1', state: 'COMPLETE', txHash: TX, blockchain: 'ARC-TESTNET', sourceAddress: BUYER } } };
    },
  });
  const execute = (key: string, report: import('../src/job-operations.js').OperationProgressReporter) =>
    buyer.execute('createJob(address,address,uint256,string,address)', [], COMMERCE, key, report);
  await assert.rejects(jobOperation(db, 'run', 'create', REQUEST, execute), /JOB_RECONCILIATION_REQUIRED/);
  assert.equal(operations.get('run:create')?.state, 'RECONCILIATION_REQUIRED');
  assert.equal(operations.get('run:create')?.tx_hash, null);
  failed = false;
  const recovered = await jobOperation(db, 'run', 'create', REQUEST, execute, reconciler(db, fakeChain(), id => buyer.getTransactionStatus(id)));
  assert.deepEqual(recovered, { jobId: '1', txHash: TX });
  assert.equal(operations.get('run:create')?.tx_hash, TX);
  assert.equal(creates, 1);
});

test('Circle stops before polling when durable id persistence fails', async () => {
  let polls = 0;
  const buyer = adapter({
    createContractExecutionTransaction: async () => ({ data: { id: 'circle-op-1', state: 'INITIATED' } }),
    getTransaction: async () => { polls++; throw new Error('MUST_NOT_POLL'); },
  });
  await assert.rejects(buyer.execute('createJob()', [], COMMERCE, '00000000-0000-4000-8000-000000000001', async () => { throw new Error('DB_UNAVAILABLE'); }), /DB_UNAVAILABLE/);
  assert.equal(polls, 0);
});

test('normal service create persists tx hash before receipt verification and confirms JobCreated', async () => {
  const { db, operations } = createDB();
  const buyer = adapter({
    createContractExecutionTransaction: async () => ({ data: { id: 'circle-op-1', state: 'INITIATED' } }),
    getTransaction: async () => ({ data: { transaction: { id: 'circle-op-1', state: 'COMPLETE', txHash: TX } } }),
  });
  const service = new ProtectedJobService('https://rpc.testnet.arc.io', COMMERCE, buyer, PROVIDER);
  const chain = fakeChain();
  Object.defineProperty(service, 'client', { value: {
    ...chain, getCode: async () => '0x01', simulateContract: async () => ({}),
    waitForTransactionReceipt: async () => {
      assert.equal(operations.get('run:create')?.tx_hash, TX);
      assert.equal(operations.get('run:create')?.state, 'IN_FLIGHT');
      return chain.getTransactionReceipt();
    },
  } });
  const expiry = Math.floor(Date.now()/1000)+21600;
  const logs = [jobLog(1n, EVALUATOR, BigInt(expiry))];
  Object.assign(service.client, {
    getTransactionReceipt: async () => ({ ...(await chain.getTransactionReceipt()), logs }),
    readContract: async () => ({ ...(await chain.readContract({ args: [1n] })), expiredAt: BigInt(expiry) }),
  });
  const result = await jobOperation(db, 'run', 'create', REQUEST,
    (key, report) => service.create(PROVIDER, EVALUATOR, expiry, EXPECTED_DESCRIPTION, key, report));
  assert.deepEqual(result, { jobId: '1', txHash: TX });
  assert.equal(operations.get('run:create')?.state, 'CONFIRMED');
});

test('service create rejects a JobCreated receipt whose canonical post-state differs', async () => {
  const buyer = adapter({
    createContractExecutionTransaction: async () => ({ data: { id: 'circle-op-1', state: 'INITIATED' } }),
    getTransaction: async () => ({ data: { transaction: { id: 'circle-op-1', state: 'COMPLETE', txHash: TX } } }),
  });
  const service = new ProtectedJobService('https://rpc.testnet.arc.io', COMMERCE, buyer, PROVIDER);
  const chain = fakeChain();
  const expiry = Math.floor(Date.now()/1000)+21600;
  Object.defineProperty(service, 'client', { value: {
    ...chain,
    getCode: async () => '0x01',
    simulateContract: async () => ({}),
    waitForTransactionReceipt: async () => ({ ...(await chain.getTransactionReceipt()), logs: [jobLog(1n, EVALUATOR, BigInt(expiry))] }),
    getTransactionReceipt: async () => ({ ...(await chain.getTransactionReceipt()), logs: [jobLog(1n, EVALUATOR, BigInt(expiry))] }),
    readContract: async () => ({ ...(await chain.readContract({ args: [1n] })), expiredAt: BigInt(expiry), description: 'wrong immutable description' }),
  } });
  await assert.rejects(
    service.create(PROVIDER, EVALUATOR, expiry, EXPECTED_DESCRIPTION, '00000000-0000-4000-8000-000000000001'),
    /JOB_CREATE_POST_STATE_MISMATCH/,
  );
});

for (const state of ['FAILED', 'DENIED', 'CANCELLED', 'STUCK']) {
  test(`Circle ${state} without a receipt never permits create rebroadcast`, async () => {
    const { db } = createDB({ operation: { external_operation_id: 'circle-op-1' } });
    const r = reconciler(db, fakeChain(), async id => ({ id, state }));
    await assert.rejects(jobOperation(db, 'run', 'create', REQUEST, async () => { assert.fail('REBROADCAST'); }, r), /RECONCILIATION/);
  });
}

test('Circle lookup cannot substitute a different operation id', async () => {
  const { db } = createDB({ operation: { external_operation_id: 'circle-op-1' } });
  await assert.rejects(jobOperation(db, 'run', 'create', REQUEST, async () => { assert.fail('REBROADCAST'); },
    reconciler(db, fakeChain(), async () => ({ id: 'other', state: 'COMPLETE', txHash: TX }))), /CANONICAL_CONFLICT/);
});

for (const field of ['from', 'to', 'transactionHash'] as const) {
  test(`wrong receipt ${field} is a canonical conflict`, async () => {
    const { db } = createDB({ operation: { tx_hash: TX } });
    const chain = fakeChain();
    const receipt = await chain.getTransactionReceipt();
    chain.getTransactionReceipt = async () => ({ ...receipt, [field]: field === 'transactionHash' ? '0x'+'22'.repeat(32) : ZERO });
    await assert.rejects(jobOperation(db, 'run', 'create', REQUEST, async () => { assert.fail('REBROADCAST'); }, reconciler(db, chain)), /CANONICAL_CONFLICT/);
  });
}

test('jobId-only recovery rejects immutable specification mismatch', async () => {
  const { db } = createDB({ operation: {}, jobId: '1' });
  const chain = fakeChain();
  const job = await chain.readContract({ args: [1n] });
  chain.readContract = async () => ({ ...job, description: 'different immutable task' });
  await assert.rejects(jobOperation(db, 'run', 'create', REQUEST, async () => { assert.fail('REBROADCAST'); }, reconciler(db, chain)), /CANONICAL_CONFLICT/);
});

test('create refuses SAFE_TO_RETRY even from a permissive reconciler', async () => {
  const { db } = createDB({ operation: {} });
  const r = { reconcile: async () => ({ status: 'SAFE_TO_RETRY' }) } as unknown as ProtectedJobReconciler;
  await assert.rejects(jobOperation(db, 'run', 'create', REQUEST, async () => { assert.fail('REBROADCAST'); }, r), /RECONCILIATION/);
});

test('Circle id is persisted even when optional initial state is malformed', async () => {
  const updates: unknown[] = [];
  const buyer = adapter({ createContractExecutionTransaction: async () => ({ data: { id: 'circle-op-1', state: 99 } }) });
  await assert.rejects(buyer.execute('createJob()', [], COMMERCE, '00000000-0000-4000-8000-000000000001', update => { updates.push(update); }));
  assert.deepEqual(updates, [{ externalOperationId: 'circle-op-1' }]);
});

test('failed receipt remains ambiguous and does not fall through to jobId recovery', async () => {
  const { db } = createDB({ operation: { tx_hash: TX }, jobId: '1' });
  const chain = fakeChain();
  const receipt = await chain.getTransactionReceipt();
  chain.getTransactionReceipt = async () => ({ ...receipt, status: 'reverted' });
  await assert.rejects(jobOperation(db, 'run', 'create', REQUEST, async () => { assert.fail('REBROADCAST'); }, reconciler(db, chain)), /RECONCILIATION/);
});

test('wrong Circle wallet or network fails closed in the read-only lookup', async () => {
  for (const context of [{ blockchain: 'ETH-SEPOLIA', sourceAddress: BUYER }, { blockchain: 'ARC-TESTNET', sourceAddress: ZERO }]) {
    const buyer = adapter({ getTransaction: async () => ({ data: { transaction: { id: 'circle-op-1', state: 'COMPLETE', txHash: TX, ...context } } }) });
    await assert.rejects(buyer.getTransactionStatus('circle-op-1'), /CIRCLE_TRANSACTION_CONTEXT_MISMATCH/);
  }
});

test('malformed progress hash is never saved or marked confirmed', async () => {
  const { db, operations } = createDB();
  await assert.rejects(jobOperation(db, 'run', 'create', REQUEST, async (_key, report) => {
    await report({ txHash: '0xnot-a-transaction' });
  }), /RECONCILIATION/);
  assert.equal(operations.get('run:create')?.tx_hash, null);
  assert.equal(operations.get('run:create')?.state, 'RECONCILIATION_REQUIRED');
});
