'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { usePrivy } from '@privy-io/react-auth';
import { useQuery } from '@tanstack/react-query';
import { Login, useAPI } from '../client';

// ─── Types ─────────────────────────────────────────────────────────────
type JobRun = {
  id: string;
  job_id: string | null;
  state: string;
  amount_usdc: string;
  tx_hash: string | null;
  operations: Array<{ operation: string; state: string }> | null;
  specification: { description: string; budgetUsdc: string };
  deliverable_hash?: string | null;
  deliverable_uri?: string | null;
  submission_tx_hash?: string | null;
  evaluation_evidence_uri?: string | null;
  verdict?: unknown;
  signature?: string | null;
  expired_at?: string | null;
  selection_id?: string | null;
};

type Runs = {
  source: 'operational';
  configured: boolean;
  provider: string | null;
  maxJobUsdc: string;
  runs: JobRun[];
};

// ─── Truthful v1.2 state mapping ──────────────────────────────────────
const STATE_LABEL: Record<string, { label: string; className: string; description: string }> = {
  PREPARING: { label: 'Preparing', className: 'state-preparing', description: 'Job request being prepared; no transaction confirmed yet' },
  AWAITING_PROVIDER_BUDGET: { label: 'Awaiting provider budget', className: 'state-open', description: 'Provider must set the budget on-chain before funding' },
  OPEN: { label: 'Open — awaiting budget', className: 'state-open', description: 'Awaiting buyer approval and funding' },
  APPROVAL_PENDING: { label: 'Approval pending', className: 'state-preparing', description: 'Buyer USDC approval in progress' },
  APPROVAL_CONFIRMED: { label: 'Approval confirmed', className: 'state-preparing', description: 'USDC allowance confirmed; funding next' },
  FUNDING_PENDING: { label: 'Funding pending', className: 'state-preparing', description: 'Fund transaction in mempool' },
  FUNDED: { label: 'Funded — awaiting provider submission', className: 'state-funded', description: 'Escrow funded; provider must execute and submit' },
  AWAITING_PROVIDER_EXECUTION: { label: 'Awaiting provider execution', className: 'state-funded', description: 'Provider must perform work and submit deliverable' },
  AWAITING_PROVIDER_SUBMISSION: { label: 'Awaiting provider submission', className: 'state-funded', description: 'Work complete; awaiting on-chain submit' },
  SUBMISSION_BROADCAST: { label: 'Submission broadcast', className: 'state-funded', description: 'Submit transaction in mempool' },
  SUBMITTED: { label: 'Submitted — awaiting evaluation', className: 'state-submitted', description: 'Deliverable verified on-chain; awaiting deterministic evaluation' },
  EVIDENCE_PENDING: { label: 'Evidence pending', className: 'state-preparing', description: 'Constructing canonical evidence bundle' },
  SIGNED_PROTECTED_JOB_EVIDENCE_READY: { label: 'Evidence ready', className: 'state-preparing', description: 'Canonical evidence IPFS-persisted and readback-verified' },
  RESOLUTION_PENDING: { label: 'Resolution pending', className: 'state-preparing', description: 'Submitting JobVerdict to XYXEvaluator' },
  COMPLETED: { label: 'Completed', className: 'state-completed', description: 'ERC-8183 settlement confirmed; provider receives escrow' },
  REJECTED: { label: 'Rejected', className: 'state-rejected', description: 'Deliverable failed criterion; escrow released to buyer' },
  REFUNDED: { label: 'Refunded', className: 'state-refunded', description: 'Escrow returned to buyer' },
  RECONCILIATION_REQUIRED: { label: 'Reconciliation required', className: 'state-unknown', description: 'Ambiguous state requires manual inspection' },
  FAIL_CLOSED: { label: 'Fail-closed', className: 'state-unknown', description: 'Critical dependency unavailable; no settlement verdict submitted' },
  GRAPH_INDEXING_PENDING: { label: 'Graph indexing pending', className: 'state-preparing', description: 'Awaiting subgraph indexing' },
  INDEXED: { label: 'Indexed', className: 'state-completed', description: 'Graph has indexed the outcome' },
};

function StateBadge({ state }: { state: string }) {
  const info = STATE_LABEL[state] ?? { label: state, className: 'state-unknown', description: '' };
  return (
    <span className={`state-badge ${info.className}`} title={info.description}>
      {info.label}
    </span>
  );
}

