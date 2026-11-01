# Renders every template under <root>/{ui,compose,blocks} with empty props (Jinja2 runtime of ui8kit installed by the CLI:
# kit ui8kit_jinja + kit-compose compose/ and compose_organisms/ in one template root) and prints
# {"<template>": "<html>" | "ERROR: <message>"} as JSON. Wiring as packages/kit-compose/test/server/render-organisms.py.
# Usage: python3 render.py <root>
import json, os, sys
root = os.path.abspath(sys.argv[1])
for p in (root, os.path.join(root, "compose")):
    sys.path.insert(0, p)
from compose_env import environment  # noqa: E402
from compose_organisms import register  # noqa: E402
env = register(environment(root), root)
out = {}
for top in ("ui", "compose", "blocks"):
    for d, _, fs in os.walk(os.path.join(root, top)):
        for f in fs:
            if f.endswith(".html.j2"):
                t = os.path.relpath(os.path.join(d, f), root).replace(os.sep, "/")
                try:
                    out[t] = env.get_template(t).render({"p": {}})
                except Exception as e:  # noqa: BLE001
                    out[t] = f"ERROR: {type(e).__name__}: {e}"
print(json.dumps(dict(sorted(out.items())), ensure_ascii=False))
