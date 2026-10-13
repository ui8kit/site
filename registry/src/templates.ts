// Builds previews/templates/ (the Templates tab) from the private source monorepo at the commit of the registry (r/registry.json sourceCommit):
//
//   bun run templates:build -- --src /path/to/source      # or UI8KIT_SRC; the monorepo needs `bun install` once
//
// A template is a theme app of the monorepo (xgen theme screens): a set of pages, each a lead block and a list of blocks in fixed variants,
// framed by a top bar and a footer. Per page: the static preview (the React page of host-react rendered with react-dom/server on the placeholder
// content, no iframe, no runtime), the page source per runtime (host-svelte, host-react, host-vue), and the registry blocks it uses (the install
// command). Deterministic output: previews/templates/index.json and previews/templates/<app>/<page>.html.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const arg = (n: string, env: string, d: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? process.argv[i + 1]! : process.env[env] ?? d;
};
const repoRoot = path.resolve(import.meta.dir, "../..");
const SRC = path.resolve(arg("src", "UI8KIT_SRC", path.join(repoRoot, "..", "source")));
const OUT = path.join(repoRoot, "previews", "templates");
const PH_OUT = path.join(repoRoot, "previews", "ph");
const rj = (...p: string[]) => JSON.parse(readFileSync(path.join(...p), "utf8"));
const kebab = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
const pascal = (s: string) => s.replace(/(^|-)(\w)/g, (_m, _d, c: string) => c.toUpperCase());

const reg = rj(repoRoot, "r/registry.json");
const regNames = new Set((reg.items as any[]).map((i) => i.name));
const req = createRequire(path.join(SRC, "package.json"));
const React: any = await import(req.resolve("react"));
const { renderToStaticMarkup } = (await import(req.resolve("react-dom/server"))) as any;
const { ui } = (await import(path.join(SRC, "packages/shared/app/src/content.ts"))) as any;
const { themeApps } = (await import(path.join(SRC, "xgen/screens/src/authoring/screens/themes.ts"))) as any;
console.error = () => {};

// the same post-processing as previews.ts: shared placeholder pictures, links that go nowhere, h1 -> h2 (the site page owns the h1)
const PH = new Map<string, string>();
function finish(html: string): string {
  html = html.replace(/data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+/g, (uri) => {
    const h = createHash("sha256").update(uri).digest("hex").slice(0, 8);
    PH.set(h, Buffer.from(uri.split(",")[1]!, "base64").toString("utf8"));
    return `/assets/ph/${h}.svg`;
  });
  html = html.replace(/href="(?:#|tel:|mailto:)[^"]*"/g, 'href="#"');
  html = html.replace(/<link rel="preload"[^>]*\/?>/g, "");
  html = html.replace(/src="(?![a-z]+:|\/assets\/)[^"]*\.(?:png|jpe?g|webp|gif|svg)"/g, 'src="/assets/ph/placeholder.svg"');
  html = html.replace(/<h1(?=[\s>])/g, "<h2").replace(/<\/h1>/g, "</h2>");
  return html;
}

const blockSpec: Record<string, any> = {};
for (const f of readdirSync(path.join(SRC, "xgen/specs/blocks"))) { const b = rj(SRC, "xgen/specs/blocks", f); blockSpec[f.slice(0, -5)] = b; }
const regOf = (key: string): string | null => { const b = blockSpec[key]; const n = b ? kebab(b.organism) : null; return n && regNames.has(n) ? n : null; };
const EXT: Record<string, string> = { svelte: "svelte", react: "tsx", vue: "vue" };
const at = (o: any, p: string) => p.split(".").reduce((x, k) => x?.[k], o);

const problems: string[] = [];
const apps: any[] = [];
rmSync(OUT, { recursive: true, force: true });
for (const app of themeApps as any[]) {
  const spec = rj(SRC, "xgen/specs/screens", `theme-${app.name}.json`);
  const screen = spec.name as string;
  const key = app.name.replace(/-(\w)/g, (_: string, c: string) => c.toUpperCase());
  const frame = [...spec.frame.before, ...spec.frame.after].map((u: any) => u.block as string);
  const pages: any[] = [];
  for (const r of spec.routes as any[]) {
    const area = r.area as string;
    const comp = `${pascal(area)}Page`;
    const uses: string[] = (spec.areas[area] as any[]).map((u) => u.block);
    const blocks = [...new Set([...frame.slice(0, 1), ...uses, ...frame.slice(1)].map(regOf).filter((x): x is string => !!x))];
    for (const u of new Set([...frame, ...uses])) if (!regOf(u)) problems.push(`${app.name}/${area}: block ${u} is not in the registry`);
    const code: Record<string, { name: string; content: string }> = {};
    for (const rt of ["svelte", "react", "vue"]) {
      const f = path.join(SRC, `apps/host-${rt}/xgen/screens/${screen}/${comp}.${EXT[rt]}`);
      if (existsSync(f)) code[rt] = { name: `${comp}.${EXT[rt]}`, content: readFileSync(f, "utf8") };
      else problems.push(`${app.name}/${area}: no ${rt} page`);
    }
    let preview = "";
    try {
      const mod: any = await import(path.join(SRC, `apps/host-react/xgen/screens/${screen}/${comp}.tsx`));
      preview = finish(renderToStaticMarkup(React.createElement(mod[comp])));
      mkdirSync(path.join(OUT, app.name), { recursive: true });
      writeFileSync(path.join(OUT, app.name, area + ".html"), preview + "\n");
    } catch (e: any) { problems.push(`${app.name}/${area}: render: ${String(e?.message ?? e).split("\n")[0]}`); }
    const title = at(ui, `pages.${key}.${area}.title`) || at(ui, `pages.${key}.${area}.nav`) || area;
    pages.push({ area, path: r.path, nav: at(ui, `pages.${key}.${area}.nav`) ?? area, title, preview: !!preview, blocks, sections: uses.length, code });
  }
  apps.push({ name: app.name, title: app.title, docs: app.docs, frame: frame.map(regOf).filter(Boolean), pages });
}
mkdirSync(OUT, { recursive: true });
mkdirSync(PH_OUT, { recursive: true });
for (const [h, svg] of [...PH].sort()) if (!existsSync(path.join(PH_OUT, h + ".svg"))) writeFileSync(path.join(PH_OUT, h + ".svg"), svg);
writeFileSync(path.join(OUT, "index.json"), JSON.stringify({ sourceCommit: reg.sourceCommit, apps }, null, 1) + "\n");
console.log(`templates: ${apps.length} apps, ${apps.reduce((n, a) => n + a.pages.length, 0)} pages, ${apps.reduce((n, a) => n + a.pages.filter((p: any) => p.preview).length, 0)} with preview`);
if (problems.length) console.log("problems:\n" + problems.join("\n"));
