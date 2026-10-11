#!/usr/bin/env bash
# Installs 3 items per runtime with the real ui8kit CLI (v2) from a LOCAL static registry and checks that every
# relative import in the installed tree resolves. Usage: scripts/cli-smoke.sh [port]
set -euo pipefail
PORT="${1:-4183}"; ROOT="$(cd "$(dirname "$0")/.." && pwd)"
(cd "$ROOT/r" && python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 & echo $! > /tmp/ui8kit-r.pid)
trap 'kill "$(cat /tmp/ui8kit-r.pid)" 2>/dev/null || true' EXIT
sleep 1
for rt in svelte react vue; do
  T="$(mktemp -d)"; cd "$T"; echo '{"name":"smoke","private":true}' > package.json
  # --framework none leaves "runtime" unset: the CLI's --runtime filter would drop *.types.ts files (known gap),
  # and per-runtime registries need no filter anyway.
  npx -y ui8kit@2 init --yes --framework none --dir src \
    --registry-url "http://127.0.0.1:$PORT/$rt" --strict-cdn >/dev/null
  npx -y ui8kit@2 add button card hero-split --force 2>&1 | grep -E "Successful|Failed" || true
  node "$ROOT/scripts/check-imports.mjs" src "$rt"
  echo "[$rt] tmp dir: $T"
done
