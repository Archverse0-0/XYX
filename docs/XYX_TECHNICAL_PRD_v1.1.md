# XYX — End-to-End Technical Product Requirements Document

**Version:** 1.1  
**Status:** PRIMARY IMPLEMENTATION REFERENCE  
**Date:** 2026-09-10  
**Repository:** `/home/pupulion/xyx_eth_online`  
**Audience:** Founder, Smart Contract Engineer, Backend Engineer, Agent Engineer, Frontend Engineer, DevOps/SRE, Security Reviewer, Hackathon Judge  
**Scope:** ETHOnline 2026 — production-like live testnet vertical slice  
**Primary chain:** Arc Testnet  
**Primary settlement asset:** USDC  
**Primary implementation goal:** Deliver one complete, live, evidence-backed autonomous-agent job lifecycle from human intent to final settlement, including both ACCEPT and REJECT paths.

---

# 0. DOCUMENT AUTHORITY

## 0.1 Purpose

This document is the **primary implementation reference** for the current XYX ETHOnline build.

It defines:

- the product thesis;
- what XYX is and is not;
- target user and target integration surface;
- frozen architecture constraints;
- verified current implementation baseline;
- exact north-star E2E flow;
- component responsibilities;
- system states;
- data contracts;
- evidence requirements;
- evaluator behavior;
- settlement behavior;
- frontend requirements;
- live deployment requirements;
- reliability requirements;
- security requirements;
- testing requirements;
- observability requirements;
- demo requirements;
- milestone ordering;
- definition of done.

This is not a pitch document.

This is the document engineers should use to decide:

> **What do we build next, what must not change, what must be live, and what counts as done?**

---

## 0.2 Source-of-Truth Hierarchy

When documents or implementation assumptions conflict, apply this hierarchy:

### Level 1 — Frozen PRD invariants
Must not change without explicit PRD revision.

### Level 2 — Verified current implementation facts
Anything already verified in the existing maturity implementation report has precedence over assumptions in this document.

### Level 3 — This PRD
Defines implementation priority, product behavior, acceptance criteria, live proof requirements, frontend behavior, and demo readiness.

### Level 4 — Future ideas / backlog
SDK polish, Graph Intelligence enhancements, Substreams, multi-chain, generalized subjective arbitration, and similar work.

---

## 0.3 Interpretation Rule

Every statement in this PRD belongs to one of three categories:

- **VERIFIED CURRENT** — confirmed implemented or tested in the current repository.
- **REQUIRED NEXT** — required by this PRD but not yet proven live.
- **PROPOSED INTERFACE** — recommended API/UI/data shape. Exact code naming may differ if existing production interfaces already expose equivalent semantics.

Engineers MUST NOT interpret a proposed interface name as evidence that such exact code already exists.

---

# 1. EXECUTIVE PRODUCT DEFINITION

## 1.1 One-Sentence Product Definition

> **XYX verifies what autonomous agents actually did before paid jobs settle onchain.**

---

## 1.2 Technical Product Definition

XYX is an **evidence-backed accountability and settlement layer for autonomous economic agents**.

XYX sits between:

1. an autonomous agent performing a paid job;
2. the execution evidence proving what happened;
3. an evaluator determining whether the job outcome is acceptable;
4. a settlement mechanism that finalizes economic consequences.

XYX is not primarily responsible for generating the task, deciding what AI model is best, or becoming a generic judge of subjective AI quality.

The primary XYX question is:

> **Did the agent satisfy the machine-verifiable requirements of this paid job strongly enough for settlement to proceed?**

---

# 2. PROBLEM STATEMENT

## 2.1 The Agentic Economic Problem

As autonomous agents gain:

- wallets;
- stablecoin balances;
- payment authority;
- the ability to discover services;
- the ability to purchase services;
- the ability to execute transactions;
- the ability to claim completion;

the system surrounding them needs a verifiable answer to:

> **What actually happened?**

The existence of an AI-generated completion message is not sufficient.

The existence of an onchain transaction alone is also not sufficient when the system must determine whether that transaction satisfied the intended job.

The gap is:

```text
JOB REQUIREMENT
      ↓
AGENT EXECUTION
      ↓
AGENT CLAIM
      ↓
???
      ↓
SETTLEMENT
```

XYX fills `???` with:

```text
independent observation
+ canonical evidence
+ provenance
+ historical context
+ deterministic evaluation
+ settlement decision
```

---

## 2.2 Why Blockchain Alone Is Not Enough

A blockchain can prove:

- a transaction exists;
- a sender;
- a recipient;
- an amount;
- a block;
- a transaction status;
- contract state transitions.

But a settlement system may still need to answer:

- Was this the correct provider?
- Was the execution associated with the correct protected job?
- Did it satisfy the job’s acceptance conditions?
- Was the evidence independently produced?
- Is the evidence internally consistent?
- Is the provider identity valid?
- Does historical evidence raise or lower confidence?
- Is the current evidence sufficient to finalize payment?

XYX combines those signals into an accountable verdict.

---

# 3. TARGET MARKET AND INTEGRATION USER

## 3.1 Primary Target

> **Developers and protocols building paid autonomous-agent workflows where settlement depends on the outcome of the agent’s work.**

Examples:

- autonomous agent marketplaces;
- paid agent job protocols;
- agent-to-agent commerce;
- autonomous purchasing systems;
- machine-wallet execution platforms;
- service protocols where an agent hires another provider;
- applications where settlement should be conditional on evidence.

---

## 3.2 Primary Integration User

The primary integration user is not the ordinary end-user.

It is:

> **the engineer who needs a protected agent-job lifecycle with evidence-backed settlement.**

Their job-to-be-done:

> “I want my agent to autonomously execute a paid task, but I do not want successful settlement to depend only on the agent saying it succeeded.”

---

## 3.3 Secondary Beneficiaries

- end users authorizing autonomous activity;
- agent providers;
- protocol operators;
- agent marketplaces;
- auditors;
- reputation systems consuming outcomes;
- indexers and data consumers.

---

# 4. PRODUCT POSITIONING

## 4.1 XYX Is

- agent-job accountability infrastructure;
- evidence-backed evaluation infrastructure;
- protected settlement coordination;
- trust infrastructure around economic agent execution.

## 4.2 XYX Is Not

- an AI leaderboard;
- an LLM benchmark;
- an AI model ranking system;
- an LLM debate arena;
- a DAO court;
- a generalized human arbitration marketplace;
- a custom token economy;
- a custom identity protocol;
- a custom reputation protocol;
- a custom escrow protocol;
- a BFT jury system;
- a Chainlink randomness system;
- a ZK system;
- a subjective-content moderation system.

---

# 5. FROZEN ARCHITECTURE INVARIANTS

**VERIFIED CURRENT / MUST NOT CHANGE**

The following constraints are frozen:

