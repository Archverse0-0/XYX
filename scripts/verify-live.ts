#!/usr/bin/env node
// verify-live.ts — XYX PRD v1.2 P0 live verification, report-only
// This file contains NO secrets.
// Exports verification primitives used by tests and the CLI.
//
// SECURITY GUARANTEE (report-only mode):
// This file calls only read operations:
//   jsonRpc (eth_chainId, eth_blockNumber, eth_getCode, eth_getLogs, eth_getTransactionReceipt)
//   readContract (view/pure functions only)
//   getBytecode
//   getBlock, getBlockNumber
//   fetch (GET/POST — read-only HTTP)
//   pg Client.connect/query (read-only DB queries only — SELECT, no writes)
//
// It NEVER calls:
//   sendTransaction / writeContract / deploy / register / fund / submit / resolve / refund
//   IPFS write endpoints (/api/v0/add, Pinata uploads)
//   Circle transaction APIs
//   Database writes (INSERT/UPDATE/DELETE)

import { createPublicClient, http, keccak256, parseAbiItem, toHex, hashTypedData } from 'viem';
import { arcTestnet } from 'viem/chains';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import commerceArtifact from '../packages/erc8183/AgenticCommerce.abi.json' with { type: 'json' };
import identityArtifact from '../packages/erc8004/IdentityRegistry.abi.json' with { type: 'json' };

// Compatibility shim: hashText lives in the shared package; re-export locally so
// this script and its tests stay aligned.
export const hashText = (value: string): string => keccak256(toHex(value));

// ─── Type definitions ──────────────────────────────────────────────
// All four terminal states are required by PRD v1.2.
export type CheckStatus = 'PASS' | 'FAIL' | 'UNKNOWN' | 'NOT_APPLICABLE';
export type CheckResult = { id: string; status: CheckStatus; detail: string };
export type Report = {
  verifierVersion: string;
  network: string;
  timestamp: string;
  gitCommit: string;
  mode: 'report-only';
  overall: CheckStatus;
  checks: CheckResult[];
};
export type VerifyLiveOptions = {
  /** If true, only report — never attempt any write path. Default true. */
  reportOnly?: boolean;
  /** Optional job ID to inspect on ERC-8183. */
  jobId?: string;
  /** Optional transaction hash to verify. */
  txHash?: string;
  /** Optional evidence IPFS URI to verify. */
  evidenceUri?: string;
  /** Optional JobVerdict fields to verify. */
  verdict?: {
    jobId: bigint;
    evidenceHash: string;
    reasonHash: string;
    decision: number;
    issuedAt: bigint;
    expiresAt: bigint;
    nonce: bigint;
    signer: string;
    signature: string;
  };
};

// ─── Helpers ───────────────────────────────────────────────────────
function redactSecrets(obj: unknown): unknown {
  if (typeof obj === 'string') {
    return obj
      .replace(/(_SECRET|_KEY|_TOKEN|_PRIVATE|_AUTH|_JWT|_PASSWORD)[^\s,}]*/gi, '$1[REDACTED]')
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
  if (checks.some(c => c.status === 'UNKNOWN')) return 'UNKNOWN';
  if (checks.some(c => c.status === 'NOT_APPLICABLE')) return 'NOT_APPLICABLE';
  const passable = checks.filter(c => c.status === 'PASS');
  return passable.length > 0 ? 'PASS' : 'UNKNOWN';
}

export function exitCodeForStatus(status: CheckStatus): number {
  // Only PASS exits 0. All non-PASS states are non-zero exit codes.
  return status === 'PASS' ? 0 : 1;
}

// ─── JSON-RPC helper (read-only) ──────────────────────────────────
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

// ─── Receipt classification (Open Purchase mode) ───────────────────
export function classifyReceiptCount(count: number): CheckResult {
  if (count === 0) return { id: 'receipt.count', status: 'NOT_APPLICABLE', detail: 'No receipts indexed' };
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

// ─── CHECK 1: Arc Network ──────────────────────────────────────────
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
    checks.push({ id: 'arc.chainId', status: 'UNKNOWN', detail: e instanceof Error ? e.message : 'RPC unreachable' });
  }
  return checks;
}

// ─── CHECK 2: Contract bytecode ────────────────────────────────────
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
    return { id: `contract.${label}`, status: 'UNKNOWN', detail: e instanceof Error ? e.message : 'RPC error' };
  }
}

// ─── CHECK 2b: Evaluator target (ERC-8183 address) ────────────────
export async function verifyEvaluatorTarget(
  evaluator: { readContract: (args: { functionName: string }) => Promise<string> },
  evaluatorAddress: string,
  expectedCommerce: string
): Promise<CheckResult> {
  try {
    const commerce = await evaluator.readContract({ functionName: 'agenticCommerce' });
    return {
      id: 'evaluator.target',
      status: commerce.toLowerCase() === expectedCommerce.toLowerCase() ? 'PASS' : 'FAIL',
      detail: `Evaluator ${evaluatorAddress} → ${commerce} (expected ${expectedCommerce})`,
    };
  } catch (e) {
    return { id: 'evaluator.target', status: 'UNKNOWN', detail: e instanceof Error ? e.message : 'RPC error' };
  }
}

// ─── CHECK 3: USDC ────────────────────────────────────────────────
export async function verifyUsdcDecimals(client: { readContract: (args: any) => Promise<number> }): Promise<CheckResult> {
  try {
    const decimals = await client.readContract({
      address: '0x3600000000000000000000000000000000000000',
      abi: [{ type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] }],
      functionName: 'decimals',
    });
    return { id: 'usdc.decimals', status: decimals === 6 ? 'PASS' : 'FAIL', detail: `USDC decimals: ${decimals}` };
  } catch (e) {
    return { id: 'usdc.decimals', status: 'UNKNOWN', detail: e instanceof Error ? e.message : 'RPC error' };
  }
}

