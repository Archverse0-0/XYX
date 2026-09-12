import { keccak256, toHex, concatHex, type Hex } from 'viem';
import { z } from 'zod';

// One canonicalizer for every JSON commitment. Reject lossy/non-JSON inputs.
export function canonicalJSON(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('NON_JSON_NUMBER');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) if (!(i in value)) throw new Error('SPARSE_ARRAY');
    return '[' + value.map(canonicalJSON).join(',') + ']';
  }
  if (typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype) {
    const record = value as Record<string, unknown>;
    return '{' + Object.keys(record).sort().map(k => JSON.stringify(k) + ':' + canonicalJSON(record[k])).join(',') + '}';
  }
  throw new Error('NON_JSON_VALUE');
}
export const hashJSON = (value: unknown): Hex => keccak256(toHex(canonicalJSON(value)));
export const hashText = (value: string): Hex => keccak256(toHex(value));
export const hex32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
export const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
export const decimal = z.string().regex(/^(0|[1-9]\d*)(\.\d+)?$/);
export function atomicAmount(value: string, decimals: number): bigint {
  decimal.parse(value);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) throw new Error('INVALID_DECIMALS');
  const [whole, fraction = ''] = value.split('.');
  if (fraction.length > decimals) throw new Error('AMOUNT_PRECISION');
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0') || '0');
}

export function serviceIdentity(rawUrl: string, method: string, pathTemplate?: string) {
  const url = new URL(rawUrl);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('INVALID_SERVICE_URL');
  const verb = method.toUpperCase();
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(verb)) throw new Error('UNSUPPORTED_METHOD');
  const path = pathTemplate ?? url.pathname;
  if (!path.startsWith('/') || path.includes('?') || path.includes('#') || /[\r\n]/.test(path)) throw new Error('INVALID_PATH');
  const origin = url.origin;
  const providerKey = hashText(origin);
  const endpointKey = keccak256(concatHex([providerKey, toHex(verb), toHex(path)]));
  return { origin, method: verb, path, providerKey, endpointKey };
}

export const Outcome = {
  SUCCESS: 0, PROVIDER_TIMEOUT: 1, PROVIDER_HTTP_ERROR: 2, PROVIDER_SCHEMA_MISMATCH: 3,
  PROVIDER_RATE_LIMIT: 4, CLIENT_INVALID_REQUEST: 5, PAYMENT_FAILED: 6, PAYMENT_RAIL_ERROR: 7, AMBIGUOUS: 8,
} as const;
export const preferences = z.object({
  reliabilityWeight: z.number().min(0).max(1), priceWeight: z.number().min(0).max(1),
  validationWeight: z.number().min(0).max(1), protectionWeight: z.number().min(0).max(1),
}).strict().refine(w => Math.abs(Object.values(w).reduce((a, b) => a + b, 0) - 1) < 1e-9, 'WEIGHTS_MUST_SUM_TO_ONE');
export const acceptedValidatorsSchema=z.array(z.object({address,weight:z.number().finite().positive().max(1)}).strict()).max(20)
  .refine(rows=>new Set(rows.map(r=>r.address.toLowerCase())).size===rows.length,'DUPLICATE_VALIDATOR');
export const intentSchema = z.object({
  capability: z.string().min(1).max(200), query: z.string().max(10000).optional(),
  maxPriceUsdc: z.number().finite().positive().max(10000), minimumTrust: z.number().min(0).max(1).optional(),
  minimumEvidenceCount: z.number().int().nonnegative().optional(), requireProtection: z.boolean(), preference: preferences,
  acceptedValidators:acceptedValidatorsSchema.optional(),
}).strict();
export type PurchaseIntent = z.infer<typeof intentSchema>;
export const defaultPreference = { reliabilityWeight: 0.7, priceWeight: 0.2, validationWeight: 0.1, protectionWeight: 0 };

export const receiptFields = [
  ['providerKey','bytes32'], ['endpointKey','bytes32'], ['specHash','bytes32'], ['payer','address'],
  ['amountPaid','uint128'], ['paymentHash','bytes32'], ['requestHash','bytes32'], ['responseHash','bytes32'],
  ['evidenceHash','bytes32'], ['evidenceURIHash','bytes32'], ['latencyMs','uint32'], ['httpStatus','uint16'],
  ['outcome','uint8'], ['observedAt','uint64'], ['nonce','uint64'], ['providerAgentRegistry','address'], ['providerAgentId','uint256'],
].map(([name,type]) => ({name: name!,type: type!}));
export const receiptTypes = { ReceiptAttestation: receiptFields };
export const verdictTypes = { JobVerdict: [
  {name:'jobId',type:'uint256'}, {name:'evidenceHash',type:'bytes32'}, {name:'reasonHash',type:'bytes32'},
  {name:'decision',type:'uint8'}, {name:'issuedAt',type:'uint64'}, {name:'expiresAt',type:'uint64'}, {name:'nonce',type:'uint64'},
] };
export const receiptDomain = (contract: Hex, chainId = 5042002) => ({ name: 'XYX Evidence Registry', version: '1', chainId, verifyingContract: contract });
export const verdictDomain = (contract: Hex, chainId = 5042002) => ({ name: 'XYX Evaluator', version: '1', chainId, verifyingContract: contract });