1. Risk Engine math remains:
   - Wilson;
   - diversity;
   - confidence;
   - validation renormalization.

2. Contract set remains:
   - `XYXEvidenceRegistry.sol`
   - `XYXEvaluator.sol`

3. Evidence trust model remains:
   - canonical JSON;
   - IPFS readback;
   - EIP-712 signing.

4. Trust boundaries:
   - API MUST NOT sign Witness evidence;
   - Buyer Agent MUST NOT sign Witness evidence.

5. ERC integration semantics remain:
   - ERC-8004;
   - ERC-8183.

6. Arc Testnet remains:
   - primary settlement environment;
   - primary finality environment for ETHOnline.

7. Circle Agent Stack remains:
   - machine execution environment.

8. The Graph remains:
   - indexed memory;
   - load-bearing decision input;
   - fail-closed;
   - block-hash verification aware.

9. Privy remains:
   - human authorization layer.

10. XYX MUST NOT add for P0:
   - XYX token;
   - DAO;
   - custom escrow;
   - custom identity registry;
   - custom reputation registry;
   - BFT;
   - ZK;
   - Chainlink;
   - ENS.

---

# 6. VERIFIED CURRENT IMPLEMENTATION BASELINE

## 6.1 Repository Health

**VERIFIED CURRENT**

- Repository: `/home/pupulion/xyx_eth_online`
- Branch observed in maturity report: `master`
- Node tests: 128 passing
- Solidity tests: 24 passing
- Typecheck: clean
- Doctor: fail-closed when configuration is missing

---

## 6.2 ERC-8004

**VERIFIED CURRENT**

Current runtime already:

```text
runtime
→ ERC8004Client.resolve()
→ graph.validations()
→ validationScore()
→ candidate.validation
```

Capabilities:

- identity resolution;
- validation signal consumption;
- runtime use of validation score.

Missing:

- live deployment/configuration proof.

---

## 6.3 Buyer Agent

**VERIFIED CURRENT**

Current production path:

```text
intent
→ discovery
→ inspection
→ Graph
→ Risk
→ selection
```

The Buyer Agent is already integrated in the runtime.

Therefore:

**This PRD MUST NOT replace the Buyer Agent with a new demo-specific agent.**

The demo must use the real Buyer Agent pipeline.

---

## 6.4 Graph → Risk Integration

**VERIFIED CURRENT**

Current path:

```text
graph.evidence()
→ RiskReceipt[]
→ schema parsing
→ evaluate()
→ decision
```

The Graph is not optional analytics.

It is part of the decision path.

---

## 6.5 Witness

**VERIFIED CURRENT**

Witness integration includes:

```text
classify()
→ EIP-712 domain
→ typed data
→ hash
```

The Witness exists as an independent trust boundary.

---

## 6.6 ERC-8183 Protected Job

**VERIFIED CURRENT**

Current lifecycle is wired:

```text
createJob
→ setBudget
→ approve
→ fund
→ submit
→ evaluate
→ resolve
```

Current backend also has:

- job operation handling;
- advisory locks;
- idempotency;
- reconciliation.

Missing:

- live E2E proof;
- frontend controls for create/fund/submit/evaluate.

---

## 6.7 Reliability

**VERIFIED CURRENT**

Existing mechanisms include:

- Protected Job fund idempotency;
- Protected Job submit idempotency;
- Open Purchase idempotency;
- operation journal;
- advisory locks;
- reconciliation states:
  - `IN_FLIGHT`
  - `CONFIRMED`
  - `RECONCILIATION_REQUIRED`

---

## 6.8 Security

**VERIFIED CURRENT**

Existing requirements already enforced:

- Witness key != Evaluator key != Relayer key;
- no credentials exposed in logs;
- fail-closed doctor;
- EIP-712 domain separation includes:
  - chain ID;
  - contract address.

---

# 7. CURRENT MAJOR GAPS

## 7.1 Live Arc

**REQUIRED NEXT**

Missing:

- real `XYXEvidenceRegistry` Arc address;
- real `XYXEvaluator` Arc address;
- funded wallets;
- real Arc execution transaction hashes;
- live contract verification;
- live protected-job E2E.

---

## 7.2 The Graph

**REQUIRED NEXT**

Current schema has:

- Endpoint;
- Receipt;
- AgentIdentity;
- Validation;
- Feedback;
- Job.

Missing:

- live Graph Studio deployment;
- live indexed Arc data;
- Graph Intelligence;
- Graph SKILL;
- Subgraph MCP integration;
- additional AI-friendly query maturity if necessary.

---

## 7.3 IPFS

**REQUIRED NEXT**

Missing:

- live configuration;
- live write/read proof.

---

## 7.4 Frontend

**REQUIRED NEXT**

Missing core controls:

- create;
- fund;
- submit;
- evaluate.

This PRD also requires:

- job provenance view;
- settlement view;
- rejection path view;
- live system status.

---

# 8. NORTH-STAR SYSTEM FLOW

The full E2E system MUST work as follows:

```text
┌────────────────────┐
│ Human / Requester  │
└─────────┬──────────┘
          │
          │ Privy authorization
          ▼
┌────────────────────┐
│ Buyer Agent        │
└─────────┬──────────┘
          │
          ├── intent parsing
          ├── discovery
          ├── inspection
          ├── ERC-8004 identity
          ├── Graph history
          ├── Risk Engine
          └── provider selection
          │
          ▼
┌────────────────────┐
│ ERC-8183 Job       │
└─────────┬──────────┘
          │
          ├── create
          ├── set budget
          ├── approve
          └── fund with USDC
          │
          ▼
┌────────────────────┐
│ Circle Machine     │
│ Execution          │
└─────────┬──────────┘
          │
          ▼
┌────────────────────┐
│ Arc Testnet        │
└─────────┬──────────┘
          │
          ▼
┌────────────────────┐
│ Witness            │
└─────────┬──────────┘
          │
          ├── observe
          ├── classify
          ├── canonicalize
          ├── IPFS write
          ├── IPFS readback
          └── EIP-712 sign
          │
          ▼
┌────────────────────┐
│ Evidence Registry  │
└─────────┬──────────┘
          │
          ▼
┌────────────────────┐
│ The Graph          │
└─────────┬──────────┘
          │
          ▼
┌────────────────────┐
│ Risk Engine        │
└─────────┬──────────┘
          │
          ▼
┌────────────────────┐
│ XYXEvaluator       │
└─────────┬──────────┘
          │
          ├── ACCEPT
          ├── REJECT
          └── FAIL-CLOSED
          │
          ▼
┌────────────────────┐
│ ERC-8183 Resolve   │
└─────────┬──────────┘
          │
          ▼
┌────────────────────┐
│ Settlement Outcome │
└────────────────────┘
```

---

# 9. PRIMARY HERO DEMO

## 9.1 Demo Philosophy

The hero demo MUST prove:

