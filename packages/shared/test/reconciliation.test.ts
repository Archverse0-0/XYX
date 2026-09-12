import test from 'node:test';
import assert from 'node:assert/strict';
import { hashJSON } from '../src/index.js';
import { jobOperation, existingOperation } from '../src/job-operations.js';
import type { DB } from '../src/storage.js';
import type { ProtectedJobReconciler, OperationRow } from '../src/reconciler.js';

// ═══════════════════════════════════════════════════════════════
// In-memory DB double for reconciliation tests
// ═══════════════════════════════════════════════════════════════
function testDB(runJobId?: string) {
  const operations = new Map<string, {
    id: string; state: string; request_hash: string; result: unknown;
    canonical_snapshot: string; tx_hash: string | null;
    reconciliation_attempts: number;
  }>();
  let nextId = 1;

  const db = {
    query: async (sql: string, args: unknown[]) => {
      // INSERT INTO job_operations
      if (sql.includes('INSERT INTO job_operations') && sql.includes('VALUES')) {
        const runId = args[1] as string, op = args[2] as string, reqHash = args[3] as string;
        const key = `${runId}:${op}`;
        if (operations.has(key)) return { rowCount: 0, rows: [] };
        const id = `op-${nextId++}`;
        const row = { id, state: 'IN_FLIGHT', request_hash: reqHash, result: null, canonical_snapshot: args[4] as string, tx_hash: null, reconciliation_attempts: 0 };
        operations.set(key, row);
        return { rowCount: 1, rows: [row] };
      }
      // SELECT * FROM job_operations WHERE job_run_id=$1 AND operation=$2
      if (sql.includes('SELECT * FROM job_operations') && sql.includes('operation=$2')) {
        const key = `${args[0]}:${args[1]}`;
        const row = operations.get(key);
        if (row) return { rowCount: 1, rows: [{ ...row, operation: args[1] as string, job_run_id: args[0] as string }] };
        return { rowCount: 0, rows: [] };
      }
      // SELECT * FROM job_operations WHERE id=$1
      if (sql.includes('SELECT * FROM job_operations') && sql.includes('id=$1')) {
        for (const row of operations.values()) { if (row.id === args[0]) return { rowCount: 1, rows: [row] }; }
        return { rowCount: 0, rows: [] };
      }
      // UPDATE job_operations SET state='CONFIRMED'
      if (sql.includes("state='CONFIRMED'") && sql.includes('UPDATE job_operations')) {
        for (const row of operations.values()) {
          if (row.id === args[0]) { row.state = 'CONFIRMED'; row.result = JSON.parse(args[1] as string); break; }
        }
        return { rowCount: 1, rows: [] };
      }
      // UPDATE job_operations SET state='RECONCILIATION_REQUIRED'
      if (sql.includes("state='RECONCILIATION_REQUIRED'")) {
        for (const row of operations.values()) {
          if (row.id === args[0]) { row.state = 'RECONCILIATION_REQUIRED'; break; }
        }
        return { rowCount: 1, rows: [] };
      }
      // UPDATE job_operations SET reconciliation_attempts
      if (sql.includes('reconciliation_attempts')) {
        return { rowCount: 1, rows: [] };
      }
      // DELETE FROM job_operations
      if (sql.includes('DELETE FROM job_operations')) {
        const key = `${args[0]}:${args[1]}`;
        operations.delete(key);
        return { rowCount: 1, rows: [] };
      }
      // SELECT * FROM protected_job_runs WHERE id=$1
      if (sql.includes('protected_job_runs') && sql.includes('id=$1')) {
        return { rowCount: 1, rows: [{ job_id: runJobId ?? '123' }] };
      }
      return { rowCount: 0, rows: [] };
    },
    connect: async () => ({
      query: async () => ({ rows: [] }),
      release: () => {},
    }),
  } as unknown as DB;

  return { db, operations };
}

