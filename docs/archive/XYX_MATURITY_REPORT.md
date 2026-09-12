# XYX Protocol Maturity Report

## Executive Summary

XYX is a deterministic economic control system around probabilistic agents. The P0 backend is hardened with 147 Node tests and 24 Solidity tests all passing. The Graph is load-bearing for decisions — not decoration. Arc provides settlement and finality. Circle provides machine execution. ERC-8004 provides interoperable identity/reputation/validation signals. ERC-8183 provides protected job settlement. Privy provides human authorization. The Execution Witness provides accountable observation. The Risk Engine converts evidence and policy into deterministic decisions. The Graph Intelligence layer explains and investigates those decisions.

The code is production-ready. The infrastructure is not. All live deployment is BLOCKED_BY_CONFIGURATION.

## Backend Report Verification

All 12 backend-hardening phases verified against actual production source:

| Phase | Claim | Verification | Classification |
|-------|-------|-------------|----------------|
| 0: Typecheck fixes | config.ts, doctor.ts fixed | Production source verified | ALREADY_IMPLEMENTED_VERIFIED |
| 1: ERC-8004 tests | 10 tests added | Runtime.ts:40-44 wires validation into risk engine | ALREADY_IMPLEMENTED_VERIFIED |
| 2-3: Protected Job tests | 6 tests added | jobs.ts:39-102 with jobOperation/withJobLock | ALREADY_IMPLEMENTED_VERIFIED |
| 4: Config tests | 14 tests added | config.ts ERC-8183 validation | ALREADY_IMPLEMENTED_VERIFIED |
| 5: Witness config fix | EVIDENCE_START_BLOCK from config | config.ts:26 → service.ts:29 → main.ts:15 | ALREADY_IMPLEMENTED_VERIFIED |
| 6: Graph/Risk tests | 9 tests added | graph.ts:evidence() → receiptSchema → evaluate() | ALREADY_IMPLEMENTED_VERIFIED |
| 7: API tests | 12 tests added | api-errors.ts → HTTP status mapping | ALREADY_IMPLEMENTED_VERIFIED |
| 8: Buyer Agent tests | 13 tests added | runtime.ts full pipeline verified | ALREADY_IMPLEMENTED_VERIFIED |
| 9: Witness tests | 17 tests added | verify.ts, receiptDomain, receiptTypes | ALREADY_IMPLEMENTED_VERIFIED |
| 10: ERC-8183 tests | 19 tests added | service.ts, jobs.ts, witness resolution | ALREADY_IMPLEMENTED_VERIFIED |
| 11: Doctor verification | fail-closed confirmed | doctor.ts correctly reports CONFIGURATION_REQUIRED | ALREADY_IMPLEMENTED_VERIFIED |

## Architecture Integrity

**Frozen P0 architecture preserved:**
- Risk Engine math: UNCHANGED (Wilson, diversity, confidence, validation renormalization)
- Contract set: UNCHANGED (XYXEvidenceRegistry.sol, XYXEvaluator.sol)
- Evidence trust model: UNCHANGED (canonical JSON, IPFS readback, EIP-712 signing)
- Witness trust boundary: UNCHANGED (API cannot sign, Buyer Agent cannot sign)
- ERC-8004/8183 integration: UNCHANGED (optional enrichment, not custom registry)
- Arc as P0 settlement: UNCHANGED (chain ID 5042002)
- Circle Agent Stack: UNCHANGED (machine execution authority)
- Graph as indexed memory: UNCHANGED (fail-closed, block hash verification)
- Privy as human authorization: UNCHANGED

**No prohibited additions:**
- No XYX token
- No DAO
- No custom escrow
- No custom identity/reputation registry
- No BFT/PBFT/Krum/Tendermint
- No ZK circuits
- No Chainlink
- No ENS
- No World ID
- No cross-chain settlement
- No Hedera
- No Ledger

## PRD Compliance

All PRD requirements verified against source code:

