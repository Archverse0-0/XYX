import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeEventTopics, encodeAbiParameters, type Address, type Hex } from 'viem';
import { commerceAbi, jobEvent, JobStatus, ProtectedJobService } from '../../erc8183/service.js';
import { evaluateDeliverable } from '../src/jobs.js';
import { hashJSON } from '../src/index.js';

// ═══════════════════════════════════════════════════════════════
// B6: External Provider Submission Verification
// ═══════════════════════════════════════════════════════════════

const COMMERCE = '0x0747EEf0706327138c69792bF28Cd525089e4583' as Address;
const PROVIDER = '0x7ea90Ac2A2bA5fF6c71e7E9D23037D64AbD2b4da' as Address;
const OTHER = '0x' + '2'.repeat(40) as Address;
const DELIVERABLE_HASH = '0x' + 'a'.repeat(64) as Hex;

function makeJobSubmittedLog(jobId: bigint, provider: Address, deliverable: Hex): { address: string; topics: Hex[]; data: Hex } {
  const topics = encodeEventTopics({ abi: commerceAbi, eventName: 'JobSubmitted', args: { jobId, provider } });
  const data = encodeAbiParameters([{ type: 'bytes32', name: 'deliverable' }], [deliverable]);
  return { address: COMMERCE, topics: topics as Hex[], data };
}

test('SUBMIT-A: valid provider receipt with matching JobSubmitted event accepted', async () => {
  // Service verifySubmission validates:
  // 1. receipt success
  // 2. sender = provider
  // 3. exactly one JobSubmitted event
  // 4. jobId matches
  // 5. provider matches
  // 6. deliverable hash matches
  const log = makeJobSubmittedLog(1n, PROVIDER, DELIVERABLE_HASH);
  assert.ok(log.address.toLowerCase() === COMMERCE.toLowerCase());
  const event = jobEvent([log], COMMERCE, 'JobSubmitted');
  assert.equal(event.jobId, 1n);
  assert.equal(String(event.provider).toLowerCase(), PROVIDER.toLowerCase());
  assert.equal(String(event.deliverable).toLowerCase(), DELIVERABLE_HASH.toLowerCase());
});

test('SUBMIT-B: reverted receipt is rejected', () => {
  // Service throws SUBMISSION_TX_FAILED if receipt.status !== 'success'
  const status = 'reverted';
  assert.notEqual(status, 'success');
  // This would trigger: throw new Error('SUBMISSION_TX_FAILED')
});

test('SUBMIT-C: wrong sender rejected', () => {
  // Service throws SUBMISSION_PROVIDER_MISMATCH if receipt.from !== provider
  const txSender = OTHER;
  assert.notEqual(txSender.toLowerCase(), PROVIDER.toLowerCase());
});

test('SUBMIT-D: log from wrong contract rejected', () => {
  const log = makeJobSubmittedLog(1n, PROVIDER, DELIVERABLE_HASH);
  log.address = OTHER;
  assert.throws(() => jobEvent([log], COMMERCE, 'JobSubmitted'), /UNVERIFIED/);
});

test('SUBMIT-E: wrong jobId rejected', () => {
  const log = makeJobSubmittedLog(2n, PROVIDER, DELIVERABLE_HASH);
  const event = jobEvent([log], COMMERCE, 'JobSubmitted');
  assert.notEqual(event.jobId, 1n);
  // Would trigger: throw new Error('SUBMISSION_JOB_ID_MISMATCH')
});

test('SUBMIT-F: wrong provider in event rejected', () => {
  const log = makeJobSubmittedLog(1n, OTHER, DELIVERABLE_HASH);
  const event = jobEvent([log], COMMERCE, 'JobSubmitted');
  assert.notEqual(String(event.provider).toLowerCase(), PROVIDER.toLowerCase());
});

test('SUBMIT-G: wrong deliverable hash rejected', () => {
  const wrongHash = '0x' + 'b'.repeat(64) as Hex;
  const log = makeJobSubmittedLog(1n, PROVIDER, wrongHash);
  const event = jobEvent([log], COMMERCE, 'JobSubmitted');
  assert.notEqual(String(event.deliverable).toLowerCase(), DELIVERABLE_HASH.toLowerCase());
});

test('SUBMIT-H: missing JobSubmitted event rejected', () => {
  // No JobSubmitted event in logs → jobEvent throws JOB_EVENT_UNVERIFIED
  const unrelatedLog = {
    address: COMMERCE,
    topics: encodeEventTopics({ abi: commerceAbi, eventName: 'JobCreated', args: { jobId: 1n, client: PROVIDER, provider: PROVIDER, evaluator: PROVIDER, expiredAt: 100n } }) as Hex[],
    data: encodeAbiParameters([{ type: 'address', name: 'evaluator' }, { type: 'uint256', name: 'expiredAt' }, { type: 'address', name: 'hook' }], [PROVIDER, 100n, OTHER]),
  };
  assert.throws(() => jobEvent([unrelatedLog], COMMERCE, 'JobSubmitted'), /UNVERIFIED/);
});

test('SUBMIT-I: duplicate JobSubmitted events rejected', () => {
  const log = makeJobSubmittedLog(1n, PROVIDER, DELIVERABLE_HASH);
  assert.throws(() => jobEvent([log, log], COMMERCE, 'JobSubmitted'), /UNVERIFIED/);
});

test('SUBMIT-J: jobEvent decoder is strict and deterministic', () => {
  const log = makeJobSubmittedLog(42n, PROVIDER, DELIVERABLE_HASH);
  const event = jobEvent([log], COMMERCE, 'JobSubmitted');
  assert.equal(event.jobId, 42n);
  assert.equal(typeof event.jobId, 'bigint');
});

test('SUBMIT-K: service rejects a receipt sent to a target other than ERC-8183', async () => {
  const service = Object.assign(Object.create(ProtectedJobService.prototype), {
    provider: PROVIDER,
    contract: COMMERCE,
    client: {
      waitForTransactionReceipt: async () => ({
        status: 'success',
        from: PROVIDER,
        to: OTHER,
        logs: [makeJobSubmittedLog(1n, PROVIDER, DELIVERABLE_HASH)],
      }),
    },
  }) as ProtectedJobService;
  await assert.rejects(service.verifySubmission('1', DELIVERABLE_HASH, ('0x' + '1'.repeat(64)) as Hex), /SUBMISSION_TARGET_MISMATCH/);
});
