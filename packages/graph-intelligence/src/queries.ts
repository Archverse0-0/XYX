import { z } from 'zod';
import type { GraphClient } from '../../shared/src/graph.js';
import type { Provenance } from './guardrails.js';
import { buildProvenance } from './guardrails.js';
import type { EvidenceContext } from './evidence-context.js';

// Well-defined Graph investigation tasks.
// Each query returns structured data with provenance.
// No write operations — READ-ONLY semantics enforced.

export interface EndpointSummary {
  endpointKey: string;
  providerKey: string;
  receiptCount: number;
  scoredSuccesses: number;
  scoredFailures: number;
  excludedOutcomes: number;
  lastObservedAt: number;
}

export interface ReceiptDetail {
  id: string;
  providerKey: string;
  endpointKey: string;
  payer: string;
  amountPaid: number;
  outcome: number;
  httpStatus: number;
  latencyMs: number;
  evidenceURI: string;
  observedAt: number;
  blockNumber: number;
  transactionHash: string;
}

export interface JobSummary {
  id: string;
  client: string;
  provider: string;
  evaluator: string;
  budget: number;
  status: string;
  createdAt: number;
}

export interface ValidationDetail {
  id: string;
  validator: string;
  response: number;
  updatedAt: number;
}

export interface GraphIntelligenceResult<T> {
  data: T;
  provenance: Provenance;
}

const endpointSchema = z.object({
  endpoints: z.array(z.object({
    id: z.string(),
    providerKey: z.string(),
    receiptCount: z.coerce.number(),
    scoredSuccesses: z.coerce.number(),
    scoredFailures: z.coerce.number(),
    excludedOutcomes: z.coerce.number(),
    lastObservedAt: z.coerce.number(),
  })),
  _meta: z.object({
    deployment: z.string(),
    block: z.object({ number: z.coerce.number(), hash: z.string().nullable() }),
  }),
});

const receiptSchema = z.object({
  receipt: z.object({
    id: z.string(),
    providerKey: z.string(),
    endpoint: z.object({ id: z.string() }),
    payer: z.string(),
    amountPaid: z.coerce.number(),
    outcome: z.number(),
    httpStatus: z.number(),
    latencyMs: z.number(),
    evidenceURI: z.string(),
    observedAt: z.coerce.number(),
    blockNumber: z.coerce.number(),
    transactionHash: z.string(),
  }).nullable(),
  _meta: z.object({
    deployment: z.string(),
    block: z.object({ number: z.coerce.number(), hash: z.string().nullable() }),
  }),
});

const jobSchema = z.object({
  jobs: z.array(z.object({
    id: z.string(),
    client: z.string(),
    provider: z.string(),
    evaluator: z.string(),
    budget: z.coerce.number(),
    status: z.string(),
    createdAt: z.coerce.number(),
  })),
  _meta: z.object({
    deployment: z.string(),
    block: z.object({ number: z.coerce.number(), hash: z.string().nullable() }),
  }),
});

const validationSchema = z.object({
  validations: z.array(z.object({
    id: z.string(),
    validator: z.string(),
    response: z.number(),
    updatedAt: z.coerce.number(),
  })),
});

export class GraphIntelligence {
  constructor(private graph: GraphClient) {}

  async endpoints(): Promise<GraphIntelligenceResult<EndpointSummary[]>> {
    const data = await this.graph.query<{ endpoints: unknown; _meta: unknown }>(
      `query { _meta { deployment block { number hash } } endpoints(first: 1000, orderBy: lastObservedAt, orderDirection: desc) { id providerKey receiptCount scoredSuccesses scoredFailures excludedOutcomes lastObservedAt } }`
    );
    const parsed = endpointSchema.parse(data);
    return {
      data: parsed.endpoints.map(e => ({
        endpointKey: e.id,
        providerKey: e.providerKey,
        receiptCount: e.receiptCount,
        scoredSuccesses: e.scoredSuccesses,
        scoredFailures: e.scoredFailures,
        excludedOutcomes: e.excludedOutcomes,
        lastObservedAt: e.lastObservedAt,
      })),
      provenance: buildProvenance(parsed._meta.deployment, parsed._meta.block, parsed.endpoints.map(e => e.id)),
    };
  }

