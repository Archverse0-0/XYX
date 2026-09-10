# XYX Provider

This independently deployable Next.js app exposes a deterministic provider task
endpoint and prepares the public documents consumed by XYX's `ERC8004Client`.

## Routes

- `GET /api/health` returns the public service status.
- `POST /api/task` accepts `{ "text": string }` and returns a whitespace-normalized result.
- `GET /.well-known/agent-registration.json` returns the ERC-8004 registration document only after public identity configuration is complete.
- `GET /agent-metadata.json` returns the metadata service endpoint only after public identity configuration is complete.

Before registration configuration exists, the ERC-8004 routes return `503` and
do not emit an agent ID. The task API remains usable without secrets or an
on-chain identity.

## Configuration

Copy `.env.example` to a local untracked environment file and set only public
values after the provider has a real HTTPS origin and a real ERC-8004 identity:

- `PROVIDER_PUBLIC_ORIGIN` — HTTPS origin without a path.
- `ERC8004_AGENT_ID` — real registered Arc Testnet agent identifier.
- `PROVIDER_PAYEE_ADDRESS` — public wallet returned by `getAgentWallet(agentId)`.

The well-known registration uses the Arc Testnet identity registry and the
metadata service endpoint is derived from the same origin as
`${PROVIDER_PUBLIC_ORIGIN}/api/task`. This preserves the exact endpoint-match
requirement of the production resolver.

## Independent deployment readiness

For a future Vercel deployment, select this repository and set **Root
Directory** to `apps/provider`. Use the package scripts in this directory:

```sh
npm run build
npm run start
```

Deployment and ERC-8004 registration are intentionally outside this provider
preparation task.
