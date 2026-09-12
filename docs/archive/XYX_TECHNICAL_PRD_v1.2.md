# XYX — End-to-End Technical Product Requirements Document

**Version:** 1.2
**Status:** FORWARD IMPLEMENTATION REFERENCE
**Date:** 2026-09-12
**Repository:** `/home/pupulion/xyx_eth_online`
**Audience:** Founder, Smart Contract Engineer, Backend Engineer, Agent Engineer, Frontend Engineer, DevOps/SRE, Security Reviewer, Hackathon Judge
**Scope:** ETHOnline 2026 — production-like live testnet vertical slice
**Primary chain:** Arc Testnet
**Primary settlement asset:** USDC
**Primary implementation goal:** Deliver one complete, live, evidence-backed autonomous-agent job lifecycle from human intent to final settlement, including both ACCEPT and REJECT paths.

---

## Revision Note

v1.2 supersedes v1.1 for forward implementation guidance. v1.1 remains preserved as the historical specification that led to the current implementation. v1.2 clarifies mode-specific execution and evidence semantics discovered during live Arc Testnet integration. It does not retroactively alter historical test results, transactions, evidence, or session reports.

Key changes from v1.1:
- Two distinct economic modes are explicitly defined and separated: Open Purchase and Protected Job.
- M5 is type-aware: machine-action jobs require post-funding Arc execution; deliverable jobs do not.
- Evidence paths are mode-specific: Open Purchase uses XYXEvidenceRegistry ReceiptAttestation; Protected Job uses XYXEvaluator JobVerdict + IPFS.
- Graph/Risk boundaries are explicit: load-bearing at provider selection, not re-executed during Protected Job final settlement.
- M6 and M8 are sequentially distinct for Protected Job: M6 establishes signed evidence ready; M8 performs onchain resolution and settlement.
- M9 requires a separate job from the success-path job.

---

# 0. DOCUMENT AUTHORITY

## 0.1 Purpose

This document is the **forward implementation reference** for the current XYX ETHOnline build.

It defines:

- the product thesis;
- what XYX is and is not;
- target user and target integration surface;
- frozen architecture constraints;
- verified current implementation baseline;
- mode-specific north-star E2E flows;
- component responsibilities;
- system states;
- data contracts;
- evidence requirements by mode;
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

# 1. AUTHORITY ORDER

1. Frozen invariants (Section 6).
2. Verified live deployment/runtime facts (Section 43).
3. This PRD v1.2.
4. Implementation backlog.

Historical documents and session reports do not override verified current live facts.

---

# 2. PRODUCT THESIS

XYX provides evidence-backed settlement for autonomous agent jobs.

The core question:

> **Did the agent satisfy the machine-verifiable requirements of this paid job strongly enough for settlement to proceed?**

XYX is not primarily responsible for generating the task, deciding what AI model is best, or becoming a generic judge of subjective AI quality.

---

# 3. PROBLEM STATEMENT

## 3.1 The Agentic Economic Problem

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

## 3.2 Why Blockchain Alone Is Not Enough

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
- Did it satisfy the job's acceptance conditions?
- Was the evidence independently produced?
- Is the evidence internally consistent?
- Is the provider identity valid?
- Does historical evidence raise or lower confidence?
- Is the current evidence sufficient to finalize payment?

XYX combines those signals into an accountable verdict.

---

# 4. TARGET MARKET AND INTEGRATION USER

## 4.1 Primary Target

> **Developers and protocols building paid autonomous-agent workflows where settlement depends on the outcome of the agent's work.**

Examples:

- autonomous agent marketplaces;
- paid agent job protocols;
- agent-to-agent commerce;
- autonomous purchasing systems;
- machine-wallet execution platforms;
- service protocols where an agent hires another provider.

## 4.2 Primary Integration User

The primary integration user is not the ordinary end-user.

It is:

> **the engineer who needs a protected agent-job lifecycle with evidence-backed settlement.**

Their job-to-be-done:

> "I want my agent to autonomously execute a paid task, but I do not want successful settlement to depend only on the agent saying it succeeded."

## 4.3 Secondary Beneficiaries

- end users authorizing autonomous activity;
- agent providers;
- protocol operators;
- agent marketplaces;
- auditors;
- reputation systems consuming outcomes;
- indexers and data consumers.

---

# 5. PRODUCT POSITIONING

## 5.1 XYX Is

- agent-job accountability infrastructure;
- evidence-backed evaluation infrastructure;
- protected settlement coordination;
- trust infrastructure around economic agent execution.

## 5.2 XYX Is Not

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

# 6. FROZEN ARCHITECTURE INVARIANTS

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

   No new custom contract. No custom escrow. ERC-8183 owns Protected Job escrow.

3. Evidence trust model remains:
   - canonical JSON;
   - IPFS readback;
   - EIP-712 signing.

4. Trust boundaries:
   - API MUST NOT sign Witness evidence;
   - Buyer Agent MUST NOT sign Witness evidence.

5. Signer separation remains 4-way:
   - Witness signer (`WITNESS_PRIVATE_KEY`);
   - Evaluator signer (`EVALUATOR_PRIVATE_KEY`);
   - Relayer (`RELAYER_PRIVATE_KEY`);
   - Circle machine wallet (`CIRCLE_API_KEY` + `CIRCLE_ENTITY_SECRET`).

   Witness signer != Evaluator signer != Relayer != Circle machine wallet.

6. ERC integration semantics remain:
   - ERC-8004 for provider identity;
   - ERC-8183 for Protected Job lifecycle.

7. Arc Testnet remains:
   - primary settlement environment;
   - primary finality environment for ETHOnline.

8. Circle Agent Stack remains:
   - machine execution environment for Open Purchase payments.

9. The Graph remains:
   - indexed memory;
   - load-bearing decision input;
   - fail-closed;
   - block-hash verification aware.

10. Privy remains:
    - human authorization layer.

11. XYX MUST NOT add for P0:
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

# 7. MODE MODEL

## 7.1 Open Purchase (Mode A)

### Purpose

Machine-mediated procurement of HTTP-delivered services with immediate x402 payment settlement.

### Economic Action

Buyer Agent discovers provider via Circle registry, pays via Circle x402 protocol, receives HTTP response. Settlement is payment-gated: Circle x402 payment triggers service delivery, and the Witness observes the observed settlement and HTTP result.

### Evidence Model

Witness independently observes the full HTTP execution and x402 settlement transaction. Builds canonical evidence bundle with HTTP request/response hashes, payment reference, latency, status, and outcome. Persists to IPFS with readback verification. Signs EIP-712 ReceiptAttestation. Anchors on XYXEvidenceRegistry.

### Registry Role

XYXEvidenceRegistry is the mandatory, load-bearing receipt anchor for Open Purchase. ReceiptAnchored events provide independent on-chain proof that a specific Witness attested to a specific payment+service outcome at a specific time. The Graph indexes Receipt entities for historical trust/risk assessment.

### Graph/Risk Role

Graph provides historical receipt data for the provider's endpoint. Risk Engine computes trust score from Wilson confidence, address diversity, and validation scores. Graph/Risk is used at provider SELECTION time AND provides feedback that improves future selection. If Graph is unavailable or stale during selection: FAIL_CLOSED.

### Settlement

Settlement is immediate via Circle x402. USDC transfers from the Circle machine buyer wallet to the provider upon successful HTTP delivery. No escrow, no deferred settlement.

### Open Purchase Flow

```text
human intent
→ Buyer Agent discovery
→ ERC-8004 identity
→ The Graph history
→ Risk Engine
→ provider selection
→ Circle/x402 machine payment
→ Witness independently observes HTTP + settlement
→ canonical evidence
→ IPFS write/readback
→ EIP-712 ReceiptAttestation
→ XYXEvidenceRegistry.anchorReceipt()
→ The Graph indexes Receipt
→ feedback/history improves future selection
```

---

## 7.2 Protected Job (Mode B)

### Purpose

Structured, escrow-backed procurement of machine-verifiable deliverables with deferred settlement through evaluator verdict.

