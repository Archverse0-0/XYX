# Worker A — API Config Coupling Audit

## Current Blocked State

This is an independent, read-only audit of Worker A's A0 configuration
blocker. The repository is `/home/pupulion/xyx_eth_online`, branch `master`,
HEAD `a85c8e22d531904c2349eebe9a3af9845ecf0657`. Existing dirty worktree
changes were not modified.

The intended API launch script is the root `package.json` entry:

```text
tsx --env-file-if-exists=.env apps/api/src/main.ts
```

Presence-only parsing of `.env` plus the current parent environment found these
missing values:

```text
DATABASE_URL
INTERNAL_SERVICE_TOKEN
PRIVY_APP_ID
PRIVY_VERIFICATION_KEY
OPERATOR_PRIVY_DID
WITNESS_URL
LLM_COMPLETIONS_URL
LLM_MODEL
LLM_API_KEY
IPFS_API_URL
PROTECTED_JOB_PROVIDER_ADDRESS
```

The API schema rejects the resolved environment before route registration. The
configured public `XYX_EVALUATOR_ADDRESS` resolves to
`0xC421bAfc9df025C521D2619e63FCBB71dBF2BF1b`, while the deployed manifest
target is `0xCEBFedAc66B0fFfAD452D3f1B356D1A3120dB233`. This is a separate
correctness blocker, not a missing-field coupling issue. The configured public
Evidence Registry address also differs from the deployed manifest; that affects
Open Purchase/Witness operation, not Protected Job A2–A4.

No API process was started, no database connection or migration was attempted,
no environment was changed, and no live transaction or other external write
was performed.

## apiConfig Field Matrix

Source: `packages/shared/src/config.ts`. `apiConfig` is a single schema built by
merging `baseConfig`, Circle execution credentials, Privy, Witness, LLM, API
port, and storage refinement. There is no mode-specific API schema.

