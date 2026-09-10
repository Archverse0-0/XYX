# Session 04 — The Graph Arc Testnet Deployment

## Executive Result

`BLOCKED_BY_CONFIGURATION`

The existing XYX P0 subgraph renders, code-generates, and builds for Arc Testnet, but no live Studio deployment was attempted because this checkout has no Subgraph Studio project/slug and no deploy key. No fake endpoint, deployment ID, or evidence artifact was created.

## Official Documentation / Tooling Verification

- Local CLI: `@graphprotocol/graph-cli/0.91.1 linux-x64 node-v24.20.0`.
- `graph auth --help` accepts a deploy key; `graph deploy --help` supports version labels and network selection.
- Current official Graph documentation identifies Arc Testnet as `arc-testnet`, chain `eip155:5042002`.
- Studio deployment is a private/test deployment; publishing to the decentralized network is a separate onchain lifecycle and was not performed.
- Official references: https://thegraph.com/docs/en/supported-networks/arc-testnet/ and https://thegraph.com/docs/en/subgraphs/developing/deploying-publishing/using-subgraph-studio/.

## Pre-Deployment Graph State

`GRAPH_URL` and `GRAPH_DEPLOYMENT_ID` remain placeholders. No `GRAPH_DEPLOY_KEY`, `THEGRAPH_DEPLOY_KEY`, or project slug is configured. Prior Graph verifier failures remain truthful.

## Existing Subgraph Architecture

The repository contains P0 entities `Endpoint`, `Receipt`, `AgentIdentity`, `Validation`, `Feedback`, and `Job`. Mappings consume EvidenceRegistry receipts, Evaluator verdicts, ERC-8183 job events, and ERC-8004 identity/validation/reputation events. No speculative schema or mapping changes were made.

## Data Source Matrix

| Source | Address | Start block | Events | Mapping/entities | Required |
| --- | --- | ---: | --- | --- | --- |
| XYXEvidenceRegistry | `0xfB94329c89Af2FC541bEf32e1ec99cbed87a39F2` | 61238484 | `ReceiptAnchored` | `evidence.ts` / Receipt, Endpoint | Yes |
| XYXEvaluator | `0xCEBFedAc66B0fFfAD452D3f1B356D1A3120dB233` | 61238490 | `JobVerdictExecuted` | `evaluator.ts` / Job | Yes |
| ERC-8183 AgenticCommerce | `0x0747EEf0706327138c69792bF28Cd525089e4583` | 61238484 | job lifecycle events | `commerce.ts` / Job | Yes |
| ERC-8004 Identity | `0x8004A818BFB912233c491871b3d84c89A494BD9e` | 61238484 | `Registered` | `identity.ts` / AgentIdentity | Existing enrichment |
| ERC-8004 Validation | `0x8004Cb1BF31DAf7788923b405b754f57acEB4272` | 61238484 | `ValidationResponse` | `validation.ts` / Validation | Existing enrichment |
| ERC-8004 Reputation | `0x8004B663056A597Dffe9eCcC1965A193B7388713` | 61238484 | feedback/revocation | `reputation.ts` / Feedback | Existing enrichment |

All six reference addresses have non-empty bytecode on Arc. Where historical external deployment blocks are not present in the repository, `61238484` is used as the conservative P0 launch boundary, not claimed as their original deployment block.

## Arc Testnet Network Verification

RPC chain ID was confirmed as `5042002`. The two XYX contract addresses have non-empty bytecode and were not redeployed.

## ABI Verification

The subgraph ABIs contain the deployed `ReceiptAnchored` and `JobVerdictExecuted` event shapes plus the existing ERC-8183/ERC-8004 interfaces. Codegen loaded all six ABIs successfully.

## Rendered Manifest

`packages/subgraph/subgraph.yaml` rendered with `network: arc-testnet`, canonical XYX addresses, start blocks `61238484` and `61238490`, valid ABI paths, and no placeholders or zero XYX addresses.

## Codegen

`npm run subgraph:codegen` passed.

## Build

`npm run subgraph:build` passed. No unsupported-network, ABI, manifest, or mapping errors occurred.

