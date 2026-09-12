# Session 08 — Protected Job Preflight

## Classification

**READY_FOR_LIVE_PROTECTED_JOB_EXECUTION**

Session 8 has completed architecture reconciliation, deterministic job preparation,
live read-only dependency checks, and TX1 simulation.

**No Protected Job transaction has been broadcast yet.**

Therefore this report does **NOT** prove:

- job creation
- job funding
- provider submission
- Witness evidence
- evaluator resolution
- USDC settlement/refund
- P0 completion

## Scope

Session 8 prepared one deterministic ERC-8183 Protected Job vertical slice on Arc
Testnet.

Target lifecycle:

```
Circle buyer
  → createJob
  → Provider Rabby EOA setBudget
  → Circle buyer approve USDC
  → Circle buyer fund
  → real provider execution
  → provider submit
  → Witness evidence
  → evaluator verdict
  → XYXEvaluator.resolveJob
  → ERC-8183 settlement/refund
```

## Architecture / Actors

| Actor | Address / ID | Role |
|-------|-------------|------|
| Circle buyer | `0x55763d498fd057d17ffcc2fb540789ce76f4f085` | Machine execution via Circle Developer-Controlled Wallet |
| Provider | `0x7ea90Ac2A2bA5fF6c71e7E9D23037D64AbD2b4da` | Rabby-controlled EOA |
| ERC-8004 agent | `894335` | Verified controlled provider identity (Session 7B) |
| ERC-8004 identity registry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` | External identity layer |
| Witness | independent signer | Canonical execution evidence attestor (no Circle credentials) |
| Evaluator contract | `0xCEBFedAc66B0fFfAD452D3f1B356D1A3120dB233` | Signed verdict gateway to ERC-8183 |
| Relayer | configured relayer | Transaction sender for `resolveJob` |

Role separation rules:

- Circle buyer and provider remain distinct.
- Witness does not require Circle credentials.
- Provider is externally controlled through Rabby.
- No private key is exported from any role.

## Live Contracts / Network

- Arc Testnet chainId: `5042002`
- ERC-8183 proxy: `0x0747EEf0706327138c69792bF28Cd525089e4583`
- ERC-8183 implementation: `0xA316fd02827242D537F84730F8a37D0BA5fd351a`
- USDC: `0x3600000000000000000000000000000000000000`
- USDC decimals: `6`
- XYXEvaluator: `0xCEBFedAc66B0fFfAD452D3f1B356D1A3120dB233`

## Protected Job Definition

- **Task:** Normalize this text: `   hello   protected   XYX  `
- **Expected deterministic result:** `hello protected XYX`
- **Budget:** `0.01` USDC
- **Atomic budget:** `10000`
- **Expected deterministic deliverable hash:**
  `0xee019961f0e9210659bcfc6968b2f4fb97337e459468548ea821e815f83586f5`
- **Exact-match behavior:** `COMPLETE`
- **Altered/mismatched output:** `REJECT`

## ERC-8183 Interface Verification

Verified selectors:

```
createJob(...): 0x41528812
setBudget(...): 0xdd4ae9d4
fund(...):      0xe25ba707
submit(...):    0x9e63798d
complete(...):  0xd75bbdf3
reject(...):    0x41dd26f5
```

## Session 8 Architecture Fixes

### Witness / Circle credential separation

**Previous behavior:** Witness configuration incorrectly depended on Circle
credentials (`CIRCLE_API_KEY`, `CIRCLE_ENTITY_SECRET`).

**Corrected behavior:**

- Circle credentials are required only for Circle machine execution.
- Witness initializes without Circle credentials.
- Witness consumes execution facts/evidence only.
- Witness remains independent from buyer / evaluator / relayer.

### External provider EOA support

**Previous behavior:** The protected-job runtime assumed the provider must be
Circle-controlled.

**Corrected behavior:**

- Circle wallet remains buyer only.
- Provider is the verified Rabby EOA (`0x7ea90Ac2A2bA5fF6c71e7E9D23037D64AbD2b4da`).
- Provider-side ERC-8183 actions are performed independently through the
  development-only Rabby operational tool.
- Production route for the operational tool remains HTTP 404.

## Canonical Specification Hash Bug

### Previous behavior

`prepareSession08Job()` hashed the full create-job schema object via
`hashJSON(specification)`. That object included `expiresAt`.

Because `expiresAt` is generated fresh each run (`now + 86_400`), identical task
semantics produced different "specification" hashes.

### Old expected hash

```
0x8bf4a16ad6a6a8f0ac44c18079cc6617ab563c507574759bc8a8da3a930e5b4c
```

This value was tied to a historical `expiresAt` of `1800086400`. It is **NOT** a
stable canonical specification hash and is superseded for Session 8 canonical
specification identity.

## Corrected Canonical Specification

Stable canonical fields (used for the specification hash):

- `provider`
- `budgetUsdc`
- `description`
- `evaluation`

Execution-envelope field **excluded** from the specification hash:

- `expiresAt`

Canonical serialization:

```
canonicalJSON() → hashJSON() → keccak256
```

`expiresAt` remains part of the ERC-8183 `createJob(...)` calldata as a separate
`uint256` argument. It is **not** removed from the transaction.

## Determinism Proof

### Same semantics, different expiries

| Expiry | Specification hash |
|--------|-------------------|
| `1800086400` | `0xfc1455ab974b7777a501fa04acfa291f6a50024c4b4c658a6807eeea92f598c6` |
| `9999999999` | `0xfc1455ab974b7777a501fa04acfa291f6a50024c4b4c658a6807eeea92f598c6` |
| `now + 86400` (fresh) | `0xfc1455ab974b7777a501fa04acfa291f6a50024c4b4c658a6807eeea92f598c6` |

Invariant:

```
same semantics + different expiry → SAME specification hash
```

**PASS**

### Changed semantics

| Description | Specification hash |
|-------------|-------------------|
| Original | `0xfc1455ab974b7777a501fa04acfa291f6a50024c4b4c658a6807eeea92f598c6` |
| Changed task | `0xc7826d4b48c636867d6c36405df4f5b66d509d4aea50f275fe1ded6f6ae44339` |

Invariant:

```
changed task semantics → DIFFERENT specification hash
```

**PASS**

## Authoritative Session 8 Specification Hash

```
0xfc1455ab974b7777a501fa04acfa291f6a50024c4b4c658a6807eeea92f598c6
```

This supersedes the earlier transient hash for Session 8 job semantics.

## Live Read-Only Verification

Latest verified state during Session 8 preflight:

| Check | Result |
|-------|--------|
| Arc chain | PASS |
| ERC-8183 code | PASS |
| USDC code | PASS |
| Circle buyer | PASS (`0x55763d...`) |
| Circle buyer USDC balance | ~20 USDC observed |
| ERC-8183 USDC allowance (pre-approval) | 0 |
| Provider health | HTTP 200 |
| Provider deterministic task | HTTP 200 |
| ERC-8004 resolver | agent 894335 resolves successfully |
| Graph query | PASS, validation records: 0 |
| Witness config | initializes without Circle credentials |
| Provider Rabby tool (development) | HTTP 200 |
| Provider Rabby tool (production) | HTTP 404 |

## Regression

| Check | Result |
|-------|--------|
| Node tests | 189 passing |
| Solidity tests | 24 passing |
| Provider tests | 18 passing |
| Typecheck | PASS |
| Provider build | PASS |
| Focused Session 8 tests | PASS (4 tests) |
| `git diff --check` | PASS |
| Changed-file secret scan | PASS / no secrets detected |

## TX1 Preflight

Intended transaction:

| Field | Value |
|-------|-------|
| Network | Arc Testnet |
| Chain ID | `5042002` |
| Actor | Circle buyer |
| From | `0x55763d498fd057d17ffcc2fb540789ce76f4f085` |
| To | `0x0747EEf0706327138c69792bF28Cd525089e4583` |
| Function | `createJob(address,address,uint256,string,address)` |
| Provider | `0x7ea90Ac2A2bA5fF6c71e7E9D23037D64AbD2b4da` |
| Evaluator | `0xCEBFedAc66B0fFfAD452D3f1B356D1A3120dB233` |
| Hook | `0x0000000000000000000000000000000000000000` |
| Description | `Normalize this text:   hello   protected   XYX` + canonical specification hash |
| Expiry | `now + 86400` at execution time (fresh, not hardcoded) |
| Gas estimate | `300333` |
| Simulation | PASS |

**Important:** The calldata must be freshly generated from structured arguments
immediately before TX1 because `expiry` is generated at execution time. The
placeholder calldata in this report is **not** a broadcast-ready immutable value.

## Execution Order

```
TX1: Circle buyer createJob
     → extract real jobId from confirmed JobCreated event