1. autonomy;
2. economic commitment;
3. machine execution;
4. independent evidence;
5. deterministic evaluation;
6. conditional settlement.

The hero demo MUST NOT depend on subjective LLM grading.

Acceptance criteria MUST be machine-verifiable.

---

## 9.2 Required Demo Type

The exact job action may be finalized separately, but it MUST have objectively verifiable fields.

A valid demo job must contain some combination of:

- expected chain;
- expected token;
- expected amount;
- expected recipient;
- expected provider;
- deadline;
- exact output hash;
- expected contract interaction;
- expected function selector;
- maximum cost;
- minimum result amount;
- route/endpoint identity;
- required execution status.

The purpose is not the specific transfer.

The purpose is that the Witness can objectively compare:

```text
EXPECTED JOB
vs
ACTUAL EXECUTION
```

---

# 10. JOB REQUIREMENT MODEL

## 10.1 Semantic Job Fields

**PROPOSED INTERFACE**

A job should semantically contain:

```ts
type JobRequirement = {
  jobId: string
  requester: string
  provider?: string
  chainId: number
  budgetUsdc: string
  deadline?: number
  actionType: string
  acceptanceCriteria: AcceptanceCriteria
}
```

Exact code shape may differ.

---

## 10.2 Acceptance Criteria

Acceptance criteria MUST be:

- explicit;
- machine-verifiable;
- deterministic;
- attached before execution;
- immutable once the protected economic commitment is finalized.

Examples:

```text
recipient == expectedRecipient
amount == expectedAmount
token == USDC
chainId == Arc
txStatus == SUCCESS
deadline not exceeded
```

Not valid for P0:

```text
"result looks good"
"response is high quality"
"AI answer is better"
"judge subjectively prefers this"
```

---

# 11. BUYER AGENT REQUIREMENTS

## 11.1 Responsibility

The Buyer Agent is responsible for selecting an execution/provider candidate.

It is NOT responsible for signing Witness evidence.

It is NOT the final source of truth for successful completion.

---

## 11.2 Required Buyer Flow

```text
user intent
→ normalize intent
→ discover candidates
→ inspect candidate metadata
→ resolve identity
→ fetch validation history
→ fetch Graph history
→ compute risk
→ rank candidates
→ select provider
```

---

## 11.3 Buyer Inputs

Minimum:

- user intent;
- job constraints;
- candidate endpoint/provider data;
- ERC-8004 identity;
- validation signals;
- Graph evidence/history;
- Risk Engine configuration.

---

## 11.4 Buyer Output

Semantic output:

```ts
type ProviderSelection = {
  selectedProvider: string
  identityReference: string
  score: number
  evidenceReferences: string[]
  decisionInputsHash?: string
}
```

Exact shape is proposed.

---

## 11.5 Determinism

Given identical validated inputs, the selection logic SHOULD be reproducible.

An LLM explanation MAY be nondeterministic.

The economic selection decision MUST NOT depend only on a free-form LLM statement.

---

# 12. ERC-8004 REQUIREMENTS

## 12.1 Role

ERC-8004 provides external agent identity / validation semantics.

XYX MUST NOT duplicate it with a custom identity registry.

---

## 12.2 Runtime Use

Identity must be consumed:

```text
candidate
→ ERC8004Client.resolve()
→ identity
→ Graph validations
→ validationScore
→ Risk Engine
```

---

## 12.3 Failure Semantics

If identity/validation is required for the current decision but cannot be verified:

```text
DO NOT silently substitute fake identity
DO NOT silently use fixture identity
DO NOT produce false ACCEPT
```

System response:

- `UNAVAILABLE`, or
- fail-closed equivalent.

---

# 13. THE GRAPH REQUIREMENTS

## 13.1 Role

The Graph is XYX indexed memory.

It is not simply a dashboard indexer.

The Graph supports:

- historical receipt retrieval;
- provider history;
- validation history;
- job history;
- evidence lookups;
- deterministic risk context.

---

## 13.2 Existing Entities

Current known schema includes:

```text
Endpoint
Receipt
AgentIdentity
Validation
Feedback
Job
```

---

## 13.3 Live Graph Requirements

The Graph deployment MUST:

- index real Arc Testnet events;
- expose a stable endpoint;
- expose latest indexed block;
- allow job lookup;
- allow receipt lookup;
- allow identity lookup;
- allow validation lookup;
- preserve provenance.

---

## 13.4 Block Verification

Critical indexed state MUST be verifiable against chain state.

When block provenance cannot be verified:

```text
decision = FAIL-CLOSED
```

It MUST NOT silently fall back to stale data.

---

## 13.5 Graph Freshness

**PROPOSED REQUIREMENT**

The backend SHOULD compare:

```text
Arc latest block
vs
Graph indexed block
```

and expose a freshness state:

```text
HEALTHY
LAGGING
STALE
UNAVAILABLE
```

The exact threshold should be configuration-driven.

---

# 14. RISK ENGINE REQUIREMENTS

## 14.1 Frozen Math

Risk Engine math MUST NOT change:

- Wilson;
- diversity;
- confidence;
- validation renormalization.

---

## 14.2 Inputs

At minimum, evaluation may consume:

- current evidence receipt;
- historical receipts;
- ERC-8004 validation;
- evidence diversity;
- confidence;
- provider history.

---

## 14.3 Outputs

**PROPOSED SEMANTIC OUTPUT**

```ts
type RiskDecision = {
  decision: "ACCEPT" | "REJECT" | "FAIL_CLOSED"
  confidence: number
  score?: number
  reasons: string[]
  inputReferences: string[]
}
```

The internal implementation may use different structures.

---

## 14.4 Prohibition

The Risk Engine MUST NOT be replaced by:

- raw LLM judgment;
- manual judge click;
- hidden hardcoded demo result.

---

# 15. ERC-8183 PROTECTED JOB REQUIREMENTS

## 15.1 Role

ERC-8183 provides protected-job lifecycle semantics.

XYX MUST use the existing integration rather than creating custom escrow.

---

## 15.2 Required Lifecycle

```text
createJob
→ setBudget
→ approve
→ fund
→ submit
→ evaluate
→ resolve
```

---

## 15.3 Job State Expectations

**PROPOSED PRODUCT STATE MAPPING**

UI/API may map low-level lifecycle into:

```text
DRAFT
CREATED
BUDGET_SET
APPROVED
FUNDED
EXECUTING
SUBMITTED
EVIDENCE_PENDING
EVALUATING
ACCEPTED
REJECTED
RESOLVED
RECONCILIATION_REQUIRED
```

This is a product-facing mapping.

Do not change ERC-8183 semantics merely to match these labels.

---

# 16. USDC REQUIREMENTS

## 16.1 Role

USDC is used for:

- budget;
- payment;
- settlement;
- economic commitment.

---

## 16.2 Arc Semantics

Current configuration knowledge includes:

