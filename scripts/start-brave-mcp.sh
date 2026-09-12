#!/usr/bin/env bash
set -euo pipefail

PORT="${BRAVE_MCP_PORT:-9222}"
PROFILE="${BRAVE_MCP_PROFILE:-$HOME/.local/share/brave-claude-mcp}"

BRAVE="$(command -v brave || command -v brave-browser || true)"

if [ -z "$BRAVE" ]; then
  echo "ERROR: Brave binary not found."
  echo "Tried: brave, brave-browser"
  exit 1
fi

mkdir -p "$PROFILE"

echo "Starting Brave MCP browser..."
echo "Binary : $BRAVE"
echo "Profile: $PROFILE"
echo "CDP    : http://127.0.0.1:$PORT"

exec "$BRAVE" \
  --remote-debugging-port="$PORT" \
  --user-data-dir="$PROFILE" \
  --no-first-run \
  --no-default-browser-check \
  about:blank
