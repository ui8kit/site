// The ui8kit composition rules (01 block-root, 02 raw-html / dynamic-tag / raw-native-tag, 03 reactive-aria, 06 literal-text) on the
// site's own templ files, with the zones of the "ui8kit" field of package.json: the kit (generator/ui8kit, copied verbatim) is never
// scanned; composition files are; blockRoot files must open on one Block per render path. Findings that are inherent (the
// document shell, HTML rendered at build time) are counted per file in scripts/rules-baseline.json: more fails, fewer asks to
// update the baseline (bun scripts/check-rules.ts --write). The detectors and the templ adapter are copies from the source monorepo.
//   bun scripts/check-rules.ts [--write] [--list]
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { detect, DETECTORS, rootOf } from "./rules/detectors";
import { templToIr } from "./rules/templ";
import type { IrFile } from "./rules/ir";

const repo = join(import.meta.dir, "..");
const zone = (JSON.parse(readFileSync(join(repo, "package.json"), "utf8")) as { ui8kit: { kit: string[]; composition: string[]; blockRoot: string[] } }).ui8kit;
const baselinePath = join(repo, "scripts/rules-baseline.json");
const under = (rel: string, p: string): boolean => rel === p || rel.startsWith(`${p}/`);
const walk = (abs: string): string[] => (!existsSync(abs) ? [] : statSync(abs).isDirectory() ? readdirSync(abs).sort().flatMap((n) => walk(join(abs, n))) : abs.endsWith(".templ") ? [abs] : []);

const files = zone.composition.flatMap((c) => walk(join(repo, c))).filter((f) => !zone.kit.some((k) => under(relative(repo, f), k)));
const irs = new Map<string, IrFile>(files.map((f) => [f, templToIr(readFileSync(f, "utf8"), f)]));
// a component of the site that opens on Block counts as a Block root for the files that render it
const byName = new Map<string, string>();
for (const f of files) for (const m of readFileSync(f, "utf8").matchAll(/^templ ([A-Z]\w*)\(/gm)) byName.set(m[1]!, f);
const memo = new Map<string, boolean>();
const opensOnBlock = (f: string, seen = new Set<string>()): boolean => {
  if (memo.has(f)) return memo.get(f)!;
  if (seen.has(f)) return false;
  seen.add(f);
  const root = rootOf(irs.get(f)!.nodes);
  const ok = !!root && root.kind === "component" && (root.name === "Block" || (byName.has(root.name) && opensOnBlock(byName.get(root.name)!, seen)));
  memo.set(f, ok);
  return ok;
};

const counts: Record<string, Record<string, number>> = Object.fromEntries(DETECTORS.map((d) => [d, {}]));
const problems: string[] = [];
const list: string[] = [];
for (const f of files) {
  const rel = relative(repo, f);
  const ir = irs.get(f)!;
  if (ir.error) problems.push(`${rel}: parse error ${ir.error}`);
  const found = detect(ir, { blockRoot: zone.blockRoot.some((p) => under(rel, p)), rootsOnBlock: (n) => (byName.has(n) ? opensOnBlock(byName.get(n)!) : undefined) });
  for (const x of found) { counts[x.detector]![rel] = (counts[x.detector]![rel] ?? 0) + 1; list.push(`${rel}:${x.line}  ${x.detector}  ${x.message}`); }
}
if (process.argv.includes("--list")) for (const l of list) console.log(`  ${l}`);
if (process.argv.includes("--write")) {
  const doc = { $comment: "Recorded findings of the ui8kit rules on the site's composition files: the document shell (html, head, body have no primitive) and HTML rendered at build time (markdown, highlighted code, block previews). Regenerate: bun scripts/check-rules.ts --write", counts };
  writeFileSync(baselinePath, JSON.stringify(doc, null, 2) + "\n");
  console.log(`rules: baseline written (${list.length} findings)`);
  process.exit(0);
}
const base = existsSync(baselinePath) ? (JSON.parse(readFileSync(baselinePath, "utf8")) as { counts: typeof counts }).counts : {};
for (const d of DETECTORS) {
  const b = base[d] ?? {}, c = counts[d]!;
  for (const file of new Set([...Object.keys(b), ...Object.keys(c)])) {
    const have = c[file] ?? 0, allowed = b[file] ?? 0;
    if (have > allowed) problems.push(...list.filter((l) => l.startsWith(`${file}:`) && l.includes(`  ${d}  `)).map((l) => `${l}${allowed ? ` (${have} found, ${allowed} recorded)` : ""}`));
    if (have < allowed) problems.push(`scripts/rules-baseline.json: ${d} in ${file} went down from ${allowed} to ${have}; run bun scripts/check-rules.ts --write`);
  }
}
for (const p of problems) console.error(`  ${p}`);
console.log(`rules: ${files.length} composition files, ${list.length} recorded findings, ${problems.length} problem(s)`);
process.exit(problems.length ? 1 : 0);
