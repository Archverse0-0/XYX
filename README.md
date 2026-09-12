# XYX — Expose, Yield, Execute

> **Trust infrastructure for machines that pay machines.**

**XYX verifies what autonomous agents actually did before paid jobs settle onchain.**

XYX is an evidence, verification, and settlement layer for autonomous agent commerce. It combines machine-verifiable execution evidence, deterministic evaluation, provider identity, indexed history, stablecoin payments, and onchain settlement.

## What XYX Does

XYX supports two distinct modes.

### Open Purchase

```text
Discover provider
→ Verify ERC-8004 identity
→ Query The Graph history
→ Assess deterministic risk
→ Pay via Circle / x402
→ Observe HTTP execution + settlement
→ Build canonical evidence
→ Persist/read back from IPFS
→ Sign ReceiptAttestation
→ Anchor on XYXEvidenceRegistry
→ Index receipt with The Graph
→ Improve future provider selection
```

Open Purchase uses Circle Developer-Controlled Wallets / Agent Stack, x402, ERC-8004, The Graph, a deterministic Risk Engine, IPFS, EIP-712 `ReceiptAttestation`, `XYXEvidenceRegistry`, Arc Testnet, and USDC.

Settlement is immediate through x402. Bad HTTP or service outcomes become negative evidence and history. Open Purchase does **not** use ERC-8183 `COMPLETE` / `REJECT`.

### Protected Job

```text
Select provider
→ Create ERC-8183 job
→ Set budget
→ Approve USDC
→ Fund escrow
→ Provider performs work
→ Submit deliverable commitment
→ Verify canonical evidence
→ IPFS persist/readback
→ Deterministic evaluation
→ Sign JobVerdict
→ XYXEvaluator resolves
→ ERC-8183 complete / reject
→ Settlement or refund
```

Protected Job uses ERC-8183, ERC-8004, The Graph plus the Risk Engine for provider selection, IPFS, deterministic acceptance criteria, EIP-712 `JobVerdict`, `XYXEvaluator`, Arc Testnet, and USDC.

Protected Job does **not** use `XYXEvidenceRegistry` for job evidence. Its evidence commitment is:

```text
JobVerdict.evidenceHash
→ XYXEvaluator.resolveJob()
→ ERC-8183 complete / reject
```

## Core Principle

XYX separates **“Should this provider be selected?”** from **“Did this provider satisfy the requirements committed to this job?”**

Provider selection uses:

```text
ERC-8004 identity
+ The Graph history
+ deterministic Risk Engine
```

Protected Job settlement uses committed deterministic acceptance criteria. Graph/Risk is **not** re-run during final Protected Job settlement unless explicitly committed in the job policy.

## Economic Loop

```text
DISCOVER
→ ASSESS
→ SELECT
→ PAY / FUND
→ OBSERVE
→ VERIFY
→ RECORD
→ LEARN
→ SELECT BETTER NEXT TIME
```

## Documentation Authority

The current forward implementation reference is `docs/XYX_TECHNICAL_PRD_v1.2.md`.

When sources conflict, use this order:

1. Frozen architecture invariants.
2. Verified live deployment/runtime facts.
3. Technical PRD v1.2.
4. Implementation backlog.

`docs/XYX_TECHNICAL_PRD_v1.1.md` is historical. Verified execution history is in `docs/sessions/` and `artifacts/live-evidence/`. Everything in `docs/archive/` is historical only.

## Current Status

Verified live Arc Testnet foundation includes:

- deployed `XYXEvidenceRegistry`
- deployed `XYXEvaluator`
- ERC-8183 integration
- controlled ERC-8004 provider identity
- Circle machine buyer wallet
- real USDC testnet funding
- deployed Graph subgraph
- IPFS write/readback infrastructure
- dedicated Witness and Evaluator signing identities
- real Protected Job creation on ERC-8183

Provider identity status: `LIVE_ERC8004_CONTROLLED_PROVIDER_IDENTITY_VERIFIED`.

The repository does **not** claim that the full PRD v1.2 Protected Job Definition of Done has already been proven. The historical success-path job did not establish causal Buyer Agent provider selection before creation. A separate Protected Job is required for the mandatory `REJECT` proof.

Temporary live values—such as TX2 state, balances, and current block numbers—do not belong in this README.

## Protected Job Execution Classes

### Deliverable Job

A provider produces an objectively machine-verifiable deliverable, such as deterministic JSON, normalized structured data, a signed result, or an artifact hash. No post-funding Circle Arc transaction is required.

### Machine-Action Job