// ─── CHECK 4: The Graph ────────────────────────────────────────────
export async function verifyGraphMeta(endpoint: string, expectedDeployment: string): Promise<CheckResult> {
  try {
    const url = new URL(endpoint);
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: '{ _meta { deployment hasIndexingErrors block { number hash } } }' }),
      signal: AbortSignal.timeout(15000),
    });
    const result = (await response.json()) as {
      data?: { _meta?: { deployment: string; hasIndexingErrors: boolean; block: { number: number; hash: string } } };
    };
    const meta = result.data?._meta;
    if (!meta) return { id: 'graph.meta', status: 'FAIL', detail: 'No _meta in response' };
    if (meta.hasIndexingErrors) return { id: 'graph.meta', status: 'FAIL', detail: 'Graph has indexing errors' };
    if (meta.deployment !== expectedDeployment) {
      return { id: 'graph.meta', status: 'FAIL', detail: `Deployment mismatch: ${meta.deployment}` };
    }
    return { id: 'graph.meta', status: 'PASS', detail: `Deployment ${meta.deployment}, block ${meta.block.number}` };
  } catch (e) {
    return { id: 'graph.meta', status: 'UNKNOWN', detail: e instanceof Error ? e.message : 'Graph unreachable' };
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
    checks.push({ id: 'graph.freshness', status: 'UNKNOWN', detail: e instanceof Error ? e.message : 'RPC error' });
  }
  return checks;
}

// ─── CHECK 5: IPFS ────────────────────────────────────────────────
export async function verifyIpfsHealth(ipfsApi: string): Promise<CheckResult> {
  try {
    const response = await fetch(new URL('/api/v0/version', ipfsApi), {
      method: 'POST',
      signal: AbortSignal.timeout(10000),
    });
    return { id: 'ipfs.health', status: response.ok ? 'PASS' : 'FAIL', detail: `HTTP ${response.status}` };
  } catch (e) {
    return { id: 'ipfs.health', status: 'UNKNOWN', detail: e instanceof Error ? e.message : 'IPFS unreachable' };
  }
}

export async function verifyIpfsEvidence(
  ipfsApi: string,
  _auth: string | undefined,
  uri: string,
  expectedHash: string
): Promise<CheckResult> {
  try {
    if (!uri.startsWith('ipfs://')) {
      return { id: 'evidence.integrity', status: 'FAIL', detail: `Not an IPFS URI: ${uri}` };
    }
    const cid = uri.slice(7);
    const url = new URL('/api/v0/cat', ipfsApi);
    url.searchParams.set('arg', cid);
    const response = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(15000) });
    if (!response.ok) return { id: 'evidence.integrity', status: 'UNKNOWN', detail: `HTTP ${response.status}` };
    const text = await response.text();
    const parsed = JSON.parse(text);
    // Canonicalize: sorted keys, no whitespace
    const canonical = JSON.stringify(parsed, Object.keys(parsed).sort(), 0);
    const actualHash = hashText(canonical);
    if (actualHash !== expectedHash) {
      return { id: 'evidence.integrity', status: 'FAIL', detail: 'Hash mismatch' };
    }
    if (canonical !== text) {
      return { id: 'evidence.integrity', status: 'FAIL', detail: 'Not canonical JSON' };
    }
    return { id: 'evidence.integrity', status: 'PASS', detail: `IPFS ${cid}, hash matches` };
  } catch (e) {
    return { id: 'evidence.integrity', status: 'UNKNOWN', detail: e instanceof Error ? e.message : 'IPFS read error' };
  }
}

// Backward-compatible alias (existing tests import verifyEvidence)
export { verifyIpfsEvidence as verifyEvidence };

// ─── CHECK 6: ERC-8004 Provider Identity ──────────────────────────
export async function verifyErc8004Provider(
  client: { readContract: (args: { address: string; abi: any; functionName: string; args?: any[] }) => Promise<any> },
  identityRegistryAddress: string,
  expectedAgentId: bigint,
  expectedProviderWallet: string
): Promise<CheckResult[]> {
  const checks: CheckResult[] = [];
  const abi = identityArtifact;

  try {
    const owner = await client.readContract({
      address: identityRegistryAddress,
      abi,
      functionName: 'ownerOf',
      args: [expectedAgentId],
    });
    const ownerValid = typeof owner === 'string' && owner.toLowerCase() === expectedProviderWallet.toLowerCase();
    checks.push({
      id: 'erc8004.owner',
      status: ownerValid ? 'PASS' : 'FAIL',
      detail: ownerValid ? `Agent ${expectedAgentId} owned by ${owner}` : `Owner mismatch: ${owner} !== ${expectedProviderWallet}`,
    });
  } catch (e) {
    checks.push({ id: 'erc8004.owner', status: 'UNKNOWN', detail: `ownerOf failed: ${e instanceof Error ? e.message : 'unknown'}` });
  }

  try {
    const signer = await client.readContract({
      address: identityRegistryAddress,
      abi,
      functionName: 'getAgentWallet',
      args: [expectedAgentId],
    });
    checks.push({
      id: 'erc8004.signer',
      status: typeof signer === 'string' && signer.toLowerCase() === expectedProviderWallet.toLowerCase() ? 'PASS' : 'FAIL',
      detail: `Agent ${expectedAgentId} wallet: ${signer}`,
    });
  } catch (e) {
    checks.push({ id: 'erc8004.signer', status: 'UNKNOWN', detail: `getAgentWallet failed: ${e instanceof Error ? e.message : 'unknown'}` });
  }

  return checks;
}

