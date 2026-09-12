# XYX Current State

## Executive Summary

XYX is implemented as a local P0 foundation for autonomous agent commerce risk, verification, and settlement on Arc Testnet. The repo contains a TypeScript monorepo with a Next.js frontend, Fastify API, Buyer Agent runtime, centralized Execution Witness, Circle adapter, deterministic risk engine, Postgres operational storage, IPFS-compatible evidence storage, Graph indexer, ERC-8004 reference artifacts, ERC-8183 reference integration, and two custom Solidity contracts.

The repository does not currently prove live no-mock E2E completion. Local tests and builds pass for the portions that can run without credentials, but `npm run doctor` fails closed because live credentials/deployment/configuration are incomplete. This is expected for an audit-only local environment and must not be turned into fake readiness.

The most important incomplete areas are live configuration, live deployment proof, ERC-8004 validation/reputation consumption in the risk decision, protected-job frontend controls, and live Graph deployment. The code includes real boundaries against mocks in critical paths: marketplace/payment calls go through Circle CLI/SDK paths, Graph failures fail closed, IPFS persistence reads back before signing, and the API cannot sign witness evidence.

This audit consulted the Arc documentation MCP for Arc-specific facts. The Arc docs confirm Arc Testnet chain ID `5042002`, RPC `https://rpc.testnet.arc.io`, ERC-20 USDC address `0x3600000000000000000000000000000000000000`, and the ERC-8183 AgenticCommerce reference implementation `0x0747EEf0706327138c69792bF28Cd525089e4583`.

## Canonical P0 Scope

Canonical source: `docs/XYX_TECHNICAL_PRD_v1.1.md`.

Current P0 scope is:

* Human authorization through Privy authentication and embedded wallet.
* Arc Testnet configuration and human-to-machine USDC funding.
* Circle Developer-Controlled Wallets for machine wallet execution.
* Circle Marketplace / Agent Stack CLI boundary for service discovery, inspection, and payment.
* Buyer Agent objective input, typed PurchaseIntent, policy enforcement, live discovery, Graph evidence, risk scoring, deterministic selection, and Witness execution.
* Deterministic risk engine with Wilson reliability, confidence, address concentration/diversity, price, validation when available, protection score, hard constraints, policy hashing, and deterministic tie-breaks.
* Centralized Execution Witness that revalidates service terms, executes payment, observes HTTP result, stores evidence, signs EIP-712 receipt, and anchors receipt on Arc.
* Graph indexing for XYX receipts, ERC-8183 jobs, and ERC-8004 reference infrastructure.
* ERC-8004 consumption as external infrastructure, not as a custom XYX registry.
* ERC-8183 integration with the Arc reference deployment.
* Exactly two primary custom contracts: `XYXEvidenceRegistry.sol` and `XYXEvaluator.sol`.

## Legacy / Out-of-Scope Detection

No custom XYX token, DAO, custom escrow, custom identity registry, custom reputation registry, jury/dispute network, staking/slashing, custom BFT, ZK, cross-chain settlement, Chainlink, ENS, World ID, Ledger, Hedera, A2A adapter, or MCP integration is implemented as current P0 application logic.

Detected legacy/out-of-current-P0 items:

* `.env.example` comments retain the variable name `CIRCLE_AGENT_ADDRESS` for compatibility, even though it represents a Circle Developer-Controlled Wallet address.
* `@solana-program/*`, `@solana/kit`, and `@x402/svm` are installed but not imported by current source code. They look like dependency remnants or future/non-P0 payment experimentation.
* `dependency-backups/` contains previous package snapshots and should not be treated as current implementation.
* Existing generated/cache directories such as `.tmp/`, `.venv/`, `build/`, `graphify-out/`, `apps/web/.next/`, and `packages/contracts/out/cache` are ignored or generated artifacts, not current P0 source.

## Repository Architecture

Actual top-level layout:

* `apps/web`: Next.js App Router frontend.
* `apps/api`: Fastify API gateway and Postgres migration.
* `apps/buyer-agent`: planner and runtime orchestration.
* `apps/witness`: internal Witness service and evidence/job resolution logic.
* `packages/shared`: schemas, canonical JSON, chain utilities, config, Graph client, storage, evidence, ABI access, outcome classification.
* `packages/risk-engine`: deterministic risk model and tests.
* `packages/circle-adapter`: Circle CLI marketplace boundary, HTTP observation shim, Developer-Controlled Wallet SDK wrapper.
* `packages/contracts`: Solidity contracts, tests, Foundry config, deployment script.
* `packages/subgraph`: Graph schema, manifest template, mappings, ABI snapshots, generated Graph types.
* `packages/erc8004`: Arc ERC-8004 ABI/deployment snapshots.
* `packages/erc8183`: Arc ERC-8183 ABI/deployment snapshot and service wrapper.
* `scripts`: doctor, subgraph rendering, Circle wallet creation.
* `docs`: architecture, demo, live E2E, security, implementation-status docs.
* `dependency-backups`: old dependency snapshots.

Not present:

* No app-level `package.json` files under `apps/*` or `packages/*`.
* No `.github` CI workflows.
* No `public/` directory.
* No Tailwind configuration.

## Git State

At audit start:

* Branch: `master`.
* Recent commits: only `1fb1171 initial commit`.
* Modified files: none.
* Untracked files: none shown by `git status --short`.

During audit, `npm run build:web` succeeded but Next automatically edited `apps/web/next-env.d.ts` and `apps/web/tsconfig.json`. Those edits were restored manually to the committed content. Git status was clean again before creating this allowed handoff file.

After this handoff is created, the only expected git difference is `XYX_CODEX_HANDOFF.md`.

## Tech Stack

Languages:

* TypeScript
* TSX / React
* Solidity
* SQL
* JavaScript / MJS for scripts and the Circle observation shim
* Graph AssemblyScript mappings

Core packages installed:

* Next.js `16.3.4`
* React `19.2.8`
* TypeScript `5.9.3`
* Fastify `5.12.3`
* Privy React Auth `3.8.1`
* Privy Node `0.34.0`
* `@privy-io/wagmi` `4.0.17`
* wagmi `3.7.7`
* viem `2.56.0`
* TanStack Query `5.102.8`
* Circle Developer-Controlled Wallets SDK `9.6.0`
* The Graph CLI `0.91.1`
* The Graph TS `0.38.2`
* OpenZeppelin Contracts `5.6.1`
* PostgreSQL client `pg` `8.23.0`
* Zod `3.25.76`
* AJV `8.20.0`
* Undici `8.10.2`

## Frontend Inventory

Frontend is a Next.js App Router app in `apps/web`.

Actual frontend characteristics:

* App Router exists via `apps/web/app`.
* Root layout in `apps/web/app/layout.tsx`.
* Global CSS in `apps/web/app/style.css`.
* Shared client helpers in `apps/web/components/client.tsx`.
* Privy provider and wagmi config in `apps/web/app/providers.tsx`.
* TanStack Query is used for API-backed pages.
* wagmi and viem are used for Arc wallet reads/writes on `/wallet`.
* No Tailwind, design-token system, component library, custom font loader, or icon system is present.
* No Zustand usage in application source.
* No RainbowKit.

The frontend is functional but visually basic. Logic and presentation are heavily mixed inside page components, especially `/agent` and `/wallet`.

## Route Inventory

Actual routes:

* `/`: landing/product overview. Static.
* `/agent`: Buyer Agent objective, policy inputs, SSE timeline, risk comparison, anchored receipt link. Static route with client logic.
* `/services`: indexed endpoint table from Graph. Static route with client query.
* `/services/[endpointKey]`: raw endpoint detail JSON from Graph. Dynamic.
* `/receipts/[receiptHash]`: receipt detail from Graph. Dynamic.
* `/jobs`: protected job list from Graph. Static route with client query.
* `/jobs/[jobId]`: protected job detail JSON from Graph. Dynamic.
* `/wallet`: Privy embedded wallet, Arc USDC balance, Circle wallet balance, human funding transfer. Static route with client logic.
* `/settings`: static policy and trust-boundary information.

