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
| Solid | `{{REGISTRY_URL}}/solid` |
| Go templ | `{{REGISTRY_URL}}/templ` |
| Twig | `{{REGISTRY_URL}}/twig` |
| Latte | `{{REGISTRY_URL}}/latte` |
| Jinja2 | `{{REGISTRY_URL}}/jinja2` |

The URL is the **base** the CLI appends `index.json` and `components/ui/<name>.json` to. Use `--strict-cdn` so the CLI never falls back to the public CDN.

## What lands where

Files are written under your `dir` (for example `src`) with the same layout as the ui8kit packages. TypeScript runtimes (Svelte, React, Vue, Solid):

| Registry type | Folder |
|---|---|
| `registry:utils` | `utils/` (`cn`, `variants`, `expr`, a11y helpers) |
| `registry:lib` | `presets/` (size presets shared by blocks) |
| `registry:ui` | `primitives/<name>/` |
| `registry:component` | `components/` |
| `registry:block` | `blocks/` |

Server-template runtimes (templ, Twig, Latte, Jinja2): `dir` is the template root (Go module root, or the Twig / Latte / Jinja2 loader root), so include
paths such as `ui/box/box.html.twig` and the Go imports resolve unchanged:

| Registry type | Files |
|---|---|
| `registry:utils` | helpers and package manifest: `utils/*.go` + `go.mod`, `php/*.php` + `composer.json`, `py/ui8kit_jinja/*.py` + `requirements.txt` |
| `registry:lib` | `blocks/presets/*.json`, `blocks/recipes/*.json` (templ: `blocks/embed.go`) |
| `registry:ui` | `ui/<name>/` |
| `registry:component`, `registry:block` | `blocks/<name>.<ext>` |

The toolchain is yours: `templ generate` + `go build`, `composer install` (twig/twig or latte/latte), `pip install -r requirements.txt` (Jinja2).
The templ files keep the module path `github.com/codegen-x/ui8kit/packages/templ/ui`: point it at the installed folder with a `replace` directive in your `go.mod`.

## Pick the framework, not a file filter

Pass `--framework <runtime>` (`svelte`, `react`, `vue`, `solid`, `templ`, `twig`, `latte` or `jinja2`) together with the matching registry URL. The registry is
already split per runtime, and ui8kit 2.0.3 or later installs every file of an item (the `*.types.ts` files that blocks import, Solid views, templ and
template helpers), so `add --all` leaves no unresolved import or missing template. Use ui8kit 2.0.4 or later (`npx ui8kit` runs the latest).

```bash
npx ui8kit init --yes --framework react --dir src --registry-url {{REGISTRY_URL}}/react --strict-cdn
npx ui8kit add button card hero-split
```

```bash
npx ui8kit init --yes --framework twig --dir templates --registry-url {{REGISTRY_URL}}/twig --strict-cdn
npx ui8kit add hero-split
```
