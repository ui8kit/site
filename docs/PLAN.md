# ui8kit/site: plan

Monorepo for the **registry** (`r/`), its **tooling**, the **docs content** and the **static site generator**.
Decisions (2026-10-11): static HTML first (Go + templ, SSR later with the same templates), no iframe previews or live hosts, the site shows the code, the install command, build-time static previews and props tables (stage 1, 2026-10-12); runtime correctness is guaranteed by the CI of the private source monorepo before a registry is published.

## Layout

| Path | Role |
|---|---|
| `r/` | Registry output (committed). `registry.json` (site index), `manifest.json` (runtime, version, source commit, sha256 per file), `<runtime>/...` (CLI roots) |
| `registry/` | Bun/TS tooling: `build.ts` (reads the ui8kit packages, emits `r/`), `validate.ts`, `previews.ts` (SSR previews + props to `previews/`), `npm/` (stub package.json) |
| `previews/` | Committed output of `previews.ts`: `html/<name>.html`, `ph/*.svg`, `props.json`, `sources.json` (where each sample came from) |
| `content/` | Markdown with front matter (`title`, `description`, `order`, `section: categories`, `filter: kind[:category]`) |
| `generator/` | Go module: `main.go` + `templates/*.templ`; `assets/` (CSS from ui8kit, built `site.css`, `app.js`) |
| `scripts/` | `cli-smoke.sh` (real CLI vs local registry), `check-imports.mjs`, `check-site.mjs`, `a11y.mjs` (axe; env `A11Y_THEME`, `A11Y_SKIN`), `check-contrast.mjs` (AA over every skin x mode), `gen-skins.mjs` (builds `skins.css`) |
| `ci/workflows/` | `ci.yml`, `release.yml` (templates, no secrets needed) |
| `dist/` | Local generated site (ignored) |
| `docs-dist/` | Committed build of the docs site, served by Vercel (`scripts/build-docs.sh`) |

## Registry shape (CLI contract 2.0.0)

One registry root per runtime, so the CLI needs no file filter: `registryUrl = https://registry.buildy.tw/<runtime>` (the registry project uses `r/` as Root Directory, so there is no `/r/` prefix).

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
Determinism: sorted keys/items, no timestamps (`lastUpdated` = source commit date). Source: `--src` / `UI8KIT_SRC` (default `../source`).

Runtimes (2026-10-17): `svelte`, `react`, `vue`, `solid` (from `packages/<rt>/ui/src`) and the server-template runtimes `templ`, `twig`,
`latte`, `jinja2` (from `packages/<rt>/ui`, `registry/src/template-runtimes.ts`), all from the same xgen specs of the source monorepo.
Same item names, kinds, titles and descriptions as the TypeScript runtimes; `slot` (React `asChild`) exists in React only.
Template runtimes: `target` is relative to the template root (Go module root / Twig, Latte, Jinja2 loader root: `ui/<name>/...`,
`blocks/<name>.<ext>`, helpers `utils/*.go` + `go.mod` | `php/*.php` + `composer.json` | `py/ui8kit_jinja/*.py` + `requirements.txt`),
so include paths and Go imports resolve unchanged under `--dir`; `lib/presets` also carries `blocks/recipes/*.json` (templ: and
`blocks/embed.go`); `registryDependencies` come from includes, Go imports, same-package templ symbols and recipe/preset reads;
npm `dependencies` are empty. Contract unchanged (2.0.0): same item shape, additive runtime values. Needs ui8kit CLI >= 2.0.3 for
`solid` (2.0.2 drops the `*.tsx` of single-runtime items), `jinja2` (rejected by 2.0.2) and the non-template files of templ/Twig/Latte
items (`lucide_icons.go`, `lucide-icons.json`).

## How the CLI maps to `r/`

`init --framework <rt> --dir src --registry-url https://registry.buildy.tw/<rt> --strict-cdn` installs `utils` and `lib` items from `index.json`;
`add <name>` fetches `<folder by type>/<name>.json` and writes every file to `target` under `dir`. Use `--framework <rt>`: with ui8kit 2.0.2 the CLI keeps `*.types.ts`,
so `add --all` resolves every relative import; ui8kit 2.0.3 writes every file of a single-runtime item (Solid, template runtimes). See `content/installation.md`.
Template runtimes: `scripts/cli-smoke.sh` builds (templ generate, go vet, go build) or renders (composer / venv) the installed tree with
`scripts/check-templates.sh` and compares the renders across templ, Twig, Latte and Jinja2 (`scripts/templates/compare.py`).