This requires meaningful post-funding machine-controlled Arc execution that is semantically linked to the job, objectively verifiable, and causally traceable. Dummy calls, self-transfers, duplicate payments, and unrelated transactions are rejected.

## Evidence Model

All evidence follows a shared flow:

```text
canonical JSON
→ cryptographic hash
→ IPFS persistence
→ IPFS readback verification
→ EIP-712 signing
→ onchain commitment
```

Open Purchase uses:

```text
ReceiptAttestation
→ XYXEvidenceRegistry
```

Protected Job uses:

```text
JobVerdict.evidenceHash
→ XYXEvaluator
```

These evidence domains must not be conflated.

## Trust Boundaries

- Human authorization: Privy
- Machine buyer execution: Circle Developer-Controlled Wallet
- Provider identity: ERC-8004
- Protected escrow: ERC-8183
- Indexed machine memory: The Graph
- Evidence storage: IPFS
- Open Purchase attestation: Witness signer
- Protected Job verdict: Evaluator signer
- Settlement/finality: Arc Testnet

```text
Witness signer
!= Evaluator signer
!= Relayer
!= Circle machine buyer wallet
!= Provider
```

The Buyer Agent **must not** sign Witness evidence. The API **must not** sign Witness evidence or Protected Job verdicts.

## Deterministic Evaluation

`exact-json-v1` evaluates:

```text
canonicalJSON(expected)
===
canonicalJSON(actual)
```

A match results in `COMPLETE`; a mismatch results in `REJECT`. Reputation informs provider selection. Committed acceptance criteria determine funded job settlement.

## Fail-Closed Behavior

For a Protected Job critical verification failure:

```text
→ no settlement verdict submitted
```

For an Open Purchase critical pre-payment failure:

```text
→ no purchase
```

If an Open Purchase payment has settled but its evidence pipeline fails:

```text
payment settled
+ evidence pipeline incomplete
→ reconciliation required
```

This does not imply payment rollback.

## No-Mock Live Claim Policy

Mocks and fixtures are allowed only in local tests. Live claims require real external dependencies and independently verifiable evidence.

The following are not live proof:

- fabricated transaction hashes
- synthetic identities
- fake IPFS evidence
- mocked Graph history
- simulated settlement presented as confirmed settlement
- agent-generated success text without independent evidence

Preparation, simulation, broadcast, confirmation, verification, and settlement are distinct states.

## P0 Scope

P0 intentionally does **not** add:

- XYX token
- DAO
- custom escrow
- custom identity registry
- custom reputation registry
- Chainlink
- ENS
- ZK
- BFT jury
- cross-chain settlement

The P0 objective is a production-like, economically active Arc Testnet vertical slice with reproducible evidence—not a mocked hackathon flow. Mainnet is not required.

## Core Contracts

### XYXEvidenceRegistry

Open Purchase only.

Responsibilities:

- verify Witness-signed `ReceiptAttestation`
- timestamp, replay, and role validation
- anchor evidence commitment
- emit `ReceiptAnchored`

It has no custody and no reputation function.

### XYXEvaluator

Protected Job only.

Responsibilities:

- verify evaluator-signed `JobVerdict`
- signer, nonce, expiry, and replay validation
- call ERC-8183 `complete()` or `reject()`

ERC-8183 owns escrow. XYX does not add a custom escrow.

## Primary Infrastructure

- Arc Testnet
- USDC
- Circle Developer-Controlled Wallets
- Circle Agent Stack / x402
- ERC-8004
- ERC-8183
- The Graph
- IPFS
- Privy
- EIP-712
- `XYXEvidenceRegistry`
- `XYXEvaluator`

## Repository Structure

```text
apps/
  api/
  provider/
  witness/

packages/
  circle-adapter/
  contracts/
  erc8183/
  shared/

docs/
  sessions/
  archive/
  XYX_TECHNICAL_PRD_v1.1.md
  XYX_TECHNICAL_PRD_v1.2.md

artifacts/
  live-evidence/
```

## Live Claim Boundary

A complete Protected Job live proof requires independently verifiable:

```text
provider selection
→ job creation
→ budget
→ approval
→ funding
→ provider execution
→ submission
→ evidence
→ deterministic evaluation
→ evaluator signature
→ XYXEvaluator resolution
→ ERC-8183 settlement/refund
→ indexed final outcome
```

Until a stage is proven with real evidence, it remains implementation or verification work rather than a completed live claim.

Autonomous agents increasingly discover services, hold wallets, pay, hire providers, execute economic actions, and claim completion. XYX adds independent observation, canonical evidence, deterministic evaluation, economic settlement, and historical machine memory.

**XYX — Trust infrastructure for machines that pay machines.**
