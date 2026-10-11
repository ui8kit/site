---
title: CLI
description: "The ui8kit v2 commands and how they map to the r/ registry."
order: 3
---
The CLI is `ui8kit` on npm (contract 2.0.0). Source: [github.com/ui8kit/cli](https://github.com/ui8kit/cli).

| Command | What it does |
|---|---|
| `init` | Writes `ui8kit.config.json`, creates folders, installs `utils` and `presets` |
| `add <name...>` | Installs items and their `registryDependencies` |
| `add --all` | Installs every listable item |
| `list` | Lists `index.json` of the registry |
| `diff [name]` | Compares installed files with the registry |
| `scan` / `build` | Author commands that produce a registry |

## Config

```json
{
  "contractVersion": "2.0.0",
  "framework": "none",
  "dir": "src",
  "registryUrl": "https://ui8kit-site.vercel.app/r/react",
  "strictCdn": true,
  "importStyle": "alias"
}
```

## How `add` reads `r/`

1. `GET {registryUrl}/index.json` for the item list and types.
2. `GET {registryUrl}/blocks/<name>.json` (folder by type: `components/ui`, `components`, `blocks`, `utils`, `lib`).
3. Each file is written to its `target` under `dir`.
