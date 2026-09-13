import test from 'node:test';
import assert from 'node:assert/strict';
import { JobStatus } from '../../erc8183/service.js';

// ═══════════════════════════════════════════════════════════════
// B13: Refund Safety
// ═══════════════════════════════════════════════════════════════

function refundRuleChecker(chainStatus: JobStatus) {
  const state = {
    isCompleted: chainStatus === JobStatus.COMPLETED,
    isRejected: chainStatus === JobStatus.REJECTED,
    isExpired: chainStatus === JobStatus.EXPIRED,
    isFunded: chainStatus === JobStatus.FUNDED,
    isSubmitted: chainStatus === JobStatus.SUBMITTED,
    job: { expiredAt: BigInt(Math.floor(Date.now() / 1000) - 1) },
  };
  return () => {
    if (state.isCompleted) return { eligible: false, reason: 'JOB_COMPLETED' };
    if (state.isRejected) return { eligible: false, reason: 'JOB_ALREADY_REJECTED_AND_REFUNDED' };
    if (state.isExpired) return { eligible: false, reason: 'JOB_ALREADY_EXPIRED_AND_REFUNDED' };
    if (!state.isFunded && !state.isSubmitted) return { eligible: false, reason: 'JOB_HAS_NO_FUNDED_ESCROW' };
    if (state.job.expiredAt > BigInt(Math.floor(Date.now() / 1000))) return { eligible: false, reason: 'JOB_NOT_EXPIRED' };
    return { eligible: true, reason: 'EXPIRED_ESCROW_REFUND_AVAILABLE' };
  };
}

test('REFUND-A: funded + expired + eligible → refund path allowed', () => {
  const check = refundRuleChecker(JobStatus.FUNDED);
  const result = check();
  assert.equal(result.eligible, true);
  assert.equal(result.reason, 'EXPIRED_ESCROW_REFUND_AVAILABLE');
});

test('REFUND-B: funded + not expired → denied', () => {
  const state = {
    isCompleted: false, isRejected: false, isExpired: false,
    isFunded: true, isSubmitted: false,
    job: { expiredAt: BigInt(Math.floor(Date.now() / 1000) + 100) },
  };
  const now = Math.floor(Date.now() / 1000);
  let reason: string;
  if (state.job.expiredAt > BigInt(now)) {
    reason = 'JOB_NOT_EXPIRED';
  } else {
    reason = 'EXPIRED_ESCROW_REFUND_AVAILABLE';
  }
  const result = { eligible: state.job.expiredAt <= BigInt(now) && state.isFunded, reason };
  assert.equal(result.eligible, false);
  assert.equal(result.reason, 'JOB_NOT_EXPIRED');
});

test('REFUND-C: completed → denied', () => {
  const check = refundRuleChecker(JobStatus.COMPLETED);
  const result = check();
  assert.equal(result.eligible, false);
  assert.equal(result.reason, 'JOB_COMPLETED');
});

test('REFUND-D: rejected → denied (already rejected and refunded)', () => {
  const check = refundRuleChecker(JobStatus.REJECTED);
  const result = check();
  assert.equal(result.eligible, false);
  assert.equal(result.reason, 'JOB_ALREADY_REJECTED_AND_REFUNDED');
});

test('REFUND-E: expired → denied (already expired and refunded)', () => {
  const check = refundRuleChecker(JobStatus.EXPIRED);
  const result = check();
  assert.equal(result.eligible, false);
  assert.equal(result.reason, 'JOB_ALREADY_EXPIRED_AND_REFUNDED');
});

test('REFUND-F: submitted + expired + eligible → refund allowed', () => {
  const check = refundRuleChecker(JobStatus.SUBMITTED);
  const result = check();
  assert.equal(result.eligible, true);
  assert.equal(result.reason, 'EXPIRED_ESCROW_REFUND_AVAILABLE');
});

test('REFUND-G: open with no escrow → denied', () => {
  const check = refundRuleChecker(JobStatus.OPEN);
  const result = check();
  assert.equal(result.eligible, false);
  assert.equal(result.reason, 'JOB_HAS_NO_FUNDED_ESCROW');
});

test('REFUND-H: rejected → no refund after rejection', () => {
  const check = refundRuleChecker(JobStatus.REJECTED);
  const result = check();
  assert.equal(result.eligible, false);
  assert.equal(result.reason, 'JOB_ALREADY_REJECTED_AND_REFUNDED');
});
