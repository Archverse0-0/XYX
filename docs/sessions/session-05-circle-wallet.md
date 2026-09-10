# Session 05 — Circle Wallet / USDC Live Infrastructure

## Scope

Session 5 audited the manually completed Circle Developer-Controlled Wallet and
Arc Testnet USDC prerequisite. It did not perform wallet creation, contract
deployment, Graph deployment, credential rotation, or any mainnet action.

## Starting State

The Circle wallet had already been created manually outside Codex. Repository
state included `.circle/wallet-info.json`, persistent creation idempotency state,
the Arc deployment manifest entry, and the sanitized live-evidence artifact.
The existing `npm run circle:create-wallet` command is fail-closed when wallet
metadata already exists.

## Circle Credential Readiness

`CIRCLE_API_KEY` and `CIRCLE_ENTITY_SECRET` were SET in `.env` at audit time;
secret values are intentionally not recorded. The witness environment is
separate and its secret readiness is not used as wallet proof.

## Wallet Creation Result

The pre-existing Circle Developer-Controlled Wallet is the Session 5 wallet.
No creation command was executed during this audit.

## Independent Circle Verification

The operator's independent Circle API lookup returned HTTP 200 and confirmed
the wallet address, blockchain, account type, custody type, and LIVE state. The
stored sanitized evidence records this as `independentlyVerified: true`.
The audit-time API recheck was unavailable because the network/client request
failed; this does not invalidate the prior stored live proof.

## Circle Public Wallet Metadata

- Wallet ID: `97d7e14f-c4f2-5525-bbd8-4025cc21161a`
- Wallet Set ID: `04d71812-ee2a-57eb-a351-54dd3ac9d327`
- Address: `0x55763d498fd057d17ffcc2fb540789ce76f4f085`
- Blockchain: `ARC-TESTNET`
- Account type: `EOA`
- Custody type: `DEVELOPER`
- State: `LIVE`

Local Circle metadata matches these values exactly.

## `CIRCLE_AGENT_ADDRESS`

`CIRCLE_AGENT_ADDRESS` in both `.env` and `.env.witness` matches the public
wallet address above. No environment file contents or secrets are reproduced.

## Arc Testnet Verification

- Network: Arc Testnet (`arc-testnet`)
- Chain ID: `5042002`
- Deployment manifest: `deployments/arc-testnet.json`
- Manifest wallet address: matches the Circle wallet address
- Manifest wallet status: `DEPLOYED_LIVE`

The audit-time verifier read USDC decimals and wallet balance successfully,
but the Arc head request was unavailable. The prior observed live run recorded
the Arc chain/head checks as PASS.

## USDC Verification

- Contract: `0x3600000000000000000000000000000000000000`
- ERC-20 decimals: `6`
- Balance method: `balanceOf(wallet)` on Arc
- Observed balance: raw `20000000` = `20 USDC`

The stored artifact is a historical observation and was not rewritten.

## Public Evidence

`artifacts/live-evidence/session-05-circle-wallet.json`

Its classification is `LIVE_VERIFIED_CIRCLE_WALLET_INFRASTRUCTURE`; its
`machineExecutionLinkedToJobProven` and `protectedJobE2EProven` claims remain
`false`.

## Strict Verifier Results

The latest manually observed strict verifier run recorded PASS for:

- `arc.chain_id`
- `arc.head`
- contract bytecode for the registry, evaluator, ERC-8183, ERC-8004, and USDC
- `usdc.decimals`
- `wallet.usdc_balance` — Wallet balance 20 USDC
- evaluator target and pause state
- registry pause state
- `graph.meta`
- `graph.freshness`
- `graph.block_hash`

The audit rerun preserved verifier semantics and produced no FAIL results. It
was overall `BLOCKED` because current RPC/Graph access failed and witness/API
health plus later proof gates were unavailable. `wallet.usdc_balance` was
PASS, as required for Session 5.

## Remaining Later-Session Blockers

These are not Session 5 failures:

- `receipt.exists`
- `witness.health`
- `api.health`
- `feedback_loop.proof`
- `protected_job.proof`

## Security Notes

No secrets, bearer tokens, private keys, recovery material, or environment file
contents were exposed. No Circle resource was created or mutated. No
credentials were rotated, TLS validation was not disabled, and no mainnet
action was performed.

## Exact Claim Boundary

This session proves Circle wallet and funded Arc Testnet USDC infrastructure
only. Wallet/USDC readiness is not Circle machine execution. Circle machine
execution is not complete until a real Arc transaction is linked to a job.

This session does not prove `M5_MACHINE_EXECUTION_COMPLETE`,
`PROTECTED_JOB_E2E_COMPLETE`, or `WITNESS_E2E_COMPLETE`.

## Final Classification

`LIVE_VERIFIED_CIRCLE_WALLET_INFRASTRUCTURE`