```text
Arc chain ID: 5042002
USDC decimals: 6
```

All amount conversions MUST treat USDC as 6 decimals.

---

## 16.3 Economic Safety

The system MUST prevent:

- double funding;
- duplicate settlement;
- accidental duplicate action on retries;
- unit/decimal mismatch;
- cross-chain address confusion.

---

# 17. CIRCLE AGENT STACK REQUIREMENTS

## 17.1 Role

Circle is the machine execution layer.

The demo MUST prove:

> The agent execution is performed by a machine-controlled execution path, not by a human manually executing the same action.

---

## 17.2 Required Proof

A demo execution must expose:

- machine wallet address;
- job ID;
- Arc transaction hash;
- execution timestamp/block;
- linkage between job and transaction.

---

## 17.3 Human vs Machine Boundary

Human:

```text
authorizes intent / job
```

Machine agent:

```text
executes economic action
```

This boundary should be visually clear in the demo.

---

# 18. WITNESS REQUIREMENTS

## 18.1 Role

The Witness independently observes execution and produces signed evidence.

It is a core trust boundary.

---

## 18.2 Witness Must Not

- trust only the Agent's self-reported completion;
- use the Buyer Agent key;
- use the API signing key;
- silently accept unverifiable transaction state.

---

## 18.3 Witness Flow

```text
execution reference
→ fetch chain reality
→ classify
→ construct canonical evidence
→ store evidence
→ read back evidence
→ EIP-712 sign
→ register evidence
```

---

# 19. EVIDENCE MODEL

## 19.1 Evidence Requirements

Evidence MUST be:

- deterministic enough for hashing;
- canonicalized;
- provenance-aware;
- linked to a specific job;
- linked to a specific execution;
- signed by the Witness;
- independently verifiable;
- retrievable from IPFS;
- registrable onchain.

---

## 19.2 Evidence Semantic Schema

**PROPOSED INTERFACE**

A canonical evidence object should semantically include:

```json
{
  "version": "1",
  "jobId": "...",
  "chainId": 5042002,
  "provider": "0x...",
  "executor": "0x...",
  "txHash": "0x...",
  "blockNumber": "...",
  "blockHash": "0x...",
  "actionType": "...",
  "expected": {},
  "observed": {},
  "checks": [],
  "timestamp": "...",
  "witness": "0x..."
}
```

Exact field names must follow existing implementation if already defined.

---

## 19.3 Check Model

Each machine-verifiable criterion SHOULD produce an explicit check:

```json
{
  "field": "recipient",
  "expected": "0xABC...",
  "observed": "0xABC...",
  "status": "PASS"
}
```

or:

```json
{
  "field": "recipient",
  "expected": "0xABC...",
  "observed": "0xDEF...",
  "status": "FAIL"
}
```

---

# 20. CANONICAL JSON REQUIREMENTS

## 20.1 Goal

The same semantic evidence MUST produce the same hash.

---

## 20.2 Rules

Canonicalization MUST define or preserve existing implementation rules for:

- field ordering;
- omitted fields;
- null handling;
- integer encoding;
- address normalization;
- hex normalization;
- timestamps;
- arrays;
- string encoding.

If the current repository already defines canonicalization rules, those rules win.

---

# 21. IPFS REQUIREMENTS

## 21.1 Write

Canonical evidence is written to IPFS-compatible storage.

---

## 21.2 Readback

After write:

```text
CID returned
→ fetch CID
→ parse content
→ recanonicalize if required
→ compare expected content/hash
```

Only after successful readback can evidence proceed as verified.

---

## 21.3 Failure

Any of:

- write failure;
- read failure;
- mismatch;
- malformed content;

must produce:

```text
EVIDENCE_INVALID
or
FAIL_CLOSED
```

No ACCEPT.

---

# 22. EIP-712 REQUIREMENTS

## 22.1 Domain Separation

Evidence and verdict domains MUST include:

- Arc chain ID;
- relevant contract address.

---

## 22.2 Signature Validation

Every Witness signature must be independently recoverable/verifiable.

Invalid signature:

```text
REJECT EVIDENCE
```

Wrong chain/domain:

```text
REJECT EVIDENCE
```

---

# 23. XYXEVIDENCEREGISTRY REQUIREMENTS

## 23.1 Role

`XYXEvidenceRegistry.sol` is the onchain anchor for verified evidence references / commitments according to current implementation semantics.

---

## 23.2 Requirements

The Registry should enable the system to prove at minimum:

- evidence exists;
- evidence is associated with expected job/execution context;
- evidence reference/hash is consistent;
- relevant event can be indexed by The Graph.

Do not expand the contract into a generalized storage system unless necessary.

---

# 24. XYXEVALUATOR REQUIREMENTS

## 24.1 Role

`XYXEvaluator.sol` represents the accountable evaluation boundary.

---

## 24.2 Verdict Semantics

Product-level verdicts:

```text
ACCEPT
REJECT
FAIL_CLOSED
```

`FAIL_CLOSED` may map to absence of a valid onchain approval rather than a literal enum if current contract semantics differ.

---

## 24.3 Evaluator Must Not

- accept without valid evidence;
- accept if evidence provenance is invalid;
- bypass Risk Engine with a demo-only hardcode;
- use the Witness signing identity.

---

# 25. SETTLEMENT REQUIREMENTS

## 25.1 Rule

Settlement MUST be causally linked to the evaluation result.

---

## 25.2 Success

```text
valid execution
→ valid evidence
→ ACCEPT
→ resolve successful
→ settlement successful
```

---

## 25.3 Reject

```text
invalid execution
→ preserved evidence
→ REJECT
→ no successful settlement
```

---

## 25.4 Fail Closed

```text
unavailable critical evidence
→ FAIL_CLOSED
→ no successful settlement
```

---

# 26. IDEMPOTENCY REQUIREMENTS

Every state-changing economic route MUST define an idempotency behavior.

Minimum matrix:

| Operation | Duplicate request behavior |
|---|---|
| createJob | return/reconcile existing operation where appropriate |
| setBudget | no unintended duplicate mutation |
| approve | safe replay semantics |
| fund | MUST NOT double fund |
| execute | MUST NOT duplicate machine economic action |
| submit | MUST NOT double-submit |
| evaluate | deterministic/replay-safe |
| resolve | MUST NOT double-resolve |

Existing job operation journal and advisory locks MUST remain active.

---

# 27. RECONCILIATION REQUIREMENTS

## 27.1 Problem

A process may fail after broadcasting a transaction but before persisting completion.

---

## 27.2 Required States

Existing reconciliation states remain:

```text
IN_FLIGHT
CONFIRMED
RECONCILIATION_REQUIRED
```

---

## 27.3 Recovery

On restart:

```text
operation journal
→ identify in-flight action
→ inspect Arc transaction
→ reconcile backend state
→ DO NOT re-broadcast blindly
```

