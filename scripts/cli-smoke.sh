#!/usr/bin/env bash
# ui8kit CLI against a LOCAL static server whose root is r/ (the layout of the registry Vercel project:
# https://registry.buildy.tw/<runtime>). Per runtime: init --framework <rt>, add 3 items, add --all; fails on any "Failed: N" with
# N > 0. TypeScript runtimes: no unresolved relative imports (check-imports.mjs). Template runtimes (templ, twig, latte, jinja2):
# the installed tree builds / renders (check-templates.sh) and the renders are compared across runtimes (templates/compare.py).
# Usage: scripts/cli-smoke.sh [port]
#   UI8KIT_CLI=2.0.3          npm version (npx ui8kit@<version>); UI8KIT_CLI_BIN=/path/to/cli/dist/index.js runs a local build instead
#   UI8KIT_RUNTIMES="svelte react"   subset (default: every runtime of r/registry.json)
# The Solid and Jinja2 runtimes need CLI >= 2.0.3 (2.0.2 drops the *.tsx files of single-runtime Solid items and rejects jinja2).
set -euo pipefail
PORT="${1:-4183}"; ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [ -n "${UI8KIT_CLI_BIN:-}" ]; then CLI=(node "$UI8KIT_CLI_BIN"); else CLI=(npx -y "ui8kit@${UI8KIT_CLI:-2.0.3}"); fi
RUNTIMES="${UI8KIT_RUNTIMES:-$(node -e 'console.log(require(process.argv[1]).runtimes.join(" "))' "$ROOT/r/registry.json")}"
(cd "$ROOT/r" && python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 & echo $! > /tmp/ui8kit-r.pid)
trap 'kill "$(cat /tmp/ui8kit-r.pid)" 2>/dev/null || true' EXIT
sleep 1
RENDERS=()
for rt in $RUNTIMES; do
  T="$(mktemp -d)"; cd "$T"; echo '{"name":"smoke","private":true}' > package.json
  "${CLI[@]}" init --yes --framework "$rt" --dir src --registry-url "http://127.0.0.1:$PORT/$rt" --strict-cdn >/dev/null
  for args in "button card hero-split --force" "--all --force"; do
    out="$("${CLI[@]}" add $args 2>&1)"
    echo "[$rt] add $args: $(echo "$out" | grep -E "Successful|Failed" | tr -s ' \n' ' ')"
    if echo "$out" | grep -E "Failed: [1-9]" >/dev/null; then echo "[$rt] add $args: failures"; exit 1; fi
    # checked after the 3 items too: a subset must be complete through its registryDependencies
    case "$rt" in
      templ|twig|latte|jinja2) "$ROOT/scripts/check-templates.sh" src "$rt" "$T/render.json" ;;
      *) node "$ROOT/scripts/check-imports.mjs" src "$rt" ;;
    esac
  done
  case "$rt" in templ|twig|latte|jinja2) RENDERS+=("$rt=$T/render.json") ;; esac
  echo "[$rt] tmp dir: $T"
done
[ "${#RENDERS[@]}" -gt 1 ] && python3 "$ROOT/scripts/templates/compare.py" "${RENDERS[@]}" || true
