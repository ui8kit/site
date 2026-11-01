// Items of the server-template runtimes (Go templ, Twig, Latte, Jinja2) for r/<runtime>/, read from the source monorepo:
//   packages/kit/<rt>/src          UI8Kit 3 primitives (ui/<name>/, helpers: templ utils/, Twig/Latte runtime/, Jinja2 ui8kit_jinja/)
//   packages/kit-compose/<rt>/src  compositions: compose/ (wrappers + recipes), blocks/ (components, blocks, presets, recipes),
//                                  icons/, organism helpers (templ orgutils/, Twig/Latte organisms/, Jinja2 compose_organisms/)
// Installed layout = one template root (Go module root / Twig, Latte, Jinja2 loader root) with ui/, compose/, blocks/, icons/ and the
// helpers, so include paths ('ui/select/Select.html.twig', 'compose/Select.html.twig', 'blocks/media-frame.latte') resolve unchanged.
// templ: the compositions' module path github.com/codegen-x/ui8kit/packages/kit-compose/templ/src is rewritten to the kit module
// path github.com/ui8kit/codegen/generated/templ (one Go module: go.mod ships with utils).
// One item per name of the TypeScript runtimes when the runtime has it:
//   kit-<name>         -> ui/<name>/*                       compose wrapper (registry:ui) -> compose/<Pascal|kebab>.<ext>
//   block / component  -> blocks/<name><ext>                utils -> kit helpers + organism helpers (+ go.mod/go.sum, composer.json,
//   presets (lib)      -> blocks/presets, blocks/recipes                                       requirements.txt)
//   recipes (lib)      -> compose/compose.json + compose support code (Compose*.php, compose_env.py, compose.go, lucide.go)
//   lucide-icon        -> compose wrapper + icons/*
// registryDependencies come from the template references (includes, Go imports and symbols, recipe/preset reads).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

export const TEMPLATE_RUNTIMES = ["templ", "twig", "latte", "jinja2"] as const;
export type TemplateRuntime = (typeof TEMPLATE_RUNTIMES)[number];

export const TEMPLATE_EXT: Record<TemplateRuntime, string> = { templ: ".templ", twig: ".html.twig", latte: ".latte", jinja2: ".html.j2" };

export type Kind = "utils" | "lib" | "primitive" | "component" | "block";
export interface TemplateItemSource {
  name: string;
  kind: Kind;
  files: { path: string; content: string }[];
  registryDependencies: string[];
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const kebab = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/_/g, "-").toLowerCase();
export const KIT_MODULE = "github.com/ui8kit/codegen/generated/templ";
const COMPOSE_MODULE = "github.com/codegen-x/ui8kit/packages/kit-compose/templ/src";

function walk(dir: string, base = dir): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir).sort(cmp)) {
    if (e === "__pycache__") continue;
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p, base));
    else out.push(path.relative(base, p).split(path.sep).join("/"));
  }
  return out;
}

const COMPOSER: Record<"twig" | "latte", string> = {
  twig: JSON.stringify({ name: "ui8kit/twig-kit", description: "UI8Kit Twig primitives and compositions (installed by the ui8kit CLI)", require: { php: ">=8.2", "twig/twig": "^3.0" },
    autoload: { "psr-4": { "UI8Kit\\Twig\\": "runtime/", "CodegenX\\Compose\\Twig\\": "compose/", "CodegenX\\Organisms\\Twig\\": "organisms/" } } }, null, 2) + "\n",
  latte: JSON.stringify({ name: "ui8kit/latte-kit", description: "UI8Kit Latte primitives and compositions (installed by the ui8kit CLI)", require: { php: ">=8.2", "latte/latte": "^3.0" },
    autoload: { "psr-4": { "UI8Kit\\Latte\\": "runtime/", "CodegenX\\Compose\\Latte\\": "compose/", "CodegenX\\Organisms\\Latte\\": "organisms/" } } }, null, 2) + "\n",
};