---

# 28. API REQUIREMENTS

The exact existing routes may differ.

The following are **semantic API capabilities** required by the product.

## 28.1 System Health

```text
GET /health
GET /doctor
GET /live-status
```

Expected data:

- Arc;
- contracts;
- Circle;
- Graph;
- IPFS;
- ERC-8004;
- ERC-8183.

---

## 28.2 Provider Discovery

```text
POST /buyer/select
```

Input:

- intent;
- constraints.

Output:

- selected provider;
- identity;
- risk decision;
- evidence references.

---

## 28.3 Jobs

Required semantic operations:

```text
create job
set budget
approve
fund
get job
submit job
evaluate job
resolve job
```

These may map to existing routes.

---

## 28.4 Evidence

Required semantic operations:

```text
get evidence by job
get evidence by tx
verify evidence
```

---

## 28.5 Evaluation

Required semantic operation:

```text
get verdict
get decision inputs
```

---

# 29. API ERROR MODEL

Existing API error classification remains.

Product error families SHOULD be distinguishable:

```text
VALIDATION_ERROR
CONFIGURATION_REQUIRED
DEPENDENCY_UNAVAILABLE
EVIDENCE_INVALID
IDENTITY_UNAVAILABLE
GRAPH_UNAVAILABLE
IPFS_UNAVAILABLE
ARC_TX_FAILED
RECONCILIATION_REQUIRED
JOB_STATE_CONFLICT
SIGNATURE_INVALID
SETTLEMENT_BLOCKED
```

Do not collapse critical failures into HTTP 200 with a misleading success body.

---

# 30. FRONTEND INFORMATION ARCHITECTURE

Minimum routes:

```text
/
 /jobs
 /jobs/new
 /jobs/[id]
 /agents
 /integrate
 /system
```

---

# 31. HOME PAGE

Purpose:

- explain XYX in one sentence;
- show live system state;
- show latest jobs;
- link to hero demo.

Primary copy:

> **Evidence-backed settlement for autonomous agent jobs.**

Primary CTA:

```text
Create Protected Job
```

Secondary CTA:

```text
View Live Jobs
```

---

# 32. CREATE JOB PAGE

Fields:

- human intent;
- budget in USDC;
- machine-verifiable requirements;
- optional constraints;
- deadline if applicable.

The UI MUST clearly separate:

```text
INTENT
```

from:

```text
ACCEPTANCE CRITERIA
```

The user may express high-level intent in natural language.

Before funding, the final machine-verifiable acceptance criteria MUST be visible.

---

# 33. JOB DETAIL PAGE — HERO PRODUCT SURFACE

This is the most important screen.

Required sections:

## 33.1 Request

- job ID;
- requester;
- intent;
- budget;
- acceptance criteria;
- creation time.

## 33.2 Provider

- selected provider;
- ERC-8004 identity;
- validation score;
- risk score;
- selection status.

## 33.3 Protected Job

- ERC-8183 state;
- budget;
- approval;
- funding tx;
- current lifecycle.

## 33.4 Execution

- Circle machine wallet;
- action;
- Arc tx hash;
- block;
- status.

## 33.5 Evidence

- Witness;
- IPFS CID;
- signature status;
- expected vs observed checks;
- registry tx/reference.

## 33.6 Graph

- indexed status;
- indexed block;
- freshness state.

## 33.7 Evaluation

- decision;
- confidence;
- risk signals;
- reasons;
- evaluator reference.

## 33.8 Settlement

- final resolution;
- settlement tx;
- USDC amount;
- recipient;
- final state.

---

# 34. VISUAL CAUSALITY REQUIREMENT

The UI must make the following chain obvious:

```text
WHAT DID THE USER AUTHORIZE?
        ↓
WHO DID THE AGENT CHOOSE?
        ↓
WHAT MONEY WAS COMMITTED?
        ↓
WHAT DID THE MACHINE EXECUTE?
        ↓
WHAT DID THE WITNESS OBSERVE?
        ↓
WHAT EVIDENCE EXISTS?
        ↓
WHAT DID XYX DECIDE?
        ↓
WHAT HAPPENED TO THE MONEY?
```

If a judge cannot answer those questions from the job page, the UI is not demo-ready.

---

# 35. SYSTEM STATUS PAGE

Show:

```text
Arc              HEALTHY / ...
USDC             HEALTHY / ...
Circle           HEALTHY / ...
ERC-8004         HEALTHY / ...
ERC-8183         HEALTHY / ...
The Graph        HEALTHY / ...
IPFS             HEALTHY / ...
EvidenceRegistry HEALTHY / ...
Evaluator        HEALTHY / ...
```

No secrets.

---

# 36. INTEGRATE PAGE

The integration page is developer-facing.

It MUST expose:

- Arc chain ID;
- contract addresses;
- API base URL if public;
- subgraph endpoint/reference;
- sample create-job flow;
- sample query-verdict flow;
- evidence verification concept;
- settlement semantics.

Do not expose private credentials.

---

# 37. LIVE DEPLOYMENT REQUIREMENTS

## 37.1 Arc

Required:

- `XYXEvidenceRegistry` deployed;
- `XYXEvaluator` deployed;
- contract code verified/readable;
- tx hashes stored.

---

## 37.2 Wallets

Required separate identities:

- human authorization wallet;
- Circle machine wallet;
- Witness wallet;
- Evaluator wallet;
- Relayer wallet.

Witness/Evaluator/Relayer MUST remain distinct.

---

## 37.3 Funding

Required:

- enough testnet native balance for gas;
- enough testnet USDC for demo jobs;
- balances verified before demo.

---

# 38. DEPLOYMENT MANIFEST

Create:

```text
deployments/arc-testnet.json
```

Required public fields:

```json
{
  "network": "arc-testnet",
  "chainId": 5042002,
  "commit": "...",
  "contracts": {
    "xyxEvidenceRegistry": "...",
    "xyxEvaluator": "...",
    "erc8183": "..."
  },
  "tokens": {
    "usdc": {
      "address": "...",
      "decimals": 6
    }
  },
  "graph": {
    "endpoint": "..."
  },
  "deployments": []
}
```

Only include fields known and verified at deployment time.

---

# 39. VERIFY:LIVE

Command:

```bash
npm run verify:live
```

Required checks:

1. Arc RPC reachable.
2. Chain ID correct.
3. USDC config correct.
4. EvidenceRegistry bytecode exists.
5. Evaluator bytecode exists.
6. ERC-8183 reachable.
7. ERC-8004 reachable.
8. Circle machine wallet configured.
9. wallet balances sufficient.
10. Witness key available.
11. Evaluator key available.
12. Relayer key available.
13. key separation valid.
14. IPFS write/read works.
15. Graph endpoint reachable.
16. Graph indexing freshness acceptable.

Output states:

```text
PASS
CONFIGURATION_REQUIRED
UNAVAILABLE
INVALID
```

---

# 40. OBSERVABILITY

## 40.1 Structured Logging

Each lifecycle operation SHOULD include:

- correlation ID;
- job ID;
- operation ID;
- chain;
- tx hash if known;
- component;
- state transition;
- error class.

Never log:

- private keys;
- raw secrets;
- bearer tokens;
- sensitive credential payloads.

---

## 40.2 Metrics

Recommended:

```text
xyx_jobs_created_total
xyx_jobs_funded_total
xyx_jobs_accepted_total
xyx_jobs_rejected_total
xyx_jobs_fail_closed_total
xyx_execution_latency_seconds
xyx_evidence_latency_seconds
xyx_evaluation_latency_seconds
xyx_settlement_latency_seconds
xyx_graph_lag_blocks
xyx_reconciliation_required_total
xyx_duplicate_operation_blocked_total
```

Metrics are RECOMMENDED unless already supported.

---

# 41. SECURITY THREAT MODEL

## 41.1 Agent Lies About Completion

Threat:
Agent claims success without satisfying the task.

Mitigation:
Independent Witness + chain observation + evidence + evaluator.

---

## 41.2 API Forges Evidence

Threat:
API signs its own evidence.

Mitigation:
Trust boundary prohibits API evidence signing.

---

## 41.3 Buyer Agent Self-Verifies

Threat:
Buyer Agent selects a provider and then certifies its own outcome.

Mitigation:
Buyer Agent cannot sign Witness evidence.

---

## 41.4 Witness/Evaluator Key Collusion by Configuration

Threat:
Same key controls multiple trust boundaries.

Mitigation:
Constructor/config key separation check.

---

## 41.5 IPFS Content Substitution

Threat:
CID/content differs from expected canonical evidence.

Mitigation:
IPFS readback + hash/content verification.

---

## 41.6 Replay Across Chains

Threat:
A valid signature is reused on another chain.

Mitigation:
EIP-712 chain ID domain separation.

---

## 41.7 Replay Across Contracts

Threat:
A signature is reused against a different contract.

Mitigation:
EIP-712 verifying contract domain separation.

---

## 41.8 Stale Graph Data

Threat:
Evaluator accepts based on stale or wrong indexed state.

Mitigation:
block verification + freshness check + fail closed.

---

## 41.9 Duplicate Funding

Threat:
Retry funds job twice.

Mitigation:
operation journal + advisory lock + idempotency.

---

## 41.10 Crash After Broadcast

Threat:
Service crashes after broadcasting but before persistence.

Mitigation:
reconciliation flow.

---

# 42. FAILURE SEMANTICS

Critical principle:

> **Ambiguity must not become ACCEPT.**

Required mapping:

| Failure | Expected outcome |
|---|---|
| Arc RPC unavailable | fail closed |
| Graph unavailable | fail closed |
| Graph stale beyond threshold | fail closed |
| IPFS write failure | fail closed |
| IPFS readback mismatch | reject evidence |
| Witness signature invalid | reject evidence |
| EIP-712 domain wrong | reject evidence |
| ERC-8004 identity unavailable when required | fail closed |
| Evaluator unavailable | no settlement success |
| Circle tx failed | execution failure |
| Duplicate fund | blocked/idempotent |
| Duplicate submit | blocked/idempotent |
| Crash after broadcast | reconciliation |

---

# 43. TEST STRATEGY

## 43.1 Existing Baseline

Must preserve:

- 128 Node tests passing;
- 24 Solidity tests passing;
- typecheck clean.

---

## 43.2 New Test Categories

Required:

### Live Arc integration
- deploy/read contracts;
- real USDC operations;
- real tx confirmation.

### Live Graph
- event indexed;
- job query;
- receipt query;
- block verification.

### Live IPFS
- canonical write;
- readback;
- mismatch test.

### Live ERC-8004
- identity resolution;
- validation retrieval.

### Live ERC-8183
- full lifecycle.

### Circle
- machine wallet execution.

### E2E success
- ACCEPT and settlement.

### E2E reject
- invalid execution and no successful settlement.

### Fail-closed
- unavailable critical dependency.

### Recovery
- crash/reconciliation.

---

# 44. E2E SUCCESS TEST

Required sequence:

```text
human creates intent
→ Buyer Agent selects provider
→ protected job created
→ budget configured
→ USDC approved
→ job funded
→ agent executes
→ Arc tx confirmed
→ Witness observes
→ evidence canonicalized
→ evidence written/read from IPFS
→ Witness signature verified
→ evidence registered
→ Graph indexes
→ evaluator consumes live evidence/history
→ ACCEPT
→ resolve
→ settlement success
```

The test fails if a critical step uses a mock.

---

# 45. E2E REJECT TEST

Required sequence:

```text
human creates job
→ protected job funded
→ agent executes an intentionally invalid action
→ agent claims completion
→ Witness detects objective mismatch
→ evidence preserved
→ evaluator consumes evidence
→ REJECT
→ no successful settlement
```

---

# 46. E2E FAIL-CLOSED TEST

Required example:

```text
valid-looking agent claim
→ critical evidence unavailable
→ Graph/IPFS/signature cannot be verified
→ evaluator cannot establish acceptable evidence
→ no successful settlement
```

---

# 47. DEMO SCRIPT — 90 SECOND VERSION

## 0–10 sec — Problem

Show job screen.

Narration:

> “Autonomous agents can hold wallets and execute paid jobs. The problem is that an agent saying ‘I finished’ is not enough to release money.”

---

## 10–25 sec — Intent and Selection

Show:

- user intent;
- Buyer Agent;
- provider selection;
- ERC-8004 identity;
- Graph/Risk signal.

Narration:

> “XYX’s Buyer Agent selects a provider using identity, historical evidence, and risk signals.”

---

## 25–40 sec — Protected Job

Show:

- USDC budget;
- ERC-8183 protected job;
- funded state.

Narration:

> “The job is funded with USDC under a protected lifecycle.”

---

## 40–55 sec — Machine Execution

Show:

- Circle machine wallet;
- live Arc tx.

Narration:

> “The agent executes autonomously through a machine wallet on Arc.”

---

## 55–70 sec — Evidence

Show:

- Witness;
- expected vs observed;
- IPFS CID;
- EIP-712 verified;
- evidence registry.

Narration:

> “An independent Witness observes what actually happened and produces signed evidence.”

---

## 70–82 sec — Evaluation

Show:

- Graph;
- Risk Engine;
- ACCEPT.

Narration:

> “XYX evaluates the evidence and historical context.”

---

## 82–90 sec — Settlement

Show:

- ERC-8183 resolve;
- USDC settled.

Narration:

> “Only after the evidence is accepted does the job settle.”

Then quickly show reject job:

```text
INVALID EXECUTION → REJECT → NO SUCCESSFUL SETTLEMENT
```

