// Builds r/ (registry for every runtime) from the generated packages of the ui8kit monorepo.
//
//   bun run registry:build                       # source from $UI8KIT_SRC or ../ui8kit next to this repo
//   bun run registry:build -- --src /path/to/ui8kit --out r --version 0.1.0
//
// Deterministic: sorted keys and items, no timestamps (lastUpdated = commit date of the source), sha256 per file.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

export const RUNTIMES = ["svelte", "react", "vue"] as const;
export type Runtime = (typeof RUNTIMES)[number];

type Kind = "utils" | "lib" | "primitive" | "component" | "block";
type RegType = "registry:utils" | "registry:lib" | "registry:ui" | "registry:component" | "registry:block";
type File = { path: string; target: string; content: string };
type Item = {
  name: string; type: RegType; title: string; description: string; runtime: Runtime; digest: string;
  dependencies: string[]; devDependencies: string[]; registryDependencies: string[]; files: File[];
  meta: { kind: Kind; category: string; group?: string; tags: string[] };
};

function arg(name: string, env: string, def: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1]! : process.env[env] ?? def;
}
const repoRoot = path.resolve(import.meta.dir, "../..");
const SRC = path.resolve(arg("src", "UI8KIT_SRC", path.join(repoRoot, "..", "ui8kit")));
const OUT = path.resolve(arg("out", "UI8KIT_OUT", path.join(repoRoot, "r")));
const VERSION = arg("version", "UI8KIT_REGISTRY_VERSION", JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8")).version);

const sha = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");
const sortKeys = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(sortKeys)
  : v && typeof v === "object" ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, sortKeys((v as any)[k])]))
  : v;
const json = (v: unknown) => JSON.stringify(sortKeys(v), null, 2) + "\n";
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function walk(dir: string, base = dir): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir).sort(cmp)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p, base));
    else out.push(path.relative(base, p).split(path.sep).join("/"));
  }
  return out;
}
const git = (args: string[]) => { try { return execFileSync("git", ["-C", SRC, ...args], { encoding: "utf8" }).trim(); } catch { return ""; } };

const titleOf = (n: string) => n.split("-").map((w) => w[0]!.toUpperCase() + w.slice(1)).join(" ");
const kebab = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

