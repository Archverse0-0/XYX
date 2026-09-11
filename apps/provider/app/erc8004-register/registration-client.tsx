'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AGENT_METADATA_URI,
  ARC_TESTNET_CHAIN_ID,
  ARC_TESTNET_CHAIN_ID_HEX,
  ARC_TESTNET_EXPLORER_URL,
  ARC_TESTNET_RPC_URL,
  IDENTITY_REGISTRY,
  PROVIDER_WALLET,
  REQUIRED_CONFIRMATION,
  agentWalletCalldata,
  decodeAgentWallet,
  decodeOwnerOf,
  decodeTokenUri,
  extractMintedAgentId,
  isArcTestnet,
  isExpectedProviderWallet,
  ownerOfCalldata,
  registrationCalldata,
  registrationTransaction,
  tokenUriCalldata,
  type ReceiptLog,
} from '../../lib/erc8004-registration';

type Eip1193Provider = {
  isRabby?: boolean;
  providers?: Eip1193Provider[];
  request: (request: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: 'accountsChanged' | 'chainChanged', listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: 'accountsChanged' | 'chainChanged', listener: (...args: unknown[]) => void) => void;
};

type RegistrationState = 'IDLE' | 'SUBMITTED' | 'CONFIRMED' | 'REVERTED' | 'FAILED';

declare global {
  interface Window { ethereum?: Eip1193Provider; }
}

const broadcastLocked = false;

function rabbyProvider(): Eip1193Provider | null {
  const injected = window.ethereum;
  if (!injected) return null;
  return [...(injected.providers ?? []), injected].find(provider => provider.isRabby) ?? null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function rpcErrorCode(error: unknown): number | undefined {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'number') return error.code;
  return undefined;
}

