---
title: Installation
description: "Registry roots, what lands where, and the one config gotcha with --runtime."
order: 2
---
## Registry roots

| Runtime | `registryUrl` |
|---|---|
| Svelte 5 | `https://ui8kit-site.vercel.app/r/svelte` |
| React 19 | `https://ui8kit-site.vercel.app/r/react` |
| Vue 3 | `https://ui8kit-site.vercel.app/r/vue` |

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

## Use `--framework none`, not `--runtime`

The registry is already split per runtime, so no file filter is needed. The CLI's `--runtime` filter keeps only `*.svelte`, `*.tsx` or `*.vue` and drops the
`*.types.ts` files that blocks import, so avoid `--runtime` (and a `runtime` key in `ui8kit.config.json`) with these registries.

## Known CLI gaps (ui8kit 2.0.1)

- `registry:utils` is not pulled through `registryDependencies`; it comes from `init` (do not pass `--skip-core`). `add` prints a harmless "utils not found" warning.
- `paths` in the config is ignored when a file sets `target`.
- Type-only imports create dependency cycles between a few blocks; the CLI warns and installs them anyway.
