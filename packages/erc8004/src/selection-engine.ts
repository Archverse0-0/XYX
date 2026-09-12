import type { Hex } from 'viem';
import { ERC8004Client, validationScore } from '../client.js';
import { GraphClient } from '../../shared/src/graph.js';
import { arcClient } from '../../shared/src/chain.js';
import { evaluate, type Candidate, type RiskReceipt } from '../../risk-engine/src/index.js';
import { canonicalJSON, hashJSON, type PurchaseIntent } from '../../shared/src/index.js';
import { canonicalSelectionHash, selectionIdFor, selectionResultSchema,
  type GraphProvenance, type IdentityVerificationResult, type RiskInput, type RiskOutput, type SelectionResult } from '../../shared/src/selection.js';

export interface DiscoveryCandidate {
  endpoint: string; wallet: string; providerKey: string; endpointKey: string; specHash: string;
  capability: string; priceUsdc: string; executable: boolean; protected: boolean;
}
export interface SelectionContext {
  intent: PurchaseIntent; candidates: DiscoveryCandidate[]; taskCategory: 'deliverable' | 'machine-action';
  policyVersion: string; maxGraphLagBlocks: number;
}
export interface SelectionEngineOptions { graphEndpoint:string; graphDeploymentId:string; rpc:string }
type ChainReader = Pick<ReturnType<typeof arcClient>, 'getBlock' | 'getBlockNumber'>;

export async function verifyProviderIdentity(identity: ERC8004Client, candidate: DiscoveryCandidate, graphBlock: number): Promise<IdentityVerificationResult> {
  const resolved = await identity.resolve(candidate.endpoint, candidate.wallet, BigInt(graphBlock));
  return resolved
    ? { verified:true, agentId:resolved.agentId, registry:resolved.registry, walletMatch:true, endpointMatch:true }
    : { verified:false, failureReason:'IDENTITY_OR_WALLET_MISMATCH' };
}

export async function verifyGraphFreshness(graph: GraphClient, chain: ChainReader, maxLag: number, deploymentId: string): Promise<GraphProvenance> {
  const meta = await graph.meta();
  if (!meta.block.hash) throw new Error('GRAPH_BLOCK_HASH_MISSING');
  const headBlock = Number(await chain.getBlockNumber());
  if (headBlock < meta.block.number) throw new Error('GRAPH_AHEAD_OF_CHAIN');
  const indexedBlock = await chain.getBlock({ blockNumber:BigInt(meta.block.number) });
  if (!indexedBlock.hash || indexedBlock.hash.toLowerCase() !== meta.block.hash.toLowerCase()) throw new Error('GRAPH_BLOCK_MISMATCH');
  const lagBlocks = headBlock - meta.block.number;
  if (lagBlocks > maxLag) throw new Error('GRAPH_STALE');
  return { deployment:meta.deployment, deploymentId, indexedBlock:meta.block.number,
    indexedBlockHash:meta.block.hash as Hex, hasIndexingErrors:meta.hasIndexingErrors,
    headBlock, lagBlocks, queriedAt:Number(indexedBlock.timestamp) };
}

function riskParts(context: SelectionContext, candidates: Candidate[], receipts: RiskReceipt[], graph: GraphProvenance) {
  const decision = evaluate({ intent:context.intent, candidates, receipts, now:graph.queriedAt,
    chainHead:graph.headBlock, indexedBlock:graph.indexedBlock, maxGraphLagBlocks:context.maxGraphLagBlocks,
    policyVersion:context.policyVersion });
  const input: RiskInput = { policyVersion:context.policyVersion, intentSnapshot:canonicalJSON(context.intent),
    candidateCount:candidates.length, receiptCount:receipts.length, maxGraphLagBlocks:context.maxGraphLagBlocks,
    preference:context.intent.preference };
  const output: RiskOutput = { modelVersion:decision.modelVersion, selectedCandidate:decision.selectedCandidate,
    eligibleCandidates:decision.eligibleCandidates, rejectedCandidates:decision.rejectedCandidates,
    policyHash:decision.policyHash, candidateDataHashes:decision.candidateDataHashes,
    trustScores:decision.scores.map(score=>({ endpointKey:score.endpointKey, trust:score.reliability,
      confidence:score.confidence, count:score.count, status:score.status })) };
  return { input, output };
}

export class SelectionEngine {
  readonly graph: GraphClient;
  readonly chain: ChainReader;
  constructor(readonly identity: ERC8004Client, readonly options: SelectionEngineOptions, graph?: GraphClient, chain?: ChainReader) {
    this.graph = graph ?? new GraphClient(options.graphEndpoint, options.graphDeploymentId);
    this.chain = chain ?? arcClient(options.rpc);
  }

