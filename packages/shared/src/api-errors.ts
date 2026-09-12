import { z } from 'zod';
const conflicts=new Set(['IDEMPOTENCY_CONFLICT','JOB_BUSY','JOB_RECONCILIATION_REQUIRED','JOB_STATE_CONFLICT',
  'JOB_CONFIGURATION_CHANGED','JOB_PARTICIPANTS_MISMATCH','JOB_BUDGET_MISMATCH']);
const invalid=new Set(['INVALID_EXPIRY','INVALID_DESCRIPTION','PROVIDER_WALLET_MISMATCH','JOB_BUDGET_EXCEEDED','DELIVERABLE_TOO_LARGE']);
export function apiError(error:unknown) {
  if(error instanceof z.ZodError)return {status:400,error:'INVALID_INPUT'};
  const code=error instanceof Error?error.message:'';
  if(conflicts.has(code))return {status:409,error:code};
  if(invalid.has(code))return {status:400,error:code};
  if(code==='JOB_NOT_FOUND')return {status:404,error:code};
  if(code==='PROTECTED_JOB_NOT_CONFIGURED')return {status:503,error:code};
  // Dependency errors may contain URLs, tokens or SQL values. Never echo them.
  return {status:503,error:'DEPENDENCY_OR_OPERATION_UNAVAILABLE'};
}