// ═══════════════════════════════════════════════════════════════
// Mock reconciler that fakes canonical state inspection
// Models production markConfirmed behavior: updates mock DB when returning RECOVERED_CONFIRMED
// ═══════════════════════════════════════════════════════════════
function mockReconciler(canonical: Record<string, unknown>, operations?: Map<string, { id: string; state: string; result: unknown; request_hash: string; canonical_snapshot: string; tx_hash: string | null; reconciliation_attempts: number }>) {
  return {
    reconcile: async (row: OperationRow, requestHash: string) => {
      if (row.request_hash !== requestHash) return { status: 'CANONICAL_CONFLICT' as const, detail: 'IDEMPOTENCY_CONFLICT' };
      if (row.state === 'CONFIRMED') return { status: 'RECOVERED_CONFIRMED' as const, result: row.result };

      const snap = JSON.parse(row.canonical_snapshot as string ?? '{}');

      // Helper: mark operation as confirmed in mock DB (models production markConfirmed)
      const markConfirmed = (result: unknown) => {
        if (operations) {
          for (const op of operations.values()) {
            if (op.id === row.id) { op.state = 'CONFIRMED'; op.result = result; break; }
          }
        }
      };

      switch (row.operation) {
        case 'fund':
          if (canonical.jobStatus === 1) { const result = { funded: true }; markConfirmed(result); return { status: 'RECOVERED_CONFIRMED' as const, result }; }
          if (canonical.jobStatus === 0) return { status: 'SAFE_TO_RETRY' as const };
          return { status: 'CANONICAL_CONFLICT' as const, detail: `Job status ${canonical.jobStatus}` };

        case 'submit':
          if (canonical.submittedDeliverable === snap.deliverableHash) {
            const result = { submitted: true }; markConfirmed(result); return { status: 'RECOVERED_CONFIRMED' as const, result };
          }
          if (canonical.submittedDeliverable) return { status: 'CANONICAL_CONFLICT' as const, detail: 'Deliverable mismatch' };
          return { status: 'SAFE_TO_RETRY' as const };

        case 'evaluate':
          if (canonical.jobStatus === 3) { const result = { decision: 1 }; markConfirmed(result); return { status: 'RECOVERED_CONFIRMED' as const, result }; }
          if (canonical.jobStatus === 4) { const result = { decision: 2 }; markConfirmed(result); return { status: 'RECOVERED_CONFIRMED' as const, result }; }
          if (canonical.jobStatus === 2) return { status: 'SAFE_TO_RETRY' as const };
          return { status: 'STILL_AMBIGUOUS' as const };

        case 'budget':
          // Compare as BigInt to handle string/number type differences (matches production reconciler)
          if (BigInt(canonical.budget as number) === BigInt(snap.amount)) { const result = { budgetSet: true }; markConfirmed(result); return { status: 'RECOVERED_CONFIRMED' as const, result }; }
          if (canonical.budget === 0 || canonical.budget === '0') return { status: 'SAFE_TO_RETRY' as const };
          return { status: 'CANONICAL_CONFLICT' as const, detail: `Budget ${canonical.budget} != ${snap.amount}` };

        case 'create':
          return { status: 'STILL_AMBIGUOUS' as const };

        default:
          return { status: 'STILL_AMBIGUOUS' as const };
      }
    }
  } as unknown as ProtectedJobReconciler;
}

// ═══════════════════════════════════════════════════════════════
// A. Fund crash: FUNDED on Arc → recovered, no double fund
// ═══════════════════════════════════════════════════════════════
test('A. Fund crash recovery: canonical FUNDED → RECOVERED_CONFIRMED', async () => {
  const { db, operations } = testDB();
  const reconciler = mockReconciler({ jobStatus: 1 }, operations);

  // First attempt fails
  await assert.rejects(
    jobOperation(db, 'run-fund', 'fund', { amount: '1000000' }, async () => { throw new Error('TIMEOUT'); }, reconciler),
    /TIMEOUT/
  );
  assert.equal(operations.get('run-fund:fund')?.state, 'RECONCILIATION_REQUIRED');

  // Retry: reconciler finds FUNDED → recovered
  const result = await jobOperation(db, 'run-fund', 'fund', { amount: '1000000' }, async () => { throw new Error('SHOULD_NOT_RUN'); }, reconciler);
  assert.deepEqual(result, { funded: true });
  assert.equal(operations.get('run-fund:fund')?.state, 'CONFIRMED');
});

