# Primitive change -> registry.buildy.tw / ui.buildy.tw (procedure)

Status 2026-11-02: all steps work end to end (first full run: Select sizes `pl-3 pr-2`, codegen 66736dd -> @ui8kit/registry 3.3.1
-> codegen-x/ui8kit 9ed95b10 -> this repo). Clone every repo side by side; run each step on main.

| # | Repo | What | Commands |
|---|------|------|----------|
| 1 | ui8kit/codegen (public) | Change the brick spec `bricks/<name>/<name>.def.ts` (e.g. Select `classes.staticBase`), regenerate all 9 targets | `bun install && bun run verify`; output in `generated/` |
| 2 | ui8kit/registry (private, npm `@ui8kit/registry`) | Pack `generated/` into `r/<rt>/`, bump `version` and the `--digest` of `pack:runtimes`, publish | `UI8KIT_CODEGEN=<codegen>/generated npm run build`; `npm publish` (unpkg can lag minutes behind; jsdelivr serves first) |
| 3 | codegen-x/ui8kit (private source monorepo) | Reinstall `packages/kit/<rt>` from the new registry version, change recipes in `packages/kit-compose/variants/*.variants.json`, regenerate | per runtime: set `registryVersion` in `packages/kit/<rt>/ui8kit.config.json`, then in that dir `npx ui8kit@<cli> --no-cache add --all --force`, `add utils --force`, `add rules --force`; `bun run kit:check`; `bun run build && bun run verify` (~7 min) |
| 4 | ui8kit/site | Rebuild `r/`, previews and docs from the source monorepo | `bun install`; `bun run registry:build -- --src <abs path to source>` (a relative path resolves against `registry/`; a failed build leaves no `r/`); `bun run registry:validate`; `bun run previews:build -- --src <source>`; `bun run site:templ`; `bun run site:css`; `bun run site:generate && node scripts/check-site.mjs dist`; `bash scripts/build-docs.sh`; smoke: `UI8KIT_CLI=<cli> bash scripts/cli-smoke.sh` (clear `~/.ui8kit` cache first); commit `r/`, `previews/`, `generator/`, `docs-dist/` |
| 5 | Vercel | registry.buildy.tw (root `r/`) and ui.buildy.tw (`docs-dist/`) deploy on push to main | `smoke-live` workflow; `curl https://registry.buildy.tw/<rt>/components/ui/<name>.json` |

Source layout read by step 4 (since source fe2874f, 2026-10-24):

- `packages/kit/<rt>/src/{ui,utils}` -> registry targets `kit/ui/...`, `kit/utils/...` (TS) or `ui/...`, `utils/...` (templates); items `kit-<name>`, `utils`.
- `packages/kit-compose/<rt>/src/{compose,components,blocks,icons,presets,utils,styles}` -> same targets; items: one per compose wrapper
  (kebab of the component: `select`, `card-header`), `recipes` (compose/recipes), `compose` (the barrel), `presets`, `lucide-icon`, blocks and components.
- Specs: `packages/compose-gen/specs` (primitives.json, parts, patterns, organisms, blocks); recipes: `packages/kit-compose/variants`.
- Previews render `packages/kit-compose/react/src/index.ts` on `packages/shared/app` content.

Frozen (not rebuilt, layout removed from the source): `previews/templates/` and `previews/static-code.json` (`templates:build`,
`static-code:build`, last from b0bcb9e) and the site chrome kit `generator/ui8kit` (`site:sync-ui8kit` reads `packages/templ/ui`).
