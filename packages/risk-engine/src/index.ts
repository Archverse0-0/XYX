import { z } from 'zod';
import { address, decimal, hashJSON, hex32, intentSchema, type PurchaseIntent } from '../../shared/src/index.js';

export const MODEL_VERSION = 'xyx-risk-v1';
export const receiptSchema = z.object({
  id: hex32, endpointKey: hex32, payer: address, outcome: z.number().int().min(0).max(8),
  observedAt: z.number().int().nonnegative(), blockNumber: z.number().int().nonnegative(),
});
export type RiskReceipt = z.infer<typeof receiptSchema>;
export const candidateSchema = z.object({
  endpointKey: hex32, providerKey: hex32, specHash: hex32, capability: z.string(),
  priceUsdc: decimal, executable: z.boolean(), protected: z.boolean(),
  validation: z.number().min(0).max(1).nullable(),
});
export type Candidate = z.infer<typeof candidateSchema>;

export function reliability(receipts: RiskReceipt[], endpointKey: string, now: number, indexedBlock: number) {
  const unique = new Map<string, RiskReceipt>();
  for (const raw of receipts) {
    const r = receiptSchema.parse(raw);
    if (r.endpointKey.toLowerCase() !== endpointKey.toLowerCase() || r.observedAt > now || r.observedAt < now - 30 * 86400 || r.blockNumber > indexedBlock || r.outcome > 4) continue;
    const prior = unique.get(r.id.toLowerCase());
    if (prior && hashJSON(prior) !== hashJSON(r)) throw new Error('CONFLICTING_RECEIPT');
    unique.set(r.id.toLowerCase(), r);
  }
  const rows = [...unique.values()].sort((a,b) => a.id.toLowerCase() < b.id.toLowerCase() ? -1 : 1);
  const n = rows.length;
  if (!n) return { count: 0, successes: 0, failures: 0, reliability: null, addressDiversity: 0, confidence: 0, trust: 0.5, status: 'UNOBSERVED' };
  const buyers = new Map<string, number>();
  let successes = 0;
  for (const r of rows) { buyers.set(r.payer.toLowerCase(), (buyers.get(r.payer.toLowerCase()) ?? 0) + 1); if (r.outcome === 0) successes++; }
  const sumSquares = [...buyers.entries()].sort(([a],[b]) => a < b ? -1 : 1).reduce((sum,[,c]) => sum + c*c, 0);
  const diversity = n*n/sumSquares;
  const p = successes/n, z = 1.96, z2 = z*z;
  const wilson = Math.max(0, (p+z2/(2*n)-z*Math.sqrt(p*(1-p)/n+z2/(4*n*n)))/(1+z2/n));
  const confidence = Math.min(1,n/20)*Math.min(1,diversity/5);
  return { count:n, successes, failures:n-successes, reliability:wilson, addressDiversity:diversity, confidence, trust:0.5+confidence*(wilson-0.5), status:'OBSERVED' };
}

// Decimal comparison remains exact; USDC is never compared with floating-point currency arithmetic.
function priceInteger(values: string[]): bigint[] {
  const precision = Math.max(...values.map(v => (v.split('.')[1] ?? '').length));
  if (precision > 36) throw new Error('AMOUNT_PRECISION');
  return values.map(v => { decimal.parse(v); const [a,b=''] = v.split('.'); return BigInt(a!+b.padEnd(precision,'0')); });
}
export function evaluate(input: {
  intent: PurchaseIntent; candidates: Candidate[]; receipts: RiskReceipt[];
  now: number; chainHead: number; indexedBlock: number; maxGraphLagBlocks: number; policyVersion: string;
}) {
  const intent = intentSchema.parse(input.intent);
  for (const n of [input.now,input.chainHead,input.indexedBlock,input.maxGraphLagBlocks]) if (!Number.isSafeInteger(n) || n < 0) throw new Error('INVALID_CONTEXT');
  if (input.indexedBlock > input.chainHead || input.chainHead-input.indexedBlock > input.maxGraphLagBlocks) throw new Error('BLOCKED_TRUST_DATA');
  const candidates = input.candidates.map(c => candidateSchema.parse(c)).sort((a,b) => a.endpointKey.toLowerCase() < b.endpointKey.toLowerCase() ? -1 : 1);
  if (new Set(candidates.map(c=>c.endpointKey.toLowerCase())).size !== candidates.length) throw new Error('DUPLICATE_CANDIDATE');
  const prices = priceInteger([String(intent.maxPriceUsdc), ...candidates.map(c=>c.priceUsdc)]);
  const cap = prices[0]!;
  const rejectedCandidates: {endpointKey:string;reason:string}[] = [];
  const eligible = candidates.flatMap((candidate,i) => {
    const stats = reliability(input.receipts,candidate.endpointKey,input.now,input.indexedBlock);
    const reason = prices[i+1]! > cap ? 'OVER_BUDGET' : candidate.capability !== intent.capability ? 'CAPABILITY_MISMATCH'
      : !candidate.executable ? 'PAYMENT_INCOMPATIBLE' : intent.requireProtection && !candidate.protected ? 'PROTECTION_REQUIRED'
      : stats.trust < (intent.minimumTrust ?? 0) ? 'MINIMUM_TRUST' : stats.count < (intent.minimumEvidenceCount ?? 0) ? 'MINIMUM_EVIDENCE' : null;
    if (reason) { rejectedCandidates.push({endpointKey:candidate.endpointKey,reason}); return []; }
    return [{candidate,stats,price:prices[i+1]!}];
  });
  const min = eligible.reduce((m,c)=>c.price<m?c.price:m,eligible[0]?.price ?? 0n);
  const max = eligible.reduce((m,c)=>c.price>m?c.price:m,0n);
  const w = intent.preference;
  const scores = eligible.map(({candidate,stats,price}) => {
    const priceScore = min===max ? 1 : 1-Number(price-min)/Number(max-min);
    const denominator = w.reliabilityWeight+w.priceWeight+w.protectionWeight+(candidate.validation===null?0:w.validationWeight);
    if (!denominator) throw new Error('NO_AVAILABLE_WEIGHTED_FEATURE');
    const utility = (w.reliabilityWeight*stats.trust+w.priceWeight*priceScore+w.protectionWeight*Number(candidate.protected)+w.validationWeight*(candidate.validation??0))/denominator;
    return { ...candidate, ...stats, priceScore, utility };
  }).sort((a,b)=>b.utility-a.utility || (a.endpointKey.toLowerCase()<b.endpointKey.toLowerCase()?-1:1));
  return { scores, eligibleCandidates:scores.map(s=>s.endpointKey), rejectedCandidates,
    selectedCandidate:scores[0]?.endpointKey??null, policyHash:hashJSON({intent,policyVersion:input.policyVersion}),
    candidateDataHashes:candidates.map(hashJSON), modelVersion:MODEL_VERSION,
    context:{now:input.now,chainHead:input.chainHead,indexedBlock:input.indexedBlock,maxGraphLagBlocks:input.maxGraphLagBlocks},
  };
}
