# XYX Implementation Status

**Assessment date:** 2026-09-13
**Repository commit assessed:** `367998149aa9004af4e908ecd9bb29469a8054c6`
**Network:** Arc Testnet

This is an implementation and evidence-status report. It does not upgrade a
local test, simulation, or prepared transaction into a live economic claim.

## Executive summary

XYX has a strong, tested implementation foundation, but the P0 objective is a
real, evidence-backed Protected Job vertical slice. That final claim is not
complete yet.

| Measure | Estimate | Meaning |
|---|---:|---|
| Implementation coverage | **about 80–85%** | Core contracts, API, selection, provider, witness, persistence, UI, tests, and fail-closed paths are implemented locally. |
| Independently verified live P0 proof | **about 30%** | Arc, contracts, Graph, Circle wallet, IPFS, and controlled ERC-8004 identity are live-verified; the complete job lifecycle is not. |
| Honest overall project completion | **about 55–60%** | A blended view that gives live proof equal importance to implementation. |
| Remaining for the P0 claim | **about 40–45%** | Mostly real Protected Job execution, evidence, settlement, REJECT proof, and UI E2E evidence. |

The percentages are estimates, not a PRD-defined metric. They are deliberately
split because a repository can be implementation-ready while its external
economic behavior is still unproven.

## What is verified live

- Arc Testnet connectivity and chain ID `5042002`.
- Deployed bytecode for the configured ERC-8183 commerce contract,
  `XYXEvidenceRegistry`, and `XYXEvaluator`.
- XYXEvaluator target binding to the configured ERC-8183 contract.
- Arc USDC contract and six-decimal token semantics.
- Graph deployment metadata, indexing health, and Arc block provenance.
- Circle machine-buyer wallet existence/funding evidence.
- IPFS write/readback infrastructure.
- Controlled ERC-8004 provider identity and provider endpoint evidence.
- Contract role and pause-state checks recorded in the live session evidence.

The current read-only `npm run verify:protected-job` run also confirms the
public Arc/contract/USDC/Graph dependencies. It intentionally reports:

- `NOT_CONFIGURED`: provider address was not supplied to verify all five roles;
- `NOT_PROVEN`: historical job `186075` has no causal Buyer Agent selection
  proof;
- `NOT_PROVEN`: the mandatory Protected Job REJECT proof needs a separate job.

No transaction, signing operation, deployment, or live Protected Job mutation
was performed during this assessment.

## Implementation status by PRD milestone

| Milestone | Status | Evidence / remaining boundary |
|---|---|---|
| M0 Core freeze | **Implemented and foundation-verified** | Contracts, Arc, Graph, IPFS, wallet, tests, and role boundaries exist. |
| M1 Live Arc + contracts | **Live-verified** | Deployment/session evidence and read-only bytecode/target checks pass. |
| M2 Live Graph | **Live infrastructure verified** | Deployment/freshness pass; a complete receipt feedback loop still needs a real Open Purchase proof. |
| M3 Buyer/provider selection | **Implemented; live causal proof missing** | Selection now uses ERC-8004 + Graph + deterministic Risk and persists a selection commitment. A new live job must prove selection preceded creation. |
| M4 Protected Job funding | **Implemented; live proof missing** | API/provider paths cover create → budget → approve → fund with idempotency and reconciliation. No new funded job was broadcast. |
| M5 Job execution | **Deliverable path implemented; live proof missing** | Provider task normalization and on-chain deliverable submission are wired. Machine-Action is explicitly fail-closed as not implemented. |
| M5.1 Execution classes | **Partially implemented** | Deliverable jobs are supported; meaningful post-funding Machine-Action jobs remain future work. |
| M6 Evidence | **Implemented locally; live proof missing** | Open Purchase ReceiptAttestation and Protected Job JobVerdict evidence paths are separated, canonicalized, IPFS-persisted, and readback-checked in code/tests. |
| M6.1 Evidence path separation | **Implemented/tested** | Open Purchase uses XYXEvidenceRegistry; Protected Job uses `JobVerdict.evidenceHash` → XYXEvaluator. |
| M7 Deterministic evaluation | **Implemented/tested** | `exact-json-v1` produces deterministic COMPLETE/REJECT decisions and reason hashes. |
| M7.1 Graph/Risk boundary | **Implemented/tested** | Graph/Risk runs at selection; final Protected Job settlement uses committed acceptance criteria. |
| M8 Resolution/settlement | **Implemented; live proof missing** | Witness signs and resolves through XYXEvaluator with event/final-state checks. No live settlement/refund was proven. |
| M9 Separate REJECT path | **Not proven** | Requires a second real Protected Job with intentionally invalid deliverable and confirmed ERC-8183 refund. |
| M10 Frontend E2E | **UI implemented; live E2E missing** | Buyer/provider screens build and map states truthfully; no complete terminal-free live demonstration exists. |
| M11 Verify:live | **Verifier implemented; environment incomplete** | Read-only verifier is strict, but the current environment lacks the runtime variables needed for an all-pass demo report. |
| M12 Deployment manifest | **Implemented** | Public Arc deployment metadata is present and used by verifiers/subgraph tooling. |
| M13 Reliability/security | **Implemented locally** | 275 Node tests, 24 Solidity tests, fail-closed paths, idempotency, reconciliation, role separation, and secret scans pass. |