| Variable | Schema Requires? | Actual Consumer | Classification | Mode | First Required Phase | Should API Startup Require It? |
|---|---:|---|---|---|---|
| `DATABASE_URL` | YES | `poolFor`; selection/run/journal/reconciliation queries | `PROTECTED_JOB_REQUIRED_PRE_A4`, `SHARED_RUNTIME`, `GLOBAL_API_STARTUP_REQUIRED` | Shared; Protected + Open | A2 selection persistence | YES for the durable API; pool connection is lazy |
| `INTERNAL_SERVICE_TOKEN` | YES (`min(32)`) | API→Witness auth in health/evaluate; BuyerRuntime internal execution | `PROTECTED_JOB_REQUIRED_POST_A4`, `SHARED_RUNTIME`, `ACCIDENTALLY_GLOBAL` for A1–A4 | Open Purchase + Protected post-A4 | A11/A12 for Protected | NO for A1–A4 alone; YES for the current full API |
| `PRIVY_APP_ID` | YES | Global `onRequest` `verifyAccessToken` | `GLOBAL_API_STARTUP_REQUIRED`, `PROTECTED_JOB_REQUIRED_PRE_A4`, `SHARED_RUNTIME` | Shared auth | A2/A3 route access | YES |
| `PRIVY_VERIFICATION_KEY` | YES | Global `onRequest` `verifyAccessToken` | `GLOBAL_API_STARTUP_REQUIRED`, `PROTECTED_JOB_REQUIRED_PRE_A4`, `SHARED_RUNTIME` | Shared auth | A2/A3 route access | YES |
| `OPERATOR_PRIVY_DID` | YES (`did:privy:`) | `claims.user_id` ownership check | `GLOBAL_API_STARTUP_REQUIRED`, `PROTECTED_JOB_REQUIRED_PRE_A4`, `SHARED_RUNTIME` | Shared auth | A2/A3 route access | YES |
| `WITNESS_URL` | YES (URL) | API health and `/jobs/:id/evaluate` → `/internal/resolve-job`; BuyerRuntime `/internal/execute` | `PROTECTED_JOB_REQUIRED_POST_A4`, `SHARED_RUNTIME`, `ACCIDENTALLY_GLOBAL` for A1–A4 | Open Purchase + Protected post-A4 | A11/A12 for Protected | NO for A1–A4; current eager schema says YES |
| `LLM_COMPLETIONS_URL` | YES (URL) | `Planner` HTTP requests | `OPEN_PURCHASE_ONLY`, `ACCIDENTALLY_GLOBAL` | Open Purchase/agent runtime | Open Purchase planning | NO for Protected A1–A4; current eager schema says YES |
| `LLM_MODEL` | YES | `Planner` request payload | `OPEN_PURCHASE_ONLY`, `ACCIDENTALLY_GLOBAL` | Open Purchase/agent runtime | Open Purchase planning | NO for Protected A1–A4; current eager schema says YES |
| `LLM_API_KEY` | YES | `Planner` Authorization header | `OPEN_PURCHASE_ONLY`, `ACCIDENTALLY_GLOBAL` | Open Purchase/agent runtime | Open Purchase planning | NO for Protected A1–A4; current eager schema says YES |
| `IPFS_PROVIDER` | NO (default `kubo`) | `evidenceStorageFromEnvironment` | `PROTECTED_JOB_REQUIRED_POST_A4`, `SHARED_RUNTIME`, `OPTIONAL` (default) | Evidence shared by Witness/API | A8/A10 after submit | NO for A1–A4 |
| `IPFS_API_URL` | Conditional; effectively YES for default Kubo | Kubo storage factory and read/write | `PROTECTED_JOB_REQUIRED_POST_A4`, `SHARED_RUNTIME`, `ACCIDENTALLY_GLOBAL` for A1–A4 | Evidence shared by Witness/API | A8/A10 (API submit/evaluator evidence) | NO for A1–A4; eager storage/init currently blocks |
| `IPFS_AUTHORIZATION` | NO | Optional Kubo request header | `OPTIONAL`, `PROTECTED_JOB_REQUIRED_POST_A4` only when configured | Evidence | A8/A10 if used | NO |
| `IPFS_GATEWAY_URL` | Conditional for Pinata | Pinata readback/storage factory | `OPTIONAL`, `PROTECTED_JOB_REQUIRED_POST_A4` for Pinata | Evidence | A8/A10 if Pinata | NO for current Kubo mode |
| `PINATA_JWT` | Conditional for Pinata | Pinata upload/health | `OPTIONAL`, `PROTECTED_JOB_REQUIRED_POST_A4` for Pinata | Evidence | A8/A10 if Pinata | NO for current Kubo mode |
| `ARC_RPC_URL` | YES | Arc clients, chain reads, selection and ProtectedJobService | `GLOBAL_API_STARTUP_REQUIRED`, `PROTECTED_JOB_REQUIRED_PRE_A4`, `SHARED_RUNTIME` | Shared; Protected + Open | A1/A2 | YES |
| `CIRCLE_AGENT_ADDRESS` | YES (non-zero address) | Circle wallet, balance, job participants and journal rows | `GLOBAL_API_STARTUP_REQUIRED`, `PROTECTED_JOB_REQUIRED_PRE_A4`, `SHARED_RUNTIME` | Shared buyer; Protected + Open | A3 create | YES |
| `GRAPH_URL` | YES | `GraphClient` queries and freshness | `GLOBAL_API_STARTUP_REQUIRED`, `PROTECTED_JOB_REQUIRED_PRE_A4`, `SHARED_RUNTIME` | Shared; Protected A2 + Open | A2 | YES |
| `GRAPH_DEPLOYMENT_ID` | YES | `GraphClient` deployment validation | `GLOBAL_API_STARTUP_REQUIRED`, `PROTECTED_JOB_REQUIRED_PRE_A4`, `SHARED_RUNTIME` | Shared; Protected A2 + Open | A2 | YES |
| `MAX_GRAPH_LAG_BLOCKS` | NO (default `50`) | SelectionEngine freshness policy | `OPTIONAL`, `PROTECTED_JOB_REQUIRED_PRE_A4` via default policy | Shared; Protected A2 + Open | A2 | No explicit value needed when default is acceptable |
| `EVIDENCE_REGISTRY_ADDRESS` | YES | Not consumed by API code; consumed by Witness for Receipt anchoring | `OPEN_PURCHASE_ONLY`, `ACCIDENTALLY_GLOBAL` | Open Purchase only | Open Purchase anchor | NO for Protected A1–A4; required by monolithic base schema |
| `XYX_EVALUATOR_ADDRESS` | YES (non-zero address) | ProtectedJobService participant checks/create; reconciler; Witness resolver | `GLOBAL_API_STARTUP_REQUIRED`, `PROTECTED_JOB_REQUIRED_PRE_A4`, `SHARED_RUNTIME` | Protected | A3 create participant | YES, and it must match the deployed target |
| `ERC8183_ADDRESS` | NO (defaults to `packages/erc8183/deployment.json`) | ProtectedJobService/reconciler and job participant checks | `OPTIONAL` by schema, `PROTECTED_JOB_REQUIRED_PRE_A4` after resolution | Protected | A1/A3 | YES as a resolved correct address |
| `MAX_JOB_USDC` | NO (default `5`) | Protected job budget guard and Witness evaluator | `OPTIONAL`, `PROTECTED_JOB_REQUIRED_PRE_A4` via default policy | Protected | A2/A3 | No explicit value needed when default policy is acceptable |
| `CIRCLE_API_KEY` | YES | Circle Developer-Controlled Wallet SDK | `GLOBAL_API_STARTUP_REQUIRED`, `PROTECTED_JOB_REQUIRED_PRE_A4`, `SHARED_RUNTIME` | Buyer execution; Protected + Open | A3 create | YES |
| `CIRCLE_ENTITY_SECRET` | YES | Circle Developer-Controlled Wallet SDK | `GLOBAL_API_STARTUP_REQUIRED`, `PROTECTED_JOB_REQUIRED_PRE_A4`, `SHARED_RUNTIME` | Buyer execution; Protected + Open | A3 create | YES |
| `API_PORT` | NO (default `3001`) | `app.listen` | `OPTIONAL`, `GLOBAL_API_STARTUP_REQUIRED` only as resolved default | API runtime | Startup | No, default exists |
| `PROTECTED_JOB_PROVIDER_ADDRESS` | NO in schema | `registerJobs` service construction, `configured()`, candidate wallet, participant checks | `PROTECTED_JOB_REQUIRED_PRE_A4` | Protected | A2 provider selection (and A3 create) | NO as a process-start requirement; YES for Protected routes |