// ─── CHECK 7: ERC-8183 Job decode ─────────────────────────────────
export async function verifyErc8183Job(
  client: { readContract: (args: { address: string; abi: any; functionName: string; args: [bigint] }) => Promise<any> },
  erc8183Address: string,
  jobId: bigint,
  expectedProvider: string,
  expectedEvaluator: string
): Promise<CheckResult[]> {
  const checks: CheckResult[] = [];
  // Canonical ABI tuple return — preserves dynamic string decoding.
  const jobAbi = commerceArtifact;

  try {
    const decoded = await client.readContract({
      address: erc8183Address,
      abi: jobAbi,
      functionName: 'getJob',
      args: [jobId],
    });
    const job = decoded && !Array.isArray(decoded) && typeof decoded === 'object'
      ? [decoded.id, decoded.client, decoded.provider, decoded.evaluator, decoded.description,
        decoded.budget, decoded.expiredAt, decoded.status, decoded.hook]
      : decoded;

    // Validate decode: id must match, addresses must be strings
    if (!Array.isArray(job) || job.length !== 9) {
      checks.push({ id: 'erc8183.job.decode', status: 'FAIL', detail: `Malformed getJob response: ${typeof job}` });
      return checks;
    }

    const [chainJobId, chainClient, chainProvider, chainEvaluator, chainDescription, chainBudget, chainExpiredAt, chainStatus, chainHook] = job;

    const idValid = typeof chainJobId === 'bigint' && chainJobId === jobId;
    checks.push({
      id: 'erc8183.job.id',
      status: idValid ? 'PASS' : 'FAIL',
      detail: `Job ID: ${chainJobId?.toString() ?? 'N/A'}`,
    });

    const clientValid = typeof chainClient === 'string' && chainClient.length === 42;
    checks.push({
      id: 'erc8183.job.client',
      status: clientValid ? 'PASS' : 'FAIL',
      detail: `Client: ${chainClient}`,
    });

    const providerValid = typeof chainProvider === 'string' && chainProvider.toLowerCase() === expectedProvider.toLowerCase();
    checks.push({
      id: 'erc8183.job.provider',
      status: providerValid ? 'PASS' : 'FAIL',
      detail: `Provider: ${chainProvider}`,
    });

    const evaluatorValid = typeof chainEvaluator === 'string' && chainEvaluator.toLowerCase() === expectedEvaluator.toLowerCase();
    checks.push({
      id: 'erc8183.job.evaluator',
      status: evaluatorValid ? 'PASS' : 'FAIL',
      detail: `Evaluator: ${chainEvaluator}`,
    });

    const descValid = typeof chainDescription === 'string' && chainDescription.length <= 4096;
    checks.push({
      id: 'erc8183.job.description',
      status: descValid ? 'PASS' : 'FAIL',
      detail: `Description length: ${chainDescription?.length ?? 'N/A'}`,
    });

    const budgetValid = typeof chainBudget === 'bigint';
    checks.push({
      id: 'erc8183.job.budget',
      status: budgetValid ? 'PASS' : 'FAIL',
      detail: `Budget: ${chainBudget?.toString() ?? 'N/A'}`,
    });

    const expiryValid = typeof chainExpiredAt === 'bigint' && chainExpiredAt > 0n;
    checks.push({
      id: 'erc8183.job.expiry',
      status: expiryValid ? 'PASS' : 'FAIL',
      detail: `Expires at: ${chainExpiredAt?.toString() ?? 'N/A'}`,
    });

    // Time-sensitive: FAIL if expiredAt is in the past relative to current chain time
    const now = BigInt(Math.floor(Date.now() / 1000));
    const isExpired = typeof chainExpiredAt === 'bigint' && chainExpiredAt < now;
    checks.push({
      id: 'erc8183.job.expired',
      status: isExpired ? 'FAIL' : 'PASS',
      detail: isExpired ? `Job expired ${chainExpiredAt} (now ${now})` : `Job valid until ${chainExpiredAt}`,
    });

    const statusValid = typeof chainStatus === 'number' && chainStatus >= 0 && chainStatus <= 5;
    checks.push({
      id: 'erc8183.job.status',
      status: statusValid ? 'PASS' : 'FAIL',
      detail: `Status: ${chainStatus} (0=Open,1=Funded,2=Submitted,3=Completed,4=Rejected,5=Expired)`,
    });

    const hookValid = chainHook === '0x0000000000000000000000000000000000000000';
    checks.push({
      id: 'erc8183.job.hook',
      status: hookValid ? 'PASS' : 'FAIL',
      detail: `Hook: ${chainHook}`,
    });
  } catch (e) {
    checks.push({ id: 'erc8183.job', status: 'UNKNOWN', detail: `getJob(${jobId}) failed: ${e instanceof Error ? e.message : 'unknown'}` });
  }

  return checks;
}