/** Per-name kind from the TypeScript runtimes; returns the template items of one runtime (sorted by name). */
export function buildTemplateRuntime(src: string, rt: TemplateRuntime, kinds: Map<string, Kind>): { items: TemplateItemSource[]; problems: string[] } {
  const kitRoot = path.join(src, "packages/kit", rt, "src");
  const compRoot = path.join(src, "packages/kit-compose", rt);
  const comp = path.join(compRoot, "src");
  for (const d of [kitRoot, comp]) if (!existsSync(d)) throw new Error(`missing ${d}`);
  const ext = TEMPLATE_EXT[rt];
  const problems: string[] = [];

  // target -> content
  const files = new Map<string, string>();
  const rewrite = (c: string) => (rt === "templ" ? c.split(COMPOSE_MODULE + "/").join(KIT_MODULE + "/") : c);
  for (const f of walk(kitRoot)) files.set(f, readFileSync(path.join(kitRoot, f), "utf8"));
  for (const f of walk(comp)) {
    if (files.has(f)) { problems.push(`${rt}: ${f} exists in kit and kit-compose`); continue; }
    files.set(f, rewrite(readFileSync(path.join(comp, f), "utf8")));
  }
  if (rt === "templ") {
    files.set("go.mod", readFileSync(path.join(compRoot, "kitmod/go.mod"), "utf8").replace(/^\/\/.*\n/gm, "").replace(/^\n+/, ""));
    files.set("go.sum", readFileSync(path.join(compRoot, "go.sum"), "utf8"));
  }
  if (rt === "twig" || rt === "latte") files.set("composer.json", COMPOSER[rt]);
  if (rt === "jinja2") files.set("requirements.txt", "Jinja2>=3.1,<4\nMarkupSafe>=2.1\n");

  // file -> item
  const pascalToName = (f: string) => kebab(path.basename(f).replace(ext, "").replace(/\.templ$/, ""));
  const groupOf = (f: string): string | null => {
    const [top, a] = f.split("/");
    if (["utils", "runtime", "ui8kit_jinja", "orgutils", "organisms", "compose_organisms"].includes(top!) || ["go.mod", "go.sum", "composer.json", "requirements.txt"].includes(f)) return "utils";
    if (top === "ui") return `kit-${a}`;
    if (top === "icons") return "lucide-icon";
    if (top === "blocks") {
      if (a === "presets" || a === "recipes" || f === "blocks/embed.go") return "presets";
      if (f.endsWith(ext)) return pascalToName(f);
      return null;
    }
    if (top === "compose") return f.endsWith(ext) ? pascalToName(f) : "recipes";
    return null;
  };
  const sources = new Map<string, { kind: Kind; files: string[] }>();
  for (const f of [...files.keys()].sort(cmp)) {
    if (rt === "templ" && f.endsWith("_templ.go")) continue;
    const name = groupOf(f);
    if (!name) { problems.push(`${rt}: ${f} belongs to no item`); continue; }
    const kind = name === "utils" ? "utils" : name === "presets" || name === "recipes" ? "lib" : kinds.get(name);
    if (!kind) { problems.push(`${rt}: ${f} -> ${name} has no item in the TypeScript runtimes`); continue; }
    if (!sources.has(name)) sources.set(name, { kind, files: [] });
    sources.get(name)!.files.push(f);
  }

  // templ: Go symbols per package (compose, blocks) -> owning item
  const owner = new Map<string, string>(); // "<pkg>.<Symbol>" -> item
  if (rt === "templ") {
    for (const [name, s] of sources) {
      for (const f of s.files.filter((x) => /\.(templ|go)$/.test(x))) {
        const pkg = f.split("/")[0]!;
        if (pkg !== "compose" && pkg !== "blocks" && pkg !== "icons") continue;
        for (const m of files.get(f)!.matchAll(/^(?:templ|func|type|var|const)\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)/gm)) {
          const k = `${pkg}.${m[1]}`;
          if (!owner.has(k) || name === "recipes") owner.set(k, owner.get(k) && name === "recipes" ? owner.get(k)! : name);
        }
      }
    }
  }

  const items: TemplateItemSource[] = [];
  for (const [name, s] of [...sources].sort((a, b) => cmp(a[0], b[0]))) {
    const deps = new Set<string>();
    for (const f of s.kind === "utils" ? [] : s.files) {
      const c = files.get(f)!;
      if (rt === "templ") {
        if (!/\.(templ|go)$/.test(f)) continue;
        const pkg = f.split("/")[0]!;
        for (const m of c.matchAll(/"([^"\s]+)"/g)) {
          const spec = m[1]!;
          if (!spec.startsWith(KIT_MODULE + "/")) continue;
          const rel = spec.slice(KIT_MODULE.length + 1);
          if (rel === "utils" || rel === "orgutils") deps.add("utils");
          else if (rel.startsWith("ui/")) deps.add(`kit-${rel.slice(3)}`);
          else if (rel === "icons") deps.add("lucide-icon");
          else if (rel !== "compose" && rel !== "blocks") problems.push(`${rt}/${name}: unknown module import ${spec}`);
        }
        const body = c.replace(/\/\/.*$/gm, "").replace(/"(?:[^"\\\n]|\\.)*"/g, '""').replace(/`[^`]*`/g, "``");
        for (const m of body.matchAll(/(?<![\w])(?:(compose|blocks|icons)\.)?([A-Za-z_]\w*)\b(\s*[({])?/g)) {
          const q = m[1], id = m[2]!;
          if (!q && (m.index! > 0 && body[m.index! - 1] === ".")) continue;
          const o = owner.get(`${q ?? pkg}.${id}`);
          if (!o || o === name) continue;
          if (q || m[3] || id.endsWith("Props") || /^[a-z]/.test(id)) deps.add(o);
        }
      } else {
        // root-relative ('ui/box/Box.html.twig') or file-relative (Latte: '../ui/box/Box.latte', './x.latte') references
        for (const q of c.matchAll(/['"]((?:\.{1,2}\/)*(?:ui|compose|blocks|icons)\/[\w.\/-]+|\.\/[\w.-]+)['"]/g)) {
          const ref = q[1]!.startsWith(".") ? path.posix.normalize(path.posix.join(path.posix.dirname(f), q[1]!)) : q[1]!;
          const m = /^(ui|compose|blocks|icons)\/([\w.-]+)(\/[\w.-]+)?$/.exec(ref);
          if (!m) continue;
          const [, top, seg, rest] = m;
          if (top === "ui") deps.add(`kit-${seg}`);
          else if (top === "icons") deps.add("lucide-icon");
          else if (top === "compose") deps.add(seg === "compose.json" ? "recipes" : pascalToName(seg!));
          else if (seg === "recipes" || seg === "presets") deps.add("presets");
          else if (!rest) deps.add(seg!.endsWith(ext) ? seg!.slice(0, -ext.length) : seg!);
        }
      }
    }
    if (s.kind !== "utils") deps.add("utils");
    // compose wrappers read their recipe (compose.json) through the compose helpers
    if (s.files.some((f) => f.startsWith("compose/")) && name !== "recipes") deps.add("recipes");
    deps.delete(name);
    for (const d of deps) if (!sources.has(d)) problems.push(`${rt}/${name}: dependency ${d} is not an item`);
    items.push({ name, kind: s.kind, files: s.files.map((p) => ({ path: p, content: files.get(p)! })), registryDependencies: [...deps].filter((d) => sources.has(d)).sort(cmp) });
  }
  return { items, problems };
}
