// Props schemas of the registry blocks (alexy-os/chaosbun#138): the source's apps/stock/content/props.v0.json, published verbatim
// at r/props/v0.json (https://registry.buildy.tw/props/v0.json) with a sha256 sidecar (v0.json.sha256, sha256sum format) and an
// entry in manifest.json / registry.json. Per registry block: organism, events, slots and the JSON Schema (draft 2020-12) of its
// props. The file's own `digest` is the sha256 of the file without it. Same shape of checks as variants.ts.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const PROPS_SRC = "apps/stock/content/props.v0.json";
export const PROPS_DIR = "props";
export const PROPS_FILE = "v0.json";

export type PropsEntry = { path: string; sha256: string; bytes: number; digest: string; version: string; items: number };

const sha = (b: string | Buffer) => createHash("sha256").update(b).digest("hex");

/** the organism of every item of a variants file (r/variants/v0.json), for the props/variants consistency check */
export function variantOrganisms(raw: Buffer): Map<string, string> {
  const j = JSON.parse(raw.toString("utf8"));
  return new Map(Object.entries<any>(j.items ?? {}).map(([n, it]) => [n, String(it?.organism)]));
}

/** parse and check the source file: own digest, every item is a registry item (names = the built registry), has an object
 *  schema, and every variants item has a props schema of the same organism */
export function checkProps(raw: Buffer, names: ReadonlySet<string>, variants?: ReadonlyMap<string, string>): { entry: Omit<PropsEntry, "path">; problems: string[] } {
  const problems: string[] = [];
  const j = JSON.parse(raw.toString("utf8"));
  const { digest, ...body } = j;
  if (typeof digest !== "string" || digest !== "sha256:" + sha(JSON.stringify(body))) problems.push(`props: digest ${digest} does not match the file body`);
  if (!j.items || typeof j.items !== "object") problems.push("props: no items");
  const items: Record<string, any> = j.items ?? {};
  for (const [name, it] of Object.entries<any>(items)) {
    if (!names.has(name)) problems.push(`props: ${name} is not a registry item`);
    if (typeof it?.organism !== "string" || !it.organism) problems.push(`props: ${name} has no organism`);
    if (!it?.schema || typeof it.schema !== "object" || it.schema.type !== "object") problems.push(`props: ${name} has no object schema`);
    if (!Array.isArray(it?.events) || !Array.isArray(it?.slots)) problems.push(`props: ${name} has no events/slots lists`);
  }
  for (const [name, organism] of variants ?? []) {
    if (!items[name]) problems.push(`props: variants item ${name} has no props schema`);
    else if (items[name].organism !== organism) problems.push(`props: ${name} organism ${items[name].organism} differs from variants ${organism}`);
  }
  return { entry: { sha256: sha(raw), bytes: raw.length, digest: String(digest), version: String(j.version), items: Object.keys(items).length }, problems };
}

/** copy the source file verbatim to <out>/props/v0.json (+ .sha256 sidecar); throws on problems */
export function publishProps(src: string, out: string, names: ReadonlySet<string>, variants?: ReadonlyMap<string, string>): PropsEntry {
  const from = path.join(src, PROPS_SRC);
  if (!existsSync(from)) throw new Error(`missing ${from}`);
  const raw = readFileSync(from);
  const { entry, problems } = checkProps(raw, names, variants);
  if (problems.length) { console.error(problems.join("\n")); throw new Error(`${problems.length} props problem(s)`); }
  const dir = path.join(out, PROPS_DIR);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, PROPS_FILE), raw);
  writeFileSync(path.join(dir, `${PROPS_FILE}.sha256`), `${entry.sha256}  ${PROPS_FILE}\n`);
  return { path: `${PROPS_DIR}/${PROPS_FILE}`, ...entry };
}