## Database

`apps/api/src/main.ts:14–17` calls `loadConfig(apiConfig)`, then constructs a
Postgres pool with `poolFor(cfg.DATABASE_URL)`. `poolFor` creates a lazy
`pg.Pool`; it does not prove a connection at process construction. `/healthz`
and `/readyz` issue `SELECT 1`, and job routes issue queries when called.

The database is nevertheless a genuine Protected Job A2–A4 business
requirement, not merely a schema preference:

| Step | File | Function/route | Requires DB? | Why |
|---|---|---|---:|---|
| A2 | `apps/api/src/jobs.ts:91–118` | `POST /api/v1/jobs/select-provider` | YES | Persists `users` and the signed/hash-linked `provider_selections` result before create |
| A3 | `apps/api/src/jobs.ts:121–173` | `POST /api/v1/jobs` | YES | Locks/consumes selection, persists `protected_job_runs`, and executes `jobOperation` idempotency journal |
| A3/A4 | `apps/api/src/jobs.ts:165–172` | `jobOperation(..., 'create', ...)` | YES | Durable operation result and chain job linkage |
| A5 onward | `apps/api/src/jobs.ts:177+` | fund/submit/evaluate/refund | YES | Job ownership, operation journal, deliverable/evidence references, reconciliation |

The migrations define `provider_selections` in `004_provider_selections.sql`,
`protected_job_runs` and run data in `001_initial.sql`, `job_operations` in
`002_job_operations.sql`, and reconciliation columns/indexes in
`003_reconciliation.sql`. No legitimate DB-less production A2/A3 entrypoint was
found. Test helpers do not count as production architecture.