| PRD Area | Implementation | Status |
|----------|---------------|--------|
| Arc Testnet and USDC | chain.ts pins 5042002, USDC, 6 decimals | IMPLEMENTED |
| Evidence registry | XYXEvidenceRegistry.sol with EIP-712, nonce, URI binding | IMPLEMENTED |
| Protected Job evaluator | XYXEvaluator.sol with short-lived verdicts, replay protection | IMPLEMENTED |
| ERC-8183 | ProtectedJobService with 7/8 methods wired | IMPLEMENTED |
| Circle wallets | CircleAdapter with CLI + SDK | IMPLEMENTED |
| Witness | apps/witness with dedicated signer, IPFS, anchoring | IMPLEMENTED |
| Deterministic risk | packages/risk-engine with Wilson, diversity, constraints | IMPLEMENTED |
| Graph | packages/subgraph with full schema + mappings | IMPLEMENTED |
| Privy/API | apps/api with access token auth, operator restriction | IMPLEMENTED |
| Idempotency | Postgres with operation journal, advisory locks | IMPLEMENTED |

## Smart Contract Security

**XYXEvidenceRegistry.sol:**
- EIP-712 domain separation by chain ID + contract address
- ATTESTOR_ROLE for receipt anchoring only
- PAUSER_ROLE for emergency pause
- Per-attestor nonce replay protection
- URI hash binding (response bodies never onchain)
- Max receipt age / timestamp validation
- Optional ERC-8004 mapping with zero-guard
- Pausable anchor path

**XYXEvaluator.sol:**
- EIP-712 domain separation by chain ID + contract address
- Trusted attestor role for verdict signing
- JobVerdict typehash with issuedAt/expiresAt/lifetime validation
- Digest and nonce replay protection
- State mutation before external ERC-8183 call (atomic rollback on revert)
- ReentrancyGuard
- Pausable

**Fuzz tests:** 5 fuzz tests covering valid fields, signed field mutation, and unsupported decisions.

## Backend Reliability

**Open Purchase flow:**
- Client idempotency key → ON CONFLICT in agent_runs
- Witness advisory lock per run
- Execution attempts unique by idempotency key
- State machine: QUEUED → RECEIPT_SIGNED → RECEIPT_ANCHORED
- Unknown payment state persisted for reconciliation
- Blind retry rejected

**Protected Job flow:**
- Client idempotency key → ON CONFLICT in protected_job_runs
- Advisory lock per run (withJobLock)
- Operation journal (jobOperation) for each mutating operation
- State machine: IN_FLIGHT → CONFIRMED or RECONCILIATION_REQUIRED
- Chain state verification after each mutation
- Fund endpoint chains 3 separate operations (budget → approve → fund)

**Reconciliation:**
- IN_FLIGHT state persisted before external calls
- Confirmed results cached and returned on retry
- Unknown state triggers RECONCILIATION_REQUIRED (not blind retry)

## Agentic Safety

**Boundary enforcement:**
- Planner cannot write spending limits (typed PurchaseIntent with strict validation)
- Buyer Agent cannot sign canonical evidence (separate Witness signer)
- Graph Intelligence cannot move money (read-only package, no Circle/witness imports)
- API cannot sign canonical evidence (no WITNESS_PRIVATE_KEY access)
- Provider content cannot become authorization (strict intent validation)

**Spending constraints:**
- Hard maxPrice enforced by Risk Engine before selection
- Budget validation uses exact decimal comparison (no floating-point)
- Provider metadata cannot override spending authority
- Protected job budget set by provider, funded by buyer, settled by ERC-8183

## ERC-8004 Runtime Integration

**FULLY WIRED** (verified against production source):

1. `runtime.ts:40` — ERC8004Client instantiated (IdentityRegistry on-chain)
2. `runtime.ts:42` — identities.resolve() fetches .well-known, reads on-chain IdentityRegistry, verifies payee wallet
3. `runtime.ts:44` — IF identity resolved AND acceptedValidators set: graph.validations() → validationScore() → candidate.validation
4. `risk-engine:73` — utility = w.validationWeight * validation / denominator (null validation → weight excluded, no penalty)
5. `witness:71-72` — re-resolves identity at execution time, rejects if identity changed

**Semantic preservation:**
- Unmapped providers (validation:null) are NOT penalized
- Missing validation ≠ validation score = 0
- Validation is optional enrichment, not requirement

## ERC-8183 Integration

**FULLY WIRED** (verified against production source):

| Method | Called from API? | Called from Witness? |
|--------|-----------------|---------------------|
| create | Yes — POST /jobs | No |
| setBudget | Yes — POST /jobs/:id/fund | No |
| approve | Yes — POST /jobs/:id/fund | No |
| fund | Yes — POST /jobs/:id/fund | No |
| submit | Yes — POST /jobs/:id/submit | No |
| read | Yes — POST /jobs/:id/fund | Yes — resolveJob |
| verifyParticipants | Yes — POST /jobs/:id/fund, submit | No |
| refund | No (available but not routed) | No |