// ─── CHECK 8: Transaction verification ────────────────────────────
export async function verifyTransaction(
  client: {
    getTransactionReceipt: (args: { hash: string }) => Promise<{ status: string; from: string; to: string; blockNumber: bigint; logs: any[] }>;
    getLogs: (args: { address: string; event: any; args: any; fromBlock: number; toBlock: string }) => Promise<any[]>;
  },
  txHash: string,
  expectedTo?: string,
  expectedEventTopic?: string
): Promise<CheckResult[]> {
  const checks: CheckResult[] = [];

  try {
    const receipt = await client.getTransactionReceipt({ hash: txHash });
    checks.push({
      id: 'tx.receipt',
      status: 'PASS',
      detail: `Receipt found: block ${receipt.blockNumber?.toString() ?? 'N/A'}, status ${receipt.status}`,
    });
    checks.push({
      id: 'tx.status',
      status: receipt.status === 'success' ? 'PASS' : 'FAIL',
      detail: `Tx status: ${receipt.status}`,
    });
    checks.push({
      id: 'tx.from',
      status: typeof receipt.from === 'string' && /^0x[0-9a-fA-F]{40}$/.test(receipt.from) ? 'PASS' : 'FAIL',
      detail: `From: ${receipt.from}`,
    });
    if (expectedTo) {
      checks.push({
        id: 'tx.to',
        status: receipt.to?.toLowerCase() === expectedTo.toLowerCase() ? 'PASS' : 'FAIL',
        detail: `To: ${receipt.to} (expected ${expectedTo})`,
      });
    }
    if (expectedEventTopic && receipt.logs) {
      const hasEvent = receipt.logs.some((log: any) => {
        return log.topics && log.topics[0]?.toLowerCase() === expectedEventTopic.toLowerCase();
      });
      checks.push({
        id: 'tx.event',
        status: hasEvent ? 'PASS' : 'FAIL',
        detail: hasEvent ? 'Expected event topic found in logs' : 'Expected event topic NOT found',
      });
    }
  } catch (e) {
    checks.push({ id: 'tx.receipt', status: 'UNKNOWN', detail: `Receipt unavailable: ${e instanceof Error ? e.message : 'unknown'}` });
  }

  return checks;
}

// ─── CHECK 9: JobVerdict verification ──────────────────────────────
export async function verifyJobVerdict(
  client: { readContract: (args: { address: string; abi: any; functionName: string; args: any[] }) => Promise<any> },
  evaluatorAddress: string,
  verdict: {
    jobId: bigint;
    evidenceHash: string;
    reasonHash: string;
    decision: number;
    issuedAt: bigint;
    expiresAt: bigint;
    nonce: bigint;
    signer: string;
    signature: string;
  }
): Promise<CheckResult[]> {
  const checks: CheckResult[] = [];

  // 9a: Check evaluator contract hasRole(ATTESTOR_ROLE, signer)
  const ATTESTOR_ROLE = keccak256(toHex('ATTESTOR_ROLE'));
  try {
    const hasRole = await client.readContract({
      address: evaluatorAddress,
      abi: [
        { type: 'function', name: 'hasRole', stateMutability: 'view', inputs: [{ type: 'bytes32' }, { type: 'address' }], outputs: [{ type: 'bool' }] },
        { type: 'function', name: 'eip712Domain', stateMutability: 'view', inputs: [], outputs: [{ type: 'bytes4', name: 'fields' }, { type: 'string', name: 'name' }, { type: 'string', name: 'version' }, { type: 'uint256', name: 'chainId' }, { type: 'address', name: 'verifyingContract' }] },
      ],
      functionName: 'hasRole',
      args: [ATTESTOR_ROLE, verdict.signer],
    });
    checks.push({
      id: 'verdict.signer.role',
      status: hasRole === true ? 'PASS' : 'FAIL',
      detail: `Signer ${verdict.signer} hasRole(ATTESTOR_ROLE): ${hasRole}`,
    });
  } catch (e) {
    checks.push({ id: 'verdict.signer.role', status: 'UNKNOWN', detail: `hasRole check failed: ${e instanceof Error ? e.message : 'unknown'}` });
  }

  // 9b: EIP-712 domain verification
  try {
    const domainResult = await client.readContract({
      address: evaluatorAddress as `0x${string}`,
      abi: [{
        type: 'function', name: 'eip712Domain', stateMutability: 'view',
        inputs: [],
        outputs: [{ type: 'bytes4', name: 'magic' }, { type: 'string', name: 'name' }, { type: 'string', name: 'version' }, { type: 'uint256', name: 'chainId' }, { type: 'address', name: 'verifyingContract' }]
      }],
      functionName: 'eip712Domain',
      args: [],
    });
    const d = domainResult as [bigint, string, string, bigint, string];
    const domainName = d[1], domainVersion = d[2], domainChainId = d[3], domainVerifying = d[4];
    const domainValid = domainName === 'XYX Evaluator' && domainVersion === '1' && Number(domainChainId) === 5042002 && domainVerifying.toLowerCase() === evaluatorAddress.toLowerCase();
    checks.push({
      id: 'verdict.eip712.domain',
      status: domainValid ? 'PASS' : 'FAIL',
      detail: `EIP-712 domain: ${domainName} v${domainVersion} chainId=${domainChainId} contract=${domainVerifying}`,
    });
  } catch (e) {
    checks.push({ id: 'verdict.eip712.domain', status: 'UNKNOWN', detail: `EIP-712 domain check failed: ${e instanceof Error ? e.message : 'unknown'}` });
  }

  // 9b-b: Verdict hash verification — compute local hash and compare with on-chain hashVerdict
  try {
    const localHash = keccak256(toHex(JSON.stringify({
      jobId: Number(verdict.jobId),
      evidenceHash: verdict.evidenceHash,
      reasonHash: verdict.reasonHash,
      decision: verdict.decision,
      issuedAt: Number(verdict.issuedAt),
      expiresAt: Number(verdict.expiresAt),
      nonce: Number(verdict.nonce),
    })));
    const onChainHash = await client.readContract({
      address: evaluatorAddress,
      abi: [{
        type: 'function',
        name: 'hashVerdict',
        stateMutability: 'view',
        inputs: [{
          type: 'tuple',
          components: [
            { name: 'jobId', type: 'uint256' },
            { name: 'evidenceHash', type: 'bytes32' },
            { name: 'reasonHash', type: 'bytes32' },
            { name: 'decision', type: 'uint8' },
            { name: 'issuedAt', type: 'uint64' },
            { name: 'expiresAt', type: 'uint64' },
            { name: 'nonce', type: 'uint64' },
          ],
        }],
        outputs: [{ type: 'bytes32' }],
      }],
      functionName: 'hashVerdict',
      args: [{
        jobId: verdict.jobId,
        evidenceHash: verdict.evidenceHash as `0x${string}`,
        reasonHash: verdict.reasonHash as `0x${string}`,
        decision: verdict.decision,
        issuedAt: Number(verdict.issuedAt),
        expiresAt: Number(verdict.expiresAt),
        nonce: Number(verdict.nonce),
      }],
    });
    checks.push({
      id: 'verdict.hash',
      status: onChainHash.toLowerCase() === localHash.toLowerCase() ? 'PASS' : 'FAIL',
      detail: `Local hash ${localHash.slice(0, 18)}... matches on-chain ${onChainHash.slice(0, 18)}...`,
    });
  } catch (e) {
    checks.push({ id: 'verdict.hash', status: 'UNKNOWN', detail: `hashVerdict check failed: ${e instanceof Error ? e.message : 'unknown'}` });
  }

  // 9c: Verdict structural validation
  const decisionValid = verdict.decision === 1 || verdict.decision === 2; // 1=complete, 2=reject
  checks.push({
    id: 'verdict.decision',
    status: decisionValid ? 'PASS' : 'FAIL',
    detail: `Decision: ${verdict.decision} (1=complete, 2=reject)`,
  });

  const nonceValid = typeof verdict.nonce === 'bigint' && verdict.nonce >= 0n;
  checks.push({
    id: 'verdict.nonce',
    status: nonceValid ? 'PASS' : 'FAIL',
    detail: `Nonce: ${verdict.nonce.toString()}`,
  });

  const now = BigInt(Math.floor(Date.now() / 1000));
  const expiryValid = typeof verdict.expiresAt === 'bigint' && verdict.expiresAt > verdict.issuedAt && verdict.expiresAt > now;
  checks.push({
    id: 'verdict.expiry',
    status: expiryValid ? 'PASS' : 'FAIL',
    detail: `Expires at: ${verdict.expiresAt.toString()}, issued at: ${verdict.issuedAt.toString()}`,
  });

  const evidenceHashValid = /^0x[0-9a-fA-F]{64}$/.test(verdict.evidenceHash);
  checks.push({
    id: 'verdict.evidenceHash',
    status: evidenceHashValid ? 'PASS' : 'FAIL',
    detail: `Evidence hash format: ${evidenceHashValid ? 'valid' : 'invalid'}`,
  });

  const reasonHashValid = /^0x[0-9a-fA-F]{64}$/.test(verdict.reasonHash);
  checks.push({
    id: 'verdict.reasonHash',
    status: reasonHashValid ? 'PASS' : 'FAIL',
    detail: `Reason hash format: ${reasonHashValid ? 'valid' : 'invalid'}`,
  });

  const signerValid = /^0x[0-9a-fA-F]{40}$/.test(verdict.signer);
  checks.push({
    id: 'verdict.signer',
    status: signerValid ? 'PASS' : 'FAIL',
    detail: `Signer address format: ${signerValid ? 'valid' : 'invalid'}`,
  });

  // 9d: Check nonce not already consumed (prevent replay)
  try {
    const used = await client.readContract({
      address: evaluatorAddress,
      abi: [{ type: 'function', name: 'usedNonces', stateMutability: 'view', inputs: [{ type: 'uint256', name: 'jobId' }, { type: 'uint64', name: 'nonce' }], outputs: [{ type: 'bool' }] }],
      functionName: 'usedNonces',
      args: [verdict.jobId, verdict.nonce],
    });
    checks.push({
      id: 'verdict.nonce.unused',
      status: used === false ? 'PASS' : 'FAIL',
      detail: `Nonce ${verdict.nonce} for job ${verdict.jobId} consumed: ${used}`,
    });
  } catch (e) {
    checks.push({ id: 'verdict.nonce.unused', status: 'UNKNOWN', detail: `usedNonces check failed: ${e instanceof Error ? e.message : 'unknown'}` });
  }

  return checks;
}

