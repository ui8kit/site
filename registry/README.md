# registry

## r/ is shared

`r/` hosts several registries (this ui8kit build, plus e.g. `r/authfly`, `r/app`, `r/dashboard`, `r/messanger`).
`registry:build` owns only an explicit allowlist (see `src/clean-out.ts`): the runtime dirs
(`svelte react vue solid templ twig latte jinja2`), `schema/`, `manifest.json`, `registry.json`.
It cleans and rewrites only those; everything else under `r/` (and the hand-written `r/vercel.json`) is never touched.
