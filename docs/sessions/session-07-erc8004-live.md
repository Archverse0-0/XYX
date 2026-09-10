# Session 07 — ERC-8004 Live Integration

## Scope

Session 7 is a read-only audit of XYX's existing ERC-8004 integration against
real Arc Testnet and Graph state. It does not register an agent, submit a
validation/reputation record, deploy a registry, create a custom contract, or
start any ERC-8183, Circle, Witness, or settlement lifecycle.

## Starting State

The production `ERC8004Client`, Graph validation retrieval, `validationScore`,
and Buyer/Witness runtime integration already existed and were tested. What was
not previously proven was a successful production-client resolution of a real
public Arc identity with a verifiable provider mapping.

## Repository Architecture

`ERC8004Client.resolve(endpoint, payee, blockNumber)` is the single production
identity resolver. It requires all of the following before returning an
identity:

1. the endpoint origin's HTTPS `/.well-known/agent-registration.json` has
   exactly one registration for the pinned Arc identity registry;
2. `tokenURI(agentId)` and `getAgentWallet(agentId)` decode through the checked
   repository ABI, and the agent wallet equals the candidate payee; and
3. HTTPS agent metadata has a `services` entry whose endpoint exactly equals
   the candidate endpoint.

It returns `null` on unavailable, malformed, unsafe, ambiguous, wrong-wallet,
wrong-service, wrong-registry, or RPC data. It never maps by display name,
fixture, order, or inference. Buyer Runtime uses a non-null identity to query
`GraphClient.validations`, then applies the existing deterministic
`validationScore` function. A missing mapping or empty validation signal stays
`null`, not fabricated zero.

## Registry References

The checked repository ABI/deployment snapshots and direct Arc reads agree on
all three expected proxy addresses. Each proxy has bytecode and its repository
ABI `getVersion()` call returns `2.0.0` on Arc chain `5042002`.

| Registry | Address | Runtime role | Live status |
| --- | --- | --- | --- |
| Identity | `0x8004A818BFB912233c491871b3d84c89A494BD9e` | `ERC8004Client.resolve()` and Graph identity source | `USED_BY_RUNTIME`, bytecode and view ABI verified |
| Validation | `0x8004Cb1BF31DAf7788923b405b754f57acEB4272` | Graph validation-event source; score input | `USED_BY_RUNTIME_VIA_GRAPH`, bytecode and view ABI verified |
| Reputation | `0x8004B663056A597Dffe9eCcC1965A193B7388713` | Graph enrichment only | `VERIFIED_REFERENCE_ONLY`, bytecode and view ABI verified |

The validation and reputation registries' `getIdentityRegistry()` calls both
returned the identity proxy above. Repository deployment snapshots record the
corresponding verified Arcscan implementation references. No repository/public
reference disagreement was found.

## Configuration

The runtime identity registry is pinned by
`packages/erc8004/IdentityRegistry.deployment.json`; it does not consume a
separate identity-registry environment variable. `ERC8004_START_BLOCK` is a
public subgraph-render configuration variable only. The current `.env` and
`.env.witness` examples keep that value as a placeholder. No secret setting is
needed for read-only registry resolution.

## Live Identity Discovery and Resolution

Read-only Graph discovery returned 367 live `AgentIdentity` entities. Eleven
had HTTPS agent metadata URIs. Direct Arc reads confirmed that agent `894118`
is a real identity with a decodable `tokenURI`, agent wallet, and owner, and
the Graph entity matches the identity registry and agent ID. The Graph owner's
value is registration-time data, not current ownership proof: it differs from
the current raw `ownerOf` value because the current subgraph maps `Registered`
but does not map ERC-721 transfer events. XYX's resolver does not rely on that
Graph owner field.

However, no discovered identity met the production resolver's full mapping
requirements. The HTTPS candidates were either unreachable or had metadata
without a `services` entry. Other indexed identities used unsupported `data:`
or non-HTTPS metadata. Therefore no endpoint/payee pair produced a non-null
result from `ERC8004Client.resolve()`.

