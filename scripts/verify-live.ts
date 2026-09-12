#!/usr/bin/env node
// verify-live.ts — XYX PRD v1.2 P0 live verification
// This file contains NO secrets.
// Exports verification primitives used by tests and the CLI.

import { createPublicClient, http, keccak256, parseAbiItem, toHex } from 'viem';
import { arcTestnet } from 'viem/chains';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Compatibility shim: hashText lives in the shared package; re-export locally so
// this script and its tests stay aligned.
export const hashText = (value: string): string => keccak256(toHex(value));

// ─── Types ───────────────────────────────────────────────────────────
export type CheckStatus = 'PASS' | 'FAIL' | 'BLOCKED' | 'NOT_YET_PROVEN';
export type CheckResult = { id: string; status: CheckStatus; detail: string };
export type Report = {
  verifierVersion: string;
  network: string;
  timestamp: string;
  gitCommit: string;
  overall: CheckStatus;
  checks: CheckResult[];
};

// ─── Helpers ─────────────────────────────────────────────────────────
function redactSecrets(obj: unknown): unknown {
  if (typeof obj === 'string') {
    return obj.replace(/(_SECRET|_KEY|_TOKEN|_PRIVATE|_AUTH|_JWT|_PASSWORD)[^\s,}]*/gi, '$1[REDACTED]')
              .replace(/0x[0-9a-fA-F]{64}/g, '0x[REDACTED]');
  }
  if (Array.isArray(obj)) return obj.map(redactSecrets);
  if (obj && typeof obj === 'object') {
    const record: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) record[k] = redactSecrets(v);
    return record;
  }
  return obj;
}

export function serializeReport(report: Report): string {
  return JSON.stringify(redactSecrets(report), null, 2);
}

export function overallStatus(checks: CheckResult[]): CheckStatus {
  if (checks.some(c => c.status === 'FAIL')) return 'FAIL';
  if (checks.some(c => c.status === 'BLOCKED')) return 'BLOCKED';
  if (checks.some(c => c.status === 'NOT_YET_PROVEN')) return 'NOT_YET_PROVEN';
  return 'PASS';
}

export function exitCodeForStatus(status: CheckStatus): number {
  return status === 'PASS' ? 0 : 1;
}

export function classifyReceiptCount(count: number): CheckResult {
  if (count === 0) return { id: 'receipt.count', status: 'NOT_YET_PROVEN', detail: 'No receipts indexed' };
  return { id: 'receipt.count', status: 'PASS', detail: `${count} receipts` };
}

export function compareReceipt(graph: Record<string, unknown>, event: Record<string, unknown>): CheckResult {
  const matchingFields = ['receiptHash', 'endpointKey', 'providerKey', 'payer', 'specHash', 'paymentHash',
                          'requestHash', 'responseHash', 'evidenceHash', 'evidenceURIHash'];
  const mismatches = matchingFields.filter(f => {
    const gv = String(graph[f] ?? graph['id'] ?? '').toLowerCase();
    const ev = String((event as any)[f] ?? '').toLowerCase();
    return gv !== ev;
  });
  if (mismatches.length > 0) {
    return { id: 'receipt.arc_graph_match', status: 'FAIL', detail: `Mismatched fields: ${mismatches.join(', ')}` };
  }
  return { id: 'receipt.arc_graph_match', status: 'PASS', detail: 'All receipt fields match on-chain event' };
}

// ─── Verification Functions ──────────────────────────────────────────
export async function verifyArcChain(rpcUrl: string): Promise<CheckResult[]> {
  const checks: CheckResult[] = [];
  try {
    const chainIdHex = await jsonRpc<string>(rpcUrl, 'eth_chainId', []);
    const chainId = parseInt(chainIdHex, 16);
    checks.push({
      id: 'arc.chainId',
      status: chainId === 5042002 ? 'PASS' : 'FAIL',
      detail: `Chain ID ${chainId} (expected 5042002)`,
    });
    const headHex = await jsonRpc<string>(rpcUrl, 'eth_blockNumber', []);
    const head = parseInt(headHex, 16);
    checks.push({ id: 'arc.head', status: 'PASS', detail: `Block ${head}` });
  } catch (e) {
    checks.push({ id: 'arc.chainId', status: 'BLOCKED', detail: e instanceof Error ? e.message : 'RPC unreachable' });
  }
  return checks;
}

