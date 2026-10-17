// Builds previews/static-code.json: the code of the four server-template runtimes of the source monorepo (Go templ, Twig, Jinja2, Latte),
// read from packages/<rt>/ui at the source commit, for the code panels of the site. Since 2026-10-17 these runtimes are also in r/
// (registry/src/template-runtimes.ts) and item pages use r/; this file still feeds the template pages (no page-level template there).
//
//   bun run static-code:build -- --src /path/to/source      # or UI8KIT_SRC; also run at the end of templates:build
//
// Per item of r/registry.json and runtime: primitive -> the brick templates and recipes of ui/<name>/; block or component -> the organism
// template blocks/<name>.<ext> and the recipes and presets it reads; utils -> the helpers; lib (presets) -> blocks/presets/<name>.json.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

export interface StaticRuntime { label: string; ext: string }
export const STATIC_RUNTIMES: Record<string, StaticRuntime> = {
  templ: { label: "templ", ext: ".templ" },
  twig: { label: "Twig", ext: ".html.twig" },
  jinja2: { label: "Jinja2", ext: ".html.j2" },
  latte: { label: "Latte", ext: ".latte" },
};
/** a file larger than this is listed by name only (the lucide glyph registry) */
const MAX_FILE = 64 * 1024;

const helperFiles = (dir: string, rt: string): string[] => {
  const pick = (sub: string, ok: (f: string) => boolean) => readdirSync(path.join(dir, sub)).filter(ok).sort().map((f) => `${sub}/${f}`);
  if (rt === "templ") return pick("utils", (f) => f.endsWith(".go") && !f.endsWith("_test.go"));
  if (rt === "jinja2") return pick("py/ui8kit_jinja", (f) => f.endsWith(".py"));
  return pick("php", (f) => f.endsWith(".php"));
};

export function buildStaticCode(src: string, out: string, registry: any): string[] {
  const problems: string[] = [];
  const commit = execFileSync("git", ["-C", src, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const runtimes: Record<string, any> = {};
  for (const [rt, def] of Object.entries(STATIC_RUNTIMES)) {
    const dir = path.join(src, "packages", rt, "ui");
    const file = (rel: string) => {
      const abs = path.join(dir, rel);
      const size = statSync(abs).size;
      return size > MAX_FILE ? { name: rel, content: "", omitted: size } : { name: rel, content: readFileSync(abs, "utf8") };
    };
    const reads = (rel: string): string[] => {
      const s = readFileSync(path.join(dir, rel), "utf8");
      return [...new Set([...s.matchAll(/blocks\/(?:recipes|presets)\/[\w.-]+\.json/g)].map((m) => m[0]))].sort().filter((f) => existsSync(path.join(dir, f)));
    };
    const helpers = helperFiles(dir, rt);
    const items: Record<string, any[]> = {};
    for (const it of registry.items as any[]) {
      let files: string[] = [];
      if (it.kind === "primitive") {
        const d = `ui/${it.name}`;
        if (!existsSync(path.join(dir, d))) continue; // a primitive the template runtimes do not have (slot: React asChild)
        files = readdirSync(path.join(dir, d)).filter((f) => f.endsWith(def.ext) || f.endsWith(".json") || (rt === "templ" && f.endsWith("_gen.go"))).sort().map((f) => `${d}/${f}`);
      } else if (it.kind === "block" || it.kind === "component") {
        const f = `blocks/${it.name}${def.ext}`;
        if (!existsSync(path.join(dir, f))) { problems.push(`${rt}: no ${f}`); continue; }
        files = [f, ...reads(f)];
      } else if (it.kind === "utils") files = helpers;
      else if (it.kind === "lib") {
        files = readdirSync(path.join(dir, "blocks", "presets")).filter((f) => f.endsWith(".json")).sort().map((f) => `blocks/presets/${f}`);
      }
      if (files.length) items[it.name] = files.map(file);
    }
    runtimes[rt] = { label: def.label, helpers, items };
  }
  writeFileSync(out, JSON.stringify({ sourceCommit: commit, runtimes }, null, 1) + "\n");
  const n = Object.values(runtimes).map((r: any) => Object.keys(r.items).length);
  console.log(`static code: ${n.join(" / ")} items (templ / twig / jinja2 / latte) at ${commit.slice(0, 7)}`);
  return problems;
}

if (import.meta.main) {
  const i = process.argv.indexOf("--src");
  const repoRoot = path.resolve(import.meta.dir, "../..");
  const src = path.resolve(i > 0 ? process.argv[i + 1]! : process.env.UI8KIT_SRC ?? path.join(repoRoot, "..", "source"));
  const problems = buildStaticCode(src, path.join(repoRoot, "previews", "static-code.json"), JSON.parse(readFileSync(path.join(repoRoot, "r", "registry.json"), "utf8")));
  if (problems.length) console.log("problems:\n" + problems.join("\n"));
}
