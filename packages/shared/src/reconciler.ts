import { z } from 'zod';
import { decodeEventLog, type Address, type Hex } from 'viem';
import { arcClient } from './chain.js';
import { atomicAmount, hashJSON, hex32 } from './index.js';
import { commerceAbi, chainJobSchema, jobEvent } from '../../erc8183/service.js';
import { assertJobBudget, createJobSchema, jobIdSchema } from './jobs.js';
import type { DB } from './storage.js';
import { evaluatorAbi } from './abi.js';

// Canonical state inspection for deterministic crash recovery.
// Each operation type has different canonical evidence on Arc/ERC-8183.

export type ReconciliationResult =
  | { status: 'RECOVERED_CONFIRMED'; result: unknown }
  | { status: 'SAFE_TO_RETRY' }
  | { status: 'STILL_AMBIGUOUS' }
  | { status: 'CANONICAL_CONFLICT'; detail: string };

export type OperationRow = {
  id: string;
  job_run_id: string;
  operation: string;
  request_hash: string;
  state: string;
  result: unknown;
  external_operation_id: string | null;
  tx_hash: string | null;
  broadcast_at: Date | null;
  confirmed_at: Date | null;
  reconciliation_attempts: number;
  last_reconciliation_at: Date | null;
  canonical_snapshot: unknown;
};

function jsonValue(value: unknown): unknown {
  return typeof value === 'string' ? JSON.parse(value) : value;
}

export class ProtectedJobReconciler {
  readonly client: ReturnType<typeof arcClient>;

  constructor(
    readonly db: DB,
    readonly rpc: string,
    readonly commerceAddress: Address,
    readonly evaluatorAddress: Address,
    readonly walletAddress: Address,
  ) {
    this.client = arcClient(rpc);
  }

  // Main reconciliation entry point.
  // Inspects canonical Arc/ERC-8183 state to determine operation outcome.
  async reconcile(row: OperationRow, expectedRequestHash: string): Promise<ReconciliationResult> {
    // Idempotency conflict: different request commitment for same operation
    if (row.request_hash !== expectedRequestHash) {
      return { status: 'CANONICAL_CONFLICT', detail: 'IDEMPOTENCY_CONFLICT' };
    }

    // Already confirmed — just return cached result
    if (row.state === 'CONFIRMED') {
      return { status: 'RECOVERED_CONFIRMED', result: row.result };
    }

    // Increment reconciliation attempt counter
    await this.db.query(
      `UPDATE job_operations SET reconciliation_attempts = reconciliation_attempts + 1, last_reconciliation_at = now() WHERE id = $1`,
      [row.id]
    );

    // Dispatch to operation-specific reconciler
    switch (row.operation) {
      case 'create': return this.reconcileCreate(row);
      case 'budget': return this.reconcileBudget(row);
      case 'approve': return this.reconcileApprove(row);
      case 'fund': return this.reconcileFund(row);
      case 'submit': return this.reconcileSubmit(row);
      case 'evaluate': return this.reconcileEvaluate(row);
      case 'refund': return this.reconcileRefund(row);
      default: return { status: 'STILL_AMBIGUOUS' };
    }
  }

