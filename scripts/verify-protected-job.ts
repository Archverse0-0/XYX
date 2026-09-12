#!/usr/bin/env node
// verify-protected-job.ts — XYX PRD v1.2 protected-job dependency checker
// This file contains NO secrets.
// Exit 0 only if every dependency is reachable and matches expectations.
//
// Classification (PRD v1.2):
//   PASS        — verified on-chain / reachable
//   FAIL        — verified but does not match expectation
//   NOT_PROVEN  — cannot be established from current evidence (e.g., historical M3)
//   NOT_CONFIGURED — required environment variable / config missing
//   SKIPPED     — not applicable to this check

import { createPublicClient, http, decodeAbiParameters, parseAbi } from 'viem';
import { arcTestnet } from 'viem/chains';
import deployment from '../deployments/arc-testnet.json' with {type:'json'};

// ─── Configuration ────────────────────────────────────────────────────────
const ARC_RPC_URL = process.env.ARC_RPC_URL ?? 'https://rpc.testnet.arc.io';
const ARC_CHAIN_ID = 5042002;

const EXPECTED_ADDRESSES: Record<string, string> = {
  ERC8183: process.env.ERC8183_ADDRESS ?? deployment.erc8183.referenceProxy,
  USDC: process.env.USDC_ADDRESS ?? deployment.usdc.address,
  XYX_EVALUATOR: process.env.XYX_EVALUATOR_ADDRESS ?? deployment.contracts.XYXEvaluator.address,
  XYX_EVIDENCE_REGISTRY: process.env.XYX_EVIDENCE_REGISTRY_ADDRESS ?? deployment.contracts.XYXEvidenceRegistry.address,
};

const EXPECTED_USDC_DECIMALS = 6;
const EXPECTED_USDC_SYMBOL = 'USDC';

const ARCSCAN = 'https://testnet.arcscan.app';
const HISTORICAL_JOB_ID = '186075';

// ─── Helpers ──────────────────────────────────────────────────────────────
type CheckStatus = 'PASS' | 'FAIL' | 'NOT_PROVEN' | 'NOT_CONFIGURED' | 'SKIPPED';

const log = {
  pass: (id: string, detail: string) => { console.log(`PASS   ${id}: ${detail}`); },
  fail: (id: string, detail: string) => { console.error(`FAIL   ${id}: ${detail}`); process.exitCode = 1; },
  notProven: (id: string, detail: string) => { console.warn(`NOT_PROVEN ${id}: ${detail}`); process.exitCode = 1; },
  notConfigured: (id: string, detail: string) => { console.warn(`NOT_CONFIGURED ${id}: ${detail}`); process.exitCode = 1; },
  skipped: (id: string, detail: string) => { console.log(`SKIPPED ${id}: ${detail}`); },
};

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const response = await fetch(ARC_RPC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const result = (await response.json()) as { result?: T; error?: { message: string } };
  if (result.error) throw new Error(result.error.message);
  if (!result.result) throw new Error('No result');
  return result.result;
}

function decodeString(data: string): string {
  const [value] = decodeAbiParameters([{ type: 'string' }], data as `0x${string}`);
  return value as string;
}

function decodeUint8(data: string): number {
  const [value] = decodeAbiParameters([{ type: 'uint8' }], data as `0x${string}`);
  return Number(value);
}

// ─── Checks ───────────────────────────────────────────────────────────────
async function checkChainId() {
  try {
    const id = Number(await rpc<number>('eth_chainId', []));
    if (id === ARC_CHAIN_ID) log.pass('arc.chainId', `Chain ID ${id} (Arc Testnet)`);
    else log.fail('arc.chainId', `Expected ${ARC_CHAIN_ID}, got ${id}`);
  } catch (e) { log.fail('arc.chainId', e instanceof Error ? e.message : 'RPC unreachable'); }
}

async function checkContracts() {
  try {
    const client = createPublicClient({ chain: arcTestnet, transport: http(ARC_RPC_URL) });
    for (const [label, address] of Object.entries(EXPECTED_ADDRESSES)) {
      try {
        const code = await client.getBytecode({ address: address as `0x${string}` });
        if (code && code !== '0x') log.pass(`contract.${label.toLowerCase()}`, `${label} at ${address} (${ARCSCAN}/address/${address})`);
        else log.fail(`contract.${label.toLowerCase()}`, `No code at ${address}`);
      } catch (e) { log.fail(`contract.${label.toLowerCase()}`, e instanceof Error ? e.message : 'RPC error'); }
    }
  } catch (e) { log.fail('contract.client', e instanceof Error ? e.message : 'RPC error'); }
}

