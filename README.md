# ui8kit/site

Registry, tooling and static docs site for **ui8kit** (shadcn-style blocks and primitives for Svelte, React and Vue).

- `r/`: the registry for all runtimes, consumed by the [`ui8kit` CLI](https://github.com/ui8kit/cli) (`npx ui8kit add <name>`)
- `registry/`: Bun/TS tooling that builds `r/` from the generated packages of the private source monorepo
- `content/`: markdown docs
- `previews/`: static HTML previews and props data of the items (committed, built from the private source by `bun run previews:build`)
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

## Previews, code highlighting, props tables

Every block, component and primitive page has a **Preview** (static HTML, no iframe, no browser runtime), the **Code** per runtime (CSS-only tabs, highlighted at build time), the install command and a **Props** table.

- **Previews**: `bun run previews:build -- --src ../ui8kit` (private monorepo, `bun install` once there) renders the React package `@ui8kit/react-ui` with `react-dom/server` on the placeholder content of the monorepo (block samples, fixtures, content dictionary) and writes `previews/html/<name>.html` (plain markup with Tailwind classes), `previews/ph/*.svg` (shared placeholder pictures) and `previews/props.json`. Tailwind scans `previews/html` (`@source` in `site.src.css`), so the site CSS and tokens style the samples; the markup is the same for every runtime. Blocks use their xgen sample (first variant). Components use their spec examples, else the props they receive inside the block samples (`registry/src/previews.ts` spies on the JSX runtime). Primitives show the variant/size matrix from their recipe; multi-part primitives use the props they get inside a block. Links are neutralised (`#`), `h1` becomes `h2`, pictures use one shared placeholder.
- **Props**: derived from the xgen specs (`specs/ui` + `*.variants.json` for primitives; `parts`, `patterns`, `organisms` for components and blocks): name, type, required, default, allowed values, description. Passthrough HTML attributes are one note, not rows.
- **Highlighting**: [chroma](https://github.com/alecthomas/chroma) in `generator/highlight.go` (Svelte, Vue, TSX, TS). Only token classes are emitted, colours are CSS variables `--tok-*` (light and dark, `scripts/check-contrast.mjs` asserts AA on card, muted and background). Page weight: at most 12 KB of source per runtime panel and 12 KB per file are highlighted, the rest stays plain text.
- **Tabs**: radio inputs + labels, panels switched with `:has()`; no JavaScript. There is no responsive-width toggle: sample breakpoints are viewport media queries, so a toggle would need an iframe or a runtime.

## Use the registry

```bash
npx ui8kit init --yes --framework svelte --dir src --registry-url https://registry.buildy.tw/svelte --strict-cdn
npx ui8kit add hero-split
```

## Deploy (three Vercel projects on this repo, all live)

| | Landing | Registry | Docs |
|---|---|---|---|
| Domain | `buildy.tw` | `registry.buildy.tw` | `ui.buildy.tw` |
| Root Directory | `web` | `r` | repo root |
| Framework | Other | Other | Other |
| Build / Install | none | none | none (overridden by `vercel.json`) |
| Output | `.` | `.` | `docs-dist` |
| Config | `web/vercel.json` | `r/vercel.json` (CORS, JSON headers, cache) | `vercel.json` (headers) |

The docs project serves the committed `docs-dist/` (Vercel's build image has no Go toolchain, so nothing is built there).
After changing `content/`, `generator/` or `r/`, run `bun run docs:build` (`scripts/build-docs.sh`) and commit `docs-dist/`.
The landing page (`buildy.tw`) is plain static files (`web/index.html`, `web/style.css`), no build, not part of `docs-dist/`. Check with `node scripts/check-web.mjs`.
The registry project redirects only its root path `/` to `https://ui.buildy.tw/` (301, `r/vercel.json`).
Registry URLs: `https://registry.buildy.tw/<svelte|react|vue>` (no `/r/` prefix, the root directory is `r/`).

## Gates

`scripts/cli-smoke.sh` (real CLI ui8kit 2.0.2 against a local server rooted at `r/`), `scripts/check-site.mjs` (landmarks, links, no external requests),
`scripts/a11y.mjs` (axe WCAG A/AA in headless Chrome), `scripts/check-contrast.mjs` (highlight tokens, AA).

## Licence

MIT (author: Grok Bot). The CSS in `generator/assets/styles` is copied from the private source monorepo (same author, MIT), see `generator/assets/NOTICE.md`.
