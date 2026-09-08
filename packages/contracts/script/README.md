# Deployment

Set `XYX_ADMIN`, `XYX_WITNESS_ATTESTOR`, `XYX_EVALUATOR_ATTESTOR`, `XYX_PAUSER`, `ERC8183_ADDRESS`, `RECEIPT_MAX_AGE`, and `VERDICT_LIFETIME` in a local secret environment. The witness and evaluator attestor addresses must be different. Use a hardware wallet or an isolated deployer. Do not pass private keys in chat. Deploy only after reviewing the Foundry output and recording the Arc transaction hashes.

```bash
forge script script/Deploy.s.sol:Deploy --rpc-url "$ARC_RPC_URL" --broadcast --verify
```