async function checkUsdc() {
  try {
    const symbol = await rpc<string>('eth_call', [{ to: EXPECTED_ADDRESSES.USDC, data: '0x95d89b41' }, 'latest']);
    const result = decodeString(symbol);
    if (result === EXPECTED_USDC_SYMBOL) log.pass('usdc.symbol', `USDC symbol: ${result}`);
    else log.fail('usdc.symbol', `Expected ${EXPECTED_USDC_SYMBOL}, got ${result}`);

    const decimalsHex = await rpc<string>('eth_call', [{ to: EXPECTED_ADDRESSES.USDC, data: '0x313ce567' }, 'latest']);
    const decimals = decodeUint8(decimalsHex);
    if (decimals === EXPECTED_USDC_DECIMALS) log.pass('usdc.decimals', `USDC decimals: ${decimals}`);
    else log.fail('usdc.decimals', `Expected ${EXPECTED_USDC_DECIMALS}, got ${decimals}`);
  } catch (e) { log.fail('usdc.decimals', e instanceof Error ? e.message : 'RPC error'); }
}

async function checkSignerSeparation() {
  try {
    const provider=process.env.PROTECTED_JOB_PROVIDER_ADDRESS;
    if(!provider){log.notConfigured('signer.separation','PROTECTED_JOB_PROVIDER_ADDRESS is required to verify all five roles');return;}
    const addresses=[deployment.signers.witnessAttestor,deployment.signers.evaluatorAttestor,
      deployment.signers.deployer,deployment.wallets.circleWallet.address,provider];
    const unique = new Set(addresses.map(a => a.toLowerCase()));
    if (unique.size === addresses.length) log.pass('signer.separation', `All ${addresses.length} participant addresses are distinct`);
    else log.fail('signer.separation', `Duplicate addresses detected: ${JSON.stringify(addresses)}`);
  } catch (e) { log.fail('signer.separation', e instanceof Error ? e.message : 'Check failed'); }
}

async function checkEvaluatorTarget() {
  try {
    const client=createPublicClient({chain:arcTestnet,transport:http(ARC_RPC_URL)});
    const target=await client.readContract({address:EXPECTED_ADDRESSES.XYX_EVALUATOR as `0x${string}`,
      abi:parseAbi(['function agenticCommerce() view returns(address)']),functionName:'agenticCommerce'});
    if(target.toLowerCase()===EXPECTED_ADDRESSES.ERC8183.toLowerCase())log.pass('evaluator.target',`XYXEvaluator targets ERC-8183 ${target}`);
    else log.fail('evaluator.target',`Expected ERC-8183 ${EXPECTED_ADDRESSES.ERC8183}, got ${target}`);
  } catch (e) { log.fail('evaluator.target', e instanceof Error ? e.message : 'RPC error'); }
}

async function checkEvidenceRegistry() {
  // Per PRD v1.2: XYXEvidenceRegistry is Open Purchase only.
  // For Protected Job verification, the registry presence is informational — SKIPPED for Protected Job mode.
  log.skipped('evidence.registry', 'XYXEvidenceRegistry is Open Purchase only (PRD v1.2 Section 17). Not required for Protected Job settlement.');
}

async function checkLatestBlock() {
  try {
    const blockNumber = await rpc<string>('eth_blockNumber', []);
    const block = await rpc<{ hash: string; timestamp: string }>('eth_getBlockByNumber', [blockNumber, false]);
    if (!block) { log.fail('blockchain.latest', 'No block data'); return; }
    const ageSeconds = Math.floor(Date.now() / 1000) - Number(block.timestamp);
    if (ageSeconds < 120) log.pass('blockchain.latest', `Block ${blockNumber} (${ageSeconds}s old)`);
    else log.fail('blockchain.latest', `Latest block is ${ageSeconds}s old — chain may be stalled`);
  } catch (e) { log.fail('blockchain.latest', e instanceof Error ? e.message : 'RPC error'); }
}

async function checkCausalM3Proof() {
  // PRD v1.2 Section 42: Job 186075 M3 (causal Buyer Agent provider selection) is NOT_PROVEN_FOR_THIS_EXISTING_JOB.
  // No historical evidence establishes that Buyer Agent runtime causally selected provider 894335 before TX1.
  // This is a factual classification, not a failure.
  log.notProven('selection.causal.m3', `Job ${HISTORICAL_JOB_ID}: causal Buyer Agent provider selection (M3) is NOT_PROVEN. Full v1.2 Protected Job DoD requires a new job for M3 proof.`);
}

