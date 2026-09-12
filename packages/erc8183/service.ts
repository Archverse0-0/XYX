import { decodeEventLog, type Abi, type Address, type Hex } from 'viem';
import { z } from 'zod';
import { CircleAdapter } from '../circle-adapter/src/index.js';
import { arcClient, ARC_USDC } from '../shared/src/chain.js';
import { atomicAmount, address, hex32, hashJSON } from '../shared/src/index.js';
import { assertJobExpiry, evaluateDeliverable, jobIdSchema } from '../shared/src/jobs.js';
import artifact from './AgenticCommerce.abi.json' with { type: 'json' };

// ─── Contract ABI and chain types ────────────────────────────────────────────
export const commerceAbi = artifact as Abi;

export const chainJobSchema = z.object({
  id: z.bigint(),
  client: address,
  provider: address,
  evaluator: address,
  description: z.string(),
  budget: z.bigint(),
  expiredAt: z.bigint(),
  status: z.number().int().min(0).max(5),
  hook: address,
});
export type ChainJob = z.infer<typeof chainJobSchema>;

// ERC-8183 JobStatus enum per ABI: 0=Open, 1=Funded, 2=Submitted, 3=Completed, 4=Rejected, 5=Expired
export const JobStatus = { OPEN: 0, FUNDED: 1, SUBMITTED: 2, COMPLETED: 3, REJECTED: 4, EXPIRED: 5 } as const;
export type JobStatus = typeof JobStatus[keyof typeof JobStatus];

type ChainLog = { address: string; data: Hex; topics: readonly Hex[] };

// Decode exactly one event of the given name from the contract logs.
// Fails with JOB_EVENT_UNVERIFIED if zero or multiple matches.
export function jobEvent(logs: readonly ChainLog[], contract: Address, eventName: string) {
  const matches: Record<string, unknown>[] = [];
  for (const log of logs) {
    if (log.address.toLowerCase() !== contract.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({ abi: commerceAbi, data: log.data, topics: log.topics as [Hex, ...Hex[]], strict: true });
      if (decoded.eventName === eventName) matches.push(decoded.args as unknown as Record<string, unknown>);
    } catch { /* Unrelated or malformed event. */ }
  }
  if (matches.length !== 1) throw new Error('JOB_EVENT_UNVERIFIED');
  return matches[0];
}

const txSchema = z.object({ id: z.string(), state: z.string().optional(), txHash: hex32.optional() });

// ─── Core service ────────────────────────────────────────────────────────────
export class ProtectedJobService {
  readonly client: ReturnType<typeof arcClient>;

  constructor(
    readonly rpc: string,
    readonly contract: Address,
    readonly buyer: CircleAdapter,
    readonly provider: Address,
  ) {
    this.client = arcClient(rpc);
    address.parse(provider);
  }

  // ─── Read helpers ──────────────────────────────────────────────────────
  async read(jobId: string): Promise<ChainJob> {
    const id = BigInt(jobIdSchema.parse(jobId));
    return chainJobSchema.parse(
      await this.client.readContract({ address: this.contract, abi: commerceAbi, functionName: 'getJob', args: [id] })
    );
  }

  async verifyParticipants(jobId: string, evaluator: string) {
    const job = await this.read(jobId);
    if (
      job.id !== BigInt(jobIdSchema.parse(jobId)) ||
      job.client.toLowerCase() !== this.buyer.wallet.toLowerCase() ||
      job.provider.toLowerCase() !== this.provider.toLowerCase() ||
      job.evaluator.toLowerCase() !== evaluator.toLowerCase()
    ) {
      throw new Error('JOB_PARTICIPANTS_MISMATCH');
    }
    return job;
  }

  // ─── Transaction result helper ─────────────────────────────────────────
  // Wait for receipt and verify success. Returns the tx hash on success.
  private async tx(result: unknown, label: string): Promise<Hex> {
    const parsed = txSchema.parse(result);
    if (!parsed.txHash) throw new Error(`${label.toUpperCase()}_TX_UNKNOWN`);
    const receipt = await this.client.waitForTransactionReceipt({ hash: parsed.txHash as Hex, timeout: 60_000 });
    if (receipt.status !== 'success') throw new Error(`${label.toUpperCase()}_FAILED`);
    return parsed.txHash as Hex;
  }

  // ─── Buyer-side operations ────────────────────────────────────────────

  async create(providerAddress: string, evaluator: string, expiresAt: number, description: string, key: string) {
    address.parse(providerAddress);
    address.parse(evaluator);
    assertJobExpiry(expiresAt);
    if (providerAddress.toLowerCase() !== this.provider.toLowerCase()) throw new Error('PROVIDER_WALLET_MISMATCH');
    if (!description || description.length > 4096) throw new Error('INVALID_DESCRIPTION');

    const tx = await this.tx(
      await this.buyer.execute('createJob(address,address,uint256,string,address)', [providerAddress, evaluator, String(expiresAt), description, '0x0000000000000000000000000000000000000000'], this.contract, key),
      'create_job'
    );
    const receipt = await this.client.getTransactionReceipt({ hash: tx });
    const event = jobEvent(receipt.logs, this.contract, 'JobCreated');
    if (
      String(event.client).toLowerCase() !== this.buyer.wallet.toLowerCase() ||
      String(event.provider).toLowerCase() !== providerAddress.toLowerCase() ||
      String(event.evaluator).toLowerCase() !== evaluator.toLowerCase() ||
      event.expiredAt !== BigInt(expiresAt)
    ) {
      throw new Error('JOB_EVENT_UNVERIFIED');
    }
    return { jobId: String(event.jobId), txHash: tx };
  }