This is intentionally not treated as a client/chain mismatch: the production
client returned its documented unavailable result, and no provider-to-agent
relationship was asserted. A raw onchain identity exists, but it is not proof
of an XYX-verifiable provider mapping.

## Validation Path

The live Graph `validations` query for agent `894118` succeeded with zero
records. This is `QUERY_WORKS_EMPTY_RESULT`, not a Graph failure. Existing
`validationScore([], acceptedValidators, now)` semantics return `null` when
there is no accepted current signal. No validation was manufactured and no Risk
Engine math was changed.

The general Graph validation query was also shown to be sensitive to orphaned
validation entities when requesting nested `agent` objects. XYX's production
query avoids that nested relation and filters directly by a resolved agent ID;
the targeted query above is the relevant runtime path and succeeded empty.

## Failure Semantics

The resolver first reads the RPC chain ID and returns `null` unless it equals
the pinned Arc deployment chain ID. It also enforces HTTPS-only public metadata, blocks private/loopback DNS
targets, rejects redirects, bounds response size, validates registration shape,
requires exactly one matching registry entry, checks `uint256` agent IDs, and
requires chain wallet/service equality. It catches failures as `null`; the
runtime leaves identity/validation unavailable rather than fabricating a score.
Current deterministic tests cover wrong-chain rejection, public-address filtering, unavailable
identity scoring, empty validation, latest-signal selection, future/expired
signal removal, accepted-validator weighting, and deterministic ordering.

This session cannot prove a mandatory-identity decision because current intent
configuration does not exercise a live provider whose identity can be resolved.
It does prove the optional/unavailable path does not invent one.

## Strict Verifier

`npm run -s verify:live -- --report-only` remains non-mutating and currently
checks ERC-8004 IdentityRegistry bytecode. It returned `PASS` for that check.
The overall verifier result was `BLOCKED` with `PASS=15`, `FAIL=0`,
`BLOCKED=2`, and `NOT_YET_PROVEN=3`, only because Witness/API health and later
receipt/feedback/protected-job evidence are still absent. It intentionally does
not hardcode an arbitrary external agent identity.

## Regression Tests

- `npm run typecheck`: PASS.
- `npm test`: PASS — 183 Node tests, 0 failures.
- `npm run test:contracts`: PASS — 24 Solidity tests, 0 failures.

## Public Evidence

No `artifacts/live-evidence/session-07-erc8004-live.json` was created. A live
success artifact would require a real production-client resolution plus an
independent chain cross-check. Neither is available, and no CID, agent ID, or
fixture is being repurposed as success evidence.

## Security Review

No secret, authorization header, RPC credential, private key, or environment
content was printed or stored. All network operations were read-only. No agent
registration, validation/reputation write, Circle operation, contract
deployment, Graph deployment, IPFS upload, or mainnet action occurred.

## Claim Boundary

Session 7 proves that Arc ERC-8004 registry references, ABI view calls, Graph
identity/validation query capability, and XYX's fail-closed unavailable path
are live. It does not prove production identity resolution, Buyer Agent live
selection, ERC-8183 lifecycle, protected-job E2E, machine execution, Witness
E2E, receipt anchoring, Graph feedback, settlement, frontend E2E, or P0
completion.

## Remaining P0 Gaps

Provide or discover an existing real provider endpoint whose well-known
registration, onchain agent wallet, and agent metadata services entry all
match. If no such identity exists, an operator may separately choose to register
one with an associated public provider endpoint; that decision is outside this
read-only session. The later protected-job, machine-execution, Witness,
anchoring, feedback, and settlement proofs also remain.

## Final Classification

`LIVE_ERC8004_REGISTRY_VERIFIED_IDENTITY_NOT_YET_PROVEN`