async function jsonRpc<T>(rpcUrl: string, method: string, params: unknown[]): Promise<T> {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const result = (await response.json()) as { result?: T; error?: { message: string } };
  if (result.error) throw new Error(result.error.message);
  if (!result.result) throw new Error('No result');
  return result.result;
}

export async function verifyUsdcDecimals(client: { readContract: (args: any) => Promise<number> }): Promise<CheckResult> {
  try {
    const decimals = await client.readContract({ address: '0x3600000000000000000000000000000000000000', abi: [{ type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] }], functionName: 'decimals' });
    return { id: 'usdc.decimals', status: decimals === 6 ? 'PASS' : 'FAIL', detail: `USDC decimals: ${decimals}` };
  } catch (e) {
    return { id: 'usdc.decimals', status: 'BLOCKED', detail: e instanceof Error ? e.message : 'RPC error' };
  }
}

export async function verifyContractBytecode(
  client: { getBytecode: (args: { address: string }) => Promise<any> },
  label: string,
  name: string,
  address: string
): Promise<CheckResult> {
  try {
    const code = await client.getBytecode({ address });
    const hasCode = !!code && code !== '0x' && code !== false && code !== undefined;
    return { id: `contract.${label}`, status: hasCode ? 'PASS' : 'FAIL', detail: `${name} at ${address}` };
  } catch (e) {
    return { id: `contract.${label}`, status: 'BLOCKED', detail: e instanceof Error ? e.message : 'RPC error' };
  }
}

export async function verifyEvaluatorTarget(
  evaluator: { readContract: (args: { functionName: string }) => Promise<string> },
  evaluatorAddress: string,
  expectedCommerce: string
): Promise<CheckResult> {
  try {
    const commerce = await evaluator.readContract({ functionName: 'agenticCommerce' });
    return { id: 'evaluator.target', status: commerce.toLowerCase() === expectedCommerce.toLowerCase() ? 'PASS' : 'FAIL', detail: `Evaluator → ${commerce}` };
  } catch (e) {
    return { id: 'evaluator.target', status: 'BLOCKED', detail: e instanceof Error ? e.message : 'RPC error' };
  }
}

export async function verifyGraphMeta(endpoint: string, expectedDeployment: string): Promise<CheckResult> {
  try {
    const url = new URL(endpoint);
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: '{ _meta { deployment hasIndexingErrors block { number hash } } }' }),
      signal: AbortSignal.timeout(15000),
    });
    const result = (await response.json()) as { data?: { _meta?: { deployment: string; hasIndexingErrors: boolean; block: { number: number; hash: string } } } };
    const meta = result.data?._meta;
    if (!meta) return { id: 'graph.meta', status: 'FAIL', detail: 'No _meta in response' };
    if (meta.hasIndexingErrors) return { id: 'graph.meta', status: 'FAIL', detail: 'Graph has indexing errors' };
    if (meta.deployment !== expectedDeployment) return { id: 'graph.meta', status: 'FAIL', detail: `Deployment mismatch: ${meta.deployment}` };
    return { id: 'graph.meta', status: 'PASS', detail: `Deployment ${meta.deployment}, block ${meta.block.number}` };
  } catch (e) {
    return { id: 'graph.meta', status: 'BLOCKED', detail: e instanceof Error ? e.message : 'Graph unreachable' };
  }
}

