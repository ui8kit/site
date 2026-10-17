---
title: Getting started
description: "Install your first ui8kit block in a Svelte, React, Vue, Solid, templ, Twig, Latte or Jinja2 app in two commands."
order: 1
---
ui8kit is a **shadcn-style registry**: the CLI copies source files into your app, so Tailwind sees every class and you own the code.
Each item exists for **Svelte, React, Vue and Solid** and as server templates for **Go templ, Twig, Latte and Jinja2**; this site only shows the code and the install command.

## 1. Point the CLI at a runtime

Every runtime has its own registry root: `{{REGISTRY_URL}}/<runtime>` with `svelte`, `react`, `vue`, `solid`, `templ`, `twig`, `latte` or `jinja2` (see [Installation](/docs/installation/)).

```bash
npx ui8kit init --yes --framework svelte --dir src \
  --registry-url {{REGISTRY_URL}}/svelte --strict-cdn
```

`init` writes `ui8kit.config.json` and installs the shared helpers (`utils/`, `presets/`).

## 2. Add an item

```bash
npx ui8kit add hero-split
```

The CLI also installs everything the item imports (primitives and components) under `src/primitives`, `src/components` and `src/blocks`.
Relative imports keep working because the layout mirrors the ui8kit packages.

## 3. Styles

Copy the theme tokens once (see [Theming and skins](/docs/theming-skins/)) and let Tailwind v4 scan your `src`:

```css
@import "tailwindcss";
@source "./";
```

Peer dependencies (TypeScript runtimes): `clsx` and `tailwind-merge` (the CLI offers to install them). The template runtimes use the same Tailwind classes: add `@source` for the template folder.

Next: [Installation details](/docs/installation/), [CLI reference](/docs/cli/).
