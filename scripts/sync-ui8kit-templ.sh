#!/usr/bin/env bash
# Copies the generated Go templ package of ui8kit (packages/templ/ui of the private source monorepo) into generator/ui8kit,
# verbatim: the site renders its own chrome (header, nav, cards, tables, code panels, theme/skin picker) with these primitives
# and blocks. Never edit generator/ui8kit by hand; rerun this script and then `bun run site:templ`.
#   UI8KIT_SRC=/path/to/source bash scripts/sync-ui8kit-templ.sh      (default: ../source next to this repo)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${UI8KIT_SRC:-$ROOT/../source}/packages/templ/ui"
DST="$ROOT/generator/ui8kit"
[ -f "$SRC/go.mod" ] || { echo "no templ package at $SRC (run bun run build in the source monorepo)"; exit 1; }
rm -rf "$DST"
mkdir -p "$DST"
( cd "$SRC" && find . -type f \( -name '*.templ' -o -name '*.go' -o -name '*.json' -o -name 'go.mod' -o -name 'go.sum' -o -name 'README.md' \) \
    ! -name '*_templ.go' ! -name 'package.json' ! -name '.xgen-manifest.json' ! -path './cmd/*' -print0 | tar --null -T - -cf - ) | tar -xf - -C "$DST"
commit=$(git -C "$SRC" rev-parse --short HEAD 2>/dev/null || echo unknown)
printf 'ui8kit Go templ package, copied verbatim from packages/templ/ui of the source monorepo (commit %s) by scripts/sync-ui8kit-templ.sh.\nGenerated code: do not edit here.\n' "$commit" > "$DST/SOURCE.txt"
echo "synced $(find "$DST" -type f | wc -l) files from $SRC ($commit)"
