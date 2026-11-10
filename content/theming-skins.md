---
title: Theming and skins
description: "Tokens are CSS variables (shadcn neutral); a skin only overrides variables."
order: 4
---
Colours come from the shadcn neutral tokens (`--background`, `--primary`, `--muted-foreground`, ...). Corners use a single token, `--radius`.
Dark mode is the `dark` class (or `data-theme="dark"`) on an ancestor.

```css
:root { --primary: hsl(0 0% 9%); --primary-foreground: hsl(0 0% 98%); }
[data-skin="violet-bloom"] { --primary: hsl(263 70% 50%); }
```

A skin never changes markup or classes, so switching a skin needs no rebuild. This site wears the `default` skin unless you pick another one: the header has a colour mode select (System, Light, Dark) and a skin select (the default plus 15 skins). Both choices are kept in `localStorage` (`ui8kit-theme`, `ui8kit-skin`).
The theme file ships in the kit packages as `styles/theme.css` and `styles/kit.css`.

## Install a skin

Every skin is a registry item `theme-<skin>` (type `registry:theme`, Svelte, React, Vue and Solid):

```bash
npx ui8kit add theme-claude
```

It writes `src/styles/skins/claude.css` (the skin tokens, light and dark) and `src/styles/skins/base.css` + `NOTICE.md` (item `theme-base`: the start values of a skin scoped on an element, and the licences). Turn it on with two lines, no component changes:

```ts
import "./styles/index.css";
import "./styles/skins/claude.css";
```

```html
<html data-skin="claude">
```

`data-skin` on any other element scopes the skin to that element. The folder follows `paths.themes` in `ui8kit.config.json` (default `styles/skins`; ui8kit CLI >= 3.5.0). Skins come from the CodeGen-X skins data (one JSON per skin with a sha256 in its index); the registry ships the generated CSS as is.
