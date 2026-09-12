'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ARC_TESTNET_CHAIN_ID,
  ARC_TESTNET_CHAIN_ID_HEX,
  ARC_TESTNET_RPC_URL,
  BUYER,
  COMMERCE,
  DELIVERABLE_HASH,
  EVALUATOR,
  PROVIDER_WALLET,
  actionCalldata,
  actionConfirmation,
  assertProviderJob,
  decodeJob,
  expectedChain,
  expectedProvider,
  readJobCalldata,
  validJobId,
  type ProviderAction,
} from '../../lib/protected-job-provider';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TxState = 'IDLE' | 'SUBMITTED' | 'CONFIRMED' | 'REVERTED' | 'FAILED';
type WalletConnectionState =
  | 'DISCOVERING'
  | 'READY'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'RABBY_NOT_FOUND'
  | 'FAILED';

type WalletProvider = {
  isRabby?: boolean;
  info?: { uuid?: string };
  request: (request: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (
    event: 'accountsChanged' | 'chainChanged' | 'disconnect',
    listener: (...args: unknown[]) => void,
  ) => void;
  removeListener?: (
    event: 'accountsChanged' | 'chainChanged' | 'disconnect',
    listener: (...args: unknown[]) => void,
  ) => void;
};

type Eip6963Announcement = {
  info?: { rdns?: string; uuid?: string };
  provider?: WalletProvider;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function rpcErrorCode(error: unknown): number | undefined {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'number') {
    return error.code;
  }
  return undefined;
}

/**
 * Find the Rabby provider among injected providers.
 *
 * Priority:
 *   1. Provider with `isRabby` flag.
 *   2. Provider whose `info.uuid` contains 'rabb'.
 *   3. null (not found).
 */
function findRabbyProvider(): WalletProvider | null {
  if (typeof window === 'undefined') return null;

  const injected = (window as { ethereum?: WalletProvider }).ethereum;
  if (!injected) return null;

  const ethereum = injected as WalletProvider & { providers?: WalletProvider[] };
  const candidates: WalletProvider[] = [...(ethereum.providers ?? []), injected];

  const byFlag = candidates.find((item) => item.isRabby);
  if (byFlag) return byFlag;

  const byUuid = candidates.find((item) => /rabb/i.test(item.info?.uuid ?? ''));
  if (byUuid) return byUuid;

  return null;
}

function isRabbyAnnouncement(announcement: Eip6963Announcement): boolean {
  return Boolean(
    announcement.provider?.isRabby ||
      /rabb/i.test(announcement.provider?.info?.uuid ?? '') ||
      /rabby/i.test(announcement.info?.rdns ?? '') ||
      /rabby/i.test(announcement.info?.uuid ?? ''),
  );
}

async function discoverRabbyProvider(): Promise<WalletProvider | null> {
  if (typeof window === 'undefined') return null;

  const injected = findRabbyProvider();
  if (injected) return injected;

  return new Promise((resolve) => {
    let settled = false;
    let timeoutId: number | undefined;

    const finish = (provider: WalletProvider | null) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('eip6963:announceProvider', onAnnounce);
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      resolve(provider);
    };

    const onAnnounce = (event: Event) => {
      const announcement = (event as CustomEvent<Eip6963Announcement>).detail;
      if (announcement?.provider && isRabbyAnnouncement(announcement)) {
        finish(announcement.provider);
      }
    };

    window.addEventListener('eip6963:announceProvider', onAnnounce);
    // EIP-6963 announcements normally arrive immediately, but a short grace
    // period makes discovery reliable while an extension is still unlocking.
    timeoutId = window.setTimeout(() => finish(null), 1_000);
    window.dispatchEvent(new Event('eip6963:requestProvider'));
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ProtectedJobProviderClient() {
  // --- state ---------------------------------------------------------------
  const [provider, setProvider] = useState<WalletProvider | null>(null);
  const [account, setAccount] = useState<string>();
  const [chain, setChain] = useState<string>();
  const [jobId, setJobId] = useState('186075');
  const [action, setAction] = useState<ProviderAction>('setBudget');
  const [job, setJob] = useState<string>('PENDING');
  const [simulation, setSimulation] = useState<string>('PENDING');
  const [gas, setGas] = useState<string>();
  const [simulationKey, setSimulationKey] = useState<string>();
  const inspectionVersion = useRef(0);
  const [confirmation, setConfirmation] = useState('');
  const [txState, setTxState] = useState<TxState>('IDLE');
  const [hash, setHash] = useState<string>();
  const [error, setError] = useState<string>();
  const [discovered, setDiscovered] = useState<WalletProvider[]>([]);
  const [connectionState, setConnectionState] = useState<WalletConnectionState>('DISCOVERING');
  const announcedRabbyRef = useRef<WalletProvider | null>(null);

  // --- derived -------------------------------------------------------------
  const accountMatches = expectedProvider(account);
  const chainMatches = expectedChain(chain);
  const valid = validJobId(jobId);
  const calldata = useMemo(
    () => (valid ? actionCalldata(action, BigInt(jobId)) : undefined),
    [action, jobId, valid],
  );
  const required = valid ? actionConfirmation(action, jobId) : '';
  const currentSimulationKey = JSON.stringify([account, chain, jobId, action]);

  const sendEnabled =
    Boolean(provider) &&
    Boolean(accountMatches) &&
    Boolean(chainMatches) &&
    Boolean(valid) &&
    Boolean(calldata) &&
    simulation === 'SIMULATION PASSED' &&
    simulationKey === currentSimulationKey &&
    Boolean(gas) &&
    confirmation === required;

  // Keep the server render and the browser's first render identical. Reading
  // window.ethereum here causes a hydration mismatch when Rabby is installed.
  const rabbyDetected =
    connectionState === 'READY' ||
    connectionState === 'CONNECTING' ||
    connectionState === 'CONNECTED';
  // --- wallet actions ------------------------------------------------------
  const refresh = async (activeProvider: WalletProvider) => {
    const [accounts, currentChainId] = await Promise.all([
      activeProvider.request({ method: 'eth_accounts' }) as Promise<unknown>,
      activeProvider.request({ method: 'eth_chainId' }) as Promise<unknown>,
    ]);
    setAccount(
      Array.isArray(accounts) && typeof accounts[0] === 'string' ? accounts[0] : undefined,
    );
    setChain(typeof currentChainId === 'string' ? currentChainId : undefined);
  };

  const connect = async () => {
    setError(undefined);
    setConnectionState('DISCOVERING');
    const selected = announcedRabbyRef.current ?? (await discoverRabbyProvider());
    if (!selected) {
      setConnectionState('RABBY_NOT_FOUND');
      setError('RABBY_NOT_DETECTED: install or unlock Rabby, then click Connect Rabby again.');
      return;
    }
    try {
      announcedRabbyRef.current = selected;
      setConnectionState('CONNECTING');
      await selected.request({ method: 'eth_requestAccounts' });
      setProvider(selected);
      await refresh(selected);
      setConnectionState('CONNECTED');
    } catch (connectError) {
      setConnectionState('FAILED');
      setError(`CONNECT_FAILED: ${errorMessage(connectError)}`);
    }
  };

  const switchToArc = async () => {
    if (!provider) return;
    setError(undefined);
    try {
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: ARC_TESTNET_CHAIN_ID_HEX }],
      });
      await refresh(provider);
    } catch (switchError) {
      const code = rpcErrorCode(switchError);
      if (code !== 4902) {
        setError(`NETWORK_SWITCH_FAILED: ${errorMessage(switchError)}`);
        return;
      }
      try {
        await provider.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: ARC_TESTNET_CHAIN_ID_HEX,
              chainName: 'Arc Testnet',
              nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
              rpcUrls: [ARC_TESTNET_RPC_URL],
              blockExplorerUrls: ['https://testnet.arcscan.app'],
            },
          ],
        });
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: ARC_TESTNET_CHAIN_ID_HEX }],
        });
        await refresh(provider);
      } catch (addError) {
        setError(`ARC_NETWORK_ADD_FAILED: ${errorMessage(addError)}`);
      }
    }
  };

  // --- on-chain inspection ------------------------------------------------
  const inspect = async () => {
    const version = ++inspectionVersion.current;
    setSimulationKey(undefined);
    if (!provider || !accountMatches || !chainMatches || !valid) {
      setSimulation('PENDING');
      setGas(undefined);
      return;
    }
    setError(undefined);
    setSimulation('RUNNING');
    setGas(undefined);
    try {
      const raw = await provider.request({
        method: 'eth_call',
        params: [{ to: COMMERCE, data: readJobCalldata(BigInt(jobId)) }, 'latest'],
      });
      if (typeof raw !== 'string') throw new Error('JOB_READ_INVALID');

      const decoded = decodeJob(raw as `0x${string}`);
      assertProviderJob(decoded, BigInt(jobId), action);
      if (version !== inspectionVersion.current) return;

      setJob(
        JSON.stringify({
          status: decoded.status,
          budget: decoded.budget.toString(),
          client: decoded.client,
          provider: decoded.provider,
          evaluator: decoded.evaluator,
        }),
      );

      const tx = { from: account, to: COMMERCE, value: '0x0', data: calldata };
      await provider.request({ method: 'eth_call', params: [tx, 'latest'] });

      const estimate = await provider.request({ method: 'eth_estimateGas', params: [tx] });
      if (typeof estimate !== 'string') throw new Error('GAS_ESTIMATE_INVALID');
      if (version !== inspectionVersion.current) return;

      setGas(estimate);
      setSimulationKey(currentSimulationKey);
      setSimulation('SIMULATION PASSED');
    } catch (e) {
      if (version !== inspectionVersion.current) return;
      setJob('FAILED');
      setSimulation(`SIMULATION FAILED: ${errorMessage(e)}`);
    }
  };

  const verifyPostState = async () => {
    if (!provider || !valid) return;
    const raw = await provider.request({
      method: 'eth_call',
      params: [{ to: COMMERCE, data: readJobCalldata(BigInt(jobId)) }, 'latest'],
    });
    if (typeof raw !== 'string') throw new Error('POST_TRANSACTION_JOB_READ_INVALID');

    const decoded = decodeJob(raw as `0x${string}`);
    const participantsMatch =
      decoded.id === BigInt(jobId) &&
      decoded.client.toLowerCase() === BUYER.toLowerCase() &&
      decoded.provider.toLowerCase() === PROVIDER_WALLET.toLowerCase() &&
      decoded.evaluator.toLowerCase() === EVALUATOR.toLowerCase();

    if (!participantsMatch) throw new Error('POST_TRANSACTION_PARTICIPANTS_MISMATCH');
    if (action === 'setBudget' && (decoded.status !== 0 || decoded.budget !== 10000n))
      throw new Error('POST_TRANSACTION_BUDGET_STATE_MISMATCH');
    if (action === 'submit' && decoded.status !== 2)
      throw new Error('POST_TRANSACTION_SUBMIT_STATE_MISMATCH');

    setJob(
      JSON.stringify({
        status: decoded.status,
        budget: decoded.budget.toString(),
        client: decoded.client,
        provider: decoded.provider,
        evaluator: decoded.evaluator,
      }),
    );
  };

  const send = async () => {
    if (!provider || !sendEnabled || !calldata) return;
    try {
      const tx = { from: account, to: COMMERCE, value: '0x0', data: calldata, gas };
      const result = await provider.request({ method: 'eth_sendTransaction', params: [tx] });
      if (typeof result !== 'string') throw new Error('TRANSACTION_HASH_INVALID');

      setHash(result);
      setTxState('SUBMITTED');

      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        const receipt = await provider.request({
          method: 'eth_getTransactionReceipt',
          params: [result],
        });
        if (!receipt) continue;

        if (
          typeof receipt === 'object' &&
          receipt &&
          'status' in receipt &&
          (receipt as { status: string }).status === '0x1'
        ) {
          await verifyPostState();
          setTxState('CONFIRMED');
          return;
        }

        setTxState('REVERTED');
        return;
      }

      setTxState('FAILED');
      setError('RECEIPT_PENDING: transaction was submitted but no receipt arrived within 60 seconds.');
    } catch (e) {
      setTxState('FAILED');
      setError(`SEND_FAILED: ${errorMessage(e)}`);
    }
  };

  // --- effects -------------------------------------------------------------
  // Wait until mounted (client-side) before inspecting or reading window.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Inspect when provider, account, chain, jobId, or action changes.
  useEffect(() => {
    if (!mounted) return;
    void inspect();
    return () => { inspectionVersion.current += 1; };
  }, [mounted, provider, account, chain, jobId, action]);

  // Wallet event listeners + EIP-6963 discovery.
  useEffect(() => {
    if (!mounted) return;
    let cancelled = false;
    const injected = (window as { ethereum?: WalletProvider }).ethereum;
    const ethereum = injected as (WalletProvider & { providers?: WalletProvider[] }) | undefined;
    const candidates: WalletProvider[] = ethereum ? [...(ethereum.providers ?? []), ethereum] : [];
    const rabby = findRabbyProvider();
    if (rabby) {
      announcedRabbyRef.current = rabby;
      setConnectionState('READY');
    }
    const discoveredList = candidates.filter((item) => !item.isRabby || item === rabby);
    setDiscovered(discoveredList);

    const onEip6963Announce = (event: Event) => {
      const custom = event as CustomEvent<Eip6963Announcement>;
      const announcement = custom.detail ?? {};
      const announced = announcement.provider;
      if (!announced) return;

      if (isRabbyAnnouncement(announcement)) {
        announcedRabbyRef.current = announced;
        setConnectionState('READY');
      }
      setDiscovered((current) => (current.some((provider) => provider === announced) ? current : [...current, announced]));
    };

    window.addEventListener('eip6963:announceProvider', onEip6963Announce);
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    void discoverRabbyProvider().then((discoveredRabby) => {
      if (cancelled) return;
      if (discoveredRabby) {
        announcedRabbyRef.current = discoveredRabby;
        setConnectionState('READY');
        setDiscovered((current) =>
          current.some((candidate) => candidate === discoveredRabby)
            ? current
            : [...current, discoveredRabby],
        );
      } else if (!announcedRabbyRef.current) {
        setConnectionState('RABBY_NOT_FOUND');
      }
    });

    return () => {
      cancelled = true;
      window.removeEventListener('eip6963:announceProvider', onEip6963Announce);
    };
  }, [mounted]);

  // Subscribe to the provider actually selected through EIP-6963, including
  // wallets that are not exposed through window.ethereum.
  useEffect(() => {
    if (!provider) return;

    const onAccountsChanged = (...args: unknown[]) => {
      const accounts = args[0] as string[] | undefined;
      setAccount(Array.isArray(accounts) && typeof accounts[0] === 'string' ? accounts[0] : undefined);
    };
    const onChainChanged = (...args: unknown[]) => {
      const chainId = args[0];
      setChain(typeof chainId === 'string' ? chainId : undefined);
    };

    provider.on?.('accountsChanged', onAccountsChanged);
    provider.on?.('chainChanged', onChainChanged);
    return () => {
      provider.removeListener?.('accountsChanged', onAccountsChanged);
      provider.removeListener?.('chainChanged', onChainChanged);
    };
  }, [provider]);

  // --- render -------------------------------------------------------------
  const blockers = [
    !provider || !account ? 'Hubungkan Rabby dan izinkan akses akun lewat Connect Rabby.' : '',
    account && !accountMatches ? `Pilih akun provider ${PROVIDER_WALLET} di Rabby.` : '',
    provider && !chainMatches ? 'Ganti jaringan lewat Switch to Arc Testnet.' : '',
    !valid ? 'Masukkan Confirmed Job ID yang valid.' : '',
    simulation !== 'SIMULATION PASSED' || simulationKey !== currentSimulationKey || !gas
      ? `Simulasi belum lolos: ${simulation}. Setelah wallet dan jaringan benar, klik Periksa ulang transaksi.` : '',
    confirmation !== required ? `Ketik persis ${required || 'konfirmasi untuk Job ID yang valid'} pada kolom konfirmasi.` : '',
  ].filter(Boolean);

  return (
    <main style={{ fontFamily: 'system-ui', margin: '2rem auto', maxWidth: 900 }}>
      <h1>XYX Protected Job Provider</h1>
      <p>
        <strong>Development-only.</strong> No private key is accepted; Rabby must approve every send.
      </p>

      <button
        type="button"
        disabled={connectionState === 'CONNECTING'}
        onClick={() => void connect()}
      >
        {connectionState === 'CONNECTING' ? 'Waiting for Rabby…' : 'Connect Rabby'}
      </button>
      <p>
        <strong>Wallet connection:</strong> {connectionState}
      </p>
      {error && <p role="alert" style={{ color: '#b42318' }}>{error}</p>}
      {provider && !chainMatches && (
        <button type="button" onClick={() => void switchToArc()}>Switch to Arc Testnet</button>
      )}

      <p>Wallet: {account ?? 'Not connected'} / expected: {PROVIDER_WALLET}</p>
      <p>Chain: {chain ?? 'Not connected'} / expected: {ARC_TESTNET_CHAIN_ID_HEX}</p>

      <p>
        <strong>Diagnostics:</strong> {discovered.length} injected provider{discovered.length === 1 ? '' : 's'} discovered.
        {rabbyDetected ? ' Rabby found.' : ' Rabby not found.'}
      </p>

      <label>
        Confirmed Job ID{' '}
        <input value={jobId} onChange={(event) => setJobId(event.target.value)} />
      </label>

      <p>
        <button type="button" onClick={() => setAction('setBudget')}>Set budget</button>{' '}
        <button type="button" onClick={() => setAction('submit')}>Submit deliverable</button>
      </p>

      <p>Onchain job: {job}</p>

      <h2>Transaction Plan</h2>
      <p>Action: {action}</p>
      <p>To: {COMMERCE}</p>
      <p>
        Calldata: <code style={{ overflowWrap: 'anywhere' }}>{calldata ?? 'Valid confirmed job ID required'}</code>
      </p>
      <p>Deliverable hash: {action === 'submit' ? DELIVERABLE_HASH : 'N/A'}</p>
      <p>Simulation: {simulation}</p>
      <p>Gas estimate: {gas ?? 'PENDING'}</p>

      <label>
        Type <code>{required || 'the required confirmation'}</code>{' '}
        <input
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          autoComplete="off"
        />
      </label>

      <p id="send-status" aria-live="polite">{sendEnabled ? 'Siap dikirim — Rabby akan meminta persetujuan.' : 'Belum bisa dikirim. Selesaikan langkah berikut:'}</p>
      {!sendEnabled && <ul>{blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>}
      <p><button type="button" disabled={!provider || !accountMatches || !chainMatches || !valid || simulation === 'RUNNING'} onClick={() => void inspect()}>
        {simulation === 'RUNNING' ? 'Memeriksa transaksi…' : 'Periksa ulang transaksi'}
      </button></p>

      <button type="button" aria-describedby="send-status" disabled={!sendEnabled} onClick={() => void send()}>
        Send with Rabby
      </button>

      <p>Transaction state: {txState}</p>
      {hash && <p>Transaction hash: {hash}</p>}
    </main>
  );
}
