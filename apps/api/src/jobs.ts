import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Address, Hex } from 'viem';
import type { apiConfig } from '../../../packages/shared/src/config.js';
import type { DB } from '../../../packages/shared/src/storage.js';
import type { GraphClient } from '../../../packages/shared/src/graph.js';
import { atomicAmount, canonicalJSON, defaultPreference, hashJSON, hex32, serviceIdentity } from '../../../packages/shared/src/index.js';
import { assertJobBudget, assertJobExpiry, canonicalJobSpec, createJobSchema, jobIdSchema, usdcAmount } from '../../../packages/shared/src/jobs.js';
import { jobOperation, withJobLock } from '../../../packages/shared/src/job-operations.js';
import { ProtectedJobReconciler } from '../../../packages/shared/src/reconciler.js';
import { evidenceStorageFromEnvironment } from '../../../packages/shared/src/evidence.js';
import { CircleAdapter } from '../../../packages/circle-adapter/src/index.js';
import { JobStatus, ProtectedJobService, jobEvent } from '../../../packages/erc8183/service.js';
import { ERC8004Client } from '../../../packages/erc8004/client.js';
import { SelectionEngine } from '../../../packages/erc8004/src/selection-engine.js';
import { canonicalSelectionHash, selectionResultSchema, taskCategorySchema } from '../../../packages/shared/src/selection.js';

interface ProtectedJobRunRow {
  id: string;
  job_id: string | null;
  state: string;
  specification: unknown;
  deliverable_hash: string | null;
  deliverable_uri: string | null;
  submission_tx_hash: string | null;
  commerce_address: string;
  client_address: string;
  provider_address: string;
  evaluator_address: string;
}

const createdResultSchema = z.object({ jobId: jobIdSchema, txHash: hex32 }).strict();
const createRequestSchema = createJobSchema.extend({ selectionId: hex32 }).strict();
const parseSpecification = (value: unknown) => createJobSchema.parse(typeof value === 'string' ? JSON.parse(value) : value);
function operationTxHash(value: unknown): string {
  if(typeof value==='string')return hex32.parse(value);
  return hex32.parse(z.object({txHash:hex32}).passthrough().parse(value).txHash);
}
type Config = z.output<typeof apiConfig>;

