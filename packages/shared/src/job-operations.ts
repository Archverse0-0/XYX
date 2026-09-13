import { randomUUID } from 'node:crypto';
import { hashJSON } from './index.js';
import type { DB } from './storage.js';
import type { ProtectedJobReconciler, ReconciliationResult } from './reconciler.js';

export type { OperationRow } from './reconciler.js';

/**
 * Durable identifiers returned while an external economic operation is in
 * progress.  The external identifier is intentionally separate from the
 * eventual chain transaction hash: Circle returns the former before Arc may
 * have mined the latter.
 */
export type OperationProgress = {
  externalOperationId?: string;
  txHash?: string;
};

export type OperationProgressReporter = (progress: OperationProgress) => Promise<void>;

function safeFailureCode(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  // Store only an intentional machine code. Network/SDK errors can include
  // endpoints, SQL fragments, or credentials and must never enter the journal.
  return /^[A-Z][A-Z0-9_]{2,127}$/.test(message) ? message : 'DEPENDENCY_OR_OPERATION_UNAVAILABLE';
}

export function existingOperation(row: { state: string; request_hash: string; result: unknown }, requestHash: string): unknown {
  if (row.request_hash !== requestHash) throw new Error('IDEMPOTENCY_CONFLICT');
  if (row.state !== 'CONFIRMED') throw new Error('JOB_RECONCILIATION_REQUIRED');
  return row.result;
}

// Attempt reconciliation using canonical Arc/ERC-8183 state.
// Returns the reconciliation result or throws if still ambiguous.
export async function reconcileOperation(
  reconciler: ProtectedJobReconciler | null,
  fullRow: Record<string, unknown>,
  requestHash: string
): Promise<ReconciliationResult> {
  if (!fullRow) return { status: 'STILL_AMBIGUOUS' };

  // Idempotency conflict: different request commitment
  if (fullRow.request_hash !== requestHash) {
    return { status: 'CANONICAL_CONFLICT', detail: 'IDEMPOTENCY_CONFLICT' };
  }

  // Already confirmed — return cached result
  if (fullRow.state === 'CONFIRMED') {
    const parsed = typeof fullRow.result === 'string' ? JSON.parse(fullRow.result) : fullRow.result;
    return { status: 'RECOVERED_CONFIRMED', result: parsed };
  }

  // Try reconciliation if we have a reconciler
  if (reconciler) {
    try {
      return await reconciler.reconcile(fullRow as import('./reconciler.js').OperationRow, requestHash);
    } catch (error) {
      if (error instanceof Error && error.message === 'IDEMPOTENCY_CONFLICT') throw error;
      // Dependency/read failures remain ambiguous and must never trigger a retry.
      return { status: 'STILL_AMBIGUOUS' };
    }
  }

  return { status: 'STILL_AMBIGUOUS' };
}

