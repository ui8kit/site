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

The URL is the **base** the CLI appends `index.json` and `components/ui/<name>.json` to. ui8kit 3.4.0+ uses these roots by default (`--framework <runtime>` picks the root), so `--registry-url` is only needed for another registry.

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
template helpers), so `add --all` leaves no unresolved import or missing template. Use ui8kit 3.4.0 or later (`npx ui8kit` runs the latest): this registry is its default, and `add -y --framework <runtime>` runs `init` for you in a fresh project.

```bash
npx ui8kit init --yes --framework react --dir src
npx ui8kit add button card hero-split
# or in one step, without init:
npx ui8kit add button -y --framework react
```

```bash
npx ui8kit init --yes --framework twig --dir templates
npx ui8kit add hero-split
```