  async receiptDetail(receiptHash: string): Promise<GraphIntelligenceResult<ReceiptDetail | null>> {
    const data = await this.graph.query<{ receipt: unknown; _meta: unknown }>(
      `query($id: ID!) { _meta { deployment block { number hash } } receipt(id: $id) { id providerKey endpoint { id } payer amountPaid outcome httpStatus latencyMs evidenceURI observedAt blockNumber transactionHash } }`,
      { id: receiptHash }
    );
    const parsed = receiptSchema.parse(data);
    if (!parsed.receipt) return { data: null, provenance: buildProvenance(parsed._meta.deployment, parsed._meta.block) };
    const r = parsed.receipt;
    return {
      data: {
        id: r.id,
        providerKey: r.providerKey,
        endpointKey: r.endpoint.id,
        payer: r.payer,
        amountPaid: r.amountPaid,
        outcome: r.outcome,
        httpStatus: r.httpStatus,
        latencyMs: r.latencyMs,
        evidenceURI: r.evidenceURI,
        observedAt: r.observedAt,
        blockNumber: r.blockNumber,
        transactionHash: r.transactionHash,
      },
      provenance: buildProvenance(parsed._meta.deployment, parsed._meta.block, [r.id], [r.id]),
    };
  }

  async jobs(): Promise<GraphIntelligenceResult<JobSummary[]>> {
    const data = await this.graph.query<{ jobs: unknown; _meta: unknown }>(
      `query { _meta { deployment block { number hash } } jobs(first: 1000, orderBy: createdAt, orderDirection: desc) { id client provider evaluator budget status createdAt } }`
    );
    const parsed = jobSchema.parse(data);
    return {
      data: parsed.jobs.map(j => ({
        id: j.id,
        client: j.client,
        provider: j.provider,
        evaluator: j.evaluator,
        budget: j.budget,
        status: j.status,
        createdAt: j.createdAt,
      })),
      provenance: buildProvenance(parsed._meta.deployment, parsed._meta.block, parsed.jobs.map(j => j.id)),
    };
  }

  async jobDetail(jobId: string): Promise<GraphIntelligenceResult<JobSummary | null>> {
    const data = await this.graph.query<{ job: unknown; _meta: unknown }>(
      `query($id: ID!) { _meta { deployment block { number hash } } job(id: $id) { id client provider evaluator budget status createdAt } }`,
      { id: jobId }
    );
    const parsed = jobSchema.parse({ jobs: data.job ? [data.job] : [], _meta: data._meta });
    return {
      data: parsed.jobs[0] ?? null,
      provenance: buildProvenance(parsed._meta.deployment, parsed._meta.block, [jobId]),
    };
  }

  async endpointEvidenceContext(endpointKey: string, block: number): Promise<EvidenceContext> {
    const data = await this.graph.query<{ endpoint: unknown }>(
      `query($key: ID!, $block: Int!) { endpoint(id: $key, block: { number: $block }) { id providerKey receiptCount scoredSuccesses scoredFailures excludedOutcomes lastObservedAt } }`,
      { key: endpointKey.toLowerCase(), block }
    );

    const endpoint = (data.endpoint as Record<string, unknown>) ?? null;
    if (!endpoint) {
      return {
        endpointKey,
        providerKey: '0x' + '0'.repeat(40),
        receiptCount: 0,
        successCount: 0,
        failureCount: 0,
        excludedOutcomes: 0,
        lastObservedAt: null,
        addressDiversity: null,
        uniquePayers: 0,
        trust: 0.5,
        status: 'UNOBSERVED',
        validationAvailable: false,
        validationScore: null,
        erc8004Mapped: false,
        provenance: buildProvenance('', { number: block, hash: null }),
      };
    }

    return {
      endpointKey,
      providerKey: String(endpoint.providerKey),
      receiptCount: Number(endpoint.receiptCount),
      successCount: Number(endpoint.scoredSuccesses),
      failureCount: Number(endpoint.scoredFailures),
      excludedOutcomes: Number(endpoint.excludedOutcomes),
      lastObservedAt: Number(endpoint.lastObservedAt),
      addressDiversity: null,
      uniquePayers: 0,
      trust: 0.5,
      status: 'OBSERVED',
      validationAvailable: false,
      validationScore: null,
      erc8004Mapped: false,
      provenance: buildProvenance('', { number: block, hash: null }),
    };
  }
}