### Economic Action

Buyer creates job on ERC-8183 with committed budget and acceptance criteria. Provider sets budget, buyer approves and funds USDC escrow. Provider performs work and submits deliverable commitment (hash). Witness verifies deliverable against committed criteria. Evaluator signs JobVerdict. XYXEvaluator executes verdict → ERC-8183 complete (provider receives escrow) or reject (buyer receives refund).

### Execution Classes

Protected Jobs are classified by execution type at creation time.

#### Machine-Action Job

Definition: The job requires a meaningful machine-controlled on-chain action post-funding.

Requirements:
- Circle machine wallet executes the required Arc transaction;
- transaction is semantically linked to the job requirement;
- transaction is objectively verifiable on-chain;
- transaction is causally traceable to the funded job.

Examples:
- Contract call executing a protocol action;
- token operation tied to job spec;
- state change verifiable on-chain.

Forbidden:
- Dummy calls to unrelated contracts;
- self-transfers;
- duplicate provider payments;
- zero-value calls with no semantic content.

#### Deliverable Job

Definition: The provider produces an objectively machine-verifiable deliverable.

Requirements:
- Provider performs specified work at service endpoint;
- provider submits deliverable commitment (hash) on-chain;
- deliverable is machine-verifiable against committed acceptance criteria;
- no post-funding Circle Arc transaction required.

Examples:
- Structured JSON output;
- deterministic transformation;
- signed result;
- artifact hash.

Economic Arc actions remain:
create → approve → fund → complete/reject.

### Job Type Declaration

New Protected Jobs MUST declare `executionClass` in their specification once the schema supports it. This determines whether M5 machine execution is required and what verification steps the Witness performs.

Existing v1.1 jobs that lack `executionClass` MAY be classified from their immutable committed specification when:
- classification is unambiguous from the specification text; and
- classification does not change `canonicalJobSpec()` or `specificationHash`.

Classification is metadata/interpretation only. It MUST NOT:
- change `canonicalJobSpec()`;
- change `specificationHash`;
- rewrite ERC-8183 description;
- add execution parameters retroactively.

### Evidence Model

Witness reads canonical job specification, on-chain ERC-8183 job state, provider submission transaction, and deliverable from IPFS. Performs deterministic exact-json comparison (or other machine-verifiable criterion). Builds canonical Protected Job evidence bundle containing: jobId, chainId, ERC-8183 address, buyer, provider, evaluator, specification hash, deliverable hash, submission tx reference, observed deliverable, deterministic decision context, IPFS URI/hash. Persists to IPFS with readback verification. evidenceHash is included in JobVerdict.

### Registry Role

XYXEvidenceRegistry ReceiptAttestation is NOT used for Protected Job. The deployed ReceiptAttestation schema is designed for Open Purchase HTTP observations and is semantically incompatible with Protected Job evidence (paymentHash mandatory non-zero with no truthful value, HTTP-specific fields unobservable). Protected Job evidence commitment flows through XYXEvaluator JobVerdict evidenceHash + IPFS.

### Graph/Risk Role

Graph provides ERC-8004 identity validation records and endpoint receipt history. Risk Engine computes provider trust for selection. Graph/Risk is used at provider SELECTION time. For final Protected Job settlement, the deterministic exact-json evaluation is the sole acceptance criterion. Graph/Risk is NOT re-executed during resolveJob unless the job policy explicitly requires it. If Graph is unavailable or stale during selection: FAIL_CLOSED.

### Evaluator Role

XYXEvaluator verifies Evaluator JobVerdict signer ATTESTOR_ROLE, nonce replay protection, verdict digest, and decision validity. Calls agenticCommerce.complete() or reject() based on decision. evidenceHash in JobVerdict commits to the canonical Protected Job evidence bundle on IPFS.

The Evaluator signer (`EVALUATOR_PRIVATE_KEY`) is a separate trust identity from the Witness signer (`WITNESS_PRIVATE_KEY`).

### Settlement

Deferred through ERC-8183 escrow. Provider receives USDC only on COMPLETE. Buyer receives refund only on REJECT. No intermediate settlement. Witness, Evaluator, and Relayer signers are separate from buyer, provider, and each other.

### Protected Job Flow

```text
human intent
→ Buyer Agent / provider selection
→ ERC-8183 createJob
→ provider setBudget
→ buyer USDC approve
→ buyer fund escrow
→ provider performs required work
→ provider submits deliverable commitment
→ Witness / verification layer verifies canonical deliverable evidence
→ IPFS write/readback
→ deterministic job evaluation
→ evaluator signs JobVerdict
→ XYXEvaluator verifies verdict
→ ERC-8183 complete/reject
→ USDC settlement/refund
→ The Graph indexes job outcome
```

---

# 8. MODE COMPARISON

| Dimension | Open Purchase | Protected Job |
|---|---|---|
| Settlement | Immediate (Circle x402) | Deferred (ERC-8183 escrow) |
| Payment | Circle machine buyer wallet → provider | Buyer → ERC-8183 escrow → provider (on COMPLETE) |
| Evidence Registry | XYXEvidenceRegistry ReceiptAttestation | XYXEvaluator JobVerdict + IPFS |
| Witness observation | HTTP execution + settlement | Job state + deliverable + IPFS readback |
| HTTP fields | requestHash, responseHash, httpStatus, latencyMs | N/A (no HTTP observation) |
| Evaluation | Outcome classification (0-8) | Deterministic exact-json comparison |
| Settlement trigger | x402 payment confirmation | JobVerdict decision (COMPLETE/REJECT) |
| Graph/Risk timing | Selection + feedback | Selection only |
| M5 requirement | Not applicable (payment is execution) | Type-dependent (machine-action vs deliverable) |

---

# 9. NORTH-STAR SYSTEM FLOW

## 9.1 Open Purchase North-Star Flow

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
│ Circle Machine     │
│ x402 Payment       │
└─────────┬──────────┘
          │
          ▼
┌────────────────────┐
│ Arc Testnet        │
│ (x402 settlement)  │
└─────────┬──────────┘
          │
          ▼
┌────────────────────┐
│ Witness            │
└─────────┬──────────┘
          │
          ├── observe HTTP
          ├── classify outcome
          ├── canonicalize
          ├── IPFS write
          ├── IPFS readback
          └── EIP-712 sign ReceiptAttestation
          │
          ▼
┌────────────────────┐
│ Evidence Registry  │
│ (XYXEvidenceRegistry) │
└─────────┬──────────┘
          │
          ▼
┌────────────────────┐
│ The Graph          │
│ (indexes Receipt)  │
└─────────┬──────────┘
          │
          ▼
┌────────────────────┐
│ Settlement Outcome │
└────────────────────┘
```

## 9.2 Protected Job North-Star Flow

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
│ Provider Execution │
│ (service endpoint) │
└─────────┬──────────┘
          │
          ▼
┌────────────────────┐
│ Provider Submit    │
│ (deliverable hash) │
└─────────┬──────────┘
          │
          ▼
┌────────────────────┐
│ Witness            │
│ (Protected Job     │
│  verification)     │
└─────────┬──────────┘
          │
          ├── verify ERC-8183 state
          ├── confirm submission tx
          ├── read deliverable from IPFS
          ├── deterministic evaluation
          ├── canonicalize evidence
          ├── IPFS write/readback
          ├── derive evidenceHash
          ├── construct JobVerdict
          └── verify evaluator signature locally
          │
          ▼
┌────────────────────┐
│ XYXEvaluator       │
│ (resolveJob)       │
└─────────┬──────────┘
          │
          ├── verify ATTESTOR_ROLE
          ├── verify nonce
          ├── verify verdict digest
          └── agenticCommerce.complete() or .reject()
          │
          ▼
┌────────────────────┐
│ ERC-8183 Resolve   │
└─────────┬──────────┘
          │
          ▼
┌────────────────────┐
│ Settlement Outcome │
│ (provider receives  │
│  escrow OR buyer    │
│  receives refund)   │
└────────────────────┘
```

---