// ═══════════════════════════════════════════════════════════════
// B. Submit crash: JobSubmitted event with matching hash → recovered
// ═══════════════════════════════════════════════════════════════
test('B. Submit crash recovery: matching deliverable hash → RECOVERED_CONFIRMED', async () => {
  const { db, operations } = testDB();
  const dh = hashJSON({ answer: 42 });
  const reconciler = mockReconciler({ submittedDeliverable: dh }, operations);

  await assert.rejects(
    jobOperation(db, 'run-submit', 'submit', { deliverableHash: dh }, async () => { throw new Error('NETWORK_LOST'); }, reconciler),
    /NETWORK_LOST/
  );

  const result = await jobOperation(db, 'run-submit', 'submit', { deliverableHash: dh }, async () => { throw new Error('SHOULD_NOT_RUN'); }, reconciler);
  assert.deepEqual(result, { submitted: true });
  assert.equal(operations.get('run-submit:submit')?.state, 'CONFIRMED');
});

// ═══════════════════════════════════════════════════════════════
// C. Resolution crash: COMPLETE (3) on Arc → recovered, no duplicate verdict
// ═══════════════════════════════════════════════════════════════
test('C. Resolution crash recovery: COMPLETE → RECOVERED_CONFIRMED', async () => {
  const { db, operations } = testDB();
  const reconciler = mockReconciler({ jobStatus: 3 }, operations);

  await assert.rejects(
    jobOperation(db, 'run-eval', 'evaluate', { specHash: '0x123', deliverableHash: '0x456' }, async () => { throw new Error('BROADCAST_LOST'); }, reconciler),
    /BROADCAST_LOST/
  );

  const result = await jobOperation(db, 'run-eval', 'evaluate', { specHash: '0x123', deliverableHash: '0x456' }, async () => { throw new Error('SHOULD_NOT_RUN'); }, reconciler);
  assert.deepEqual(result, { decision: 1 });
  assert.equal(operations.get('run-eval:evaluate')?.state, 'CONFIRMED');
});

// ═══════════════════════════════════════════════════════════════
// D. Canonical conflict: DB expects 1M, Arc has 5M → explicit conflict
// ═══════════════════════════════════════════════════════════════
test('D. Canonical conflict: budget mismatch → CANONICAL_CONFLICT', async () => {
  const { db } = testDB();
  const reconciler = mockReconciler({ budget: 5000000 });

  await assert.rejects(
    jobOperation(db, 'run-budget-conflict', 'budget', { amount: '1000000' }, async () => { throw new Error('TIMEOUT'); }, reconciler),
    /TIMEOUT/
  );

  await assert.rejects(
    jobOperation(db, 'run-budget-conflict', 'budget', { amount: '1000000' }, async () => { throw new Error('NOPE'); }, reconciler),
    /CANONICAL_CONFLICT/
  );
});

// ═══════════════════════════════════════════════════════════════
// E. Still ambiguous: no canonical proof → blocks
// ═══════════════════════════════════════════════════════════════
test('E. Still ambiguous: no canonical proof → RECONCILIATION_REQUIRED', async () => {
  const { db } = testDB();
  const reconciler = mockReconciler({});

  await assert.rejects(
    jobOperation(db, 'run-ambig', 'evaluate', { x: 1 }, async () => { throw new Error('ERR'); }, reconciler),
    /ERR/
  );

  await assert.rejects(
    jobOperation(db, 'run-ambig', 'evaluate', { x: 1 }, async () => { throw new Error('NOPE'); }, reconciler),
    /RECONCILIATION_REQUIRED/
  );
});

// ═══════════════════════════════════════════════════════════════
// F. Idempotency conflict: different request hash → CANONICAL_CONFLICT
// ═══════════════════════════════════════════════════════════════
test('F. Idempotency conflict: different request hash → CANONICAL_CONFLICT', async () => {
  const { db } = testDB();
  const reconciler = mockReconciler({});

  await jobOperation(db, 'run-idem', 'create', { spec: 'v1' }, async () => ({ jobId: '123' }), reconciler);

  await assert.rejects(
    jobOperation(db, 'run-idem', 'create', { spec: 'v2' }, async () => { throw new Error('NOPE'); }, reconciler),
    /CANONICAL_CONFLICT|IDEMPOTENCY_CONFLICT/
  );
});

