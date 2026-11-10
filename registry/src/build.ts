// Builds r/ (registry for every runtime) from the generated packages of the private source monorepo:
// the TypeScript runtimes from packages/<svelte|react|vue|solid>/ui/src, the server-template runtimes (templ, Twig, Latte, Jinja2)
// from packages/<rt>/ui (see template-runtimes.ts). Item names and kinds are those of the TypeScript runtimes.
//
//   bun run registry:build                       # source from $UI8KIT_SRC or ../source next to this repo
//   bun run registry:build -- --src /path/to/source --out r --version 0.1.0
//
// Deterministic: sorted keys and items, no timestamps (lastUpdated = commit date of the source), sha256 per file.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildTemplateRuntime, TEMPLATE_RUNTIMES, type Kind } from "./template-runtimes";
import { rewriteKitRefs } from "./kit-paths";
import { cleanGenerated } from "./clean-out";
import { publishVariants } from "./variants";
import { publishProps, variantOrganisms } from "./props";

export const TS_RUNTIMES = ["svelte", "react", "vue", "solid"] as const;
export const RUNTIMES = [...TS_RUNTIMES, ...TEMPLATE_RUNTIMES] as const;
export type TsRuntime = (typeof TS_RUNTIMES)[number];
export type Runtime = (typeof RUNTIMES)[number];

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
const SRC = path.resolve(arg("src", "UI8KIT_SRC", path.join(repoRoot, "..", "source")));
const OUT = path.resolve(arg("out", "UI8KIT_OUT", path.join(repoRoot, "r")));
const VERSION = arg("version", "UI8KIT_REGISTRY_VERSION", JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8")).version);

// JSON Schemas served at https://registry.buildy.tw/schema/ (r/schema/, copied from registry/schema/)
export const SCHEMA_BASE = "https://registry.buildy.tw/schema";
const SCHEMA_SRC = path.join(repoRoot, "registry", "schema");

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

/** block name -> {theme, group, docs} from packages/compose-gen/specs/blocks */
function blockMeta(): Map<string, { theme: string; group: string; docs: string }> {
  const dir = path.join(SRC, "packages/compose-gen/specs/blocks");
  const map = new Map<string, { theme: string; group: string; docs: string }>();
  if (!existsSync(dir)) throw new Error(`missing ${dir}`);
  for (const f of readdirSync(dir).sort(cmp)) {
    if (!f.endsWith(".json")) continue;
    const j = JSON.parse(readFileSync(path.join(dir, f), "utf8"));
    const meta = { theme: j.theme ?? "general", group: j.group ?? "misc", docs: j.docs ?? "" };
    for (const o of [j.organism, j.alt?.organism, ...(j.organisms ?? [])]) if (o) map.set(kebab(o), meta);
  }
  return map;
}

const EXT: Record<TsRuntime, string[]> = { svelte: [".svelte"], react: [".tsx"], vue: [".vue"], solid: [".tsx"] };

/**
 * Source layout (source monorepo after the xgen exit):
 *   packages/kit/<rt>/src/{ui,utils}                     UI8Kit 3 primitives, installed there by the ui8kit CLI from @ui8kit/registry
 *   packages/kit-compose/<rt>/src/{compose,components,blocks,icons,presets,utils,styles}   compositions (recipes + organisms)
 * Installed layout under the app `dir` (file targets):
 *   kit/ui/<name>/*, kit/utils/*      the primitives, verbatim
 *   compose/*, components/*, blocks/*, icons/*, presets/*, utils/*, styles/*   the compositions; their imports of
 *   `../../../../kit/<rt>/src/…` are rewritten to the relative path of the installed kit/ folder.
 * Items: `utils` (kit utils + compose utils + styles), `presets` (lib), `recipes` (lib, compose/recipes.ts), `compose` (lib, the
 * compose/index.ts barrel the organisms import), one `kit-<name>` per primitive folder, one item per compose wrapper (registry:ui,
 * `add select`), per component and per block (with their *.types.ts / *.assets.ts).
 */
export function tsSourceFiles(rt: TsRuntime): { files: { src: string; target: string }[]; read: (src: string) => string } {
  const kit = path.join(SRC, "packages/kit", rt, "src");
  const comp = path.join(SRC, "packages/kit-compose", rt, "src");
  for (const d of [kit, comp]) if (!existsSync(d)) throw new Error(`missing ${d}`);
  const files: { src: string; target: string }[] = [];
  for (const f of walk(kit)) if (/^(ui|utils)\//.test(f)) files.push({ src: path.join(kit, f), target: `kit/${f}` });
  for (const f of walk(comp)) if (/^(compose|components|blocks|icons|presets|utils|styles)\//.test(f)) files.push({ src: path.join(comp, f), target: f });
  const read = (src: string) => {
    const c = readFileSync(src, "utf8");
    if (!src.startsWith(comp + path.sep)) return c;
    return rewriteKitRefs(c, path.relative(comp, src).split(path.sep).join("/"), rt);
  };
  return { files: files.sort((a, b) => cmp(a.target, b.target)), read };
}

function buildRuntime(rt: TsRuntime, meta: ReturnType<typeof blockMeta>): Item[] {
  const { files: srcFiles, read } = tsSourceFiles(rt);
  const pkg = JSON.parse(readFileSync(path.join(SRC, "packages/kit-compose", rt, "package.json"), "utf8"));
  const files = srcFiles.map((f) => f.target);
  const srcOf = new Map(srcFiles.map((f) => [f.target, f.src]));

  // group files into items: target -> item key
  const groupOf = (f: string): { key: string; kind: Kind } => {
    const [top, ...rest] = f.split("/");
    if (top === "kit") return rest[0] === "utils" ? { key: "utils", kind: "utils" } : { key: `kit-${rest[1]!}`, kind: "primitive" };
    if (top === "utils" || top === "styles") return { key: "utils", kind: "utils" };
    if (top === "presets") return { key: "presets", kind: "lib" };
    if (top === "icons") return { key: "lucide-icon", kind: "primitive" };
    if (top === "compose") {
      const n = kebab(rest.join("/").split(".")[0]!);
      if (n === "recipes") return { key: "recipes", kind: "lib" };
      if (n === "index") return { key: "compose", kind: "primitive" };
      return { key: n, kind: "primitive" };
    }
    return { key: rest.join("/").split(".")[0]!, kind: top === "blocks" ? "block" : "component" };
  };
  const groups = new Map<string, { kind: Kind; files: string[] }>();
  const fileToKey = new Map<string, string>();
  for (const f of files) {
    const g = groupOf(f);
    const prev = groups.get(g.key);
    if (prev && prev.kind !== g.kind) throw new Error(`${rt}: item name collision: ${g.key} (${prev.kind} vs ${g.kind})`);
    if (!prev) groups.set(g.key, { kind: g.kind, files: [] });
    groups.get(g.key)!.files.push(f);
    fileToKey.set(f, g.key);
  }

  const resolveImport = (from: string, spec: string): string | null => {
    if (!spec.startsWith(".")) return null;
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
    const cands = [base, ...[".ts", ".tsx", ".svelte", ".vue", ".types.ts", ".js"].map((e) => base + e), base + "/index.ts"];
    return cands.find((c) => fileToKey.has(c)) ?? null;
  };

  const typeOf: Record<Kind, RegType> = { utils: "registry:utils", lib: "registry:lib", primitive: "registry:ui", component: "registry:component", block: "registry:block" };
  const items: Item[] = [];
  const problems: string[] = [];
  for (const [name, g] of [...groups].sort((a, b) => cmp(a[0], b[0]))) {
    const fl: File[] = [];
    const deps = new Set<string>();
    const npm = new Set<string>();
    let main = "";
    for (const f of g.files.sort(cmp)) {
      const content = read(srcOf.get(f)!);
      fl.push({ path: f, target: f, content });
      if (EXT[rt].some((e) => f.endsWith(e)) && !main && !f.startsWith("kit/")) main = content;
      if (f.endsWith(".css")) continue;
      for (const m of content.matchAll(/(?:from|import)\s+["']([^"']+)["']/g)) {
        const spec = m[1]!;
        if (spec.startsWith(".")) {
          const hit = resolveImport(f, spec);
          if (!hit) { if (!f.startsWith("kit/")) problems.push(`${rt}: ${f}: unresolved import ${spec}`); continue; }
          const dep = fileToKey.get(hit)!;
          if (dep !== name) deps.add(dep);
        } else if (!["svelte", "react", "vue", "react/jsx-runtime", "solid-js"].includes(spec) && !spec.startsWith("svelte/") && !spec.startsWith("vue/") && !spec.startsWith("solid-js/") && !spec.startsWith("@/")) {
          npm.add(spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0]!);
        }
      }
    }
    if (g.kind === "utils") for (const d of Object.keys(pkg.dependencies ?? {})) npm.add(d);
    const bm = g.kind === "block" ? meta.get(name) : undefined;
    const fallback =
      g.kind === "utils" ? "cn, variants, expr, safe URLs and the shared helpers of the primitives and compositions (plus the theme CSS in styles/)"
      : name === "recipes" ? "Recipes (Tailwind classes per variant/size/state) of the composed primitives"
      : name === "compose" ? "Barrel of the composed primitives (compose/index), imported by components and blocks"
      : name.startsWith("kit-") ? `UI8Kit 3 ${titleOf(name.slice(4))} primitive (unstyled), from @ui8kit/registry`
      : `${titleOf(name)} ${g.kind}`;
    const category = g.kind === "block" ? bm?.theme ?? "general" : g.kind === "primitive" ? (name.startsWith("kit-") ? "kit" : "primitives") : g.kind === "component" ? "components" : g.kind;
    items.push({
      name, type: typeOf[g.kind], title: titleOf(name),
      description: (bm?.docs || (name.startsWith("kit-") || g.kind === "lib" || g.kind === "utils" ? fallback : describe(main || fl[0]!.content, fallback))),
      runtime: rt, digest: VERSION,
      dependencies: [...npm].sort(cmp), devDependencies: [],
      registryDependencies: [...new Set([...deps, ...(g.kind === "utils" ? [] : ["utils"])])].filter((d) => d !== name).sort(cmp),
      files: fl,
      meta: { kind: g.kind, category, ...(bm ? { group: bm.group } : {}), tags: [rt, g.kind] },
    });
  }
  if (problems.length) { console.error(problems.join("\n")); throw new Error(`${rt}: ${problems.length} problem(s)`); }
  return items;
}

/** folder under r/<runtime>/ where the CLI fetches an item of this type */
const folderOf = (t: RegType) => ({ "registry:ui": "components/ui", "registry:component": "components", "registry:block": "blocks", "registry:utils": "utils", "registry:lib": "lib" })[t];

function main() {
  const commit = git(["rev-parse", "HEAD"]);
  const commitDate = git(["show", "-s", "--format=%cI", "HEAD"]) || "1970-01-01T00:00:00.000Z";
  const dirty = git(["status", "--porcelain", "--", "packages/kit", "packages/kit-compose", "packages/compose-gen/specs"]) !== "";
  // clean only what this build writes (runtime dirs, schema/, manifest.json, registry.json); foreign entries
  // such as r/authfly (separate Authfly registry) and the hand-written r/vercel.json stay untouched
  cleanGenerated(OUT, RUNTIMES);
  // WP FastY builder registries (r/<latte|twig>/wpfasty/, own format wpfasty-catalog@2, immutable versions) are not
  // built here: their source of truth is builder-registry/ (scripts/wpfasty-registry.sh); keep them in r/.
  for (const rt of ["latte", "twig"]) {
    const src = path.join(repoRoot, "builder-registry", rt, "wpfasty");
    if (existsSync(src)) cpSync(src, path.join(OUT, rt, "wpfasty"), { recursive: true });
  }
  const meta = blockMeta();
  const manifest: any = { contractVersion: "2.0.0", version: VERSION, source: { repo: "private source monorepo", commit, dirty, commitDate }, runtimes: {} };
  const site: Record<string, any> = {};

  const built = new Map<Runtime, Item[]>();
  for (const rt of TS_RUNTIMES) built.set(rt, buildRuntime(rt, meta));
  // the template runtimes reuse name, kind, title, description and category of the TypeScript items
  const ref = new Map(built.get("react")!.map((i) => [i.name, i]));
  const kinds = new Map<string, Kind>([...ref.values()].map((i) => [i.name, i.meta.kind]));
  const problems: string[] = [];
  for (const rt of TEMPLATE_RUNTIMES) {
    const r = buildTemplateRuntime(SRC, rt, kinds);
    problems.push(...r.problems);
    built.set(rt, r.items.map((t) => {
      const base = ref.get(t.name)!;
      const description = t.name === "utils" ? `${rt} helpers (class merge, variants, attributes) used by every template` : t.name === "presets" ? `Presets and recipes (JSON) read by the ${rt} block templates` : base.description;
      return {
        name: t.name, type: base.type, title: base.title, description, runtime: rt, digest: VERSION,
        dependencies: [], devDependencies: [], registryDependencies: t.registryDependencies,
        files: t.files.map((f) => ({ path: f.path, target: f.path, content: f.content })),
        meta: { ...base.meta, tags: [rt, t.kind] },
      };
    }));
  }
  if (problems.length) { console.error(problems.join("\n")); throw new Error(`${problems.length} template runtime problem(s)`); }

  for (const rt of RUNTIMES) {
    const items = built.get(rt)!;
    const counts: Record<string, number> = {};
    const mItems: Record<string, any> = {};
    for (const it of items) {
      counts[it.meta.kind] = (counts[it.meta.kind] ?? 0) + 1;
      const dir = path.join(OUT, rt, folderOf(it.type));
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, `${it.name}.json`), json({ $schema: `${SCHEMA_BASE}/registry-item.json`, ...it }));
      mItems[it.name] = { type: it.type, files: Object.fromEntries(it.files.map((f) => [f.target, { sha256: sha(f.content), bytes: Buffer.byteLength(f.content) }])) };
      const s = (site[it.name] ??= { name: it.name, title: it.title, kind: it.meta.kind, category: it.meta.category, group: it.meta.group ?? "", description: it.description, type: it.type, runtimes: {} });
      s.runtimes[rt] = { path: `${rt}/${folderOf(it.type)}/${it.name}.json`, files: it.files.map((f) => f.target), registryDependencies: it.registryDependencies, dependencies: it.dependencies };
    }
    // CLI index: GET {base}/index.json, base = r/<runtime>
    const index = {
      $schema: `${SCHEMA_BASE}/registry.json`,
      components: items.map((i) => ({ name: i.name, type: i.type, title: i.title, description: i.description, dependencies: i.dependencies, registryDependencies: i.registryDependencies })),
      categories: ["lib", "utils", "ui", "components", "blocks"],
      version: VERSION, lastUpdated: commitDate, registry: "ui",
    };
    writeFileSync(path.join(OUT, rt, "index.json"), json(index));
    manifest.runtimes[rt] = { items: items.length, counts, entries: mItems };
  }
  // Stock variant presets: r/variants/v0.json (+ .sha256), every item must be a registry item in every runtime
  const everywhere = new Set([...ref.keys()].filter((n) => RUNTIMES.every((rt) => built.get(rt)!.some((i) => i.name === n))));
  const variants = publishVariants(SRC, OUT, everywhere);
  manifest.variants = variants;
  // props schemas: r/props/v0.json (+ .sha256), same names rule, and every variants item has a schema of the same organism
  const props = publishProps(SRC, OUT, everywhere, variantOrganisms(readFileSync(path.join(OUT, variants.path))));
  manifest.props = props;
  writeFileSync(path.join(OUT, "manifest.json"), json(manifest));
  mkdirSync(path.join(OUT, "schema"), { recursive: true });
  for (const f of readdirSync(SCHEMA_SRC).sort(cmp)) cpSync(path.join(SCHEMA_SRC, f), path.join(OUT, "schema", f));
  const list = Object.values(site).sort((a: any, b: any) => cmp(a.name, b.name));
  writeFileSync(path.join(OUT, "registry.json"), json({
    $schema: `${SCHEMA_BASE}/registry.json`, contractVersion: "2.0.0", version: VERSION, sourceCommit: commit, lastUpdated: commitDate,
    runtimes: [...RUNTIMES], layout: "<runtime>/index.json + <runtime>/{components/ui,components,blocks,utils,lib}/<name>.json; use r/<runtime> as registryUrl",
    variants: { path: variants.path, sha256: variants.sha256, digest: variants.digest, version: variants.version },
    props: { path: props.path, sha256: props.sha256, digest: props.digest, version: props.version },
    items: list,
  }));
  for (const rt of RUNTIMES) console.log(rt.padEnd(7), JSON.stringify(manifest.runtimes[rt].counts), "total", manifest.runtimes[rt].items);
  console.log("variants", variants.path, variants.items, "items", variants.variants, "variants", "sha256", variants.sha256);
  console.log("props", props.path, props.items, "items", "sha256", props.sha256);
  console.log("source", commit.slice(0, 12), dirty ? "(dirty)" : "", "->", path.relative(process.cwd(), OUT) || ".");
}
main();