Next build output confirms these routes plus `/_not-found`.

Missing frontend flows:

* No protected job creation form.
* No protected job funding form.
* No protected job submit form.
* No protected job evaluation form.
* No settings editor for policy defaults.
* No receipt evidence bundle viewer beyond Graph-returned fields.

## Component Inventory

Actual reusable frontend components are minimal:

* `Login`: Privy login/logout button.
* `useAPI`: fetch helper that obtains a Privy access token and calls `/backend/*`.
* `Providers`: PrivyProvider, QueryClientProvider, WagmiProvider.

Most UI is embedded directly in route pages. There are no separate reusable primitives for buttons, tables, panels, timeline, forms, transaction status, route shell, or data detail views.

## Existing Design System

Current CSS is a single global file with:

* Dark theme CSS variables: `--bg`, `--panel`, `--line`, `--text`, `--muted`, `--accent`, `--bad`.
* Arial/Helvetica system typography.
* Basic header/nav/footer shell.
* Panel/card style using `.panel`.
* Grid helpers `.grid`, `.three`.
* Buttons, inputs, table, timeline, notice/error states.
* One mobile breakpoint at `max-width: 750px`.

Visual maturity by route:

* `/`: FUNCTIONAL BUT BASIC.
* `/agent`: FUNCTIONAL BUT BASIC.
* `/services`: FUNCTIONAL BUT BASIC.
* `/services/[endpointKey]`: PARTIALLY STYLED.
* `/receipts/[receiptHash]`: FUNCTIONAL BUT BASIC.
* `/jobs`: FUNCTIONAL BUT BASIC.
* `/jobs/[jobId]`: PARTIALLY STYLED.
* `/wallet`: FUNCTIONAL BUT BASIC.
* `/settings`: FUNCTIONAL BUT BASIC.

No route is broken by build, but the visual layer is not production-grade cinematic design.

## Animation / 3D Capabilities

Installed direct dependencies:

* Three.js: absent.
* React Three Fiber: absent.
* Drei: absent.
* GSAP: absent.
* ScrollTrigger: absent.
* Lenis: absent.
* Anime.js: absent.
* Framer Motion / Motion: absent.
* postprocessing: absent.

Used in source:

* No WebGL.
* No canvas.
* No GLSL.
* No custom animation system.

Transitive only:

* `lucide-react` appears as a transitive dependency of Privy, not as an app-level imported UI dependency.
* `zustand` appears transitively under wallet/auth packages, not as app state source.

## Web3 Integration

Actual implementation:

* `packages/shared/src/chain.ts` pins `ARC_CHAIN_ID=5042002` and Arc ERC-20 USDC address.
* `arcClient()` uses viem `createPublicClient` with `arcTestnet`.
* `usdcBalance()` checks chain ID and USDC decimals before returning balance.
* `apps/web/app/providers.tsx` configures Privy and wagmi for `arcTestnet`.
* `apps/web/app/wallet/page.tsx` uses Privy embedded wallet, wagmi public client, viem wallet client, USDC `transfer`, status states `Preparing`, `Awaiting wallet`, `Broadcasting`, `Confirmed`, `Failed`.
* API `/api/v1/wallet` reads Circle Developer-Controlled Wallet USDC balance from Arc.
* Witness uses a dedicated relayer wallet client for contract writes.

Environment variable names observed:

* `DATABASE_URL`
* `ARC_RPC_URL`
* `CIRCLE_AGENT_ADDRESS`
* `CIRCLE_API_KEY`
* `CIRCLE_ENTITY_SECRET`
* `GRAPH_URL`
* `GRAPH_DEPLOYMENT_ID`
* `MAX_GRAPH_LAG_BLOCKS`
* `EVIDENCE_REGISTRY_ADDRESS`
* `XYX_EVALUATOR_ADDRESS`
* `IPFS_API_URL`
* `IPFS_AUTHORIZATION`
* `INTERNAL_SERVICE_TOKEN`
* `PRIVY_APP_ID`
* `PRIVY_VERIFICATION_KEY`
* `OPERATOR_PRIVY_DID`
* `WITNESS_URL`
* `LLM_COMPLETIONS_URL`
* `LLM_MODEL`
* `LLM_API_KEY`
* `API_PORT`
* `WITNESS_PRIVATE_KEY`
* `RELAYER_PRIVATE_KEY`
* `EVALUATOR_PRIVATE_KEY`
* `WITNESS_PORT`
* `MAX_JOB_USDC`
* `CIRCLE_PROVIDER_ADDRESS`
* `CIRCLE_PROVIDER_WALLET`
* `CIRCLE_CLI_PATH`
* `CIRCLE_CLI_HOME`
* `CIRCLE_ACCEPT_TERMS`
* `XYX_OBSERVE_URL`
* `XYX_OBSERVE_FILE`
* `XYX_OBSERVE_MODE`
* `API_INTERNAL_URL`
* `NEXT_PUBLIC_ARC_RPC_URL`
* `NEXT_PUBLIC_PRIVY_APP_ID`
* `XYX_ADMIN`
* `XYX_WITNESS_ATTESTOR`
* `XYX_EVALUATOR_ATTESTOR`
* `XYX_PAUSER`
* `ERC8183_ADDRESS`
* `RECEIPT_MAX_AGE`
* `VERDICT_LIFETIME`
* `EVIDENCE_START_BLOCK`
* `EVALUATOR_START_BLOCK`
* `ERC8183_START_BLOCK`
* `ERC8004_START_BLOCK`

## Circle Integration

Actual implementation:

* `packages/circle-adapter/src/index.ts` wraps Circle CLI calls through `execFile`, not a shell.
* Marketplace commands implemented: `services search`, `services inspect`, `services pay --estimate`, and `services pay`.
* CLI subprocess receives a narrowed env and an observation import hook.
* `CIRCLE_ACCEPT_TERMS` must be explicitly present for live CLI terms; the app does not infer acceptance.
* Circle Developer-Controlled Wallets SDK is used for wallet liveness and contract execution.
* `scripts/create-circle-wallet.ts` creates one Arc Testnet EOA wallet and writes non-secret metadata to `.circle/wallet-info.json`.
* `CircleAdapter.session()` checks the configured wallet is `LIVE` on `ARC-TESTNET`.
* `CircleAdapter.execute()` polls Circle transactions and rejects failed/denied/cancelled/stuck states.

Live blockers:

* Requires real Circle API key and Entity Secret.
* Requires Circle CLI installed/configured.
* Requires operator terms acceptance.
* Requires funded Arc Testnet Circle wallet.
* Requires real service providers that accept Arc exact payment.

## Buyer Agent Runtime

Actual implementation:

* `apps/api/src/main.ts` authenticates via Privy, restricts to `OPERATOR_PRIVY_DID`, validates policy, creates idempotent runs, exposes SSE events.
* `apps/buyer-agent/src/planner.ts` calls a configured LLM-compatible JSON endpoint only to infer capability/query and request body. It cannot override spending authority.
* `apps/buyer-agent/src/runtime.ts` performs marketplace discovery, planner request body generation, endpoint inspection, payment estimate, Arc exact-payment compatibility validation, Graph freshness checks, Graph evidence retrieval, risk evaluation, selected-provider persistence, balance check, and Witness execution call.
* Stop/cancel prevents future execution but cannot cancel a payment already sent.

Implemented but incomplete:

* Protected providers are not surfaced in Buyer Agent candidates; candidates are currently created with `protected:false`.
* Candidate validation is currently `null`, so ERC-8004 validation does not yet influence ranking.
* Planner depends on a live external LLM-compatible endpoint; there is no local deterministic fallback.

