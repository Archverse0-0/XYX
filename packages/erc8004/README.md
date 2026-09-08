# ERC-8004 Arc Testnet references

These files are verified ABI and deployment snapshots for the Arc Testnet ERC-8004 registries used by the P0 Graph indexer. They are references to the network deployments; XYX does not deploy or modify these registries.

| Registry | Arc Testnet proxy | Implementation |
| --- | --- | --- |
| IdentityRegistry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` | `0x7274e874CA62410a93Bd8bf61c69d8045E399c02` |
| ReputationRegistry | `0x8004B663056A597Dffe9eCcC1965A193B7388713` | `0x16e0FA7f7C56B9a767E34B192B51f921BE31dA34` |
| ValidationRegistry | `0x8004Cb1BF31DAf7788923b405b754f57acEB4272` | `0xDB31f5d9167f8ebc8B30FbBF814c4d297c2D7F99` |

The full implementation addresses, chain ID, explorer source URLs, and retrieval dates are recorded in the `*.deployment.json` files. The subgraph manifest requires an operator supplied `ERC8004_START_BLOCK`; it never fabricates a historical start point.