// ═══════════════════════════════════════════════════════════════
// G. Fund canonical conflict: already SUBMITTED → CANONICAL_CONFLICT
// ═══════════════════════════════════════════════════════════════
test('G. Fund canonical conflict: SUBMITTED (2) → CANONICAL_CONFLICT', async () => {
  const { db } = testDB();
  const reconciler = mockReconciler({ jobStatus: 2 });

  await assert.rejects(
    jobOperation(db, 'run-fc', 'fund', { amount: '1000000' }, async () => { throw new Error('TIMEOUT'); }, reconciler),
    /TIMEOUT/
  );

  await assert.rejects(
    jobOperation(db, 'run-fc', 'fund', { amount: '1000000' }, async () => { throw new Error('NOPE'); }, reconciler),
    /CANONICAL_CONFLICT/
  );
});

// ═══════════════════════════════════════════════════════════════
// H. SAFE_TO_RETRY actually retries
// ═══════════════════════════════════════════════════════════════
test('H. SAFE_TO_RETRY: CREATED (0) → clears old op, retries execute', async () => {
  const { db, operations } = testDB();
  const reconciler = mockReconciler({ jobStatus: 0 });

  await assert.rejects(
    jobOperation(db, 'run-retry', 'fund', { amount: '1000000' }, async () => { throw new Error('TIMEOUT'); }, reconciler),
    /TIMEOUT/
  );
  assert.equal(operations.has('run-retry:fund'), true);

  let ran = false;
  const result = await jobOperation(db, 'run-retry', 'fund', { amount: '1000000' }, async () => { ran = true; return { txHash: '0xab' }; }, reconciler);
  assert.equal(ran, true);
  assert.deepEqual(result, { txHash: '0xab' });
});

// ═══════════════════════════════════════════════════════════════
// I. Submit deliverable mismatch → CANONICAL_CONFLICT
// ═══════════════════════════════════════════════════════════════
test('I. Submit deliverable mismatch → CANONICAL_CONFLICT', async () => {
  const { db } = testDB();
  const expected = hashJSON({ a: 1 });
  const actual = hashJSON({ a: 2 });
  const reconciler = mockReconciler({ submittedDeliverable: actual });

  await assert.rejects(
    jobOperation(db, 'run-sm', 'submit', { deliverableHash: expected }, async () => { throw new Error('TIMEOUT'); }, reconciler),
    /TIMEOUT/
  );

  await assert.rejects(
    jobOperation(db, 'run-sm', 'submit', { deliverableHash: expected }, async () => { throw new Error('NOPE'); }, reconciler),
    /CANONICAL_CONFLICT/
  );
});

// ═══════════════════════════════════════════════════════════════
// J. No reconciler: still blocks on RECONCILIATION_REQUIRED
// ═══════════════════════════════════════════════════════════════
test('J. No reconciler: without reconciler, retry blocks', async () => {
  const { db } = testDB();

  await assert.rejects(
    jobOperation(db, 'run-no-rec', 'fund', { amount: '1000000' }, async () => { throw new Error('TIMEOUT'); }),
    /TIMEOUT/
  );

  await assert.rejects(
    jobOperation(db, 'run-no-rec', 'fund', { amount: '1000000' }, async () => { throw new Error('NOPE'); }),
    /RECONCILIATION_REQUIRED/
  );
});

// ═══════════════════════════════════════════════════════════════
// K. Budget recovery: budget matches → recovered
// ═══════════════════════════════════════════════════════════════
test('K. Budget recovery: matches → RECOVERED_CONFIRMED', async () => {
  const { db, operations } = testDB();
  const reconciler = mockReconciler({ budget: 1000000 }, operations);

  await assert.rejects(
    jobOperation(db, 'run-br', 'budget', { amount: '1000000' }, async () => { throw new Error('TIMEOUT'); }, reconciler),
    /TIMEOUT/
  );

  const result = await jobOperation(db, 'run-br', 'budget', { amount: '1000000' }, async () => { throw new Error('NOPE'); }, reconciler);
  assert.deepEqual(result, { budgetSet: true });
});

