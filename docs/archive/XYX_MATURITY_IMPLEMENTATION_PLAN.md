# XYX Maturity Implementation Plan

## Current State

**Repository:** `/home/pupulion/xyx_eth_online`
**Branch:** `master` (single commit: `1fb1171 initial commit`)
**Test suite:** 128 Node tests, 24 Solidity tests — all passing
**Typecheck:** clean
**Doctor:** fail-closed (expected — no `.env`)

## Backend Completion Report Verification

| Capability | Report Claim | Production Found | Call Path | Tests | Correction | Classification |
|---|---|---|---|---|---|---|
| ERC-8004 validation signal | Phase 1: runtime tests added | YES — runtime.ts:40-44 resolves identity, queries graph.validations, calls validationScore | runtime.ts:40→ERC8004Client.resolve()→graph.validations()→validationScore()→candidate.validation | erc8004.test.ts:10 tests | None needed | ALREADY_IMPLEMENTED_VERIFIED |
| Protected Job idempotency | Phase 2-3: tests added | YES — jobs.ts:44-102, job-operations.ts, withJobLock all wired | main.ts:93→jobs.ts:39→jobOperation()/withJobLock()→ProtectedJobService | jobs.test.ts:6 tests | None needed | ALREADY_IMPLEMENTED_VERIFIED |
| ERC-8183 config | Phase 4: config tests | YES — config.ts ERC-8183 address validation, deployment.json | config.ts loadConfig | config.test.ts:14 tests | None needed | ALREADY_IMPLEMENTED_VERIFIED |
| Witness EVIDENCE_START_BLOCK | Phase 5: config fix | YES — config.ts:26, service.ts:29, main.ts:15 | witnessConfig→loadConfig→constructor→this.evidenceStartBlock | config.test.ts:4 tests | None needed | ALREADY_IMPLEMENTED_VERIFIED |
| Graph/Risk integration | Phase 6: integration tests | YES — graph.ts:evidence() returns RiskReceipt[], runtime.ts:47-48 | graph.evidence()→receiptSchema.parse()→evaluate()→decision | graph-risk.test.ts:9 tests | None needed | ALREADY_IMPLEMENTED_VERIFIED |
| API error classification | Phase 7: route tests | YES — api-errors.ts, main.ts error handling | ZodError→apiError()→HTTP status | api-routes.test.ts:12 tests | None needed | ALREADY_IMPLEMENTED_VERIFIED |
| Buyer Agent integration | Phase 8: integration tests | YES — runtime.ts full pipeline | intent→discovery→inspection→Graph→Risk→selection | buyer-agent.test.ts:13 tests | None needed | ALREADY_IMPLEMENTED_VERIFIED |
| Witness integration | Phase 9: integration tests | YES — verify.ts, receiptDomain, receiptTypes | classify()→domain→types→hash | witness.test.ts:17 tests | None needed | ALREADY_IMPLEMENTED_VERIFIED |
| ERC-8183 lifecycle | Phase 10: integration tests | YES — service.ts, jobs.ts, witness resolution | createJob→setBudget→approve→fund→submit→evaluate→resolve | erc8183.test.ts:19 tests | None needed | ALREADY_IMPLEMENTED_VERIFIED |
| Doctor fail-closed | Phase 11: verification | YES — doctor.ts correctly reports CONFIGURATION_REQUIRED | loadConfig→fail on missing | N/A | None needed | ALREADY_IMPLEMENTED_VERIFIED |

## PRD Invariants (MUST NOT CHANGE)

- Risk Engine math (Wilson, diversity, confidence, validation renormalization)
- Contract set: XYXEvidenceRegistry.sol, XYXEvaluator.sol
- Evidence trust model (canonical JSON, IPFS readback, EIP-712 signing)
- Witness trust boundary (API cannot sign, Buyer Agent cannot sign)
- ERC-8004/8183 integration semantics
- Arc Testnet as primary settlement/finality environment
- Circle Agent Stack for machine execution
- Graph as indexed memory (fail-closed, block hash verification)
- Privy for human authorization
- No custom XYX token, DAO, escrow, identity registry, reputation registry, BFT, ZK, Chainlink, ENS

