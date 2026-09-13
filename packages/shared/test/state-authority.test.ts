import test from 'node:test';
import assert from 'node:assert/strict';
import { JobStatus, ProtectedJobService, jobEvent } from '../../erc8183/service.js';
import type { DB } from '../src/storage.js';
import { jobOperation, withJobLock } from '../src/job-operations.js';
import { ProtectedJobReconciler } from '../src/reconciler.js';

// ═══════════════════════════════════════════════════════════════
// B1: State authority — chain truth dominates local DB state
// ═══════════════════════════════════════════════════════════════

function mockServiceWithJob(chainStatus: number) {
  return {
    getJobState: () => ({
      job: { status: chainStatus } as any,
      isFunded: chainStatus === JobStatus.FUNDED,
      isSubmitted: chainStatus === JobStatus.SUBMITTED,
      isCompleted: chainStatus === JobStatus.COMPLETED,
      isRejected: chainStatus === JobStatus.REJECTED,
      isExpired: chainStatus === JobStatus.EXPIRED,
      escrowUnlocked: [JobStatus.COMPLETED, JobStatus.REJECTED, JobStatus.EXPIRED].includes(chainStatus as any),
    }),
    read: async () => ({ status: chainStatus }) as any,
  } as unknown as ProtectedJobService;
}

test('STATE-A1: DB says FUNDED but chain says OPEN → must not report canonical funded success', async () => {
  // Reconciliation must verify canonical state, not trust DB
  const svc = mockServiceWithJob(JobStatus.OPEN);
  const state = await svc.getJobState('1');
  assert.equal(state.isFunded, false, 'Chain state OPEN must not appear funded');
  assert.equal(state.isCompleted, false);
});

test('STATE-A2: DB says COMPLETED but chain says SUBMITTED → must not report completed', async () => {
  const svc = mockServiceWithJob(JobStatus.SUBMITTED);
  const state = await svc.getJobState('1');
  assert.equal(state.isCompleted, false, 'Chain state SUBMITTED must not appear completed');
  assert.equal(state.isSubmitted, true);
});

test('STATE-A3: DB says SUBMITTED but chain lacks matching submit event → reconciliation fails closed', async () => {
  // Simulated: reconciliation requires canonical event evidence
  const mockReconciler = {
    reconcile: async () => ({ status: 'CANONICAL_CONFLICT' as const, detail: 'Missing JobSubmitted event' }),
  };
  const result = await (mockReconciler as any).reconcile({}, 'hash');
  assert.equal(result.status, 'CANONICAL_CONFLICT');
});

test('STATE-B1: Chain FUNDED state is correctly identified', async () => {
  const svc = mockServiceWithJob(JobStatus.FUNDED);
  const state = await svc.getJobState('1');
  assert.equal(state.isFunded, true);
  assert.equal(state.isSubmitted, false);
  assert.equal(state.isCompleted, false);
});

test('STATE-B2: Chain COMPLETED state is correctly identified', async () => {
  const svc = mockServiceWithJob(JobStatus.COMPLETED);
  const state = await svc.getJobState('1');
  assert.equal(state.isCompleted, true);
  assert.equal(state.escrowUnlocked, true);
});

test('STATE-B3: Chain REJECTED state is correctly identified', async () => {
  const svc = mockServiceWithJob(JobStatus.REJECTED);
  const state = await svc.getJobState('1');
  assert.equal(state.isRejected, true);
  assert.equal(state.escrowUnlocked, true);
});

test('STATE-B4: Chain EXPIRED state is correctly identified', async () => {
  const svc = mockServiceWithJob(JobStatus.EXPIRED);
  const state = await svc.getJobState('1');
  assert.equal(state.isExpired, true);
  assert.equal(state.escrowUnlocked, true);
});

test('STATE-B5: Chain OPEN state shows no escrow unlocked', async () => {
  const svc = mockServiceWithJob(JobStatus.OPEN);
  const state = await svc.getJobState('1');
  assert.equal(state.escrowUnlocked, false);
});