## Risk Engine

Actual implementation is in `packages/risk-engine/src/index.ts`.

Verified from code:

* 30-day evidence window.
* Excludes future receipts.
* Excludes receipts above indexed block.
* Excludes non-provider-attributable outcomes above `4`.
* Deduplicates by receipt id and rejects conflicting duplicate receipts.
* Computes Wilson lower bound with `z=1.96`.
* Computes effective address diversity as `n*n/sum(count^2)`, equivalent to inverse HHI.
* Computes sample confidence as `min(1,n/20) * min(1,diversity/5)`.
* Computes confidence-adjusted trust as `0.5 + confidence * (wilson - 0.5)`.
* Implements exact decimal price comparison.
* Enforces hard constraints before ranking: over budget, capability mismatch, payment incompatibility, protection required, minimum trust, minimum evidence.
* Computes price score.
* Includes validation score when non-null; renormalizes denominator when validation is unavailable.
* Includes protection score.
* Computes final deterministic utility.
* Sorts deterministically by utility, then endpoint key.
* Emits policy hash and candidate data hashes.

Tests in `packages/risk-engine/test/risk.test.ts` cover Wilson/confidence, diversity, zero evidence, exclusions/deduplication, hard constraints, validation renormalization, Graph stale fail-closed behavior, protection requirement, and permutation determinism.

Incomplete against P0:

* Risk engine supports validation input, but runtime currently feeds `validation:null`.
* No dedicated tests for malformed decimal precision beyond shared `atomicAmount`.

## Execution Witness

Actual implementation is in `apps/witness/src/service.ts` and `apps/witness/src/main.ts`.

Implemented:

* Internal-only API authenticated by `INTERNAL_SERVICE_TOKEN`.
* Dedicated Witness signer, relayer signer, evaluator signer, and Circle wallet address must all be distinct.
* Advisory lock per run.
* Refuses to run if previous execution exists unless already signed/anchored path is recoverable.
* Requires run status `SELECTED`.
* Rejects protected intent in open purchase flow.
* Revalidates selected service identity and request body schema.
* Re-discovers marketplace item before payment.
* Compares latest service metadata, payment requirements, and payment terms against snapshot.
* Requires `ARC-TESTNET` terms.
* Checks Circle wallet USDC balance and max budget before payment.
* Checks Graph `_meta` block number/hash against Arc head.
* Checks IPFS-compatible evidence storage health.
* Inserts execution attempt before contacting Circle.
* Calls Circle payment once and refuses blind retry on unknown payment state.
* Captures HTTP status, content type, request hash, response hash, body hash, latency, observedAt, and payment settlement metadata.
* Verifies settlement transfer on Arc USDC logs.
* Builds evidence bundle and persists canonical JSON to IPFS-compatible storage.
* Reads back IPFS object before signing.
* Signs EIP-712 receipt with dedicated Witness signer.
* Anchors receipt through `XYXEvidenceRegistry`.
* Can recover receipt anchor transaction from chain logs if relayer crash loses hash.
* Resolves ERC-8183 jobs by reading evaluator target, checking job state, signing EIP-712 verdict, and relaying `XYXEvaluator.resolveJob`.

Important boundary:

* API and Buyer Agent cannot sign canonical Witness evidence. Only `apps/witness` constructs the Witness signer from `WITNESS_PRIVATE_KEY`.

Incomplete/risky:

* `EVIDENCE_START_BLOCK` is used directly from `process.env` in anchor recovery but is not part of `witnessConfig`; config validation does not enforce it.
* Job resolution is live-gated and not covered by an end-to-end integration test against the real Arc deployment.
* ERC-8004 identity mapping in evidence is always zero/null in current Witness open-purchase bundle.

## Smart Contract Inventory

Current P0 custom contracts:

* `packages/contracts/src/XYXEvidenceRegistry.sol`
* `packages/contracts/src/XYXEvaluator.sol`

Support interface:

* `packages/contracts/src/interfaces/IAgenticCommerce.sol`

No old custom lifecycle, jury, dispute-resolution, staking, slashing, token, or BFT contracts are present.

`XYXEvidenceRegistry.sol` implements:

* EIP-712 domain `XYX Evidence Registry`, version `1`.
* `ATTESTOR_ROLE`, `PAUSER_ROLE`, default admin role.
* Receipt attestation struct and typehash.
* Receipt digest mapping for uniqueness.
* Per-attestor nonce replay protection.
* URI hash binding.
* max receipt age / timestamp validation.
* provider identity zero mapping guard.
* Pausable anchor path.
* `ReceiptAnchored` event with all fields required by the subgraph.

`XYXEvaluator.sol` implements:

* EIP-712 domain `XYX Evaluator`, version `1`.
* Trusted attestor role.
* JobVerdict typehash.
* issuedAt/expiresAt/lifetime validation.
* digest and nonce replay protection.
* COMPLETE decision `1`.
* REJECT decision `2`.
* state mutation before external ERC-8183 call within the same transaction.
* ReentrancyGuard.
* Pausable.
* `JobVerdictExecuted` event.

Nuance:

* If the downstream ERC-8183 call reverts, the whole transaction reverts, so `consumed` and nonce writes roll back. This is covered by `testExternalFailureRollback` and permits retry after an external failure.

## ERC-8004 Integration

Actual implementation:

* ABI snapshots and deployment files exist for Identity, Reputation, and Validation registries.
* Subgraph template includes ERC-8004 Identity, Reputation, and Validation data sources.
* Mapping files store AgentIdentity, Feedback, and Validation entities.
* Receipt anchoring supports optional `providerAgentRegistry` and `providerAgentId`.
* Registry contract rejects non-zero providerAgentId when providerAgentRegistry is zero.
* Witness open-purchase bundle currently emits zero/null provider identity, so external providers are not assigned fabricated identities.

Partial/incomplete:

* Buyer Agent does not query ERC-8004 AgentIdentity/Validation/Feedback for candidate scoring.
* Runtime candidate creation sets `validation:null`.
* No source code maps marketplace providers to verified ERC-8004 identities before evidence signing.

Classification: PARTIALLY IMPLEMENTED.

## ERC-8183 Integration

Arc docs confirmed current reference flow:

* AgenticCommerce reference implementation: `0x0747EEf0706327138c69792bF28Cd525089e4583`.
* `createJob(address,address,uint256,string,address)`.
* `setBudget(uint256,uint256,bytes)`.
* USDC `approve(address,uint256)`.
* `fund(uint256,bytes)`.
* `submit(uint256,bytes32,bytes)`.
* `complete(uint256,bytes32,bytes)`.

Actual repo implementation:

* `packages/erc8183/deployment.json` records chain ID, reference proxy address, implementation address, source, and retrieval date.
* `packages/erc8183/AgenticCommerce.abi.json` exists.
* `packages/erc8183/service.ts` implements create, setBudget, approveAndFund, and submit through Circle Developer-Controlled Wallet contract execution.
* `apps/api/src/main.ts` exposes protected job create/fund/submit/evaluate API routes.
* `apps/witness/src/service.ts` signs verdicts and resolves jobs through `XYXEvaluator`.
* Subgraph indexes ERC-8183 lifecycle events.

Incomplete:

* Frontend only lists and displays jobs; it does not expose create/fund/submit/evaluate controls.
* API `ProtectedJobService` uses the Arc reference address hardcoded in `apps/api/src/main.ts`, not read from `packages/erc8183/deployment.json` or env.
* Fund and submit routes do not use an explicit client idempotency key or durable transaction reconciliation comparable to open-purchase execution.
* No live E2E proof or integration test against the actual Arc deployment.

Classification: PARTIALLY IMPLEMENTED / BLOCKED_BY_LIVE_CONFIGURATION.

