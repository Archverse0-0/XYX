# Session 01 — Protected Job Reconciliation

## Executive Result

**IMPLEMENTED_TESTED**

## Initial Problem

The Protected Job system lacked deterministic crash recovery. When a process crashed after broadcasting an external transaction (fund, submit, resolve) but before persisting the confirmation locally, the operation was stuck in `RECONCILIATION_REQUIRED` forever. There was no mechanism to inspect canonical Arc/ERC-8183 state to determine the actual outcome and recover without duplicating the external call.

## Production Architecture

The reconciliation system inspects canonical on-chain state (ERC-8183 job status, transaction receipts, events) to determine the actual outcome of uncertain operations. Each operation type has different canonical evidence:

- **create**: JobCreated event in transaction receipt
- **budget**: `getJob(jobId).budget` comparison
- **approve**: Transaction receipt (ERC-20 allowance is shared state, cannot safely infer)
- **fund**: `getJob(jobId).status` (0=CREATED, 1=FUNDED, 2+=SUBMITTED+)
- **submit**: JobSubmitted event + deliverable hash matching
- **evaluate**: `getJob(jobId).status` (3=COMPLETE, 4=REJECTED) + verdict matching

The `jobOperation()` function now accepts an optional `ProtectedJobReconciler` instance. When an existing operation is found in `RECONCILIATION_REQUIRED` state, reconciliation is attempted before blocking.

## Files Changed

| File | Change |
|------|--------|
| `packages/shared/src/reconciler.ts` | **NEW** — `ProtectedJobReconciler` class with per-operation canonical state inspection |
| `packages/shared/src/job-operations.ts` | **MODIFIED** — `jobOperation()` accepts optional reconciler, attempts canonical recovery before blocking |
| `apps/api/migrations/003_reconciliation.sql` | **NEW** — Adds reconciliation fields to `job_operations` table |
| `apps/api/src/jobs.ts` | **MODIFIED** — Creates `ProtectedJobReconciler`, passes to all `jobOperation()` calls |
| `apps/witness/src/service.ts` | **MODIFIED** — Creates reconciler in constructor, passes to `resolveJob()` and `jobOperation()` |
| `packages/shared/src/storage.ts` | **MODIFIED** — Added `003_reconciliation.sql` to migration list |
| `packages/shared/test/reconciliation.test.ts` | **NEW** — 16 reconciliation scenario tests |

## Database Changes

Migration `003_reconciliation.sql` adds to `job_operations`:

- `external_operation_id TEXT` — Circle transaction ID or external reference
- `tx_hash TEXT` — Arc transaction hash for the broadcast
- `broadcast_at TIMESTAMPTZ` — When transaction was broadcast
- `confirmed_at TIMESTAMPTZ` — When operation was confirmed
- `reconciliation_attempts INTEGER DEFAULT 0` — Counter for monitoring
- `last_reconciliation_at TIMESTAMPTZ` — Last reconciliation attempt time
- `canonical_snapshot JSONB` — Request data for canonical comparison
- Index `job_operations_reconcile` for efficient uncertain-operation queries

## Reconciliation State Model

```
IN_FLIGHT → execute() → CONFIRMED (success)
IN_FLIGHT → execute() → RECONCILIATION_REQUIRED (failure)
RECONCILIATION_REQUIRED → reconcile() → RECOVERED_CONFIRMED (canonical proof found)
RECONCILIATION_REQUIRED → reconcile() → SAFE_TO_RETRY (not yet attempted onchain)
RECONCILIATION_REQUIRED → reconcile() → STILL_AMBIGUOUS (no proof available)
RECONCILIATION_REQUIRED → reconcile() → CANONICAL_CONFLICT (state mismatch)
```

## Create Recovery

- **Uncertainty case**: Transaction broadcast but tx_hash not persisted before crash
- **Canonical evidence**: JobCreated event in transaction receipt (requires tx_hash)
- **Implemented recovery path**: If `tx_hash` exists → check receipt for JobCreated event with matching client/provider
- **Safe retry conditions**: None — without tx_hash, creation is fundamentally ambiguous
- **Unresolved ambiguity**: If process crashes before persisting tx_hash, operation remains `STILL_AMBIGUOUS`. This is documented as an inherent limitation.

## Budget Recovery

- **Canonical source**: `getJob(jobId).budget` on ERC-8183 contract
- **Recovery**: Budget matches expected → `RECOVERED_CONFIRMED`. Budget is 0 → `SAFE_TO_RETRY`. Budget differs → `CANONICAL_CONFLICT`
- **Duplicate prevention**: Cannot set budget twice if already set (canonical conflict)

## Approval Recovery

- **Canonical source**: Transaction receipt (ERC-20 allowance is shared mutable state)
- **Recovery**: If `tx_hash` exists → check receipt status. If success → `RECOVERED_CONFIRMED`. If fail → `SAFE_TO_RETRY`
- **Conservative design**: Without `tx_hash`, remains `STILL_AMBIGUOUS` — allowance may have been changed by another operation
- **Duplicate prevention**: Re-approving same amount is idempotent at contract level

## Fund Recovery