## Repository Tests

- Node: 178 passed, 0 failed.
- Solidity: 24 passed, 0 failed.
- Typecheck: passed.

## Initial Studio Authentication State

Not attempted. A deploy key is not configured. No credential was printed or written to this report.

## Initial Graph Studio Deployment State

Not attempted because the required Studio project/slug and deploy key are absent. The operator must create or identify the XYX Studio subgraph, obtain its deploy key from the Studio details page, and provide those values through local environment configuration. The deploy key must not be pasted into chat.

## Initial Live Query Endpoint State

Unavailable because no deployment occurred. `GRAPH_URL` remains a placeholder.

## Initial _meta Verification State

Not applicable. There is no observed live deployment ID or endpoint to query.

## Initial Indexing Error State

Not applicable. No Graph deployment exists in this session.

## Initial Graph ↔ Arc Freshness State

Not applicable until a live endpoint returns `_meta.block.number` and `_meta.block.hash`.

## Initial Graph ↔ Arc Block Hash State

Not applicable until deployment.

## Initial Schema Query State

Local schema/build validation passed. Live entity queries were not possible without an endpoint.

## Initial Receipt State

No receipt query was executed and no receipt was fabricated. After a healthy deployment with no real `ReceiptAnchored` event, the strict verifier must report `receipt.exists = NOT_YET_PROVEN`.

## Initial Deployment Manifest State

None. `deployments/arc-testnet.json` remains truthful with Graph status `NOT_DEPLOYED`; contract and signer metadata are unchanged.

## Initial Strict Verifier Results

Graph checks remain as expected for the undeployed state: `graph.meta = FAIL`, `graph.freshness = BLOCKED`, `graph.block_hash = BLOCKED`, and `receipt.exists = FAIL` because metadata is not healthy. No verifier semantics were weakened.

## Initial Public Evidence State

Not created because no real Graph deployment exists.

## Security Review

No deploy key, API key, authorization header, or environment secret was printed, committed, or placed in a report/artifact. No Graph entities or receipts were manually inserted.

## Historical Remaining Blockers

1. Create or identify the correct XYX Subgraph Studio project and slug.
2. Configure the Studio deploy key locally using the current `graph auth <DEPLOY_KEY>` flow.
3. Configure the resulting live query endpoint and deployment ID locally.
4. Deploy, wait for indexing, query `_meta`, compare Graph and Arc block hashes, then update the public manifest and create the Session 4 evidence artifact.

## Resumed Live Deployment Result

Session 04 was subsequently resumed with real Graph Studio configuration and completed successfully.

- Studio slug: `xyx-arc`
- Version: `v0.1.0`
- Deployment CID: `QmaFDTDR41XFiatVmRnjoi3siZBXW9n4zAhCanU6T5CFrQ`
- Live endpoint: `https://api.studio.thegraph.com/query/1759975/xyx-arc/v0.1.0`
- Graph indexing errors: `false`
- Observed indexed block: `61276005`
- Graph/Arc block hash: `0x487cb7dd9f0f618ddab9927ae89049eaf090fe41874ad0be1079c63bfce392d9`
- Graph deployment ID match: `PASS`
- Graph/Arc block hash match: `PASS`
- `graph.meta`: `PASS`
- `graph.freshness`: `PASS`
- `graph.block_hash`: `PASS`
- `receipt.exists`: `NOT_YET_PROVEN`

Zero receipts is truthful at this stage because no real `ReceiptAnchored` lifecycle has yet been executed. It is not a Graph infrastructure failure.

`deployments/arc-testnet.json` now records the live deployment CID, endpoint, start block `61238484`, and status `DEPLOYED_LIVE`.

Sanitized public evidence is recorded at:

`artifacts/live-evidence/session-04-graph-live-deployment.json`

The evidence proves live Graph deployment, healthy Arc indexing, and Arc block provenance. It does not claim commerce E2E, feedback-loop proof, or Protected Job E2E.

## Final Classification

`LIVE_VERIFIED_GRAPH_INFRASTRUCTURE`
