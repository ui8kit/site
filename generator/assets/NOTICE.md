# Assets

- `styles/theme.css`, `styles/kit.css`: copied unchanged from the private ui8kit monorepo,
  `xgen/runtimes/core/assets/styles/` (shadcn neutral theme, `--radius` corner token, kit base layer).
  Skin: `default` only (other skins live in `xgen/runtimes/core/assets/styles/skins/`).
- `site.src.css`: Tailwind v4 entry (scans `../templates` and `app.js`).
- `site.css`: **built** from `site.src.css` with `@tailwindcss/cli` (`bun run site:css`) and committed so that
  `go run` needs no Node. Rebuild after changing templates.
- `app.js`: vanilla JS (code tabs, copy buttons, search). No dependencies, no network except the same-origin `search-index.json`.
