# Primitive change -> registry.buildy.tw / ui.buildy.tw (procedure)

Status 2026-11-02: steps 1-2 work; step 3 is blocked (see alexy-os/chaosbun#115), so steps 4-5 cannot pick up new primitives yet.

| # | Repo | What | Commands |
|---|------|------|----------|
| 1 | ui8kit/codegen (public) | Change the brick spec `bricks/<name>/<name>.def.ts` (e.g. Select `classes.staticBase`), regenerate all 9 targets | `bun install && bun run verify` (= check, generate, docs:check, tsc, typecheck:generated, test); output in `generated/` (`ui/`, `templ/`, `twig/`, `latte/`, `jinja2/`, `utils/`, `rules/`) |
| 2 | ui8kit/registry (private, npm `@ui8kit/registry`) | Pack `generated/` into `r/<rt>/` | `UI8KIT_CODEGEN=<codegen>/generated npm run build` (pack:runtimes -> schema:copy -> verify); bump the digest in `pack:runtimes` and `version`; publish by the owner (AGENTS.md: agents do not push or publish) |
| 3 | codegen-x/ui8kit (private source monorepo) | Update `packages/kit/<rt>` (installed with the ui8kit CLI from `@ui8kit/registry`, checked by `kit:check`), recipes in `packages/kit-compose/variants/*.variants.json`, regenerate compositions | `bun run build && bun run verify` (owned by XGenBot; not edited from here) |
| 4 | ui8kit/site | Rebuild `r/` (registry.buildy.tw) and the site's own templ kit from the source monorepo | `bun install`; `bun run registry:build -- --src <source>`; `bun run registry:validate`; `UI8KIT_SRC=<source> bun run site:sync-ui8kit`; `bun run site:templ`; `bun run site:css`; `bun run docs:build`; commit `r/`, `generator/`, `docs-dist/` to main |
| 5 | Vercel | registry.buildy.tw (root `r/`) and ui.buildy.tw (`docs-dist/`) deploy on push to main | check: `smoke-live` workflow, `curl https://registry.buildy.tw/<rt>/components/ui/<name>.json` |

Blocker of step 4: `registry/src/build.ts` and `scripts/sync-ui8kit-templ.sh` read `packages/<rt>/ui` and `xgen/specs/blocks`.
These were removed from the source monorepo in fe2874f (2026-10-24, xgen exit). `r/` was last built from b0bcb9e (2026-10-14).
The builders must be ported to `packages/kit/<rt>/src/ui` + `packages/kit-compose/<rt>/src` once the source side confirms that layout.