async function checkSeparateRejectRequirement() {
  // PRD v1.2 Section 41.3: Protected Job REJECT Proof requires a separate job.
  // Job 186075 is the success-path job only.
  log.notProven('reject.separate_job', `Job ${HISTORICAL_JOB_ID} is the success-path job only. A mandatory REJECT requires a separate job with a new commitment (PRD v1.2 M9).`);
}

async function checkGraphMeta() {
  // Graph is load-bearing at provider SELECTION time only (PRD v1.2).
  // For Protected Job settlement, deterministic exact-json evaluation is the sole acceptance criterion.
  // Graph freshness is checked here as a dependency verification, not as a settlement gate.
  try {
    const deploymentId = deployment.graph.deploymentId!;
    const graphEndpoint = deployment.graph.endpoint;
    const response = await fetch(graphEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: '{ _meta { deployment hasIndexingErrors block { number hash } } }' }),
      signal:AbortSignal.timeout(15_000),
    });
    if (!response.ok) { log.fail('graph.meta', `HTTP ${response.status}`); return; }
    const result = (await response.json()) as { data?: { _meta?: { deployment: string; hasIndexingErrors: boolean; block: { number: number; hash: string } } } };
    const meta = result.data?._meta;
    if (!meta) { log.fail('graph.meta', 'No _meta in response'); return; }
    if (meta.hasIndexingErrors) { log.fail('graph.meta', 'Graph has indexing errors'); return; }
    if (meta.deployment !== deploymentId) { log.fail('graph.meta', `Deployment mismatch: ${meta.deployment}`); return; }
    log.pass('graph.meta', `Deployment ${meta.deployment} with no indexing errors`);
  } catch (e) { log.fail('graph.meta', e instanceof Error ? e.message : 'Graph unreachable'); }
}

async function checkHistoricalJobState() {
  // Verify job 186075 on-chain state via Graph (read-only).
  // This checks the current indexed state; it does not imply causal M3 proof.
  try {
    const graphEndpoint = deployment.graph.endpoint;
    const response = await fetch(graphEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'query($id:ID!){job(id:$id){id status transactionHash deliverableHash evidenceHash}}', variables: { id: HISTORICAL_JOB_ID } }),
      signal:AbortSignal.timeout(15_000),
    });
    if (!response.ok) { log.fail('job.186075.state', `HTTP ${response.status}`); return; }
    const result = (await response.json()) as { data?: { job?: { id: string; status: string; transactionHash?: string; deliverableHash?: string; evidenceHash?: string } } };
    const job = result.data?.job;
    if (!job) { log.notProven('job.186075.state', `Job ${HISTORICAL_JOB_ID} not found in Graph. This does not affect on-chain state.`); return; }
    log.pass('job.186075.state', `Job ${HISTORICAL_JOB_ID} indexed: status=${job.status}${job.transactionHash ? `, tx=${job.transactionHash.slice(0, 18)}…` : ''}`);
    if (job.deliverableHash) log.pass('job.186075.deliverable', `Deliverable hash present: ${job.deliverableHash.slice(0, 20)}…`);
    if (job.evidenceHash) log.pass('job.186075.evidence', `Evidence hash present: ${job.evidenceHash.slice(0, 20)}…`);
  } catch (e) { log.notProven('job.186075.state', `Cannot verify job ${HISTORICAL_JOB_ID} state: ${e instanceof Error ? e.message : 'unknown'}`); }
}

// ─── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log('XYX PRD v1.2 Protected Job Verification');
  console.log(`Network: Arc Testnet (chain ${ARC_CHAIN_ID})`);
  console.log('RPC: configured (value redacted)');
  console.log(`Arcscan: ${ARCSCAN}`);
  console.log();

  await checkChainId();
  await checkContracts();
  await checkUsdc();
  await checkSignerSeparation();
  await checkEvaluatorTarget();
  await checkEvidenceRegistry();
  await checkLatestBlock();
  await checkGraphMeta();
  await checkCausalM3Proof();
  await checkSeparateRejectRequirement();
  await checkHistoricalJobState();

  console.log();
  if (process.exitCode === 0) console.log('ALL REQUIRED CHECKS PASSED');
  else if (process.exitCode === 1) console.log('VERIFICATION COMPLETE — review NOT_PROVEN / FAIL / NOT_CONFIGURED entries above');
  process.exit(process.exitCode ?? 0);
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