## The Graph / Subgraph

Actual implementation:

* `packages/subgraph/schema.graphql` defines Endpoint, Receipt, AgentIdentity, Validation, Feedback, and Job.
* `packages/subgraph/subgraph.yaml.template` configures data sources for XYXEvidenceRegistry, XYXEvaluator, AgenticCommerce, ERC8004 Identity, ERC8004 Validation, and ERC8004 Reputation.
* `packages/subgraph/src/evidence.ts` updates endpoint aggregate counts and writes receipt entities.
* `packages/subgraph/src/commerce.ts` indexes ERC-8183 job lifecycle events.
* `packages/subgraph/src/evaluator.ts` updates job status on XYX evaluator verdict events.
* `packages/subgraph/src/identity.ts`, `reputation.ts`, and `validation.ts` index ERC-8004 events.
* `scripts/render-subgraph.mjs` requires real deployment addresses/start blocks before rendering `subgraph.yaml`.
* `packages/shared/src/graph.ts` checks `_meta.deployment`, `_meta.hasIndexingErrors`, block number, and block hash.
* Buyer Agent and Witness compare Graph block hash against Arc block hash and fail closed on stale/inconsistent Graph data.
* Graph evidence query uses deterministic pagination and refuses silent truncation after 200 pages.

Blocked:

* `packages/subgraph/subgraph.yaml` is not present because render requires real deployment env.
* No live Graph Studio endpoint/deployment proof.
* Subgraph build command is blocked by missing live deployment env.

## Evidence / IPFS

Actual implementation:

* Canonical JSON is implemented in `packages/shared/src/index.ts`.
* Evidence storage is implemented in `packages/shared/src/evidence.ts`.
* Evidence is pinned through IPFS-compatible HTTP API `/api/v0/add` with CIDv1/raw leaves.
* Evidence object is read back through `/api/v0/cat` and compared byte-for-byte before signing.
* Evidence hash and evidence URI hash are computed from canonical content/URI.
* Witness stores public metadata and hashes, not raw response bodies, in Postgres execution observation.

Blocked:

* Requires live IPFS-compatible API.
* Requires optional authorization if remote IPFS is used.
* No live CID proof in repo.

## Backend / API

Actual public API surface in `apps/api/src/main.ts`:

* `GET /healthz`: unauthenticated, checks Postgres, Graph, Arc, Witness. Live.
* `GET /readyz`: same as health. Live.
* `GET /api/v1/wallet`: authenticated, reads Circle wallet Arc USDC balance. Live-gated.
* `POST /api/v1/agent/runs`: authenticated, Zod validated, idempotency-key required, starts async BuyerRuntime only if health is ready. Live-gated.
* `GET /api/v1/agent/runs/:runId`: authenticated, owner-scoped, returns run state.
* `POST /api/v1/agent/runs/:runId/stop`: authenticated, owner-scoped, sets cancel flag.
* `GET /api/v1/agent/runs/:runId/events`: authenticated, owner-scoped, SSE from durable DB events.
* `POST /api/v1/risk/evaluate`: authenticated, Zod validated, runs live assessment without starting witness execution. Live-gated.
* `GET /api/v1/services`: authenticated, Graph query. Live-gated.
* `GET /api/v1/services/:endpointKey`: authenticated, Graph query. Live-gated.
* `GET /api/v1/receipts/:receiptHash`: authenticated, Graph query. Live-gated.
* `GET /api/v1/jobs`: authenticated, Graph query. Live-gated.
* `POST /api/v1/jobs`: authenticated, Zod validated, idempotency-key required, creates ERC-8183 job if provider config exists. Live-gated.
* `POST /api/v1/jobs/:jobId/fund`: authenticated, Zod validated, calls provider setBudget then buyer approve/fund. Live-gated.
* `POST /api/v1/jobs/:jobId/submit`: authenticated, Zod validated, calls provider submit. Live-gated.
* `GET /api/v1/jobs/:jobId`: authenticated, Graph query. Live-gated.
* `POST /api/v1/jobs/:jobId/evaluate`: authenticated, Zod validated, calls Witness internal resolve-job. Live-gated.

Actual Witness API surface:

* `GET /healthz`: internal token required, checks Postgres, Arc, Graph, Circle wallet, marketplace, evidence storage, and registry signer role.
* `POST /internal/execute`: internal token required, validates run/execution/idempotency and executes open purchase.
* `POST /internal/anchor/:executionId`: internal token required, anchors signed receipt.
* `POST /internal/resolve-job`: internal token required, signs and relays ERC-8183 verdict.

All non-health public API routes are authenticated. Input validation is mostly Zod. There is no formal OpenAPI schema.

## Database / Idempotency

Schema exists at `apps/api/migrations/001_initial.sql`.

Tables:

* `users`
* `agent_runs`
* `purchase_intents`
* `candidate_snapshots`
* `execution_attempts`
* `evidence_records`
* `protected_job_runs`
* `run_events`

Sequences:

* `witness_nonce`
* `evaluator_nonce`

Implemented idempotency:

* Agent run creation is idempotent per `(user_id, idempotency_key)`.
* Execution attempts are unique by idempotency key and by run id.
* Witness refuses blind retry after payment has started unless signed/anchored recovery is possible.
* Run events are durable and SSE resumes by `Last-Event-ID`.
* Evidence records are tied one-to-one to execution attempts.

Operational vs canonical state:

* Postgres stores operational state, idempotency, snapshots, and event stream.
* Graph/Arc are treated as canonical trust history for risk.
* Evidence content is committed by content hash/CID and receipt anchor.

Incomplete:

* Protected job fund/submit/evaluate routes do not have the same idempotency/reconciliation depth as open purchase.
* No migration runner script is exposed in package scripts, though `migrate()` exists in shared storage code.

## Dependency Audit

Important direct dependencies are listed in `package.json`; resolved versions were checked with `npm ls --depth=0`.

Notable findings:

* No app/package package.json files exist, despite workspace glob `apps/*` and `packages/*`.
* `@privy-io/wagmi` is declared as `latest` in package.json and resolves to `4.0.17`; pinning would improve reproducibility.
* Root `wagmi` resolves to `3.7.7`, while Privy/x402 transitive dependency includes `wagmi@2.19.5`. This is not currently breaking build, but it is duplicated major-version surface.
* React package.json range is `^19.1.0`, resolved `19.2.8`.
* Next is `^16.3.4`, resolved `16.3.4`.
* Solana and `@x402/svm` packages are direct dependencies but unused by current Arc/EVM P0 source.
* `lucide-react` and `zustand` are present transitively, not used directly by app source.
* No direct animation/3D packages are installed.
* IPFS is implemented through raw HTTP API calls, not a dedicated IPFS client package.

Suspicious or legacy dependencies:

* `@solana-program/memo`
* `@solana-program/system`
* `@solana-program/token`
* `@solana/kit`
* `@x402/svm`

Do not remove during audit. Classify as LEGACY / OUT OF CURRENT P0 SCOPE unless a future Solana/x402-SVM scope is explicitly reintroduced.

## Build / Test Status

Commands run:

* `npm test`: PASS after sandbox escalation. 12 Node tests passed.
* `npm run typecheck`: PASS.
* `forge test --root packages/contracts --out /tmp/xyx-audit-forge-out --cache-path /tmp/xyx-audit-forge-cache -vvv`: PASS. 24 Solidity tests passed.
* `forge build --root packages/contracts --out /tmp/xyx-audit-forge-build-out --cache-path /tmp/xyx-audit-forge-build-cache`: PASS. Compiler run successful. Foundry lint notes/warnings reported, mostly naming, test fixture, timestamp, and unsafe cast notes.
* `npm run build:web`: PASS. Next build completed and listed all app routes. Next temporarily auto-edited web TypeScript config files; those edits were restored.
* `npm run doctor`: FAIL-CLOSED. Missing live configuration names for API and Witness were reported. No secret values printed.
* `npm run subgraph:render`: FAIL-CLOSED. Missing `EVIDENCE_REGISTRY_ADDRESS`; render only after real Arc deployment exists.
* `npm run subgraph:build`: FAIL-CLOSED at render step for the same reason.

