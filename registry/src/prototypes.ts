// Content models and prototype contracts of the simple line (codegen-x packages/prototypes): the source's
// packages/prototypes/out/{models,contracts}, published verbatim at
//   r/models/<id>@<v>.schema.json         https://registry.buildy.tw/models/hero@1.schema.json  (JSON Schema 2020-12)
//   r/contracts/<item>/<n>.json           https://registry.buildy.tw/contracts/hero-simple/1.json
//   r/contracts/v0.json                   the index of the contracts
// each with a sha256 sidecar (<file>.sha256, sha256sum format) and an entry in manifest.json / registry.json. The source's own
// out/manifest.json lists the sha256 of every file: a file that differs from it is not published. A contract names a registry
// block of every runtime and a model that is published here; the block items carry meta.model and meta.contract.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const PROTOTYPES_SRC = "packages/prototypes/out";
export const MODELS_DIR = "models";
export const CONTRACTS_DIR = "contracts";
export const BASE = "https://registry.buildy.tw";

export type FileEntry = { path: string; sha256: string; bytes: number };
export type PrototypesEntry = {
  models: Record<string, FileEntry & { id: string }>;
  contracts: Record<string, FileEntry & { version: number; model: string; block: string }>;
  index: FileEntry;
  source: { manifest: string };
};
/** per registry block: its model and contract (item meta) */
export type BlockLinks = Map<string, { model: string; contract: string }>;

const sha = (b: string | Buffer) => createHash("sha256").update(b).digest("hex");
const MODEL_FILE = /^models\/([a-z][a-z0-9-]*@[1-9][0-9]*)\.schema\.json$/;
const CONTRACT_FILE = /^contracts\/([a-z0-9]+(?:-[a-z0-9]+)*)\/([1-9][0-9]*)\.json$/;

type Read = { files: Map<string, Buffer>; links: BlockLinks; problems: string[]; manifestSha: string };

/** read and check the source: every published file is in out/manifest.json with its sha256, schemas and contracts agree */
export function readPrototypes(src: string): Read | null {
  const root = path.join(src, PROTOTYPES_SRC);
  const mf = path.join(root, "manifest.json");
  if (!existsSync(mf)) return null;
  const raw = readFileSync(mf);
  const manifest = JSON.parse(raw.toString("utf8")) as { files?: Record<string, string> };
  const problems: string[] = [];
  const files = new Map<string, Buffer>();
  const links: BlockLinks = new Map();
  const listed = Object.keys(manifest.files ?? {}).filter((f) => MODEL_FILE.test(f) || CONTRACT_FILE.test(f) || f === "contracts/v0.json").sort();
  for (const f of listed) {
    const p = path.join(root, f);
    if (!existsSync(p)) { problems.push(`prototypes: ${f} is in out/manifest.json but missing`); continue; }
    const b = readFileSync(p);
    if (sha(b) !== manifest.files![f]) problems.push(`prototypes: ${f} differs from its sha256 in out/manifest.json`);
    files.set(f, b);
  }
  const models = new Set<string>();
  for (const [f, b] of files) {
    const m = MODEL_FILE.exec(f);
    if (!m) continue;
    const j = JSON.parse(b.toString("utf8"));
    if (j.$schema !== "https://json-schema.org/draft/2020-12/schema") problems.push(`prototypes: ${f} is not a JSON Schema 2020-12`);
    if (j.$id !== `${BASE}/models/${m[1]}.schema.json`) problems.push(`prototypes: ${f} has $id ${j.$id}`);
    models.add(m[1]!);
  }
  for (const [f, b] of files) {
    const m = CONTRACT_FILE.exec(f);
    if (!m) continue;
    const c = JSON.parse(b.toString("utf8"));
    if (c.item !== m[1] || String(c.version) !== m[2]) problems.push(`prototypes: ${f} names item ${c.item} version ${c.version}`);
    if (!models.has(c.model)) problems.push(`prototypes: ${f} reads model ${c.model}, which is not published`);
    if (c.modelSchema !== `${BASE}/models/${c.model}.schema.json`) problems.push(`prototypes: ${f} has modelSchema ${c.modelSchema}`);
    const prev = links.get(c.item);
    if (!prev || Number(prev.contract.split("/").pop()!.replace(".json", "")) < c.version) links.set(c.item, { model: c.model, contract: f });
  }
  const index = files.get("contracts/v0.json");
  if (!index) problems.push("prototypes: no contracts/v0.json");
  else {
    const items = JSON.parse(index.toString("utf8")).items ?? {};
    for (const [item, l] of links) if (items[item]?.path !== l.contract.slice(`${CONTRACTS_DIR}/`.length)) problems.push(`prototypes: contracts/v0.json does not point ${item} at ${l.contract}`);
    for (const item of Object.keys(items)) if (!links.has(item)) problems.push(`prototypes: contracts/v0.json lists ${item} without its contract`);
  }
  return { files, links, problems, manifestSha: sha(raw) };
}

/** copy the models and contracts to <out>/{models,contracts} (+ .sha256 sidecars); every contract item is a registry block of `names` */
export function publishPrototypes(read: Read, out: string, names: ReadonlySet<string>): PrototypesEntry {
  const problems = [...read.problems];
  for (const item of read.links.keys()) if (!names.has(item)) problems.push(`prototypes: ${item} is not a registry block of every runtime`);
  if (problems.length) { console.error(problems.join("\n")); throw new Error(`${problems.length} prototypes problem(s)`); }
  const entry: PrototypesEntry = { models: {}, contracts: {}, index: { path: "", sha256: "", bytes: 0 }, source: { manifest: read.manifestSha } };
  for (const [f, b] of read.files) {
    const p = path.join(out, f);
    mkdirSync(path.dirname(p), { recursive: true });
    writeFileSync(p, b);
    writeFileSync(`${p}.sha256`, `${sha(b)}  ${path.basename(f)}\n`);
    const e = { path: f, sha256: sha(b), bytes: b.length };
    const m = MODEL_FILE.exec(f), c = CONTRACT_FILE.exec(f);
    if (m) entry.models[m[1]!] = { id: m[1]!, ...e };
    else if (c) { const j = JSON.parse(b.toString("utf8")); entry.contracts[`${c[1]}@${c[2]}`] = { ...e, version: j.version, model: j.model, block: j.block }; }
    else entry.index = e;
  }
  return entry;
}

/** check a published r/: every entry of manifest.models / manifest.contracts exists with its sha256 and sidecar */
export function checkPublished(r: string, entry: PrototypesEntry | undefined): string[] {
  if (!entry) return ["manifest: no prototypes entry (models, contracts)"];
  const out: string[] = [];
  for (const e of [...Object.values(entry.models), ...Object.values(entry.contracts), entry.index]) {
    const p = path.join(r, e.path);
    if (!existsSync(p)) { out.push(`prototypes: missing ${e.path}`); continue; }
    const b = readFileSync(p);
    if (sha(b) !== e.sha256 || b.length !== e.bytes) out.push(`prototypes: ${e.path} differs from manifest`);
    const side = `${p}.sha256`;
    if (!existsSync(side) || readFileSync(side, "utf8").split(/\s+/)[0] !== e.sha256) out.push(`prototypes: ${e.path}.sha256 sidecar differs`);
  }
  return out;
}