  // CREATE recovery:
  // Canonical: ERC-8183 job state (getJob)
  // If job exists with matching client/provider/evaluator/expiry → CONFIRMED
  // If job doesn't exist → STILL_AMBIGUOUS (can't safely retry without knowing if tx was broadcast)
  // If job exists with different params → CANONICAL_CONFLICT
  private async reconcileCreate(row: OperationRow): Promise<ReconciliationResult> {
    const spec = createJobSchema.parse(jsonValue(row.canonical_snapshot));
    if (!spec) return { status: 'STILL_AMBIGUOUS' };

    // If we have a tx hash, try to find the JobCreated event
    if (row.tx_hash) {
      try {
        const receipt = await this.client.getTransactionReceipt({ hash: row.tx_hash as Hex });
        if (receipt.status === 'success') {
          const event = jobEvent(receipt.logs, this.commerceAddress, 'JobCreated');
          if (
            String(event.client).toLowerCase() === this.walletAddress.toLowerCase() &&
            String(event.provider).toLowerCase() === spec.provider.toLowerCase() &&
            String(event.evaluator).toLowerCase() === this.evaluatorAddress.toLowerCase()
          ) {
            const result = { jobId: String(event.jobId), txHash: row.tx_hash };
            await this.markConfirmed(row.id, result);
            return { status: 'RECOVERED_CONFIRMED', result };
          }
        }
      } catch { /* tx may not exist yet */ }
    }

    // Try to read job state if we have a jobId from a previous partial save
    // But without a jobId, we can't read the job state
    // This is the fundamental ambiguity: we may have broadcast but not persisted the tx hash or job ID
    return { status: 'STILL_AMBIGUOUS' };
  }

  // BUDGET recovery:
  // Canonical: ERC-8183 getJob(jobId).budget
  // If budget equals expected amount → CONFIRMED
  // If budget is 0 (not set) → SAFE_TO_RETRY
  // If budget is different → CANONICAL_CONFLICT
  private async reconcileBudget(row: OperationRow): Promise<ReconciliationResult> {
    const run = await this.getRun(row.job_run_id);
    if (!run?.job_id) return { status: 'STILL_AMBIGUOUS' };

    const expected = z.object({ amount: z.string().regex(/^\d+$/) }).parse(jsonValue(row.canonical_snapshot));
    try {
      const job = chainJobSchema.parse(await this.client.readContract({
        address: this.commerceAddress,
        abi: commerceAbi,
        functionName: 'getJob',
        args: [BigInt(jobIdSchema.parse(String(run.job_id)))],
      }));

      const expectedAtomic = BigInt(expected.amount);
      if (job.budget === expectedAtomic) {
        const result = row.tx_hash ? { txHash: row.tx_hash } : { budgetSet: true };
        await this.markConfirmed(row.id, result);
        return { status: 'RECOVERED_CONFIRMED', result };
      }

      if (job.budget === 0n) {
        return { status: 'SAFE_TO_RETRY' };
      }

      return { status: 'CANONICAL_CONFLICT', detail: `Budget onchain: ${job.budget}, expected: ${expectedAtomic}` };
    } catch {
      return { status: 'STILL_AMBIGUOUS' };
    }
  }

  // APPROVE recovery:
  // ERC-20 allowance is shared mutable state.
  // We CANNOT safely infer our approve succeeded from current allowance.
  // If we have a tx hash, check the transaction receipt.
  // Otherwise → STILL_AMBIGUOUS.
  private async reconcileApprove(row: OperationRow): Promise<ReconciliationResult> {
    if (!row.tx_hash) {
      // Without a tx hash, we cannot determine if the approve was broadcast.
      // The allowance may have been changed by another operation.
      // Keep blocked.
      return { status: 'STILL_AMBIGUOUS' };
    }

    try {
      const receipt = await this.client.getTransactionReceipt({ hash: row.tx_hash as Hex });
      if (receipt.status === 'success') {
        const result = { txHash: row.tx_hash, approved: true };
        await this.markConfirmed(row.id, result);
        return { status: 'RECOVERED_CONFIRMED', result };
      }
      // Transaction failed onchain — safe to retry
      return { status: 'SAFE_TO_RETRY' };
    } catch {
      return { status: 'STILL_AMBIGUOUS' };
    }
  }

