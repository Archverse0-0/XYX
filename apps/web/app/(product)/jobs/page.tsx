'use client';
import Link from 'next/link';
import { useAPI } from '../../../components/client';
import { JobControls } from '../../../components/product/JobControls';
import { useQuery } from '@tanstack/react-query';

// Truthful v1.2 state mapping for Graph-backed list rows
type GraphState = 'Open' | 'Funded' | 'Submitted' | 'Completed' | 'Rejected' | 'Expired';
const STATE_META: Record<GraphState, { label: string; className: string }> = {
  Open: { label: 'Open', className: 'state-open' },
  Funded: { label: 'Funded', className: 'state-funded' },
  Submitted: { label: 'Submitted', className: 'state-submitted' },
  Completed: { label: 'Completed', className: 'state-completed' },
  Rejected: { label: 'Rejected', className: 'state-rejected' },
  Expired: { label: 'Expired', className: 'state-refunded' },
};

function StateBadge({ state }: { state: string }) {
  const info = STATE_META[state as GraphState] ?? { label: `Unknown (${state})`, className: 'state-unknown' };
  return <span className={`state-badge ${info.className}`}>{info.label}</span>;
}

function usdc(value: unknown): string {
  try {const atomic=BigInt(String(value));const whole=atomic/1_000_000n;const fraction=(atomic%1_000_000n).toString().padStart(6,'0').replace(/0+$/,'');return `${whole}${fraction?`.${fraction}`:''}`;}
  catch{return '—';}
}

function SafeTruncate(value: string, label: string) {
  if (!value) return <span className="mono">{label}: —</span>;
  const display = value.length > 22 ? `${value.slice(0, 10)}…${value.slice(-6)}` : value;
  return <span className="mono" title={value}>{label}: {display}</span>;
}

export default function Jobs() {
  const api=useAPI();
  const q = useQuery({ queryKey: ['jobs'], queryFn: async () => (await api('/api/v1/jobs')).json() });
  const jobs = (q.data?.jobs ?? []) as Array<Record<string, unknown>>;

  return (
    <>
      <JobControls />
      <div className="page-heading">
        <div>
          <div className="eyebrow">ERC-8183 PROTECTED COMMERCE</div>
          <h1>Protected jobs.</h1>
          <p className="muted">
            Escrow and settlement belong to the deployed ERC-8183 contract.
            XYX never presents an Open Purchase as protected.
            Graph provides indexed settlement history for provider selection and audit.
          </p>
        </div>
      </div>
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>Lifecycle index</h2>
            <p className="muted">Only jobs indexed by the configured Arc subgraph appear here.
              Status reflects ERC-8183 on-chain state. Graph/Risk is selection history only.</p>
          </div>
        </div>
        {q.isLoading ? (
          <p>Loading jobs…</p>
        ) : q.error ? (
          <div className="error" role="alert">Protected-job history is unavailable from the live Graph.</div>
        ) : (
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  {['Job', 'Client', 'Provider', 'Evaluator', 'Budget', 'Status', 'Deliverable Hash', 'Evidence Hash', 'Resolved At'].map(x => (
                    <th key={x}>{x}</th>
                  ))}
                </tr>
              </thead>
              <tbody>{jobs.map(j => (
                <tr key={String(j.id)}>
                  <td><Link href={`/jobs/${j.id}`}>{String(j.id)}</Link></td>
                  <td className="mono" title={String(j.client)}>{String(j.client).slice(0, 10)}…{String(j.client).slice(-6)}</td>
                  <td className="mono" title={String(j.provider)}>{String(j.provider).slice(0, 10)}…{String(j.provider).slice(-6)}</td>
                  <td className="mono" title={String(j.evaluator)}>{String(j.evaluator).slice(0, 10)}…{String(j.evaluator).slice(-6)}</td>
                  <td>{usdc(j.budget)}</td>
                  <td><StateBadge state={String(j.status)} /></td>
                  <td className="mono" title={String(j.deliverableHash)}>{(j.deliverableHash as string)?.slice(0, 18) ?? '—'}</td>
                  <td className="mono" title={String(j.evidenceHash)}>{(j.evidenceHash as string)?.slice(0, 18) ?? '—'}</td>
                  <td className="mono">{j.resolvedAt ? String(j.resolvedAt) : '—'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
