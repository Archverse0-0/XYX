'use client';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useAPI } from '../../../../components/client';
import { JobControls } from '../../../../components/product/JobControls';

// ─── Truthful v1.2 state mapping ─────────────────────────────────────────
// Graph returns numeric status; map to PRD v1.2 lifecycle states.
// PREPARING (from operational DB) does not appear in Graph; it is shown only in JobControls.
type GraphState = 'Open' | 'Funded' | 'Submitted' | 'Completed' | 'Rejected' | 'Expired';
const GRAPH_STATE_MAP: Record<GraphState, { label: string; className: string; description: string }> = {
  Open: { label: 'Open', className: 'state-open', description: 'Awaiting provider budget / buyer funding' },
  Funded: { label: 'Funded', className: 'state-funded', description: 'Escrow funded; awaiting provider execution' },
  Submitted: { label: 'Submitted', className: 'state-submitted', description: 'Provider submitted deliverable; awaiting evaluation' },
  Completed: { label: 'Completed', className: 'state-completed', description: 'Settlement confirmed by ERC-8183' },
  Rejected: { label: 'Rejected', className: 'state-rejected', description: 'Evaluator rejected; ERC-8183 atomically refunded the buyer' },
  Expired: { label: 'Expired', className: 'state-refunded', description: 'Expired escrow was refunded through claimRefund' },
};

function StateBadge({ state }: { state: string }) {
  const info = GRAPH_STATE_MAP[state as GraphState] ?? { label: `Unknown (${state})`, className: 'state-unknown' };
  return (
    <span className={`state-badge ${info.className}`} title={info.description}>
      {info.label}
    </span>
  );
}

function usdc(value: unknown): string {
  try {
    const atomic=BigInt(String(value));const whole=atomic/1_000_000n;const fraction=(atomic%1_000_000n).toString().padStart(6,'0').replace(/0+$/,'');
    return `${whole}${fraction?`.${fraction}`:''} USDC`;
  } catch { return '—'; }
}

// ─── Explorer link helper ───────────────────────────────────────────────
const ARCSCAN = 'https://testnet.arcscan.app';
function ExplorerLink({ hash, label }: { hash: string; label: string }) {
  if (!hash || !/^0x[0-9a-fA-F]{64}$/.test(hash)) return null;
  return (
    <a href={`${ARCSCAN}/tx/${hash}`} target="_blank" rel="noopener noreferrer" className="explorer-link">
      {label}: {hash.slice(0, 18)}…{hash.slice(-8)}
    </a>
  );
}

// ─── Safe address display ──────────────────────────────────────────────
function SafeAddress({ value, label }: { value: string; label: string }) {
  const addr = typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value)
    ? `${value.slice(0, 10)}…${value.slice(-6)}`
    : String(value ?? '—');
  return <span className="mono">{label}: {addr}</span>;
}

// ─── Safe hash display ────────────────────────────────────────────────
function SafeHash({ value, label }: { value: string; label: string }) {
  if (!value || typeof value !== 'string') return null;
  const display = value.length > 40 ? `${value.slice(0, 20)}…${value.slice(-12)}` : value;
  return (
    <div>
      <span className="eyebrow">{label}</span>
      <code style={{ fontSize: '0.75rem' }} title={value}>{display}</code>
    </div>
  );
}