export async function verifyGraphFreshness(
  client: { getBlockNumber: () => Promise<bigint>; getBlock: (args: { blockNumber: bigint }) => Promise<{ hash: string }> },
  graphMeta: { block: { number: number; hash: string } },
  maxLag: number
): Promise<CheckResult[]> {
  const checks: CheckResult[] = [];
  try {
    const head = await client.getBlockNumber();
    const indexed = BigInt(graphMeta.block.number);
    if (head < indexed) {
      checks.push({ id: 'graph.freshness', status: 'FAIL', detail: 'Graph block is in the future' });
      return checks;
    }
    const lag = Number(head - indexed);
    if (lag > maxLag) {
      checks.push({ id: 'graph.freshness', status: 'FAIL', detail: `Graph lag ${lag} > max ${maxLag}` });
      return checks;
    }
    const indexedBlock = await client.getBlock({ blockNumber: indexed });
    if (indexedBlock.hash !== graphMeta.block.hash) {
      checks.push({ id: 'graph.hashMatch', status: 'FAIL', detail: 'Indexed block hash mismatch' });
      return checks;
    }
    checks.push({ id: 'graph.freshness', status: 'PASS', detail: `Lag ${lag} blocks` });
  } catch (e) {
    checks.push({ id: 'graph.freshness', status: 'BLOCKED', detail: e instanceof Error ? e.message : 'RPC error' });
  }
  return checks;
}

export async function verifyEvidence(
  ipfsApi: string,
  _auth: string | undefined,
  uri: string,
  expectedHash: string
): Promise<CheckResult> {
  try {
    if (!uri.startsWith('ipfs://')) {
      return { id: 'evidence.uri', status: 'FAIL', detail: `Not an IPFS URI: ${uri}` };
    }
    const cid = uri.slice(7);
    const url = new URL('/api/v0/cat', ipfsApi);
    url.searchParams.set('arg', cid);
    const response = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(15000) });
    if (!response.ok) return { id: 'evidence.read', status: 'BLOCKED', detail: `HTTP ${response.status}` };
    const text = await response.text();
    const parsed = JSON.parse(text);
    const canonical = JSON.stringify(parsed, Object.keys(parsed).sort(), 0);
    const actualHash = hashText(canonical);
    if (actualHash !== expectedHash) {
      return { id: 'evidence.hash', status: 'FAIL', detail: 'Hash mismatch' };
    }
    if (canonical !== text) {
      return { id: 'evidence.canonical', status: 'FAIL', detail: 'Not canonical JSON' };
    }
    return { id: 'evidence.integrity', status: 'PASS', detail: `IPFS ${cid}, hash matches` };
  } catch (e) {
    return { id: 'evidence.read', status: 'BLOCKED', detail: e instanceof Error ? e.message : 'IPFS unreachable' };
  }
}

export async function verifyReceiptProof(
  graphEndpoint: string,
  rpcClient: {
    getLogs: (args: { address: string; event: any; args: { receiptHash: string }; fromBlock: number; toBlock: string }) => Promise<
      Array<{ address: string; args: Record<string, unknown>; transactionHash: string; blockNumber: bigint }>
    >;
    getTransactionReceipt: (args: { hash: string }) => Promise<{ status: string }>;
  },
  registryAddress: string,
  _expectedStatus: CheckStatus
): Promise<CheckResult[]> {
  const checks: CheckResult[] = [];
  try {
    const graphResponse = await fetch(graphEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: '{ receipts(first: 10) { id endpointKey providerKey payer specHash paymentHash requestHash responseHash evidenceHash evidenceURIHash blockNumber transactionHash } }' }),
      signal: AbortSignal.timeout(15000),
    });
    if (!graphResponse.ok) {
      checks.push({ id: 'receipt.graph_query', status: 'BLOCKED', detail: `HTTP ${graphResponse.status}` });
      return checks;
    }
    const graphData = (await graphResponse.json()) as { data?: { receipts?: Record<string, unknown>[] } };
    const receipts = graphData.data?.receipts ?? [];
    if (receipts.length === 0) {
      checks.push({ id: 'receipt.count', status: 'NOT_YET_PROVEN', detail: 'No receipts in Graph' });
      return checks;
    }
    checks.push(classifyReceiptCount(receipts.length));
    const receipt = receipts[0];
    const receiptHash = String(receipt.id);
    const eventAbi = parseAbiItem('event ReceiptAnchored(bytes32 indexed receiptHash, bytes32 indexed endpointKey, bytes32 indexed providerKey, address payer, uint128 amountPaid, bytes32 specHash, bytes32 paymentHash, bytes32 requestHash, bytes32 responseHash, bytes32 evidenceHash, bytes32 evidenceURIHash, uint32 latencyMs, uint16 httpStatus, uint8 outcome, uint64 observedAt, address providerAgentRegistry, uint256 providerAgentId, string evidenceURI)');
    const logs = await rpcClient.getLogs({
      address: registryAddress,
      event: eventAbi,
      args: { receiptHash },
      fromBlock: Number(receipt.blockNumber ?? 0) - 1000,
      toBlock: 'latest',
    });
    if (logs.length === 0) {
      checks.push({ id: 'receipt.arc_event', status: 'FAIL', detail: 'No ReceiptAnchored event found' });
      return checks;
    }
    const event = logs[0].args;
    checks.push(compareReceipt(receipt as unknown as Record<string, unknown>, event as Record<string, unknown>));
    const txHash = (logs[0] as any).transactionHash ?? (rpcClient as any).transactionHash;
    const txReceipt = await rpcClient.getTransactionReceipt({ hash: txHash });
    checks.push({ id: 'receipt.arc_transaction', status: txReceipt.status === 'success' ? 'PASS' : 'FAIL', detail: `Tx status: ${txReceipt.status}` });
  } catch (e) {
    checks.push({ id: 'receipt.proof', status: 'BLOCKED', detail: e instanceof Error ? e.message : 'Verification error' });
  }
  return checks;
}