Commands not run:

* `npm run subgraph:codegen`: not run because rendering requires real deployment values and would write generated artifacts.
* Live API/Witness server startup: not run because doctor indicates configuration is incomplete.

Smart contract test coverage includes:

* Invalid attestor.
* Invalid signature.
* Wrong chain/domain.
* Wrong contract domain.
* URI mutation.
* Duplicate receipt.
* Nonce reuse.
* Paused registry.
* Timestamp boundaries.
* Optional ERC-8004 mapping preservation and zero mapping guard.
* Complete and reject verdicts.
* Expired verdict.
* Duplicate verdict.
* Wrong evaluator signer.
* Wrong job evaluator.
* Paused evaluator.
* ERC-8183 external call failure rollback.
* Reentrancy blocked.
* Unsupported decision fuzz.
* Signed field mutation fuzz.
* Valid field fuzz.

## Live E2E Readiness

Local foundation implemented:

* Privy frontend/provider code.
* Human wallet funding UI.
* Arc USDC transfer path.
* Circle Developer-Controlled Wallet SDK wrapper.
* Circle marketplace CLI discovery/inspection/payment wrapper.
* Buyer Agent orchestration.
* Witness execution and evidence signing/anchoring path.
* IPFS evidence storage path.
* Graph client/freshness guard.
* Subgraph schema/mappings/template.
* Solidity contracts and deployment script.

Live no-mock not verified:

* Real Privy app/config missing in current runtime.
* Real Circle API key and Entity Secret missing from doctor result.
* Real deployed XYX contract addresses missing.
* Real Graph URL/deployment missing.
* Real Witness/API internal config incomplete.
* Real IPFS API readiness not proven.
* Circle wallet liveness/funding not proven.
* Marketplace CLI auth/terms not proven.
* Live provider availability not proven.
* Live Arc receipt anchoring transaction not recorded.
* Live Graph indexing of a receipt not recorded.
* Live ERC-8183 protected job lifecycle not recorded.

Do not claim live E2E until real transaction hashes, provider URL/spec hashes, payment amount, HTTP status, latency, evidence CID, receipt digest, Graph indexed block, and subsequent risk decision are captured.

## Implemented vs Planned Matrix

* Privy authentication: IMPLEMENTED, BLOCKED_BY_LIVE_CONFIGURATION.
* Human wallet: IMPLEMENTED, BLOCKED_BY_LIVE_CONFIGURATION.
* Arc funding: IMPLEMENTED, BLOCKED_BY_LIVE_CONFIGURATION.
* Circle Developer-Controlled Wallet: IMPLEMENTED, BLOCKED_BY_LIVE_CONFIGURATION.
* Marketplace discovery: IMPLEMENTED, BLOCKED_BY_LIVE_CONFIGURATION.
* Marketplace inspection: IMPLEMENTED, BLOCKED_BY_LIVE_CONFIGURATION.
* Payment compatibility: IMPLEMENTED.
* Buyer Agent: IMPLEMENTED, BLOCKED_BY_LIVE_CONFIGURATION.
* PurchaseIntent: IMPLEMENTED.
* Risk Engine: IMPLEMENTED.
* Graph history: IMPLEMENTED client/indexer, BLOCKED_BY_LIVE_CONFIGURATION.
* Graph freshness guard: IMPLEMENTED.
* Open Purchase: IMPLEMENTED, BLOCKED_BY_LIVE_CONFIGURATION.
* Execution Witness: IMPLEMENTED, BLOCKED_BY_LIVE_CONFIGURATION.
* IPFS evidence: IMPLEMENTED, BLOCKED_BY_LIVE_CONFIGURATION.
* Evidence canonicalization: IMPLEMENTED.
* Witness signing: IMPLEMENTED, BLOCKED_BY_LIVE_CONFIGURATION.
* XYXEvidenceRegistry: IMPLEMENTED, deployment BLOCKED_BY_LIVE_CONFIGURATION.
* Receipt anchoring: IMPLEMENTED, BLOCKED_BY_LIVE_CONFIGURATION.
* Subsequent evidence feedback loop: PARTIALLY IMPLEMENTED, BLOCKED_BY_LIVE_CONFIGURATION.
* ERC-8004 integration: PARTIALLY IMPLEMENTED.
* ERC-8183 integration: PARTIALLY IMPLEMENTED, BLOCKED_BY_LIVE_CONFIGURATION.
* XYXEvaluator: IMPLEMENTED, deployment BLOCKED_BY_LIVE_CONFIGURATION.
* Protected Job: PARTIALLY IMPLEMENTED, BLOCKED_BY_LIVE_CONFIGURATION.
* Postgres idempotency: IMPLEMENTED for open purchase, PARTIALLY IMPLEMENTED for protected-job subactions.
* Frontend: IMPLEMENTED as functional P0 UI, visual maturity FUNCTIONAL BUT BASIC.

No current P0 capability should be classified as live no-mock verified based only on this repo audit.

## Existing UX Flow

Main functional flow:

1. User logs in with Privy.
2. User opens `/wallet`, sees Privy embedded wallet and Circle wallet balance when live API/config is available.
3. User signs an Arc USDC transfer from Privy wallet to Circle Developer-Controlled Wallet.
4. User opens `/agent`, enters objective and policy.
5. API creates a run, streams events through SSE.
6. Buyer Agent plans intent, discovers marketplace services, inspects endpoints, checks payment compatibility, queries Graph, evaluates risk, selects provider.
7. Witness revalidates service/payment terms, pays, observes HTTP response, persists evidence, signs receipt, anchors on Arc.
8. User can inspect receipt through `/receipts/[receiptHash]` after Graph indexes it.
9. Future decisions can query indexed receipts through Graph.

Protected job UX currently only views indexed job data. Backend routes exist for create/fund/submit/evaluate, but there is no frontend workflow for them.

## Business Logic That Must Be Preserved

Preserve these files during redesign unless intentionally changing business behavior:

* `apps/web/components/client.tsx`: Privy access token and backend auth fetch helper.
* `apps/web/app/providers.tsx`: Privy/wagmi/TanStack provider configuration.
* `apps/web/app/agent/page.tsx`: run creation, SSE streaming, stop request, risk/event state handling.
* `apps/web/app/wallet/page.tsx`: Privy wallet selection, Arc USDC balance read, chain switch, USDC transfer, transaction states.
* `apps/web/app/services/page.tsx`: Graph-backed endpoint table query.
* `apps/web/app/services/[endpointKey]/page.tsx`: endpoint evidence fetch.
* `apps/web/app/receipts/[receiptHash]/page.tsx`: receipt fetch and rendering.
* `apps/web/app/jobs/page.tsx`: protected job list query.
* `apps/web/app/jobs/[jobId]/page.tsx`: job detail query.
* `apps/api/src/main.ts`: auth, API routes, health, idempotency, run/job orchestration.
* `apps/buyer-agent/src/planner.ts`: LLM boundary and policy authority isolation.
* `apps/buyer-agent/src/runtime.ts`: discovery, inspection, payment compatibility, Graph guard, risk selection, Witness call.
* `apps/witness/src/main.ts`: internal auth and witness routes.
* `apps/witness/src/service.ts`: payment/evidence/signature/anchor/job-resolution logic.
* `packages/circle-adapter/src/index.ts`: Circle CLI and Developer-Controlled Wallet boundary.
* `packages/circle-adapter/src/observe.mjs`: paid HTTP observation and SSRF protections.
* `packages/shared/src/index.ts`: canonical JSON, hashes, schemas, EIP-712 types.
* `packages/shared/src/chain.ts`: Arc client, chain ID, USDC address/decimals.
* `packages/shared/src/config.ts`: runtime config validation.
* `packages/shared/src/graph.ts`: Graph client, `_meta`, freshness, pagination.
* `packages/shared/src/evidence.ts`: IPFS persistence/readback.
* `packages/shared/src/storage.ts`: database pool, migration, events, run idempotency.
* `packages/shared/src/verify.ts`: outcome classification.
* `packages/risk-engine/src/index.ts`: deterministic risk model.
* `packages/erc8183/service.ts`: protected-job Circle execution wrapper.
* `packages/contracts/src/XYXEvidenceRegistry.sol`: evidence anchor contract.
* `packages/contracts/src/XYXEvaluator.sol`: verdict gateway contract.
* `packages/subgraph/*`: Graph schema, manifest, and mappings.
* `scripts/render-subgraph.mjs`: live deployment gate for subgraph manifest.
* `scripts/create-circle-wallet.ts`: wallet creation path.
* `scripts/doctor.ts`: config readiness check.

