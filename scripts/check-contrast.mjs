// AA (4.5:1) over every skin x mode: (1) syntax tokens --tok-* on --card/--muted/--background, (2) site chrome text pairs
// (foreground/background, *-foreground on its surface, muted-foreground on background/card/muted, white on destructive).
// The cascade is resolved from the real CSS: theme.css, site.src.css (tokens + per-skin fixes), skins.css.
//   node scripts/check-contrast.mjs [--table]     --table prints a markdown table per skin
import { readFileSync } from "node:fs";
const rd = (p) => readFileSync(new URL("../generator/assets/" + p, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const skinsJson = JSON.parse(readFileSync(new URL("../generator/assets/skins.json", import.meta.url), "utf8"));
import { rgb, ratio, ratioRgb, mix } from "./colors.mjs";
// rules: [{skin, dark, notDark, spec, order, vars}]
const rules = []; let order = 0;
for (const file of ["styles/theme.css", "site.src.css", "skins.css"]) {
  for (const m of rd(file).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1].split(";").pop().trim().replace(/\s+/g, " ");
    const k = sel.match(/^(html)?(:root)?(?:\[data-skin="([\w-]+)"\])?(:not\(\.dark, ?\[data-theme="dark"\]\))?(:is\(\.dark, ?\[data-theme="dark"\]\))?$/);
    if (!k || !(k[2] || k[5])) continue;
    const vars = Object.fromEntries([...m[2].matchAll(/--([\w-]+):\s*([^;]+)/g)].map((v) => [v[1], v[2].trim()]));
    rules.push({ skin: k[3] ?? null, dark: !!k[5], notDark: !!k[4], spec: (k[1] ? 1 : 0) * 0.5 + (k[2] ? 1 : 0) + (k[3] ? 1 : 0) + (k[4] ? 1 : 0) + (k[5] ? 1 : 0), order: order++, vars });
  }
}
const resolve = (skin, dark) => {
  const out = {};
  rules.filter((r) => (!r.skin || r.skin === skin) && (r.dark ? dark : true) && (r.notDark ? !dark : true)).sort((a, b) => a.spec - b.spec || a.order - b.order).forEach((r) => Object.assign(out, r.vars));
  return out;
};
const surf = ["card", "muted", "background"];
const DESTR = "destructive*"; // dark: the kit paints dark:bg-destructive/60, so white text sits on destructive at 60% over --background
const pairs = [["foreground", "background"], ["card-foreground", "card"], ["popover-foreground", "popover"], ["primary-foreground", "primary"], ["secondary-foreground", "secondary"],
  ["accent-foreground", "accent"], ["muted-foreground", "background"], ["muted-foreground", "card"], ["muted-foreground", "muted"], ["foreground", "muted"], ["#ffffff", DESTR]];
const skins = [{ id: null, label: "default" }, ...skinsJson];
let tokBad = 0, chromeBad = 0; const rows = [];
for (const sk of skins) for (const dark of [false, true]) {
  const v = resolve(sk.id, dark), f = [];
  for (const bg of surf) for (const k of Object.keys(v).filter((x) => x.startsWith("tok-"))) { const r = ratio(v[k], v[bg]); if (r < 4.5) { tokBad++; f.push(`${k} on ${bg} ${r.toFixed(2)}`); } }
  const nTok = Object.keys(v).filter((x) => x.startsWith("tok-")).length;
  let c = 0;
  for (const [a, b] of pairs) { const fg = a.startsWith("#") ? a : v[a], r = b === DESTR ? ratioRgb(rgb(fg), dark ? mix(v.destructive, v.background, 0.6) : rgb(v.destructive)) : ratio(fg, v[b]); if (r < 4.5) { chromeBad++; c++; f.push(`chrome ${a} on ${b} ${r.toFixed(2)}`); } }
  rows.push({ skin: sk.id ?? "default", mode: dark ? "dark" : "light", nTok, fails: f });
  for (const x of f) console.log(`FAIL ${sk.id ?? "default"} ${dark ? "dark" : "light"}: ${x}`);
}
if (process.argv.includes("--table")) { console.log("| skin | light | dark |\n|---|---|---|"); for (const sk of skins) { const g = (m) => { const r = rows.find((x) => x.skin === (sk.id ?? "default") && x.mode === m); return r.fails.length ? `${r.fails.length} fail` : "ok"; }; console.log(`| ${sk.id ?? "default"} | ${g("light")} | ${g("dark")} |`); } }
console.log(`${skins.length} skins x 2 modes: tokens ${tokBad} failures, chrome ${chromeBad} failures`);
process.exit(tokBad || chromeBad ? 1 : 0);
