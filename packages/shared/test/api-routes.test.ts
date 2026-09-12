import test from 'node:test';
import assert from 'node:assert/strict';
import { ZodError } from 'zod';
import { apiError } from '../../../packages/shared/src/api-errors.js';

// API error handling tests - verifies the error classification layer
// that protects dependency details from leaking to clients.

test('ZodError maps to 400 INVALID_INPUT', () => {
  const error = new ZodError([{ code: 'invalid_type', expected: 'string', received: 'number', path: ['test'], message: 'Expected string, received number' }]);
  assert.deepEqual(apiError(error), { status: 400, error: 'INVALID_INPUT' });
});

test('IDEMPOTENCY_CONFLICT maps to 409', () => {
  assert.deepEqual(apiError(new Error('IDEMPOTENCY_CONFLICT')), { status: 409, error: 'IDEMPOTENCY_CONFLICT' });
});

test('JOB_BUSY maps to 409', () => {
  assert.deepEqual(apiError(new Error('JOB_BUSY')), { status: 409, error: 'JOB_BUSY' });
});

test('JOB_RECONCILIATION_REQUIRED maps to 409', () => {
  assert.deepEqual(apiError(new Error('JOB_RECONCILIATION_REQUIRED')), { status: 409, error: 'JOB_RECONCILIATION_REQUIRED' });
});

test('JOB_NOT_FOUND maps to 404', () => {
  assert.deepEqual(apiError(new Error('JOB_NOT_FOUND')), { status: 404, error: 'JOB_NOT_FOUND' });
});

test('PROTECTED_JOB_NOT_CONFIGURED maps to 503', () => {
  assert.deepEqual(apiError(new Error('PROTECTED_JOB_NOT_CONFIGURED')), { status: 503, error: 'PROTECTED_JOB_NOT_CONFIGURED' });
});

test('INVALID_EXPIRY maps to 400', () => {
  assert.deepEqual(apiError(new Error('INVALID_EXPIRY')), { status: 400, error: 'INVALID_EXPIRY' });
});

test('JOB_BUDGET_EXCEEDED maps to 400', () => {
  assert.deepEqual(apiError(new Error('JOB_BUDGET_EXCEEDED')), { status: 400, error: 'JOB_BUDGET_EXCEEDED' });
});

test('unknown errors never expose dependency details', () => {
  const result = apiError(new Error('connection to postgres://user:pass@host/db refused'));
  assert.equal(result.status, 503);
  assert.equal(result.error, 'DEPENDENCY_OR_OPERATION_UNAVAILABLE');
  assert.ok(!result.error.includes('postgres'));
  assert.ok(!result.error.includes('pass'));
});

test('error with credential-like content is sanitized', () => {
  const result = apiError(new Error('upstream returned API_KEY_abc123secret'));
  assert.equal(result.error, 'DEPENDENCY_OR_OPERATION_UNAVAILABLE');
});

test('non-Error values are sanitized', () => {
  const result = apiError('some string error');
  assert.equal(result.status, 503);
  assert.equal(result.error, 'DEPENDENCY_OR_OPERATION_UNAVAILABLE');
});

test('null error is sanitized', () => {
  const result = apiError(null);
  assert.equal(result.status, 503);
  assert.equal(result.error, 'DEPENDENCY_OR_OPERATION_UNAVAILABLE');
});
