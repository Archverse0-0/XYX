# Codex Independent Audit — Worker A A0

## Scope

This is an independent, adversarial, read-only audit of Worker A's A0
blocker result. The audit did not create, fund, submit, resolve, refund, or
otherwise mutate a job; it did not alter production source, environment files,
the database, or the target report. No private values were printed.

Active source was inspected directly. The repository `graphify-out/graph.json`
was found to contain nodes sourced from forbidden historical paths and was not
trusted. A separate temporary graphify extraction was built from active code
only (165 code files; no archive paths) and used only as a navigation aid.

Arc-specific facts were checked against the official Arc documentation for
[network parameters](https://docs.arc.io/arc/references/rpc-endpoints) and the
[ERC-8183 Arc deployment](https://docs.arc.io/arc/tutorials/create-your-first-erc-8183-job).

## Audit Target

`docs/workers/A_LIVE_HERO_PATH.md`

The target report concludes `A0: BLOCKED` with stop code
`A0_REAL_INFRA_BLOCKER`, principally citing missing `DATABASE_URL`, the three
Privy variables, and `PROTECTED_JOB_PROVIDER_ADDRESS`.

The requested `docs/XYX_TECHNICAL_PRD_v1.2.md` and historical
`docs/XYX_TECHNICAL_PRD_v1.1.md` paths are absent in this checkout. The active
forward document present is `docs/XYX_TECHNICAL_PRD_v1.2_FINAL.md`; no archive
document was consulted.

## Repository Baseline

- Repository: `/home/pupulion/xyx_eth_online`
- Branch: `master`
- HEAD: `a85c8e22d531904c2349eebe9a3af9845ecf0657`
- Baseline was dirty before this report. Dirty paths included the prior
  provider/API repair files, web/provider UI files, verification scripts,
  package-lock/package changes, implementation notes, worker reports, and
  untracked prompt/test files. A complete `git status --short` was read; no
  cleanup was attempted.

## Claude Claims Extracted

| Claim ID | Claude claim | Evidence Claude cites | Initial audit status |
|---|---|---|---|
| A0-01 | API starts with `tsx --env-file-if-exists=.env apps/api/src/main.ts` | root package script | UNVERIFIED |
| A0-02 | API configuration is `.env` plus parent environment; `.env.witness` is not an API source | runtime discussion | UNVERIFIED |
| A0-03 | `DATABASE_URL` is absent | presence table | UNVERIFIED |
| A0-04 | Privy app ID, verification key, and operator DID are absent | presence table | UNVERIFIED |
| A0-05 | `loadConfig(apiConfig)` fails before route registration | `apps/api/src/main.ts` and config | UNVERIFIED |
| A0-06 | Database is required before M3/A2 and A3 | DB persistence/journal discussion | UNVERIFIED |
| A0-07 | Privy protects all non-health routes and there is no legitimate auth bypass | `onRequest` hook | UNVERIFIED |
| A0-08 | `PROTECTED_JOB_PROVIDER_ADDRESS` is required by Protected Job routes | `ProtectedJobService` discussion | UNVERIFIED |
| A0-09 | `.env.witness` must not be sourced wholesale into API | signer isolation | UNVERIFIED |
| A0-10 | Arc, ERC-8183, and evaluator configuration are ready | dependency matrix | UNVERIFIED |
| A0-11 | ERC-8004 and Graph are ready | dependency matrix | UNVERIFIED |
| A0-12 | Circle is ready for A3 | dependency matrix | UNVERIFIED |
| A0-13 | A0 must stop before A1/A2/A3/A4 | final classification | UNVERIFIED |

## X2 API Startup Audit

The root `package.json` line 11 is exactly:

```text
"api": "tsx --env-file-if-exists=.env apps/api/src/main.ts"
```

No API-specific package script or wrapper was found. `compose.yaml` defines only
Postgres and IPFS services, not an API process. No active deployment wrapper,
dotenv import, or `.env.local`/`.env.deploy` loader for `apps/api/src/main.ts`
was found.

`CLAUDE_API_START_COMMAND: VALIDATED`.

## X3 Runtime Environment Sources

| Source | Used by intended API path? | Automatic? | Evidence |
|---|---:|---:|---|
| `.env` | YES | YES | npm `api` script passes `--env-file-if-exists=.env` |
| Parent `process.env` | YES | YES | Node process environment is read by `loadConfig`; deployment injection would arrive here |
| `.env.witness` | NO | NO | Only the `witness` npm script passes this file; API source has no such loader |
| `.env.local` / `.env.deploy` | NO | NO | No reference from API startup or `main.ts` |
| Deployment manifest fallback | ONLY ERC-8183 schema default | NO | `config.ts` imports `packages/erc8183/deployment.json` only for `ERC8183_ADDRESS.default(...)` |
| Wrapper/config JSON | NO | NO | No active API wrapper or config-file loader found |

The target report's runtime-source description is directionally correct, but its
later wording that `.env` is the “sole” API source omits the legitimate parent
environment. `CLAUDE_ENV_SOURCE_CLAIM: PARTIALLY_VALIDATED`.

## X4 Missing Variable Verification

Presence was checked without printing values. The current shell parent
environment had none of these keys. The API `.env` file had none of these keys.
No other legitimate API source supplied them.

| Variable | `.env` | Parent env | Other legit source | Runtime resolved? |
|---|---|---|---|---|
| `DATABASE_URL` | ABSENT | ABSENT | ABSENT | NO |
| `PRIVY_APP_ID` | ABSENT | ABSENT | ABSENT | NO |
| `PRIVY_VERIFICATION_KEY` | ABSENT | ABSENT | ABSENT | NO |
| `OPERATOR_PRIVY_DID` | ABSENT | ABSENT | ABSENT | NO |
| `PROTECTED_JOB_PROVIDER_ADDRESS` | ABSENT | ABSENT | ABSENT | NO |

The API `.env` key set also lacked `INTERNAL_SERVICE_TOKEN`, `WITNESS_URL`,
`LLM_COMPLETIONS_URL`, `LLM_MODEL`, `LLM_API_KEY`, and `IPFS_API_URL`.

The `.env.witness` key names include `DATABASE_URL` and role-secret names, but
that file is not an API runtime source and was not sourced.

## X5 API Config Schema

Source: `packages/shared/src/config.ts` lines 17–34.

| Variable | Schema status | Default/fallback | Startup-required? |
|---|---|---|---|
| `DATABASE_URL` | `z.string().min(1)` in `baseConfig` | none | YES |
| `PRIVY_APP_ID` | `z.string().min(1)` in `apiConfig` | none | YES |
| `PRIVY_VERIFICATION_KEY` | `z.string().min(1)` in `apiConfig` | none | YES |
| `OPERATOR_PRIVY_DID` | `z.string().startsWith('did:privy:')` in `apiConfig` | none | YES |
| `PROTECTED_JOB_PROVIDER_ADDRESS` | `address.optional()` in `apiConfig` | none | NO at schema load; YES for Protected Job mutation routes |

`INTERNAL_SERVICE_TOKEN`, `WITNESS_URL`, all three `LLM_*` fields, Circle
credentials, RPC, Graph, buyer, registry, and evaluator fields are also in the
startup schema. Storage validation requires `IPFS_API_URL` when the default
provider is Kubo. `loadConfig` additionally rejects witness/evaluator/relayer
private-key names when called with `apiConfig`.

## X6 Startup Failure Ordering

Static execution order in `apps/api/src/main.ts` is:

1. `loadConfig(apiConfig)` at line 14.
2. `poolFor(cfg.DATABASE_URL)` and `GraphClient` construction.
3. `Planner` and `BuyerRuntime` construction.
4. Fastify application construction.
5. Auth and error hooks.
6. Health, wallet, agent, risk, service, and job route registration.
7. `registerJobs(...)`; this constructs the Protected Job service conditionally,
   creates storage, and throws `IPFS_STORAGE_CONFIGURATION_REQUIRED` if storage
   is absent.
8. `app.listen(...)`.

An isolated read-only invocation of `loadConfig(apiConfig, parseEnv(.env))`
returned only configuration issue names (no values):
`DATABASE_URL`, `INTERNAL_SERVICE_TOKEN`, `PRIVY_APP_ID`,
`PRIVY_VERIFICATION_KEY`, `OPERATOR_PRIVY_DID`, `WITNESS_URL`,
`LLM_COMPLETIONS_URL`, `LLM_MODEL`, and `LLM_API_KEY`. Supplying synthetic
in-memory placeholders for those fields then exposed the storage validator's
`IPFS_API_URL` issue.

Thus the claim that config failure precedes route registration is validated;
the target's provider-specific “constructor” wording is not.
`CLAUDE_STARTUP_FAILURE_CLAIM: PARTIALLY_VALIDATED`.

## X7 Database Blocker Audit

| Step | File | Function | Requires DB? | Why |
|---|---|---|---:|---|
| A2 selection request | `apps/api/src/jobs.ts:91-118` | `POST /api/v1/jobs/select-provider` | YES | Inserts `users` and `provider_selections`; validates/reconciles selection reuse |
| A2 selection computation | `packages/erc8004/src/selection-engine.ts:65-106` | `SelectionEngine.select` | NO | RPC, ERC-8004, Graph, and deterministic Risk reads only |
| A3 run journal | `apps/api/src/jobs.ts:121-164` | `POST /api/v1/jobs` | YES | Transactionally inserts `protected_job_runs`, locks selection, consumes selection |
| A3 operation safety | `packages/shared/src/job-operations.ts` | `jobOperation` / `withJobLock` | YES | Idempotency and `IN_FLIGHT`/`CONFIRMED`/reconciliation journal |
| A3 chain create | `packages/erc8183/service.ts:119-149` | `ProtectedJobService.create` | No direct DB | Simulates and delegates the Circle machine-wallet write |
| A3 persistence after receipt | `apps/api/src/jobs.ts:165-173` | create route continuation | YES | Stores job ID, tx hash, and run state after confirmed event |

`DATABASE_URL` is required by `baseConfig` with no fallback, and the intended
M3/A2 selection and A3 create paths both require durable persistence. The
direct `ProtectedJobService` library and `session-08` script are preflight/test
utilities, not an alternate production entrypoint; they do not provide the
authenticated selection-consumption and operation-journal path.

`DATABASE_BLOCKER: VALIDATED`
`FIRST_REQUIRED_PHASE: A2 (also A3)`

## X8 Privy Blocker Audit

`apps/api/src/main.ts:20-28` installs `onRequest` for every route except exact
`/healthz` and `/readyz`. It requires a Bearer token, calls
`verifyAccessToken` with `cfg.PRIVY_APP_ID` and `cfg.PRIVY_VERIFICATION_KEY`,
then requires `claims.user_id === cfg.OPERATOR_PRIVY_DID`. The create route is
registered under this hook and has no route-level opt-out.

`apps/web/components/client.tsx:4-10` obtains a Privy access token and sends it
to the backend. The only direct code callers of Protected Job creation are the
API route, the service library, and read-only/simulation test scripts. No
existing intended production internal route creates a job without this auth,
selection persistence, and Circle path.

`PRIVY_BLOCKER: VALIDATED`
`NO_AUTH_BYPASS_CLAIM: VALIDATED`

## X9 Provider Configuration Audit

The schema declares `PROTECTED_JOB_PROVIDER_ADDRESS` optional at
`packages/shared/src/config.ts:33`. `apps/api/src/jobs.ts:42-44` creates
`ProtectedJobService` only when it is present; otherwise `service` is `null`.
`configured()` at lines 53–56 throws `PROTECTED_JOB_NOT_CONFIGURED`, and both
`/api/v1/jobs/select-provider` and `/api/v1/jobs` call it before doing their
work. The fund, submit, and refund routes do the same.

No API fallback derives the provider from ERC-8004, a manifest, or a database.
Other names such as `PROVIDER_WALLET_ADDRESS` occur only in verifier/provider
UI code and are not aliases for this API configuration field.

The route-blocker conclusion is correct, but the claim that the value is
unconditionally required by the `ProtectedJobService` constructor is false: no
service is constructed when it is absent. `PROVIDER_ADDRESS_BLOCKER:
PARTIALLY_VALIDATED`; first required phase is A2 (selection endpoint), also A3.

## X10 Trust-Boundary Audit

Presence-only inspection of `.env.witness` showed names for
`WITNESS_PRIVATE_KEY`, `EVALUATOR_PRIVATE_KEY`, and `RELAYER_PRIVATE_KEY`, as
well as database/IPFS configuration. Values were not printed and the file was
not sourced into the API process.

Whole-file sourcing would expose independent signing roles to the API process.
The API config loader explicitly rejects those secret names with
`API_SIGNING_SECRETS_FORBIDDEN` (`packages/shared/src/config.ts:40-42`). Sharing
one approved `DATABASE_URL` value through a separately controlled API runtime
injection is not equivalent to importing the whole witness environment.

`WHOLESALE_ENV_WITNESS_TO_API: UNSAFE`

## X11 Claimed-Ready Dependency Audit

| Dependency | Claude says | Codex finds | Verdict |
|---|---|---|---|
| Arc RPC/chain | READY | Read-only RPC returned chain ID `5042002`; official Arc docs agree | VALIDATED |
| ERC-8183 | READY | Bytecode exists at `0x0747EEf0706327138c69792bF28Cd525089e4583`; `config.ts` has the deployment.json fallback | VALIDATED |
| XYXEvaluator live contract | READY | Bytecode exists; `agenticCommerce()` points to the ERC-8183 address; `paused()` is false; lifetime is 300 | VALIDATED |
| XYXEvaluator API config | READY | `.env` key is present but its value does not match the canonical deployed evaluator address; values were not printed | REJECTED |
| ERC-8004 | READY | Bytecode exists; `ownerOf(894335)` and `getAgentWallet(894335)` both equal `0x7ea90Ac2A2bA5fF6c71e7E9D23037D64AbD2b4da`; live `SelectionEngine.select` resolved agent `894335` | VALIDATED |
| Graph | READY | Canonical endpoint/deployment returned fresh metadata; live selection passed with indexed block `61813739`, head `61813750`, lag `11`, no indexing errors | VALIDATED |
| Circle | READY | Read-only SDK `session()` returned one live Arc wallet matching the configured buyer; no transaction was attempted | PARTIALLY_VALIDATED |
| USDC | not disputed | Bytecode exists; `symbol()` is `USDC`, `decimals()` is `6` | VALIDATED |
| XYXEvidenceRegistry API config | not disputed | `.env` key is present but its value does not match the canonical registry address; this is an Open Purchase/Witness issue, not the A3 create call | REJECTED |

The on-chain addresses checked were the public values in the active deployment
manifest. No transaction was sent.

## X12 A3 Static Call Graph

| # | File | Function/path | Auth? | DB? | Circle? | Chain write? |
|---:|---|---|---:|---:|---:|---:|
| 1 | `apps/api/src/main.ts:20-28` | Fastify `onRequest` | YES | NO | NO | NO |
| 2 | `apps/api/src/jobs.ts:91-118` | `POST /api/v1/jobs/select-provider` | YES | YES | Adapter constructed, no execute | NO (RPC reads) |
| 3 | `packages/erc8004/src/selection-engine.ts:65-106` | `SelectionEngine.select` | inherited | NO | NO | NO |
| 4 | `apps/api/src/jobs.ts:109-117` | Persist `provider_selections` | YES | YES | NO | NO |
| 5 | `apps/api/src/jobs.ts:121-164` | `POST /api/v1/jobs` journal/selection transaction | YES | YES | NO | NO |
| 6 | `apps/api/src/jobs.ts:165-173` | `jobOperation(..., 'create', ...)` | YES | YES | NO | NO |
| 7 | `packages/erc8183/service.ts:119-149` | `ProtectedJobService.create` | inherited | NO direct | YES | YES after simulation |
| 8 | `packages/circle-adapter/src/index.ts:102-131` | `CircleAdapter.execute` | inherited | NO | YES | YES through Circle API |
| 9 | `packages/erc8183/service.ts:139-149` and `jobs.ts:171` | Receipt/event verification and run update | inherited | YES | NO further call | NO |

The call graph proves that missing DB, Privy, provider configuration, and the
startup schema dependencies are load-bearing for the intended A3 production
path. It also shows that the stale evaluator address in `.env` would make the
API use the wrong evaluator even if the process could start.

## X13 Attempted Falsification of Claude Blockers

- Provider configuration is not a schema-startup blocker; it is an explicit
  route blocker. This falsifies the constructor-specific wording but not the
  A2/A3 operational effect.
- ERC-8183 has a real deployment-manifest fallback in `config.ts`, so an absent
  `ERC8183_ADDRESS` key is not itself a blocker.
- A2 computation can run without DB in isolation, but the intended API route
  must persist and later consume the selection; the DB-less utility path is not
  a production bypass.
- A direct library call or simulation script does not bypass the API's trust
  boundary because it is not an intended authenticated production entrypoint.
- Graph and ERC-8004 were independently exercised read-only; both survived
  falsification.
- Circle credentials were exercised only through read-only wallet listing;
  actual create execution remains unproven because this audit forbids writes.
- The target's “ready” evaluator claim is contradicted by the stale evaluator
  address in `.env`.

## X14 Additional Blockers Search

The following blockers or misclassifications were missed by the target report:

1. `INTERNAL_SERVICE_TOKEN` is required by `baseConfig` and absent from API
   `.env`/parent environment.
2. `WITNESS_URL` is required by `apiConfig` and absent.
3. `LLM_COMPLETIONS_URL`, `LLM_MODEL`, and `LLM_API_KEY` are required by
   `apiConfig` even though the Protected Job route does not instantiate the
   planner at A3; schema loading still blocks startup.
4. `IPFS_API_URL` is absent. With the default Kubo provider,
   `validateStorage` rejects the configuration; `registerJobs` also requires a
   concrete storage object before route registration.
5. The API `.env` evaluator address is present but mismatched against the
   deployed XYXEvaluator. This blocks correct Protected Job participant
   configuration. The registry address is likewise mismatched for Open
   Purchase/Witness use.
6. The database migrations exist in `apps/api/migrations/`, but no migration
   or DB connectivity was proven during this audit; the missing API
   `DATABASE_URL` prevents the intended runtime from reaching that check.

No additional Arc, Graph, ERC-8004, or on-chain contract mismatch was found in
the read-only checks. Actual Circle `createJob` execution was not proven by
design because sending it would violate the audit boundary.

## Claim Verdict Matrix

| Claim | Claude conclusion | Codex verdict | Independent evidence |
|---|---|---|---|
| API startup command | `.env` tsx command | VALIDATED | `package.json:11` |
| API environment source | `.env` + parent env; later “sole `.env`” wording | PARTIALLY_VALIDATED | npm script plus `loadConfig(..., process.env)`; no witness loader |
| `DATABASE_URL` absent | ABSENT | VALIDATED | Presence-only checks of `.env` and parent env |
| `DATABASE_URL` blocks pre-A4 | BLOCKER | VALIDATED | `baseConfig` required; A2 selection and A3 journal persist to DB |
| `PRIVY_APP_ID` absent | ABSENT | VALIDATED | Presence-only checks |
| `PRIVY_VERIFICATION_KEY` absent | ABSENT | VALIDATED | Presence-only checks |
| `OPERATOR_PRIVY_DID` absent | ABSENT | VALIDATED | Presence-only checks |
| Privy required for create route | BLOCKER | VALIDATED | `onRequest` protects all non-health routes; token verification and DID check |
| No legitimate auth bypass | NONE | VALIDATED | No alternate production create entrypoint; direct utilities are not production routes |
| Provider address absent | ABSENT | VALIDATED | Presence-only checks |
| Provider address required | Constructor/startup wording | PARTIALLY_VALIDATED | Optional schema; `configured()` blocks A2/A3 mutation routes |
| `.env.witness` wholesale sourcing unsafe | UNSAFE | VALIDATED | Private-key names present; API loader rejects signing secrets |
| Arc ready | READY | VALIDATED | RPC chain ID and bytecode read-only checks |
| Graph ready | READY | VALIDATED | Fresh metadata plus live SelectionEngine selection |
| Circle ready | READY | PARTIALLY_VALIDATED | SDK wallet session passed; actual A3 create write prohibited/unproven |
| ERC-8004 ready | READY | VALIDATED | On-chain owner/wallet and live agent resolution |
| ERC-8183 config correct | READY | VALIDATED | Deployment fallback and bytecode match official Arc reference |
| XYXEvaluator config correct | READY | REJECTED | API `.env` evaluator value mismatches canonical deployed evaluator |
| A0 must remain blocked | BLOCKED | VALIDATED | Multiple startup-required values absent; additional storage/evaluator blockers exist |

## Live Actions

NONE

Read-only RPC, Graph, ERC-8004, and Circle wallet-session checks were performed;
no state-changing API, Circle, EVM, IPFS-write, database-write, or migration
operation was executed.

## Source Changes

NONE except this audit report: `docs/workers/A_CODEX_INDEPENDENT_AUDIT.md`.
Production source, environment files, database rows, and
`docs/workers/A_LIVE_HERO_PATH.md` were untouched.

## Secrets Exposed

NONE

## Final Audit Classification

CLAUDE_RESULT_PARTIALLY_VALIDATED

A0 is genuinely blocked, but the target report overstates the provider schema
requirement, understates the API environment source nuance, incorrectly treats
IPFS/LLM/internal configuration as deferred, and marks evaluator configuration
ready despite the API `.env` mismatch.

## Recommended Operator Action

Inject approved API runtime values for every startup-required field (including
database, Privy, internal token, witness URL, LLM fields, storage, provider,
and the canonical evaluator/registry addresses), and ensure the operational
schema is migrated. Keep Witness/Evaluator/Relayer private keys out of the API;
do not source `.env.witness` wholesale. Then rerun read-only readiness checks.
No blockchain action is recommended by this audit.