// ═══════════════════════════════════════════════════════════════
// L. Evaluate REJECTED (4) → decision=2
// ═══════════════════════════════════════════════════════════════
test('L. Evaluate REJECTED: status 4 → decision=2', async () => {
  const { db } = testDB();
  const reconciler = mockReconciler({ jobStatus: 4 });

  await assert.rejects(
    jobOperation(db, 'run-er', 'evaluate', { s: '1' }, async () => { throw new Error('TIMEOUT'); }, reconciler),
    /TIMEOUT/
  );

  const result = await jobOperation(db, 'run-er', 'evaluate', { s: '1' }, async () => { throw new Error('NOPE'); }, reconciler);
  assert.deepEqual(result, { decision: 2 });
});

// ═══════════════════════════════════════════════════════════════
// M. existingOperation: confirmed returns cached, in-flight blocks
// ═══════════════════════════════════════════════════════════════
test('M. existingOperation: confirmed → returns result', () => {
  const rh = hashJSON({ amount: '1000000' });
  const r = existingOperation({ state: 'CONFIRMED', request_hash: rh, result: { ok: true } }, rh);
  assert.deepEqual(r, { ok: true });
});

test('M2. existingOperation: RECONCILIATION_REQUIRED → throws', () => {
  const rh = hashJSON({ amount: '1000000' });
  assert.throws(
    () => existingOperation({ state: 'RECONCILIATION_REQUIRED', request_hash: rh, result: null }, rh),
    /RECONCILIATION/
  );
});

// ═══════════════════════════════════════════════════════════════
// N. Multiple operations on same run are independent
// ═══════════════════════════════════════════════════════════════
test('N. Budget failure does not block approve', async () => {
  const { db } = testDB();
  const reconciler = mockReconciler({ budget: 0 });

  await assert.rejects(
    jobOperation(db, 'run-multi', 'budget', { amount: '1000000' }, async () => { throw new Error('TIMEOUT'); }, reconciler),
    /TIMEOUT/
  );

  const result = await jobOperation(db, 'run-multi', 'approve', { amount: '1000000' }, async () => ({ approved: true }), reconciler);
  assert.deepEqual(result, { approved: true });
});

// ═══════════════════════════════════════════════════════════════
// O. Fund CANONICAL_CONFLICT is not retriable
// ═══════════════════════════════════════════════════════════════
test('O. Fund conflict not retriable: CANONICAL_CONFLICT persists', async () => {
  const { db } = testDB();
  const reconciler = mockReconciler({ jobStatus: 5 });

  await assert.rejects(
    jobOperation(db, 'run-fc2', 'fund', { amount: '1000000' }, async () => { throw new Error('TIMEOUT'); }, reconciler),
    /TIMEOUT/
  );

  // Second attempt: same conflict
  await assert.rejects(
    jobOperation(db, 'run-fc2', 'fund', { amount: '1000000' }, async () => { throw new Error('NOPE'); }, reconciler),
    /CANONICAL_CONFLICT/
  );
});

// ═══════════════════════════════════════════════════════════════
// P. Submit SAFE_TO_RETRY then success
// ═══════════════════════════════════════════════════════════════
test('P. Submit SAFE_TO_RETRY: not yet submitted → retries', async () => {
  const { db } = testDB();
  const dh = hashJSON({ x: 99 });
  const reconciler = mockReconciler({});  // No submittedDeliverable = not submitted

  await assert.rejects(
    jobOperation(db, 'run-st', 'submit', { deliverableHash: dh }, async () => { throw new Error('TIMEOUT'); }, reconciler),
    /TIMEOUT/
  );

  const result = await jobOperation(db, 'run-st', 'submit', { deliverableHash: dh }, async () => ({ txHash: '0xcc' }), reconciler);
  assert.deepEqual(result, { txHash: '0xcc' });
});
