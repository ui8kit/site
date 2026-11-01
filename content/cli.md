---
title: CLI
description: "The ui8kit CLI commands and how they map to the r/ registry."
order: 3
---
The CLI is `ui8kit` on npm (current version 3.4.0, config contract 2.0.0; `npx ui8kit` runs the latest). Since 3.4.0 this registry is the CLI default: `{{REGISTRY_URL}}/<runtime>` is used without `--registry-url` (the npm mirror `@ui8kit/registry` is opt-in). Runtimes published in this registry (8): `svelte`, `react`, `vue`, `solid`, `templ`, `twig`, `latte`, `jinja2`. Web Components (`webcomponent`) are experimental and not published yet: the CLI rejects that framework with a clear message. Source: [github.com/ui8kit/cli](https://github.com/ui8kit/cli).

| Command | What it does |
|---|---|
| `init` | Writes `ui8kit.config.json`, creates folders, installs `utils` and `presets` |
| `add <name...>` | Installs items and their `registryDependencies`; without a config, `add -y --framework <runtime>` runs `init` first |
| `add --all` | Installs every listable item |
| `list` | Lists `index.json` of the registry |
| `diff [name]` | Compares installed files with the registry |
| `scan` / `build` | Author commands that produce a registry |

## Config

```json
{
  "$schema": "{{REGISTRY_URL}}/schema/config.json",
  "contractVersion": "2.0.0",
  "framework": "react",
  "runtime": "react",
  "dir": "src",
  "importStyle": "alias"
}
```

## How `add` reads `r/`

1. `GET {registryUrl}/index.json` for the item list and types.
2. `GET {registryUrl}/blocks/<name>.json` (folder by type: `components/ui`, `components`, `blocks`, `utils`, `lib`).
3. Each file is written to its `target` under `dir`.

## JSON Schemas

| Document | `$schema` |
|---|---|
| `ui8kit.config.json` | `{{REGISTRY_URL}}/schema/config.json` |
| `r/<runtime>/index.json`, `r/registry.json` | `{{REGISTRY_URL}}/schema/registry.json` |
| `r/<runtime>/<folder>/<name>.json` | `{{REGISTRY_URL}}/schema/registry-item.json` |
