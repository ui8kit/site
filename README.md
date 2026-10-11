# ui8kit/site

Registry, tooling and static docs site for **ui8kit** (shadcn-style blocks and primitives for Svelte, React and Vue).

- `r/`: the registry for all runtimes, consumed by the [`ui8kit` CLI](https://github.com/ui8kit/cli) (`npx ui8kit add <name>`)
- `registry/`: Bun/TS tooling that builds `r/` from the generated packages of the private source monorepo
- `content/`: markdown docs
- `generator/`: Go + [templ](https://templ.guide) generator that writes the static site (`dist/` locally, committed build in `docs-dist/`)
- `ci/workflows/`: GitHub Actions templates (copy to `.github/workflows/` to enable)
- `docs/PLAN.md`: structure, registry shape, CI, next steps

## Quick start

```bash
bun install
bun run registry:build -- --src ../source   # or UI8KIT_SRC=/path/to/source; needs the private source monorepo
bun run registry:validate
bun run site:generate                       # go run: writes dist/ (needs Go, no Node)
node scripts/check-site.mjs dist
```

Only `go run` is needed to regenerate the site from the committed `r/`: `cd generator && go run . --registry ../r --content ../content --out ../dist`.
Defaults: `SITE_URL=https://ui.buildy.tw` (canonical links, sitemap, robots) and `REGISTRY_URL=https://registry.buildy.tw` (install commands,
registry links). `INCLUDE_REGISTRY=1` additionally copies `r/` into the output (off by default: the registry has its own domain).

After editing templates: `cd generator && templ generate` and `bun run site:css` (the built CSS and `*_templ.go` are committed).

## Use the registry

```bash
npx ui8kit init --yes --framework svelte --dir src --registry-url https://registry.buildy.tw/svelte --strict-cdn
npx ui8kit add hero-split
```

## Deploy (two Vercel projects on this repo)

| | Registry | Docs |
|---|---|---|
| Domain | `registry.buildy.tw` | `ui.buildy.tw` |
| Root Directory | `r` | repo root |
| Framework | Other | Other |
| Build / Install | none | none (overridden by `vercel.json`) |
| Output | `.` | `docs-dist` |
| Config | `r/vercel.json` (CORS, JSON headers, cache) | `vercel.json` (headers) |

The docs project serves the committed `docs-dist/` (Vercel's build image has no Go toolchain, so nothing is built there).
After changing `content/`, `generator/` or `r/`, run `bun run docs:build` (`scripts/build-docs.sh`) and commit `docs-dist/`.
Registry URLs: `https://registry.buildy.tw/<svelte|react|vue>` (no `/r/` prefix, the root directory is `r/`).

## Gates

`scripts/cli-smoke.sh` (real CLI 2.0.2 against a local server rooted at `r/`), `scripts/check-site.mjs` (landmarks, links, no external requests),
`scripts/a11y.mjs` (axe WCAG A/AA in headless Chrome).

## Licence

MIT (author: Grok Bot). The CSS in `generator/assets/styles` is copied from the private source monorepo (same author, MIT), see `generator/assets/NOTICE.md`.