export default function Job() {
  const { jobId } = useParams<{ jobId: string }>();
  const api = useAPI();

  // Graph-backed job state (settlement view)
  const q = useQuery({
    queryKey: ['job', jobId],
    queryFn: async () => (await api(`/api/v1/jobs/${jobId}`)).json(),
    enabled: !!jobId,
  });

  // Operational runs (includes PREPARING, uncertain ops)
  const runQ = useQuery({
    queryKey: ['job-runs', jobId],
    queryFn: async () => (await api('/api/v1/job-runs')).json(),
    enabled: !!jobId,
  });

  const data = q.data?.data?.job ?? q.data?.job ?? null;
  const graphAvailable = !q.error && !q.isLoading;
  const isHistoricalJob = String(jobId) === '186075';

  // Derive operational state for this specific job
  const operationalRun = runQ.data?.runs?.find((r: Record<string, unknown>) => r.job_id === jobId);
  const hasUncertainOps = operationalRun?.operations?.some(
    (op: Record<string, unknown>) => op.state !== 'CONFIRMED'
  );

  return (
    <>
      <JobControls jobId={jobId as string} />

      <div className="eyebrow">ERC-8183 PROTECTED JOB</div>
      <h1>Job {jobId} — settlement state</h1>

      {isHistoricalJob && (
        <div className="notice" role="alert">
          <strong>Historical job note:</strong> Job 186075 is the success-path job from the live integration.
          Causal Buyer Agent provider selection (M3) for this specific job is <strong>NOT PROVEN</strong> — no historical evidence
          establishes that the Buyer Agent runtime causally selected provider 894335 before TX1.
          The full v1.2 Protected Job DoD requires a new job for M3 proof.
          Graph/Risk is load-bearing at selection time only; it does not affect this job&apos;s on-chain settlement.
        </div>
      )}

      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>Graph settlement state</h2>
            <p className="muted">Canonical state from the Arc subgraph. ERC-8183 owns escrow; Graph provides indexed history only.</p>
          </div>
        </div>

        {q.isLoading ? (
          <p>Loading job from Graph…</p>
        ) : q.error ? (
          <div className="error" role="alert">
            Graph unavailable: {q.error.message}
            {data && <span> — showing stale or partial cached data.</span>}
          </div>
        ) : data ? (
          <div style={{ display: 'grid', gap: '1rem' }}>
            <div>
              <div className="eyebrow">Settlement status</div>
              <StateBadge state={String(data.status)} />
              <p className="muted" style={{ marginTop: '0.25rem' }}>
                {GRAPH_STATE_MAP[String(data.status) as GraphState]?.description}
              </p>
              {hasUncertainOps && (
                <p className="notice" role="alert">An operational action is in flight. Automatic resubmission is blocked to prevent duplicate spending.</p>
              )}
            </div>

            <div>
              <div className="eyebrow">Participants (on-chain roles)</div>
              <div className="mono" style={{ fontSize: '0.85rem', display: 'grid', gap: '0.25rem' }}>
                <SafeAddress value={data.client} label="Buyer (Circle)" />
                <SafeAddress value={data.provider} label="Provider" />
                <SafeAddress value={data.evaluator} label="Evaluator" />
              </div>
              <p className="muted" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
                Witness, Evaluator, Relayer, Circle buyer, and Provider are distinct roles. Graph/Risk is selection history only.
              </p>
            </div>

            <div>
              <div className="eyebrow">Budget (USDC escrow)</div>
              <p>{usdc(data.budget)}</p>
              <p className="muted">The provider sets the agreed budget before the buyer approves and funds it. Neither party can change it post-funding.</p>
            </div>

            <div>
              <div className="eyebrow">Timing</div>
              <p className="mono">Created: {Number(data.createdAt) ? new Date(Number(data.createdAt) * 1000).toISOString() : '—'}</p>
              <p className="mono">Expires: {Number(data.expiredAt) ? new Date(Number(data.expiredAt) * 1000).toISOString() : '—'}</p>
            </div>

            {data.deliverableHash && <SafeHash value={String(data.deliverableHash)} label="Deliverable hash" />}
            {data.reasonHash && <SafeHash value={String(data.reasonHash)} label="Evaluation reason hash" />}
            {data.evidenceHash && <SafeHash value={String(data.evidenceHash)} label="Evidence hash" />}

            {data.transactionHash && (
              <div>
                <div className="eyebrow">Settlement transaction</div>
                <ExplorerLink hash={String(data.transactionHash)} label="Tx" />
              </div>
            )}
          </div>
        ) : (
          <div>
            <p>No Graph data for job {jobId}.</p>
            {operationalRun && (
              <div className="notice">
                <p>Operational state exists but Graph indexing is not confirmed.</p>
                <p className="mono">State: {String(operationalRun.state)} | Budget: {operationalRun.specification?.budgetUsdc ?? '—'} USDC</p>
              </div>
            )}
          </div>
        )}
      </section>

      {runQ.data?.configured === false && (
        <div className="notice" role="status">
          Protected-job wallet configuration is incomplete. Operational actions are unavailable until configured.
        </div>
      )}
    </>
  );
}
