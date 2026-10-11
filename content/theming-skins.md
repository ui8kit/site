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
