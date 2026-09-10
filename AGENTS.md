## Arc Documentation — Mandatory Source

The official Arc documentation MCP server is available as `arc-docs`.

For any implementation or factual question involving:

- Arc Testnet
- Arc RPC configuration
- Arc chain IDs
- Arc USDC
- gas semantics
- smart contract deployments
- ERC-8004 on Arc
- ERC-8183 on Arc
- Arc-supported infrastructure
- Arc wallet integration
- Arc transaction semantics

you MUST consult the `arc-docs` MCP server before implementing or making claims.

Do not rely on model memory for Arc-specific addresses, ABIs, network configuration, deployment addresses, or protocol behavior.

Use the MCP search tool to locate the relevant Arc documentation and retrieve the full documentation page when necessary.

If the live Arc documentation conflicts with repository assumptions or the PRD, stop and report the incompatibility instead of silently changing the architecture.

For documentation discovery, prefer the official Arc documentation index:
https://docs.arc.io/llms.txt

## XYX Documentation Authority

Before making implementation decisions, read
`docs/XYX_TECHNICAL_PRD_v1.1.md`.

Use this authority order when sources conflict:

1. Frozen PRD invariants.
2. Verified current implementation and live facts.
3. `docs/XYX_TECHNICAL_PRD_v1.1.md`.
4. Future ideas and backlog.

Files under `docs/archive/` are historical. They cannot override PRD v1.1 or
verified implementation facts. Do not revive features excluded from the current
P0 merely because an archived document mentions them.