TX2: Provider Rabby setBudget(realJobId, 10000, "0x")

TX3: Circle buyer USDC approve ERC-8183 for 10000

TX4: Circle buyer fund(realJobId, "0x")

     real provider execution

TX5: Provider submit real deliverable hash

     Witness canonical evidence → storage/readback → signature

TX6: relayer → XYXEvaluator.resolveJob

     verify final ERC-8183 state and actual USDC balance changes
```

## Claim Boundary

### Proven

- ERC-8183 live interface verified
- Roles reconciled (buyer/provider/Witness/evaluator)
- Circle buyer / provider separation fixed
- Witness / Circle credential separation fixed
- Deterministic job semantics prepared
- Stable canonical specification hashing proven
- Provider endpoint live
- ERC-8004 controlled provider identity live (Session 7B)
- Graph query live
- TX1 `eth_call` simulation passed
- TX1 gas estimation passed

### Not yet proven

- Session 8 job created onchain
- Real Session 8 jobId
- Budget set on real job
- USDC approved/funded for real job
- Real execution tied to job
- Provider submission tied to job
- Real Witness evidence for job
- Evaluator resolution for job
- Settlement / refund
- P0 completion

## Git State

- Branch: `master`
- HEAD at checkpoint start: `a90f733`
- Session 8 implementation remains uncommitted because of overlapping dirty
  worktree.
- Session 7B commits already present locally:
  - `1f5f88f` feat(provider): add safe local ERC-8004 registration tool
  - `a90f733` docs(erc8004): record verified controlled provider identity

## Security

| Item | Status |
|------|--------|
| Secrets exposed | NO |
| Private keys accessed | NO |
| New Circle wallet | NO |
| New ERC-8004 identity | NO |
| Contract redeployment | NO |
| Graph redeployment | NO |
| Protected Job transaction broadcast | NO |