  // FUND recovery:
  // Canonical: ERC-8183 job.status
  // If status is 1 (FUNDED) → CONFIRMED
  // If status is 0 (CREATED) → SAFE_TO_RETRY
  // If status is 2+ (SUBMITTED+) → CANONICAL_CONFLICT
  private async reconcileFund(row: OperationRow): Promise<ReconciliationResult> {
    const run = await this.getRun(row.job_run_id);
    if (!run?.job_id) return { status: 'STILL_AMBIGUOUS' };

    try {
      const job = chainJobSchema.parse(await this.client.readContract({
        address: this.commerceAddress,
        abi: commerceAbi,
        functionName: 'getJob',
        args: [BigInt(jobIdSchema.parse(String(run.job_id)))],
      }));

      if (job.status === 1) {
        // Already funded — recover
        const result = { txHash: row.tx_hash, funded: true };
        await this.markConfirmed(row.id, result);
        return { status: 'RECOVERED_CONFIRMED', result };
      }

      if (job.status === 0) {
        // Not funded yet — safe to retry
        return { status: 'SAFE_TO_RETRY' };
      }

      // Status is 2+ (SUBMITTED, COMPLETE, REJECTED) — conflict
      return { status: 'CANONICAL_CONFLICT', detail: `Job status ${job.status} is beyond FUNDED` };
    } catch {
      return { status: 'STILL_AMBIGUOUS' };
    }
  }

  // SUBMIT recovery:
  // Canonical: ERC-8183 JobSubmitted event
  // If event exists with matching deliverable hash → CONFIRMED
  // If event exists with different hash → CANONICAL_CONFLICT
  // If no event → check if we have tx hash
  private async reconcileSubmit(row: OperationRow): Promise<ReconciliationResult> {
    const run = await this.getRun(row.job_run_id);
    if (!run?.job_id) return { status: 'STILL_AMBIGUOUS' };

    const expected = z.object({ deliverableHash: hex32 }).passthrough().parse(jsonValue(row.canonical_snapshot));

    // If we have a tx hash, check for JobSubmitted event
    if (row.tx_hash) {
      try {
        const receipt = await this.client.getTransactionReceipt({ hash: row.tx_hash as Hex });
        if (receipt.status === 'success') {
          const observed = jobEvent(receipt.logs, this.commerceAddress, 'JobSubmitted');
          if (
            String(observed.jobId) === String(run.job_id) &&
            String(observed.deliverable).toLowerCase() === expected.deliverableHash.toLowerCase()
          ) {
            const result = { txHash: row.tx_hash, submitted: true };
            await this.markConfirmed(row.id, result);
            return { status: 'RECOVERED_CONFIRMED', result };
          }
          // Deliverable hash mismatch — conflict
          return { status: 'CANONICAL_CONFLICT', detail: `Submitted deliverable ${observed.deliverable} != expected ${expected.deliverableHash}` };
        }
      } catch { /* tx may not exist */ }
    }

    // Check current job status — if already SUBMITTED or beyond, we can infer
    try {
      const job = chainJobSchema.parse(await this.client.readContract({
        address: this.commerceAddress,
        abi: commerceAbi,
        functionName: 'getJob',
        args: [BigInt(jobIdSchema.parse(String(run.job_id)))],
      }));

      if (job.status >= 2) {
        // Job is already submitted or beyond — but we can't confirm our specific deliverable
        // Check if we have a submission_tx_hash in the run
        if (run.submission_tx_hash) {
          const receipt = await this.client.getTransactionReceipt({ hash: run.submission_tx_hash as Hex });
          if (receipt.status === 'success') {
            const observed = jobEvent(receipt.logs, this.commerceAddress, 'JobSubmitted');
            if (String(observed.deliverable).toLowerCase() === expected.deliverableHash.toLowerCase()) {
              const result = { txHash: run.submission_tx_hash, submitted: true };
              await this.markConfirmed(row.id, result);
              return { status: 'RECOVERED_CONFIRMED', result };
            }
          }
        }
        return { status: 'STILL_AMBIGUOUS' };
      }

      // Job is still FUNDED — submit hasn't happened yet
      return { status: 'SAFE_TO_RETRY' };
    } catch {
      return { status: 'STILL_AMBIGUOUS' };
    }
  }

