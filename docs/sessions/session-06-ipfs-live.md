# Session 06 — IPFS Live Write / Readback Infrastructure

## Scope

Session 6 verifies only XYX's production-compatible IPFS storage boundary. It does not execute a Witness job, create Circle resources, anchor evidence, settle a protected job, or deploy contracts or Graph infrastructure.

## First Audit / Initial Blocker

The first Session 6 audit found the original generic Kubo-compatible `EvidenceStorage` adapter. Only an unavailable local Kubo endpoint was configured, so no real external write or readback could be observed. That attempt correctly ended as `BLOCKED_BY_CONFIGURATION`; it produced neither a Session 6 CID nor a live evidence artifact.

## Provider Re-Audit

The operator subsequently confirmed Pinata V3 public upload authentication and supplied local runtime configuration for the dedicated XYX probe. Pinata V3 is not Kubo RPC compatible: it uploads multipart bytes at `/v3/files` and public content is retrieved from an IPFS gateway. The implementation therefore keeps the existing storage abstraction and adds a narrow Pinata transport rather than misdirecting Kubo `/api/v0/add` or `/api/v0/cat` calls to Pinata.

## Storage Architecture

`EvidenceStorage` remains the single storage boundary.

- Kubo mode remains supported with `POST /api/v0/add` and `POST /api/v0/cat`.
- Pinata mode uploads the exact canonical UTF-8 bytes to `https://uploads.pinata.cloud/v3/files` as a public-network multipart file.
- Pinata readback fetches the returned CID from the configured IPFS gateway.
- Both transports validate the CID, bound reads, parse JSON, require canonical bytes, verify the canonical hash, and fail closed on any mismatch.

The mutation-bearing proof is the dedicated `npm run verify:ipfs-live` command. The normal strict verifier remains non-mutating.

## Canonicalization and Hashing

The production canonicalization and hashing path is unchanged: `canonicalJSON` and `hashText` in `packages/shared/src/index.ts`. `canonicalJSON` orders plain-object keys recursively, preserves array order, and rejects lossy or non-JSON values. `hashText` computes a UTF-8 Keccak-256 hash. Pinata uploads the exact string returned by `canonicalJSON`; no provider serializer re-encodes the payload.

## Provider Configuration

At final audit, Pinata runtime configuration is SET in the local witness environment. The secret-bearing credential is referenced only by its variable name, `PINATA_JWT`; its value, authorization header, and gateway URL are not recorded. Pinata mode requires `IPFS_PROVIDER`, `PINATA_JWT`, and `IPFS_GATEWAY_URL`. Kubo mode remains configurable through `IPFS_API_URL` and optional `IPFS_AUTHORIZATION`.

## Implementation Changes

- `packages/shared/src/evidence.ts`: Pinata V3 transport beneath `EvidenceStorage`, with Kubo compatibility preserved and fail-closed write/readback integrity checks.
- `packages/shared/src/config.ts`: provider-aware storage validation.
- `apps/witness/src/main.ts`, `apps/api/src/jobs.ts`, and `scripts/verify-live.ts`: provider-aware storage construction.
- `scripts/verify-ipfs-live.ts`: dedicated Session 6 production-compatible infrastructure probe.
- `.env.example` and `.env.witness.example`: variable-name-only configuration documentation.
- `packages/shared/test/evidence-storage.test.ts` and config tests: deterministic Pinata/Kubo and failure-path coverage.

## Live Session 6 Probe

The dedicated probe executed successfully at `2026-09-10T08:09:36.685Z` against Pinata public IPFS. Its payload is explicitly labeled `XYX_SESSION_06_IPFS_PROBE`; it is not Witness, protected-job, provider, or onchain evidence.

- Provider: Pinata
- Network mode: public
- CID: `bafkreidna4g3p7hqj24opyy3cry2lpxocgss2l7r4qt6sgtvjtknafurlq`
- Write: `PASS`

## Readback Verification

The probe retrieved the same CID through the production storage retrieval path. The returned bytes parsed as JSON and met every required integrity invariant:

- Original canonical hash: `0xacc255047dcb8487492ed09c982c84dfe46afd0237c7ea6e2bae54cc253167b4`
- Retrieved canonical hash: `0xacc255047dcb8487492ed09c982c84dfe46afd0237c7ea6e2bae54cc253167b4`
- `byteMatch`: `true`
- `hashMatches`: `true`
- `semanticContentMatches`: `true`

## Failure / Mismatch Tests

Deterministic mocked-transport tests verify fail-closed behavior for canonical readback success, hash mismatch, byte mismatch, malformed JSON, unavailable storage, invalid CID, missing Pinata CID response, and provider HTTP failure. The implementation returns failure codes including `EVIDENCE_HASH_MISMATCH`, `EVIDENCE_INVALID_JSON`, `EVIDENCE_NOT_CANONICAL`, `EVIDENCE_PERSISTENCE_MISMATCH`, `INVALID_IPFS_CID`, and `EVIDENCE_STORAGE_UNAVAILABLE`; it never accepts ambiguous content.

## Strict Verifier / Live Verification

`npm run verify:ipfs-live` is the live, mutation-bearing proof and produced the CID and verified readback recorded above. `npm run -s verify:live -- --report-only` remains non-mutating; its later-session `BLOCKED` or `NOT_YET_PROVEN` gates do not invalidate this Session 6 infrastructure proof.

The final closeout strict-verifier run reported no `FAIL` checks. Contract bytecode,
USDC contract/decimals/balance, Circle wallet balance, evaluator and registry
state, and Graph metadata/freshness/block hash passed. The overall result was
`BLOCKED` (`PASS=13`, `FAIL=0`, `BLOCKED=4`, `NOT_YET_PROVEN=3`) because the
Arc RPC was temporarily unreachable for `arc.chain_id` and `arc.head`, witness
and API URLs are not configured, and later receipt/feedback/protected-job proof
gates remain unproven.

## Regression Checks

- `npm run typecheck`: PASS
- `npm test`: PASS — 182 Node tests, 0 failures

## Public Evidence

Sanitized live evidence is recorded in `artifacts/live-evidence/session-06-ipfs-live.json`. It contains the CID, timestamp, hashes, integrity booleans, and bounded claims only; it contains no credential, authorization header, gateway token, private key, or environment dump.

## Security Review

No secret values were added to source, documentation, tests, or public evidence. No TLS bypass, Circle action, onchain transaction, contract deployment, Graph deployment, or mainnet action was performed for Session 6 closeout.

## Remaining Later-Session Blockers

Witness execution evidence, Circle machine execution linked to a job, EvidenceRegistry anchoring, Graph receipt feedback, protected-job E2E, and ERC-8183 settlement remain unproven later-session work.

## Exact Claim Boundary

Session 6 proves only: “XYX's production-compatible IPFS storage boundary was live-tested against Pinata public IPFS with a real external write, real CID readback, and verified canonical content integrity.” It does not prove Witness E2E, machine execution, EvidenceRegistry anchoring, Graph feedback, protected-job E2E, or ERC-8183 settlement.

## Final Classification

`LIVE_VERIFIED_IPFS_INFRASTRUCTURE`