## Implemented components

### Buyer/API

- Protected Job provider selection endpoint.
- Selection commitment persistence and one-time consumption.
- ERC-8183 create, fund, submit verification, evaluate, and expiry-refund
  routes.
- Explicit Circle buyer/provider/evaluator address binding.
- Idempotent operation journal and canonical-state reconciliation.
- No fake transaction hashes and no automatic retry of ambiguous economic
  operations.

### Selection and trust

- ERC-8004 identity resolution against the Arc/Graph block boundary.
- Graph deployment/indexing/block-hash freshness checks.
- Deterministic Risk Engine selection.
- Fail-closed behavior on stale/unavailable Graph or identity data.

### Provider

- Rabby provider-wallet flow for `setBudget` and `submit`.
- Exact calldata generation from current job/task input.
- Immediate pre-broadcast re-simulation.
- Receipt sender, event, participant, and post-state verification.
- No static deliverable hash fallback.

### Witness/evaluator

- Canonical Protected Job evidence bundle.
- IPFS persistence and readback verification.
- EIP-712 evaluator signature and local recovery check.
- XYXEvaluator event verification and final ERC-8183 state verification.
- Distinct Witness, Evaluator, Relayer, Circle buyer, and Provider roles.

### Contracts and UI

- ERC-8183 remains the Protected Job escrow authority.
- XYXEvidenceRegistry is restricted to Open Purchase evidence.
- UI distinguishes OPEN/FUNDED/SUBMITTED/COMPLETE/REJECTED/EXPIRED and
  reconciliation states.
- Refund controls only appear for expired Funded/Submitted jobs; REJECT is
  treated as an atomic contract outcome.

## Remaining work to claim P0 complete

The next live run must produce independently inspectable evidence for this
entire sequence:

```text
real provider selection
→ job creation
→ provider budget
→ USDC approval
→ funding
→ provider deliverable execution
→ provider submission
→ IPFS evidence/readback
→ deterministic evaluation
→ evaluator signature
→ XYXEvaluator resolution
→ ERC-8183 COMPLETE settlement
→ Graph-indexed final outcome
```

After the success path, a **separate** Protected Job is required for:

```text
intentionally invalid deliverable
→ deterministic REJECT
→ ERC-8183 refund/escrow release
→ independently verifiable final state
```

Until these stages have real transaction receipts, event bindings, IPFS
readback, signatures, and final balances/state, they remain implementation or
verification work rather than completed live claims.

## Documentation authority note

The repository contains `docs/XYX_TECHNICAL_PRD_v1.2_FINAL.md`. The path
requested by the root instructions, `docs/XYX_TECHNICAL_PRD_v1.1.md`, is absent;
the available v1.1 copy is historical at
`docs/archive/XYX_TECHNICAL_PRD_v1.1.md`. This report does not change either
PRD.

## Verification commands

```text
npm run typecheck
npm test
npm run build:web
npm --prefix apps/provider run build
npm run test:contracts
npm run build:contracts
npm run subgraph:codegen
npm run subgraph:build
npm run verify:protected-job       # read-only; NOT_PROVEN is expected today
```

**Current conclusion:** XYX is implementation-ready for a controlled live
Protected Job execution, but it is not yet a fully proven P0 live vertical
slice.