  // EVALUATE recovery:
  // Canonical: ERC-8183 job.status (COMPLETE=3, REJECTED=4)
  // If status matches expected verdict → CONFIRMED
  // If status is different → CANONICAL_CONFLICT
  // If status is still SUBMITTED (2) → SAFE_TO_RETRY
  private async reconcileEvaluate(row: OperationRow): Promise<ReconciliationResult> {
    const run = await this.getRun(row.job_run_id);
    if (!run?.job_id) return { status: 'STILL_AMBIGUOUS' };

    const expected = z.object({ decision: z.union([z.literal(1), z.literal(2)]).optional() }).passthrough().parse(jsonValue(row.canonical_snapshot));

    // If we have a tx hash, check the verdict transaction
    if (row.tx_hash) {
      try {
        const receipt = await this.client.getTransactionReceipt({ hash: row.tx_hash as Hex });
        if (receipt.status === 'success') {
          const verdict = z.object({
            decision: z.union([z.literal(1), z.literal(2)]),
            evidenceHash: hex32,
            reasonHash: hex32,
          }).passthrough().parse(jsonValue(run.verdict));
          const verdictEvents = receipt.logs.flatMap(log => {
            if (log.address.toLowerCase() !== this.evaluatorAddress.toLowerCase()) return [];
            try {
              const decoded = decodeEventLog({ abi: evaluatorAbi, data: log.data, topics: log.topics, strict: true });
              return decoded.eventName === 'JobVerdictExecuted' ? [decoded.args as unknown as Record<string, unknown>] : [];
            } catch { return []; }
          });
          if (verdictEvents.length !== 1) return { status: 'CANONICAL_CONFLICT', detail: 'VERDICT_EVENT_UNVERIFIED' };
          const verdictEvent = verdictEvents[0];
          if (String(verdictEvent.jobId) !== String(run.job_id) || verdictEvent.decision !== verdict.decision ||
              String(verdictEvent.evidenceHash).toLowerCase() !== verdict.evidenceHash.toLowerCase() ||
              String(verdictEvent.reasonHash).toLowerCase() !== verdict.reasonHash.toLowerCase()) {
            return { status: 'CANONICAL_CONFLICT', detail: 'VERDICT_EVENT_MISMATCH' };
          }
          // Verdict was executed — check final job state
          const job = chainJobSchema.parse(await this.client.readContract({
            address: this.commerceAddress,
            abi: commerceAbi,
            functionName: 'getJob',
            args: [BigInt(jobIdSchema.parse(String(run.job_id)))],
          }));

          const finalStatus = job.status === 3 ? 'COMPLETED' : job.status === 4 ? 'REJECTED' : null;
          if (finalStatus && (!expected.decision || (expected.decision === 1 && finalStatus === 'COMPLETED') || (expected.decision === 2 && finalStatus === 'REJECTED'))) {
            const result = { jobId: String(run.job_id), decision: verdict.decision, txHash: row.tx_hash };
            await this.markConfirmed(row.id, result);
            return { status: 'RECOVERED_CONFIRMED', result };
          }
          return { status: 'CANONICAL_CONFLICT', detail: `Job status ${job.status} does not match expected verdict` };
        }
      } catch { /* tx may not exist */ }
    }

    // Check current job state
    try {
      const job = chainJobSchema.parse(await this.client.readContract({
        address: this.commerceAddress,
        abi: commerceAbi,
        functionName: 'getJob',
        args: [BigInt(jobIdSchema.parse(String(run.job_id)))],
      }));

      if (job.status === 3 || job.status === 4) {
        // Final state alone cannot prove which verdict caused settlement.
        if (run.verdict) {
          const verdict = z.object({ decision: z.union([z.literal(1), z.literal(2)]) }).passthrough().parse(jsonValue(run.verdict));
          if ((job.status === 3 && verdict.decision === 1) || (job.status === 4 && verdict.decision === 2)) {
            if (!run.tx_hash) return { status: 'STILL_AMBIGUOUS' };
            return this.reconcileEvaluate({ ...row, tx_hash: String(run.tx_hash) });
          }
        }
        return { status: 'STILL_AMBIGUOUS' };
      }

      if (job.status === 2) {
        // Still SUBMITTED — evaluate hasn't happened yet
        return { status: 'SAFE_TO_RETRY' };
      }

      return { status: 'STILL_AMBIGUOUS' };
    } catch {
      return { status: 'STILL_AMBIGUOUS' };
    }
  }