## Safe Design Modification Areas

Future cinematic redesign can be added safely if logic boundaries stay intact.

Recommended split:

* Cinematic marketing layer: `/`.
* Functional XYX application layer: `/agent`, `/services`, `/receipts`, `/jobs`, `/wallet`, `/settings`.

Safe visual areas:

* `apps/web/app/page.tsx` can become an isolated cinematic landing page, as long as it keeps clear navigation to `/agent` and `/wallet`.
* `apps/web/app/layout.tsx` can be split into a marketing shell and app shell, but auth/provider wrapping must remain available for app routes.
* `apps/web/app/style.css` can be replaced or expanded for visual design.
* Presentational table, panel, timeline, status, button, and form primitives can be extracted from route files.
* `/services/[endpointKey]`, `/jobs/[jobId]`, and receipt detail views can be redesigned around the same data fetches.

Do not break:

* Privy auth token flow in `useAPI`.
* SSE parsing and resume behavior in `/agent`.
* Funding transaction states and `waitForTransactionReceipt` behavior.
* No-fallback/no-sample-data UI copy.
* Graph error fail-closed UX.
* Distinction between Open Purchase and ERC-8183 Protected Job.
* All business logic paths listed in the previous section.

Suggested design architecture:

* `MarketingShell` for `/`.
* `AppShell` for authenticated/product routes.
* Pure presentational components under `apps/web/components/ui/*`.
* Keep API calls, wallet calls, and SSE hooks isolated in client logic hooks before visual rewrite.

## Technical Debt / Problems Found

* `npm run doctor` fails closed because required live configuration is incomplete. This is correct but blocks live demos.
* `npm run subgraph:render` and `npm run subgraph:build` are blocked until real deployment env exists.
* No CI workflow is present.
* No formal API schema/OpenAPI docs are present.
* No frontend tests are present.
* No backend unit/integration tests for Fastify routes are present.
* No live or local integration test for open purchase Witness flow.
* No live or local integration test for ERC-8183 end-to-end job lifecycle.
* ERC-8004 data is indexed but not consumed in runtime risk scoring.
* Protected job frontend controls are missing.
* Protected job fund/submit/evaluate route idempotency is weaker than open purchase.
* `EVIDENCE_START_BLOCK` is used in Witness recovery but not validated by `witnessConfig`.
* `apps/api/src/main.ts` hardcodes the ERC-8183 reference address instead of loading from config/deployment file.
* `apps/web/next.config.mjs` has `typescript.ignoreBuildErrors:true`; root `npm run typecheck` currently passes, but production build itself skips type validation.
* `apps/web/tsconfig.json` has `strict:false`; root TypeScript config is strict.
* `IAgenticCommerce.sol` references `docs/INTEGRATIONS.md`, which does not exist.
* Direct Solana/x402-SVM dependencies are unused in current source.
* Next build auto-edits web TypeScript config unless guarded; audit restored those changes.

## Documentation vs Implementation Differences

Consistent:

* README, architecture, implementation-status, live E2E, and demo docs align with the current P0 direction.
* Docs correctly state live no-mock acceptance is not claimed.
* Docs correctly state no custom token, custom escrow, custom identity/reputation registry, DAO, cross-chain settlement, BFT consensus, or ZK circuit is current P0.

Differences/gaps:

* `docs/IMPLEMENTATION_STATUS.md` says deterministic risk includes validation weighting. The formula supports it, but runtime currently passes `validation:null`, so actual ERC-8004 validation consumption is incomplete.
* `docs/IMPLEMENTATION_STATUS.md` says ERC-8183 uses real lifecycle calls. Backend service does, but frontend only views jobs.
* `docs/ARCHITECTURE.md` says Graph freshness is hard dependency; source supports this in runtime/Witness, but live Graph deployment is not configured.
* `docs/LIVE_E2E.md` requires transaction hashes and live Graph evidence; none are present in repo state.
* `IAgenticCommerce.sol` points to missing `docs/INTEGRATIONS.md`.

Source code and current local check results determine implementation status. Documentation alone is not proof of live implementation.

## Files Another Engineer Should Read First

1. `docs/XYX_TECHNICAL_PRD_v1.1.md`
2. `README.md`
3. `docs/IMPLEMENTATION_STATUS.md`
4. `docs/LIVE_E2E.md`
5. `apps/api/src/main.ts`
6. `apps/buyer-agent/src/runtime.ts`
7. `apps/witness/src/service.ts`
8. `packages/circle-adapter/src/index.ts`
9. `packages/shared/src/index.ts`
10. `packages/shared/src/chain.ts`
11. `packages/shared/src/graph.ts`
12. `packages/shared/src/evidence.ts`
13. `packages/risk-engine/src/index.ts`
14. `packages/contracts/src/XYXEvidenceRegistry.sol`
15. `packages/contracts/src/XYXEvaluator.sol`
16. `packages/subgraph/subgraph.yaml.template`
17. `packages/subgraph/schema.graphql`
18. `apps/web/app/agent/page.tsx`
19. `apps/web/app/wallet/page.tsx`
20. `apps/web/app/style.css`

## Recommended Next Step for Cinematic Redesign

Do not redesign directly inside the existing page files first. The safer next step is to extract stable UI primitives and route shells while preserving behavior:

1. Create a separate app shell for functional routes and a marketing shell for `/`.
2. Extract presentational components for panels, tables, timeline, notices, buttons, form fields, and data detail rows.
3. Move API/SSE/wallet logic into small hooks without changing behavior.
4. Only after those boundaries exist, redesign `/` as cinematic marketing and keep `/agent` as a dense operational console.
5. Add Playwright visual smoke tests before major UI changes, especially for `/agent` and `/wallet`.

# Critical File Index

`AGENTS.md`

* Purpose: repository-specific Arc documentation rule.
* Why it matters: requires Arc docs MCP for Arc-specific implementation/factual claims.
* Classification: documentation

`docs/XYX_TECHNICAL_PRD_v1.1.md`

* Purpose: frozen canonical P0 architecture.
* Why it matters: defines current requirements and out-of-scope legacy concepts.
* Classification: documentation

`README.md`

* Purpose: contributor overview and local/live status.
* Why it matters: states local foundation vs live no-mock boundary.
* Classification: documentation

`docs/ARCHITECTURE.md`

* Purpose: concise trust-boundary architecture.
* Why it matters: explains API/Witness separation, Graph fail-closed, and non-custodial contract model.
* Classification: documentation

`docs/IMPLEMENTATION_STATUS.md`

* Purpose: P0 checklist.
* Why it matters: useful intended status, but must be checked against code.
* Classification: documentation

`docs/LIVE_E2E.md`

