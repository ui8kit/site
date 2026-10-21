// Validates r/: item shape (CLI contract 2.0.0), sha256 vs manifest, registryDependencies resolve, index parity.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const R = path.resolve(process.argv[2] ?? path.join(import.meta.dir, "../../r"));
const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const errors: string[] = [];
const err = (m: string) => errors.push(m);
const TYPES = new Set(["registry:ui", "registry:component", "registry:block", "registry:utils", "registry:lib"]);
const FOLDER: Record<string, string> = { "registry:ui": "components/ui", "registry:component": "components", "registry:block": "blocks", "registry:utils": "utils", "registry:lib": "lib" };

const manifest = read(path.join(R, "manifest.json"));
const site = read(path.join(R, "registry.json"));
for (const rt of site.runtimes as string[]) {
  const index = read(path.join(R, rt, "index.json"));
  const names = new Set<string>(index.components.map((c: any) => c.name));
  if (names.size !== index.components.length) err(`${rt}: duplicate names in index`);
  let n = 0;
  for (const c of index.components) {
    const p = path.join(R, rt, FOLDER[c.type] ?? "?", `${c.name}.json`);
    if (!TYPES.has(c.type)) err(`${rt}/${c.name}: bad type ${c.type}`);
    if (!existsSync(p)) { err(`${rt}/${c.name}: missing ${path.relative(R, p)}`); continue; }
    const it = read(p); n++;
    if (it.name !== c.name || it.type !== c.type) err(`${rt}/${c.name}: index/item mismatch`);
    if (it.runtime !== rt) err(`${rt}/${c.name}: runtime field ${it.runtime}`);
    if (!it.files?.length) err(`${rt}/${c.name}: no files`);
    for (const d of it.registryDependencies) if (!names.has(d)) err(`${rt}/${c.name}: unknown registryDependency ${d}`);
    for (const f of it.files) {
      if (!f.path || !f.target || typeof f.content !== "string") err(`${rt}/${c.name}: bad file entry`);
      const want = manifest.runtimes[rt].entries[c.name]?.files[f.target]?.sha256;
      if (want !== createHash("sha256").update(f.content).digest("hex")) err(`${rt}/${c.name}: sha256 mismatch ${f.target}`);
    }
  }
  if (n !== manifest.runtimes[rt].items) err(`${rt}: item count ${n} != manifest ${manifest.runtimes[rt].items}`);
  console.log(`${rt}: ${n} items ok`);
}
// every json file under r/<runtime> is listed in the index
for (const rt of site.runtimes as string[]) {
  let files = 0;
  // r/<rt>/wpfasty/ is the separate WP FastY builder registry (scripts/check-wpfasty-registry.ts), not shadcn items
  (function walk(d: string) { for (const e of readdirSync(d)) { const p = path.join(d, e); if (p === path.join(R, rt, "wpfasty")) continue; statSync(p).isDirectory() ? walk(p) : e !== "index.json" && files++; } })(path.join(R, rt));
  if (files !== manifest.runtimes[rt].items) err(`${rt}: ${files} item files on disk, ${manifest.runtimes[rt].items} in manifest`);
}
if (errors.length) { console.error(errors.slice(0, 30).join("\n")); console.error(`${errors.length} error(s)`); process.exit(1); }
console.log("registry valid");