  async select(context: SelectionContext): Promise<SelectionResult> {
    if (!context.candidates.length) return this.failure(context, 'NO_ELIGIBLE_CANDIDATE');
    let provenance: GraphProvenance;
    try { provenance = await verifyGraphFreshness(this.graph, this.chain, context.maxGraphLagBlocks, this.options.graphDeploymentId); }
    catch (error) { return this.failure(context, error instanceof Error ? error.message : 'GRAPH_UNAVAILABLE'); }

    const verified: Array<{ candidate:DiscoveryCandidate; identity:IdentityVerificationResult; validation:number|null }> = [];
    try {
      for (const candidate of context.candidates) {
        const identity = await verifyProviderIdentity(this.identity, candidate, provenance.indexedBlock);
        if (!identity.verified || !identity.agentId) continue;
        const rows = context.intent.acceptedValidators?.length
          ? await this.graph.validations(identity.agentId, provenance.indexedBlock)
          : [];
        verified.push({ candidate, identity, validation:validationScore(rows, context.intent.acceptedValidators ?? [], provenance.queriedAt) });
      }
    } catch { return this.failure(context,'IDENTITY_OR_VALIDATION_UNAVAILABLE',provenance); }
    if (!verified.length) return this.failure(context, 'IDENTITY_OR_WALLET_MISMATCH', provenance);

    let receipts: RiskReceipt[];
    try { receipts = await this.graph.evidence(verified.map(item=>item.candidate.endpointKey), provenance.queriedAt, provenance.indexedBlock); }
    catch { return this.failure(context, 'GRAPH_UNAVAILABLE', provenance); }
    const candidates: Candidate[] = verified.map(({candidate,validation})=>({ endpointKey:candidate.endpointKey,
      providerKey:candidate.providerKey, specHash:candidate.specHash, capability:candidate.capability,
      priceUsdc:candidate.priceUsdc, executable:candidate.executable, protected:candidate.protected, validation }));
    const risk = riskParts(context, candidates, receipts, provenance);
    if (!risk.output.selectedCandidate) return this.failure(context, 'NO_ELIGIBLE_CANDIDATE', provenance, risk);
    const selected = verified.find(item=>item.candidate.endpointKey.toLowerCase()===risk.output.selectedCandidate?.toLowerCase());
    if (!selected) return this.failure(context, 'SELECTION_RESULT_MISMATCH', provenance, risk);
    const historical = receipts.filter(row=>row.endpointKey.toLowerCase()===selected.candidate.endpointKey.toLowerCase());
    const timestamp = provenance.queriedAt;
    const precommit = { timestamp, taskCategory:context.taskCategory, provider:selected.candidate,
      identity:selected.identity, graph:provenance, risk };
    const result = { selectionId:selectionIdFor(precommit), timestamp, taskCategory:context.taskCategory,
      provider:{ endpoint:selected.candidate.endpoint, wallet:selected.candidate.wallet, erc8004:selected.identity },
      graph:provenance, historicalOutcomes:{ receiptCount:historical.length,
        successCount:historical.filter(row=>row.outcome===0).length,
        failureCount:historical.filter(row=>row.outcome>0&&row.outcome<=4).length,
        excludedOutcomes:historical.filter(row=>row.outcome>4).length }, risk, status:'SELECTED' as const,
      selectionHash:'0x'+'0'.repeat(64) };
    result.selectionHash = canonicalSelectionHash(result);
    return selectionResultSchema.parse(result);
  }

  private failure(context: SelectionContext, reason: string, graph?: GraphProvenance,
    risk?: { input:RiskInput; output:RiskOutput }): SelectionResult {
    const timestamp = graph?.queriedAt ?? 0;
    const status = reason === 'NO_ELIGIBLE_CANDIDATE' ? 'NO_ELIGIBLE_CANDIDATE' as const : 'FAIL_CLOSED' as const;
    const precommit = { timestamp, taskCategory:context.taskCategory, reason, graph:graph ?? null, risk:risk ?? null };
    const result = { selectionId:selectionIdFor(precommit), timestamp, taskCategory:context.taskCategory,
      provider:null, ...(graph?{graph}:{}), ...(risk?{risk}:{}), status, failureReason:reason, selectionHash:'0x'+'0'.repeat(64) };
    result.selectionHash = canonicalSelectionHash(result);
    return selectionResultSchema.parse(result);
  }
}
