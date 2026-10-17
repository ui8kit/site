# Renders every template under <root>/ui and <root>/blocks with empty props (Jinja2 runtime of ui8kit installed by the CLI)
# and prints {"<template>": "<html>" | "ERROR: <message>"} as JSON. Usage: python3 render.py <root>
import json, os, sys
root = os.path.abspath(sys.argv[1])
sys.path.insert(0, os.path.join(root, "py"))
from ui8kit_jinja import environment  # noqa: E402
env = environment(root)
out = {}
for top in ("ui", "blocks"):
    for d, _, fs in os.walk(os.path.join(root, top)):
        for f in fs:
            if f.endswith(".html.j2"):
                t = os.path.relpath(os.path.join(d, f), root).replace(os.sep, "/")
                try:
                    out[t] = env.get_template(t).render({"p": {}})
                except Exception as e:  # noqa: BLE001
                    out[t] = f"ERROR: {type(e).__name__}: {e}"
print(json.dumps(dict(sorted(out.items())), ensure_ascii=False))