# 10. PRIMARY HERO DEMO

## 10.1 Demo Philosophy

The hero demo MUST prove:

1. autonomy;
2. economic commitment;
3. execution appropriate to job type;
4. independent evidence;
5. deterministic evaluation;
6. conditional settlement.

The hero demo MUST NOT depend on subjective LLM grading.

Acceptance criteria MUST be machine-verifiable.

---

## 10.2 Required Demo Type

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

The purpose is that the verifier can objectively compare:

```text
EXPECTED JOB
vs
ACTUAL EXECUTION
```

---

# 11. JOB REQUIREMENT MODEL

## 11.1 Requirement Properties

Every job requirement MUST contain:

- unique job identifier;
- provider identity;
- buyer identity;
- evaluator identity;
- budget ceiling;
- acceptance criterion (machine-verifiable);
- expiry.

## 11.2 Acceptance Criteria Formats

Supported formats:

- `exact-json-v1`: deterministic JSON comparison;
- future formats may be added without changing core architecture.

## 11.3 Acceptance Criteria Binding

The acceptance criterion is committed at job creation time and MUST NOT change during job execution.

Changes to acceptance criteria after funding MUST require a new job.

---

# 12. TWO ECONOMIC MODES

## 12.1 Mode Classification

XYX operates in two distinct economic modes. The mode is determined by the payment and settlement mechanism:

**Mode A — Open Purchase:**
- Immediate x402 HTTP payment via Circle Developer-Controlled Wallets SDK;
- Witness observes HTTP execution and settlement;
- Evidence anchored on XYXEvidenceRegistry;
- Settlement is payment-gated machine purchase with observed settlement and HTTP result.

**Mode B — Protected Job:**
- ERC-8183 escrow-backed with deferred settlement;
- No Witness HTTP observation;
- Evidence committed through XYXEvaluator JobVerdict + IPFS;
- Settlement via evaluator verdict → ERC-8183 complete/reject.

## 12.2 Mode Selection

Mode is determined by:
- Open Purchase: Buyer Agent discovers service via Circle registry, pays via x402;
- Protected Job: Buyer creates structured job on ERC-8183 with committed criteria.

The same provider may participate in both modes under different economic agreements.

## 12.3 Mode Invariants

Both modes share:
- canonical JSON evidence;
- IPFS persistence with readback;
- EIP-712 domain separation;
- deterministic, machine-verifiable evidence processing;
- fail-closed critical dependencies;
- 4-way signer separation.

Open Purchase uses deterministic Outcome classification from observed HTTP/payment facts.

Protected Job uses deterministic committed acceptance-criterion evaluation.

---

# 13. CIRCLE ADAPTER DUAL PATH

## 13.1 Open Purchase Path

`CircleAdapter.pay()` executes x402 HTTP payments via Circle CLI.

This path:
- discovers service via Circle registry;
- inspects payment terms;
- estimates price;
- executes x402 payment;
- captures HTTP observation and settlement transaction;
- returns observation to Witness for evidence construction.

`CircleAdapter.pay()` belongs exclusively to Open Purchase. It MUST NOT be inserted into Protected Job.

## 13.2 Protected Job Path

`CircleAdapter.execute()` submits contract execution transactions via Circle Developer-Controlled Wallets SDK.

This path:
- creates ERC-8183 job;
- approves USDC;
- funds escrow;
- (future) executes machine-action job Arc transactions.

For Deliverable Jobs, `CircleAdapter.execute()` is used only for M4 operations (create, approve, fund). No post-funding execution is required.

For Machine-Action Jobs, `CircleAdapter.execute()` may be used for the post-funding M5 Arc transaction.

---

# 14. WITNESS MODEL

## 14.1 Open Purchase Witness

Observes:
- HTTP execution;
- Circle/x402 settlement.

Produces:
- ReceiptAttestation;
- XYXEvidenceRegistry anchor.

## 14.2 Protected Job Verifier

Observes/verifies:
- ERC-8183 job state;
- provider submission;
- deliverable commitment;
- IPFS deliverable;
- machine-verifiable acceptance criteria.

Produces:
- canonical job evidence;
- JobVerdict (evaluator-signed).

Protected Job evidence is committed into XYXEvaluator evidenceHash.

Protected Job evidence MUST NOT be called "Witness-signed Receipt" or anything implying ReceiptAttestation.

---

# 15. EVIDENCE REQUIREMENTS

## 15.1 Common Evidence Requirements

Both modes require:
- canonical JSON serialization (stable key sort, no sparse arrays, no non-JSON values);
- cryptographic hash commitment (keccak256);
- IPFS persistence with readback verification (write → read → hash match → canonical match);
- EIP-712 domain separation (mode-specific domains);
- nonce replay protection;
- attestor role verification;
- timestamp validation;
- independent verifiability.

## 15.2 Open Purchase Evidence Fields

Required fields:
- version: `xyx-evidence-v1`
- providerKey: service identity provider hash
- endpointKey: service identity endpoint hash
- specHash: API specification hash
- payer: Circle machine buyer wallet address
- amountPaid: atomic USDC amount settled via x402
- paymentHash: x402 settlement transaction hash
- requestHash: HTTP request body hash
- responseHash: HTTP response body hash
- evidenceHash: IPFS bundle hash
- evidenceURIHash: IPFS URI hash
- latencyMs: HTTP round-trip latency
- httpStatus: HTTP response status code
- outcome: classified outcome (0-8 per Outcome enum)
- observedAt: Unix seconds of HTTP observation
- nonce: Witness nonce
- providerAgentRegistry: ERC-8004 registry address
- providerAgentId: ERC-8004 agent ID

On-chain commitment: ReceiptAttestation → XYXEvidenceRegistry.anchorReceipt() → ReceiptAnchored event.

## 15.3 Protected Job Evidence Fields

Required fields:
- version: `xyx-job-evidence-v1`
- mode: `"protected-job"`
- jobId: ERC-8183 job ID
- chainId: Arc Testnet chain ID
- commerce: ERC-8183 contract address
- buyer: job client address (economic payer)
- provider: provider address
- evaluator: XYXEvaluator address
- specificationHash: canonical job specification hash
- submissionTxHash: provider submission transaction hash
- deliverableURI: IPFS URI of deliverable
- deliverableHash: deliverable content hash
- evaluation: `{ decision, reason, reasonHash }` from evaluateDeliverable()
- observedAt: Unix seconds of evidence creation
- [optional] executionTxHash: M5 Arc transaction hash (machine-action jobs only)
- [optional] executionEvidence: M5 execution details (machine-action jobs only)

On-chain commitment: evidenceHash committed in JobVerdict → XYXEvaluator.resolveJob() → JobVerdictExecuted event.

---

# 16. EIP-712 REQUIREMENTS

## 16.1 Domain Separation

Evidence and verdict domains MUST include:
- Arc chain ID;
- relevant contract address.

Open Purchase domain:
- name: `XYX Evidence Registry`
- version: `1`
- chainId: 5042002
- verifyingContract: XYXEvidenceRegistry address

Protected Job domain:
- name: `XYX Evaluator`
- version: `1`
- chainId: 5042002
- verifyingContract: XYXEvaluator address

## 16.2 Signature Validation

Every signature must be independently recoverable/verifiable.

Invalid signature:
```text
REJECT EVIDENCE
```

Wrong chain/domain:
```text
REJECT EVIDENCE
```

---

# 17. XYXEVIDENCEREGISTRY REQUIREMENTS

## 17.1 Role

`XYXEvidenceRegistry.sol` is the onchain anchor for verified Open Purchase evidence references/commitments.

XYXEvidenceRegistry ReceiptAttestation is specific to Open Purchase.

XYXEvidenceRegistry is NOT used for Protected Job evidence.

## 17.2 Requirements

The Registry enables the system to prove at minimum:

- evidence exists;
- evidence is associated with expected Open Purchase execution context;
- evidence reference/hash is consistent;
- relevant event can be indexed by The Graph.

Do not expand the contract into a generalized storage system unless necessary.

---