export function registerJobs(app: FastifyInstance, db: DB, graph: GraphClient, cfg: Config, owner: (req: FastifyRequest) => string) {
  const service = cfg.PROTECTED_JOB_PROVIDER_ADDRESS
    ? new ProtectedJobService(cfg.ARC_RPC_URL, cfg.ERC8183_ADDRESS as Address, new CircleAdapter(cfg.CIRCLE_AGENT_ADDRESS), cfg.PROTECTED_JOB_PROVIDER_ADDRESS as Address)
    : null;
  const storage = evidenceStorageFromEnvironment(cfg);
  if (!storage) throw new Error('IPFS_STORAGE_CONFIGURATION_REQUIRED');
  const reconciler = service
    ? new ProtectedJobReconciler(db, cfg.ARC_RPC_URL, cfg.ERC8183_ADDRESS as Address, cfg.XYX_EVALUATOR_ADDRESS as Address, cfg.CIRCLE_AGENT_ADDRESS as Address)
    : null;
  const selectionEngine = new SelectionEngine(new ERC8004Client(cfg.ARC_RPC_URL), {
    graphEndpoint:cfg.GRAPH_URL, graphDeploymentId:cfg.GRAPH_DEPLOYMENT_ID, rpc:cfg.ARC_RPC_URL,
  }, graph);
  const configured = () => {
    if (!service) throw new Error('PROTECTED_JOB_NOT_CONFIGURED');
    return service;
  };
  const owned = async (req: FastifyRequest): Promise<ProtectedJobRunRow> => {
    const { jobId } = z.object({ jobId: jobIdSchema }).parse(req.params);
    const { rows } = await db.query('SELECT * FROM protected_job_runs WHERE job_id=$1 AND user_id=$2', [jobId, owner(req)]);
    if (rows.length !== 1) throw new Error('JOB_NOT_FOUND');
    const row = rows[0] as unknown as ProtectedJobRunRow;
    if (
      typeof row.commerce_address !== 'string' || row.commerce_address.toLowerCase() !== cfg.ERC8183_ADDRESS.toLowerCase() ||
      typeof row.client_address !== 'string' || row.client_address.toLowerCase() !== cfg.CIRCLE_AGENT_ADDRESS.toLowerCase() ||
      typeof row.provider_address !== 'string' || row.provider_address.toLowerCase() !== cfg.PROTECTED_JOB_PROVIDER_ADDRESS?.toLowerCase() ||
      typeof row.evaluator_address !== 'string' || row.evaluator_address.toLowerCase() !== cfg.XYX_EVALUATOR_ADDRESS.toLowerCase()
    ) throw new Error('JOB_CONFIGURATION_CHANGED');
    return row;
  };

  app.get('/api/v1/jobs', async () => graph.query(`query {
    jobs(first:100,orderBy:createdAt,orderDirection:desc) {
      id client provider evaluator budget status createdAt expiredAt deliverableHash evidenceHash reasonHash resolvedAt transactionHash
    }
  }`));

  app.get('/api/v1/job-runs', async req => {
    const { rows } = await db.query(`SELECT id,job_id,state,specification,selection_id,amount_usdc,tx_hash,deliverable_hash,deliverable_uri,
      submission_tx_hash,evaluation_evidence_uri,verdict,signature,commerce_address,client_address,provider_address,evaluator_address,
      expired_at,created_at,
      (SELECT jsonb_agg(jsonb_build_object('operation',operation,'state',state,'result',result,'txHash',tx_hash)
        ORDER BY created_at) FROM job_operations WHERE job_run_id=r.id) AS operations
      FROM protected_job_runs r WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100`, [owner(req)]);
    return {
      source: 'operational', configured: !!service, maxJobUsdc: cfg.MAX_JOB_USDC,
      provider: cfg.PROTECTED_JOB_PROVIDER_ADDRESS ?? null, commerce: cfg.ERC8183_ADDRESS,
      buyer: cfg.CIRCLE_AGENT_ADDRESS, evaluator: cfg.XYX_EVALUATOR_ADDRESS, runs: rows,
    };
  });

  app.post('/api/v1/jobs/select-provider', async req => {
    const svc=configured();
    const input=z.object({endpoint:z.string().url(),capability:z.string().trim().min(1).max(200),budgetUsdc:usdcAmount,
      taskCategory:taskCategorySchema,minimumTrust:z.number().min(0).max(1).optional(),minimumEvidenceCount:z.number().int().nonnegative().optional()}).strict().parse(req.body);
    if(input.taskCategory==='machine-action')throw new Error('MACHINE_ACTION_NOT_IMPLEMENTED');
    assertJobBudget(input.budgetUsdc,cfg.MAX_JOB_USDC);
    const identity=serviceIdentity(input.endpoint,'POST');
    const intent={capability:input.capability,maxPriceUsdc:Number(input.budgetUsdc),
      ...(input.minimumTrust===undefined?{}:{minimumTrust:input.minimumTrust}),
      ...(input.minimumEvidenceCount===undefined?{}:{minimumEvidenceCount:input.minimumEvidenceCount}),
      requireProtection:true,preference:defaultPreference,acceptedValidators:[]};
    const selection=await selectionEngine.select({intent,candidates:[{endpoint:input.endpoint,wallet:svc.provider,
      providerKey:identity.providerKey,endpointKey:identity.endpointKey,
      specHash:hashJSON({version:'xyx-protected-provider-v1',endpoint:input.endpoint,wallet:svc.provider,
        capability:input.capability,budgetUsdc:input.budgetUsdc,taskCategory:input.taskCategory}),
      capability:input.capability,priceUsdc:input.budgetUsdc,executable:true,protected:true}],
      taskCategory:input.taskCategory,policyVersion:'xyx-balanced-v1',maxGraphLagBlocks:cfg.MAX_GRAPH_LAG_BLOCKS});
    if(selection.status!=='SELECTED')throw new Error('PROVIDER_SELECTION_FAILED');
    const user=owner(req);await db.query('INSERT INTO users(id) VALUES($1) ON CONFLICT DO NOTHING',[user]);
    const persisted=await db.query(`INSERT INTO provider_selections(selection_id,user_id,selection_hash,result)
      VALUES($1,$2,$3,$4) ON CONFLICT(selection_id) DO NOTHING RETURNING selection_id`,
      [selection.selectionId,user,selection.selectionHash,JSON.stringify(selection)]);
    if(!persisted.rowCount) {
      const existing=await db.query('SELECT selection_hash,result FROM provider_selections WHERE selection_id=$1 AND user_id=$2',[selection.selectionId,user]);
      if(existing.rows.length!==1||existing.rows[0].selection_hash!==selection.selectionHash||
        hashJSON(existing.rows[0].result)!==hashJSON(selection))throw new Error('SELECTION_CONFLICT');
    }
    return selection;
  });

  app.post('/api/v1/jobs', async (req, reply) => {
    const svc = configured();
    const request=createRequestSchema.parse(req.body);
    const {selectionId,...jobFields}=request;
    const input=createJobSchema.parse(jobFields);
    assertJobBudget(input.budgetUsdc, cfg.MAX_JOB_USDC);
    if (input.provider.toLowerCase() !== svc.provider.toLowerCase()) throw new Error('PROVIDER_WALLET_MISMATCH');
    const key = z.string().uuid().parse(req.headers['idempotency-key']);
    const connection = await db.connect();
    let row: ProtectedJobRunRow;
    try {
      await connection.query('BEGIN');
      await connection.query('INSERT INTO users(id) VALUES($1) ON CONFLICT DO NOTHING', [owner(req)]);
      const selectionRow=(await connection.query('SELECT * FROM provider_selections WHERE selection_id=$1 AND user_id=$2 FOR UPDATE',[selectionId,owner(req)])).rows[0];
      if(!selectionRow)throw new Error('PROVIDER_SELECTION_REQUIRED');
      const selection=selectionResultSchema.parse(selectionRow.result);
      const selectionAge=Math.floor(Date.now()/1000)-selection.timestamp;
      if(selection.status!=='SELECTED'||selection.selectionHash!==selectionRow.selection_hash||canonicalSelectionHash(selection)!==selection.selectionHash||
        selection.provider.wallet.toLowerCase()!==input.provider.toLowerCase()||selectionAge<0||selectionAge>300)throw new Error('PROVIDER_SELECTION_INVALID');
      const inserted = await connection.query(`INSERT INTO protected_job_runs(id,user_id,idempotency_key,state,specification,client_address,provider_address,evaluator_address,commerce_address,expired_at,amount_usdc,selection_id)
        VALUES(gen_random_uuid(),$1,$2,'PREPARING',$3,$4,$5,$6,$7,to_timestamp($8),$9,$10)
        ON CONFLICT(user_id,idempotency_key) DO NOTHING RETURNING *`,
      [owner(req), key, JSON.stringify(input), cfg.CIRCLE_AGENT_ADDRESS, input.provider, cfg.XYX_EVALUATOR_ADDRESS, cfg.ERC8183_ADDRESS, input.expiresAt, input.budgetUsdc,selectionId]);
      const fallback = inserted.rows[0] ? null : await connection.query('SELECT * FROM protected_job_runs WHERE user_id=$1 AND idempotency_key=$2', [owner(req), key]);
      const dbRow = (inserted.rows[0] ?? fallback?.rows[0]) as Record<string, unknown> | undefined;
      if (!dbRow) throw new Error('JOB_CREATE_JOURNAL_FAILED');
      if (hashJSON(parseSpecification(dbRow.specification)) !== hashJSON(input)) throw new Error('IDEMPOTENCY_CONFLICT');
      if(dbRow.selection_id!==selectionId)throw new Error('IDEMPOTENCY_CONFLICT');
      if (
        String(dbRow.commerce_address).toLowerCase() !== cfg.ERC8183_ADDRESS.toLowerCase() ||
        String(dbRow.evaluator_address).toLowerCase() !== cfg.XYX_EVALUATOR_ADDRESS.toLowerCase() ||
        String(dbRow.client_address).toLowerCase() !== cfg.CIRCLE_AGENT_ADDRESS.toLowerCase()
      ) throw new Error('JOB_CONFIGURATION_CHANGED');
      const consumed=await connection.query('UPDATE provider_selections SET consumed_by=$2 WHERE selection_id=$1 AND (consumed_by IS NULL OR consumed_by=$2) RETURNING selection_id',[selectionId,dbRow.id]);
      if(consumed.rowCount!==1)throw new Error('PROVIDER_SELECTION_ALREADY_USED');
      await connection.query('COMMIT');
      row = dbRow as unknown as ProtectedJobRunRow;
    } catch (error) {
      await connection.query('ROLLBACK');
      throw error;
    } finally {
      connection.release();
    }

    const result = await withJobLock(db, row.id, async () => {
      const created = createdResultSchema.parse(await jobOperation(db, row.id, 'create', input, async opKey => {
        assertJobExpiry(input.expiresAt);
        return svc.create(input.provider, cfg.XYX_EVALUATOR_ADDRESS, input.expiresAt,
          `${input.description} | XYX specification: ${hashJSON(canonicalJobSpec(input))}`, opKey);
      }, reconciler ?? undefined));
      await db.query("UPDATE protected_job_runs SET job_id=$2,state=CASE WHEN state='PREPARING' THEN 'OPEN' ELSE state END,tx_hash=COALESCE(tx_hash,$3) WHERE id=$1", [row.id, created.jobId, created.txHash]);
      return { runId: row.id, ...created };
    });
    return reply.code(201).send(result);
  });

  app.post('/api/v1/jobs/:jobId/fund', async req => {
    const svc = configured();
    const row = await owned(req);
    const { budgetUsdc } = z.object({ budgetUsdc: usdcAmount }).strict().parse(req.body);
    const amount = assertJobBudget(budgetUsdc, cfg.MAX_JOB_USDC);
    const spec = parseSpecification(row.specification);
    if (amount !== atomicAmount(spec.budgetUsdc, 6)) throw new Error('JOB_BUDGET_MISMATCH');
    if (!row.job_id) throw new Error('JOB_NOT_FOUND');
    return withJobLock(db, row.id, async () => {
      const job = await svc.verifyParticipants(row.job_id!, cfg.XYX_EVALUATOR_ADDRESS);
      if (job.status === JobStatus.FUNDED) {
        await db.query(`UPDATE job_operations SET state='CONFIRMED',
          result=COALESCE(result,jsonb_build_object('confirmedBy','ERC8183_FUNDED_STATE')),
          confirmed_at=COALESCE(confirmed_at,now()),updated_at=now()
          WHERE job_run_id=$1 AND operation IN ('approve','fund') AND state<>'CONFIRMED'`, [row.id]);
        await db.query("UPDATE protected_job_runs SET state='FUNDED' WHERE id=$1", [row.id]);
        return { jobId: row.job_id, state: 'FUNDED', txHash: null, confirmedBy: 'ERC8183_STATE' };
      }
      if (job.status !== JobStatus.OPEN || job.expiredAt <= BigInt(Math.floor(Date.now() / 1000))) throw new Error('JOB_STATE_CONFLICT');
      if (job.budget !== amount) throw new Error('PROVIDER_BUDGET_REQUIRED');
      await jobOperation(db, row.id, 'approve', { amount: amount.toString() }, key => svc.approve(budgetUsdc, key), reconciler ?? undefined);
      const fundTxHash = operationTxHash(await jobOperation(db, row.id, 'fund', { amount: amount.toString() }, key => svc.fund(row.job_id!, key), reconciler ?? undefined));
      if ((await svc.read(row.job_id!)).status !== JobStatus.FUNDED) throw new Error('JOB_STATE_CONFLICT');
      await db.query("UPDATE protected_job_runs SET state='FUNDED',tx_hash=$2 WHERE id=$1", [row.id, fundTxHash]);
      return { jobId: row.job_id, state: 'FUNDED', txHash: fundTxHash };
    });
  });

  app.post('/api/v1/jobs/:jobId/submit', async req => {
    const svc = configured();
    const row = await owned(req);
    const input = z.object({ deliverable: z.unknown().refine(value => value !== undefined), submissionTxHash: hex32,
      deliverableUri: z.string().startsWith('ipfs://').optional() }).strict().parse(req.body);
    if (Buffer.byteLength(canonicalJSON(input.deliverable)) > 16_000) throw new Error('DELIVERABLE_TOO_LARGE');
    const deliverableHash = hashJSON(input.deliverable);
    if (!row.job_id) throw new Error('JOB_NOT_FOUND');
    return withJobLock(db, row.id, async () => {
      const job = await svc.verifyParticipants(row.job_id!, cfg.XYX_EVALUATOR_ADDRESS);
      if (job.status === JobStatus.SUBMITTED && row.state === 'SUBMITTED' &&
          row.deliverable_hash?.toLowerCase() === deliverableHash.toLowerCase() &&
          row.submission_tx_hash?.toLowerCase() === input.submissionTxHash.toLowerCase()) {
        return { jobId: row.job_id, state: 'SUBMITTED', txHash: input.submissionTxHash };
      }
      if ([JobStatus.COMPLETED, JobStatus.REJECTED, JobStatus.EXPIRED].includes(job.status as 3 | 4 | 5)) throw new Error('JOB_ALREADY_RESOLVED');
      if (job.status !== JobStatus.SUBMITTED) throw new Error('PROVIDER_SUBMISSION_REQUIRED');
      await svc.verifySubmission(row.job_id!, deliverableHash as Hex, input.submissionTxHash as Hex);
      let deliverableUri = input.deliverableUri;
      if (deliverableUri) await storage.readJSON(deliverableUri, deliverableHash);
      else deliverableUri = (await storage.persist(input.deliverable)).evidenceURI;
      await db.query("UPDATE protected_job_runs SET state='SUBMITTED',deliverable_hash=$2,deliverable_uri=$3,submission_tx_hash=$4 WHERE id=$1",
        [row.id, deliverableHash, deliverableUri, input.submissionTxHash]);
      return { jobId: row.job_id, state: 'SUBMITTED', txHash: input.submissionTxHash };
    });
  });

  app.get('/api/v1/jobs/:jobId', async req => {
    const { jobId } = z.object({ jobId: jobIdSchema }).parse(req.params);
    return graph.query('query($id:ID!){job(id:$id){id client provider evaluator budget status createdAt expiredAt deliverableHash reasonHash evidenceHash resolvedAt transactionHash}}', { id: jobId });
  });

  app.post('/api/v1/jobs/:jobId/evaluate', async (req, reply) => {
    const row = await owned(req);
    z.object({}).strict().parse(req.body ?? {});
    const response = await fetch(new URL('/internal/resolve-job', cfg.WITNESS_URL), { method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.INTERNAL_SERVICE_TOKEN}` },
      body: JSON.stringify({ jobId: row.job_id }), signal: AbortSignal.timeout(120_000) });
    if (!response.ok) return reply.code(409).send({ error: 'EVALUATION_REQUIRES_INSPECTION', reconciliationRequired: true });
    return z.object({ jobId: jobIdSchema, decision: z.union([z.literal(1), z.literal(2)]), txHash: hex32 }).parse(await response.json());
  });

  app.post('/api/v1/jobs/:jobId/refund', async req => {
    const svc = configured();
    const row = await owned(req);
    z.object({}).strict().parse(req.body ?? {});
    if (!row.job_id) throw new Error('JOB_NOT_FOUND');
    return withJobLock(db, row.id, async () => {
      const before=await svc.getJobState(row.job_id!);
      if(!before.isExpired) {
        const eligibility = await svc.isRefundEligible(row.job_id!);
        if (!eligibility.eligible) throw new Error(eligibility.reason);
      } else {
        const prior=await db.query("SELECT id FROM job_operations WHERE job_run_id=$1 AND operation='refund'",[row.id]);
        if(prior.rows.length!==1)throw new Error('JOB_ALREADY_EXPIRED_AND_REFUNDED');
      }
      const expectedAmount = before.job.budget;
      const txHash = operationTxHash(await jobOperation(db, row.id, 'refund', { jobId: row.job_id }, key => svc.claimRefund(row.job_id!, key), reconciler ?? undefined));
      const receipt = await svc.client.getTransactionReceipt({ hash: txHash as Hex });
      if (receipt.status !== 'success') throw new Error('REFUND_TX_FAILED');
      const refunded = jobEvent(receipt.logs, cfg.ERC8183_ADDRESS as Address, 'Refunded');
      if (String(refunded.jobId) !== row.job_id || String(refunded.client).toLowerCase() !== cfg.CIRCLE_AGENT_ADDRESS.toLowerCase() || refunded.amount !== expectedAmount)
        throw new Error('REFUND_EVENT_UNVERIFIED');
      if ((await svc.read(row.job_id!)).status !== JobStatus.EXPIRED) throw new Error('REFUND_STATE_UNVERIFIED');
      await db.query("UPDATE protected_job_runs SET state='REFUNDED',tx_hash=$2 WHERE id=$1", [row.id, txHash]);
      return { jobId: row.job_id, state: 'REFUNDED', txHash };
    });
  });
}
