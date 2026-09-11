# Session 07B — ERC-8004 Controlled Provider Identity

## Scope

Session 07B completed the controlled-provider identity boundary only. It did
not create another identity, deploy a contract, change The Graph, create a
Circle wallet, execute a protected job, produce Witness evidence, or settle a
job.

## Confirmed Onchain Registration

Arc Testnet chain ID: `5042002`.

Identity Registry: `0x8004A818BFB912233c491871b3d84c89A494BD9e`.

Confirmed registration transaction:

`0x97e29a7f09f8071b466cb3754eff22adb4add389887563ba73a119b5a5a41a2a`

The receipt succeeded in block `61556408`. The real agent ID is `894335`.
This value was derived from confirmed receipt/onchain state, not accepted from
the earlier `eth_call` simulation.

Independent Arc RPC verification confirmed:

- `ownerOf(894335)` equals `0x7ea90Ac2A2bA5fF6c71e7E9D23037D64AbD2b4da`.
- `tokenURI(894335)` equals `https://xyx-provider.vercel.app/agent-metadata.json`.
- `getAgentWallet(894335)` equals `0x7ea90Ac2A2bA5fF6c71e7E9D23037D64AbD2b4da`.

## Provider Production Configuration

The existing Vercel production project received these public Config values:

- `ERC8004_AGENT_ID=894335`
- `PROVIDER_PAYEE_ADDRESS=0x7ea90Ac2A2bA5fF6c71e7E9D23037D64AbD2b4da`

`PROVIDER_PUBLIC_ORIGIN` remained `https://xyx-provider.vercel.app`.

Production deployment:

`https://xyx-provider-1pmqcll0z-fao2-5364s-projects.vercel.app`

Stable alias:

`https://xyx-provider.vercel.app`

## Public Verification

- `GET /api/health`: HTTP 200; `ok`, `xyx-provider`, `arc-testnet`.
- `GET /.well-known/agent-registration.json`: HTTP 200; exactly one Arc
  identity-registry registration for agent ID `894335`.
- `GET /agent-metadata.json`: HTTP 200; services include exactly
  `https://xyx-provider.vercel.app/api/task`.
- `POST /api/task`: HTTP 200; deterministic normalized result verified.
- `GET /erc8004-register`: HTTP 404 in production.

## Production Resolver and Validation

The production `ERC8004Client.resolve()` path resolved:

```json
{
  "registry": "0x8004A818BFB912233c491871b3d84c89A494BD9e",
  "agentId": "894335"
}
```

The production `GraphClient.validations("894335", indexedBlock)` query
succeeded with zero records. This is `QUERY_WORKS_EMPTY_RESULT`; no validation
score was fabricated.

## Regression

- Provider tests: 14 passing.
- Provider typecheck and production build: passing.
- Repository typecheck: passing.
- Repository Node tests: 183 passing.
- Strict verifier: `PASS=15`, `FAIL=0`, `BLOCKED=2`, `NOT_YET_PROVEN=3`.
  The remaining blocked/not-yet-proven items are later Witness/API/receipt/
  feedback/protected-job dependencies and do not invalidate this identity proof.

## Claim Boundary

No mocked identity was used. Session 07B proves a real controlled provider
identity can be resolved by the production XYX ERC-8004 client against Arc
Testnet state and public provider documents.

It does not prove Buyer Agent live selection, a protected-job lifecycle,
machine execution linked to a job, Witness evidence, receipt anchoring, Graph
feedback, settlement, or P0 completion.

## Classification

`LIVE_ERC8004_CONTROLLED_PROVIDER_IDENTITY_VERIFIED`

## Evidence

`artifacts/live-evidence/session-07b-erc8004-controlled-provider.json`
