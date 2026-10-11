// AA (4.5:1) for the syntax-highlighting tokens (--tok-*) on the code backgrounds (--card, --muted, --background), light and dark.
//   node scripts/check-contrast.mjs
import { readFileSync } from "node:fs";
const css = readFileSync(new URL("../generator/assets/site.src.css", import.meta.url), "utf8");
const theme = readFileSync(new URL("../generator/assets/styles/theme.css", import.meta.url), "utf8");
const block = (src, re) => { const m = src.match(re); if (!m) throw new Error("block not found: " + re); return m[1]; };
const vars = (b) => Object.fromEntries([...b.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
const hslToRgb = (h, s, l) => { s /= 100; l /= 100; const a = s * Math.min(l, 1 - l); const f = (n) => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); }; return [f(0), f(8), f(4)]; };
const rgb = (v) => { let m = v.match(/^#([0-9a-f]{6})$/i); if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
  m = v.match(/^hsl\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*\)$/); if (m) return hslToRgb(+m[1], +m[2], +m[3]); throw new Error("colour " + v); };
const lum = (c) => { const f = (x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4); return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
const ratio = (a, b) => { const [x, y] = [lum(rgb(a)), lum(rgb(b))].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
let bad = 0;
for (const [mode, tokRe, themeRe] of [["light", /:root\s*\{\s*(--tok-[^}]*)\}/, /:root\s*\{([^}]*)\}/], ["dark", /\.dark, \[data-theme="dark"\]\)\s*\{\s*(--tok-[^}]*)\}/, /:is\(\.dark, \[data-theme="dark"\]\)\s*\{([^}]*)\}/]]) {
  const tok = vars(block(css, tokRe));
  const t = vars(block(theme, themeRe));
  for (const bg of ["card", "muted", "background"]) for (const [k, v] of Object.entries(tok)) {
    const r = ratio(v, t[bg]);
    if (r < 4.5) { bad++; console.log(`FAIL ${mode} ${k} ${v} on ${bg} ${t[bg]}: ${r.toFixed(2)}`); }
  }
  console.log(`${mode}: ${Object.keys(tok).length} tokens x 3 backgrounds checked`);
}
console.log(bad ? `${bad} failures` : "token contrast ok (AA, 4.5:1)");
process.exit(bad ? 1 : 0);