- **Canonical source**: `getJob(jobId).status` on ERC-8183 contract
- **Recovery**: Status 1 (FUNDED) → `RECOVERED_CONFIRMED`. Status 0 (CREATED) → `SAFE_TO_RETRY`. Status 2+ (SUBMITTED+) → `CANONICAL_CONFLICT`
- **Duplicate prevention**: Cannot fund an already-funded job (canonical conflict)
- **Test coverage**: Fund crash test with canonical FUNDED state proves recovery

## Submit Recovery

- **Canonical source**: JobSubmitted event in transaction receipt + `getJob(jobId).status`
- **Recovery**: If `tx_hash` exists → check receipt for JobSubmitted event with matching deliverable hash. If job status >= 2 → check `submission_tx_hash` for event. Status < 2 → `SAFE_TO_RETRY`
- **Duplicate prevention**: Deliverable hash mismatch → `CANONICAL_CONFLICT`
- **Test coverage**: Submit crash test with matching deliverable hash proves recovery

## Evaluation / Resolution Recovery

- **Canonical source**: `getJob(jobId).status` (3=COMPLETE, 4=REJECTED) + verdict in `protected_job_runs`
- **Recovery**: If `tx_hash` exists → check receipt + verify final status matches verdict. If job status 3/4 with matching verdict in run → `RECOVERED_CONFIRMED`. Status 2 → `SAFE_TO_RETRY`
- **Duplicate prevention**: Verdict nonce + contract replay protection
- **Test coverage**: Resolution crash test with COMPLETE state proves recovery

## Canonical Sources of Truth

| Operation | Canonical Source | Evidence |
|-----------|-----------------|----------|
| create | Transaction receipt | JobCreated event |
| budget | `getJob(jobId).budget` | Budget comparison |
| approve | Transaction receipt | Receipt status |
| fund | `getJob(jobId).status` | Status == 1 |
| submit | Transaction receipt + `getJob(jobId).status` | JobSubmitted event + deliverable hash |
| evaluate | `getJob(jobId).status` + run verdict | Status matches verdict |

## Idempotency Strategy

1. **Request hash**: Each operation stores `hashJSON(request)` for idempotency comparison
2. **Operation lock**: `ON CONFLICT(job_run_id,operation) DO NOTHING` prevents duplicate inserts
3. **Reconciliation**: Before retrying, canonical state is inspected to determine actual outcome
4. **Safe retry**: Only allowed when canonical state proves operation was never attempted (status 0 for fund, status < 2 for submit, etc.)

## Crash Windows Covered

| Operation | Crash Window | Canonical Proof | Recovery Implemented | Duplicate Prevented | Test |
| --------- | ------------ | --------------- | -------------------- | ------------------- | ---- |
| create | tx broadcast, no local confirm | JobCreated event in receipt | Partial (requires tx_hash) | Yes | Yes |
| budget | budget tx broadcast | getJob().budget | Yes | Yes | Yes |
| approve | approve tx broadcast | Transaction receipt | Yes (with tx_hash) | Yes | Yes |
| fund | fund tx broadcast | getJob().status | Yes | Yes | Yes |
| submit | submit tx broadcast | JobSubmitted event + deliverable hash | Yes | Yes | Yes |
| evaluate | resolve tx broadcast | getJob().status + verdict | Yes | Yes | Yes |

## Remaining Ambiguities

1. **Create without tx_hash**: If process crashes before persisting the transaction hash after broadcast, the create operation cannot be deterministically recovered. The operation remains `STILL_AMBIGUOUS`. This is an inherent limitation — the system cannot know if a transaction was broadcast without a hash.

2. **Approve without tx_hash**: ERC-20 allowance is shared mutable state. Without a transaction hash to verify, the system cannot safely determine if a previous approve succeeded. The operation remains `STILL_AMBIGUOUS`.

3. **Submit with mismatched deliverable**: If a submit transaction succeeded but with a different deliverable hash than expected, this is correctly detected as `CANONICAL_CONFLICT` but requires operator intervention.

## Security Review

- No unsafe state inference: `STILL_AMBIGUOUS` is returned when proof is insufficient
- Canonical conflict detection prevents duplicate external calls
- Request hash comparison prevents idempotency conflicts
- Transaction receipt verification ensures actual on-chain confirmation
- Reconciliation attempt counter enables monitoring without blocking
- Advisory locks prevent concurrent reconciliation attempts on the same operation

## Validation Results

```
npm test: 164 tests, 164 pass, 0 fail
npm run typecheck: clean (0 errors)
npm run test:contracts: 24 passed, 0 failed
```

## Final Classification

`IMPLEMENTED_TESTED`

All 6 Protected Job operations have deterministic reconciliation implemented with canonical Arc/ERC-8183 state inspection. The production code correctly handles all four reconciliation outcomes: `RECOVERED_CONFIRMED`, `SAFE_TO_RETRY`, `STILL_AMBIGUOUS`, and `CANONICAL_CONFLICT`. Duplicate external transactions are prevented through canonical state verification before retry.

The create and approve operations have documented limitations where recovery is impossible without transaction hash persistence, correctly returning `STILL_AMBIGUOUS` in those cases.
