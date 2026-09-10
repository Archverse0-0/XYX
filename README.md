# XYX — Expose, Yield, Execute

XYX verifies what autonomous agents actually did before paid jobs settle onchain.

The repository is intentionally English-language for contributors and reviewers. User-facing operational notes are available in `docs/`.

## Current Documentation Authority

The current primary implementation reference is
[docs/XYX_TECHNICAL_PRD_v1.1.md](docs/XYX_TECHNICAL_PRD_v1.1.md).

When sources conflict, use this order:

1. Frozen PRD invariants.
2. Verified current implementation and live facts.
3. The canonical technical PRD v1.1.
4. Future ideas and backlog.

Verified execution history is recorded in [docs/sessions/](docs/sessions/),
with sanitized live proof under [artifacts/live-evidence/](artifacts/live-evidence/).
Anything under [docs/archive/](docs/archive/) is historical and must not be
used as current implementation authority.

## Status

The repository contains verified foundation work and remaining P0 lifecycle
dependencies. Consult the canonical PRD and session reports for the current
claim boundary of each component.

The full live protected-job lifecycle is not claimed. Mocks and fixtures are
limited to local tests; live acceptance requires real external dependencies and
verifiable testnet evidence. ERC-8004 remains
`LIVE_ERC8004_REGISTRY_VERIFIED_IDENTITY_NOT_YET_PROVEN` until a public provider
identity mapping is independently verified.

## Requirements

- Node.js 20+
- Foundry (forge)
- Docker (for local Postgres and IPFS)
- A Circle Developer-Controlled Wallets account with an API key and registered Entity Secret for Arc wallet operations
- Circle Agent Stack CLI access for live marketplace discovery and payment operations
- A Privy app for the human funding flow
- A Graph Studio deployment for the Arc Testnet subgraph

## Local verification

```bash
npm install
npm test
npm run typecheck
npm run test:contracts
npm run build:contracts
```

Start local operational dependencies with a password that is kept outside git:

```bash
export POSTGRES_PASSWORD="$(openssl rand -base64 32)"
docker compose up -d postgres ipfs
```

Run `npm run doctor` after creating the environment files. The doctor fails closed when required values are missing; it never generates fake deployment addresses or fake balances.

## Live setup

Follow the live-proof requirements in the canonical PRD and the corresponding
verified session reports. Do not put private keys in chat or commit them. The
witness and evaluator keys must be separate from the API runtime and relayer
key.

The Arc reference ERC-8183 proxy is recorded in `packages/erc8183/deployment.json`; its ABI is stored from the verified explorer response. ERC-8004 Arc deployment addresses and ABI snapshots are under `packages/erc8004/`.

## Scope boundaries

P0 does not add an XYX token, custom escrow, custom identity/reputation registry, DAO, cross-chain settlement, ZK circuits, or BFT consensus. Those are explicitly out of scope in the PRD.
