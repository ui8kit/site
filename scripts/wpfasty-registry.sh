#!/usr/bin/env bash
# WP FastY builder registries (wpfasty-catalog@2), one per runtime — independent of the shadcn-style r/<runtime>/index.json
# registry (whose format is unchanged). Source of truth: builder-registry/<runtime>/wpfasty/{v<semver>,latest}/ (committed;
# a version directory is immutable). registry:build copies the tree into r/ after rebuilding r/.
#   WPFASTY=<wp-fasty checkout> bash scripts/wpfasty-registry.sh [--version x.y.z]
# builds both runtimes with wp-fasty's tools/builder/registry-build.ts (refuses to change an existing version), then
# syncs builder-registry/ into r/ and verifies. builder-registry/WPFASTY_COMMIT pins the wp-fasty commit CI rebuilds from
# (.github/workflows/ci.yml: the rebuild must not change a byte). Served at https://registry.buildy.tw/<latte|twig>/wpfasty/[v<semver>/].
set -euo pipefail
cd "$(dirname "$0")/.."
: "${WPFASTY:?set WPFASTY to a wp-fasty checkout}"
bun "$WPFASTY/tools/builder/registry-build.ts" builder-registry "$@"
for rt in latte twig; do
  rm -rf "r/$rt/wpfasty" && cp -r "builder-registry/$rt/wpfasty" "r/$rt/wpfasty"
done
bun scripts/check-wpfasty-registry.ts
