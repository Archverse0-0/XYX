# Session 03 — Arc Testnet Contract Deployment

## Executive Result

`LIVE_VERIFIED_CONTRACT_INFRASTRUCTURE`

Exactly the two frozen XYX P0 contracts were deployed to Arc Testnet and independently verified onchain. This classification applies only to their deployment and configuration; it does not claim Graph, Circle, Witness runtime, commerce, or protected-job E2E readiness.

## Pre-Deployment State

The prior manifest listed both XYX contracts as not deployed. The owner supplied canonical P0 policy values, and the Solidity constructors were inspected before broadcast.

## Pre-Deployment Validation

Node tests, Solidity tests, typecheck, and contract build were green before broadcast. The Foundry simulation completed successfully for the exact two-contract flow. No alternate network or RPC fallback was used.

## Arc Network Verification

The RPC returned chain ID `5042002` (Arc Testnet). The deployer was `0xD42edDe4274A91814666B795708BDAc74c8B14d6` with sufficient native Arc balance. The deployment script fails closed on any other chain.

## Deployment Configuration

Public deployment values were:

- `XYX_ADMIN` / `XYX_PAUSER`: `0xD42edDe4274A91814666B795708BDAc74c8B14d6`
- `XYX_WITNESS_ATTESTOR`: `0x15cd0E9055BD775eF69000438e756E4476562E8F`
- `XYX_EVALUATOR_ATTESTOR`: `0x644C11572E3792bd1dE5959D09ECBc6f63304277`
- `ERC8183_ADDRESS`: `0x0747EEf0706327138c69792bF28Cd525089e4583`
- `RECEIPT_MAX_AGE`: `86400` seconds (24 hours)
- `VERDICT_LIFETIME`: `300` seconds (5 minutes)

The constructors use seconds: both values are compared directly with `block.timestamp` deltas.

## ERC-8183 Verification

The configured ERC-8183 target is non-zero, has 212 bytes of bytecode, and its `jobCounter()` read returned successfully. The evaluator's observed `agenticCommerce()` is exactly the configured target.

## Signer Model

The deployer/admin/pauser is `0xD42edDe4274A91814666B795708BDAc74c8B14d6`. Witness attestation uses `0x15cd0E9055BD775eF69000438e756E4476562E8F`; evaluator attestation uses `0x644C11572E3792bd1dE5959D09ECBc6f63304277`. The attestors are distinct.

## XYXEvidenceRegistry Deployment

- Address: `0xfB94329c89Af2FC541bEf32e1ec99cbed87a39F2`
- Deployment transaction: `0x41d3b6651b83df8883570abd30a1c6ce89b11267818d367100ef3b2afee447ca`
- Confirmed block: `61238484`
- Observed bytecode: 5,270 bytes
- `maxReceiptAge`: `86400`
- Pause state: `false`

## XYXEvaluator Deployment

- Address: `0xCEBFedAc66B0fFfAD452D3f1B356D1A3120dB233`
- Deployment transaction: `0x6ec0407bb51b50fdad652822a14ed510e460dada542f33d666a7fdb1d603d0f6`
- Confirmed block: `61238490`
- Observed bytecode: 5,137 bytes
- `agenticCommerce()`: `0x0747EEf0706327138c69792bF28Cd525089e4583`
- `maxVerdictLifetime`: `300`
- Pause state: `false`

## Transaction Evidence

Both deployment receipts were independently fetched and had status `success`. No ambiguous transaction state was encountered.

## Role Verification Matrix

| Contract | Role/invariant | Expected | Observed | Result |
| --- | --- | --- | --- | --- |
| Registry | admin | deployer address | admin role true | PASS |
| Registry | attestor | witness address | attestor role true | PASS |
| Registry | pauser | deployer address | pauser role true | PASS |
| Evaluator | admin | deployer address | admin role true | PASS |
| Evaluator | attestor | evaluator address | attestor role true | PASS |
| Evaluator | pauser | deployer address | pauser role true | PASS |
| Both | unauthorized attestor | false | false | PASS |
| Both | pause state | unpaused | `false` | PASS |
| Evaluator | ERC-8183 target | configured address | exact match | PASS |

## Signer Separation

`0x15cd0E9055BD775eF69000438e756E4476562E8F != 0x644C11572E3792bd1dE5959D09ECBc6f63304277`: PASS. The unauthorized sentinel address did not hold either attestor role.

## Deployment Manifest

`deployments/arc-testnet.json` now contains the observed addresses, successful transaction hashes, deployment blocks, policy values, target, and public signer addresses. Graph, Circle, wallet, and E2E fields remain in their prior truthful states.

## Strict Verifier Results

`npm run verify:live` exited `1` as required because unrelated infrastructure remains incomplete. Result: overall `FAIL`, PASS `10`, FAIL `2`, BLOCKED `5`, NOT_YET_PROVEN `2`. Contract-related checks passed: registry bytecode, evaluator bytecode, evaluator target, evaluator pause state, registry pause state, and ERC-8183 bytecode. Graph, wallet, Witness/API dependencies, feedback-loop proof, and protected-job proof remain blocked or unproven.

## Evidence Artifact

Sanitized public deployment evidence is at `artifacts/live-evidence/session-03-contract-deployment.json`. It contains no private keys or secret-bearing environment values.

## Tests

- Node: 178 passed, 0 failed.
- Solidity: 24 passed, 0 failed.
- Typecheck: passed.
- Contract build: passed (existing Foundry lint warnings only).
- Foundry simulation: passed.
- Broadcast: two successful deployment transactions.

## Remaining Blockers

Graph deployment/indexing, Circle wallet configuration, Witness/API runtime readiness, evidence storage, live receipt proof, feedback-loop proof, and protected-job E2E remain for later sessions. No status for those systems was upgraded here.

## Security Review

Only public addresses, hashes, blocks, role observations, and policy values were written to public metadata. Private signer material was not placed in the manifest, report, or evidence artifact. Exactly two custom contracts were deployed.

## Final Classification

`LIVE_VERIFIED_CONTRACT_INFRASTRUCTURE`