* Purpose: live no-mock runbook.
* Why it matters: defines evidence required before claiming production/live completion.
* Classification: documentation

`docs/DEMO.md`

* Purpose: demo flow.
* Why it matters: defines exact live demo claims and "XYX Observed Evidence" language.
* Classification: documentation

`docs/SECURITY.md`

* Purpose: security assumptions and operational warnings.
* Why it matters: secret separation, witness compromise response, and concentration caveats.
* Classification: documentation

`package.json`

* Purpose: root dependency and script manifest.
* Why it matters: source of build/test commands and direct dependency surface.
* Classification: configuration

`package-lock.json`

* Purpose: resolved dependency graph.
* Why it matters: shows actual installed versions and transitive duplicates.
* Classification: configuration

`pnpm-workspace.yaml`

* Purpose: workspace glob.
* Why it matters: declares `apps/*` and `packages/*`, though no package files exist below root.
* Classification: configuration

`tsconfig.json`

* Purpose: root TypeScript strict no-emit check.
* Why it matters: authoritative typecheck passes current source.
* Classification: configuration

`compose.yaml`

* Purpose: local Postgres/IPFS service definition.
* Why it matters: supports local operational dependencies.
* Classification: infrastructure

`.env.example`

* Purpose: API env variable example.
* Why it matters: documents required live config names without secrets.
* Classification: configuration

`.env.witness.example`

* Purpose: Witness env variable example.
* Why it matters: documents witness signer/relayer/evaluator config names without secrets.
* Classification: configuration

`apps/api/migrations/001_initial.sql`

* Purpose: Postgres schema.
* Why it matters: run state, idempotency, evidence records, protected jobs, events, nonce sequences.
* Classification: database

`apps/api/src/main.ts`

* Purpose: Fastify API gateway.
* Why it matters: auth, health, agent runs, SSE, wallet, risk, services, receipts, jobs.
* Classification: backend

`apps/buyer-agent/src/planner.ts`

* Purpose: LLM planner boundary.
* Why it matters: model can infer capability/body but cannot alter spending policy.
* Classification: business logic

`apps/buyer-agent/src/runtime.ts`

* Purpose: Buyer Agent orchestration.
* Why it matters: discovery, inspection, Graph freshness, risk selection, Witness execution.
* Classification: business logic

`apps/witness/src/main.ts`

* Purpose: internal Witness HTTP service.
* Why it matters: internal auth, health checks, execute/anchor/resolve endpoints.
* Classification: backend

`apps/witness/src/service.ts`

* Purpose: Witness execution engine.
* Why it matters: payment, HTTP observation, evidence, signing, anchoring, ERC-8183 verdicts.
* Classification: business logic

`apps/web/app/layout.tsx`

* Purpose: root HTML shell and navigation.
* Why it matters: future shell split point.
* Classification: UI

`apps/web/app/providers.tsx`

* Purpose: Privy, wagmi, and TanStack providers.
* Why it matters: auth and wallet configuration boundary.
* Classification: Web3

`apps/web/components/client.tsx`

* Purpose: Login button and API auth fetch helper.
* Why it matters: all frontend API auth flows depend on it.
* Classification: business logic

`apps/web/app/page.tsx`

* Purpose: current landing page.
* Why it matters: safest route for cinematic marketing redesign.
* Classification: UI

`apps/web/app/agent/page.tsx`

* Purpose: Buyer Agent UI.
* Why it matters: contains objective/policy, run start, SSE, risk state, receipt link.
* Classification: business logic

`apps/web/app/wallet/page.tsx`

* Purpose: human funding UI.
* Why it matters: Privy wallet, Arc USDC reads, transfer signing, transaction states.
* Classification: Web3

`apps/web/app/services/page.tsx`

* Purpose: observed services list.
* Why it matters: Graph-backed service evidence UI.
* Classification: UI

`apps/web/app/services/[endpointKey]/page.tsx`

* Purpose: endpoint detail view.
* Why it matters: Graph-backed detail route.
* Classification: UI

`apps/web/app/receipts/[receiptHash]/page.tsx`

* Purpose: receipt detail view.
* Why it matters: user-facing evidence inspection.
* Classification: UI

`apps/web/app/jobs/page.tsx`

* Purpose: protected jobs list.
* Why it matters: ERC-8183 Graph-backed history view.
* Classification: UI

`apps/web/app/jobs/[jobId]/page.tsx`

* Purpose: protected job detail route.
* Why it matters: Graph-backed settlement state view.
* Classification: UI

`apps/web/app/settings/page.tsx`

* Purpose: static policy/trust boundary view.
* Why it matters: explains risk model and system boundaries.
* Classification: UI

`apps/web/app/style.css`

* Purpose: global CSS.
* Why it matters: primary visual redesign surface.
* Classification: UI

`apps/web/next.config.mjs`

* Purpose: Next config and API rewrite.
* Why it matters: browser build fallbacks, security headers, backend proxy.
* Classification: configuration

`apps/web/tsconfig.json`

* Purpose: app TypeScript config for Next.
* Why it matters: Next build may attempt to auto-edit it.
* Classification: configuration

`packages/shared/src/index.ts`

* Purpose: shared schemas, canonical JSON, hashes, EIP-712 type definitions.
* Why it matters: foundation for evidence and risk determinism.
* Classification: business logic

`packages/shared/src/chain.ts`

* Purpose: Arc client and USDC balance helper.
* Why it matters: chain ID and ERC-20 decimal guard.
* Classification: Web3

`packages/shared/src/config.ts`

* Purpose: env config validation.
* Why it matters: live readiness fail-closed behavior.
* Classification: configuration

`packages/shared/src/graph.ts`

* Purpose: Graph client.
* Why it matters: `_meta`, deployment, block hash, fail-closed evidence pagination.
* Classification: business logic

`packages/shared/src/evidence.ts`

* Purpose: IPFS-compatible evidence persistence.
* Why it matters: canonical evidence upload and readback before signing.
* Classification: business logic

`packages/shared/src/storage.ts`

* Purpose: Postgres pool, migration, events, idempotent run creation.
* Why it matters: operational state and durable SSE.
* Classification: database

`packages/shared/src/verify.ts`

* Purpose: outcome classifier.
* Why it matters: prevents ambiguous/payment/client errors from becoming provider failures.
* Classification: business logic

`packages/shared/src/abi.ts`

* Purpose: ABI imports and minimal parsed ABI.
* Why it matters: Witness uses it for anchoring and evaluator calls.
* Classification: Web3

`packages/shared/test/shared.test.ts`

* Purpose: shared utility tests.
* Why it matters: canonical JSON, token precision, service identity, outcome classification.
* Classification: business logic

`packages/risk-engine/src/index.ts`

* Purpose: deterministic risk engine.
* Why it matters: provider selection logic and policy hash.
* Classification: business logic

`packages/risk-engine/test/risk.test.ts`

* Purpose: risk model tests.
* Why it matters: covers core reliability/confidence/constraint invariants.
* Classification: business logic

`packages/circle-adapter/src/index.ts`

* Purpose: Circle CLI/SDK adapter.
* Why it matters: marketplace and machine-wallet execution boundary.
* Classification: backend

`packages/circle-adapter/src/observe.mjs`

* Purpose: fetch observer for paid HTTP calls.
* Why it matters: captures response evidence and enforces SSRF protections.
* Classification: backend

`packages/contracts/src/XYXEvidenceRegistry.sol`

* Purpose: evidence receipt registry.
* Why it matters: immutable Arc receipt anchor and EIP-712 attestor verification.
* Classification: contract

`packages/contracts/src/XYXEvaluator.sol`

* Purpose: ERC-8183 signed-verdict gateway.
* Why it matters: resolves protected jobs without owning escrow.
* Classification: contract

`packages/contracts/src/interfaces/IAgenticCommerce.sol`