Verdict: `DATABASE_BLOCKER = VALIDATED`. It is required for the intended
durable A2/A3 path. The current process also requires the value at config load,
but does not connect until health or a DB-backed route.

## Privy

`apps/api/src/main.ts:20–28` installs one `onRequest` hook. Only the exact
`/healthz` and `/readyz` URLs are excluded. Every other route, including
`POST /api/v1/jobs/select-provider` and `POST /api/v1/jobs`, requires a Bearer
token verified with `PRIVY_APP_ID` and `PRIVY_VERIFICATION_KEY`; the verified
`claims.user_id` must equal `OPERATOR_PRIVY_DID`.

No active, intended internal production route, CLI, or direct Buyer Agent
entrypoint was found that creates a Protected Job while preserving the same
auth, selection persistence, Circle buyer, idempotency, and reconciliation
controls. A test harness or direct contract call would be a bypass, not a
legitimate alternative.

Verdict: `PRIVY_BLOCKER = VALIDATED`; `NO_AUTH_BYPASS_CLAIM = VALIDATED`.

## Internal Service Auth

`INTERNAL_SERVICE_TOKEN` is not needed by the A2 selection route or A3 create
route business logic. It is used in `apps/api/src/main.ts:39` for the Witness
health request, in `apps/api/src/jobs.ts:240–242` for Protected Job evaluation,
and in `apps/buyer-agent/src/runtime.ts:74` for Open Purchase execution. It is
also required by the Witness process to authenticate those calls.

Therefore it is a legitimate later Protected Job/Open Purchase trust-boundary
credential, but it is not a Protected Job A1–A4 business requirement. The
monolithic API schema still prevents startup without it.

## Witness Configuration

`WITNESS_URL` is passed into `BuyerRuntime` at API construction, used for the
API health probe, and used by the Protected Job `/evaluate` route to call
Witness `/internal/resolve-job`. The Witness resolver performs the deterministic
evaluation, evidence persistence, EIP-712 evaluator signature, and resolution
path. Thus Witness is not Open Purchase-only in this implementation: it is a
Protected Job post-A4 dependency. It is not needed for A2 selection or A3/A4
create.

Verdict: later Protected Job requirement, but an early startup blocker due the
eager all-mode schema.

## LLM Configuration

`apps/api/src/main.ts:16` eagerly constructs `Planner` from the three LLM
fields. `Planner` is called by `BuyerRuntime.assess/run` (`apps/buyer-agent/src/runtime.ts:20–32,51–60`) for discovery, request shaping, and intent parsing. The Protected Job route
`/api/v1/jobs/select-provider` instead calls the deterministic
`SelectionEngine` directly (`apps/api/src/jobs.ts:91–108`), and
`/api/v1/jobs` accepts the canonical job specification and calls
`canonicalJobSpec` before Circle `createJob` (`apps/api/src/jobs.ts:121–170`).

No LLM field is consumed by Protected Job A1–A4. The schema's unconditional
LLM requirement is confirmed accidental cross-mode startup coupling for that
scope.

## IPFS Configuration

`storageConfig` makes `IPFS_API_URL` optional syntactically but
`validateStorage` adds an error when the default `IPFS_PROVIDER=kubo` has no
API URL. `apps/api/src/jobs.ts:45–46` then calls
`evidenceStorageFromEnvironment(cfg)` unconditionally during route
registration and throws if no storage is constructed.

The first Protected Job API storage use is after an external provider
submission: `/api/v1/jobs/:jobId/submit` verifies the on-chain submission and
then reads or persists the deliverable (`apps/api/src/jobs.ts:205–227`).
Witness later reads that deliverable and persists Protected Job evidence during
`resolveJob` (`apps/witness/src/service.ts:183–213`). IPFS is therefore not an
A1–A4 business requirement, although the current eager initialization and
schema make it an A0 startup blocker.

## False Blocker Test

This table separates business necessity for Protected Job A1–A4 from the
current startup behavior:

| Missing variable | Needed by A1–A4 business logic? | Current implementation prevents API startup? | Result |
|---|---|---|---|
| `DATABASE_URL` | YES — A2 selection persistence and A3 run/journal persistence | YES, `apiConfig` rejects it | BUSINESS REQUIREMENT |
| `INTERNAL_SERVICE_TOKEN` | NO for A1–A4; LATER for Witness evaluation/internal calls | YES, schema rejects it | CONFIG-SCHEMA COUPLING (later legitimate) |
| `PRIVY_APP_ID` | YES — protected routes are behind the global auth hook | YES | BUSINESS REQUIREMENT |
| `PRIVY_VERIFICATION_KEY` | YES — token verification | YES | BUSINESS REQUIREMENT |
| `OPERATOR_PRIVY_DID` | YES — ownership binding after token verification | YES | BUSINESS REQUIREMENT |
| `WITNESS_URL` | NO for A1–A4; LATER for Protected Job resolve | YES | INITIALIZATION COUPLING (later legitimate) |
| `LLM_COMPLETIONS_URL` | NO — deterministic Protected selection/create do not call Planner | YES | ACCIDENTALLY_GLOBAL / OPEN PURCHASE ONLY |
| `LLM_MODEL` | NO — same | YES | ACCIDENTALLY_GLOBAL / OPEN PURCHASE ONLY |
| `LLM_API_KEY` | NO — same | YES | ACCIDENTALLY_GLOBAL / OPEN PURCHASE ONLY |
| `IPFS_API_URL` | NO for A1–A4; LATER for deliverable/evidence provenance | YES via Kubo refinement and eager storage | INITIALIZATION COUPLING (later legitimate) |
| `PROTECTED_JOB_PROVIDER_ADDRESS` | YES — service and selection route require a configured provider | NO at process startup; Protected routes fail closed | ROUTE-LEVEL BUSINESS REQUIREMENT |

Thus absence of the three LLM fields is a false pre-A4 blocker in business
terms, while absence of DB, Privy, provider configuration, and a correct
evaluator is not.

## Protected Job Provider Configuration

`PROTECTED_JOB_PROVIDER_ADDRESS` is optional in the Zod schema, but
`apps/api/src/jobs.ts:41–56` constructs `ProtectedJobService` only when it is
present. Without it, `configured()` throws `PROTECTED_JOB_NOT_CONFIGURED`; the
selection route itself calls `configured()` before running SelectionEngine, and
the create route does the same. The candidate wallet, create participant, and
database participant checks all use this configured address. No ERC-8004 lookup
fallback supplies it to the API service.

Verdict: `LEGITIMATE_PROTECTED_JOB_RUNTIME_REQUIREMENT`, first required at A2
and again at A3. It does not prevent the process from listening by schema alone,
but it prevents the Protected Job routes from operating.

## XYXEvaluator Mismatch

The resolved API value is the public address
`0xC421bAfc9df025C521D2619e63FCBB71dBF2BF1b`, read from `.env` (the schema has
no evaluator default). The current deployment manifest records
`0xCEBFedAc66B0fFfAD452D3f1B356D1A3120dB233` for `XYXEvaluator`.

`apps/api/src/jobs.ts:143,168` stores and passes the configured evaluator into
the fresh ERC-8183 job, while `verifyParticipants` and reconciliation compare
against that same value. Witness `resolveJob` independently checks its
configured evaluator contract and the job's evaluator before signing/resolving
(`apps/witness/src/service.ts:183–193`). A fresh job created with the current
wrong value would commit the wrong evaluator participant and cannot satisfy the
deployed XYXEvaluator resolution/domain path. This is a
`CRITICAL_PRE_CREATE_BLOCKER`, not a harmless configuration alias.

## Pre-A4 Genuine Requirements

These are the values/configurations the current intended Protected Job A1–A4
business path genuinely needs (with defaults allowed where stated):

- `DATABASE_URL` with the required migrated schema and a reachable DB.
- `PRIVY_APP_ID`, `PRIVY_VERIFICATION_KEY`, and `OPERATOR_PRIVY_DID` for the
  mandatory API auth/ownership hook.
