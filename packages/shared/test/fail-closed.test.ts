import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileOperation, existingOperation, jobOperation } from '../src/job-operations.js';
import { hashJSON } from '../src/index.js';
import type { DB } from '../src/storage.js';
import type { ProtectedJobReconciler, OperationRow } from '../src/reconciler.js';

// ═══════════════════════════════════════════════════════════════
// B14: Fail-Closed Semantics
// ═══════════════════════════════════════════════════════════════

function journalDB() {
  let row: Record<string, unknown> | undefined;
  const db = {
    query: async (sql: string, args: unknown[]) => {
      if (sql.startsWith('INSERT')) { if (row) return { rowCount: 0, rows: [] }; row = { id: args[0], state: 'IN_FLIGHT', request_hash: args[3], result: null }; return { rowCount: 1, rows: [row] }; }
      if (sql.startsWith('SELECT')) return { rowCount: row ? 1 : 0, rows: row ? [row] : [] };
      if (sql.includes("state='CONFIRMED'")) { row!.state = 'CONFIRMED'; row!.result = JSON.parse(args[1] as string); return { rowCount: 1, rows: [] }; }
      if (sql.includes("state='RECONCILIATION_REQUIRED'")) { row!.state = 'RECONCILIATION_REQUIRED'; return { rowCount: 1, rows: [] }; }
      if (sql.includes('DELETE FROM job_operations')) { row = undefined; return { rowCount: 1, rows: [] }; }
      throw new Error('UNEXPECTED_TEST_SQL');
    },
  } as unknown as DB;
  return db;
}

test('FAIL-CLOSED-A: STILL_AMBIGUOUS reconciler never produces success', async () => {
  const mockReconciler = {
    reconcile: async () => ({ status: 'STILL_AMBIGUOUS' as const }),
  };
  const row: OperationRow = {
    id: '1', job_run_id: 'run', operation: 'fund', request_hash: 'hash',
    state: 'RECONCILIATION_REQUIRED', result: null, external_operation_id: null,
    tx_hash: null, broadcast_at: null, confirmed_at: null, reconciliation_attempts: 1,
    last_reconciliation_at: new Date(), canonical_snapshot: null,
  };
  const result = await reconcileOperation(mockReconciler as unknown as ProtectedJobReconciler, row as unknown as Record<string, unknown>, 'hash');
  assert.equal(result.status, 'STILL_AMBIGUOUS');
});

test('FAIL-CLOSED-B: CANONICAL_CONFLICT cannot be overridden', async () => {
  const mockReconciler = {
    reconcile: async () => ({ status: 'CANONICAL_CONFLICT' as const, detail: 'budget mismatch' }),
  };
  const row: OperationRow = {
    id: '1', job_run_id: 'run', operation: 'fund', request_hash: 'hash',
    state: 'RECONCILIATION_REQUIRED', result: null, external_operation_id: null,
    tx_hash: null, broadcast_at: null, confirmed_at: null, reconciliation_attempts: 1,
    last_reconciliation_at: new Date(), canonical_snapshot: null,
  };
  const result = await reconcileOperation(mockReconciler as unknown as ProtectedJobReconciler, row as unknown as Record<string, unknown>, 'hash');
  assert.equal(result.status, 'CANONICAL_CONFLICT');
});

test('FAIL-CLOSED-C: idempotency conflict with different request is rejected', () => {
  const req1 = hashJSON({ amount: '1000000' });
  const req2 = hashJSON({ amount: '2000000' });
  assert.throws(
    () => existingOperation({ request_hash: req1, state: 'CONFIRMED', result: {} }, req2),
    /IDEMPOTENCY_CONFLICT/
  );
});

test('FAIL-CLOSED-D: RECONCILIATION_REQUIRED state blocks retry without reconciler', async () => {
  const db = journalDB();
  await assert.rejects(
    jobOperation(db, 'run3', 'fund', { amount: '1' }, async () => { throw new Error('TIMEOUT'); }),
    /TIMEOUT/
  );
  await assert.rejects(
    jobOperation(db, 'run3', 'fund', { amount: '1' }, async () => ({})),
    /RECONCILIATION/
  );
});

test('FAIL-CLOSED-E: STILL_AMBIGUOUS without reconciler blocks action', async () => {
  const db = journalDB();
  await assert.rejects(
    jobOperation(db, 'run5', 'evaluate', { x: 1 }, async () => { throw new Error('RPC_FAIL'); }),
    /RPC_FAIL/
  );
  // Without reconciler, retry stays blocked
  await assert.rejects(
    jobOperation(db, 'run5', 'evaluate', { x: 1 }, async () => ({ decision: 1 })),
    /RECONCILIATION/
  );
});

test('FAIL-CLOSED-F: RECOVERED_CONFIRMED returns cached result', async () => {
  const mockReconciler = {
    reconcile: async () => ({ status: 'RECOVERED_CONFIRMED' as const, result: { txHash: '0xabc', funded: true } }),
  };
  const row: OperationRow = {
    id: '1', job_run_id: 'run', operation: 'fund', request_hash: 'hash',
    state: 'RECONCILIATION_REQUIRED', result: null, external_operation_id: null,
    tx_hash: null, broadcast_at: null, confirmed_at: null, reconciliation_attempts: 1,
    last_reconciliation_at: new Date(), canonical_snapshot: null,
  };
  const result = await reconcileOperation(mockReconciler as unknown as ProtectedJobReconciler, row as unknown as Record<string, unknown>, 'hash');
  assert.equal(result.status, 'RECOVERED_CONFIRMED');
  assert.equal((result as any).result.txHash, '0xabc');
});