// ─── Provider link validator ──────────────────────────────────────────
// Provider links may contain only validated jobId/action/deliverableHash.
// Never expose secrets or personal data in public links.
const VALID_ACTIONS = new Set(['execute', 'submit', 'setBudget']);

function validateProviderLinkParams(params: Record<string, unknown>): boolean {
  const jobId = typeof params.jobId === 'string' ? params.jobId : null;
  const action = typeof params.action === 'string' ? params.action : null;
  const deliverableHash = typeof params.deliverableHash === 'string' ? params.deliverableHash : null;
  if (!jobId || !action || !deliverableHash) return false;
  if (!/^\d+$/.test(jobId)) return false;
  if (!VALID_ACTIONS.has(action)) return false;
  if (!/^0x[0-9a-fA-F]{64}$/.test(deliverableHash)) return false;
  return true;
}

// ─── Safe JSON parsing ────────────────────────────────────────────────
function safeParseJSON(input: string): { ok: boolean; value: unknown; error: string } {
  try {
    const value = JSON.parse(input);
    if (typeof value === 'undefined' || typeof value === 'function') {
      return { ok: false, value: null, error: 'Deliverable must be valid JSON (no undefined or functions)' };
    }
    return { ok: true, value, error: '' };
  } catch (e) {
    return { ok: false, value: null, error: e instanceof Error ? e.message : 'Invalid JSON' };
  }
}

