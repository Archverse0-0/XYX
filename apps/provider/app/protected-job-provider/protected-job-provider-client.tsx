'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Hex } from 'viem';
import {
  BUDGET,
  COMMERCE,
  BUYER,
  EVALUATOR,
  PROVIDER_WALLET,
  ARC_TESTNET_CHAIN_ID_HEX,
  ARC_TESTNET_CHAIN_ID,
  ARC_TESTNET_RPC_URL,
  expectedChain,
  expectedProvider,
  validJobId,
  type ProviderAction,
} from '../../lib/protected-job-provider';
import { ProviderWalletService, type TxState } from '../../lib/provider-wallet';
import { normalizeTask } from '../../lib/task';
import { hashJSON } from '../../../../packages/shared/src/index';

type WalletProvider = { isRabby?:boolean; request:(request:{method:string;params?:unknown[]})=>Promise<unknown>;
  on?:(event:string,listener:()=>void)=>void; removeListener?:(event:string,listener:()=>void)=>void };

function rabbyProvider(): WalletProvider | null {
  const injected=(window as unknown as {ethereum?:WalletProvider&{providers?:WalletProvider[]}}).ethereum;
  return injected?.providers?.find(provider=>provider.isRabby) ?? (injected?.isRabby?injected:null) ?? null;
}

// ─── URL Parameters (validated, never trusted) ──────────────────
function useValidatedParams() {
  const [jobId, setJobId] = useState<string>('');
  const [action, setAction] = useState<ProviderAction>('setBudget');
  const [urlError, setUrlError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const rawJobId = params.get('jobId') ?? '';
    const rawAction = params.get('action') ?? '';

    // Validate jobId
    if (rawJobId && !validJobId(rawJobId)) {
      setUrlError('INVALID_JOB_ID');
      return;
    }

    // Validate action
    if (rawAction && !['setBudget', 'submit'].includes(rawAction)) {
      setUrlError('INVALID_ACTION');
      return;
    }

    setJobId(rawJobId);
    if (rawAction === 'submit') setAction('submit');
    setUrlError(null);
  }, []);

  return { jobId, action, urlError };
}