async function receiptFor(provider: Eip1193Provider, hash: string): Promise<Record<string, unknown> | null> {
  const value = await provider.request({ method: 'eth_getTransactionReceipt', params: [hash] });
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

export default function RegistrationClient() {
  const [provider, setProvider] = useState<Eip1193Provider | null>(null);
  const [account, setAccount] = useState<string>();
  const [chainId, setChainId] = useState<string>();
  const [simulation, setSimulation] = useState<string>('PENDING');
  const [gasEstimate, setGasEstimate] = useState<string>();
  const [confirmation, setConfirmation] = useState('');
  const [transactionHash, setTransactionHash] = useState<string>();
  const [registrationState, setRegistrationState] = useState<RegistrationState>('IDLE');
  const [finalAgentId, setFinalAgentId] = useState<string>();
  const [verification, setVerification] = useState<string>();
  const [error, setError] = useState<string>();

  const calldata = useMemo(() => registrationCalldata(), []);
  const accountMatches = isExpectedProviderWallet(account);
  const chainMatches = isArcTestnet(chainId);
  const safetyChecksPass = Boolean(provider && accountMatches && chainMatches && simulation === 'SIMULATION PASSED' && gasEstimate);
  const humanConfirmed = confirmation === REQUIRED_CONFIRMATION;
  const sendEnabled = safetyChecksPass && humanConfirmed && !broadcastLocked;

  const refresh = async (activeProvider: Eip1193Provider) => {
    const [accounts, currentChainId] = await Promise.all([
      activeProvider.request({ method: 'eth_accounts' }) as Promise<unknown>,
      activeProvider.request({ method: 'eth_chainId' }) as Promise<unknown>,
    ]);
    setAccount(Array.isArray(accounts) && typeof accounts[0] === 'string' ? accounts[0] : undefined);
    setChainId(typeof currentChainId === 'string' ? currentChainId : undefined);
  };

  const connect = async () => {
    setError(undefined);
    const selected = rabbyProvider();
    if (!selected) {
      setError('RABBY_NOT_DETECTED: install or unlock Rabby, then reload this local page.');
      return;
    }
    try {
      await selected.request({ method: 'eth_requestAccounts' });
      setProvider(selected);
      await refresh(selected);
    } catch (connectError) {
      setError(`CONNECT_FAILED: ${errorMessage(connectError)}`);
    }
  };

  const switchToArc = async () => {
    if (!provider) return;
    setError(undefined);
    try {
      await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: ARC_TESTNET_CHAIN_ID_HEX }] });
    } catch (switchError) {
      if (rpcErrorCode(switchError) !== 4902) {
        setError(`NETWORK_SWITCH_FAILED: ${errorMessage(switchError)}`);
        return;
      }
      try {
        await provider.request({ method: 'wallet_addEthereumChain', params: [{
          chainId: ARC_TESTNET_CHAIN_ID_HEX,
          chainName: 'Arc Testnet',
          nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
          rpcUrls: [ARC_TESTNET_RPC_URL],
          blockExplorerUrls: [ARC_TESTNET_EXPLORER_URL],
        }] });
        await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: ARC_TESTNET_CHAIN_ID_HEX }] });
      } catch (addError) {
        setError(`ARC_NETWORK_ADD_FAILED: ${errorMessage(addError)}`);
        return;
      }
    }
    await refresh(provider);
  };

  useEffect(() => {
    if (!provider || !accountMatches || !chainMatches) {
      setSimulation('PENDING');
      setGasEstimate(undefined);
      return;
    }
    let stale = false;
    const verify = async () => {
      setSimulation('RUNNING');
      setGasEstimate(undefined);
      try {
        const transaction = registrationTransaction(account!);
        await provider.request({ method: 'eth_call', params: [transaction, 'latest'] });
        const gas = await provider.request({ method: 'eth_estimateGas', params: [transaction] });
        if (typeof gas !== 'string') throw new Error('GAS_ESTIMATE_INVALID');
        if (!stale) {
          setSimulation('SIMULATION PASSED');
          setGasEstimate(gas);
        }
      } catch (verificationError) {
        if (!stale) {
          setSimulation(`SIMULATION FAILED: ${errorMessage(verificationError)}`);
          setGasEstimate(undefined);
        }
      }
    };
    void verify();
    return () => { stale = true; };
  }, [provider, account, accountMatches, chainMatches]);

  useEffect(() => {
    if (!provider) return;
    const refreshFromEvent = () => { void refresh(provider); };
    provider.on?.('accountsChanged', refreshFromEvent);
    provider.on?.('chainChanged', refreshFromEvent);
    return () => {
      provider.removeListener?.('accountsChanged', refreshFromEvent);
      provider.removeListener?.('chainChanged', refreshFromEvent);
    };
  }, [provider]);

  const verifyMint = async (activeProvider: Eip1193Provider, receipt: Record<string, unknown>) => {
    const logs = Array.isArray(receipt.logs) ? receipt.logs as ReceiptLog[] : [];
    const agentId = extractMintedAgentId(logs, PROVIDER_WALLET);
    const calls = [ownerOfCalldata(agentId), tokenUriCalldata(agentId), agentWalletCalldata(agentId)];
    const results = await Promise.all(calls.map(data => activeProvider.request({ method: 'eth_call', params: [{ to: IDENTITY_REGISTRY, data }, 'latest'] })));
    if (!results.every((result): result is string => typeof result === 'string')) throw new Error('POST_REGISTRATION_CALL_INVALID');
    const [owner, tokenUri, agentWallet] = [decodeOwnerOf(results[0] as `0x${string}`), decodeTokenUri(results[1] as `0x${string}`), decodeAgentWallet(results[2] as `0x${string}`)];
    if (!isExpectedProviderWallet(owner) || tokenUri !== AGENT_METADATA_URI || !isExpectedProviderWallet(agentWallet)) {
      throw new Error('POST_REGISTRATION_STATE_MISMATCH');
    }
    setFinalAgentId(agentId.toString());
    setVerification('ONCHAIN VERIFICATION PASSED');
  };

  const send = async () => {
    if (!provider || !account || !sendEnabled) return;
    setError(undefined);
    try {
      const hash = await provider.request({ method: 'eth_sendTransaction', params: [registrationTransaction(account, gasEstimate)] });
      if (typeof hash !== 'string') throw new Error('TRANSACTION_HASH_INVALID');
      setTransactionHash(hash);
      setRegistrationState('SUBMITTED');
      for (let attempt = 0; attempt < 60; attempt += 1) {
        await new Promise(resolve => setTimeout(resolve, 1_000));
        const receipt = await receiptFor(provider, hash);
        if (!receipt) continue;
        if (receipt.status !== '0x1') {
          setRegistrationState('REVERTED');
          return;
        }
        setRegistrationState('CONFIRMED');
        await verifyMint(provider, receipt);
        return;
      }
      setError('RECEIPT_PENDING: transaction was submitted but no receipt arrived within 60 seconds.');
    } catch (sendError) {
      setRegistrationState('FAILED');
      setError(`SEND_FAILED: ${errorMessage(sendError)}`);
    }
  };

  return <main style={{ fontFamily: 'system-ui', margin: '2rem auto', maxWidth: 900 }}>
    <h1>XYX ERC-8004 Provider Registration</h1>
    <p><strong>Development-only.</strong> This page returns 404 in production and never accepts a private key.</p>
    <button type="button" onClick={() => void connect()}>Connect Rabby</button>
    <p>Wallet: {account ?? 'Not connected'}</p>
    <p>Expected wallet: {PROVIDER_WALLET}</p>
    <p>Wallet check: {account ? (accountMatches ? 'MATCHED' : 'WRONG WALLET — registration disabled') : 'PENDING'}</p>
    <p>Chain: {chainId ?? 'Not connected'} (expected {ARC_TESTNET_CHAIN_ID} / {ARC_TESTNET_CHAIN_ID_HEX})</p>
    {!chainMatches && provider && <button type="button" onClick={() => void switchToArc()}>Switch to Arc Testnet</button>}

    <h2>Frozen Transaction Plan</h2>
    <dl>
      <dt>From</dt><dd>{account ?? PROVIDER_WALLET}</dd>
      <dt>To</dt><dd>{IDENTITY_REGISTRY}</dd>
      <dt>Chain ID</dt><dd>{ARC_TESTNET_CHAIN_ID} ({ARC_TESTNET_CHAIN_ID_HEX})</dd>
      <dt>Value</dt><dd>0</dd>
      <dt>Function</dt><dd>register(string)</dd>
      <dt>agentURI</dt><dd>{AGENT_METADATA_URI}</dd>
      <dt>Calldata</dt><dd style={{ overflowWrap: 'anywhere' }}>{calldata}</dd>
      <dt>Simulation</dt><dd>{simulation}</dd>
      <dt>Gas estimate</dt><dd>{gasEstimate ?? 'PENDING'}</dd>
    </dl>

    <label htmlFor="confirmation">Type <code>{REQUIRED_CONFIRMATION}</code> to acknowledge the transaction:</label><br />
    <input id="confirmation" value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="off" />
    <p>Safety gates: {safetyChecksPass ? 'PASSED' : 'PENDING OR FAILED'}</p>
    <p><strong>Manual broadcast:</strong> enabled only after every safety gate passes and the exact confirmation text is entered. Rabby must still approve the transaction.</p>
    <button type="button" disabled={!sendEnabled} onClick={() => void send()}>Send / Register</button>
    <p>Transaction state: {registrationState}</p>
    {transactionHash && <p>Transaction hash: {transactionHash}</p>}
    {finalAgentId && <p>Confirmed agent ID: {finalAgentId}</p>}
    {verification && <p>{verification}</p>}
    {error && <p role="alert">{error}</p>}
  </main>;
}
