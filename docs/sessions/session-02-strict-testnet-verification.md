# Session 02 — Strict Arc Testnet Verification

## Executive Result

The live verifier is fail-closed and Arc Testnet-only. No deployment or live evidence was created. Current classification: PARTIALLY_IMPLEMENTED.

## Initial Verifier Problems

The previous checker could pass a Graph deployment with indexing errors, treated zero receipts as proof, did not compare Graph and Arc block hashes, used unsafe numeric formatting for USDC, and returned exit code zero for blocked or unproven results.

## Verification Architecture

scripts/verify-live.ts loads public deployment metadata first, overlays environment configuration, emits stable check IDs, and separates PASS, FAIL, BLOCKED, and NOT_YET_PROVEN. It uses actual EvidenceRegistry and Evaluator interfaces and the existing EvidenceStorage semantics.

## Result State Semantics

PASS requires a positive assertion. FAIL means reachable state violates an invariant. BLOCKED means required configuration or dependency is unavailable. NOT_YET_PROVEN means infrastructure exists but no live evidence exists.

## Strict Exit Semantics

The default npm run verify:live exits non-zero for every FAIL, BLOCKED, or NOT_YET_PROVEN result. --report-only is available for development reports.

## Arc Checks

Chain ID must equal 5042002; head block and timestamp are checked for freshness. Block numbers remain BigInt values.

## Contract Checks

EvidenceRegistry and Evaluator bytecode are checked. Evaluator agenticCommerce() is compared with the configured ERC-8183 target and pause state is checked. Registry pause state is checked when deployed.

## ERC-8183 Checks

The configured/reference Arc Testnet ERC-8183 address must contain bytecode. Full lifecycle proof remains a later-session concern.

## ERC-8004 Checks

The configured IdentityRegistry address must contain bytecode. Identity mapping remains optional enrichment and is not fabricated.

## USDC Checks

USDC bytecode and decimals are checked. Wallet balances use bigint and exact formatUnits; zero balance is NOT_YET_PROVEN.

## Graph Checks

Missing _meta, deployment mismatch, indexing errors, and invalid block hashes fail closed. Receipt count zero is NOT_YET_PROVEN.

## Graph Freshness and Block Hash

Graph block number is compared with Arc head, maximum lag is enforced, and the exact Arc block hash must match Graph _meta.block.hash.

## Receipt Verification

The verifier queries actual schema fields and reserves Arc event correlation for a real indexed receipt. A future live implementation can use compareReceipt against the ReceiptAnchored event.

## Evidence Verification

Receipt evidence must contain URI and hash bindings. When IPFS is configured, the existing EvidenceStorage.readJSON path verifies URI format, size, canonical JSON, and content hash. Missing storage is BLOCKED; mismatch is FAIL.

## Witness/API Health vs Readiness

The current services expose health but not sufficient safe readiness evidence. The verifier reports that limitation as NOT_YET_PROVEN rather than treating process liveness as full readiness.

## Open Purchase Proof Model

No Open Purchase is executed in this session. Its eventual real payment, provider response, witness evidence, signed receipt, Arc anchor, and Graph index remain NOT_YET_PROVEN.

## Graph Feedback Loop Proof Model

No live Decision A to receipt to Graph to Decision B artifact is generated. The check remains NOT_YET_PROVEN.

## Protected Job Proof Model

No Protected Job is executed. Job lifecycle and settlement proof remain NOT_YET_PROVEN.

## Machine-Readable Output

--json emits verifier version, network, timestamp, git commit when configured, overall state, stable IDs, details, and public identifiers only.

## Security / Secret Redaction

Secrets and full environment dumps are never printed. Private keys, API keys, and IPFS authorization are not included in report data.

## Files Changed

- scripts/verify-live.ts
- packages/shared/test/verify-live.test.ts
- docs/session-02-strict-testnet-verification.md

## Tests Added

Exact verifier scenarios covered:

- Arc: correct chain ID, wrong chain ID, RPC unavailable, and stale head timestamp.
- Graph: valid metadata, deployment mismatch, indexing errors, future block, excessive lag, hash mismatch, and matching fresh block.
- Receipts: zero receipts, matching ReceiptAnchored event, mismatched fields, failed transaction, and wrong registry emitter.
- Evidence: canonical content, content hash mismatch, unavailable storage after a receipt, invalid URI, and evidenceURIHash mismatch.
- Contracts: bytecode present/absent for registry, evaluator, ERC-8183, and ERC-8004; evaluator target match/mismatch; USDC decimals 6/non-6.
- CLI/report: PASS/FAIL/BLOCKED/NOT_YET_PROVEN exit decisions and sentinel secret redaction in JSON serialization.

## Acceptance Matrix

| Requirement | Production Function | Called By verifyLive? | Test Exists? | Result |
| --- | --- | --- | --- | --- |
| Correct Arc chain ID | verifyArcChain | Yes | Yes | PASS |
| Wrong Arc chain ID | verifyArcChain | Yes | Yes | PASS |
| Arc RPC unavailable | verifyArcChain | Yes | Yes | PASS |
| Stale Arc head | verifyArcChain | Yes | Yes | PASS |
| Valid Graph metadata | verifyGraphMeta | Yes | Yes | PASS |
| Graph deployment mismatch | verifyGraphMeta | Yes | Yes | PASS |
| Graph indexing errors | verifyGraphMeta | Yes | Yes | PASS |
| Graph ahead of Arc | verifyGraphFreshness | Yes | Yes | PASS |
| Graph lag limit | verifyGraphFreshness | Yes | Yes | PASS |
| Graph block hash mismatch | verifyGraphFreshness | Yes | Yes | PASS |
| Matching Graph freshness | verifyGraphFreshness | Yes | Yes | PASS |
| Zero receipts | classifyReceiptCount / verifyReceiptProof | Yes | Yes | PASS |
| Matching Arc ReceiptAnchored event | verifyReceiptProof / compareReceipt | Yes | Yes | PASS |
| Mismatched Arc event | compareReceipt | Yes | Yes (helper) | PASS |
| Failed Arc transaction | verifyReceiptProof | Yes | Yes | PASS |
| Wrong registry event | verifyReceiptProof | Yes | Yes | PASS |
| Canonical evidence | verifyEvidence / EvidenceStorage.readJSON | Yes | Yes | PASS |
| Evidence hash mismatch | verifyEvidence | Yes | Yes | PASS |
| Evidence unavailable | verifyEvidence | Yes | Yes | PASS |
| Invalid evidence URI | verifyEvidence | Yes | Yes | PASS |
| evidenceURIHash mismatch | verifyReceiptProof | Yes | Yes | PASS |
| Registry/evaluator bytecode | verifyContractBytecode | Yes | Yes | PASS |
| Evaluator target match/mismatch | main contract check | Yes | Yes | PASS |
| ERC-8183 bytecode | verifyContractBytecode | Yes | Yes | PASS |
| ERC-8004 bytecode | verifyContractBytecode | Yes | Yes | PASS |
| USDC decimals | main USDC check | Yes | Yes | PASS |
| Strict overall status | overallStatus | Yes | Yes | PASS |
| CLI exit 0/1 matrix | main process exit | Yes | Yes | PASS |
| JSON secret redaction | JSON report construction | Yes | Yes | PASS |

All mandatory production-path categories now have deterministic tests. CLI exit semantics are covered through the exact production exitCodeForStatus function, and JSON output is covered through the production serializeReport redaction function.

## Validation Results

Typecheck passes. Repository tests: 178 passed, 0 failed. Solidity tests: 24 passed, 0 failed; contract build passes with existing lint warnings. Strict verifier exits 1 with overall FAIL/BLOCKED/NOT_YET_PROVEN checks in the current partially configured environment. Current strict counts are PASS=5, FAIL=2, BLOCKED=9, NOT_YET_PROVEN=2.

## Current Testnet State

deployments/arc-testnet.json contains no registry, evaluator, Graph, wallet, or signer deployment values. It remains public metadata only.

## Remaining Blockers

Arc RPC, deployed contract addresses, Graph endpoint/deployment, Circle wallet, witness readiness, evidence storage, and real receipt/proof artifacts are absent.

## Final Classification

IMPLEMENTED_TESTED