## P0 Gaps

### Runtime Implementation Gaps
- None found in Gate 0 verification. All production paths are wired.

### Missing Components (new P0+ scope)
1. **Graph Intelligence Layer** — AI-readable Graph investigation (Section 11 of mandate)
2. **Graph SKILL** — Reusable AI skill for Graph reasoning (Section 14)
3. **Live Verification Tooling** — `npm run verify:live` (Section 21)
4. **Deployment Manifest** — `deployments/arc-testnet.json` (Section 20)
5. **Subgraph Schema Maturity** — AI/query-friendly entities (Section 8)

## Arc Gaps

- **Live deployment:** No real Arc contract addresses, wallet funding, or transaction hashes. BLOCKED_BY_CONFIGURATION.
- **ERC-8183 reference:** `0x0747EEf0706327138c69792bF28Cd525089e4583` is configured but not live-tested.
- **USDC semantics:** Chain ID 5042002, 6 decimals — verified in chain.ts.

## The Graph Gaps

- **Live subgraph deployment:** BLOCKED_BY_CONFIGURATION (requires Graph Studio).
- **Subgraph schema:** Has Endpoint, Receipt, AgentIdentity, Validation, Feedback, Job. Missing AI-friendly entities.
- **Graph Intelligence:** Not yet implemented.
- **Graph SKILL:** Not yet implemented.
- **Subgraph MCP integration:** Not yet implemented.

## ERC-8004 Gaps

- **Runtime consumption:** FULLY WIRED (verified in Gate 0).
- **Identity resolution:** FULLY WIRED (ERC8004Client.resolve()).
- **Validation scoring:** FULLY WIRED (validationScore() from graph.validations()).
- **Live ERC-8004 deployment:** BLOCKED_BY_LIVE_CONFIGURATION.

## ERC-8183 Gaps

- **Protected Job routes:** FULLY WIRED with idempotency.
- **ERC-8183 service:** FULLY WIRED (7/8 methods used).
- **Live E2E:** BLOCKED_BY_LIVE_CONFIGURATION.
- **Frontend controls:** Missing create/fund/submit/evaluate UI.

## Reliability Gaps

- **Protected Job fund/submit idempotency:** FULLY WIRED (operation journal + advisory locks).
- **Open Purchase idempotency:** FULLY WIRED.
- **Reconciliation:** FULLY WIRED (IN_FLIGHT/CONFIRMED/RECONCILIATION_REQUIRED).

## Security Gaps

- **Key separation:** Witness, evaluator, relayer keys must be separate — enforced by constructor check.
- **No credential exposure:** Verified — doctor fails closed, no secrets in logs.
- **EIP-712 domain separation:** Chain ID + contract address in receipt/verdict domains.

## Testing Gaps

- **Node tests:** 128 passing.
- **Solidity tests:** 24 passing (fuzz, security, state transitions).
- **Missing:** Live integration tests, Graph intelligence tests, SKILL tests.

## Live Deployment Gaps

- **Contracts:** Not deployed to Arc Testnet.
- **Graph:** Not deployed to Graph Studio.
- **Wallets:** Not funded.
- **IPFS:** Not configured.
- **All BLOCKED_BY_CONFIGURATION.**

## Graph Intelligence Plan

1. Create `packages/graph-intelligence/` with:
   - `client.ts` — MCP/query abstraction
   - `queries.ts` — well-defined Graph investigation tasks
   - `evidence-context.ts` — normalize evidence for analysis
   - `explanation.ts` — construct safe evidence explanations
   - `guardrails.ts` — enforce read-only semantics
2. Expose via API route for AI consumption
3. Create SKILL for external AI clients

## Substreams Feasibility