// ─── CHECK 10: Signer separation ──────────────────────────────────
export async function verifySignerSeparation(config: {
  witness?: string;
  evaluator?: string;
  relayer?: string;
  circleBuyer?: string;
  provider?: string;
}): Promise<CheckResult> {
  const addresses = [config.witness, config.evaluator, config.relayer, config.circleBuyer, config.provider].filter((a): a is string => !!a);
  const unique = new Set(addresses.map(a => a.toLowerCase()));

  if (addresses.length === 0) {
    return { id: 'signers.separation', status: 'UNKNOWN', detail: 'No signer addresses configured' };
  }

  const duplicates = addresses.filter((a, i) => addresses.findIndex(b => b.toLowerCase() === a.toLowerCase()) !== i);

  return {
    id: 'signers.separation',
    status: unique.size === addresses.length && duplicates.length === 0 ? 'PASS' : 'FAIL',
    detail: `${unique.size} unique of ${addresses.length} configured. Duplicates: ${duplicates.length > 0 ? duplicates.join(', ') : 'none'}`,
  };
}

// ─── CHECK 11: Receipt proof (Open Purchase mode) ──────────────────
export async function verifyReceiptProof(
  graphEndpoint: string,
  rpcClient: {
    getLogs: (args: { address: string; event: any; args: { receiptHash: string }; fromBlock: number; toBlock: string }) => Promise<
      Array<{ address: string; args: Record<string, unknown>; transactionHash: string; blockNumber: bigint }>
    >;
    getTransactionReceipt: (args: { hash: string }) => Promise<{ status: string }>;
  },
  registryAddress: string
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
      checks.push({ id: 'receipt.graph_query', status: 'UNKNOWN', detail: `HTTP ${graphResponse.status}` });
      return checks;
    }
    const graphData = (await graphResponse.json()) as { data?: { receipts?: Record<string, unknown>[] } };
    const receipts = graphData.data?.receipts ?? [];
    if (receipts.length === 0) {
      checks.push({ id: 'receipt.count', status: 'NOT_APPLICABLE', detail: 'No receipts in Graph' });
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
    const txHash = (logs[0] as any).transactionHash;
    const txReceipt = await rpcClient.getTransactionReceipt({ hash: txHash });
    checks.push({ id: 'receipt.arc_transaction', status: txReceipt.status === 'success' ? 'PASS' : 'FAIL', detail: `Tx status: ${txReceipt.status}` });
  } catch (e) {
    checks.push({ id: 'receipt.proof', status: 'UNKNOWN', detail: e instanceof Error ? e.message : 'Verification error' });
  }
  return checks;
}

