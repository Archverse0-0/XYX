import { Outcome } from './index.js';

export type Observation = {
  payment: 'accepted' | 'failed' | 'rail_error' | 'unknown'; requestValid: boolean;
  responseReceived: boolean; httpStatus: number; schemaValid: boolean | null;
  timedOut: boolean; providerTimeoutProven: boolean; withinDeclaredLimits: boolean;
};
export function classify(o: Observation): number {
  if (o.payment === 'failed') return Outcome.PAYMENT_FAILED;
  if (o.payment === 'rail_error') return Outcome.PAYMENT_RAIL_ERROR;
  if (!o.requestValid) return Outcome.CLIENT_INVALID_REQUEST;
  if (o.payment !== 'accepted') return Outcome.AMBIGUOUS;
  if (o.timedOut && o.providerTimeoutProven) return Outcome.PROVIDER_TIMEOUT;
  if (!o.responseReceived) return Outcome.AMBIGUOUS;
  if (o.httpStatus === 429) return o.withinDeclaredLimits ? Outcome.PROVIDER_RATE_LIMIT : Outcome.AMBIGUOUS;
  if (o.httpStatus >= 500 && o.httpStatus <= 599) return Outcome.PROVIDER_HTTP_ERROR;
  if (o.httpStatus < 200 || o.httpStatus >= 300) return Outcome.AMBIGUOUS;
  if (o.schemaValid === false) return Outcome.PROVIDER_SCHEMA_MISMATCH;
  if (o.schemaValid === null) return Outcome.AMBIGUOUS;
  return Outcome.SUCCESS;
}
