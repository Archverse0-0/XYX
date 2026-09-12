import { z } from 'zod';
import { address, atomicAmount, canonicalJSON, hashJSON } from './index.js';

export const usdcAmount = z.string().max(32).regex(/^(0|[1-9]\d*)(\.\d{1,6})?$/);
export const jobIdSchema = z.string().regex(/^(0|[1-9]\d{0,77})$/).refine(id => BigInt(id) < 2n ** 256n);
// P0 deterministic verifier: an explicit, immutable exact-JSON acceptance criterion.
// This does not claim to evaluate arbitrary natural-language work.
export const evaluationSchema = z.object({kind:z.literal('exact-json-v1'),expected:z.unknown().refine(v=>v!==undefined)}).strict()
  .superRefine((value,ctx)=>{
    try { if(Buffer.byteLength(canonicalJSON(value.expected))>16000)ctx.addIssue({code:'custom',message:'SPECIFICATION_TOO_LARGE'}); }
    catch {ctx.addIssue({code:'custom',message:'INVALID_JSON_SPECIFICATION'});}
  });
// Full input schema used for validation (includes transient lifecycle fields).
export const createJobSchema = z.object({
  provider:address,budgetUsdc:usdcAmount,expiresAt:z.number().int().safe(),
  description:z.string().trim().min(1).max(2000),evaluation:evaluationSchema,
}).strict();

// Canonical specification: stable semantic fields only.
// Expiry is intentionally excluded — it is a transient execution-envelope value,
// not part of the task's canonical identity. Two jobs with identical semantics
// but different expiry MUST produce the same specification hash.
export const canonicalJobSpecSchema = createJobSchema.omit({ expiresAt: true }).strict();

// Extract canonical specification fields from a validated createJob input.
export function canonicalJobSpec(input: z.infer<typeof createJobSchema>): unknown {
  return {
    provider: input.provider,
    budgetUsdc: input.budgetUsdc,
    description: input.description,
    evaluation: input.evaluation,
  };
}

export function assertJobBudget(amount:string,max:string) {
  const value=atomicAmount(usdcAmount.parse(amount),6);
  if(value<=0n||value>atomicAmount(usdcAmount.parse(max),6))throw new Error('JOB_BUDGET_EXCEEDED');
  return value;
}
export function assertJobExpiry(expiresAt:number,now=Math.floor(Date.now()/1000)) {
  if(!Number.isSafeInteger(expiresAt)||expiresAt<=now||expiresAt>now+30*86400)throw new Error('INVALID_EXPIRY');
}
export function evaluateDeliverable(specification:unknown,deliverable:unknown) {
  const criterion=evaluationSchema.parse(specification);
  const matched=canonicalJSON(criterion.expected)===canonicalJSON(deliverable);
  const reason={version:'xyx-job-evaluation-v1',verifier:criterion.kind,specificationHash:hashJSON(criterion),
    deliverableHash:hashJSON(deliverable),result:matched?'EXACT_JSON_MATCH':'EXACT_JSON_MISMATCH'};
  return {decision:(matched?1:2) as 1|2,reason,reasonHash:hashJSON(reason)};
}