# 18. XYXEVALUATOR REQUIREMENTS

## 18.1 Role

`XYXEvaluator.sol` represents the accountable evaluation boundary for Protected Job.

## 18.2 Verdict Semantics

Product-level verdicts:

```text
ACCEPT
REJECT
FAIL_CLOSED
```

`FAIL_CLOSED` may map to absence of a valid onchain approval rather than a literal enum if current contract semantics differ.

## 18.3 Evaluator Must Not

- accept without valid evidence;
- accept if evidence provenance is invalid;
- bypass deterministic evaluation with a demo-only hardcode;
- use the Witness signing identity.

The Evaluator signer (`EVALUATOR_PRIVATE_KEY`) is a separate trust identity from the Witness signer (`WITNESS_PRIVATE_KEY`).

---

# 19. SETTLEMENT REQUIREMENTS

## 19.1 Rule

Settlement MUST be causally linked to the evaluation result.

## 19.2 Open Purchase Success

```text
valid discovery
→ real Graph/Risk
→ real Circle/x402 payment
→ real Witness observation
→ valid canonical evidence
→ real IPFS
→ real ReceiptAttestation
→ real EvidenceRegistry anchor
→ real Graph indexing
```

## 19.3 Protected Job Success

```text
valid provider selection
→ real ERC-8183 job
→ real budget
→ real USDC escrow
→ real execution appropriate to job type
→ real submit
→ real canonical evidence
→ real IPFS readback
→ real deterministic evaluation
→ real JobVerdict
→ real XYXEvaluator
→ real ERC-8183 complete
→ real provider USDC balance increase proof
```

## 19.4 Protected Job Reject

```text
execution/deliverable objectively fails committed criteria
→ evidence preserved
→ deterministic REJECT
→ JobVerdict decision = 2
→ agenticCommerce.reject()
→ no successful provider settlement
→ buyer receives refund or escrow release
```

## 19.5 Fail Closed

```text
critical required dependency cannot establish trustworthy state
→ no settlement verdict submitted
```

---

# 20. IDEMPOTENCY REQUIREMENTS

Every state-changing economic route MUST define an idempotency behavior.

Minimum matrix:

| Operation | Duplicate request behavior |
|---|---|
| createJob | return/reconcile existing operation where appropriate |
| setBudget | no unintended duplicate mutation |
| approve | safe replay semantics |
| fund | MUST NOT double fund |
| execute (machine-action) | MUST NOT duplicate machine economic action |
| submit | MUST NOT double-submit |
| evaluate | deterministic/replay-safe |
| resolve | MUST NOT double-resolve |

Existing job operation journal and advisory locks MUST remain active.

---

# 21. RECONCILIATION REQUIREMENTS

## 21.1 Problem

A process may fail after broadcasting a transaction but before persisting completion.

## 21.2 Required States

Existing reconciliation states remain:

```text
IN_FLIGHT
CONFIRMED
RECONCILIATION_REQUIRED
```

## 21.3 Recovery

On restart:

```text
operation journal
→ identify in-flight action
→ inspect Arc transaction
→ reconcile backend state
→ DO NOT re-broadcast blindly
```

---

# 22. API REQUIREMENTS

The exact existing routes may differ.

Minimum required surface:

- create job;
- fund job;
- submit deliverable;
- evaluate job;
- query job state;
- query evidence;
- health.

---

# 23. FRONTEND REQUIREMENTS

Minimum required views:

- job creation;
- provider submission;
- Witness/Evaluator status;
- Graph/Risk display;
- settlement confirmation;
- receipt viewing (Open Purchase);
- job evidence viewing (Protected Job);
- live system status.

---

# 24. IPFS REQUIREMENTS

## 24.1 Write

Canonical evidence is written to IPFS-compatible storage.

For Open Purchase: failure BEFORE payment settlement is FAIL_CLOSED (no purchase proceeds).
For Open Purchase: failure AFTER payment settlement is EVIDENCE_PIPELINE_INCOMPLETE (payment is NOT claimed rolled back; reconciliation required).

For Protected Job: failure is FAIL_CLOSED (no settlement verdict submitted).

## 24.2 Readback

After write:

```text
CID returned
→ fetch CID
→ parse content
→ recanonicalize if required
→ compare expected content/hash
```

Only after successful readback can evidence proceed as verified.

## 24.3 Failure

Any of:
- write failure;
- read failure;
- mismatch;
- malformed content;

must produce:

```text
EVIDENCE_INVALID
or
EVIDENCE_PIPELINE_INCOMPLETE (Open Purchase, post-payment only)
or
FAIL_CLOSED
```

No settlement verdict for Protected Job. No verified receipt claim for Open Purchase when evidence pipeline is incomplete.

---

# 25. GRAPH / RISK REQUIREMENTS

## 25.1 Role

The Graph is indexed machine memory for agent execution history.

## 25.2 Provider Selection

Graph/Risk answers:
"Should the buyer select/trust this provider for this job?"

Both Open Purchase and Protected Job use Graph/Risk at selection time:
- Graph provides ERC-8004 identity validation records;
- Graph provides endpoint receipt history;
- Risk Engine computes trust score from Wilson confidence, address diversity, and validation scores;
- If Graph unavailable, stale (lag > maxLag), or has indexing errors: FAIL_CLOSED.

## 25.3 Protected Job Final Settlement

For Protected Job final settlement, a separate question is answered:
"Did the submitted deliverable satisfy the committed acceptance criteria?"

This is answered by deterministic evaluation at M7.

Graph/Risk is NOT re-executed during Protected Job resolveJob.

A provider with weak history may have been rejected at selection time.

Once a funded job exists and the provider submits work, settlement follows committed acceptance semantics.

No trust threshold (e.g., trust >= 0.5) is applied during resolveJob unless explicitly committed in the job's acceptance policy.

## 25.4 Fail-Closed Boundaries

Graph/Risk fail-closed applies ONLY during stages that require Graph:
- Provider selection: Graph unavailable → FAIL_CLOSED;
- Evidence anchoring (Open Purchase): Graph unavailable to verify anchoring → FAIL_CLOSED.

Graph/Risk does NOT fail-close during:
- Protected Job resolveJob (deterministic evaluation does not require Graph);
- Deliverable comparison (IPFS readback is independent of Graph).

---

# 26. ACCEPT / REJECT / FAIL-CLOSED

## 26.1 Open Purchase Outcome Semantics

Open Purchase does NOT use JobVerdict COMPLETE/REJECT or ERC-8183 resolution.

Open Purchase uses:
- Deterministic Outcome classification (0-8 per Outcome enum) from observed HTTP/payment facts;
- ReceiptAttestation;
- XYXEvidenceRegistry anchoring;
- Historical Graph feedback for future selections.

A bad Open Purchase HTTP/service outcome becomes negative evidence/history. It does NOT become ERC-8183 REJECT.

### Successful Open Purchase

```text
valid discovery
→ real Graph/Risk
→ real Circle/x402 payment
→ real Witness observation
→ valid canonical evidence
→ real IPFS
→ real ReceiptAttestation
→ real EvidenceRegistry anchor
→ real Graph indexing
```

### Open Purchase Post-Payment Evidence Failure

If payment has already settled but the evidence pipeline fails (IPFS write failure, Registry anchor failure, Graph indexing failure):

```text
payment settled
+ evidence pipeline incomplete
→ EVIDENCE_PIPELINE_INCOMPLETE
→ do not claim verified evidence completion
→ do not feed unverified history into future Risk decisions
→ require reconciliation/recovery
→ do not pretend payment was rolled back
```

This is NOT "no successful settlement" because settlement may already have occurred.

This is NOT REJECT because no settlement verdict is being submitted.

Open Purchase fail-closed dependencies (BEFORE payment):
- Graph unavailable during selection;
- Graph stale during selection.

Open Purchase evidence pipeline failures (AFTER payment settles):
- IPFS unavailable → EVIDENCE_PIPELINE_INCOMPLETE;
- Registry anchor absent → EVIDENCE_PIPELINE_INCOMPLETE;
- Graph indexing failure → EVIDENCE_PIPELINE_INCOMPLETE.

