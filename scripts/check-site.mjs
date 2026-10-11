// Basic checks of the generated site: title, lang, landmarks, h1, internal links and anchors resolve, no external requests.
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import path from "node:path";
const dist = path.resolve(process.argv[2] ?? "dist");
const htmls = [];
(function walk(d) { for (const e of readdirSync(d)) { const p = path.join(d, e); statSync(p).isDirectory() ? (e !== "r" || d !== dist) && walk(p) : p.endsWith(".html") && htmls.push(p); } })(dist);
const errs = [];
const idsOf = new Map();
const ids = (f) => idsOf.get(f) ?? idsOf.set(f, new Set([...readFileSync(f, "utf8").matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]))).get(f);
const resolve = (u) => {
  let p = path.join(dist, decodeURIComponent(u));
  if (u.endsWith("/")) p = path.join(p, "index.html");
  return existsSync(p) && statSync(p).isFile() ? p : null;
};
for (const f of htmls) {
  const rel = path.relative(dist, f), h = readFileSync(f, "utf8");
  const e = (m) => errs.push(`${rel}: ${m}`);
  if (!/<html lang="[a-z-]+"/.test(h)) e("no html lang");
  if (!/<title>[^<]+<\/title>/.test(h)) e("no title");
  for (const [tag, re] of [["main", /<main[\s>]/], ["header/banner", /<header[\s>]/], ["nav", /<nav[\s>]/], ["footer/contentinfo", /<footer[\s>]/]]) if (!re.test(h)) e(`no <${tag}>`);
  if ((h.match(/<h1[\s>]/g) ?? []).length !== 1) e("expected exactly one h1");
  // external requests: subresources only (plain <a href="https://..."> links are navigation, not requests)
  for (const m of h.matchAll(/<(?:link|script|img|iframe|source|video|audio)\b[^>]*\b(?:src|href)="(https?:)?\/\/[^"]*"/g)) if (!/rel="canonical"/.test(m[0])) e(`external request: ${m[0].slice(0, 80)}`);
  if (/url\(\s*["']?https?:/.test(h)) e("external url() in html");
  if (/<style[\s>]/.test(h) && /@import/.test(h)) e("@import in inline style");
  for (const m of h.matchAll(/\s(?:href|src)="([^"]*)"/g)) {
    const u = m[1];
    if (!u || /^(https?:|mailto:|data:|javascript:)/.test(u)) continue;
    const [pth, hash] = u.split("#");
    let target = f;
    if (pth) { target = resolve(pth.startsWith("/") ? pth : path.posix.join("/" + path.dirname(rel), pth)); if (!target) { e(`broken link ${u}`); continue; } }
    if (hash && target.endsWith(".html") && !ids(target).has(hash)) e(`missing anchor ${u}`);
  }
}
const css = readFileSync(path.join(dist, "assets/site.css"), "utf8");
if (/url\(\s*["']?https?:|@import\s+(url\()?["']?https?:/.test(css)) errs.push("assets/site.css: external url/import");
console.log(`${htmls.length} html files checked`);
if (errs.length) { console.error(errs.slice(0, 40).join("\n") + `\n${errs.length} problem(s)`); process.exit(1); }
console.log("site check ok");
