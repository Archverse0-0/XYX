import test from 'node:test';
import assert from 'node:assert/strict';
import { hashJSON } from '../src/index.js';
import { jobOperation, existingOperation } from '../src/job-operations.js';
import type { DB } from '../src/storage.js';

// ═══════════════════════════════════════════════════════════════
// B2: Operation Journal — idempotency, fields, duplicate prevention
// ═══════════════════════════════════════════════════════════════

function simpleDB() {
  const ops = new Map<string, { state: string; request_hash: string; result: unknown }>();
  const db = {
    query: async (sql: string, args: unknown[]) => {
      if (sql.startsWith('INSERT INTO job_operations')) {
        const op = args[2] as string, reqHash = args[3] as string;
        if (ops.has(op)) return { rowCount: 0, rows: [] };
        const row = { id: args[0], state: 'IN_FLIGHT', request_hash: reqHash, result: null };
        ops.set(op, row);
        return { rowCount: 1, rows: [row] };
      }
      if (sql.startsWith('SELECT')) {
        const op = args[1] as string;
        const row = ops.get(op);
        return { rowCount: row ? 1 : 0, rows: row ? [row] : [] };
      }
      if (sql.includes("state='CONFIRMED'")) {
        const id = args[0] as string;
        for (const row of ops.values()) { if (row.state === 'IN_FLIGHT') { row.state = 'CONFIRMED'; row.result = JSON.parse(args[1] as string); break; } }
        return { rowCount: 1, rows: [] };
      }
      if (sql.includes("state='RECONCILIATION_REQUIRED'")) {
        for (const row of ops.values()) { if (row.state === 'IN_FLIGHT') { row.state = 'RECONCILIATION_REQUIRED'; row.result = JSON.parse(args[1] as string); break; } }
        return { rowCount: 1, rows: [] };
      }
      return { rowCount: 0, rows: [] };
    },
  } as unknown as DB;
  return db;
}

test('JOURNAL-A: identical request replay returns cached result, no duplicate write', async () => {
  const db = simpleDB();
  const request = { amount: '1000000' };
  const requestHash = hashJSON(request);

  const r1 = await jobOperation(db, 'run1', 'fund', request, async () => ({ txHash: '0xabc' }));
  assert.deepEqual(r1, { txHash: '0xabc' });

  const r2 = await jobOperation(db, 'run1', 'fund', request, async () => { throw new Error('SHOULD_NOT_RUN'); });
  assert.deepEqual(r2, { txHash: '0xabc' });
});

test('JOURNAL-B: different request under same logical operation → idempotency conflict', async () => {
  const db = simpleDB();
  const req1 = hashJSON({ amount: '1000000' });
  const req2 = hashJSON({ amount: '2000000' });

  await jobOperation(db, 'run2', 'fund', { amount: '1000000' }, async () => ({ txHash: '0xabc' }));
  assert.throws(
    () => existingOperation({ request_hash: req1, state: 'CONFIRMED', result: { txHash: '0xabc' } }, req2),
    /IDEMPOTENCY_CONFLICT/
  );
});

test('JOURNAL-C: first failure records RECONCILIATION_REQUIRED, second call blocked', async () => {
  const db = simpleDB();
  await assert.rejects(
    jobOperation(db, 'run3', 'fund', { amount: '1' }, async () => { throw new Error('TIMEOUT'); }),
    /TIMEOUT/
  );
  // Retry without reconciler still blocks because state is RECONCILIATION_REQUIRED
  await assert.rejects(
    jobOperation(db, 'run3', 'fund', { amount: '1' }, async () => ({})),
    /RECONCILIATION/
  );
});

test('JOURNAL-C2: a failed operation records only a safe diagnostic code', async () => {
  const db = simpleDB();
  await assert.rejects(
    jobOperation(db, 'run-safe-code', 'create', { spec: 'v1' }, async () => { throw new Error('https://user:secret@example.test failed'); }),
    /JOB_RECONCILIATION_REQUIRED/
  );
  const stored = await db.query('SELECT * FROM job_operations WHERE job_run_id=$1 AND operation=$2', ['run-safe-code', 'create']);
  assert.deepEqual(stored.rows[0].result, { failureCode: 'DEPENDENCY_OR_OPERATION_UNAVAILABLE' });
});

test('JOURNAL-D: different operations on same run are independent', async () => {
  const db = simpleDB();
  const r1 = await jobOperation(db, 'run4', 'create', { spec: 'v1' }, async () => ({ jobId: '1' }));
  const r2 = await jobOperation(db, 'run4', 'budget', { amount: '1000000' }, async () => ({ txHash: '0xbudget' }));
  assert.deepEqual(r1, { jobId: '1' });
  assert.deepEqual(r2, { txHash: '0xbudget' });
});

test('JOURNAL-E: request hash is computed from full request, not partial', () => {
  const req1 = { amount: '1000000', jobId: '1' };
  const req2 = { amount: '1000000' };
  assert.notEqual(hashJSON(req1), hashJSON(req2));
});

test('JOURNAL-F: CONFIRMED state returns cached result without re-execution', async () => {
  const db = simpleDB();
  await jobOperation(db, 'run5', 'create', { spec: 'v1' }, async () => ({ jobId: '1', txHash: '0xcreate' }));
  const cached = await jobOperation(db, 'run5', 'create', { spec: 'v1' }, async () => { throw new Error('SHOULD_NOT_RUN'); });
  assert.deepEqual(cached, { jobId: '1', txHash: '0xcreate' });
});