## 26.2 Protected Job COMPLETE

```text
valid execution
→ valid canonical evidence
→ acceptance criteria satisfied
→ valid JobVerdict
→ XYXEvaluator.resolveJob()
→ agenticCommerce.complete()
→ ERC-8183 settlement
→ provider receives escrow
```

## 26.3 Protected Job REJECT

```text
execution/deliverable objectively fails committed criteria
→ evidence preserved
→ deterministic REJECT
→ JobVerdict decision = 2
→ XYXEvaluator.resolveJob()
→ agenticCommerce.reject()
→ no successful provider settlement
→ ERC-8183 reject confirmed
```

## 26.4 FAIL_CLOSED

```text
critical required dependency cannot establish trustworthy state
→ no settlement verdict submitted
```

Examples:
- Arc RPC unavailable where chain verification is required;
- IPFS readback mismatch;
- invalid evaluator signature;
- invalid EIP-712 domain;
- Graph unavailable during a Graph-required decision stage;
- Submission tx unconfirmed;
- Expired verdict;
- Signer mismatch.

FAIL_CLOSED does NOT automatically mean REJECT. It means do not submit a settlement verdict.

## 26.5 Open Purchase Post-Payment Evidence Failure

If payment has already settled but the evidence pipeline fails (IPFS write failure, Registry anchor failure, Graph indexing failure):

```text
payment settled
+ evidence pipeline incomplete
→ EVIDENCE_PIPELINE_INCOMPLETE
→ do not claim verified evidence completion
→ do not feed unverified history into future Risk decisions
→ require reconciliation/recovery
→ do not pretend payment was rolled back
```

This is NOT "no successful settlement" because settlement may already have occurred.

This is NOT REJECT because no settlement verdict is being submitted.

---