/** first prose sentence from the leading generated-file comment */
function describe(src: string, fallback: string): string {
  const m = src.match(/<!--([\s\S]*?)-->/) ?? src.match(/\/\*\*?([\s\S]*?)\*\//);
  const lines = (m?.[1] ?? "").split("\n").map((l) => l.replace(/^\s*\*?\s?/, "").trim()).filter((l) => l && !/^(Code generated|Source:)/.test(l));
  const text = lines.join(" ").replace(/\s+/g, " ");
  return text ? text.slice(0, 280) : fallback;
}

/** block name -> {theme, group, docs} from xgen/specs/blocks */
function blockMeta(): Map<string, { theme: string; group: string; docs: string }> {
  const dir = path.join(SRC, "xgen/specs/blocks");
  const map = new Map<string, { theme: string; group: string; docs: string }>();
  if (!existsSync(dir)) return map;
  for (const f of readdirSync(dir).sort(cmp)) {
    if (!f.endsWith(".json")) continue;
    const j = JSON.parse(readFileSync(path.join(dir, f), "utf8"));
    const meta = { theme: j.theme ?? "general", group: j.group ?? "misc", docs: j.docs ?? "" };
    for (const o of [j.organism, j.alt?.organism, ...(j.organisms ?? [])]) if (o) map.set(kebab(o), meta);
  }
  return map;
}

const EXT: Record<Runtime, string[]> = { svelte: [".svelte"], react: [".tsx"], vue: [".vue"] };

function buildRuntime(rt: Runtime, meta: ReturnType<typeof blockMeta>): Item[] {
  const root = path.join(SRC, "packages", rt, "ui/src");
  if (!existsSync(root)) throw new Error(`missing ${root}`);
  const pkg = JSON.parse(readFileSync(path.join(root, "../package.json"), "utf8"));
  const files = walk(root).filter((f) => /^(primitives|components|blocks|utils|presets)\//.test(f));

  // group source files into items: file (relative to src) -> item key
  const groupOf = (f: string): { key: string; kind: Kind } => {
    const [top, ...rest] = f.split("/");
    if (top === "utils") return { key: "utils", kind: "utils" };
    if (top === "presets") return { key: "presets", kind: "lib" };
    if (top === "primitives") return { key: rest[0]!, kind: "primitive" };
    return { key: rest.join("/").split(".")[0]!, kind: top === "blocks" ? "block" : "component" };
  };
  const groups = new Map<string, { kind: Kind; files: string[] }>();
  const fileToKey = new Map<string, string>();
  for (const f of files) {
    const g = groupOf(f);
    const k = `${g.kind}:${g.key}`;
    if (!groups.has(k)) groups.set(k, { kind: g.kind, files: [] });
    groups.get(k)!.files.push(f);
    fileToKey.set(f, g.key);
  }
  // unique item names across kinds (verified once; fail loudly otherwise)
  const names = new Map<string, string>();
  for (const [k, g] of groups) {
    const n = k.split(":")[1]!;
    if (names.has(n)) throw new Error(`item name collision: ${n} (${names.get(n)} vs ${g.kind})`);
    names.set(n, g.kind);
  }

  const resolveImport = (from: string, spec: string): string | null => {
    if (!spec.startsWith(".")) return null;
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
    const cands = [base, ...[".ts", ".tsx", ".svelte", ".vue", ".types.ts"].map((e) => base + e), base + "/index.ts"];
    return cands.find((c) => fileToKey.has(c)) ?? null;
  };

  const typeOf: Record<Kind, RegType> = { utils: "registry:utils", lib: "registry:lib", primitive: "registry:ui", component: "registry:component", block: "registry:block" };
  const items: Item[] = [];
  for (const [k, g] of [...groups].sort((a, b) => cmp(a[0], b[0]))) {
    const name = k.split(":")[1]!;
    const fl: File[] = [];
    const deps = new Set<string>();
    const npm = new Set<string>();
    let main = "";
    for (const f of g.files.sort(cmp)) {
      const content = readFileSync(path.join(root, f), "utf8");
      fl.push({ path: f, target: f, content });
      if (EXT[rt].some((e) => f.endsWith(e)) && !main) main = content;
      for (const m of content.matchAll(/(?:from|import)\s+["']([^"']+)["']/g)) {
        const spec = m[1]!;
        if (spec.startsWith(".")) {
          const hit = resolveImport(f, spec);
          const dep = hit ? fileToKey.get(hit) : null;
          if (dep && dep !== name) deps.add(dep);
        } else if (!["svelte", "react", "vue", "react/jsx-runtime"].includes(spec) && !spec.startsWith("svelte/") && !spec.startsWith("vue/")) {
          npm.add(spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0]!);
        }
      }
    }
    if (g.kind === "utils") for (const d of Object.keys(pkg.dependencies ?? {})) npm.add(d);
    const bm = g.kind === "block" ? meta.get(name) : undefined;
    const fallback = g.kind === "utils" ? "cn, variants, expr and shared helpers used by every primitive" : `${titleOf(name)} ${g.kind}`;
    const category = g.kind === "block" ? bm?.theme ?? "general" : g.kind === "primitive" ? "primitives" : g.kind === "component" ? "components" : g.kind;
    items.push({
      name, type: typeOf[g.kind], title: titleOf(name),
      description: (bm?.docs || describe(main || fl[0]!.content, fallback)),
      runtime: rt, digest: VERSION,
      dependencies: [...npm].sort(cmp), devDependencies: [],
      registryDependencies: [...new Set([...deps, ...(g.kind === "utils" || name === "presets" ? [] : ["utils"])])].filter((d) => d !== name).sort(cmp),
      files: fl,
      meta: { kind: g.kind, category, ...(bm ? { group: bm.group } : {}), tags: [rt, g.kind] },
    });
  }
  return items;
}

/** folder under r/<runtime>/ where the CLI fetches an item of this type */
const folderOf = (t: RegType) => ({ "registry:ui": "components/ui", "registry:component": "components", "registry:block": "blocks", "registry:utils": "utils", "registry:lib": "lib" })[t];

function main() {
  const commit = git(["rev-parse", "HEAD"]);
  const commitDate = git(["show", "-s", "--format=%cI", "HEAD"]) || "1970-01-01T00:00:00.000Z";
  const dirty = git(["status", "--porcelain", "--", "packages", "xgen/specs"]) !== "";
  if (existsSync(OUT)) rmSync(OUT, { recursive: true });
  mkdirSync(OUT, { recursive: true });
  const meta = blockMeta();
  const manifest: any = { contractVersion: "2.0.0", version: VERSION, source: { repo: "ui8kit (private monorepo)", commit, dirty, commitDate }, runtimes: {} };
  const site: Record<string, any> = {};

  for (const rt of RUNTIMES) {
    const items = buildRuntime(rt, meta);
    const counts: Record<string, number> = {};
    const mItems: Record<string, any> = {};
    for (const it of items) {
      counts[it.meta.kind] = (counts[it.meta.kind] ?? 0) + 1;
      const dir = path.join(OUT, rt, folderOf(it.type));
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, `${it.name}.json`), json({ $schema: "https://ui.buildy.tw/schema/registry-item.json", ...it }));
      mItems[it.name] = { type: it.type, files: Object.fromEntries(it.files.map((f) => [f.target, { sha256: sha(f.content), bytes: Buffer.byteLength(f.content) }])) };
      const s = (site[it.name] ??= { name: it.name, title: it.title, kind: it.meta.kind, category: it.meta.category, group: it.meta.group ?? "", description: it.description, type: it.type, runtimes: {} });
      s.runtimes[rt] = { path: `${rt}/${folderOf(it.type)}/${it.name}.json`, files: it.files.map((f) => f.target), registryDependencies: it.registryDependencies, dependencies: it.dependencies };
    }
    // CLI index: GET {base}/index.json, base = r/<runtime>
    const index = {
      $schema: "https://ui.buildy.tw/schema/registry.json",
      components: items.map((i) => ({ name: i.name, type: i.type, title: i.title, description: i.description, dependencies: i.dependencies, registryDependencies: i.registryDependencies })),
      categories: ["lib", "utils", "ui", "components", "blocks"],
      version: VERSION, lastUpdated: commitDate, registry: "ui",
    };
    writeFileSync(path.join(OUT, rt, "index.json"), json(index));
    manifest.runtimes[rt] = { items: items.length, counts, entries: mItems };
  }
  writeFileSync(path.join(OUT, "manifest.json"), json(manifest));
  const list = Object.values(site).sort((a: any, b: any) => cmp(a.name, b.name));
  writeFileSync(path.join(OUT, "registry.json"), json({
    $schema: "https://ui.buildy.tw/schema/registry.json", contractVersion: "2.0.0", version: VERSION, sourceCommit: commit, lastUpdated: commitDate,
    runtimes: [...RUNTIMES], layout: "<runtime>/index.json + <runtime>/{components/ui,components,blocks,utils,lib}/<name>.json; use r/<runtime> as registryUrl",
    items: list,
  }));
  for (const rt of RUNTIMES) console.log(rt.padEnd(7), JSON.stringify(manifest.runtimes[rt].counts), "total", manifest.runtimes[rt].items);
  console.log("source", commit.slice(0, 12), dirty ? "(dirty)" : "", "->", path.relative(process.cwd(), OUT) || ".");
}
main();