// Persist BEFORE an external mutation. An interrupted operation is not retryable
// unless canonical state inspection proves the outcome.
export async function jobOperation<T>(
  db: DB,
  runId: string,
  operation: string,
  request: unknown,
  execute: (idempotencyKey: string, reportProgress: OperationProgressReporter) => Promise<T>,
  reconciler?: ProtectedJobReconciler
): Promise<T> {
  const requestHash = hashJSON(request);
  const inserted = await db.query(
    `INSERT INTO job_operations(id,job_run_id,operation,request_hash,state,canonical_snapshot)
     VALUES($1,$2,$3,$4,'IN_FLIGHT',$5) ON CONFLICT(job_run_id,operation) DO NOTHING RETURNING id`,
    [randomUUID(), runId, operation, requestHash, JSON.stringify(request)]
  );
  if (!inserted.rowCount) {
    const { rows } = await db.query(
      'SELECT * FROM job_operations WHERE job_run_id=$1 AND operation=$2',
      [runId, operation]
    );
    const row = rows[0];
    if (!row) throw new Error('JOB_RECONCILIATION_REQUIRED');

    // Try reconciliation before blocking
    const reconciliation = await reconcileOperation(reconciler ?? null, row, requestHash);
    switch (reconciliation.status) {
      case 'RECOVERED_CONFIRMED':
        return reconciliation.result as T;
      case 'SAFE_TO_RETRY':
        // Create has no automatic rebroadcast path, even if a future/custom
        // reconciler accidentally returns a permissive classification.
        if (operation === 'create') throw new Error('JOB_RECONCILIATION_REQUIRED');
        // Clear the old operation and allow a fresh attempt
        await db.query('DELETE FROM job_operations WHERE id=$1', [row.id]);
        break; // Fall through to new insert below
      case 'CANONICAL_CONFLICT':
        throw new Error(`JOB_CANONICAL_CONFLICT:${reconciliation.detail}`);
      case 'STILL_AMBIGUOUS':
      default:
        throw new Error('JOB_RECONCILIATION_REQUIRED');
    }
  }

  // For SAFE_TO_RETRY, we may have deleted the old operation and need to re-insert
  const id: string = (inserted.rows?.[0]?.id as string | undefined) ?? randomUUID();
  if (!inserted.rowCount) {
    const retried = await db.query(
      `INSERT INTO job_operations(id,job_run_id,operation,request_hash,state,canonical_snapshot)
       VALUES($1,$2,$3,$4,'IN_FLIGHT',$5) ON CONFLICT(job_run_id,operation) DO NOTHING RETURNING id`,
      [id, runId, operation, requestHash, JSON.stringify(request)]
    );
    if (retried.rowCount !== 1) throw new Error('JOB_BUSY');
  }

  const reportProgress: OperationProgressReporter = async ({ externalOperationId, txHash }) => {
    if (!externalOperationId && !txHash) return;
    if (externalOperationId !== undefined && (!externalOperationId.trim() || externalOperationId.length > 256)) throw new Error('INVALID_OPERATION_PROGRESS');
    if (txHash !== undefined && !/^0x[0-9a-fA-F]{64}$/.test(txHash)) throw new Error('INVALID_OPERATION_PROGRESS');
    const saved = await db.query(
      `UPDATE job_operations SET
        external_operation_id = COALESCE($2, external_operation_id),
        tx_hash = COALESCE($3, tx_hash),
        broadcast_at = CASE WHEN $3 IS NOT NULL THEN COALESCE(broadcast_at, now()) ELSE broadcast_at END,
        updated_at = now()
       WHERE id = $1 AND state='IN_FLIGHT'
         AND (external_operation_id IS NULL OR $2 IS NULL OR external_operation_id=$2)
         AND (tx_hash IS NULL OR $3 IS NULL OR lower(tx_hash)=lower($3))`,
      [id, externalOperationId ?? null, txHash ?? null],
    );
    if (saved.rowCount !== 1) throw new Error('OPERATION_PROGRESS_NOT_PERSISTED');
  };

  try {
    const result = await execute(id, reportProgress);
    const confirmed = await db.query(
      "UPDATE job_operations SET state='CONFIRMED',result=$2,confirmed_at=now(),updated_at=now() WHERE id=$1",
      [id, JSON.stringify(result)]
    );
    if (confirmed.rowCount !== 1) throw new Error('OPERATION_CONFIRMATION_NOT_PERSISTED');
    return result;
  } catch (error) {
    await db.query(
      "UPDATE job_operations SET state='RECONCILIATION_REQUIRED',result=COALESCE(result,$2::jsonb),updated_at=now() WHERE id=$1",
      [id, JSON.stringify({ failureCode: safeFailureCode(error) })]
    );
    if (operation === 'create') throw new Error('JOB_RECONCILIATION_REQUIRED', { cause: error });
    throw error;
  }
}

export async function withJobLock<T>(db: DB, runId: string, action: () => Promise<T>): Promise<T> {
  const connection = await db.connect();
  let acquired = false;
  try {
    acquired = Boolean((await connection.query('SELECT pg_try_advisory_lock(hashtextextended($1,1)) AS acquired', [runId])).rows[0].acquired);
    if (!acquired) throw new Error('JOB_BUSY');
    return await action();
  } finally {
    try { if (acquired) await connection.query('SELECT pg_advisory_unlock(hashtextextended($1,1))', [runId]); }
    finally { connection.release(); }
  }
}
