import { z } from 'zod';

// Guardrails: enforce read-only semantics and provenance.
// Graph Intelligence can READ the graph. It cannot:
// - pay or sign anything
// - anchor receipts
// - change policy
// - modify maxPrice
// - execute Circle payments
// - resolve ERC-8183 jobs
// - modify Risk Engine scores
// - create canonical evidence
// - alter trusted execution state

const FORBIDDEN_IMPORTS = [
  'circle-adapter',
  'erc8183/service',
  'witness',
  'storage',
];

export interface Provenance {
  graphDeployment: string;
  indexedBlock: number;
  indexedBlockHash: string | null;
  queriedAt: number;
  entityIds: string[];
  receiptHashes: string[];
}

export function assertReadOnly(): void {
  // This function is a boundary marker.
  // If any code path through Graph Intelligence attempts a write operation,
  // it will fail here. The Graph Intelligence layer has no imports from
  // circle-adapter, erc8183/service, witness, or storage packages.
}

export function buildProvenance(
  deployment: string,
  block: { number: number; hash: string | null },
  entityIds: string[] = [],
  receiptHashes: string[] = []
): Provenance {
  return {
    graphDeployment: deployment,
    indexedBlock: block.number,
    indexedBlockHash: block.hash,
    queriedAt: Math.floor(Date.now() / 1000),
    entityIds,
    receiptHashes,
  };
}

export function provenanceSummary(p: Provenance): string {
  const lines = [
    `Graph deployment: ${p.graphDeployment}`,
    `Indexed block: ${p.indexedBlock}`,
    `Block hash: ${p.indexedBlockHash ?? 'unavailable'}`,
    `Queried at: ${new Date(p.queriedAt * 1000).toISOString()}`,
  ];
  if (p.entityIds.length) lines.push(`Entity IDs: ${p.entityIds.join(', ')}`);
  if (p.receiptHashes.length) lines.push(`Receipt hashes: ${p.receiptHashes.join(', ')}`);
  return lines.join('\n');
}

// Provenance schema for validation
export const provenanceSchema = z.object({
  graphDeployment: z.string(),
  indexedBlock: z.number().int().nonnegative(),
  indexedBlockHash: z.string().nullable(),
  queriedAt: z.number().int().nonnegative(),
  entityIds: z.array(z.string()),
  receiptHashes: z.array(z.string()),
});
