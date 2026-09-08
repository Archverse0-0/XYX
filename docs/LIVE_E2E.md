# Live no-mock E2E runbook

This runbook is the gate for claiming P0 completion. A local test or a UI screenshot is not evidence of a live run.

## Required values

Create `.env` for the API and `.env.witness` for the Witness from the example files. Obtain, through their official dashboards, a Privy app ID and verification key, a Circle API key and registered Entity Secret, a live Arc RPC, the Circle Developer-Controlled Wallet address, a deployed XYX Evidence Registry and XYX Evaluator address, IPFS API access, and a Graph Studio endpoint/deployment ID. The application uses Circle's Developer-Controlled Wallets SDK for Arc contract execution; API keys and Entity Secrets stay server-side and must never be committed or sent in chat. Marketplace discovery/payment remains an isolated Circle CLI integration and requires the operator to accept the CLI terms locally.

To create the wallet used by XYX, run `npm run circle:create-wallet` after setting `CIRCLE_API_KEY` and `CIRCLE_ENTITY_SECRET` in `.env`. The script creates one EOA wallet in a new wallet set on `ARC-TESTNET`, writes only non-secret metadata to `.circle/wallet-info.json`, and prints the address. Copy that address into `CIRCLE_AGENT_ADDRESS` in both `.env` and `.env.witness`, then fund it from the [Circle Faucet](https://faucet.circle.com/) by selecting **Arc Testnet** and sending USDC to the address. Run the command once; do not create a new wallet set for every restart.

The user must fund a real Privy embedded wallet on Arc Testnet. The user then signs a real ERC-20 USDC transfer to the Circle Developer-Controlled Wallet. The live run needs enough Arc Testnet USDC for discovery/payment and enough wallet gas according to the current Arc environment.

## Deployment order

1. Run the Foundry unit/fuzz suite.
2. Deploy `XYXEvidenceRegistry` with separate admin, attestor, and pauser addresses.
3. Deploy `XYXEvaluator` with the verified Arc ERC-8183 proxy address `0x0747EEf0706327138c69792bF28Cd525089e4583` and separate admin, attestor, and pauser addresses.
4. Grant only the configured Witness signer `ATTESTOR_ROLE`; grant pause to the operational pauser.
5. Record deployment addresses and start blocks. Render the Graph manifest with `npm run subgraph:render`, then run `npm run subgraph:codegen` and deploy through Graph Studio.
6. Run the API and Witness. Both `/healthz` endpoints must be green; readiness intentionally fails when Graph, Circle Developer-Controlled Wallets, marketplace CLI, IPFS, Arc, or signer configuration is unavailable.

## Acceptance evidence

Capture the real transaction hashes for human funding, Circle payment settlement, the `ReceiptAnchored` transaction, and Graph indexing. Record the exact provider URL, endpoint/spec hashes, payment amount, HTTP status, latency, evidence CID, receipt digest, indexed block, and subsequent risk decision. The receipt must be queried back from the live Graph and included in a later deterministic risk evaluation.

For Protected Job, use the current verified ABI in `packages/erc8183/AgenticCommerce.abi.json`: create job, provider `setBudget`, exact USDC approval, fund, provider submit, signed XYX verdict, evaluator resolution, and actual Completed/Rejected settlement. A controlled rejection must be labeled as a Controlled Fault Test.

Do not intentionally overload or degrade unrelated providers. If payment or anchoring becomes uncertain, preserve the idempotency key and reconcile the existing transaction instead of retrying a paid request.
