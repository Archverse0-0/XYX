# XYX Graph Intelligence Skill

## Purpose

This skill teaches an AI client how to correctly reason over XYX Graph data. The Graph is XYX's machine memory — it stores indexed evidence of autonomous agent commerce on Arc Testnet.

## Entities

### Endpoint
- `id`: keccak256 of provider URL + method + path (bytes32)
- `providerKey`: keccak256 of provider identity
- `receiptCount`: total observed receipts
- `scoredSuccesses`: receipts with outcome 0 (SUCCESS)
- `scoredFailures`: receipts with outcome 1-4 (provider-attributable)
- `excludedOutcomes`: receipts with outcome > 4 (payment/client errors, NOT provider failures)
- `lastObservedAt`: timestamp of most recent observation

### Receipt
- `id`: receipt digest hash (bytes32)
- `endpoint`: reference to Endpoint entity
- `providerKey`: provider identity hash
- `payer`: payer address (NOT unique human — address diversity is a concentration signal)
- `amountPaid`: USDC amount in atomic units (6 decimals)
- `outcome`: 0=SUCCESS, 1=PROVIDER_TIMEOUT, 2=PROVIDER_HTTP_ERROR, 3=PROVIDER_SCHEMA_MISMATCH, 4=PROVIDER_RATE_LIMIT, 5=CLIENT_INVALID_REQUEST, 6=PAYMENT_FAILED, 7=PAYMENT_RAIL_ERROR, 8=AMBIGUOUS
- `httpStatus`: HTTP status code observed
- `latencyMs`: response latency
- `evidenceURI`: content-addressed evidence CID
- `evidenceHash`: keccak256 of canonical evidence bundle
- `observedAt`: timestamp
- `blockNumber`: Arc block number
- `transactionHash`: Arc anchoring transaction
- `providerAgentRegistry`: ERC-8004 registry address (zero if unmapped)
- `providerAgentId`: ERC-8004 agent ID (zero if unmapped)

### Job
- `id`: ERC-8183 job ID
- `client`, `provider`, `evaluator`: addresses
- `budget`: USDC budget in atomic units
- `status`: CREATED | FUNDED | SUBMITTED | COMPLETE | REJECTED | EXPIRED
- `deliverableHash`, `evidenceHash`, `reasonHash`: hashes from XYX evaluation

### AgentIdentity (ERC-8004)
- `id`: agent identity ID
- `registry`: ERC-8004 registry address
- `agentId`: on-chain agent ID
- `owner`: owner address
- `agentURI`: metadata URI

### Validation (ERC-8004)
- `agent`: reference to AgentIdentity
- `validator`: validator address
- `response`: 0-100 validation score
- `updatedAt`: timestamp

## Query Patterns

### Why did XYX select this endpoint?
```graphql
{
  endpoint(id: "0x...") {
    id
    receiptCount
    scoredSuccesses
    scoredFailures
    lastObservedAt
  }
}
```
Then compare with the decision scores from the Risk Engine.

### How much observed evidence exists?
```graphql
{
  endpoint(id: "0x...") {
    receiptCount
    scoredSuccesses
    scoredFailures
    excludedOutcomes
  }
}
```

### Is activity concentrated among few payers?
Query receipts and count unique `payer` values. High concentration (low address diversity) means the evidence may come from a small set of addresses — NOT independent humans.

### Which provider-attributable failures were observed?
```graphql
{
  receipts(where: { endpoint: "0x...", outcome_gt: 0, outcome_lte: 4 }, first: 100) {
    id
    outcome
    httpStatus
    observedAt
  }
}
```

### What is the Graph indexed block?
```graphql
{
  _meta {
    block { number hash }
    deployment
    hasIndexingErrors
  }
}
```

### Is the evidence fresh?
Compare `_meta.block.number` with the current Arc chain head. XYX considers evidence stale if the lag exceeds `MAX_GRAPH_LAG_BLOCKS`.

### What ERC-8004 validation signals are available?
```graphql
{
  validations(where: { agent: "0x..." }) {
    validator
    response
    updatedAt
  }
}
```

### Is this provider unobserved or low-confidence?
- `receiptCount = 0` → UNOBSERVED (not low trust — simply no data)
- `receiptCount > 0, trust < threshold` → LOW CONFIDENCE (insufficient evidence or poor history)

### Show protected job history
```graphql
{
  jobs(where: { provider: "0x..." }, orderBy: createdAt, orderDirection: desc) {
    id
    status
    budget
    createdAt
  }
}
```

## Semantic Limitations

### XYX Observed Evidence
- Limited to receipts anchored by this XYX deployment
- Does NOT represent universal provider reputation
- Does NOT prove or disprove provider quality globally

### Address Diversity
- `payer` addresses are NOT unique humans
- High diversity means evidence comes from many addresses (concentration signal)
- Low diversity means evidence may come from few addresses
- This is NOT Sybil resistance

### ERC-8004 Optional Mapping
- `providerAgentRegistry = 0x0` → provider has no verified ERC-8004 identity
- This does NOT mean the provider is invalid
- Unmapped providers are simply not eligible for validation boost

### Validation Unavailable
- No validation data → NOT validation score = 0
- It means no validator has submitted a response
- Missing validation is NOT negative evidence

### No Historical Evidence
- `receiptCount = 0` → UNOBSERVED
- NOT low trust, NOT suspicious, NOT penalized
- Simply means XYX has not observed this endpoint

## Provenance

Every response should include:
- Graph deployment ID
- Indexed block number
- Block hash
- Query timestamp
- Entity IDs involved
- Receipt hashes if relevant

## Safe Questions

- "Why did XYX select this endpoint?"
- "Which receipts influenced this decision?"
- "How much observed evidence exists?"
- "Is the activity concentrated?"
- "Which provider-attributable failures were observed?"
- "What changed since the previous decision?"
- "What is the Graph indexed block?"
- "Is the evidence fresh?"
- "What ERC-8004 validation signals are available?"
- "Is this provider unobserved or actually low-confidence?"
- "Show the protected-job history for this provider."

## Prohibited Inference

- Do NOT claim universal provider reputation from XYX observed evidence
- Do NOT claim address diversity equals unique humans
- Do NOT claim unmapped ERC-8004 providers are invalid
- Do NOT claim validation unavailable equals validation score zero
- Do NOT claim no evidence equals low trust
- Do NOT infer missing chain state
- Do NOT fabricate fields not returned by the Graph

## MCP Configuration

The Graph Intelligence layer exposes a read-only API. It cannot:
- Pay or sign anything
- Anchor receipts
- Change policy
- Execute Circle payments
- Resolve ERC-8183 jobs
- Modify Risk Engine scores
- Create canonical evidence

Use the `/api/v1/graph/intelligence/*` endpoints for investigation.