- **Arc Firehose availability:** NOT_VERIFIED. No live Graph provider/Firehose confirmed for Arc.
- **Decision:** Keep Substreams as isolated P1 package, NOT part of Arc P0 runtime.
- **If implemented:** `packages/substreams-agent-commerce/` with ERC-20/ERC-3009 normalized output.

## Bounty Alignment

| Track | Fit | Live Proof | Status |
|---|---|---|---|
| The Graph Continuity/AI Use Case | HIGH — Graph is load-bearing for decisions | BLOCKED_BY_CONFIGURATION | READY_FOR_LIVE |
| The Graph Composable/Standardized | MEDIUM — Subgraph MCP + SKILL | BLOCKED_BY_IMPLEMENTATION | IN_PROGRESS |
| Arc Agentic Economy | HIGH — Circle+Arc+ERC-8183 | BLOCKED_BY_CONFIGURATION | READY_FOR_LIVE |
| Arc Continuity | HIGH — if previously submitted | NEEDS_DOCUMENTATION | PENDING |

## Implementation Phases

### Phase M1: Graph Intelligence Layer
- Create `packages/graph-intelligence/` package
- Implement client.ts, queries.ts, evidence-context.ts, explanation.ts, guardrails.ts
- Add API route for Graph intelligence queries

### Phase M2: Graph SKILL
- Create `skills/xyx-graph/SKILL.md`
- Document entities, query patterns, semantic limitations, provenance

### Phase M3: Live Verification Tooling
- Create `scripts/verify-live.ts`
- Add `npm run verify:live` command
- Verify Arc, Graph, Circle, contracts, wallets

### Phase M4: Deployment Manifest
- Create `deployments/arc-testnet.json` (public metadata only)

### Phase M5: Mainnet Readiness
- Create `docs/ARC_MAINNET_READINESS.md`

### Phase M6: Prize Alignment
- Create `docs/ETHONLINE_PRIZE_ALIGNMENT.md`

### Phase M7: Final Maturity Report
- Create `XYX_MATURITY_REPORT.md`

## Files Expected to Change

| File | Action |
|---|---|
| `packages/graph-intelligence/src/client.ts` | CREATE |
| `packages/graph-intelligence/src/queries.ts` | CREATE |
| `packages/graph-intelligence/src/evidence-context.ts` | CREATE |
| `packages/graph-intelligence/src/explanation.ts` | CREATE |
| `packages/graph-intelligence/src/guardrails.ts` | CREATE |
| `packages/graph-intelligence/src/index.ts` | CREATE |
| `skills/xyx-graph/SKILL.md` | CREATE |
| `scripts/verify-live.ts` | CREATE |
| `deployments/arc-testnet.json` | CREATE |
| `docs/ARC_MAINNET_READINESS.md` | CREATE |
| `docs/ETHONLINE_PRIZE_ALIGNMENT.md` | CREATE |
| `XYX_MATURITY_REPORT.md` | CREATE |
| `package.json` | MODIFY (add verify:live script) |

## Dependencies Required

- No new runtime dependencies (graph-intelligence uses existing Graph client)
- No new SDK dependencies (verification uses existing viem + public RPC)

## Risks

- Live deployment blocked by missing credentials — cannot be resolved without real configuration
- Graph Intelligence depends on live Graph endpoint — mocked locally but BLOCKED_BY_CONFIGURATION for live
- Substreams feasibility depends on Arc Firehose availability — not verified

## Rollback Strategy

All new code is additive (new packages, new scripts, new docs). No existing production code is modified. Rollback is `git revert` of individual commits.

## Acceptance Criteria

- [x] Backend report verified against production source
- [ ] Graph Intelligence layer implemented and tested
- [ ] Graph SKILL created
- [ ] Live verification tooling created
- [ ] Deployment manifest created (public metadata only)
- [ ] Mainnet readiness documented
- [ ] Prize alignment documented
- [ ] Final maturity report created
- [ ] All existing tests still pass
- [ ] No new dependencies on external SDKs
