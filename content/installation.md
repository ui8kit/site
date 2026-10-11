---
title: Installation
description: "Registry roots, what lands where, and how to pick the framework."
order: 2
---
## Registry roots

| Runtime | `registryUrl` |
|---|---|
| Svelte 5 | `{{REGISTRY_URL}}/svelte` |
| React 19 | `{{REGISTRY_URL}}/react` |
| Vue 3 | `{{REGISTRY_URL}}/vue` |

The URL is the **base** the CLI appends `index.json` and `components/ui/<name>.json` to. Use `--strict-cdn` so the CLI never falls back to the public CDN.

## What lands where

Files are written under your `dir` (for example `src`) with the same layout as the ui8kit packages:

| Registry type | Folder |
|---|---|
| `registry:utils` | `utils/` (`cn`, `variants`, `expr`, a11y helpers) |
| `registry:lib` | `presets/` (size presets shared by blocks) |
| `registry:ui` | `primitives/<name>/` |
| `registry:component` | `components/` |
| `registry:block` | `blocks/` |

## Pick the framework, not a file filter

Pass `--framework svelte`, `react` or `vue` together with the matching registry URL. The registry is already split per runtime, and with ui8kit 2.0.2 the CLI
installs the `*.types.ts` files that blocks import, so `add --all` leaves no unresolved relative import.

```bash
npx ui8kit init --yes --framework react --dir src --registry-url {{REGISTRY_URL}}/react --strict-cdn
npx ui8kit add button card hero-split
```
