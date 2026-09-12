import type { Provenance } from './guardrails.js';
import { buildProvenance, provenanceSummary } from './guardrails.js';
import type { EvidenceContext } from './evidence-context.js';
import { formatEvidenceContext, formatComparison } from './evidence-context.js';

// Construct safe evidence explanations.
// Responses must include provenance where possible.
// If data is unavailable, say unavailable.
// Never fabricate missing fields.

export interface ExplanationRequest {
  question: string;
  endpointKey?: string;
  receiptHash?: string;
  jobId?: string;
  blockNumber?: number;
}

export interface ExplanationResponse {
  answer: string;
  provenance: Provenance;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNAVAILABLE';
  dataUsed: string[];
  limitations: string[];
}

const PROVENANCE_DISCLAIMER = 'This is XYX Observed Evidence — limited to the history observed by this deployment. It does NOT represent universal provider reputation.';

function buildExplanation(
  answer: string,
  provenance: Provenance,
  confidence: ExplanationResponse['confidence'],
  dataUsed: string[],
  limitations: string[] = []
): ExplanationResponse {
  return {
    answer: `${answer}\n\n${PROVENANCE_DISCLAIMER}`,
    provenance,
    confidence,
    dataUsed,
    limitations: [
      ...limitations,
      `Graph deployment: ${provenance.graphDeployment}`,
      `Indexed block: ${provenance.indexedBlock}`,
      `Data freshness: ${new Date(provenance.queriedAt * 1000).toISOString()}`,
    ],
  };
}

export function explainWhySelected(
  endpointKey: string,
  decision: { selectedCandidate: string | null; scores: Array<{ endpointKey: string; trust: number; utility: number; priceScore: number; count: number }> },
  provenance: Provenance
): ExplanationResponse {
  if (decision.selectedCandidate !== endpointKey) {
    return buildExplanation(
      `Endpoint ${endpointKey} was NOT selected. Selected: ${decision.selectedCandidate ?? 'none'}.`,
      provenance,
      'HIGH',
      ['decision.scores'],
      ['Selection depends on policy weights, evidence freshness, and competing candidates.']
    );
  }

  const score = decision.scores.find(s => s.endpointKey === endpointKey);
  if (!score) {
    return buildExplanation(
      `Endpoint ${endpointKey} was selected but detailed scoring data is unavailable.`,
      provenance,
      'LOW',
      ['decision.selectedCandidate'],
      ['Score details may not be available in the decision context.']
    );
  }

  const lines = [
    `Endpoint ${endpointKey} was selected.`,
    ``,
    `Trust: ${score.trust.toFixed(4)} (from ${score.count} receipts)`,
    `Price score: ${score.priceScore.toFixed(4)}`,
    `Utility: ${score.utility.toFixed(4)}`,
    ``,
    `The selection is deterministic given the same inputs:`,
    `- Graph evidence (receipts indexed at block ${provenance.indexedBlock})`,
    `- Policy weights (reliability, price, validation, protection)`,
    `- Hard constraints (budget, capability, payment compatibility, minimum trust/evidence)`,
  ];

  return buildExplanation(
    lines.join('\n'),
    provenance,
    'HIGH',
    ['decision.scores', 'graph.evidence', 'policy.weights'],
    ['Address diversity is a concentration signal, not Sybil proof.', 'Wilson lower confidence bounds prevent one-call history from looking mature.']
  );
}

export function explainEvidenceFreshness(
  chainHead: number,
  indexedBlock: number,
  maxLag: number,
  provenance: Provenance
): ExplanationResponse {
  const lag = chainHead - indexedBlock;
  const isFresh = lag >= 0 && lag <= maxLag;

  const lines = [
    `Graph freshness: ${isFresh ? 'FRESH' : 'STALE'}`,
    `Chain head: ${chainHead}`,
    `Indexed block: ${indexedBlock}`,
    `Lag: ${lag} blocks (max allowed: ${maxLag})`,
  ];

  if (!isFresh) {
    lines.push(``, `WARNING: Graph data is stale. XYX will NOT make autonomous decisions with stale Graph data. This is a security control.`);
  }

  return buildExplanation(
    lines.join('\n'),
    provenance,
    isFresh ? 'HIGH' : 'HIGH',
    ['graph._meta.block', 'arc.blockNumber'],
    isFresh ? [] : ['Stale Graph data triggers BLOCKED_TRUST_DATA — no autonomous decision is made.']
  );
}

export function explainValidationAvailability(
  erc8004Mapped: boolean,
  validationAvailable: boolean,
  validationScore: number | null,
  provenance: Provenance
): ExplanationResponse {
  const lines = [];

  if (!erc8004Mapped) {
    lines.push(
      `This provider does NOT have a verified ERC-8004 identity mapping.`,
      ``,
      `This does NOT mean the provider is invalid.`,
      `It means XYX has not verified this provider's on-chain agent identity.`,
      `The provider can still serve requests — it simply does not receive a validation boost in risk scoring.`,
    );
  } else if (!validationAvailable) {
    lines.push(
      `This provider has a verified ERC-8004 identity, but no validation data is available.`,
      ``,
      `Validation data is optional. Its absence does NOT mean validation score = 0.`,
      `It means no validator has submitted a validation response for this agent.`,
    );
  } else if (validationScore !== null) {
    lines.push(
      `This provider has a verified ERC-8004 identity with validation data.`,
      `Validation score: ${validationScore.toFixed(2)} (0-1 scale)`,
      ``,
      `Validation signals from trusted validators contribute to risk scoring.`,
      `The weight is controlled by the buyer's validationWeight policy parameter.`,
    );
  }

  return buildExplanation(
    lines.join('\n'),
    provenance,
    erc8004Mapped ? 'HIGH' : 'MEDIUM',
    erc8004Mapped ? ['erc8004.identity', 'graph.validations'] : [],
    ['ERC-8004 validation is optional enrichment. Unmapped providers are not penalized — they just lack the validation boost.']
  );
}

export function explainJobStatus(
  jobId: string,
  status: string,
  client: string,
  provider: string,
  budget: number,
  provenance: Provenance
): ExplanationResponse {
  const lines = [
    `Protected Job ${jobId}:`,
    `Status: ${status}`,
    `Client: ${client}`,
    `Provider: ${provider}`,
    `Budget: ${budget} USDC (atomic)`,
  ];

  switch (status) {
    case 'CREATED':
      lines.push(`Job created. Waiting for provider to set budget and buyer to approve/fund.`);
      break;
    case 'FUNDED':
      lines.push(`Job funded. Waiting for provider to submit deliverable.`);
      break;
    case 'SUBMITTED':
      lines.push(`Deliverable submitted. Waiting for XYX evaluation and signed verdict.`);
      break;
    case 'COMPLETE':
      lines.push(`Job completed. Provider delivered and XYX verified. USDC settled to provider.`);
      break;
    case 'REJECTED':
      lines.push(`Job rejected. XYX evaluation did not match expected deliverable. USDC refunded to client.`);
      break;
    case 'EXPIRED':
      lines.push(`Job expired. No settlement occurred.`);
      break;
    default:
      lines.push(`Status: ${status} (interpretation unavailable)`);
  }

  return buildExplanation(
    lines.join('\n'),
    provenance,
    'HIGH',
    ['erc8183.job', 'xyx-evaluator.verdict'],
    ['ERC-8183 is the settlement authority. XYX Evaluator forwards complete/reject decisions.']
  );
}
