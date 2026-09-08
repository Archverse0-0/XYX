# Security model

## Contract controls

Both XYX contracts use OpenZeppelin `AccessControl`, `Pausable`, `EIP712`, and `ECDSA`; the evaluator also uses `ReentrancyGuard`. Signatures are domain-separated by chain ID and verifying contract. Receipt and verdict nonces are scoped to the recovered signer. Replay state is written before the evaluator's external call and rolls back atomically if ERC-8183 reverts.

The evidence registry does not infer ERC-8004 identity. A zero registry requires a zero agent ID. The signed `evidenceURIHash` must equal `keccak256(bytes(evidenceURI))`; response bodies are never stored onchain.

## Off-chain controls

Circle discovery metadata, endpoint descriptions, schemas, error bodies, and responses are untrusted data. The planner cannot write spending limits, and intent validation is strict. Payment compatibility is checked against live requirements, Arc Testnet (`eip155:5042002`), the configured USDC contract, exact amount, and the selected wallet. The endpoint is re-inspected before payment.

The Witness blocks non-HTTPS URLs, credentials in URLs, private/link-local DNS results, IP literals outside public unicast ranges, redirects, and oversized responses. Logs redact authorization headers, bodies, and keys. Evidence storage is read back and byte-compared before signing.

Address diversity is a concentration signal, not Sybil proof. Wilson lower confidence bounds and sample confidence prevent one-call `100%` history from looking like mature reliability. Payment failures, rail failures, malformed requests, and ambiguous outcomes are excluded from provider reliability.

## Key operations

Keep `WITNESS_PRIVATE_KEY`, `EVALUATOR_PRIVATE_KEY`, and `RELAYER_PRIVATE_KEY` in a secret manager. These must be three different backend wallets: the Witness attestor signs receipts, the evaluator signer signs job verdicts, and the relayer broadcasts contract transactions. Rotate the attestor role and pause the registry on witness compromise. Pause the evaluator on verdict compromise. Do not use production secrets in local tests.

Keep `CIRCLE_API_KEY` and `CIRCLE_ENTITY_SECRET` in the same secret manager. They authenticate Circle Developer-Controlled Wallets and are never sent to the browser, passed to the marketplace CLI, committed to git, or included in logs. The wallet address is public; the API key and Entity Secret are not.
