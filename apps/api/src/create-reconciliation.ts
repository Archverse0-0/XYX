import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { DB } from '../../../packages/shared/src/storage.js';
import type { OperationRow, ProtectedJobReconciler } from '../../../packages/shared/src/reconciler.js';
import { withJobLock } from '../../../packages/shared/src/job-operations.js';
import { jobIdSchema } from '../../../packages/shared/src/jobs.js';
import { hex32 } from '../../../packages/shared/src/index.js';

// Operational maintenance only: this module has no service/SDK execute path.
// Registered behind the API's existing Privy operator onRequest hook.
export function registerCreateReconciliation(
  app: FastifyInstance,
  db: DB,
  owner: (req: FastifyRequest) => string,
  requireReconciler: () => Pick<ProtectedJobReconciler, 'reconcile'>,
) {
  app.post('/api/v1/job-runs/:runId/reconcile-create', async (req, reply) => {
    const { runId } = z.object({ runId: z.string().uuid() }).parse(req.params);
    z.object({}).strict().parse(req.body ?? {});
    const user = owner(req);
    if (!user) return reply.code(401).send({ error: 'UNAUTHORIZED' });
    const owned = await db.query('SELECT id FROM protected_job_runs WHERE id=$1 AND user_id=$2', [runId, user]);
    if (owned.rows.length !== 1) return reply.code(404).send({ error: 'JOB_NOT_FOUND' });
    const reconciler = requireReconciler();
    return withJobLock(db, runId, async () => {
      const { rows } = await db.query("SELECT * FROM job_operations WHERE job_run_id=$1 AND operation='create'", [runId]);
      if (rows.length !== 1) return reply.code(409).send({ error: 'JOB_RECONCILIATION_REQUIRED', status: 'STILL_AMBIGUOUS', retryAllowed: false });
      const row = rows[0] as OperationRow;
      const outcome = await reconciler.reconcile(row, hex32.parse(row.request_hash));
      if (outcome.status === 'RECOVERED_CONFIRMED') {
        const result = z.object({ jobId: jobIdSchema, txHash: hex32.nullable() }).parse(outcome.result);
        return { status: outcome.status, retryAllowed: false, runId, result };
      }
      // A create retry is never authorized by this endpoint. Do not return
      // arbitrary conflict details that could contain internal configuration.
      return reply.code(409).send({
        error: outcome.status === 'CANONICAL_CONFLICT' ? 'JOB_CANONICAL_CONFLICT' : 'JOB_RECONCILIATION_REQUIRED',
        status: outcome.status === 'CANONICAL_CONFLICT' ? 'CANONICAL_CONFLICT' : 'STILL_AMBIGUOUS',
        retryAllowed: false,
      });
    });
  });
}