* Purpose: ERC-8183 interface subset.
* Why it matters: custom evaluator forwards complete/reject calls to reference deployment.
* Classification: contract

`packages/contracts/test/Security.t.sol`

* Purpose: Solidity security tests.
* Why it matters: validates receipt/verdict signatures, replay protection, pause, reentrancy, and failure behavior.
* Classification: contract

`packages/contracts/script/Deploy.s.sol`

* Purpose: Foundry deployment script.
* Why it matters: deploys only the two current P0 custom contracts.
* Classification: infrastructure

`packages/contracts/foundry.toml`

* Purpose: Foundry configuration.
* Why it matters: Solidity version, optimizer, fuzz runs, remappings.
* Classification: configuration

`packages/erc8004/README.md`

* Purpose: ERC-8004 Arc reference summary.
* Why it matters: confirms XYX consumes external registries.
* Classification: documentation

`packages/erc8004/IdentityRegistry.deployment.json`

* Purpose: Identity registry deployment snapshot.
* Why it matters: subgraph configuration reference.
* Classification: configuration

`packages/erc8004/ReputationRegistry.deployment.json`

* Purpose: Reputation registry deployment snapshot.
* Why it matters: subgraph configuration reference.
* Classification: configuration

`packages/erc8004/ValidationRegistry.deployment.json`

* Purpose: Validation registry deployment snapshot.
* Why it matters: subgraph configuration reference.
* Classification: configuration

`packages/erc8004/*.abi.json`

* Purpose: ERC-8004 ABI snapshots.
* Why it matters: Graph codegen and event mapping source.
* Classification: Web3

`packages/erc8183/deployment.json`

* Purpose: ERC-8183 AgenticCommerce deployment snapshot.
* Why it matters: reference deployment for protected jobs.
* Classification: configuration

`packages/erc8183/AgenticCommerce.abi.json`

* Purpose: ERC-8183 ABI snapshot.
* Why it matters: protected-job service and subgraph source.
* Classification: Web3

`packages/erc8183/service.ts`

* Purpose: protected-job service wrapper.
* Why it matters: create, setBudget, approve/fund, submit through Circle wallets.
* Classification: business logic

`packages/subgraph/schema.graphql`

* Purpose: Graph schema.
* Why it matters: canonical indexed entities for receipts, jobs, ERC-8004.
* Classification: infrastructure

`packages/subgraph/subgraph.yaml.template`

* Purpose: subgraph manifest template.
* Why it matters: live deployment requires real addresses/start blocks.
* Classification: infrastructure

`packages/subgraph/src/evidence.ts`

* Purpose: receipt mapping.
* Why it matters: transforms Arc receipt events into Graph evidence history.
* Classification: infrastructure

`packages/subgraph/src/commerce.ts`

* Purpose: ERC-8183 lifecycle mapping.
* Why it matters: tracks job state.
* Classification: infrastructure

`packages/subgraph/src/evaluator.ts`

* Purpose: XYX evaluator verdict mapping.
* Why it matters: reflects evaluator resolution in job state.
* Classification: infrastructure

`packages/subgraph/src/identity.ts`

* Purpose: ERC-8004 identity mapping.
* Why it matters: stores external agent identities.
* Classification: infrastructure

`packages/subgraph/src/reputation.ts`

* Purpose: ERC-8004 reputation mapping.
* Why it matters: stores feedback history, though runtime does not consume it yet.
* Classification: infrastructure

`packages/subgraph/src/validation.ts`

* Purpose: ERC-8004 validation mapping.
* Why it matters: stores validation responses, though runtime does not consume them yet.
* Classification: infrastructure

`scripts/doctor.ts`

* Purpose: config readiness checker.
* Why it matters: fail-closed live readiness gate.
* Classification: infrastructure

`scripts/create-circle-wallet.ts`

* Purpose: Circle wallet bootstrap script.
* Why it matters: creates one Arc Testnet Developer-Controlled Wallet metadata file.
* Classification: infrastructure

`scripts/render-subgraph.mjs`

* Purpose: render subgraph manifest from live deployment env.
* Why it matters: prevents fake deployment addresses/start blocks.
* Classification: infrastructure

Compact repository tree, excluding node_modules, .next, out, cache, coverage, .git, and generated artifacts:

```text
.
├── AGENTS.md
├── README.md
├── docs/XYX_TECHNICAL_PRD_v1.1.md
├── XYX_CODEX_HANDOFF.md
├── compose.yaml
├── package.json
├── package-lock.json
├── pnpm-workspace.yaml
├── tsconfig.json
├── apps
│   ├── api
│   │   ├── migrations
│   │   │   └── 001_initial.sql
│   │   └── src
│   │       └── main.ts
│   ├── buyer-agent
│   │   └── src
│   │       ├── planner.ts
│   │       └── runtime.ts
│   ├── web
│   │   ├── app
│   │   │   ├── agent/page.tsx
│   │   │   ├── jobs/page.tsx
│   │   │   ├── jobs/[jobId]/page.tsx
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx
│   │   │   ├── providers.tsx
│   │   │   ├── receipts/[receiptHash]/page.tsx
│   │   │   ├── services/page.tsx
│   │   │   ├── services/[endpointKey]/page.tsx
│   │   │   ├── settings/page.tsx
│   │   │   ├── style.css
│   │   │   └── wallet/page.tsx
│   │   ├── components
│   │   │   └── client.tsx
│   │   ├── next-env.d.ts
│   │   ├── next.config.mjs
│   │   └── tsconfig.json
│   └── witness
│       └── src
│           ├── main.ts
│           └── service.ts
├── dependency-backups
│   ├── package.json.20260908T101445Z.bak
│   └── package-lock.json.20260908T101445Z.bak
├── docs
│   ├── ARCHITECTURE.md
│   ├── DEMO.md
│   ├── IMPLEMENTATION_STATUS.md
│   ├── LIVE_E2E.md
│   └── SECURITY.md
├── packages
│   ├── circle-adapter
│   │   └── src
│   │       ├── index.ts
│   │       └── observe.mjs
│   ├── contracts
│   │   ├── foundry.toml
│   │   ├── script/Deploy.s.sol
│   │   ├── src
│   │   │   ├── XYXEvaluator.sol
│   │   │   ├── XYXEvidenceRegistry.sol
│   │   │   └── interfaces/IAgenticCommerce.sol
│   │   └── test/Security.t.sol
│   ├── erc8004
│   │   ├── IdentityRegistry.abi.json
│   │   ├── IdentityRegistry.deployment.json
│   │   ├── README.md
│   │   ├── ReputationRegistry.abi.json
│   │   ├── ReputationRegistry.deployment.json
│   │   ├── ValidationRegistry.abi.json
│   │   └── ValidationRegistry.deployment.json
│   ├── erc8183
│   │   ├── AgenticCommerce.abi.json
│   │   ├── deployment.json
│   │   └── service.ts
│   ├── risk-engine
│   │   ├── src/index.ts
│   │   └── test/risk.test.ts
│   ├── shared
│   │   ├── src
│   │   │   ├── abi.ts
│   │   │   ├── chain.ts
│   │   │   ├── config.ts
│   │   │   ├── evidence.ts
│   │   │   ├── graph.ts
│   │   │   ├── index.ts
│   │   │   ├── storage.ts
│   │   │   └── verify.ts
│   │   └── test/shared.test.ts
│   └── subgraph
│       ├── abis
│       ├── schema.graphql
│       ├── src
│       │   ├── commerce.ts
│       │   ├── evaluator.ts
│       │   ├── evidence.ts
│       │   ├── identity.ts
│       │   ├── reputation.ts
│       │   └── validation.ts
│       └── subgraph.yaml.template
└── scripts
    ├── create-circle-wallet.ts
    ├── doctor.ts
    └── render-subgraph.mjs
```
