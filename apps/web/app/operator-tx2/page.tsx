'use client';

import { useState, useEffect } from 'react';
import { encodeFunctionData } from 'viem';

const ARC_TESTNET_CHAIN_ID = 5042002;
const ERC_8183_ADDRESS = '0x0747EEf0706327138c69792bF28Cd525089e4583';
const PROVIDER_ADDRESS = '0x7ea90Ac2A2bA5fF6c71e7E9D23037D64AbD2b4da';
const JOB_ID = 186075;
const BUDGET_ATOMIC = 10000;

const SET_BUDGET_ABI = [
  {
    name: 'setBudget',
    type: 'function',
    inputs: [
      { name: 'jobId', type: 'uint256' },
      { name: 'budget', type: 'uint256' },
      { name: 'data', type: 'bytes' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
];

export default function OperatorTX2Page() {
  const [connected, setConnected] = useState(false);
  const [address, setAddress] = useState<string>('');
  const [chainId, setChainId] = useState<number | null>(null);
  const [status, setStatus] = useState('Initializing...');

  useEffect(() => {
    checkConnection();
  }, []);

  async function checkConnection() {
    if (typeof window === 'undefined' || !window.ethereum) {
      setStatus('ERROR: No wallet found. Please install Rabby extension.');
      return;
    }

    try {
      const accounts = await window.ethereum.request({ method: 'eth_accounts' }) as string[];
      if (accounts.length > 0) {
        setConnected(true);
        setAddress(accounts[0]);
        const chain = await window.ethereum.request({ method: 'eth_chainId' }) as string;
        setChainId(parseInt(chain, 16));
        setStatus('Wallet connected. Ready.');
      } else {
        setStatus('Wallet detected but not connected. Click "Connect Rabby" below.');
      }
    } catch (error) {
      setStatus(`ERROR: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async function connectWallet() {
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' }) as string[];
      setConnected(true);
      setAddress(accounts[0]);
      const chain = await window.ethereum.request({ method: 'eth_chainId' }) as string;
      setChainId(parseInt(chain, 16));
      setStatus('Wallet connected. Ready.');
    } catch (error) {
      setStatus(`ERROR: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async function switchToArcTestnet() {
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x' + ARC_TESTNET_CHAIN_ID.toString(16) }],
      });
      setChainId(ARC_TESTNET_CHAIN_ID);
      setStatus('Switched to Arc Testnet.');
    } catch (error) {
      setStatus(`ERROR: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async function prepareSetBudget() {
    if (!connected || !address) {
      setStatus('ERROR: Connect wallet first.');
      return;
    }

    if (chainId !== ARC_TESTNET_CHAIN_ID) {
      setStatus('ERROR: Switch to Arc Testnet first.');
      return;
    }

    const providerLower = PROVIDER_ADDRESS.toLowerCase();
    const connectedLower = address.toLowerCase();

    if (connectedLower !== providerLower) {
      setStatus(`ERROR: Connected wallet (${address}) does not match provider (${PROVIDER_ADDRESS}).`);
      return;
    }

    setStatus('Preparing setBudget transaction...');

    try {
      const calldata = encodeFunctionData({
        abi: SET_BUDGET_ABI,
        functionName: 'setBudget',
        args: [BigInt(JOB_ID), BigInt(BUDGET_ATOMIC), '0x'],
      });

      setStatus('Transaction prepared. Check Rabby for confirmation...');

      const txHash = await window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [
          {
            from: address,
            to: ERC_8183_ADDRESS,
            data: calldata,
            gas: '0x' + (300333).toString(16),
          },
        ],
      });

      setStatus(`Transaction sent! Hash: ${txHash}`);
    } catch (error) {
      setStatus(`ERROR: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  return (
    <div style={{ fontFamily: 'monospace', padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <h1>XYX Operator — TX2 (setBudget)</h1>

      <div style={{ background: '#f0f0f0', padding: '1rem', margin: '1rem 0', borderRadius: '4px' }}>
        <h2>Transaction Details</h2>
        <p><strong>Network:</strong> Arc Testnet (Chain ID: {ARC_TESTNET_CHAIN_ID})</p>
        <p><strong>Contract:</strong> {ERC_8183_ADDRESS}</p>
        <p><strong>Function:</strong> setBudget(uint256,uint256,bytes)</p>
        <p><strong>Job ID:</strong> {JOB_ID}</p>
        <p><strong>Budget:</strong> {BUDGET_ATOMIC} atomic USDC (0.01 USDC)</p>
        <p><strong>Data:</strong> 0x</p>
        <p><strong>From (Expected):</strong> {PROVIDER_ADDRESS}</p>
      </div>

      <div style={{ background: '#f0f0f0', padding: '1rem', margin: '1rem 0', borderRadius: '4px' }}>
        <h2>Wallet Status</h2>
        {connected ? (
          <>
            <p><strong>Connected:</strong> {address}</p>
            <p><strong>Chain ID:</strong> {chainId} {chainId === ARC_TESTNET_CHAIN_ID ? '✓' : '✗'}</p>
          </>
        ) : (
          <p><strong>Status:</strong> Not connected</p>
        )}
        <p><strong>Status:</strong> {status}</p>
      </div>

      <div style={{ margin: '1rem 0' }}>
        {!connected ? (
          <button
            onClick={connectWallet}
            style={{ padding: '0.75rem 1.5rem', fontSize: '1rem', cursor: 'pointer' }}
          >
            Connect Rabby
          </button>
        ) : chainId !== ARC_TESTNET_CHAIN_ID ? (
          <button
            onClick={switchToArcTestnet}
            style={{ padding: '0.75rem 1.5rem', fontSize: '1rem', cursor: 'pointer' }}
          >
            Switch to Arc Testnet
          </button>
        ) : (
          <button
            onClick={prepareSetBudget}
            style={{ padding: '0.75rem 1.5rem', fontSize: '1rem', cursor: 'pointer', background: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px' }}
          >
            Prepare setBudget
          </button>
        )}
      </div>

      <div style={{ background: '#fff3cd', padding: '1rem', margin: '1rem 0', borderRadius: '4px', fontSize: '0.9rem' }}>
        <strong>Instructions:</strong>
        <ol style={{ marginTop: '0.5rem', paddingLeft: '1.5rem' }}>
          <li>Click "Connect Rabby" to connect your wallet</li>
          <li>Ensure you are on Arc Testnet (Chain ID: {ARC_TESTNET_CHAIN_ID})</li>
          <li>Verify connected address matches provider: {PROVIDER_ADDRESS}</li>
          <li>Click "Prepare setBudget" to trigger Rabby confirmation</li>
          <li>Review transaction in Rabby and confirm if correct</li>
        </ol>
      </div>
    </div>
  );
}