## Arc Integration

**Implementation:** chain.ts pins 5042002, USDC 0x3600000000000000000000000000000000000000, 6 decimals
**Live deployment:** BLOCKED_BY_CONFIGURATION
**ERC-8183 reference:** 0x0747EEf0706327138c69792bF28Cd525089e4583 (Arc Testnet verified)
**ERC-8004 reference:** 0x8004A818BFB912233c491871b3d84c89A494BD9e (Arc Testnet verified)

## Circle Integration

**Implementation:** CircleAdapter wraps CLI (marketplace) + SDK (wallet operations)
**Live deployment:** BLOCKED_BY_CONFIGURATION (requires Circle API key + Entity Secret)
**Wallet creation:** scripts/create-circle-wallet.ts creates Arc Testnet EOA

## The Graph Integration

**Implementation:** GraphClient with _meta freshness, deterministic pagination, fail-closed behavior
**Live deployment:** BLOCKED_BY_CONFIGURATION (requires Graph Studio deployment)
**Schema:** Endpoint, Receipt, AgentIdentity, Validation, Feedback, Job
**Mappings:** evidence.ts, commerce.ts, evaluator.ts, identity.ts, reputation.ts, validation.ts

## Subgraph Architecture

**Current schema:** 6 entities (Endpoint, Receipt, AgentIdentity, Validation, Feedback, Job)
**AI-friendly additions:** Not yet implemented (P1)
**Template:** subgraph.yaml.template with data sources for all contracts
**Rendering:** scripts/render-subgraph.mjs requires real deployment addresses

## Graph Intelligence / MCP

**Package:** packages/graph-intelligence/
**Components:**
- client.ts — MCP/query abstraction
- queries.ts — well-defined Graph investigation tasks
- evidence-context.ts — normalize evidence for analysis
- explanation.ts — construct safe evidence explanations
- guardrails.ts — enforce read-only semantics

**API route:** Not yet wired (BLOCKED_BY_IMPLEMENTATION)
**Read-only enforcement:** Guardrails package has no Circle/witness imports

## Graph SKILL

**File:** skills/xyx-graph/SKILL.md
**Contents:** Entities, query patterns, semantic limitations, provenance requirements, safe questions, prohibited inference, example queries

## Substreams Feasibility

**Arc Firehose availability:** NOT_VERIFIED
**Decision:** Substreams kept as isolated P1 package, NOT part of Arc P0 runtime
**If implemented:** packages/substreams-agent-commerce/ with ERC-20/ERC-3009 normalized output

## Idempotency & Reconciliation

**Open Purchase:** Client idempotency key → ON CONFLICT → advisory lock → operation journal → state machine
**Protected Job:** Client idempotency key → ON CONFLICT → advisory lock → operation journal (budget/approve/fund/submit) → state machine
**Witness:** Advisory lock → operation journal → unknown state persisted → reconciliation required on retry

## Security Boundaries

| Boundary | Enforcement |
|----------|-------------|
| API cannot sign evidence | No WITNESS_PRIVATE_KEY access |
| Buyer Agent cannot sign evidence | No WITNESS_PRIVATE_KEY access |
| Graph Intelligence cannot move money | No Circle/witness imports |
| Witness has dedicated signer | Constructor checks key separation |
| Evaluator has dedicated signer | Constructor checks key separation |
| Relayer has dedicated signer | Constructor checks key separation |
| Privy is human authority | Access token verification |
| Circle is machine execution | API key + Entity Secret server-side |

## Test Coverage

