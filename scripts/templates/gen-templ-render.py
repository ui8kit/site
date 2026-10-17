# Writes <root>/cmd/ui8kit-render/main.go: renders every exported `templ X(p XProps)` of <root>/ui and <root>/blocks with zero props
# and prints {"<template key>": "<html>" | "ERROR: ..."} as JSON (key: ui/<dir>/<kebab X>, blocks/<kebab X>, the names of the Twig,
# Latte and Jinja2 templates without extension). Usage: python3 gen-templ-render.py <root>; then cd <root> && go run ./cmd/ui8kit-render
import os, re, sys
root = os.path.abspath(sys.argv[1])
module = re.search(r"^module\s+(\S+)", open(os.path.join(root, "go.mod")).read(), re.M).group(1)
kebab = lambda s: re.sub(r"([a-z0-9])([A-Z])", r"\1-\2", s).lower()
imports, calls = {}, []
for top in ("ui", "blocks"):
    for d, _, fs in sorted(os.walk(os.path.join(root, top))):
        for f in sorted(fs):
            if not f.endswith(".templ"):
                continue
            rel = os.path.relpath(d, root).replace(os.sep, "/")
            src = open(os.path.join(d, f)).read()
            pkg = re.search(r"^package\s+(\w+)", src, re.M).group(1)
            alias = "p_" + re.sub(r"\W", "_", rel)
            for m in re.finditer(r"^templ ([A-Z]\w*)\(p (\w+)Props\)", src, re.M):
                name = m.group(1)
                key = f"{rel}/{kebab(name)}"
                imports[alias] = f"{module}/{rel}"
                calls.append(f'\trender({key!r}, {alias}.{name}({alias}.{m.group(2)}Props{{}}))'.replace("'", '"'))
os.makedirs(os.path.join(root, "cmd", "ui8kit-render"), exist_ok=True)
with open(os.path.join(root, "cmd", "ui8kit-render", "main.go"), "w") as w:
    w.write("package main\n\nimport (\n\t\"context\"\n\t\"encoding/json\"\n\t\"fmt\"\n\t\"os\"\n\t\"strings\"\n\n\t\"github.com/a-h/templ\"\n")
    for a, p in sorted(imports.items()):
        w.write(f'\t{a} "{p}"\n')
    w.write(")\n\nvar out = map[string]string{}\n\nfunc render(key string, c templ.Component) {\n\tdefer func() {\n\t\tif r := recover(); r != nil {\n\t\t\tout[key] = fmt.Sprintf(\"ERROR: panic: %v\", r)\n\t\t}\n\t}()\n\tvar b strings.Builder\n\tif err := c.Render(context.Background(), &b); err != nil {\n\t\tout[key] = \"ERROR: \" + err.Error()\n\t\treturn\n\t}\n\tout[key] = b.String()\n}\n\nfunc main() {\n")
    w.write("\n".join(calls) + "\n")
    w.write("\tenc := json.NewEncoder(os.Stdout)\n\tenc.SetEscapeHTML(false)\n\t_ = enc.Encode(out)\n}\n")
print(f"{len(calls)} components")
