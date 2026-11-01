// Validates every r/**/*.json document that declares a registry.buildy.tw $schema against the
// committed schemas in registry/schema/ (r/<rt>/index.json and r/registry.json -> registry.json,
// item files -> registry-item.json). Needs ajv (draft-07): `npm i --no-save --prefix /tmp/ajv ajv@8`
// then `NODE_PATH=/tmp/ajv/node_modules node scripts/check-schemas.mjs`.
import { createRequire } from "node:module";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const Ajv = require("ajv");
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const R = path.join(root, "r");
const S = path.join(root, "registry", "schema");
const BASE = "https://registry.buildy.tw/schema/";

const ajv = new Ajv({ strict: false, allErrors: true });
for (const f of readdirSync(S)) ajv.addSchema(JSON.parse(readFileSync(path.join(S, f), "utf8")));

const skipDirs = new Set(["schema", "wpfasty"]);
const files = [];
(function walk(d) {
  for (const e of readdirSync(d)) {
    const p = path.join(d, e);
    if (statSync(p).isDirectory()) { if (!skipDirs.has(e)) walk(p); }
    else if (e.endsWith(".json") && p !== path.join(R, "vercel.json")) files.push(p);
  }
})(R);

let checked = 0, bad = 0;
for (const f of files) {
  const doc = JSON.parse(readFileSync(f, "utf8"));
  const id = doc.$schema;
  if (typeof id !== "string" || !id.startsWith("https://")) continue;
  const rel = path.relative(root, f);
  if (!id.startsWith(BASE)) { console.error(`${rel}: $schema ${id} is not under ${BASE}`); bad++; continue; }
  const validate = ajv.getSchema(id);
  if (!validate) { console.error(`${rel}: unknown schema ${id}`); bad++; continue; }
  checked++;
  if (!validate(doc)) { bad++; console.error(`${rel}: ${ajv.errorsText(validate.errors)}`); }
}
if (checked === 0) { console.error("no documents checked"); process.exit(1); }
console.log(`${checked} documents valid against registry/schema/${bad ? `, ${bad} problem(s)` : ""}`);
process.exit(bad ? 1 : 0);