## CI and what runs where

- **Private source monorepo**: typecheck/build of all runtimes, tests. Gate before a registry is built.
- **This repo, `ci.yml`**: validate `r/`, templ + Tailwind outputs up to date, `go vet`, generate, site checks, axe, CLI smoke. No secrets.
- **`registry-rebuild` job** (manual): checks out the private repo (needs `vars.UI8KIT_SRC_REPO` + `secrets.UI8KIT_SRC_TOKEN`) and uploads a new `r/`. Locally: `bun run registry:build`.
- **`release.yml`** (manual): packs `r/` as release asset and `@ui8kit/registry` npm package; publishing is off by default.
- **Vercel**: three projects on this repo. Landing: Root Directory `web`, `web/vercel.json`, static, output `.`, domain buildy.tw (checked by `scripts/check-web.mjs`). Registry: Root Directory `r`, `r/vercel.json`, domain registry.buildy.tw (root `/` redirects 301 to ui.buildy.tw). Docs: repo root, `vercel.json`, output `docs-dist/` (committed; no Go on Vercel), domain ui.buildy.tw. `ignoreCommand` skips deploys that touch only the other project's paths.

## Stage 2 decisions (2026-10-12): dark mode and skins

- One tiny same-origin file `/assets/theme.js` (1.3 KB, 0.7 KB gzip), loaded synchronously in `<head>` before the stylesheets, so `.dark` and `data-skin` are set before first paint. It is the only new client JS; it also binds the two header selects. Same-origin file instead of an inline script: works with `script-src 'self'` and needs no hash to maintain (the docs project sets no CSP today; the landing's CSP is `default-src 'none'; style-src 'self'` and is untouched, it follows `prefers-color-scheme` on its own).
- Choices: `localStorage` `ui8kit-theme` = `light|dark|system` (default system, follows `prefers-color-scheme` live), `ui8kit-skin` = skin id (default none = shadcn neutral, unchanged). The selects are native `<select>` with sr-only `<label>`s, shown only when JS runs (`html.js`).
- Skins: all 15 (14 tweakcn presets + sky), `generator/assets/skins.css` generated by `scripts/gen-skins.mjs` from the private monorepo: colour tokens (light and dark), radius snapped to the 8px step (violet-bloom 24px, doom-64 / neo-brutalism 0), system fonts only (serif stack for kodama-grove, monospace stack for perpetuity; no web fonts, no external requests), no shadows, no gradients. Size 32.8 KB raw, 5.8 KB gzip, loaded on every page (one request, cached).
- Contrast: skins that fail AA get token-level fixes in a generated "site overrides" section at the end of `skins.css` (lightness only, selectors `html:root[data-skin=...]`, higher specificity than the skin rule; the kit's skins are not edited): per-skin `--tok-*` adjustments, and a darker `--destructive` where white text on the destructive button failed (doom-64 light; neo-brutalism and notebook dark fall back to the site's destructive because their own is white/pastel). Result: 0 failures in `check-contrast.mjs`, 0 axe violations on 5 sample pages x 16 skins x 2 modes.
- `--destructive` light override `hsl(0 72% 47%)` stays (decided). It is now scoped to `:root:not(.dark)`; before it also overrode the dark value because of equal specificity.
- Dark destructive buttons are `dark:bg-destructive/60`, so the check blends destructive 60% over `--background` before measuring white text.

## Next steps

1. Optional: publish `r/` to unpkg/jsDelivr (`@ui8kit/registry`; the domains ui.buildy.tw, registry.buildy.tw and buildy.tw are live, `SITE_URL` / `REGISTRY_URL` default to them).
2. CLI (`ui8kit/cli`): pull `registry:utils` via `registryDependencies`, honour `paths` with `target`, handle type-only cycles.
3. ~~Syntax highlighting at generation time; props tables; static previews~~ done (stage 1, see README "Previews, code highlighting, props tables"). Open: previews for components that no block sample uses, preview of more than the first block variant.
4. ~~Dark mode toggle and skin picker~~ done (stage 2, see README "Dark mode and skins"). Open: more category copy.
5. Templates tab (page skeletons) and collections; SSR variant reusing `templates/`.
6. Split item pages by group (`hero`, `pricing`, ...), add `registry:theme` items for skins.
