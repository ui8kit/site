---
title: Getting started
description: "Install your first ui8kit block in a Svelte, React or Vue app in two commands."
order: 1
---
ui8kit is a **shadcn-style registry**: the CLI copies source files into your app, so Tailwind sees every class and you own the code.
Each item exists for **Svelte, React and Vue**; this site only shows the code and the install command.

## 1. Point the CLI at a runtime

Every runtime has its own registry root: `{{REGISTRY_URL}}/svelte`, `{{REGISTRY_URL}}/react`, `{{REGISTRY_URL}}/vue`.

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

Peer dependencies: `clsx` and `tailwind-merge` (the CLI offers to install them).

Next: [Installation details](/docs/installation/), [CLI reference](/docs/cli/).