  private async reconcileRefund(row: OperationRow): Promise<ReconciliationResult> {
    const run = await this.getRun(row.job_run_id);
    if (!run?.job_id) return { status: 'STILL_AMBIGUOUS' };
    try {
      const job = chainJobSchema.parse(await this.client.readContract({
        address: this.commerceAddress,
        abi: commerceAbi,
        functionName: 'getJob',
        args: [BigInt(jobIdSchema.parse(String(run.job_id)))],
      }));
      if (job.status === 5) {
        if (!row.tx_hash) return { status: 'STILL_AMBIGUOUS' };
        const receipt = await this.client.getTransactionReceipt({ hash: row.tx_hash as Hex });
        if (receipt.status !== 'success') return { status: 'SAFE_TO_RETRY' };
        const refunded = jobEvent(receipt.logs, this.commerceAddress, 'Refunded');
        if (String(refunded.jobId) !== String(run.job_id) || String(refunded.client).toLowerCase() !== this.walletAddress.toLowerCase()) {
          return { status: 'CANONICAL_CONFLICT', detail: 'REFUND_EVENT_MISMATCH' };
        }
        const result = { jobId: String(run.job_id), state: 'REFUNDED', txHash: row.tx_hash };
        await this.markConfirmed(row.id, result);
        return { status: 'RECOVERED_CONFIRMED', result };
      }
      if ((job.status === 1 || job.status === 2) && job.expiredAt <= BigInt(Math.floor(Date.now() / 1000))) {
        return { status: 'SAFE_TO_RETRY' };
      }
      return { status: 'CANONICAL_CONFLICT', detail: `Job status ${job.status} is not refund-eligible` };
    } catch {
      return { status: 'STILL_AMBIGUOUS' };
    }
  }

  private async getRun(runId: string): Promise<Record<string, unknown> | null> {
    const { rows } = await this.db.query('SELECT * FROM protected_job_runs WHERE id = $1', [runId]);
    return rows[0] ?? null;
  }

  private async markConfirmed(operationId: string, result: unknown): Promise<void> {
    await this.db.query(
      `UPDATE job_operations SET state = 'CONFIRMED', result = $2, confirmed_at = now(), updated_at = now() WHERE id = $1`,
      [operationId, JSON.stringify(result)]
    );
  }

  // Persist reconciliation metadata before broadcast.
  // Called BEFORE the external operation to ensure we have enough data for recovery.
  async prepareOperation(
    runId: string,
    operation: string,
    requestHash: string,
    opts: { txHash?: string; canonicalSnapshot?: unknown; externalOperationId?: string } = {}
  ): Promise<void> {
    await this.db.query(
      `UPDATE job_operations SET
        tx_hash = COALESCE($3, tx_hash),
        canonical_snapshot = COALESCE($4, canonical_snapshot),
        external_operation_id = COALESCE($5, external_operation_id),
        broadcast_at = CASE WHEN $3 IS NOT NULL THEN now() ELSE broadcast_at END
      WHERE job_run_id = $1 AND operation = $2`,
      [runId, operation, opts.txHash ?? null, opts.canonicalSnapshot ? JSON.stringify(opts.canonicalSnapshot) : null, opts.externalOperationId ?? null]
    );
  }

  // After successful broadcast, persist the tx hash immediately.
  async recordBroadcast(runId: string, operation: string, txHash: string): Promise<void> {
    await this.db.query(
      `UPDATE job_operations SET tx_hash = $3, broadcast_at = now(), updated_at = now() WHERE job_run_id = $1 AND operation = $2`,
      [runId, operation, txHash]
    );
  }
}
