# P0 implementation status

This checklist maps the repository to the frozen P0 requirements. All source code, comments, schemas, and UI text are English-language.

| PRD area | Implementation | Verification or gate |
| --- | --- | --- |
| Arc Testnet and USDC | `packages/shared/src/chain.ts` pins chain ID `5042002`, the Arc USDC contract, and six-decimal accounting | Runtime rejects another chain or token precision |
| Evidence registry | `packages/contracts/src/XYXEvidenceRegistry.sol` verifies EIP-712 attestor signatures, URI/hash binding, freshness, nonce/digest replay protection, optional ERC-8004 mapping, and pause roles | `packages/contracts/test/Security.t.sol` |
| Protected Job evaluator | `packages/contracts/src/XYXEvaluator.sol` verifies short-lived signed verdicts, consumes replay state before the ERC-8183 call, and forwards `complete`/`reject` | `packages/contracts/test/Security.t.sol` |
| ERC-8183 | Verified Arc reference proxy and ABI are recorded under `packages/erc8183/`; `ProtectedJobService` uses the real `submit`, `complete`, `reject`, budget, approval, and funding calls | Requires a configured provider and funded live wallets |
| Circle wallets and discovery/payment | `packages/circle-adapter/` uses the official Circle Developer-Controlled Wallets SDK for Arc contract execution and wallet liveness, while the isolated marketplace path invokes the Circle CLI without a shell, enforces HTTPS and Arc exact-payment compatibility, captures response bytes, and preserves unknown payment state | Requires Circle API key + registered Entity Secret for wallet operations, plus marketplace CLI credentials and explicit local terms acknowledgement |
| Witness | `apps/witness/` is the only component that signs evidence, persists/read-backs IPFS evidence, anchors receipts, and resolves jobs | `/healthz` fails closed until Arc, Graph, Circle, IPFS, Postgres, and signer roles are live |
| Deterministic risk | `packages/risk-engine/` implements the PRD window, outcome exclusions, Wilson bound, concentration signal, diversity threshold, validation weighting, hard constraints, and deterministic tie-breaks | `packages/risk-engine/test/risk.test.ts` |
| Graph | `packages/subgraph/` indexes XYX contracts, ERC-8183, and ERC-8004 Identity/Reputation/Validation; rendering requires real deployment addresses and start blocks | Graph codegen/build succeeds with compile-only values; deployment is a live gate |
| Privy/API | `apps/api/` verifies Privy access tokens and restricts the configured operator DID; `apps/web/` uses Privy embedded wallets and displays real transaction states | Requires a real Privy app and verification key |
| Persistence/idempotency | Postgres migrations cover runs, attempts, evidence, jobs, and durable event streams; payment and anchoring retries reconcile existing state | Local Postgres/IPFS compose services are available |
| Explicit P0 boundaries | No XYX token, custom escrow, custom identity registry, DAO, cross-chain settlement, BFT consensus, or ZK circuit is added | These remain outside the frozen P0 scope |

The repository does not claim a live no-mock run until the values listed in [LIVE_E2E.md](LIVE_E2E.md) are configured and the acceptance transaction hashes are recorded.
