/**
 * Checks the WP FastY builder registries (builder-registry/ and its copy in r/): per runtime (latte, twig) every
 * v<semver>/ has catalog.json (format 2, runtime = templates = <runtime>, version = directory) and blocks.zip matching
 * archive {bytes, sha256}; latest/ equals the newest version; r/<runtime>/wpfasty/ equals builder-registry/.
 * The full import rules (template list, no other-runtime file) are checked by wp-fasty's registry-verify.ts.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dir, "..");
const errors: string[] = [];
const err = (m: string) => errors.push(m);
const cmp = (a: string, b: string) => a.split(".").map(Number).reduce((r, x, i) => r || x - Number(b.split(".")[i]), 0);
for (const rt of ["latte", "twig"]) {
  const base = path.join(root, "builder-registry", rt, "wpfasty");
  if (!existsSync(base)) { err(`${rt}: builder-registry/${rt}/wpfasty missing`); continue; }
  const versions = readdirSync(base).filter((d) => /^v\d+\.\d+\.\d+$/.test(d)).map((d) => d.slice(1)).sort(cmp);
  if (!versions.length) err(`${rt}: no version`);
  for (const dir of [...versions.map((v) => `v${v}`), "latest"]) {
    const d = path.join(base, dir);
    const cat = JSON.parse(readFileSync(path.join(d, "catalog.json"), "utf8"));
    const zip = readFileSync(path.join(d, "blocks.zip"));
    if (cat.format !== 2 || cat.runtime !== rt || cat.templates !== rt) err(`${rt}/${dir}: not a ${rt} catalog@2`);
    if (dir !== "latest" && cat.version !== dir.slice(1)) err(`${rt}/${dir}: catalog version ${cat.version}`);
    if (cat.archive?.bytes !== zip.length || cat.archive?.sha256 !== createHash("sha256").update(zip).digest("hex")) err(`${rt}/${dir}: blocks.zip ≠ archive`);
    for (const f of ["catalog.json", "blocks.zip"]) {
      const served = path.join(root, "r", rt, "wpfasty", dir, f);
      if (!existsSync(served) || !readFileSync(served).equals(readFileSync(path.join(d, f)))) err(`r/${rt}/wpfasty/${dir}/${f} ≠ builder-registry`);
    }
  }
  const newest = versions.at(-1);
  if (newest && !readFileSync(path.join(base, "latest", "catalog.json")).equals(readFileSync(path.join(base, `v${newest}`, "catalog.json")))) err(`${rt}: latest ≠ v${newest}`);
  if (!errors.length) console.log(`${rt}: wpfasty builder registry ok (${versions.map((v) => "v" + v).join(", ")}, latest = v${newest})`);
}
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
