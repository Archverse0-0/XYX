# XYX architecture

The platform has four trust boundaries. Privy is the human authorization plane. Circle Developer-Controlled Wallets provide server-side machine execution, while the Circle Marketplace CLI provides x402 discovery and payment. The Graph provides indexed memory. Arc provides settlement and finality. XYX adds deterministic policy evaluation, an Execution Witness, evidence commitments, and orchestration.

The two custom contracts do not custody user or provider escrow:

* `XYXEvidenceRegistry` is a non-upgradeable EIP-712 registry. It accepts only an `ATTESTOR_ROLE` signature, binds the exact evidence URI, rejects stale receipts, rejects duplicate digest/nonces, and emits immutable `ReceiptAnchored` events.
* `XYXEvaluator` is a non-upgradeable signed-verdict gateway. It verifies a short-lived `JobVerdict`, consumes replay state before the external call, and forwards `complete` or `reject` to the configured ERC-8183 deployment. ERC-8183 remains the only contract that owns job escrow and settlement.

The backend is split so the Buyer Agent cannot sign canonical evidence. API requests are authenticated with Privy access tokens. The Witness has a dedicated signer and relayer, validates the selected service again, executes the Circle payment once through the isolated marketplace adapter, verifies the payment settlement transfer, captures HTTP response hashes, persists the canonical bundle to content-addressed storage, signs it, and anchors it. Contract calls use Circle's Developer-Controlled Wallets SDK with an API key and registered Entity Secret. Unknown payment state is persisted for reconciliation and is never blindly retried.

Graph freshness is a hard dependency for autonomous historical ranking. The client compares `_meta` block number and hash to Arc, pages deterministically, and fails closed on stale or inconsistent data. Postgres stores operational state and idempotency only; it is not the source of truth for trust history.

The frontend is English-language and shows explicit transaction states (`Preparing`, `Awaiting wallet`, `Broadcasting`, `Confirmed`, `Failed`). It does not label an Open Purchase as protected and does not display `Paid` before confirmation.
