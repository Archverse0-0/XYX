import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerCreateReconciliation } from '../../../apps/api/src/create-reconciliation.js';
import { apiError } from '../src/api-errors.js';
import type { DB } from '../src/storage.js';
import type { ReconciliationResult } from '../src/reconciler.js';

const runId = '00000000-0000-4000-8000-000000000001';
const hash = '0x'+'11'.repeat(32);
async function fixture(options: { owner?: string; owned?: boolean; locked?: boolean; missing?: boolean; outcome?: ReconciliationResult; failure?: boolean } = {}) {
  let reconciliations = 0, releases = 0, queries = 0;
  const db = {
    query: async (sql: string, args: unknown[]) => {
      queries++;
      if (sql.includes('user_id=$2')) {
        assert.deepEqual(args, [runId, options.owner ?? 'operator']);
        return { rows: options.owned === false ? [] : [{ id: runId }], rowCount: options.owned === false ? 0 : 1 };
      }
      assert.match(sql, /operation='create'/);
      return { rows: options.missing ? [] : [{ id: 'operation', job_run_id: runId, operation: 'create', request_hash: hash }], rowCount: options.missing ? 0 : 1 };
    },
    connect: async () => ({ query: async () => ({ rows: [{ acquired: options.locked !== true }], rowCount: 1 }), release: () => { releases++; } }),
  } as unknown as DB;
  const app = Fastify();
  app.setErrorHandler((error, _req, reply) => { const result = apiError(error); reply.code(result.status).send({ error: result.error }); });
  registerCreateReconciliation(app, db, () => options.owner ?? 'operator', () => ({ reconcile: async () => {
    reconciliations++;
    if (options.failure) throw new Error('private-upstream-detail');
    return options.outcome ?? { status: 'STILL_AMBIGUOUS' };
  } }));
  return { app, counts: () => ({ reconciliations, releases, queries }) };
}

test('reconcile route checks existing operation without selection freshness or execute access', async () => {
  const { app, counts } = await fixture({ outcome: { status: 'RECOVERED_CONFIRMED', result: { jobId: '42', txHash: hash, ignoredSecret: 'never-return' } } });
  try {
    const response = await app.inject({ method: 'POST', url: `/api/v1/job-runs/${runId}/reconcile-create`, payload: {} });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { status: 'RECOVERED_CONFIRMED', retryAllowed: false, runId, result: { jobId: '42', txHash: hash } });
    assert.equal(counts().reconciliations, 1);
    assert.equal(counts().releases, 1);
  } finally { await app.close(); }
});

for (const status of ['STILL_AMBIGUOUS', 'SAFE_TO_RETRY', 'CANONICAL_CONFLICT'] as const) {
  test(`reconcile route never authorizes create retry for ${status}`, async () => {
    const outcome: ReconciliationResult = status === 'CANONICAL_CONFLICT' ? { status, detail: 'private-detail' } : { status };
    const { app } = await fixture({ outcome });
    try {
      const response = await app.inject({ method: 'POST', url: `/api/v1/job-runs/${runId}/reconcile-create`, payload: {} });
      assert.equal(response.statusCode, 409);
      assert.equal(response.json().retryAllowed, false);
      assert.equal(response.body.includes('private-detail'), false);
    } finally { await app.close(); }
  });
}

for (const options of [{ owner: '' }, { owned: false }, { locked: true }, { missing: true }]) {
  test(`reconcile route fails closed at ${JSON.stringify(options)}`, async () => {
    const { app, counts } = await fixture(options);
    try {
      const response = await app.inject({ method: 'POST', url: `/api/v1/job-runs/${runId}/reconcile-create`, payload: {} });
      assert.ok([401,404,409].includes(response.statusCode));
      assert.equal(counts().reconciliations, 0);
    } finally { await app.close(); }
  });
}

test('reconcile route rejects supplied tx/job identifiers instead of trusting client evidence', async () => {
  const { app, counts } = await fixture();
  try {
    const response = await app.inject({ method: 'POST', url: `/api/v1/job-runs/${runId}/reconcile-create`, payload: { jobId: '42', txHash: hash } });
    assert.equal(response.statusCode, 400);
    assert.equal(counts().queries, 0);
  } finally { await app.close(); }
});

test('reconcile dependency failure is sanitized and releases the run lock', async () => {
  const { app, counts } = await fixture({ failure: true });
  try {
    const response = await app.inject({ method: 'POST', url: `/api/v1/job-runs/${runId}/reconcile-create`, payload: {} });
    assert.equal(response.statusCode, 503);
    assert.equal(response.body.includes('private-upstream-detail'), false);
    assert.equal(counts().releases, 1);
  } finally { await app.close(); }
});
