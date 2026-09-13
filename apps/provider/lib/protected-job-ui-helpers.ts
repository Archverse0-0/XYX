// Pure state-decision helpers for the protected job provider UI.
// These contain no React or DOM dependencies and are fully unit-testable.

import {
  BUDGET,
  expectedProvider,
  expectedChain,
  validJobId,
  type ProviderAction,
} from './protected-job-provider';
import type { ChainJob } from './protected-job-provider';
import { ProviderWalletService } from './provider-wallet';
import { TaskInputError } from './task';

// ─── Wallet State ────────────────────────────────────────────────────
export interface WalletState {
  connected: boolean;
  accountMatches: boolean;
  chainMatches: boolean;
  providerAddress: string | null;
}

export function evaluateWalletState(
  provider: string | null,
  accountMatches: boolean,
  chainMatches: boolean
): WalletState {
  return {
    connected: !!provider,
    accountMatches,
    chainMatches,
    providerAddress: provider,
  };
}

// ─── Send Eligibility ───────────────────────────────────────────────
export interface SendEligibility {
  eligible: boolean;
  blockers: string[];
}

export function evaluateSendEligibility(wallet: WalletState, simulation: string, txState: string, error: string | undefined): SendEligibility {
  const blockers: string[] = [];
  if (!wallet.connected) blockers.push('connect wallet');
  if (!wallet.accountMatches) blockers.push('wallet must match provider');
  if (!wallet.chainMatches) blockers.push('chain must be Arc Testnet');
  if (!simulation || simulation === 'IDLE') blockers.push('inspect job first');
  if (simulation === 'FAILED') blockers.push('simulation failed');
  if (simulation === 'EXECUTING_PROVIDER') blockers.push('provider execution in progress');
  if (txState !== 'IDLE' && txState !== 'CONFIRMED' && txState !== 'FAILED' && txState !== 'RECONCILIATION_REQUIRED') blockers.push('transaction pending');
  if (txState === 'RECONCILIATION_REQUIRED') blockers.push('state requires reconciliation');
  if (error?.includes('RECONCILIATION_REQUIRED')) blockers.push('state requires reconciliation');
  return { eligible: blockers.length === 0, blockers };
}

// ─── Confirmation Phrase ────────────────────────────────────────────
export function requiredConfirmationPhrase(action: ProviderAction, jobId: string): string {
  return action === 'setBudget' ? `SET BUDGET ${jobId}` : `SUBMIT DELIVERABLE ${jobId}`;
}

// ─── Job Readiness ──────────────────────────────────────────────────
export interface JobReadiness {
  ready: boolean;
  reason?: string;
}

export function evaluateJobReadinessForAction(
  job: ChainJob | null,
  action: ProviderAction,
  jobId: string,
  txState: string
): JobReadiness {
  if (txState !== 'IDLE' && txState !== 'CONFIRMED' && txState !== 'FAILED' && txState !== 'RECONCILIATION_REQUIRED') {
    return { ready: false, reason: 'transaction pending' };
  }
  if (!job) return { ready: false, reason: 'job not inspected' };
  if (!validJobId(jobId)) return { ready: false, reason: 'invalid jobId' };

  if (action === 'setBudget') {
    if (job.status !== 0 || job.budget !== 0n) return { ready: false, reason: 'job not open for budget' };
  }
  if (action === 'submit') {
    if (job.status !== 1 || job.budget !== BUDGET) return { ready: false, reason: 'job not funded for submit' };
  }
  return { ready: true };
}

// ─── Funded State Wording ───────────────────────────────────────────
export type FundedDisplayText = {
  escrow: boolean;
  providerPaid: boolean;
  settlementComplete: boolean;
};

export function evaluateFundedWording(): FundedDisplayText {
  return {
    escrow: true,
    providerPaid: false,
    settlementComplete: false,
  };
}

// ─── Mode Separation ────────────────────────────────────────────────
export function isProtectedJobTerm(term: string): boolean {
  const protectedTerms = ['SET BUDGET', 'SUBMIT DELIVERABLE', 'JobVerdict', 'COMPLETE', 'REJECT', 'evaluator', 'ERC-8183', 'escrow'];
  const openPurchaseTerms = ['ReceiptAttestation', 'XYXEvidenceRegistry', 'Witness', 'HTTP Outcome'];
  const termLower = term.toLowerCase();
  if (openPurchaseTerms.some(t => termLower.includes(t.toLowerCase()))) return false;
  if (protectedTerms.some(t => termLower.includes(t))) return true;
  return false;
}

// ─── Error Classification ───────────────────────────────────────────
export type ErrorCategory =
  | 'VALIDATION_ERROR'
  | 'CHAIN_MISMATCH'
  | 'SIGNER_MISMATCH'
  | 'SIMULATION_FAILED'
  | 'ARC_TX_FAILED'
  | 'RECONCILIATION_REQUIRED'
  | 'PROVIDER_EXECUTION_FAILED'
  | 'UNKNOWN_ERROR';

export function classifyError(error: string | undefined): ErrorCategory | null {
  if (!error) return null;
  if (error.includes('INVALID_JOB_ID')) return 'VALIDATION_ERROR';
  if (error.includes('WRONG_CHAIN')) return 'CHAIN_MISMATCH';
  if (error.includes('WALLET_MISMATCH') || error.includes('PROVIDER_MISMATCH')) return 'SIGNER_MISMATCH';
  if (error.includes('JOB_PARTICIPANTS_MISMATCH')) return 'VALIDATION_ERROR';
  if (error.includes('SIMULATION_FAILED')) return 'SIMULATION_FAILED';
  if (error.includes('TX_REVERTED')) return 'ARC_TX_FAILED';
  if (error.includes('RECONCILIATION_REQUIRED')) return 'RECONCILIATION_REQUIRED';
  if (error.includes('CONFIRMATION_MISMATCH')) return 'VALIDATION_ERROR';
  if (error.includes('PROVIDER_EXECUTION_FAILED')) return 'PROVIDER_EXECUTION_FAILED';
  return 'UNKNOWN_ERROR';
}