  async approve(amount: string, key: string) {
    const value = atomicAmount(amount, 6);
    if (value <= 0n) throw new Error('INVALID_APPROVE_AMOUNT');
    return this.tx(
      await this.buyer.execute('approve(address,uint256)', [this.contract, value.toString()], ARC_USDC, key),
      'approve'
    );
  }

  async fund(jobId: string, key: string) {
    jobIdSchema.parse(jobId);
    return this.tx(
      await this.buyer.execute('fund(uint256,bytes)', [jobId, '0x'], this.contract, key),
      'fund'
    );
  }

  async claimRefund(jobId: string, key: string) {
    jobIdSchema.parse(jobId);
    const eligibility = await this.isRefundEligible(jobId);
    if (!eligibility.eligible) throw new Error(eligibility.reason);
    return this.tx(
      await this.buyer.execute('claimRefund(uint256)', [jobId], this.contract, key),
      'claimRefund'
    );
  }

  // ─── Provider submission verification ─────────────────────────────────
  // Verify that the provider actually submitted on-chain with the expected
  // deliverable hash. The provider calls submit() externally; we read and
  // verify the resulting transaction and JobSubmitted event.

  async verifySubmission(jobId: string, expectedDeliverableHash: Hex, submissionTxHash: Hex) {
    jobIdSchema.parse(jobId);
    hex32.parse(expectedDeliverableHash);
    hex32.parse(submissionTxHash);

    // Wait for and verify the submission transaction
    const receipt = await this.client.waitForTransactionReceipt({ hash: submissionTxHash, timeout: 60_000 });
    if (receipt.status !== 'success') throw new Error('SUBMISSION_TX_FAILED');
    if (receipt.from.toLowerCase() !== this.provider.toLowerCase()) throw new Error('SUBMISSION_PROVIDER_MISMATCH');

    // Decode the exactly-one JobSubmitted event
    const event = jobEvent(receipt.logs, this.contract, 'JobSubmitted');

    // Verify jobId, provider, and deliverable hash bind together
    if (String(event.jobId) !== jobId) throw new Error('SUBMISSION_JOB_ID_MISMATCH');
    if (String(event.provider).toLowerCase() !== this.provider.toLowerCase()) throw new Error('SUBMISSION_PROVIDER_MISMATCH');
    if (String(event.deliverable).toLowerCase() !== expectedDeliverableHash.toLowerCase()) throw new Error('DELIVERABLE_HASH_MISMATCH');

    return { txHash: submissionTxHash, blockNumber: receipt.blockNumber, logIndex: receipt.logs.findIndex(l => {
      try {
        const d = decodeEventLog({ abi: commerceAbi, data: l.data, topics: l.topics as [Hex, ...Hex[]], strict: true });
        const args = d.args as unknown as Record<string, unknown>;
        return d.eventName === 'JobSubmitted' && String(args.jobId) === jobId;
      } catch { return false; }
    }) };
  }

  // ─── State inspection for reconciliation ──────────────────────────────
  async getJobState(jobId: string): Promise<{ job: ChainJob; isFunded: boolean; isSubmitted: boolean; isCompleted: boolean; isRejected: boolean; isExpired: boolean; escrowUnlocked: boolean }> {
    const job = await this.read(jobId);
    return {
      job,
      isFunded: job.status === JobStatus.FUNDED,
      isSubmitted: job.status === JobStatus.SUBMITTED,
      isCompleted: job.status === JobStatus.COMPLETED,
      isRejected: job.status === JobStatus.REJECTED,
      isExpired: job.status === JobStatus.EXPIRED,
      escrowUnlocked: job.status === JobStatus.COMPLETED || job.status === JobStatus.REJECTED || job.status === JobStatus.EXPIRED,
    };
  }

  // ─── Refund eligibility ───────────────────────────────────────────────
  // reject() refunds atomically. claimRefund() is only valid while a
  // Funded/Submitted job is past expiry; success transitions it to Expired.
  async isRefundEligible(jobId: string): Promise<{ eligible: boolean; reason: string }> {
    const state = await this.getJobState(jobId);

    if (state.isCompleted) return { eligible: false, reason: 'JOB_COMPLETED' };
    if (state.isRejected) return { eligible: false, reason: 'JOB_ALREADY_REJECTED_AND_REFUNDED' };
    if (state.isExpired) return { eligible: false, reason: 'JOB_ALREADY_EXPIRED_AND_REFUNDED' };
    if (!state.isFunded && !state.isSubmitted) return { eligible: false, reason: 'JOB_HAS_NO_FUNDED_ESCROW' };
    if (state.job.expiredAt > BigInt(Math.floor(Date.now() / 1000))) {
      return { eligible: false, reason: 'JOB_NOT_EXPIRED' };
    }
    return { eligible: true, reason: 'EXPIRED_ESCROW_REFUND_AVAILABLE' };
  }
}
