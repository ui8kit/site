// Checks of web/ (landing page of buildy.tw): lang, title, description, canonical, landmarks, one h1, no external requests, required links.
import { readFileSync } from "node:fs";
import path from "node:path";
const dir = path.resolve(process.argv[2] ?? "web");
const h = readFileSync(path.join(dir, "index.html"), "utf8"), css = readFileSync(path.join(dir, "style.css"), "utf8");
const errs = [];
const need = (ok, m) => ok || errs.push(m);
need(/<html lang="en"/.test(h), "html lang=en");
need(/<title>[^<]+<\/title>/.test(h), "title");
need(/<meta name="description" content="[^"]+"/.test(h), "meta description");
need(/<link rel="canonical" href="https:\/\/buildy\.tw\/"/.test(h), "canonical");
for (const t of ["header", "main", "footer"]) need(new RegExp(`<${t}[\\s>]`).test(h), `<${t}>`);
need((h.match(/<h1[\s>]/g) ?? []).length === 1, "exactly one h1");
need(!/<script/i.test(h), "no scripts");
for (const m of h.matchAll(/<(?:link|script|img|iframe|source)\b[^>]*\b(?:src|href)="(https?:)?\/\/[^"]*"/g)) if (!/rel="canonical"/.test(m[0])) errs.push(`external request: ${m[0].slice(0, 80)}`);
need(!/url\(\s*["']?https?:|@import/.test(css), "external url/import in css");
for (const u of ["https://github.com/ui8kit/site", "https://ui.buildy.tw/"]) need(new RegExp(`<a [^>]*href="${u}"[^>]*rel="noopener"`).test(h), `link ${u} with rel=noopener`);
if (errs.length) { console.error(errs.join("\n")); process.exit(1); }
console.log("web check ok");
