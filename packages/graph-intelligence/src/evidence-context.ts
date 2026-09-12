import type { Provenance } from './guardrails.js';

// Evidence context: normalize evidence returned for analysis.
// Preserves semantic boundaries:
// - "XYX Observed Evidence" ≠ universal provider reputation
// - address diversity ≠ unique independent humans
// - ERC-8004 not mapped ≠ provider invalid
// - validation unavailable ≠ validation score = 0
// - no historical evidence = UNOBSERVED, not LOW TRUST

export interface EvidenceContext {
  endpointKey: string;
  providerKey: string;
  receiptCount: number;
  successCount: number;
  failureCount: number;
  excludedOutcomes: number;
  lastObservedAt: number | null;
  addressDiversity: number | null;
  uniquePayers: number;
  trust: number;
  status: 'OBSERVED' | 'UNOBSERVED';
  validationAvailable: boolean;
  validationScore: number | null;
  erc8004Mapped: boolean;
  provenance: Provenance;
}

export function formatEvidenceContext(ctx: EvidenceContext): string {
  const lines = [
    `Endpoint: ${ctx.endpointKey}`,
    `Provider: ${ctx.providerKey}`,
    `Status: ${ctx.status}`,
    `Total receipts: ${ctx.receiptCount}`,
    `Successes: ${ctx.successCount}`,
    `Failures: ${ctx.failureCount}`,
    `Excluded outcomes: ${ctx.excludedOutcomes}`,
    `Unique payers: ${ctx.uniquePayers}`,
    `Address diversity: ${ctx.addressDiversity?.toFixed(2) ?? 'unavailable'}`,
    `Trust score: ${ctx.trust.toFixed(4)}`,
  ];

  if (ctx.lastObservedAt) {
    lines.push(`Last observed: ${new Date(ctx.lastObservedAt * 1000).toISOString()}`);
  }

  if (ctx.erc8004Mapped) {
    lines.push(`ERC-8004 mapped: yes`);
    lines.push(`Validation available: ${ctx.validationAvailable ? 'yes' : 'no'}`);
    if (ctx.validationScore !== null) {
      lines.push(`Validation score: ${ctx.validationScore.toFixed(2)}`);
    }
  } else {
    lines.push(`ERC-8004 mapped: no`);
    lines.push(`Note: Unmapped providers are NOT invalid — they simply lack optional verified identity enrichment.`);
  }

  lines.push(`Graph deployment: ${ctx.provenance.graphDeployment}`);
  lines.push(`Indexed block: ${ctx.provenance.indexedBlock}`);

  return lines.join('\n');
}

export function formatComparison(before: EvidenceContext, after: EvidenceContext): string {
  const lines = ['Evidence comparison:'];

  if (before.trust !== after.trust) {
    const delta = after.trust - before.trust;
    lines.push(`Trust: ${before.trust.toFixed(4)} → ${after.trust.toFixed(4)} (${delta >= 0 ? '+' : ''}${delta.toFixed(4)})`);
  } else {
    lines.push(`Trust: ${before.trust.toFixed(4)} (unchanged)`);
  }

  if (before.receiptCount !== after.receiptCount) {
    lines.push(`Receipts: ${before.receiptCount} → ${after.receiptCount} (+${after.receiptCount - before.receiptCount})`);
  }

  if (before.successCount !== after.successCount) {
    lines.push(`Successes: ${before.successCount} → ${after.successCount}`);
  }

  if (before.failureCount !== after.failureCount) {
    lines.push(`Failures: ${before.failureCount} → ${after.failureCount}`);
  }

  if (before.uniquePayers !== after.uniquePayers) {
    lines.push(`Unique payers: ${before.uniquePayers} → ${after.uniquePayers}`);
  }

  if (before.status !== after.status) {
    lines.push(`Status: ${before.status} → ${after.status}`);
  }

  if (before.provenance.indexedBlock !== after.provenance.indexedBlock) {
    lines.push(`Graph block: ${before.provenance.indexedBlock} → ${after.provenance.indexedBlock}`);
  }

  return lines.join('\n');
}
