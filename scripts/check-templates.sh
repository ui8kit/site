#!/usr/bin/env bash
# Builds or renders a server-template runtime installed by the CLI into <dir> (the template root: --dir of `ui8kit init`).
#   templ:      templ generate, go vet, go build, then render every exported component with zero props (cmd/ui8kit-render)
#   twig/latte: composer install (composer.json of the utils item), render every template with empty props (templates/render.php)
#   jinja2:     venv with requirements.txt (utils item), render every template with empty props (templates/render.py)
# Writes <out.json> ({template: html | "ERROR: ..."}); compare runtimes with scripts/templates/compare.py.
# Fails on a build error or a missing template/file (an install without its registry dependencies); other render errors with
# empty props (e.g. a division by an empty list) are listed, not fatal.
# Usage: scripts/check-templates.sh <dir> <templ|twig|latte|jinja2> <out.json>     (needs Go + templ, PHP + composer, Python 3)
set -euo pipefail
DIR="$(cd "$1" && pwd)"; RT="$2"; OUT="$3"; HERE="$(cd "$(dirname "$0")" && pwd)/templates"
case "$RT" in
  templ)
    (cd "$DIR" && templ generate >/dev/null && go vet ./... && go build ./... && python3 "$HERE/gen-templ-render.py" . >/dev/null && go run ./cmd/ui8kit-render) > "$OUT" ;;
  twig|latte)
    (cd "$DIR" && composer install -q --no-interaction) && php "$HERE/render.php" "$RT" "$DIR" > "$OUT" ;;
  jinja2)
    VENV="${UI8KIT_VENV:-$(mktemp -d)/venv}"; [ -x "$VENV/bin/python" ] || python3 -m venv "$VENV"
    "$VENV/bin/pip" install -q -r "$DIR/requirements.txt" && "$VENV/bin/python" "$HERE/render.py" "$DIR" > "$OUT" ;;
  *) echo "unknown runtime $RT" >&2; exit 2 ;;
esac
python3 - "$OUT" "$RT" <<'PY'
import json, sys
d = json.load(open(sys.argv[1])); e = [k for k, v in d.items() if v.startswith("ERROR")]
import re
missing = [k for k in e if re.search(r"not found|TemplateNotFound|Unable to find|Missing template|No such file|does not exist", d[k], re.I)]
print(f"[{sys.argv[2]}] {len(d)} templates rendered, {len(e)} render errors with empty props, {len(missing)} missing templates/files"
      + "".join(f"\n  {k}: {d[k][:200]}" for k in e[:10]))
sys.exit(1 if missing else 0)
PY