- `ARC_RPC_URL` resolving Arc Testnet, and valid `GRAPH_URL` plus
  `GRAPH_DEPLOYMENT_ID` for A1/A2 freshness and history.
- `CIRCLE_API_KEY`, `CIRCLE_ENTITY_SECRET`, and the expected
  `CIRCLE_AGENT_ADDRESS` for the Circle buyer.
- A correct `ERC8183_ADDRESS` (the deployment default is acceptable only if it
  resolves to the deployed contract).
- `XYX_EVALUATOR_ADDRESS` matching the deployed evaluator target exactly.
- `PROTECTED_JOB_PROVIDER_ADDRESS` matching the selected controlled provider
  address; the current code does not derive this from ERC-8004.
- The existing `MAX_GRAPH_LAG_BLOCKS` and `MAX_JOB_USDC` defaults are policy
  defaults, not additional missing secrets.

## Configuration Coupling Requirements

These are not needed by Protected Job A1–A4 business logic, but the current
monolithic schema/eager initialization still blocks API startup without them:

- `LLM_COMPLETIONS_URL`, `LLM_MODEL`, `LLM_API_KEY` — Open Purchase/agent
  Planner only.
- `EVIDENCE_REGISTRY_ADDRESS` — Witness/Open Purchase Receipt anchoring only;
  not consumed by the API Protected Job routes.
- `WITNESS_URL` and `INTERNAL_SERVICE_TOKEN` — legitimate later Protected Job
  evaluator/Witness and Open Purchase internal calls, but imposed before A4.
- `IPFS_API_URL` and the conditional storage credentials (`IPFS_PROVIDER`,
  `IPFS_AUTHORIZATION`, `IPFS_GATEWAY_URL`, `PINATA_JWT`) — evidence-phase
  dependencies eagerly instantiated during API route registration.

The current implementation has one eager `apiConfig`; it has no lazy feature
configuration, feature flag, or mode-specific startup schema that would isolate
these fields.

## Recommended Minimum Remediation

NO EXECUTION. This audit made no remediation. The minimum operator/configuration
work is to provide genuine values and schema for the pre-A4 list, ensure the DB
migrations already exist, and correct the evaluator address to the deployed
target before any create attempt. The later/Open Purchase values must be
provided before their respective flows are invoked; inventing LLM, Witness, or
IPFS values would not be valid evidence. A future implementation may separate
or lazily initialize mode-specific configuration, but that was not changed in
this audit.

## Live Actions

NONE

## Source Changes

NONE except this audit report. `packages/shared/src/config.ts`, API routes, and
all other production files were left untouched.

## Secrets Exposed

NONE. Only presence/absence and public address comparisons were used. No secret
values, tokens, private keys, or environment-file contents were copied into
this report.

## Reverification Checkpoint

At 2026-09-13T02:37:16Z the same intended launch context was rechecked. The
eleven missing runtime variables listed above remain absent; `apiConfig` still
fails on the nine base/API fields before storage refinement is reached. The
configured evaluator remains `0xC421bAfc9df025C521D2619e63FCBB71dBF2BF1b` and
still does not match the deployed manifest target. Arc configuration, Graph
configuration, Circle credentials, and Circle buyer address remain present by
presence-only checks; no operational readiness claim is inferred from that.

The existing `graphify-out/graph.json` contains archive-path references, so its
query output was treated as stale context and not used to override direct active
source tracing. No graph rebuild was run because this audit permits exactly one
new report and prohibits unrelated writes.

## Final Classification

`CONFIG_COUPLING_PARTIALLY_CONFIRMED`

The A0 state is genuinely blocked for the intended production Protected Job
path: DB, Privy, core chain/Graph/Circle configuration, provider address, and a
correct deployed evaluator are real prerequisites. Independently, the audit
confirms that the current all-mode startup schema adds pre-A4 blockers for
LLM, Evidence Registry, storage, and later Witness/internal-auth fields. The
coupling is therefore real but not every missing field is accidental: Witness,
internal auth, and IPFS are legitimate later Protected Job requirements.
