# XYX — Expose, Yield, Execute

XYX is the risk, verification, and settlement layer for autonomous agent commerce. The implementation follows the frozen P0 architecture in `XYX — End-to-End Product Requirements Document v1.0.md`.

The repository is intentionally English-language for contributors and reviewers. User-facing operational notes are available in `docs/`.

## Status

The local P0 foundation is implemented: immutable evidence anchoring, signed ERC-8183 verdict forwarding, deterministic risk scoring, Circle marketplace execution boundaries, a centralized Execution Witness, Postgres idempotency, IPFS evidence verification, Graph querying, and a Privy/wagmi frontend.

The live no-mock acceptance flow is not claimed until real credentials, deployed XYX contract addresses, a live subgraph endpoint, and funded Arc Testnet wallets are configured. The test suite uses only the isolated mocks allowed by PRD section 104.

See [IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md) for a requirement-by-requirement P0 checklist.

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

Follow [LIVE_E2E.md](docs/LIVE_E2E.md). Do not put private keys in chat or commit them. The witness and evaluator keys must be separate from the API runtime and relayer key.

The Arc reference ERC-8183 proxy is recorded in `packages/erc8183/deployment.json`; its ABI is stored from the verified explorer response. ERC-8004 Arc deployment addresses and ABI snapshots are under `packages/erc8004/`.

## Scope boundaries

P0 does not add an XYX token, custom escrow, custom identity/reputation registry, DAO, cross-chain settlement, ZK circuits, or BFT consensus. Those are explicitly out of scope in the PRD.