```

---

# 27. SECURITY REQUIREMENTS

## 27.1 Signer Separation

Four signers MUST remain distinct:
- Witness signer (`WITNESS_PRIVATE_KEY`);
- Evaluator signer (`EVALUATOR_PRIVATE_KEY`);
- Relayer (`RELAYER_PRIVATE_KEY`);
- Circle machine wallet (`CIRCLE_API_KEY` + `CIRCLE_ENTITY_SECRET`).

## 27.2 API Boundaries

API MUST NOT:
- sign Witness evidence;
- sign JobVerdict;
- hold evaluator signing key.

## 27.3 Buyer Agent Boundaries

Buyer Agent MUST NOT:
- sign Witness evidence;
- sign JobVerdict;
- bypass Risk Engine.

## 27.4 Evidence Integrity

Evidence MUST:
- be canonicalized before hashing;
- be persisted with readback verification;
- have independently recomputable hashes;
- have verifiable onchain commitment.

---

# 28. TEST STRATEGY

## 28.1 Last Verified Implementation Checkpoint

Must preserve:
- Last verified checkpoint: Node 189, Solidity 24, Provider 18, typecheck PASS.
- Subsequent runs may show different counts; use newly executed real counts.

---

## 28.2 New Test Categories

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

### E2E successful Open Purchase
- successful real purchase;
- observed settlement;
- verified evidence pipeline;
- ReceiptAttestation anchored;
- Graph receipt indexed.

### E2E successful Protected Job
- COMPLETE verdict;
- ERC-8183 settlement;
- provider receives escrowed USDC;
- Graph indexes job outcome.

### E2E reject (Protected Job)
- invalid execution and no successful provider settlement.

### Fail-closed
- unavailable critical dependency.

### Recovery
- crash/reconciliation.

---

# 29. MILESTONES

## M0 — CORE FREEZE

**Priority:** P0-CRITICAL

Deliver:
- contracts deployed;
- signers configured with 4-way separation;
- IPFS infrastructure verified;
- Arc Testnet connectivity;
- Graph deployed and indexing;
- node test suite passing.

Gate:
real contract addresses + real wallet balances + real Arc tx.

---

## M1 — LIVE ARC + CONTRACTS

**Priority:** P0-CRITICAL

Deliver:
- XYXEvidenceRegistry deployed and verified;
- XYXEvaluator deployed and verified;
- ERC-8183 verified;
- ERC-8004 verified;
- USDC verified;
- Circle wallet deployed and funded;
- role assignments verified.

Gate:
real contract addresses + real wallet balances + real Arc tx.

---

## M2 — LIVE GRAPH

**Priority:** P0-CRITICAL

Deliver:
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

## M3 — LIVE BUYER AGENT / PROVIDER SELECTION

**Priority:** P0

Deliver:
```text
real intent
→ real provider selection
```

Inputs must include live:
- ERC-8004;
- Graph;
- Risk.

---

## M4 — LIVE PROTECTED JOB FUNDING

**Priority:** P0

Deliver:

```text
create
→ budget
→ approve
→ fund
```

with real USDC.

M4 applies to Protected Job mode (Mode B). Open Purchase does not use ERC-8183 escrow.

Gate:
funded real job with confirmed ERC-8183 state (status = Funded, budget confirmed on-chain).

---

## M5 — LIVE JOB EXECUTION

**Priority:** P0 (mode-dependent)

Deliver:
Execution evidence appropriate to the declared job type.

Protected Job execution classes:

**A. MACHINE-ACTION JOB:**
Circle machine wallet executes the required real Arc action. Transaction must be semantically linked to the job requirement, objectively verifiable on-chain, and causally traceable to the funded job.

**B. DELIVERABLE JOB:**
Provider performs the specified machine-verifiable work and produces a deliverable commitment. No post-funding Circle Arc transaction is required. The economic Arc actions (create, approve, fund, complete/reject) remain the Arc footprint.

Open Purchase does not require M5 — Circle/x402 payment is the execution mechanism and is covered by M6.

Gate:
execution evidence appropriate to the declared job type exists and can be verified.

Note:
M5 does not require a dummy or self-referential Arc transaction. For deliverable jobs, provider execution at a service endpoint with a verifiable deliverable commitment satisfies the gate.

---

## M5.1 — JOB EXECUTION CLASSES

**Priority:** P0

Protected Jobs are classified by execution type at creation time.

### Machine-Action Job

Definition:
The job requires a meaningful machine-controlled on-chain action post-funding.

Requirements:
- Circle machine wallet executes the required Arc transaction;
- transaction is semantically linked to the job requirement;
- transaction is objectively verifiable on-chain;
- transaction is causally traceable to the funded job.

Examples:
- Contract call executing a protocol action;
- token operation tied to job spec;
- state change verifiable on-chain.

Forbidden:
- Dummy calls to unrelated contracts;
- self-transfers;
- duplicate provider payments;
- zero-value calls with no semantic content.

### Deliverable Job

Definition:
The provider produces an objectively machine-verifiable deliverable.

Requirements:
- Provider performs specified work at service endpoint;
- provider submits deliverable commitment (hash) on-chain;
- deliverable is machine-verifiable against committed acceptance criteria;
- no post-funding Circle Arc transaction required.

Examples:
- Structured JSON output;
- deterministic transformation;
- signed result;
- artifact hash.

Economic Arc actions remain:
create → approve → fund → complete/reject.

### Job Type Declaration

New Protected Jobs MUST declare `executionClass` in their specification once the schema supports it. This determines whether M5 machine execution is required and what verification steps the Witness performs.

Existing v1.1 jobs that lack `executionClass` MAY be classified from their immutable committed specification when:
- classification is unambiguous from the specification text; and
- classification does not change `canonicalJobSpec()` or `specificationHash`.

Classification is metadata/interpretation only. It MUST NOT:
- change `canonicalJobSpec()`;
- change `specificationHash`;
- rewrite ERC-8183 description;
- add execution parameters retroactively.

---

## M6 — LIVE EVIDENCE

**Priority:** P0 (mode-dependent)

Deliver (mode-specific):

### OPEN PURCHASE (Mode A):

```text
Arc tx
→ Witness
→ HTTP observation
→ canonical evidence
→ IPFS
→ readback
→ EIP-712 ReceiptAttestation
→ XYXEvidenceRegistry.anchorReceipt()
→ ReceiptAnchored confirmed
→ Graph indexes Receipt
```

### PROTECTED JOB (Mode B):

```text
ERC-8183 job state verified
→ provider submission tx confirmed
→ deliverable read from IPFS
→ deterministic evaluation computed
→ canonical job evidence constructed
→ IPFS persisted and readback verified
→ evidenceHash derived
→ reasonHash derived
→ JobVerdict constructed
→ evaluator EIP-712 signature verified locally
```

Gate (Open Purchase):
canonical evidence + IPFS readback + Witness EIP-712 ReceiptAttestation + EvidenceRegistry anchor confirmed + Graph receipt indexed.

Gate (Protected Job):
SIGNED_PROTECTED_JOB_EVIDENCE_READY — canonical job evidence + IPFS readback + evidenceHash verified + deterministic evaluation context + evaluator-signed JobVerdict verified locally + ready for onchain resolution.

Note:
Protected Job M6 does NOT include XYXEvaluator.resolveJob() or ERC-8183 settlement. Those belong to M8. Protected Job evidenceHash onchain commitment occurs during M8 resolution, not M6.

---

## M6.1 — EVIDENCE PATH SPECIFICATION

**Priority:** P0-CRITICAL

The XYX system has two distinct economic modes. Evidence paths are mode-specific and must not be conflated.

### Mode A — Open Purchase Evidence

Open Purchase uses x402 HTTP payment. The Witness observes the full HTTP execution and settlement transaction.

Evidence fields:
- paymentHash: x402 settlement transaction hash;
- amountPaid: atomic USDC amount;
- requestHash: HTTP request body hash;
- responseHash: HTTP response body hash;
- httpStatus: HTTP response status;
- latencyMs: HTTP round-trip latency;
- outcome: classified outcome (0-8 per Outcome enum).

On-chain commitment:
ReceiptAttestation → XYXEvidenceRegistry.anchorReceipt() → ReceiptAnchored event.

### Mode B — Protected Job Evidence

Protected Job uses ERC-8183 escrow. The Witness verifies job state, submission, and deliverable against committed acceptance criteria. The Witness does NOT observe provider HTTP execution.

Evidence fields:
- jobId: ERC-8183 job ID;
- commerce: ERC-8183 contract address;
- buyer: job client address;
- provider: provider address;
- evaluator: XYXEvaluator address;
- specificationHash: canonical job specification hash;
- submissionTxHash: provider submission transaction hash;
- deliverableHash: deliverable content hash;
- evaluation: `{ decision, reason, reasonHash }`.

On-chain commitment:
JobVerdict (with evidenceHash) → XYXEvaluator.resolveJob() → JobVerdictExecuted event.

### Common Evidence Requirements

Both modes require:
- Canonical JSON serialization;
- Cryptographic hash commitment;
- IPFS persistence with readback verification;
- EIP-712 domain separation;
- Nonce replay protection;
- Independent verifiability.

---

## M7 — DETERMINISTIC EVALUATION

**Priority:** P0

Deliver:
Machine-verifiable evaluation of submitted work against committed acceptance criteria.

Input:
Committed acceptance criterion + verified canonical deliverable/evidence.

Output:
COMPLETE (deliverable matches criterion) or REJECT (deliverable fails criterion).

For Protected Job:
- The deterministic exact-json evaluator (`evaluateDeliverable`) compares canonical deliverable against committed expected value;
- This is the sole acceptance criterion for final settlement;
- Graph/Risk is NOT re-executed during resolveJob;
- A provider with weak history may have been rejected at selection time (M3);
- Once a funded job exists and the provider submits work, settlement follows the committed acceptance semantics.

Protected Job fail-closed dependencies:
- Arc state unavailable or ambiguous;
- Submission tx unconfirmed;
- IPFS deliverable unavailable;
- IPFS hash mismatch;
- Canonical evidence construction failure;
- Invalid evaluator signing state;
- Expired verdict;
- Signer mismatch.

Open Purchase fail-closed dependencies (BEFORE payment):
- Graph unavailable during selection;
- Graph stale during selection.

Open Purchase evidence pipeline failures (AFTER payment settles):
- IPFS unavailable → EVIDENCE_PIPELINE_INCOMPLETE;
- Registry anchor absent → EVIDENCE_PIPELINE_INCOMPLETE;
- Graph indexing failure → EVIDENCE_PIPELINE_INCOMPLETE.

---

## M7.1 — GRAPH/RISK BOUNDARIES

**Priority:** P0-CRITICAL

Graph/Risk answers:
"Should the buyer select/trust this provider for this job?"

Deterministic job evaluation answers:
"Did the submitted deliverable satisfy the committed acceptance criteria?"

These are separate questions.

## Provider Selection (Both Modes)

Graph/Risk is load-bearing during provider selection:
- Graph provides ERC-8004 identity validation records;
- Graph provides endpoint receipt history;
- Risk Engine computes trust score;
- If Graph unavailable, stale (lag > maxLag), or has indexing errors: FAIL_CLOSED.

## Final Protected Job Settlement

For Protected Job final settlement:
- Deterministic exact-json evaluation is the sole acceptance criterion;
- Graph/Risk is NOT re-executed during resolveJob;
- A provider with weak history may have been rejected at selection time;
- Once a funded job exists and the provider submits work, settlement follows committed acceptance semantics;
- No trust threshold (e.g., trust >= 0.5) is applied during resolveJob unless explicitly committed in job policy.

## Fail-Closed Boundaries

Graph/Risk fail-closed applies ONLY during stages that require Graph:
- Provider selection: Graph unavailable → FAIL_CLOSED;
- Evidence anchoring (Open Purchase): Graph unavailable to verify anchoring → FAIL_CLOSED.

Graph/Risk does NOT fail-close during:
- Protected Job resolveJob (deterministic evaluation does not require Graph);
- Deliverable comparison (IPFS readback is independent of Graph).

---

## M8 — LIVE RESOLUTION / SETTLEMENT

**Priority:** P0

Deliver (mode-specific):

### OPEN PURCHASE:
Settlement is complete upon x402 payment confirmation. No additional onchain resolution step. Graph indexes receipt for future selection.

### PROTECTED JOB:

```text
signed JobVerdict
→ XYXEvaluator.resolveJob()
→ JobVerdictExecuted event
→ agenticCommerce.complete() or .reject()
→ ERC-8183 settlement
→ provider USDC received OR buyer USDC refunded
→ Graph indexes job outcome
```

Gate (Protected Job):
JobVerdictExecuted confirmed + final ERC-8183 state verified + economic settlement/refund proven.

Protected Job M6 and M8 are sequentially distinct:
- M6 establishes SIGNED_PROTECTED_JOB_EVIDENCE_READY (no onchain settlement);
- M8 performs onchain resolution and settlement.

---

## M9 — LIVE REJECT PATH

**Priority:** P0-MANDATORY

Deliver:
A separately created real Protected Job with intentionally invalid execution/deliverable that demonstrates the full REJECT path.

Requirements:
- Second job with distinct jobId and immutable specification;
- Intentionally invalid deliverable or execution;
- Evidence preserved (no suppression);
- Deterministic REJECT via exact-json-v1 mismatch;
- ERC-8183 reject confirmed on-chain;
- No successful provider settlement;
- Buyer refund or escrow release confirmed.

Important:
M9 requires a separate job from the success-path job. The success-path job (e.g., job 186075) must NOT be used to demonstrate REJECT. Each job preserves its own immutable specification and deliverable.

---

## M10 — FRONTEND E2E

**Priority:** P0

Deliver:
user can demonstrate all critical stages from UI.

Gate:
no terminal required for main lifecycle.

---

## M11 — VERIFY:LIVE

**Priority:** P0

Deliver:
single live environment verification command.

Gate:
PASS output for demo environment.

---

## M12 — DEPLOYMENT MANIFEST

**Priority:** P0

Deliver:
public deployment metadata.

Gate:
every demo chain claim can be externally inspected.

---

## M13 — RELIABILITY / SECURITY GATE

**Priority:** P0

Deliver:
failure matrix tested.

Gate:
no duplicate economic action + fail-closed critical paths.

---

# 30. ACCEPTANCE CRITERIA FORMAT

## 30.1 exact-json-v1

An explicit, immutable exact-JSON acceptance criterion.

This does not claim to evaluate arbitrary natural-language work.

Structure:
```json
{
  "kind": "exact-json-v1",
  "expected": <machine-verifiable JSON value>
}
```

## 30.2 Evaluation

The evaluator performs:
```text
canonicalJSON(expected) === canonicalJSON(deliverable)
```

Result:
- `true` → COMPLETE (decision = 1);
- `false` → REJECT (decision = 2).

---

# 31. CANONICAL JSON

## 31.1 Rules

- Keys sorted alphabetically;
- No sparse arrays;
- No non-JSON values (undefined, functions, circular references);
- Numbers are JSON numbers (not string-encoded);
- Strings are JSON strings;
- Booleans are JSON booleans;
- Null is JSON null.

## 31.2 Hashing

Canonical JSON string is hashed via keccak256(utf8(canonicalJSON)) to produce bytes32 commitment.

---

# 32. IPFS REQUIREMENTS

## 32.1 Write

Canonical evidence is written to IPFS-compatible storage.

For Open Purchase: failure BEFORE payment settlement is FAIL_CLOSED (no purchase proceeds).
For Open Purchase: failure AFTER payment settlement is EVIDENCE_PIPELINE_INCOMPLETE (payment is NOT claimed rolled back; reconciliation required).

For Protected Job: failure is FAIL_CLOSED (no settlement verdict submitted).

## 32.2 Readback

After write:

```text
CID returned
→ fetch CID
→ parse content
→ recanonicalize if required
→ compare expected content/hash
```

Only after successful readback can evidence proceed as verified.

## 32.3 Failure

Any of:
- write failure;
- read failure;
- mismatch;
- malformed content;

must produce:

```text
EVIDENCE_INVALID
or
EVIDENCE_PIPELINE_INCOMPLETE (Open Purchase, post-payment only)
or
FAIL_CLOSED
```

No settlement verdict for Protected Job. No verified receipt claim for Open Purchase when evidence pipeline is incomplete.

---

# 33. E2E SUCCESS TEST

## 33.1 Open Purchase Sequence

Required sequence:

```text
human creates intent
→ Buyer Agent selects provider
→ Graph/Risk validates
→ Circle/x402 payment
→ Arc tx confirmed
→ Witness observes HTTP
→ evidence canonicalized
→ evidence written/read from IPFS
→ Witness EIP-712 ReceiptAttestation signed
→ evidence registered on XYXEvidenceRegistry
→ Graph indexes Receipt
→ settlement complete
```

The test fails if a critical step uses a mock.

---

## 33.2 Protected Job Sequence

Required sequence:

```text
human creates intent
→ Buyer Agent selects provider
→ protected job created
→ budget configured
→ USDC approved
→ job funded
→ provider executes work (appropriate to job type)
→ provider submits deliverable
→ Witness verifies ERC-8183 state
→ Witness reads deliverable from IPFS
→ evidence canonicalized
→ evidence written/read from IPFS
→ deterministic evaluation
→ JobVerdict constructed and signed
→ XYXEvaluator resolves
→ ERC-8183 settlement
→ settlement success
```

The test fails if a critical step uses a mock.

---

# 34. E2E REJECT TEST

Required sequence:

```text
human creates job
→ protected job funded
→ provider executes intentionally invalid work
→ provider submits invalid deliverable
→ Witness detects objective mismatch
→ evidence preserved
→ deterministic REJECT
→ no successful settlement
```

Note:
M9 REJECT test requires a separately created job from the success-path job.

---

# 35. E2E FAIL-CLOSED TEST

Required example:

```text
valid-looking agent claim
→ critical evidence unavailable
→ Graph/IPFS/signature cannot be verified
→ evaluator cannot establish acceptable evidence
→ no successful settlement
```

---

# 36. DEMO SCRIPT

## 36.1 Open Purchase Demo (60 seconds)

```text
0-10 sec — Problem
"Agents need to buy services, but payment alone doesn't prove the service was delivered correctly."