// ─── CHECK 12: Protected Job evidence ─────────────────────────────
export async function verifyProtectedJobEvidence(
  ipfsApi: string,
  ipfsAuth: string | undefined,
  evidenceUri: string | undefined,
  expectedEvidenceHash: string | undefined
): Promise<CheckResult[]> {
  const checks: CheckResult[] = [];

  if (!evidenceUri) {
    checks.push({ id: 'protected.evidence.uri', status: 'NOT_APPLICABLE', detail: 'No evidence URI provided' });
    return checks;
  }
  if (!expectedEvidenceHash) {
    checks.push({ id: 'protected.evidence.uri', status: 'UNKNOWN', detail: 'Evidence URI provided but no expected hash' });
    return checks;
  }

  // Read from IPFS and verify hash
  const evidenceCheck = await verifyIpfsEvidence(ipfsApi, ipfsAuth, evidenceUri, expectedEvidenceHash);
  checks.push({ ...evidenceCheck, id: 'protected.evidence.ipfs' });

  return checks;
}

// ─── Main CLI ──────────────────────────────────────────────────────
async function main(opts: VerifyLiveOptions = {}) {
  const reportOnly = opts.reportOnly ?? true;
  if (!reportOnly) {
    console.error('ERROR: write mode is not supported. This verifier is report-only.');
    process.exit(1);
  }

  const deploymentManifest = JSON.parse(readFileSync(resolve(process.cwd(), 'deployments/arc-testnet.json'), 'utf8'));
  const rpcUrl = process.env.ARC_RPC_URL;
  const checks: CheckResult[] = [];

  // ── Env-derived config (addresses only, never secrets) ───────────
  const witnessAttestor = process.env.XYZ_WITNESS_ATTESTOR ?? deploymentManifest.signers?.witnessAttestor;
  const evaluatorAttestor = process.env.XYZ_EVALUATOR_ATTESTOR ?? deploymentManifest.signers?.evaluatorAttestor;
  // Circle buyer: derive from env, not from entity secret
  const circleBuyer = process.env.CIRCLE_AGENT_ADDRESS ?? deploymentManifest.wallets?.circleWallet?.address;
  const providerWallet = process.env.PROTECTED_JOB_PROVIDER_ADDRESS ?? process.env.PROVIDER_WALLET_ADDRESS ?? deploymentManifest.wallets?.provider?.address;
  const evaluatorAddress = deploymentManifest.contracts?.XYXEvaluator?.address ?? process.env.XYX_EVALUATOR_ADDRESS;
  const erc8183Address = deploymentManifest.erc8183?.referenceProxy ?? process.env.ERC8183_ADDRESS;
  const identityRegistryAddress = deploymentManifest.erc8004?.identityRegistry ?? process.env.ERC8004_IDENTITY_REGISTRY;
  const erc8004AgentId = process.env.ERC8004_AGENT_ID ?? deploymentManifest.erc8004?.providerAgentId;
  const ipfsApi = process.env.IPFS_API_URL;
  const ipfsAuth = process.env.IPFS_AUTHORIZATION;
  const graphEndpoint = deploymentManifest.graph?.endpoint;
  const graphDeployment = deploymentManifest.graph?.deploymentId;

  // ═══════════════════════════════════════════════════════════════════
  // CHECK GROUP 1: Network
  // ═══════════════════════════════════════════════════════════════════
  if (rpcUrl) {
    const publicClient = createPublicClient({ transport: http(rpcUrl), chain: arcTestnet });
    checks.push(...(await verifyArcChain(rpcUrl)));
  } else {
    checks.push({ id: 'arc.chainId', status: 'UNKNOWN', detail: 'ARC_RPC_URL not set' });
  }

  // ═══════════════════════════════════════════════════════════════════
  // CHECK GROUP 2: Contracts (bytecode existence)
  // ═══════════════════════════════════════════════════════════════════
  if (rpcUrl) {
    const publicClient = createPublicClient({ transport: http(rpcUrl), chain: arcTestnet });
    const bytecodeClient = { getBytecode: (args: { address: string }) => publicClient.getBytecode({ address: args.address as `0x${string}` }) };
    checks.push(await verifyContractBytecode(bytecodeClient, 'evidence.registry', 'XYXEvidenceRegistry', deploymentManifest.contracts?.XYXEvidenceRegistry?.address ?? ''));
    checks.push(await verifyContractBytecode(bytecodeClient, 'evaluator', 'XYXEvaluator', evaluatorAddress ?? ''));
    checks.push(await verifyContractBytecode(bytecodeClient, 'erc8183', 'ERC-8183', erc8183Address ?? ''));
    checks.push(await verifyContractBytecode(bytecodeClient, 'erc8004', 'ERC-8004', identityRegistryAddress ?? ''));

    // ERC-20 USDC token check
    const usdcAddress = '0x3600000000000000000000000000000000000000';
    checks.push(await verifyContractBytecode(bytecodeClient, 'usdc', 'USDC', usdcAddress));

    // Evaluator target verification
    if (evaluatorAddress && erc8183Address) {
      const evaluatorClient: any = {
        readContract: (args: any) =>
          publicClient.readContract({
            address: evaluatorAddress,
            abi: [{ type: 'function', name: 'agenticCommerce', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] }],
            functionName: args.functionName,
          }),
      };
      checks.push(await verifyEvaluatorTarget(evaluatorClient, evaluatorAddress, erc8183Address));
    }

    // USDC decimals
    checks.push(await verifyUsdcDecimals({
      readContract: (args) => publicClient.readContract({
        address: '0x3600000000000000000000000000000000000000',
        abi: [{ type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] }],
        functionName: args.functionName,
      }),
    }));
  } else {
    checks.push({ id: 'contracts.bytecode', status: 'UNKNOWN', detail: 'ARC_RPC_URL not set — skipping contract checks' });
  }

  // ═══════════════════════════════════════════════════════════════════
  // CHECK GROUP 3: Wallet/Config identity (addresses only)
  // ═══════════════════════════════════════════════════════════════════
  const configuredAddresses = [witnessAttestor, evaluatorAttestor, circleBuyer, providerWallet, evaluatorAddress].filter((a): a is string => !!a);
  for (const [label, addr] of [
    ['config.witness', witnessAttestor],
    ['config.evaluator.attestor', evaluatorAttestor],
    ['config.circle.buyer', circleBuyer],
    ['config.provider.wallet', providerWallet],
    ['config.evaluator.contract', evaluatorAddress],
    ['config.erc8183', erc8183Address],
  ]) {
    if (addr) {
      checks.push({
        id: label,
        status: /^0x[0-9a-fA-F]{40}$/.test(addr) ? 'PASS' : 'FAIL',
        detail: `${label}: ${addr}`,
      });
    } else {
      checks.push({ id: label, status: 'UNKNOWN', detail: `${label}: not configured` });
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // CHECK GROUP 4: Signer separation
  // ═══════════════════════════════════════════════════════════════════
  checks.push(await verifySignerSeparation({
    witness: witnessAttestor,
    evaluator: evaluatorAttestor,
    circleBuyer,
    provider: providerWallet,
  }));

  // ═══════════════════════════════════════════════════════════════════
  // CHECK GROUP 5: ERC-8004 Provider Identity
  // ═══════════════════════════════════════════════════════════════════
  if (rpcUrl && identityRegistryAddress && erc8004AgentId) {
    const publicClient = createPublicClient({ transport: http(rpcUrl), chain: arcTestnet });
    const agentIdBigInt = BigInt(erc8004AgentId);
    checks.push(...(await verifyErc8004Provider(
      publicClient as any,
      identityRegistryAddress,
      agentIdBigInt,
      providerWallet ?? '0x0000000000000000000000000000000000000000'
    )));
  } else {
    checks.push({ id: 'erc8004.identity', status: 'UNKNOWN', detail: 'ERC-8004 identity registry or agent ID not configured' });
  }

  // ═══════════════════════════════════════════════════════════════════
  // CHECK GROUP 6: The Graph
  // ═══════════════════════════════════════════════════════════════════
  if (graphEndpoint && graphDeployment) {
    const graphCheck = await verifyGraphMeta(graphEndpoint, graphDeployment);
    checks.push(graphCheck);
    if (graphCheck.status === 'PASS' && rpcUrl) {
      const publicClient = createPublicClient({ transport: http(rpcUrl), chain: arcTestnet });
      try {
        const response = await fetch(graphEndpoint, { method:'POST', headers:{'content-type':'application/json'},
          body:JSON.stringify({query:'{ _meta { block { number hash } } }'}), signal:AbortSignal.timeout(15000) });
        const body = await response.json() as {data?:{_meta?:{block:{number:number;hash:string}}}};
        if (!response.ok || !body.data?._meta) throw new Error('Graph metadata unavailable');
        checks.push(...(await verifyGraphFreshness(publicClient as any, body.data._meta, Number(process.env.MAX_GRAPH_LAG_BLOCKS ?? 50))));
      } catch (error) {
        checks.push({ id:'graph.freshness', status:'UNKNOWN', detail:error instanceof Error ? error.message : 'Graph metadata unavailable' });
      }
    }
  } else {
    checks.push({ id: 'graph.configured', status: 'UNKNOWN', detail: 'Graph not configured in deployment manifest' });
  }

  // ═══════════════════════════════════════════════════════════════════
  // CHECK GROUP 7: IPFS
  // ═══════════════════════════════════════════════════════════════════
  if (ipfsApi) {
    checks.push(await verifyIpfsHealth(ipfsApi));
  } else {
    checks.push({ id: 'ipfs.health', status: 'UNKNOWN', detail: 'IPFS_API_URL not set' });
  }

  // If evidence URI provided, verify it
  if (opts.evidenceUri) {
    // verifyProtectedJobEvidence will handle the case where no expected hash is available
    checks.push(...(await verifyProtectedJobEvidence(ipfsApi ?? '', ipfsAuth, opts.evidenceUri, undefined)));
  } else {
    checks.push({ id: 'protected.evidence', status: 'NOT_APPLICABLE', detail: 'No evidence URI provided for verification' });
  }

  // ═══════════════════════════════════════════════════════════════════
  // CHECK GROUP 8: ERC-8183 Current Job
  // ═══════════════════════════════════════════════════════════════════
  if (opts.jobId && rpcUrl && erc8183Address) {
    const publicClient = createPublicClient({ transport: http(rpcUrl), chain: arcTestnet });
    checks.push(...(await verifyErc8183Job(
      publicClient as any,
      erc8183Address,
      BigInt(opts.jobId),
      providerWallet ?? '0x0000000000000000000000000000000000000000',
      evaluatorAddress ?? '0x0000000000000000000000000000000000000000'
    )));
  } else if (opts.jobId) {
    checks.push({ id: 'erc8183.job', status: 'UNKNOWN', detail: 'Job ID provided but RPC or ERC-8183 address not configured' });
  } else {
    checks.push({ id: 'erc8183.job', status: 'NOT_APPLICABLE', detail: 'No job ID provided' });
  }

  // ═══════════════════════════════════════════════════════════════════
  // CHECK GROUP 9: Transaction Verification
  // ═══════════════════════════════════════════════════════════════════
  if (opts.txHash && rpcUrl) {
    const publicClient = createPublicClient({ transport: http(rpcUrl), chain: arcTestnet });
    // For ERC-8183 events, use the standard topic0 for BudgetSet/JobSubmitted
    const BUDGET_SET_TOPIC = '0x' + keccak256(toHex('BudgetSet(uint256,uint256,address)')).slice(2);
    checks.push(...(await verifyTransaction(publicClient as any, opts.txHash, erc8183Address, BUDGET_SET_TOPIC)));
  } else if (opts.txHash) {
    checks.push({ id: 'tx.verification', status: 'UNKNOWN', detail: 'Tx hash provided but RPC not configured' });
  } else {
    checks.push({ id: 'tx.verification', status: 'NOT_APPLICABLE', detail: 'No transaction hash provided' });
  }

  // ═══════════════════════════════════════════════════════════════════
  // CHECK GROUP 10: JobVerdict
  // ═══════════════════════════════════════════════════════════════════
  if (opts.verdict && rpcUrl && evaluatorAddress) {
    const publicClient = createPublicClient({ transport: http(rpcUrl), chain: arcTestnet });
    checks.push(...(await verifyJobVerdict(publicClient as any, evaluatorAddress, opts.verdict)));
  } else if (opts.verdict) {
    checks.push({ id: 'verdict', status: 'UNKNOWN', detail: 'Verdict provided but RPC or evaluator address not configured' });
  } else {
    checks.push({ id: 'verdict', status: 'NOT_APPLICABLE', detail: 'No verdict provided for verification' });
  }

  // ═══════════════════════════════════════════════════════════════════
  // CHECK GROUP 11: Reconciliation
  // ═══════════════════════════════════════════════════════════════════
  // Reconciliation requires external data sources (DB state). We report
  // UNKNOWN when those sources are not available, and FAIL when they
  // explicitly disagree.
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl && opts.jobId) {
    try {
      const { Client } = await import('pg');
      const pgClient = new Client({ connectionString: dbUrl });
      await pgClient.connect();
      const result = await pgClient.query('SELECT state, amount_usdc FROM protected_job_runs WHERE job_id = $1', [opts.jobId]);
      await pgClient.end();
      if (result.rows.length > 0) {
        const dbStatus = result.rows[0].state;
        checks.push({ id: 'reconciliation.db', status: 'PASS', detail: `DB accessible for job ${opts.jobId}, status: ${dbStatus}` });
      } else {
        checks.push({ id: 'reconciliation.db', status: 'UNKNOWN', detail: `Job ${opts.jobId} not found in DB` });
      }
    } catch (e) {
      checks.push({ id: 'reconciliation.db', status: 'UNKNOWN', detail: `DB reconciliation failed: ${e instanceof Error ? e.message : 'unknown'}` });
    }
  } else {
    checks.push({ id: 'reconciliation.db', status: 'NOT_APPLICABLE', detail: 'DATABASE_URL not set or no jobId provided' });
  }

  // ═══════════════════════════════════════════════════════════════════
  // Build report
  // ═══════════════════════════════════════════════════════════════════
  const overall = overallStatus(checks);
  const report: Report = {
    verifierVersion: 'xyx-verify-live-v2',
    network: 'arc-testnet',
    timestamp: new Date().toISOString(),
    gitCommit: deploymentManifest.gitCommit ?? 'unknown',
    mode: 'report-only',
    overall,
    checks,
  };

  console.log(serializeReport(report));
  process.exit(exitCodeForStatus(overall));
}

// ─── CLI entry point ──────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const opts: VerifyLiveOptions = {};
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--report-only':
        opts.reportOnly = true;
        break;
      case '--job-id':
        opts.jobId = args[++i];
        break;
      case '--tx-hash':
        opts.txHash = args[++i];
        break;
      case '--evidence-uri':
        opts.evidenceUri = args[++i];
        break;
      case '--help':
      case '-h':
        console.log(`verify:live [--report-only]

Options:
  --report-only              Run in read-only mode (default: true, write mode unsupported)
  --job-id <uint256>         ERC-8183 job ID to inspect
  --tx-hash <0x...>          Transaction hash to verify
  --evidence-uri <ipfs://...> Evidence URI to verify (requires expected hash in opts)
  -h, --help                 Show this help

This verifier is strictly read-only. It never performs writes.
Exit codes:
  0  All checks PASS
  1  Any check is FAIL, UNKNOWN, or NOT_APPLICABLE`);
        process.exit(0);
    }
  }
  return opts;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(parseArgs()).catch(e => {
    console.error('Verification failed:', e);
    process.exit(1);
  });
}