---

# 48. DEMO DATA REQUIREMENTS

Before recording:

- at least two funded test jobs;
- one success candidate;
- one intentional reject candidate;
- sufficient USDC;
- all live dependencies healthy;
- tx explorers ready;
- IPFS CIDs available;
- Graph endpoint warm;
- wallet balances verified.

---

# 49. FRONTEND DEMO STATES

The job page MUST support displaying:

```text
CREATING
SELECTING_PROVIDER
PROVIDER_SELECTED
FUNDING
FUNDED
EXECUTING
EXECUTED
EVIDENCE_PENDING
EVIDENCE_VERIFIED
EVALUATING
ACCEPTED
REJECTED
RESOLVING
RESOLVED
RECONCILIATION_REQUIRED
DEPENDENCY_UNAVAILABLE
```

Exact backend state names may differ.

---

# 50. PRODUCT COPY GUIDELINES

Preferred:

> Evidence-backed settlement for autonomous agent jobs.

Preferred:

> Verify execution before settlement.

Preferred:

> What did the agent actually do?

Avoid:

> decentralized AI court

Avoid:

> AI jury

Avoid:

> AI leaderboard

Avoid:

> next-generation omnichain trust super-protocol

---

# 51. GRAPH INTELLIGENCE — P1

Graph Intelligence is valuable but MUST NOT block live E2E P0.

Planned package:

```text
packages/graph-intelligence/
  client.ts
  queries.ts
  evidence-context.ts
  explanation.ts
  guardrails.ts
  index.ts
```

Purpose:

- explain historical evidence;
- answer investigation questions;
- normalize evidence context;
- expose read-only AI-readable reasoning.

It MUST NOT:

- mutate settlement;
- override evaluator;
- create evidence;
- silently invent missing provenance.

---

# 52. GRAPH SKILL — P1

Create:

```text
skills/xyx-graph/SKILL.md
```

Document:

- entities;
- queries;
- provenance;
- semantic limits;
- examples;
- failure behavior.

---

# 53. DEVELOPER INTEGRATION SURFACE — P1

Inspiration principle:

> **Complex internals, minimal integration surface.**

Do not copy another product’s feature set.

The goal is to make XYX easy to integrate.

---

## 53.1 Desired DX

Conceptual:

```bash
npm install @xyx/sdk
```

Then:

```ts
const xyx = new XYX(config)

const job = await xyx.createProtectedJob({
  ...
})

const evaluation = await xyx.getEvaluation(job.id)
```

This is a target interface, not proof of current implementation.

---

## 53.2 SDK Responsibilities

Potentially wrap:

- job creation;
- funding;
- evidence query;
- evaluation query;
- settlement readiness;
- live deployment metadata.

The SDK MUST NOT duplicate Risk Engine logic client-side.

---

# 54. SUBSTREAMS — P1 / NON-BLOCKING

Current feasibility is not verified.

Therefore:

- do not place Substreams in P0;
- do not block Arc demo on Firehose availability;
- only build isolated package if feasibility is proven.

Potential package:

```text
packages/substreams-agent-commerce/
```

---

# 55. IMPLEMENTATION MILESTONES

# M0 — CORE FREEZE

**Status:** VERIFIED / DONE

Deliverables:
- preserve current architecture;
- preserve current tests;
- no architecture expansion.

Gate:
```text
128 Node tests pass
24 Solidity tests pass
typecheck clean
```

---

# M1 — LIVE ARC + CONFIGURATION

**Priority:** P0-CRITICAL

Deliverables:
- deploy both XYX contracts;
- configure Arc;
- configure USDC;
- configure/fund wallets;
- configure ERC-8004;
- configure ERC-8183;
- configure IPFS;
- doctor passes.

Gate:
```text
real contract addresses
real wallet balances
real Arc tx
```

---

# M2 — LIVE GRAPH

**Priority:** P0-CRITICAL

Deliverables:
- deploy subgraph;
- index Arc;
- verify entities;
- block freshness;
- fail-closed Graph client.

Gate:
```text
real Arc event
→ real Graph query
```

---

# M3 — LIVE BUYER AGENT

**Priority:** P0

Deliverable:
```text
real intent
→ real provider selection
```

Inputs must include live:

- ERC-8004;
- Graph;
- Risk.

---

# M4 — LIVE PROTECTED JOB

**Priority:** P0

Deliver:

```text
create
→ budget
→ approve
→ fund
```

with real USDC.

Gate:
funded real job.

---

# M5 — MACHINE EXECUTION

**Priority:** P0

Deliver:
Circle machine wallet executes real Arc action.

Gate:
real tx linked to job.

---

# M6 — LIVE WITNESS EVIDENCE

**Priority:** P0

Deliver:

```text
Arc tx
→ Witness
→ canonical evidence
→ IPFS
→ readback
→ EIP-712
→ Registry
```

Gate:
independently verifiable evidence record.

---

# M7 — LIVE GRAPH → RISK → EVALUATOR

**Priority:** P0

Deliver:
real evidence/history results in deterministic verdict.

Gate:
ACCEPT for valid execution.

---

# M8 — LIVE RESOLUTION

**Priority:** P0

Deliver:
ACCEPT drives ERC-8183 resolution.

Gate:
successful settlement.

---

# M9 — LIVE REJECT PATH

**Priority:** P0-MANDATORY

Deliver:
intentional invalid execution.

Gate:
REJECT and no successful settlement.

---

# M10 — FRONTEND E2E

**Priority:** P0

Deliver:
user can demonstrate all critical stages from UI.

Gate:
no terminal required for main lifecycle.

---

# M11 — VERIFY:LIVE

**Priority:** P0

Deliver:
single live environment verification command.

Gate:
PASS output for demo environment.

---

# M12 — DEPLOYMENT MANIFEST

**Priority:** P0

Deliver:
public deployment metadata.

Gate:
every demo chain claim can be externally inspected.

---

# M13 — RELIABILITY / SECURITY GATE

**Priority:** P0

Deliver:
failure matrix tested.

Gate:
no duplicate economic action + fail-closed critical paths.

---

# M14 — GRAPH INTELLIGENCE

**Priority:** P1

Only after P0 E2E works.

---

# M15 — DEVELOPER SDK / INTEGRATION POLISH

**Priority:** P1

Only after live proof works.

---

# M16 — DEMO + SUBMISSION

**Priority:** FINAL

Deliver:
- live demo;
- success path;
- reject path;
- README;
- architecture;
- public proof;
- video.

---

# 56. IMPLEMENTATION ORDER

Strict priority:

```text
1. Freeze core
2. Arc contracts live
3. Wallets/USDC live
4. IPFS live
5. Graph live
6. ERC-8004 live
7. ERC-8183 live
8. Buyer Agent on live data
9. Protected Job live
10. Circle machine execution
11. Witness live evidence
12. EvidenceRegistry live
13. Graph indexes evidence
14. Risk Engine consumes live evidence
15. XYXEvaluator verdict
16. ERC-8183 resolution
17. Success settlement
18. Reject path
19. Frontend
20. verify:live
21. public manifest
22. reliability/security
23. Graph Intelligence
24. SDK/integration polish
25. demo recording
```

---

# 57. FILES EXPECTED TO CHANGE

Existing maturity plan already anticipates:

```text
packages/graph-intelligence/src/client.ts
packages/graph-intelligence/src/queries.ts
packages/graph-intelligence/src/evidence-context.ts
packages/graph-intelligence/src/explanation.ts
packages/graph-intelligence/src/guardrails.ts
packages/graph-intelligence/src/index.ts
skills/xyx-graph/SKILL.md
scripts/verify-live.ts
deployments/arc-testnet.json
docs/ARC_MAINNET_READINESS.md
docs/ETHONLINE_PRIZE_ALIGNMENT.md
XYX_MATURITY_REPORT.md
package.json
```

This PRD additionally expects implementation work in existing:

- frontend job flows;
- deployment/config;
- live Graph;
- Circle execution integration;
- E2E tests.

Exact filenames should be discovered from the repository before modification.

---

# 58. ENVIRONMENT CONFIGURATION CHECKLIST

Exact environment variable names should follow existing code.

Semantic configuration required:

```text
ARC_RPC_URL
ARC_CHAIN_ID
ARC_USDC_ADDRESS

XYX_EVIDENCE_REGISTRY_ADDRESS
XYX_EVALUATOR_ADDRESS
ERC8004_ADDRESS / reference
ERC8183_ADDRESS

CIRCLE credentials/config
CIRCLE machine wallet

WITNESS signer
EVALUATOR signer
RELAYER signer

IPFS endpoint/token
GRAPH endpoint

PRIVY configuration
```

Do not rename existing variables merely to match this document.

---

# 59. DEMO READINESS CHECKLIST

## Infrastructure
- [ ] Arc RPC healthy
- [ ] USDC configured
- [ ] contracts deployed
- [ ] contracts readable
- [ ] machine wallet funded
- [ ] human wallet funded
- [ ] Witness funded if gas needed
- [ ] Evaluator funded if gas needed
- [ ] Relayer funded if gas needed
- [ ] ERC-8004 live
- [ ] ERC-8183 live
- [ ] IPFS live
- [ ] Graph live

## Success path
- [ ] Buyer selects provider
- [ ] job created
- [ ] budget set
- [ ] approved
- [ ] funded
- [ ] machine executes
- [ ] Witness captures
- [ ] IPFS verified
- [ ] evidence registered
- [ ] Graph indexed
- [ ] evaluator ACCEPT
- [ ] resolve
- [ ] USDC settlement

## Reject path
- [ ] invalid execution generated
- [ ] Witness detects mismatch
- [ ] evidence preserved
- [ ] evaluator REJECT
- [ ] no successful settlement

## Product
- [ ] hero page works
- [ ] explorer links work
- [ ] CID links work
- [ ] job state updates
- [ ] no secret shown
- [ ] no critical terminal step

---

# 60. ACCEPTANCE CRITERIA — SYSTEM LEVEL

XYX is P0-complete only if all are true:

1. Arc contracts are live.
2. Real USDC protected job exists.
3. Buyer Agent uses live identity/history.
4. Machine execution uses Circle.
5. Execution lands on Arc.
6. Witness independently observes it.
7. Evidence is canonical.
8. Evidence survives IPFS readback.
9. Witness signature verifies.
10. Evidence is anchored/registered.
11. Graph indexes relevant state.
12. Risk Engine consumes live evidence.
13. XYXEvaluator produces correct verdict.
14. ERC-8183 resolution follows verdict.
15. Success path settles.
16. Reject path does not settle successfully.
17. Missing critical evidence fails closed.
18. Duplicate economic actions are prevented.
19. UI displays full provenance.
20. Public deployment metadata exists.
21. Existing test baseline does not regress.

---

# 61. DEFINITION OF DONE

The ETHOnline build is **DONE** when a reviewer can:

1. open XYX;
2. create or authorize a paid autonomous-agent job;
3. see the Buyer Agent choose a provider from real identity/history/risk signals;
4. see USDC committed to a protected job;
5. see a Circle-controlled machine wallet execute on Arc;
6. inspect the Arc transaction;
7. inspect independently produced Witness evidence;
8. inspect IPFS evidence;
9. verify signature/provenance;
10. see The Graph indexed state;
11. see XYX evaluation;
12. see final ERC-8183 outcome;
13. verify settlement;
14. inspect an intentionally invalid job;
15. see that invalid evidence produces REJECT;
16. see that successful settlement does not occur on the invalid path.

No critical step may be replaced by:

- a fixture;
- a manually typed “PASS”;
- a frontend-only fake;
- an LLM-only judgment;
- a manual override performed only for the demo.

---

# 62. NORTH-STAR DEMO CLAIM

The product should be able to truthfully claim:

> **“An autonomous agent accepted a paid job, executed through a machine wallet on Arc, produced independently verifiable evidence, and was only settled after XYX accepted that evidence.”**

And for the negative path:

> **“When the agent’s execution violated the job requirements, XYX preserved the evidence, rejected the outcome, and prevented successful settlement.”**

---

# 63. P0 OUT OF SCOPE

Explicitly out of scope for current ETHOnline P0:

- BFT jury;
- VRF juror selection;
- Chainlink;
- DAO;
- XYX token;
- custom slashing economy;
- generalized disputes;
- subjective LLM arbitration;
- ENS;
- ZK;
- custom escrow;
- custom identity protocol;
- custom reputation protocol;
- production multi-chain;
- Substreams as blocker;
- enterprise policy engine;
- broad plugin ecosystem.

---

# 64. P1 / POST-HACKATHON BACKLOG

After live E2E P0:

- Graph Intelligence;
- Graph SKILL;
- SDK;
- better integration docs;
- external developer quickstart;
- richer provider discovery;
- generalized machine-verifiable job templates;
- more settlement adapters;
- richer audit UI;
- operational dashboards;
- mainnet readiness;
- multi-chain feasibility;
- Substreams if Arc support is verified.

---

# 65. FINAL ENGINEERING PRINCIPLE

Every new proposed feature must answer:

> **Does this directly improve the live chain from human intent to evidence-backed settlement?**

If not:

> **Do not let it delay the vertical slice.**

The current XYX codebase already has substantial internal architecture and test coverage.

The next maturity step is not adding more theoretical components.

The next maturity step is:

> **turn every tested boundary into a real, observable, externally verifiable live boundary.**

---

# 66. FINAL PRODUCT SENTENCE

> **XYX verifies what autonomous agents actually did before paid jobs settle onchain.**

