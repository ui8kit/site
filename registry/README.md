# registry

## r/ is shared

`r/` hosts several registries (this ui8kit build, plus e.g. `r/authfly`, `r/app`, `r/dashboard`, `r/messanger`).
`registry:build` owns only an explicit allowlist (see `src/clean-out.ts`): the runtime dirs
(`svelte react vue solid templ twig latte jinja2`), `schema/`, `variants/`, `manifest.json`, `registry.json`.
It cleans and rewrites only those; everything else under `r/` (and the hand-written `r/vercel.json`) is never touched.

## Variant presets (`r/variants/`)

`registry:build` also publishes the Stock variant presets (alexy-os/chaosbun#137): `apps/stock/content/variants.v0.json`
from `--src` is copied verbatim to `r/variants/v0.json`, served at `https://registry.buildy.tw/variants/v0.json`.

- `r/variants/v0.json.sha256`: sha256 of the served file (`sha256sum -c` format).
- `manifest.json` `variants`: `{path, sha256, bytes, digest, version, items, variants}`; `registry.json` `variants`: `{path, sha256, digest, version}`.
- The file's own `digest` is the sha256 of its JSON body without `digest` (computed in Stock); the build rejects a stale digest
  and any item name that is not a registry item in every runtime. `registry:validate` checks file, manifest, registry.json and sidecar agree.
- Shape: `{version, digest, registry, items: {<registry name>: {block, spec, organism, axes, defaults, defaultVariant, variants: {<id>: {asset, set, props}}}}}`.
  Texts in `props` are `{"$": "ui.<key>"}` dictionary refs (not resolved here).
- `variants/` is in the cleanup allowlist (`src/clean-out.ts`) and is rewritten on every build.
