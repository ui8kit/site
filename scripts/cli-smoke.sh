#!/usr/bin/env bash
# Real ui8kit CLI (2.0.2) against a LOCAL static server whose root is r/ (the layout of the registry Vercel project:
# https://registry.buildy.tw/<svelte|react|vue>). Per runtime: init --framework <rt>, add 3 items, add --all;
# fails on any "Failed: N" with N > 0 and on unresolved relative imports. Usage: scripts/cli-smoke.sh [port]
set -euo pipefail
PORT="${1:-4183}"; ROOT="$(cd "$(dirname "$0")/.." && pwd)"; CLI="ui8kit@${UI8KIT_CLI:-2.0.2}"
(cd "$ROOT/r" && python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 & echo $! > /tmp/ui8kit-r.pid)
trap 'kill "$(cat /tmp/ui8kit-r.pid)" 2>/dev/null || true' EXIT
sleep 1
for rt in svelte react vue; do
  T="$(mktemp -d)"; cd "$T"; echo '{"name":"smoke","private":true}' > package.json
  npx -y "$CLI" init --yes --framework "$rt" --dir src --registry-url "http://127.0.0.1:$PORT/$rt" --strict-cdn >/dev/null
  for args in "button card hero-split --force" "--all --force"; do
    out="$(npx -y "$CLI" add $args 2>&1)"
    echo "$out" | grep -E "Successful|Failed" | tr '\n' ' '; echo
    if echo "$out" | grep -E "Failed: [1-9]" >/dev/null; then echo "[$rt] add $args: failures"; exit 1; fi
  done
  node "$ROOT/scripts/check-imports.mjs" src "$rt"
  echo "[$rt] tmp dir: $T"
done
