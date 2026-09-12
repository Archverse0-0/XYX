# ETHOnline 2026 Prize Alignment

## Track Evaluation

### 1. The Graph — Continuity / AI Use Case

**Track:** The Graph AI Use Case
**Fit:** HIGH
**Why XYX fits:** The Graph is load-bearing for XYX's economic decisions. The Buyer Agent queries indexed receipts from the Graph, feeds them to the deterministic Risk Engine, and selects providers based on verifiable historical evidence. The Graph is not decoration — it is machine memory that directly controls spending decisions.
**Integration used:** GraphClient queries `_meta`, `receipts`, `validations`, `endpoints`, and `jobs` entities. Graph freshness is verified by comparing block hash against Arc chain head. Graph evidence is fed directly to the Risk Engine's `evaluate()` function.
**Live proof:** BLOCKED_BY_CONFIGURATION — requires live Graph deployment on Arc Testnet.
**Missing:** Live subgraph deployment, live Graph endpoint, live receipt anchoring → Graph indexing → subsequent decision consuming indexed evidence.
**Demo scene:** Show a real receipt anchored on Arc, indexed by Graph, then consumed by a subsequent Risk Engine decision that changes the evidence context.
**Files:** `packages/shared/src/graph.ts`, `packages/subgraph/schema.graphql`, `packages/subgraph/src/evidence.ts`, `apps/buyer-agent/src/runtime.ts:35-48`
**Priority:** P0

### 2. The Graph — Composable / Standardized Products

**Track:** The Graph Composable/Standardized Products
**Fit:** MEDIUM
**Why XYX fits:** XYX's subgraph schema is reusable for agent commerce patterns. The Graph Intelligence layer and SKILL demonstrate AI-readable investigation over live Graph data.
**Integration used:** Subgraph MCP integration, Graph Intelligence API, SKILL documentation.
**Live proof:** BLOCKED_BY_IMPLEMENTATION — Graph Intelligence and SKILL are being built.
**Missing:** Live Graph Intelligence queries, live SKILL usage, composable/standardized evidence across multiple agent commerce protocols.
**Demo scene:** Show an AI client querying XYX Graph data through the Intelligence layer, receiving provenance-stamped answers with entity IDs and block numbers.
**Files:** `packages/graph-intelligence/`, `skills/xyx-graph/SKILL.md`
**Priority:** P1

### 3. Arc — Agentic Economy

**Track:** Arc Agentic Economy
**Fit:** HIGH
**Why XYX fits:** XYX demonstrates the full agentic economy loop: human authorization (Privy) → real Arc USDC funding → Circle Developer-Controlled Wallet → autonomous machine payment → real provider response → deterministic verification → evidence anchoring on Arc → Graph indexing.
**Integration used:** Arc Testnet (chain ID 5042002), USDC (0x3600000000000000000000000000000000000000), Circle Developer-Controlled Wallets SDK, XYXEvidenceRegistry, XYXEvaluator, ERC-8183 reference.
**Live proof:** BLOCKED_BY_CONFIGURATION — requires real Arc deployment, Circle wallet, and funded USDC.
**Missing:** Live contract deployment, live Circle wallet, live payment execution, live receipt anchoring.
**Demo scene:** Show human funding Circle wallet → Buyer Agent discovering services → paying real USDC → receiving real response → anchoring receipt on Arc.
**Files:** `apps/witness/src/service.ts`, `packages/circle-adapter/src/index.ts`, `packages/contracts/src/XYXEvidenceRegistry.sol`, `packages/contracts/src/XYXEvaluator.sol`
**Priority:** P0

### 4. Arc — Continuity

**Track:** Arc Continuity
**Fit:** HIGH (if previously submitted)
**Why XYX fits:** XYX has a substantial local P0 foundation with 128 Node tests, 24 Solidity tests, and verified production wiring. The work represents significant protocol engineering.
**Integration used:** Same as Agentic Economy track.
**Live proof:** BLOCKED_BY_CONFIGURATION.
**Missing:** Documentation of what existed before ETHOnline vs. what was created during the event.
**Demo scene:** Show the git history and the progression from initial commit to hardened P0 foundation.
**Files:** All repository files.
**Priority:** P0 (requires continuity documentation)

## Priority Ranking

1. **Arc Agentic Economy** — Highest impact, strongest architecture fit
2. **The Graph AI Use Case** — Graph is load-bearing, strong technical story
3. **Arc Continuity** — If previously submitted, strong eligibility
4. **The Graph Composable/Standardized** — P1 stretch, depends on live Graph

## Missing Qualification Requirements

### Arc Agentic Economy
- [ ] Live Arc Testnet deployment with real contracts
- [ ] Live Circle Developer-Controlled Wallet with USDC
- [ ] Live payment execution through Circle Marketplace
- [ ] Live receipt anchoring on Arc
- [ ] Live Graph indexing of anchored receipts

### The Graph AI Use Case
- [ ] Live subgraph deployed to Graph Studio
- [ ] Live Graph endpoint serving XYX data
- [ ] Live receipt anchoring → Graph indexing → subsequent decision
- [ ] Graph Intelligence queries against live data

### Arc Continuity
- [ ] Continuity documentation (what existed before vs. during event)
- [ ] Clear commit history showing event work

### The Graph Composable/Standardized
- [ ] Live Graph Intelligence layer queries
- [ ] Reusable SKILL demonstrating AI-readable Graph investigation
- [ ] Composable evidence across protocols (stretch)

## Architecture vs. Bounty Alignment

XYX's architecture naturally aligns with these bounties because:

1. **The Graph is load-bearing** — not decoration. The Risk Engine requires indexed evidence to make spending decisions.
2. **Arc is economically load-bearing** — not ceremonial. Real USDC moves through real Circle wallets to real providers.
3. **The evidence loop is verifiable** — receipt anchoring → Graph indexing → subsequent decision consuming indexed evidence.

The bounty alignment reinforces the product architecture rather than requiring architectural changes to chase sponsor logos.