// ─── Main CLI ────────────────────────────────────────────────────────
async function main() {
  const deploymentManifest = JSON.parse(readFileSync(resolve(process.cwd(), 'deployments/arc-testnet.json'), 'utf8'));
  const rpcUrl = process.env.ARC_RPC_URL;
  const checks: CheckResult[] = [];

  // 1. Signer separation
  const signers = [process.env.XYZ_WITNESS_ATTESTOR, process.env.XYZ_EVALUATOR_ATTESTOR, process.env.XIRCLE_ENTITY_SECRET ?? process.env.CIRCLE_ENTITY_SECRET].filter((s): s is string => !!s);
  const uniqueSigners = new Set(signers.map(s => s.toLowerCase()));
  checks.push({ id: 'signers.separation', status: uniqueSigners.size === signers.length && signers.length >= 4 ? 'PASS' : 'FAIL', detail: `${uniqueSigners.size} unique of ${signers.length} configured` });

  // 2. Contract deployment
  if (rpcUrl) {
    const publicClient = createPublicClient({ transport: http(rpcUrl), chain: arcTestnet });
    const bytecodeClient = { getBytecode: (args: { address: string }) => publicClient.getBytecode({ address: args.address as `0x${string}` }) };
    checks.push(await verifyContractBytecode(bytecodeClient, 'evidence.registry', 'EvidenceRegistry', deploymentManifest.contracts?.XYXEvidenceRegistry?.address ?? ''));
    checks.push(await verifyContractBytecode(bytecodeClient, 'evaluator', 'Evaluator', deploymentManifest.contracts?.XYXEvaluator?.address ?? ''));
    const evaluatorClient: any = {
      readContract: (args: any) =>
        publicClient.readContract({ address: deploymentManifest.contracts?.XYXEvaluator?.address as `0x${string}`, abi: [{ type: 'function', name: 'agenticCommerce', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] }], functionName: args.functionName }),
    };
    checks.push(await verifyEvaluatorTarget(evaluatorClient, deploymentManifest.contracts?.XYXEvaluator?.address ?? '', deploymentManifest.erc8183?.referenceProxy ?? ''));
  } else {
    checks.push({ id: 'rpc.configured', status: 'NOT_YET_PROVEN', detail: 'ARC_RPC_URL not set' });
  }

  // 3. USDC decimals
  if (rpcUrl) {
    const publicClient = createPublicClient({ transport: http(rpcUrl), chain: arcTestnet });
    checks.push(await verifyUsdcDecimals({
      readContract: (args) => publicClient.readContract({
        address: '0x3600000000000000000000000000000000000000',
        abi: [{ type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] }],
        functionName: args.functionName,
      }),
    }));
  }

  // 4. Graph
  const graphEndpoint = deploymentManifest.graph?.endpoint;
  const graphDeployment = deploymentManifest.graph?.deploymentId;
  if (graphEndpoint && graphDeployment) {
    const graphCheck = await verifyGraphMeta(graphEndpoint, graphDeployment);
    checks.push(graphCheck);
    if (graphCheck.status === 'PASS' && rpcUrl) {
      const publicClient = createPublicClient({ transport: http(rpcUrl), chain: arcTestnet });
      const freshnessChecks = await verifyGraphFreshness(publicClient as any, { block: { number: 0, hash: '0x' } }, 1000);
      checks.push(...freshnessChecks);
    }
  } else {
    checks.push({ id: 'graph.configured', status: 'NOT_YET_PROVEN', detail: 'Graph not configured in deployment manifest' });
  }

  // 5. IPFS
  const ipfsProvider = process.env.IPFS_PROVIDER || 'kubo';
  if (ipfsProvider === 'kubo') {
    const api = process.env.IPFS_API_URL;
    if (api) {
      try {
        const response = await fetch(new URL('/api/v0/version', api), { method: 'POST', signal: AbortSignal.timeout(10000) });
        checks.push({ id: 'ipfs.kubo', status: response.ok ? 'PASS' : 'FAIL', detail: `HTTP ${response.status}` });
      } catch (e) {
        checks.push({ id: 'ipfs.kubo', status: 'BLOCKED', detail: e instanceof Error ? e.message : 'unreachable' });
      }
    } else {
      checks.push({ id: 'ipfs.configured', status: 'NOT_YET_PROVEN', detail: 'IPFS_API_URL not set' });
    }
  }

  // 6. Witness healthz
  const witnessUrl = process.env.WITNESS_URL;
  if (witnessUrl) {
    try {
      const response = await fetch(new URL('/healthz', witnessUrl), { signal: AbortSignal.timeout(15000) });
      if (response.ok) {
        const result = (await response.json()) as { ready: boolean; checks: Record<string, boolean> };
        checks.push({ id: 'witness.ready', status: result.ready ? 'PASS' : 'FAIL', detail: result.ready ? 'All checks pass' : 'Some checks failed' });
        for (const [name, status] of Object.entries(result.checks)) {
          checks.push({ id: `witness.${name}`, status: status ? 'PASS' : 'FAIL', detail: name });
        }
      } else {
        checks.push({ id: 'witness.healthz', status: 'BLOCKED', detail: `HTTP ${response.status}` });
      }
    } catch (e) {
      checks.push({ id: 'witness.reachable', status: 'BLOCKED', detail: e instanceof Error ? e.message : 'unreachable' });
    }
  } else {
    checks.push({ id: 'witness.configured', status: 'NOT_YET_PROVEN', detail: 'WITNESS_URL not set' });
  }

  // 7. Database
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl) {
    try {
      const { Client } = await import('pg');
      const pgClient = new Client({ connectionString: dbUrl });
      await pgClient.connect();
      const result = await pgClient.query('SELECT 1 AS ok');
      await pgClient.end();
      checks.push({ id: 'database', status: result.rows[0]?.ok === 1 ? 'PASS' : 'FAIL', detail: 'PostgreSQL reachable' });
    } catch (e) {
      checks.push({ id: 'database', status: 'BLOCKED', detail: e instanceof Error ? e.message : 'unreachable' });
    }
  } else {
    checks.push({ id: 'database.configured', status: 'NOT_YET_PROVEN', detail: 'DATABASE_URL not set' });
  }

  // Build report
  const overall = overallStatus(checks);
  const report: Report = {
    verifierVersion: 'xyx-verify-live-v1',
    network: 'arc-testnet',
    timestamp: new Date().toISOString(),
    gitCommit: deploymentManifest.gitCommit ?? 'unknown',
    overall,
    checks,
  };

  console.log(serializeReport(report));
  process.exit(exitCodeForStatus(overall));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error('Verification failed:', e); process.exit(1); });
}
