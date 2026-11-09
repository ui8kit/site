// Stock variant presets (alexy-os/chaosbun#137): the source's apps/stock/content/variants.v0.json, published verbatim at
// r/variants/v0.json (https://registry.buildy.tw/variants/v0.json) with a sha256 sidecar (v0.json.sha256, sha256sum format)
// and an entry in manifest.json / registry.json. Per registry block: block, organism, axes, defaults, defaultVariant and
// every variant Stock shows (asset id, set, organism props). The file's own `digest` is the sha256 of the file without it.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const VARIANTS_SRC = "apps/stock/content/variants.v0.json";
export const VARIANTS_DIR = "variants";
export const VARIANTS_FILE = "v0.json";

export type VariantsEntry = { path: string; sha256: string; bytes: number; digest: string; version: string; items: number; variants: number };

const sha = (b: string | Buffer) => createHash("sha256").update(b).digest("hex");

/** parse and check the source file: own digest, and every item is a registry item (names = the built registry) */
export function checkVariants(raw: Buffer, names: ReadonlySet<string>): { entry: Omit<VariantsEntry, "path">; problems: string[] } {
  const problems: string[] = [];
  const j = JSON.parse(raw.toString("utf8"));
  const { digest, ...body } = j;
  if (typeof digest !== "string" || digest !== "sha256:" + sha(JSON.stringify(body))) problems.push(`variants: digest ${digest} does not match the file body`);
  if (!j.items || typeof j.items !== "object") problems.push("variants: no items");
  let variants = 0;
  for (const [name, it] of Object.entries<any>(j.items ?? {})) {
    if (!names.has(name)) problems.push(`variants: ${name} is not a registry item`);
    const v = Object.keys(it?.variants ?? {});
    if (!v.length) problems.push(`variants: ${name} has no variants`);
    if (it?.defaultVariant && !v.includes(it.defaultVariant)) problems.push(`variants: ${name} defaultVariant ${it.defaultVariant} is not a variant`);
    variants += v.length;
  }
  return { entry: { sha256: sha(raw), bytes: raw.length, digest: String(digest), version: String(j.version), items: Object.keys(j.items ?? {}).length, variants }, problems };
}

/** copy the source file verbatim to <out>/variants/v0.json (+ .sha256 sidecar); throws on problems */
export function publishVariants(src: string, out: string, names: ReadonlySet<string>): VariantsEntry {
  const from = path.join(src, VARIANTS_SRC);
  if (!existsSync(from)) throw new Error(`missing ${from}`);
  const raw = readFileSync(from);
  const { entry, problems } = checkVariants(raw, names);
  if (problems.length) { console.error(problems.join("\n")); throw new Error(`${problems.length} variants problem(s)`); }
  const dir = path.join(out, VARIANTS_DIR);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, VARIANTS_FILE), raw);
  writeFileSync(path.join(dir, `${VARIANTS_FILE}.sha256`), `${entry.sha256}  ${VARIANTS_FILE}\n`);
  return { path: `${VARIANTS_DIR}/${VARIANTS_FILE}`, ...entry };
}