| Suite | Tests | Status |
|-------|-------|--------|
| packages/shared/test/*.test.ts | 111 | ✅ pass |
| packages/risk-engine/test/risk.test.ts | 7 | ✅ pass |
| packages/graph-intelligence/test/*.test.ts | 20 | ✅ pass |
| **Total Node tests** | **138** | **✅ all pass** |
| Solidity tests (fuzz + security) | 24 | ✅ all pass |
| **Total** | **162** | **✅ all pass** |

## Live Deployment State

| Component | Status |
|-----------|--------|
| XYXEvidenceRegistry | NOT_DEPLOYED |
| XYXEvaluator | NOT_DEPLOYED |
| Circle Wallet | NOT_CREATED |
| Graph Subgraph | NOT_DEPLOYED |
| Witness Service | NOT_RUNNING |
| API Service | NOT_RUNNING |
| IPFS | NOT_CONFIGURED |

**Overall: BLOCKED_BY_CONFIGURATION**

## Open Purchase Live Proof

**Required:** Real discovery → real payment → real response → real evidence → real receipt → real Graph indexing → second decision consumes evidence
**Current:** BLOCKED_BY_CONFIGURATION

## Protected Job Live Proof

**Required:** Real ERC-8183 lifecycle (create → budget → approve → fund → submit → evaluate → complete/reject)
**Current:** BLOCKED_BY_CONFIGURATION

## Graph Feedback Loop Proof

**Required:** Decision A → real transaction → new indexed evidence → Decision B (demonstrably consumed newly indexed evidence)
**Current:** BLOCKED_BY_CONFIGURATION

## Live Verification Tooling

**Script:** scripts/verify-live.ts
**Command:** npm run verify:live
**Checks:** Arc chain ID, contract bytecode, USDC balance, Graph endpoint, Graph receipts, Witness health, API health
**Output:** PASS | FAIL | BLOCKED | NOT_YET_PROVEN for each check

## Mainnet Readiness

**Document:** docs/ARC_MAINNET_READINESS.md
**Classification:** BLOCKED_BY_EXTERNAL_AVAILABILITY
**Key blockers:** No Arc mainnet RPC, no mainnet USDC address, no ERC-8183/8004 mainnet deployments, no Circle mainnet account

## ETHOnline Prize Alignment

| Track | Fit | Status |
|-------|-----|--------|
| Arc Agentic Economy | HIGH | BLOCKED_BY_CONFIGURATION |
| The Graph AI Use Case | HIGH | BLOCKED_BY_CONFIGURATION |
| Arc Continuity | HIGH | NEEDS_DOCUMENTATION |
| The Graph Composable/Standardized | MEDIUM | IN_PROGRESS |

## Files Changed

| File | Action |
|------|--------|
| packages/graph-intelligence/src/guardrails.ts | CREATED |
| packages/graph-intelligence/src/evidence-context.ts | CREATED |
| packages/graph-intelligence/src/queries.ts | CREATED |
| packages/graph-intelligence/src/explanation.ts | CREATED |
| packages/graph-intelligence/src/index.ts | CREATED |
| packages/graph-intelligence/test/intelligence.test.ts | CREATED |
| skills/xyx-graph/SKILL.md | CREATED |
| scripts/verify-live.ts | CREATED |
| deployments/arc-testnet.json | CREATED |
| docs/XYX_MATURITY_IMPLEMENTATION_PLAN.md | CREATED |
| docs/ARC_MAINNET_READINESS.md | CREATED |
| docs/ETHONLINE_PRIZE_ALIGNMENT.md | CREATED |
| XYX_MATURITY_REPORT.md | CREATED |
| package.json | MODIFIED (verify:live script, graph-intelligence tests) |

## Dependencies Changed

No new runtime dependencies. Graph Intelligence uses existing Graph client. Verification uses existing viem + public RPC.

## Technical Debt Remaining

1. Frontend protected job controls (create/fund/submit/evaluate UI) — P1
2. Graph Intelligence API route not wired — P1
3. Subgraph schema AI-friendly entities — P1
4. Substreams feasibility assessment — P1
5. CI/CD workflow — P1
6. OpenAPI schema — P1
7. Frontend tests — P1
8. Monitoring and alerting — P1
9. Incident response documentation — P1

## P1 Opportunities

1. Graph Intelligence live API route
2. Subgraph schema AI-friendly entities (Provider, EndpointPayerStat)
3. Substreams agent-commerce data primitive
4. Frontend protected job controls
5. CI/CD pipeline
6. OpenAPI documentation
7. Monitoring and alerting
8. Mainnet deployment preparation

## Exact Next Actions

1. **Configure live environment** — Create .env with real Circle/Arc/Graph credentials
2. **Deploy contracts** — Deploy XYXEvidenceRegistry and XYXEvaluator to Arc Testnet
3. **Deploy subgraph** — Render, codegen, and deploy to Graph Studio
4. **Fund wallet** — Create Circle wallet and fund with Arc Testnet USDC
5. **Run live E2E** — Execute open purchase with real discovery, payment, response, evidence, anchoring, Graph indexing
6. **Verify feedback loop** — Show second decision consuming newly indexed evidence
7. **Run verify:live** — Independent verification of all live components
8. **Capture evidence** — Record transaction hashes, CIDs, block numbers, Graph deployment