// ─── Client Component ───────────────────────────────────────────
export default function ProtectedJobProviderClient() {
  const { jobId: urlJobId, action: urlAction, urlError } = useValidatedParams();
  const [jobId, setJobId] = useState(urlJobId);
  const [action, setAction] = useState<ProviderAction>(urlAction);
  const [job, setJob] = useState<any>(null);
  const [simulation, setSimulation] = useState<string>('IDLE');
  const [error, setError] = useState<string>();
  const [txState, setTxState] = useState<TxState>('IDLE');
  const [hash, setHash] = useState<Hex>();
  const [confirmation, setConfirmation] = useState('');
  const [requiredConfirmation, setRequiredConfirmation] = useState('');
  const [taskText, setTaskText] = useState('');
  const [provider, setProvider] = useState<string | null>(null);
  const [accountMatches, setAccountMatches] = useState(false);
  const [chainMatches, setChainMatches] = useState(false);
  const [sendEnabled, setSendEnabled] = useState(false);
  const [blockers, setBlockers] = useState<string[]>([]);

  // Provider wallet service instance
  const walletServiceRef = useRef<ProviderWalletService | null>(null);
  const injectedProviderRef = useRef<WalletProvider | null>(null);

  // Sync URL params when they change
  useEffect(() => {
    if (urlJobId !== undefined) setJobId(urlJobId);
    if (urlAction) setAction(urlAction);
  }, [urlJobId, urlAction]);

  // Initialize wallet service
  useEffect(() => {
    const service = new ProviderWalletService({
      erc8183Address: COMMERCE,
      providerWallet: PROVIDER_WALLET,
      evaluatorAddress: EVALUATOR,
      buyerAddress: BUYER,
      budget: BUDGET,
      arcRpcUrl: ARC_TESTNET_RPC_URL,
    });
    walletServiceRef.current = service;
    return () => service.reset();
  }, []);

  useEffect(() => {
    walletServiceRef.current?.invalidateSimulation();
    setSimulation('IDLE');
    setConfirmation('');
    setRequiredConfirmation('');
    setTxState('IDLE');
  }, [jobId, action, taskText, provider, chainMatches]);

  // ── Wallet Connection ──────────────────────────────────────────
  const connectWallet = async () => {
    setError(undefined);
    try {
      const wallet=rabbyProvider();
      if(!wallet)throw new Error('RABBY_NOT_DETECTED');
      const accounts=await wallet.request({method:'eth_requestAccounts'});
      if(!Array.isArray(accounts)||typeof accounts[0]!=='string')throw new Error('NO_ACCOUNT_SELECTED');
      injectedProviderRef.current=wallet;
      const selected = accounts[0];
      setProvider(selected);

      // Verify it matches the expected provider wallet
      const matches = expectedProvider(selected);
      setAccountMatches(matches);

      if (!matches) {
        setError(`WALLET_MISMATCH: connected ${selected.slice(0, 8)}... but expected ${PROVIDER_WALLET.slice(0, 8)}...`);
      }
    } catch (connectError) {
      setError(`CONNECT_FAILED: ${connectError instanceof Error ? connectError.message : 'unknown'}`);
    }
  };

  // ── Chain Verification ─────────────────────────────────────────
  useEffect(() => {
    const wallet=injectedProviderRef.current;
    if (!provider || !wallet) return;

    const checkChain = async () => {
      try {
        const chainId = await wallet.request({ method: 'eth_chainId' });
        const matches = expectedChain(typeof chainId==='string'?chainId:undefined);
        setChainMatches(matches);
        if (!matches) {
          setError(`WRONG_CHAIN: expected Arc Testnet (${ARC_TESTNET_CHAIN_ID_HEX}), got ${chainId}`);
        }
      } catch {
        setChainMatches(false);
        setError('CHAIN_CHECK_FAILED');
      }
    };

    checkChain();

    // Listen for chain changes
    const handler = () => checkChain();
    wallet.on?.('chainChanged', handler);
    return () => wallet.removeListener?.('chainChanged', handler);
  }, [provider]);

  // ── Job Inspection ─────────────────────────────────────────────
  const inspect = async () => {
    if (!jobId || !action || !walletServiceRef.current) return;

    setError(undefined);
    setSimulation('RUNNING');

    try {
      // Validate jobId format before proceeding
      if (!validJobId(jobId)) {
        throw new Error('INVALID_JOB_ID');
      }

      const service = walletServiceRef.current;

      // Step 1: Inspect job state
      const inspection = await service.inspectJob(jobId, action);
      setJob(inspection.job);

      // Step 2: Verify participants
      if (!inspection.participantsValid) {
        throw new Error(`JOB_PARTICIPANTS_MISMATCH: ${inspection.validationErrors.join(', ')}`);
      }

      // Step 3: Verify chain
      if (!inspection.chainMatch) {
        throw new Error('WRONG_CHAIN: expected Arc Testnet');
      }

      // Step 4: Verify provider
      if (!inspection.providerMatch) {
        throw new Error('PROVIDER_MISMATCH: job provider does not match configured wallet');
      }

      // Step 5: Verify state and budget
      if (!inspection.stateValid) {
        const statusLabels = ['Open', 'Funded', 'Submitted', 'Completed', 'Rejected', 'Expired'];
        throw new Error(`JOB_NOT_READY: status=${statusLabels[inspection.job.status] ?? inspection.job.status}, budget=${inspection.job.budget}`);
      }

      if (!inspection.budgetValid) {
        throw new Error(`BUDGET_MISMATCH: expected ${BUDGET.toString()}, got ${inspection.job.budget.toString()}`);
      }

      // Step 6: Simulate
      const deliverableHash = action === 'submit' ? hashJSON(normalizeTask({text:taskText})) : undefined;

      const simResult = await service.simulate(action, jobId, action === 'submit' ? deliverableHash as `0x${string}` | undefined : undefined);

      if (!simResult.success) {
        throw new Error(`SIMULATION_FAILED: ${simResult.error}`);
      }

      setSimulation('SIMULATION_READY');
      setRequiredConfirmation(service.requiresConfirmation(action, jobId));
      setConfirmation('');
    } catch (e) {
      setJob(null);
      setSimulation('FAILED');
      setError(e instanceof Error ? e.message : 'INSPECTION_FAILED');
    }
  };

  // ── Send Transaction ───────────────────────────────────────────
  const send = async () => {
    if (!walletServiceRef.current || !jobId || !action) return;

    const service = walletServiceRef.current;

    // Explicit confirmation required
    const expectedConfirmation = service.requiresConfirmation(action, jobId);
    if (confirmation !== expectedConfirmation) {
      setError(`CONFIRMATION_MISMATCH: expected "${expectedConfirmation}"`);
      return;
    }

    setError(undefined);
    setTxState('PREPARING');

    try {
      // Prepare calldata
      const deliverableHash = action === 'submit' ? hashJSON(normalizeTask({text:taskText})) : undefined;

      const calldata = service.prepareCalldata(action, jobId, deliverableHash);

      // Broadcast via wallet (EIP-6963 — use the connected wallet, not a hardcoded provider)
      if (!provider) throw new Error('NO_WALLET_CONNECTED');

      setTxState('AWAITING_WALLET');

      const wallet=injectedProviderRef.current;
      if(!wallet)throw new Error('RABBY_NOT_CONNECTED');
      const [currentAccounts,currentChain]=await Promise.all([
        wallet.request({method:'eth_accounts'}),wallet.request({method:'eth_chainId'}),
      ]);
      if(!Array.isArray(currentAccounts)||typeof currentAccounts[0]!=='string'||!expectedProvider(currentAccounts[0]))throw new Error('WALLET_MISMATCH');
      if(!expectedChain(typeof currentChain==='string'?currentChain:undefined))throw new Error('WRONG_CHAIN');
      const latestSimulation=await service.simulate(action,jobId,deliverableHash);
      if(!latestSimulation.success)throw new Error(`SIMULATION_FAILED: ${latestSimulation.error}`);
      const txHash = await wallet.request({
        method: 'eth_sendTransaction',
        params: [{
          from: provider,
          to: COMMERCE,
          data: calldata,
          value: '0x0',
        }],
      });

      setHash(txHash as Hex);
      setTxState('BROADCAST');

      // Broadcast and verify
      const result = await service.broadcastAndVerify(txHash as Hex);

      if (result.receiptStatus === 'success' && result.eventsVerified && result.postStateValid) {
        setTxState('CONFIRMED');
        // Trigger job state re-read for UI update
        await inspect();
      } else if (result.receiptStatus === 'reverted') {
        setTxState('FAILED');
        setError(`TX_REVERTED: ${txHash}`);
      } else {
        setTxState('RECONCILIATION_REQUIRED');
        setError(`RECONCILIATION_REQUIRED: ${result.error ?? 'state ambiguous'}`);
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'SEND_FAILED';

      if (errorMsg.includes('user rejected') || errorMsg.includes('ACTION_REJECTED')) {
        setTxState('WALLET_REJECTED');
      } else {
        setTxState('FAILED');
      }
      setError(`SEND_FAILED: ${errorMsg}`);
    }
  };

  // ── Compute send eligibility ──────────────────────────────────
  useEffect(() => {
    const newBlockers: string[] = [];
    if (!provider) newBlockers.push('connect wallet');
    if (!accountMatches) newBlockers.push('wallet must match provider');
    if (!chainMatches) newBlockers.push('switch to Arc Testnet');
    if (!job) newBlockers.push('inspect job');
    if (simulation !== 'SIMULATION_READY') newBlockers.push('simulation ready');
    if (!requiredConfirmation || confirmation !== requiredConfirmation) newBlockers.push('type exact confirmation');
    setBlockers(newBlockers);
    setSendEnabled(newBlockers.length === 0 && txState === 'IDLE');
  }, [provider, accountMatches, chainMatches, job, simulation, confirmation, requiredConfirmation, txState]);

  // ── Error classification ──────────────────────────────────────
  const errorClassification = useMemo(() => {
    if (!error) return null;
    if (error.includes('INVALID_JOB_ID')) return 'VALIDATION_ERROR';
    if (error.includes('WRONG_CHAIN')) return 'CHAIN_MISMATCH';
    if (error.includes('WALLET_MISMATCH') || error.includes('PROVIDER_MISMATCH')) return 'SIGNER_MISMATCH';
    if (error.includes('JOB_PARTICIPANTS_MISMATCH')) return 'VALIDATION_ERROR';
    if (error.includes('SIMULATION_FAILED')) return 'SIMULATION_FAILED';
    if (error.includes('TX_REVERTED')) return 'ARC_TX_FAILED';
    if (error.includes('RECONCILIATION_REQUIRED')) return 'RECONCILIATION_REQUIRED';
    if (error.includes('CONFIRMATION_MISMATCH')) return 'VALIDATION_ERROR';
    return 'UNKNOWN_ERROR';
  }, [error]);

  // ── Render ────────────────────────────────────────────────────
  return (
    <main style={{ maxWidth: '720px', margin: '0 auto', padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>XYX Protected Job Provider</h1>
      <p style={{ color: '#666', fontSize: '0.875rem' }}>
        Provider wallet: {PROVIDER_WALLET.slice(0, 8)}...{PROVIDER_WALLET.slice(-6)}
        &nbsp;|&nbsp; Chain: Arc Testnet ({ARC_TESTNET_CHAIN_ID_HEX})
      </p>

      {urlError && (
        <div role="alert" style={{ background: '#fff3cd', padding: '1rem', borderRadius: '4px', marginBottom: '1rem' }}>
          <strong>URL Parameter Error:</strong> {urlError}
        </div>
      )}

      {/* Job Parameters */}
      <section style={{ marginBottom: '1.5rem' }}>
        <h2>Job Parameters</h2>
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.5rem' }}>
          <label>
            Job ID:
            <input
              type="text"
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
              placeholder="Enter a job ID"
              style={{ marginLeft: '0.5rem', padding: '0.25rem' }}
            />
          </label>
          <label>
            Action:
            <select
              value={action}
              onChange={(e) => setAction(e.target.value as ProviderAction)}
              style={{ marginLeft: '0.5rem', padding: '0.25rem' }}
            >
              <option value="setBudget">setBudget</option>
              <option value="submit">submit</option>
            </select>
          </label>
        </div>
        {action === 'submit' && (
          <label>
            Task text:
            <textarea value={taskText} onChange={event=>setTaskText(event.target.value)} maxLength={4096}
              placeholder="Enter the exact task input used to build the canonical deliverable" />
          </label>
        )}
        <p><button type="button" onClick={() => void inspect()} disabled={!jobId || !action}>
          {simulation === 'RUNNING' ? 'Inspecting...' : 'Inspect Job'}
        </button></p>
      </section>

      {/* Job State */}
      {job && (
        <section style={{ marginBottom: '1.5rem', background: '#f6f8fa', padding: '1rem', borderRadius: '4px' }}>
          <h2>Job State (Read-Only)</h2>
          <table style={{ width: '100%', fontSize: '0.875rem' }}>
            <tbody>
              <tr><td>Job ID</td><td>{job.id.toString()}</td></tr>
              <tr><td>Client</td><td>{job.client}</td></tr>
              <tr><td>Provider</td><td>{job.provider}</td></tr>
              <tr><td>Evaluator</td><td>{job.evaluator}</td></tr>
              <tr><td>Budget</td><td>{job.budget.toString()}</td></tr>
              <tr><td>Status</td><td>{['Open', 'Funded', 'Submitted', 'Completed', 'Rejected', 'Expired'][job.status] ?? job.status}</td></tr>
              <tr><td>Expires At</td><td>{job.expiredAt.toString()}</td></tr>
              <tr><td>Description</td><td>{job.description}</td></tr>
            </tbody>
          </table>
        </section>
      )}

      {/* Simulation Status */}
      <section style={{ marginBottom: '1.5rem' }}>
        <h2>Simulation Status</h2>
        <p id="sim-status" aria-live="polite">
          {simulation === 'IDLE' && 'Not yet inspected'}
          {simulation === 'RUNNING' && 'Running simulation...'}
          {simulation === 'SIMULATION_READY' && 'Simulation succeeded — ready to send'}
          {simulation === 'FAILED' && 'Simulation failed'}
        </p>
        {simulation === 'SIMULATION_READY' && (
          <p style={{ color: '#1a7f37' }}>Calldata prepared and the call simulation succeeded. Type the confirmation phrase below to proceed.</p>
        )}
      </section>

      {/* Error */}
      {error && (
        <div role="alert" style={{ background: '#fef2f2', padding: '1rem', borderRadius: '4px', marginBottom: '1rem' }}>
          <p><strong>{errorClassification ?? 'Error'}:</strong> {error}</p>
        </div>
      )}

      {/* Confirmation */}
      {simulation === 'SIMULATION_READY' && (
        <section style={{ marginBottom: '1.5rem' }}>
          <h2>Explicit Confirmation</h2>
          <label id="confirmation-label">
            Type <code>{requiredConfirmation}</code> to proceed:
            <input
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
              style={{ marginLeft: '0.5rem', padding: '0.25rem', width: '300px' }}
            />
          </label>
          <p id="send-status" aria-live="polite" style={{ marginTop: '0.5rem' }}>
            {sendEnabled ? 'Ready to send — wallet will prompt for approval.' : 'Cannot send yet. Complete the following:'}
          </p>
          {!sendEnabled && <ul>{blockers.map((b) => <li key={b}>{b}</li>)}</ul>}
          <p style={{ marginTop: '0.5rem' }}>
            <button type="button" disabled={!provider || !accountMatches || !chainMatches || simulation === 'SIMULATION_READY' || simulation === 'RUNNING'} onClick={() => void inspect()}>
              {simulation === 'SIMULATION_READY' ? 'Inspecting...' : 'Re-inspect Job'}
            </button>
          </p>
          <button type="button" aria-describedby="send-status" disabled={!sendEnabled} onClick={() => void send()}>
            Send Transaction
          </button>
        </section>
      )}

      {/* Transaction State */}
      <section style={{ marginBottom: '1.5rem' }}>
        <h2>Transaction State</h2>
        <p>Current state: <strong>{txState}</strong></p>
        {txState === 'WALLET_REJECTED' && <p style={{ color: '#b45309' }}>You rejected the transaction in your wallet.</p>}
        {txState === 'RECONCILIATION_REQUIRED' && <p style={{ color: '#b45309' }}>State is ambiguous — manual reconciliation required.</p>}
        {txState === 'CONFIRMED' && <p style={{ color: '#1a7f37' }}>Transaction confirmed and verified on-chain.</p>}
        {txState === 'FAILED' && <p style={{ color: '#b42318' }}>Transaction failed.</p>}
        {hash && <p>Transaction hash: <code>{hash}</code></p>}
      </section>

      {/* Connection */}
      {!provider && (
        <section style={{ marginBottom: '1.5rem' }}>
          <h2>Wallet Connection</h2>
          <button type="button" onClick={() => void connectWallet()}>Connect Wallet (Rabby)</button>
        </section>
      )}

      {/* Wallet Status */}
      {provider && (
        <section style={{ marginBottom: '1.5rem', background: '#f0fdf4', padding: '1rem', borderRadius: '4px' }}>
          <h2>Wallet Status</h2>
          <p>Connected: {provider}</p>
          <p>Provider match: {accountMatches ? 'YES' : 'NO'}</p>
          <p>Chain match: {chainMatches ? 'YES' : 'NO'}</p>
          {!accountMatches && <p style={{ color: '#b42318' }}>Connected wallet does not match expected provider wallet ({PROVIDER_WALLET.slice(0, 8)}...)</p>}
          {!chainMatches && <p style={{ color: '#b42318' }}>Switch to Arc Testnet (chain ID {ARC_TESTNET_CHAIN_ID})</p>}
        </section>
      )}
    </main>
  );
}