// ─── Safe verdict rendering ──────────────────────────────────────────
function SafeVerdict({ verdict }: { verdict: unknown }) {
  let rendered: string;
  try {
    rendered = JSON.stringify(verdict, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2);
  } catch {
    rendered = String(verdict);
  }
  // Sanitize: never print any value that looks like a private key or secret
  const sanitized = rendered.replace(/(?:private[_-]?key|secret|mnemonic|seed)\s*[:=]\s*[^\s"']+/gi, '[REDACTED]');
  return <pre className="mono">{sanitized}</pre>;
}

// ─── Explorer link ───────────────────────────────────────────────────
const ARCSCAN = 'https://testnet.arcscan.app';
function ExplorerLink({ hash, label }: { hash: string; label: string }) {
  if (!hash || !/^0x[0-9a-fA-F]{64}$/.test(hash)) return null;
  return (
    <a href={`${ARCSCAN}/tx/${hash}`} target="_blank" rel="noopener noreferrer" className="explorer-link">
      {label}: {hash.slice(0, 18)}…{hash.slice(-8)}
    </a>
  );
}

// ─── JobActions ──────────────────────────────────────────────────────
function JobActions({ run, configured, refresh }: { run: JobRun; configured: boolean; refresh: () => Promise<unknown> }) {
  const api = useAPI();
  const [deliverable, setDeliverable] = useState('');
  const [submissionTxHash, setSubmissionTxHash] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const uncertain = run.operations?.some(op => op.state !== 'CONFIRMED');

  const isFundable = run.state === 'OPEN' || run.state === 'AWAITING_PROVIDER_BUDGET';
  const isSubmittable = run.state === 'FUNDED' || run.state === 'AWAITING_PROVIDER_SUBMISSION';
  const isEvaluable = run.state === 'SUBMITTED';
  const expired = !!run.expired_at && Date.parse(run.expired_at) <= Date.now();
  const isRefundable = expired && (run.state === 'FUNDED' || run.state === 'SUBMITTED');
  const isCompletedOrRejected = run.state === 'COMPLETED' || run.state === 'REJECTED';

  async function act(action: 'fund' | 'submit' | 'evaluate') {
    setBusy(true);
    setError('');
    setNotice('Request in progress. Awaiting confirmed chain result.');
    try {
      const body =
        action === 'fund'
          ? { budgetUsdc: run.specification.budgetUsdc }
          : action === 'submit'
            ? (() => {
              const parsed = safeParseJSON(deliverable);
              if (!parsed.ok) throw new Error(`Invalid deliverable JSON: ${parsed.error}`);
              if (!/^0x[0-9a-fA-F]{64}$/.test(submissionTxHash)) throw new Error('A confirmed provider submission transaction hash is required');
              return { deliverable: parsed.value, submissionTxHash };
            })()
            : {};

      const result = await (await api(`/api/v1/jobs/${run.job_id}/${action}`, {
        method: 'POST',
        body: JSON.stringify(body),
      })).json();

      if (result.txHash && /^0x[0-9a-fA-F]{64}$/.test(result.txHash)) {
        setNotice(`Confirmed transaction: ${result.txHash.slice(0, 18)}…${result.txHash.slice(-8)}`);
      } else if (result.error === 'EVALUATION_REQUIRES_INSPECTION') {
        setNotice('Evaluation requires inspection. Reconciliation may be needed.');
        setError(result.error);
      } else {
        setNotice(`Confirmed: ${result.jobId ?? action}`);
      }
    } catch (e) {
      setNotice('No new confirmation received. Check operation status before any retry.');
      setError(e instanceof Error ? e.message : 'Operation unavailable');
    } finally {
      setBusy(false);
      await refresh();
    }
  }

  async function refund() {
    setBusy(true);
    setError('');
    setNotice('Requesting refund…');
    try {
      const result = await (await api(`/api/v1/jobs/${run.job_id}/refund`, { method: 'POST' })).json();
      if (result.txHash) {
        setNotice(`Refund confirmed: ${result.txHash.slice(0, 18)}…${result.txHash.slice(-8)}`);
      } else {
        setNotice(`Refund processed: ${result.state}`);
      }
    } catch (e) {
      setNotice('Refund unavailable. Check operation status before retrying.');
      setError(e instanceof Error ? e.message : 'Refund failed');
    } finally {
      setBusy(false);
      await refresh();
    }
  }

  return (
    <article className="panel">
      <h3>{run.job_id ? <Link href={`/jobs/${run.job_id}`}>Job {run.job_id}</Link> : 'Job creation pending'}</h3>
      <p>{run.specification.description}</p>
      <div className="job-meta">
        <StateBadge state={run.state} />
        <span className="mono">Budget: {run.specification.budgetUsdc} USDC</span>
      </div>

      {isCompletedOrRejected && (
        <div className={`verdict verdict-${run.state.toLowerCase()}`}>
          <h4>Evaluator verdict: {run.state}</h4>
          {run.verdict !== undefined && run.verdict !== null && (
            <details>
              <summary>Verdict payload</summary>
              <SafeVerdict verdict={run.verdict} />
            </details>
          )}
          {run.signature && (
            <p className="mono">Signature: <code title={run.signature}>{run.signature.slice(0, 20)}…{run.signature.slice(-8)}</code></p>
          )}
          {run.state === 'COMPLETED' && (
            <p className="muted">Provider settlement is confirmed on ERC-8183. This action cannot be reversed.</p>
          )}
          {run.state === 'REJECTED' && (
            <p className="muted">Evaluator rejected the deliverable and ERC-8183 atomically refunded the buyer.</p>
          )}
        </div>
      )}

      {run.operations && run.operations.length > 0 && (
        <ul>{run.operations.map(op => <li key={op.operation}>{op.operation}: {op.state}</li>)}</ul>
      )}
      {uncertain && (
        <p className="notice" role="alert">An operation is in flight or requires reconciliation. Automatic resubmission is blocked to prevent duplicate spending.</p>
      )}

      <fieldset disabled={busy || uncertain || !configured || !run.job_id}>
        {isFundable && (
          <button onClick={() => void act('fund')}>
            Verify provider budget, approve exact USDC, and fund escrow
          </button>
        )}
        {isSubmittable && (
          <>
            <p className="muted">Provider must submit the deliverable via their wallet. Once submitted on-chain, click below to verify and record.</p>
            <label htmlFor={`deliverable-${run.id}`}>Expected deliverable (JSON)</label>
            <textarea
              id={`deliverable-${run.id}`}
              value={deliverable}
              maxLength={16000}
              onChange={e => setDeliverable(e.target.value)}
              placeholder="Paste the expected deliverable JSON to verify against on-chain submission"
            />
            <label htmlFor={`submission-tx-${run.id}`}>Confirmed provider submission transaction hash</label>
            <input id={`submission-tx-${run.id}`} value={submissionTxHash}
              onChange={event=>setSubmissionTxHash(event.target.value.trim())}
              placeholder="0x…" autoComplete="off" />
            <button disabled={!deliverable || !/^0x[0-9a-fA-F]{64}$/.test(submissionTxHash)} onClick={() => void act('submit')}>
              Verify on-chain provider submission
            </button>
          </>
        )}
        {isEvaluable && (
          <button onClick={() => void act('evaluate')}>
            Verify deliverable and resolve through XYX evaluator
          </button>
        )}
        {isRefundable && (
          <button onClick={() => void refund()}>
            Refund escrow
          </button>
        )}
        {(run.state === 'FUNDED' || run.state === 'SUBMITTED') && !isRefundable && (
          <p className="muted">Funds remain in ERC-8183 escrow. Buyer expiry refund becomes available only after the committed deadline; REJECT refunds atomically.</p>
        )}
      </fieldset>

      {run.submission_tx_hash && <ExplorerLink hash={run.submission_tx_hash} label="Submission" />}
      {run.selection_id && <p className="mono">Selection commitment: <code>{run.selection_id}</code></p>}
      {run.evaluation_evidence_uri && <p className="mono">Evidence: <code>{run.evaluation_evidence_uri}</code></p>}
      {run.deliverable_uri && run.state !== 'FUNDED' && (
        <p className="mono">Deliverable: <code title={run.deliverable_uri}>{run.deliverable_uri}</code></p>
      )}
      {run.tx_hash && <ExplorerLink hash={run.tx_hash} label="Last transaction" />}
      {notice && <p role="status" className="mono">{notice}</p>}
      {error && <p role="alert" className="error">{error}</p>}
    </article>
  );
}

// ─── Main component ──────────────────────────────────────────────────
export function JobControls({ jobId }: { jobId?: string }) {
  const api = useAPI();
  const { authenticated } = usePrivy();

  const q = useQuery<Runs>({
    queryKey: ['job-runs'],
    queryFn: async () => (await api('/api/v1/job-runs')).json(),
    enabled: authenticated,
    refetchInterval: 15000,
  });

  const [description, setDescription] = useState('');
  const [budget, setBudget] = useState('');
  const [expected, setExpected] = useState('');
  const [providerEndpoint, setProviderEndpoint] = useState('');
  const [capability, setCapability] = useState('normalize-text');
  const [taskCategory, setTaskCategory] = useState<'deliverable'|'machine-action'>('deliverable');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const request = useRef<{ key: string; body: string } | null>(null);

  async function create() {
    setBusy(true);
    setError('');
    setNotice('Preparing job request. No transaction is confirmed yet.');
    try {
      let expectedValue: unknown;
      const parsed = safeParseJSON(expected);
      if (!parsed.ok) {
        setError(`Invalid acceptance criterion: ${parsed.error}`);
        setNotice('Job request stopped. Fix the JSON criterion and retry.');
        return;
      }
      expectedValue = parsed.value;

      if (!request.current) {
        const selection=await (await api('/api/v1/jobs/select-provider',{method:'POST',body:JSON.stringify({
          endpoint:providerEndpoint,capability,budgetUsdc:budget,taskCategory,
        })})).json();
        if(selection.status!=='SELECTED'||!/^0x[0-9a-fA-F]{64}$/.test(selection.selectionId??''))throw new Error('Provider selection failed closed');
        request.current = {
          key: crypto.randomUUID(),
          body: JSON.stringify({
            provider: q.data?.provider,
            selectionId:selection.selectionId,
            budgetUsdc: budget,
            description,
            expiresAt: Math.floor(Date.now() / 1000) + 86400,
            evaluation: { kind: 'exact-json-v1', expected: expectedValue },
          }),
        };
      }
      const result = await (await api('/api/v1/jobs', {
        method: 'POST',
        headers: { 'idempotency-key': request.current.key },
        body: request.current.body,
      })).json();

      if (result.jobId) {
        setNotice(`Job ${result.jobId} creation confirmed on Arc. Escrow is not funded yet.${result.txHash ? ` Tx: ${result.txHash.slice(0, 18)}…${result.txHash.slice(-8)}` : ''}`);
      } else {
        setNotice('Job request accepted. Check operational state for confirmation.');
      }
      request.current = null;
      setDescription('');
      setBudget('');
      setExpected('');
      setProviderEndpoint('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Job request stopped');
      setNotice('Confirmation unavailable. Inspect operational state before retrying. A retry reuses the same request key.');
    } finally {
      setBusy(false);
      await q.refetch();
    }
  }

  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <h2>Protected job operations</h2>
          <p className="muted">Operational state is not Graph trust history. ERC-8183 owns escrow; XYX evaluates committed work.
            Graph/Risk is load-bearing at provider selection only.</p>
        </div>
        <Login />
      </div>

      {!authenticated ? (
        <p>Log in to view your jobs and authorize operations.</p>
      ) : q.isLoading ? (
        <p>Checking backend configuration…</p>
      ) : q.error ? (
        <p role="alert" className="error">Job operations are unavailable: {q.error.message}</p>
      ) : (
        <>
          {!q.data?.configured && (
            <p className="notice">Protected-job wallet configuration is incomplete. No simulated transactions are available.</p>
          )}

          {!jobId && (
            <form onSubmit={e => { e.preventDefault(); void create(); }}>
              <fieldset disabled={busy || !q.data?.configured}>
                <label htmlFor="job-description">Objective / work description</label>
                <textarea
                  id="job-description"
                  required
                  maxLength={2000}
                  value={description}
                  readOnly={!!request.current}
                  onChange={e => setDescription(e.target.value)}
                />
                <label htmlFor="provider-endpoint">Provider HTTPS endpoint registered in ERC-8004</label>
                <input id="provider-endpoint" type="url" required value={providerEndpoint} readOnly={!!request.current}
                  onChange={event=>setProviderEndpoint(event.target.value)} placeholder="https://provider.example/api/task" />
                <label htmlFor="job-capability">Required capability</label>
                <input id="job-capability" required maxLength={200} value={capability} readOnly={!!request.current}
                  onChange={event=>setCapability(event.target.value)} />
                <label htmlFor="job-class">Execution class</label>
                <select id="job-class" value={taskCategory} disabled={!!request.current}
                  onChange={event=>setTaskCategory(event.target.value as 'deliverable'|'machine-action')}>
                  <option value="deliverable">Deliverable Job</option>
                  <option value="machine-action" disabled>Machine-Action Job (not implemented)</option>
                </select>
                <label htmlFor="job-budget">Agreed USDC budget (maximum {q.data?.maxJobUsdc})</label>
                <input
                  id="job-budget"
                  inputMode="decimal"
                  required
                  value={budget}
                  readOnly={!!request.current}
                  onChange={e => setBudget(e.target.value)}
                />
                <p className="muted">The buyer confirms this budget. Provider cannot exceed it. Changes post-funding require a new job.</p>

                <label htmlFor="job-expected">Acceptance criterion: exact JSON result</label>
                <textarea
                  id="job-expected"
                  required
                  maxLength={16000}
                  value={expected}
                  readOnly={!!request.current}
                  onChange={e => setExpected(e.target.value)}
                />
                <p className="muted">
                  This verifier checks exact JSON content, not arbitrary natural-language quality.
                  The criterion is committed before funding.
                  Submitted deliverables and evidence are publicly stored on IPFS: do not include secrets or personal data.
                  Expiry is 24 hours after the first request.
                  Supported format: <code>exact-json-v1</code> (canonical JSON comparison).
                </p>

                <p className="mono">Configured provider: {q.data?.provider ?? 'Not configured'}</p>
                <p className="muted">Before creation, the API verifies ERC-8004 identity, Graph provenance/freshness, and deterministic Risk, then journals the selection commitment.</p>

                <button type="submit">
                  {busy ? 'Preparing / awaiting confirmation…' : request.current ? 'Retry same request' : 'Create unfunded job'}
                </button>
              </fieldset>
            </form>
          )}

          {error && <p role="alert" className="error">{error}</p>}
          {notice && <p role="status">{notice}</p>}

          {!q.data?.runs.length && <p>No operational jobs have been recorded for this account.</p>}

          {q.data?.runs
            .filter(r => !jobId || r.job_id === jobId)
            .map(run => (
              <JobActions
                key={run.id}
                run={run}
                configured={!!q.data?.configured}
                refresh={() => q.refetch()}
              />
            ))}
        </>
      )}
    </section>
  );
}
