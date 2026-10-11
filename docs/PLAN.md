# ui8kit/site: plan

Monorepo for the **registry** (`r/`), its **tooling**, the **docs content** and the **static site generator**.
Decisions (2026-10-11): static HTML first (Go + templ, SSR later with the same templates), no iframe previews or live hosts, the site shows code and the
install command only, runtime correctness is guaranteed by the CI of the private ui8kit monorepo before a registry is published.

## Layout

| Path | Role |
|---|---|
| `r/` | Registry output (committed). `registry.json` (site index), `manifest.json` (runtime, version, source commit, sha256 per file), `<runtime>/...` (CLI roots) |
| `registry/` | Bun/TS tooling: `build.ts` (reads the ui8kit packages, emits `r/`), `validate.ts`, `npm/` (stub package.json) |
| `content/` | Markdown with front matter (`title`, `description`, `order`, `section: categories`, `filter: kind[:category]`) |
| `generator/` | Go module: `main.go` + `templates/*.templ`; `assets/` (CSS from ui8kit, built `site.css`, `app.js`) |
| `scripts/` | `cli-smoke.sh` (real CLI vs local registry), `check-imports.mjs`, `check-site.mjs`, `a11y.mjs` (axe) |
| `ci/workflows/` | `ci.yml`, `release.yml` (templates, no secrets needed) |
| `dist/` | Generated site (ignored) |

## Registry shape (CLI contract 2.0.0)

One registry root per runtime, so the CLI needs no file filter: `registryUrl = <site>/r/<runtime>`.

```text
r/svelte/index.json                      CLI index (components[] with name, type, deps, registryDependencies)
r/svelte/components/ui/<name>.json       registry:ui         primitives
r/svelte/components/<name>.json          registry:component  composites
r/svelte/blocks/<name>.json              registry:block
r/svelte/utils/utils.json                registry:utils      cn, variants, expr, a11y
r/svelte/lib/presets.json                registry:lib        size presets used by blocks
```

Item: `{ name, type, title, description, runtime, digest, dependencies, devDependencies, registryDependencies, files[{path,target,content}], meta{kind,category,group,tags} }`.
`registryDependencies` come from the relative imports of the source files (+ `utils`). File `target` mirrors the ui8kit package layout
(`primitives/<name>/`, `components/`, `blocks/`, `utils/`, `presets/`) so relative imports work without rewriting.
Determinism: sorted keys/items, no timestamps (`lastUpdated` = source commit date). Source: `--src` / `UI8KIT_SRC` (default `../ui8kit`).

## How the CLI maps to `r/`

`init --framework none --dir src --registry-url <site>/r/<rt> --strict-cdn` installs `utils` and `lib` items from `index.json`;
`add <name>` fetches `<folder by type>/<name>.json` and writes every file to `target` under `dir`. Use `--framework none` (not `--runtime`): the CLI runtime
filter drops `*.types.ts`. See `content/installation.md` for the gaps.

## CI and what runs where

- **ui8kit monorepo (private)**: typecheck/build of all runtimes, tests. Gate before a registry is built.
- **This repo, `ci.yml`**: validate `r/`, templ + Tailwind outputs up to date, `go vet`, generate, site checks, axe, CLI smoke. No secrets.
- **`registry-rebuild` job** (manual): checks out the private repo (needs `vars.UI8KIT_SRC_REPO` + `secrets.UI8KIT_SRC_TOKEN`) and uploads a new `r/`. Locally: `bun run registry:build`.
- **`release.yml`** (manual): packs `r/` as release asset and `@ui8kit/registry` npm package; publishing is off by default.
- **Vercel**: static `dist/`, built in CI (`vercel build --prebuilt`) or locally; `vercel.json` sets output and caching. `r/` is part of `dist/`, so `<site>/r/<runtime>` is a valid `registryUrl`.

## Next steps

1. Decide the public domain; set `SITE_URL` (canonical, sitemap and commands use it) and publish `r/` to unpkg/jsDelivr (`@ui8kit/registry`).
2. Fix in the CLI: pull `registry:utils` via `registryDependencies`, honour `paths` with `target`, keep `*.types.ts` under `--runtime`, handle type-only cycles.
3. Syntax highlighting at generation time (Go, no client JS); per-block props table from `xgen/specs`.
4. Dark mode toggle and skin picker (CSS variables only); more category copy; block thumbnails as static images from the monorepo `shots/`.
5. Templates tab (page skeletons) and collections; SSR variant reusing `templates/`.
6. Split item pages by group (`hero`, `pricing`, ...), add `registry:theme` items for skins.
