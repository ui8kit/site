#!/usr/bin/env bash
# Regenerates the committed static docs site in docs-dist/ (served by the Vercel docs project, no build on Vercel).
# Needs Go (go.mod toolchain) and templ only if templates changed. The registry r/ is NOT copied (it lives on its own domain);
# set INCLUDE_REGISTRY=1 to also copy it to docs-dist/r. SITE_URL and REGISTRY_URL override the defaults
# (https://ui.buildy.tw, https://registry.buildy.tw).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/generator"
go run . --registry ../r --content ../content --out ../docs-dist
cd "$ROOT"
if command -v node >/dev/null; then node scripts/check-site.mjs docs-dist; fi
