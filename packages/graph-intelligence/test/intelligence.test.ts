import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProvenance, provenanceSummary, provenanceSchema, assertReadOnly } from '../src/guardrails.js';
import { formatEvidenceContext, formatComparison, type EvidenceContext } from '../src/evidence-context.js';
import { explainWhySelected, explainEvidenceFreshness, explainValidationAvailability, explainJobStatus } from '../src/explanation.js';

const mockProvenance = buildProvenance('test-deployment-123', { number: 1000, hash: '0x' + 'ab'.repeat(32) });

const mockEvidence: EvidenceContext = {
  endpointKey: '0x' + '11'.repeat(32),
  providerKey: '0x' + '22'.repeat(32),
  receiptCount: 15,
  successCount: 12,
  failureCount: 3,
  excludedOutcomes: 0,
  lastObservedAt: Date.now() / 1000,
  addressDiversity: 0.8,
  uniquePayers: 10,
  trust: 0.75,
  status: 'OBSERVED',
  validationAvailable: true,
  validationScore: 0.85,
  erc8004Mapped: true,
  provenance: mockProvenance,
};

test('buildProvenance creates valid provenance', () => {
  const p = buildProvenance('dep-1', { number: 500, hash: '0x' + '00'.repeat(32) });
  assert.equal(p.graphDeployment, 'dep-1');
  assert.equal(p.indexedBlock, 500);
  assert.equal(p.entityIds.length, 0);
});

test('provenanceSummary formats correctly', () => {
  const summary = provenanceSummary(mockProvenance);
  assert.ok(summary.includes('test-deployment-123'));
  assert.ok(summary.includes('1000'));
});

test('provenanceSchema validates', () => {
  const result = provenanceSchema.parse(mockProvenance);
  assert.equal(result.graphDeployment, 'test-deployment-123');
});

test('assertReadOnly does not throw', () => {
  assert.doesNotThrow(() => assertReadOnly());
});

test('formatEvidenceContext includes all fields', () => {
  const formatted = formatEvidenceContext(mockEvidence);
  assert.ok(formatted.includes('Endpoint:'));
  assert.ok(formatted.includes('Provider:'));
  assert.ok(formatted.includes('Status: OBSERVED'));
  assert.ok(formatted.includes('Total receipts: 15'));
  assert.ok(formatted.includes('Trust score:'));
  assert.ok(formatted.includes('ERC-8004 mapped: yes'));
  assert.ok(formatted.includes('Validation score:'));
  assert.ok(formatted.includes('Graph deployment:'));
});

test('formatEvidenceContext for unmapped provider', () => {
  const unmapped = { ...mockEvidence, erc8004Mapped: false, validationAvailable: false, validationScore: null };
  const formatted = formatEvidenceContext(unmapped);
  assert.ok(formatted.includes('ERC-8004 mapped: no'));
  assert.ok(formatted.includes('Unmapped providers are NOT invalid'));
});

test('formatEvidenceContext for unobserved', () => {
  const unobserved = { ...mockEvidence, status: 'UNOBSERVED' as const, receiptCount: 0 };
  const formatted = formatEvidenceContext(unobserved);
  assert.ok(formatted.includes('Status: UNOBSERVED'));
});

test('formatComparison shows changes', () => {
  const before = { ...mockEvidence, trust: 0.5, receiptCount: 10 };
  const after = { ...mockEvidence, trust: 0.75, receiptCount: 15 };
  const comparison = formatComparison(before, after);
  assert.ok(comparison.includes('Trust:'));
  assert.ok(comparison.includes('Receipts: 10 → 15'));
});

test('formatComparison shows no changes', () => {
  const comparison = formatComparison(mockEvidence, mockEvidence);
  assert.ok(comparison.includes('unchanged'));
});

test('explainWhySelected for selected endpoint', () => {
  const decision = {
    selectedCandidate: '0x' + '11'.repeat(32),
    scores: [
      { endpointKey: '0x' + '11'.repeat(32), trust: 0.75, utility: 0.8, priceScore: 0.9, count: 15 },
      { endpointKey: '0x' + '33'.repeat(32), trust: 0.5, utility: 0.6, priceScore: 0.8, count: 5 },
    ],
  };
  const result = explainWhySelected('0x' + '11'.repeat(32), decision, mockProvenance);
  assert.ok(result.answer.includes('was selected'));
  assert.ok(result.answer.includes('Trust:'));
  assert.equal(result.confidence, 'HIGH');
  assert.ok(result.provenance.graphDeployment.length > 0);
});

test('explainWhySelected for non-selected endpoint', () => {
  const decision = {
    selectedCandidate: '0x' + '33'.repeat(32),
    scores: [
      { endpointKey: '0x' + '11'.repeat(32), trust: 0.75, utility: 0.8, priceScore: 0.9, count: 15 },
    ],
  };
  const result = explainWhySelected('0x' + '11'.repeat(32), decision, mockProvenance);
  assert.ok(result.answer.includes('was NOT selected'));
});

test('explainEvidenceFreshness for fresh data', () => {
  const result = explainEvidenceFreshness(1000, 995, 10, mockProvenance);
  assert.ok(result.answer.includes('FRESH'));
  assert.ok(result.answer.includes('Lag: 5 blocks'));
});

test('explainEvidenceFreshness for stale data', () => {
  const result = explainEvidenceFreshness(1100, 900, 10, mockProvenance);
  assert.ok(result.answer.includes('STALE'));
  assert.ok(result.answer.includes('will NOT make autonomous decisions'));
  assert.ok(result.limitations.some(l => l.includes('Stale Graph data')));
});

test('explainValidationAvailability for unmapped provider', () => {
  const result = explainValidationAvailability(false, false, null, mockProvenance);
  assert.ok(result.answer.includes('does NOT have a verified ERC-8004 identity'));
  assert.ok(result.answer.includes('does NOT mean the provider is invalid'));
});

test('explainValidationAvailability for mapped with validation', () => {
  const result = explainValidationAvailability(true, true, 0.85, mockProvenance);
  assert.ok(result.answer.includes('Validation score: 0.85'));
});

test('explainValidationAvailability for mapped without validation', () => {
  const result = explainValidationAvailability(true, false, null, mockProvenance);
  assert.ok(result.answer.includes('no validation data is available'));
  assert.ok(result.answer.includes('does NOT mean validation score = 0'));
});

test('explainJobStatus for CREATED', () => {
  const result = explainJobStatus('1', 'CREATED', '0x' + '01'.repeat(40), '0x' + '02'.repeat(40), 1000000, mockProvenance);
  assert.ok(result.answer.includes('CREATED'));
  assert.ok(result.answer.includes('Waiting for provider'));
});

test('explainJobStatus for COMPLETE', () => {
  const result = explainJobStatus('1', 'COMPLETE', '0x' + '01'.repeat(40), '0x' + '02'.repeat(40), 1000000, mockProvenance);
  assert.ok(result.answer.includes('completed'));
  assert.ok(result.answer.includes('USDC settled'));
});

test('explainJobStatus for REJECTED', () => {
  const result = explainJobStatus('1', 'REJECTED', '0x' + '01'.repeat(40), '0x' + '02'.repeat(40), 1000000, mockProvenance);
  assert.ok(result.answer.includes('rejected'));
  assert.ok(result.answer.includes('refunded'));
});