10-20 sec — Solution
"XYX observes the full HTTP execution, canonicalizes evidence, anchors it on XYXEvidenceRegistry, and uses Graph history for trust assessment."

20-40 sec — Live Proof
"Buyer Agent discovers provider → Circle x402 payment → Arc tx confirmed → Witness observes HTTP → IPFS write/readback → ReceiptAttestation signed → XYXEvidenceRegistry anchor → Graph indexes receipt."

40-55 sec — Settlement
"Payment settled. Evidence is independently verifiable. Future selections benefit from this history."

55-60 sec — Key Message
"XYX turns agent purchases into accountable, evidence-backed transactions."
```

## 36.2 Protected Job Demo (60 seconds)

```text
0-10 sec — Problem
"Agents need escrow-backed jobs with verifiable deliverables, not just payment promises."

10-20 sec — Solution
"XYX creates an ERC-8183 protected job with committed acceptance criteria, verifies the deliverable against exact-json criteria, and settles through evaluator verdict."

20-40 sec — Live Proof
"Buyer Agent selects provider → ERC-8183 create → setBudget → approve → fund → provider executes → provider submits → Witness verifies → IPFS evidence → deterministic evaluation → JobVerdict → XYXEvaluator resolve → ERC-8183 complete → provider receives escrow."

40-55 sec — Reject Path
"With an invalid deliverable, the same pipeline deterministically REJECTs. No settlement. Buyer refunded."

