import { z } from 'zod';
import { address, hashJSON, hex32 } from './index.js';

export const taskCategorySchema = z.enum(['deliverable', 'machine-action']);
export const identityVerificationResultSchema = z.object({
  verified: z.boolean(), agentId: z.string().optional(), registry: address.optional(),
  walletMatch: z.boolean().optional(), endpointMatch: z.boolean().optional(), failureReason: z.string().optional(),
}).strict();
export const graphProvenanceSchema = z.object({
  deployment: z.string().min(1), deploymentId: z.string().min(1), indexedBlock: z.number().int().nonnegative(),
  indexedBlockHash: hex32, hasIndexingErrors: z.boolean(), headBlock: z.number().int().nonnegative(),
  lagBlocks: z.number().int().nonnegative(), queriedAt: z.number().int().nonnegative(),
}).strict();
export const riskInputSchema = z.object({
  policyVersion: z.string().min(1), intentSnapshot: z.unknown(), candidateCount: z.number().int().nonnegative(),
  receiptCount: z.number().int().nonnegative(), maxGraphLagBlocks: z.number().int().nonnegative(),
  preference: z.object({ reliabilityWeight:z.number(), priceWeight:z.number(), validationWeight:z.number(), protectionWeight:z.number() }).strict(),
}).strict();
export const riskOutputSchema = z.object({
  modelVersion: z.string().min(1), selectedCandidate: hex32.nullable(), eligibleCandidates: z.array(hex32),
  rejectedCandidates: z.array(z.object({ endpointKey: hex32, reason: z.string() })), policyHash: hex32,
  candidateDataHashes: z.array(hex32), trustScores: z.array(z.object({ endpointKey:hex32, trust:z.number().nullable(),
    confidence:z.number(), count:z.number().int().nonnegative(), status:z.string() })),
}).strict();
const base = z.object({ selectionId:hex32, timestamp:z.number().int().nonnegative(), taskCategory:taskCategorySchema, selectionHash:hex32 });
const selected = base.extend({
  status:z.literal('SELECTED'),
  provider:z.object({ endpoint:z.string().url(), wallet:address, erc8004:identityVerificationResultSchema }).strict(),
  graph:graphProvenanceSchema,
  historicalOutcomes:z.object({ receiptCount:z.number().int().nonnegative(), successCount:z.number().int().nonnegative(),
    failureCount:z.number().int().nonnegative(), excludedOutcomes:z.number().int().nonnegative() }).strict(),
  risk:z.object({ input:riskInputSchema, output:riskOutputSchema }).strict(),
}).strict();
const failed = base.extend({
  status:z.enum(['FAIL_CLOSED','NO_ELIGIBLE_CANDIDATE']), failureReason:z.string().min(1), provider:z.null(),
  graph:graphProvenanceSchema.optional(), risk:z.object({ input:riskInputSchema, output:riskOutputSchema }).strict().optional(),
}).strict();
export const selectionResultSchema = z.union([selected, failed]);
export type SelectionResult = z.infer<typeof selectionResultSchema>;
export type IdentityVerificationResult = z.infer<typeof identityVerificationResultSchema>;
export type GraphProvenance = z.infer<typeof graphProvenanceSchema>;
export type RiskInput = z.infer<typeof riskInputSchema>;
export type RiskOutput = z.infer<typeof riskOutputSchema>;

export function canonicalSelectionHash(result: Omit<SelectionResult, 'selectionHash'> | SelectionResult): string {
  const { selectionHash: _ignored, ...commitment } = result as SelectionResult;
  return hashJSON(commitment);
}

export function selectionIdFor(commitment: unknown): string {
  return hashJSON({ version:'xyx-provider-selection-v1', commitment });
}
