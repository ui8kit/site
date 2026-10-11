// axe (WCAG 2.x A/AA) on a few pages of dist/ in headless Chrome, one page at a time. Optionally saves screenshots.
//   node scripts/a11y.mjs dist /,/docs/,/blocks/hero-split/ [shots-dir]
// Env A11Y_THEME=light|dark|system and A11Y_SKIN=<skin id> preselect the choice (localStorage, as the header selects do).
import http from "node:http";
import { readFileSync, existsSync, statSync, mkdirSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import puppeteer from "puppeteer-core";
const require = createRequire(import.meta.url);
const axeSrc = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const dist = path.resolve(process.argv[2] ?? "dist");
const pages = (process.argv[3] ?? "/").split(",");
const shots = process.argv[4];
const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".xml": "application/xml", ".txt": "text/plain" };
const server = http.createServer((req, res) => {
  let p = path.join(dist, decodeURIComponent(req.url.split("?")[0]));
  if (p.endsWith("/")) p += "index.html";
  if (!existsSync(p) || !statSync(p).isFile()) { res.writeHead(404); return res.end("nf"); }
  res.writeHead(200, { "content-type": types[path.extname(p)] ?? "application/octet-stream" });
  res.end(readFileSync(p));
}).listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox", "--disable-gpu"] });
let failed = 0;
const external = [];
try {
  if (shots) mkdirSync(shots, { recursive: true });
  for (const p of pages) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    if (process.env.A11Y_THEME || process.env.A11Y_SKIN) await page.evaluateOnNewDocument((t, k) => { if (t) localStorage.setItem("ui8kit-theme", t); if (k) localStorage.setItem("ui8kit-skin", k); }, process.env.A11Y_THEME ?? "", process.env.A11Y_SKIN ?? "");
    page.on("request", (r) => { if (!r.url().startsWith(base) && !r.url().startsWith("data:")) external.push(r.url()); });
    await page.goto(base + p, { waitUntil: "networkidle0" });
    await page.evaluate(axeSrc);
    const res = await page.evaluate(() => axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } }));
    console.log(`${p}: ${res.violations.length} violations, ${res.passes.length} rules passed, ${res.incomplete.length} incomplete`);
    for (const v of res.violations) { failed++; console.log(`  ${v.id} (${v.impact}): ${v.help}`); for (const n of v.nodes.slice(0, 3)) console.log("    ", n.target.join(" "), n.failureSummary?.split("\n")[1] ?? ""); }
    if (shots) await page.screenshot({ path: path.join(shots, (p.replace(/\//g, "_").replace(/^_|_$/g, "") || "home") + (process.env.A11Y_THEME ? "-" + process.env.A11Y_THEME : "") + (process.env.A11Y_SKIN ? "-" + process.env.A11Y_SKIN : "") + ".png") });
    await page.close();
  }
} finally { await browser.close(); server.close(); }
console.log(external.length ? `external requests: ${[...new Set(external)].join(", ")}` : "no external requests in the browser");
process.exit(failed || external.length ? 1 : 0);
