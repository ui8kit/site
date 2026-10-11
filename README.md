# ui8kit/site

Registry, tooling and static docs site for **ui8kit** (shadcn-style blocks and primitives for Svelte, React and Vue).

- `r/`: the registry for all runtimes, consumed by the [`ui8kit` CLI](https://github.com/ui8kit/cli) (`npx ui8kit add <name>`)
- `registry/`: Bun/TS tooling that builds `r/` from the generated packages of the ui8kit monorepo
- `content/`: markdown docs
- `generator/`: Go + [templ](https://templ.guide) generator that writes the static site to `dist/`
- `ci/workflows/`: GitHub Actions templates (copy to `.github/workflows/` to enable)
- `docs/PLAN.md`: structure, registry shape, CI, next steps

## Quick start

```bash
bun install
bun run registry:build -- --src ../ui8kit   # or UI8KIT_SRC=/path/to/ui8kit; needs the private monorepo
bun run registry:validate
bun run site:generate                       # go run: writes dist/ (needs Go, no Node)
node scripts/check-site.mjs dist
```

Only `go run` is needed to regenerate the site from the committed `r/`: `cd generator && go run . --registry ../r --content ../content --out ../dist`.
Set `SITE_URL` to change the absolute URL used in canonical links, the sitemap and the install commands.

After editing templates: `cd generator && templ generate` and `bun run site:css` (the built CSS and `*_templ.go` are committed).

## Use the registry

```bash
npx ui8kit@2 init --yes --framework none --dir src --registry-url <site>/r/svelte --strict-cdn
npx ui8kit add hero-split
```

## Gates

`scripts/cli-smoke.sh` (real CLI against a local registry), `scripts/check-site.mjs` (landmarks, links, no external requests),
`scripts/a11y.mjs` (axe WCAG A/AA in headless Chrome).

## Licence

MIT (author: Grok Bot). The CSS in `generator/assets/styles` is copied from the ui8kit monorepo, see `generator/assets/NOTICE.md`.