55-60 sec — Key Message
"XYX turns agent jobs into accountable, escrow-backed, evidence-settled work."
```

---

# 37. DEPLOYMENT MANIFEST

## 37.1 Required Contents

- All contract addresses;
- All wallet addresses;
- All signer addresses;
- Graph deployment ID;
- IPFS provider config;
- Git commit hash.

## 37.2 Verification

Every demo chain claim must be externally inspectable from the manifest.

---

# 38. MONITORING AND OBSERVABILITY

Required:
- Arc transaction confirmation status;
- Graph indexing status;
- IPFS write/read status;
- Evidence anchoring status;
- Job lifecycle state;
- Signer separation verification;
- Reconciliation state.

---

# 39. FAILURE MATRIX

## 39.1 Required Coverage

| Failure | Mode A Response | Mode B Response |
|---|---|---|
| Graph unavailable at selection | FAIL_CLOSED | FAIL_CLOSED |
| Graph stale at selection | FAIL_CLOSED | FAIL_CLOSED |
| Graph indexing errors | FAIL_CLOSED | FAIL_CLOSED |
| IPFS write failure | EVIDENCE_PIPELINE_INCOMPLETE | FAIL_CLOSED |
| IPFS readback mismatch | EVIDENCE_PIPELINE_INCOMPLETE | FAIL_CLOSED |
| IPFS unavailable | EVIDENCE_PIPELINE_INCOMPLETE | FAIL_CLOSED |
| Registry anchor absent | EVIDENCE_PIPELINE_INCOMPLETE | N/A |
| Arc RPC unavailable | FAIL_CLOSED | FAIL_CLOSED |
| Submission tx unconfirmed | N/A | FAIL_CLOSED |
| Invalid evaluator signature | N/A | FAIL_CLOSED |
| Expired verdict | N/A | FAIL_CLOSED |
| Signer mismatch | FAIL_CLOSED | FAIL_CLOSED |
| Provider HTTP error | PROVIDER_HTTP_ERROR / negative evidence | depends on committed criterion |
| Schema mismatch | PROVIDER_SCHEMA_MISMATCH / negative evidence | REJECT if committed criterion fails |
| Deliverable mismatch | classified negative outcome / evidence | REJECT |
| Provider timeout | PROVIDER_TIMEOUT / negative evidence | depends on committed criterion |

---

# 40. GLOSSARY

**Open Purchase:**
Mode A economic model. Immediate x402 HTTP payment with Witness observation and XYXEvidenceRegistry anchoring.

**Protected Job:**
Mode B economic model. ERC-8183 escrow-backed job with deferred settlement through XYXEvaluator verdict.

**ReceiptAttestation:**
EIP-712 signed evidence for Open Purchase. Anchored on XYXEvidenceRegistry.

**JobVerdict:**
EIP-712 signed verdict for Protected Job. Submitted to XYXEvaluator.

**Circle machine buyer wallet:**
The Circle Developer-Controlled Wallet that holds USDC and executes x402 payments in Open Purchase.

**Witness signer:**
The signer identity (`WITNESS_PRIVATE_KEY`) used for Open Purchase ReceiptAttestation only.

**Evaluator signer:**
The signer identity (`EVALUATOR_PRIVATE_KEY`) used for Protected Job JobVerdict only.

**Machine-Action Job:**
Protected Job execution class requiring post-funding Circle machine wallet Arc transaction.

**Deliverable Job:**
Protected Job execution class where provider produces machine-verifiable deliverable without post-funding Arc transaction.

**evidenceHash:**
keccak256 hash of canonical evidence bundle. Committed onchain (Registry for Open Purchase, Evaluator for Protected Job).

**specificationHash:**
keccak256 hash of canonical job specification. Excludes transient fields (expiry).

**canonicalJSON:**
Deterministic JSON serialization with sorted keys, no sparse arrays, no non-JSON values.

**FAIL_CLOSED:**
No settlement verdict submitted due to unavailable critical dependency. Distinct from REJECT.

---

# 41. DEFINITION OF DONE

## 41.1 Open Purchase P0 Proof

```text
real discovery
→ real Graph/Risk
→ real Circle/x402 payment
→ real Witness observation
→ real canonical evidence
→ real IPFS
→ real ReceiptAttestation
→ real EvidenceRegistry anchor
→ real Graph indexing
```

## 41.2 Protected Job ACCEPT Proof

```text
real provider selection
real ERC-8183 job
real budget
real USDC escrow
real execution appropriate to job type
real submit
real canonical evidence
real IPFS readback
real deterministic evaluation
real JobVerdict
real XYXEvaluator
real ERC-8183 complete
real provider USDC balance increase proof
```

## 41.3 Protected Job REJECT Proof

```text
real invalid deliverable/execution
real preserved evidence
deterministic REJECT
real ERC-8183 reject
real no-successful-settlement/refund proof
```

---

# 42. JOB 186075 CLASSIFICATION

**Execution class:** DELIVERABLE_JOB (inferred from committed specification: deterministic text normalization task with no machine-action requirement).

**Classification basis:** Inferred from immutable committed specification only. Does not change `canonicalJobSpec()` or `specificationHash` (`0xfc1455ab974b7777a501fa04acfa291f6a50024c4b4c658a6807eeea92f598c6`). No execution parameters added retroactively.

**What job 186075 can prove from M4 onward:**
- M4: ERC-8183 create confirmed (TX1, block 61597179);
- M5B: DELIVERABLE_JOB execution (provider HTTP text normalization);
- M6B: Protected Job canonical evidence + IPFS + evaluator-signed JobVerdict;
- M7: Deterministic exact-json-v1 evaluation;
- M8: XYXEvaluator resolution + ERC-8183 settlement.

**What job 186075 cannot prove:**
- M3: Causal Buyer Agent provider selection for this specific job (NOT_PROVEN_FOR_THIS_EXISTING_JOB — no historical evidence establishes that Buyer Agent runtime causally selected provider 894335 before TX1);
- M5A: Machine-action Arc execution (not applicable to deliverable job);
- M6A: Open Purchase ReceiptAttestation (not applicable to Protected Job).

**Full v1.2 Protected Job DoD:** NOT YET PROVEN (M3 not proven for this existing job).

**M9:** REQUIRES_SECOND_JOB. Job 186075 is the success-path job only.

---

# 43. LIVE DEPLOYMENT FACTS

**VERIFIED LIVE SNAPSHOT AT PRD v1.2 FREEZE CHECKPOINT**

Operational state after this checkpoint must be taken from newer live evidence, receipts, deployment manifests, and reconciliation state. This section is not updated retroactively.

Network: Arc Testnet (chainId: 5042002)

Contracts:
- XYXEvidenceRegistry: `0xfB94329c89Af2FC541bEf32e1ec99cbed87a39F2`
- XYXEvaluator: `0xCEBFedAc66B0fFfAD452D3f1B356D1A3120dB233`
- ERC-8183 (AgenticCommerce): `0x0747EEf0706327138c69792bF28Cd525089e4583`
- ERC-8004 Identity Registry: `0x8004A818BFB912233c491871b3d84c89A494BD9e`
- USDC: `0x3600000000000000000000000000000000000000`

Wallets:
- Circle machine buyer wallet: `0x55763d498fd057d17ffcc2fb540789ce76f4f085`
- Provider: `0x7ea90Ac2A2bA5fF6c71e7E9D23037D64AbD2b4da`

Signers:
- Witness Attestor: `0x15cd0E9055BD775eF69000438e756E4476562E8F`
- Evaluator Attestor: `0x644C11572E3792bd1dE5959D09ECBc6f63304277`

Graph:
- Deployment ID: `QmaFDTDR41XFiatVmRnjoi3siZBXW9n4zAhCanU6T5CFrQ`
- Endpoint: `https://api.studio.thegraph.com/query/1759975/xyx-arc/v0.1.0`

Live transactions:
- TX1 (job create): `0xb22fa0cbd7f8a2a2843f646aafd5ee01ff41af57b04b333c2b276a43ae0184ad` — CONFIRMED at block 61597179, jobId 186075.
- TX2: NOT SENT.

---

# 44. IMPLEMENTATION BACKLOG

## 44.1 Immediate — Job 186075 Success Path

For job 186075 success path:

1. Read-only getJob + expiry verification
2. TX2 provider setBudget (external Rabby)
3. Verify budget/status
4. Buyer approve (Circle machine wallet)
5. Verify allowance / tx
6. Buyer fund (Circle machine wallet)
7. Verify Funded state and escrow
8. Perform actual provider task
9. Capture actual response
10. Persist actual deliverable to IPFS
11. Readback and verify deliverableHash
12. TX provider submit actual deliverableHash (external Rabby)
13. Verify Submitted state and submission event
14. Construct canonical Protected Job evidence
15. IPFS persist/readback evidence
16. Deterministic exact-json-v1 evaluation
17. Construct/sign JobVerdict
18. Locally verify signature / nonce / expiry / evidenceHash
19. XYXEvaluator.resolveJob
20. Verify JobVerdictExecuted
21. Verify ERC-8183 COMPLETE
22. Verify provider USDC settlement
23. Verify Graph indexes final job outcome

Each blockchain write remains individually gated.

## 44.2 Remaining P0 Work

- M9 second real REJECT job creation;
- M10 frontend E2E;
- M11 verify:live command;
- M12 deployment manifest publication;
- M13 reliability/security gate.

## 44.3 Optional Future Architecture Research

The following items are NOT required by PRD v1.2 Protected Job DoD. They may be explored only after P0 is complete.

- M5A machine-action job product design (requires explicit product decision on external contract action before implementation);
- optional future Protected Job XYXEvidenceRegistry architecture research (requires contract redesign, not in P0 scope, explicitly excluded from v1.2 DoD).

Protected Job evidenceRegistry support is NOT required by PRD v1.2 DoD.

---

# 45. REVISION HISTORY

| Version | Date | Changes |
|---|---|---|
| v1.1 | 2026-09-10 | Initial production specification. |
| v1.2 | 2026-09-12 | Mode-specific evidence and execution semantics. Two economic modes explicitly separated. M5 type-aware (machine-action vs deliverable). M6/M8 boundary corrected for Protected Job. Graph/Risk boundaries explicit. Registry role clarified (Open Purchase only). Job 186075 classification updated. |
