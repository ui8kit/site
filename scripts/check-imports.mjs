// Verifies that every relative import in an installed kit tree resolves to a file.
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import path from "node:path";
const [root, rt = ""] = process.argv.slice(2);
const files = [];
(function walk(d) { for (const e of readdirSync(d)) { const p = path.join(d, e); statSync(p).isDirectory() ? walk(p) : files.push(p); } })(root);
let bad = 0;
for (const f of files.filter((f) => /\.(ts|tsx|svelte|vue)$/.test(f))) {
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(/(?:from|import)\s+["'](\.[^"']*)["']/g)) {
    const b = path.resolve(path.dirname(f), m[1]);
    const ok = [b, ...[".ts", ".tsx", ".svelte", ".vue"].map((e) => b + e), path.join(b, "index.ts")].some((c) => existsSync(c) && statSync(c).isFile());
    if (!ok) { bad++; console.log("  unresolved", path.relative(root, f), m[1]); }
  }
}
console.log(`[${rt}] ${files.length} files installed, ${bad} unresolved relative imports`);
process.exit(bad ? 1 : 0);
