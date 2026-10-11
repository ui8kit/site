// Builds previews/ (static HTML previews + props data) from the private source monorepo. Run when r/ is rebuilt:
//
//   bun run previews:build -- --src /path/to/source      # or UI8KIT_SRC; the monorepo needs `bun install` once
//
// Route: the React package of the monorepo (@ui8kit/react-ui) is rendered with react-dom/server (renderToStaticMarkup) on the placeholder
// content of the monorepo (xgen block samples + fixtures + content dictionary). The result is plain HTML with Tailwind class names; the site
// CSS (Tailwind scans previews/*.html) styles it, so there is no iframe, no runtime and no extra stylesheet. Props tables come from the xgen specs
// (specs/ui, parts, patterns, organisms, *.variants.json), not from hand-written text. Deterministic output.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const arg = (n: string, env: string, d: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? process.argv[i + 1]! : process.env[env] ?? d;
};
const repoRoot = path.resolve(import.meta.dir, "../..");
const SRC = path.resolve(arg("src", "UI8KIT_SRC", path.join(repoRoot, "..", "source")));
const OUT = path.resolve(arg("out", "UI8KIT_PREVIEWS", path.join(repoRoot, "previews")));
const XG = path.join(SRC, "xgen");

const rj = (...p: string[]) => JSON.parse(readFileSync(path.join(...p), "utf8"));
const kebab = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
const camel = (s: string) => s[0]!.toLowerCase() + s.slice(1);
const sortKeys = (v: any): any => Array.isArray(v) ? v.map(sortKeys) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v;

const req = createRequire(path.join(SRC, "package.json"));
const React: any = await import(req.resolve("react"));
const { renderToStaticMarkup } = (await import(req.resolve("react-dom/server"))) as any;
// spy on the JSX runtime before the UI package loads: the props every component receives inside the block samples become the sample of that component
const captured = new Map<string, any[]>();
let capturing = false;
for (const rt of ["react/jsx-runtime", "react/jsx-dev-runtime"]) {
  const m: any = req(rt);
  for (const k of ["jsx", "jsxs", "jsxDEV"]) {
    const orig = m[k];
    if (typeof orig !== "function") continue;
    m[k] = (type: any, p: any, ...rest: any[]) => {
      const nm = typeof type === "function" || typeof type === "object" ? type?.displayName ?? type?.name ?? type?.render?.name : undefined;
      if (capturing && nm) { const l = captured.get(nm) ?? []; if (l.length < 12) { l.push(p); captured.set(nm, l); } }
      return orig(type, p, ...rest);
    };
  }
}
const ui8: any = await import(path.join(SRC, "packages/react/ui/src/index.ts"));
const { ui } = (await import(path.join(SRC, "packages/shared/app/src/content.ts"))) as any;
const { fromCodex } = (await import(path.join(SRC, "packages/shared/app/src/runtime/core.ts"))) as any;

console.error = () => {}; // React warns about read-only samples (value without onChange); irrelevant for static HTML
const reg = JSON.parse(readFileSync(path.join(repoRoot, "r/registry.json"), "utf8"));

// ---------- specs
const specDir = (d: string) => path.join(XG, "specs", d);
const load = (d: string) => Object.fromEntries(readdirSync(specDir(d)).filter((f) => f.endsWith(".json") && !f.endsWith(".variants.json")).map((f) => [f.slice(0, -5), rj(specDir(d), f)]));
const S = { ui: load("ui"), parts: load("parts"), patterns: load("patterns"), organisms: load("organisms") };
const blocksByOrg: Record<string, any> = {};
for (const f of readdirSync(specDir("blocks"))) { const b = rj(specDir("blocks"), f); blocksByOrg[kebab(b.organism)] = b; }

// ---------- content resolution (block samples reference the dictionary and fixtures)
function dataSets(block: any): Record<string, any[]> {
  const out: Record<string, any[]> = {};
  for (const d of block.data ?? []) {
    const file = path.join(SRC, "packages/shared/app/src/data", d.collection + ".ts");
    out[d.as] = fromCodex(MODS[d.collection] ?? [], d.fields);
    void file;
  }
  return out;
}
const MODS: Record<string, any[]> = {};
for (const f of readdirSync(path.join(SRC, "packages/shared/app/src/data"))) {
  const m: any = await import(path.join(SRC, "packages/shared/app/src/data", f));
  for (const [k, v] of Object.entries(m)) if (Array.isArray(v)) MODS[k] = v as any[];
  MODS[f.replace(/\.ts$/, "")] = (Object.values(m).find(Array.isArray) as any[]) ?? MODS[f.replace(/\.ts$/, "")];
}
function resolve(v: any, sets: Record<string, any[]>): any {
  if (Array.isArray(v)) return v.map((x) => resolve(x, sets));
  if (v && typeof v === "object") {
    if (typeof v.op === "string" && Array.isArray(v.args)) {
      const a = v.args.map((x: any) => resolve(x, sets));
      if (v.op === "pick") return a[0].find((e: any) => e.id === a[1]);
      if (v.op === "nth") return a[0][a[1]];
      if (v.op === "list") return a;
      throw new Error(`unknown op ${v.op}`);
    }
    if (typeof v.$ === "string" && Object.keys(v).length === 1) {
      const p: string = v.$;
      const [head, ...rest] = p.split(".");
      if (head === "ui") return rest.reduce((o: any, k) => o?.[k], ui);
      if (sets[head!]) return rest.reduce((o: any, k) => o?.[k], sets[head!]);
      throw new Error(`unresolved reference ${p}`);
    }
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolve(x, sets)]));
  }
  return v;
}
const merge = (a: any, b: any): any => {
  if (b && typeof b === "object" && !Array.isArray(b) && a && typeof a === "object" && !Array.isArray(a)) {
    const o = { ...a };
    for (const [k, x] of Object.entries(b)) o[k] = k in a ? merge(a[k], x) : x;
    return o;
  }
  return b;
};

// ---------- HTML post-processing
const PH = new Map<string, string>();
const placeholderSvg = Buffer.from((await import(path.join(XG, "screens/src/authoring/placeholders.ts")) as any).placeholders.light.split(",")[1], "base64").toString("utf8");
function finish(html: string): string {
  // shared placeholder pictures instead of one base64 data URI per image
  html = html.replace(/data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+/g, (uri) => {
    const h = createHash("sha256").update(uri).digest("hex").slice(0, 8);
    PH.set(h, Buffer.from(uri.split(",")[1]!, "base64").toString("utf8"));
    return `/assets/ph/${h}.svg`;
  });
  // sample links go nowhere: the site checks every link, and a preview must not point into the app it was cut from
  html = html.replace(/href="(?:#|tel:|mailto:)[^"]*"/g, 'href="#"');
  // a sample control without a visible label gets an accessible name; a lone tab gets its tablist
  html = html.replace(/<select(?![^>]*aria-label)/g, '<select aria-label="Sample"');
  if (/role="tab"/.test(html) && !/role="tablist"/.test(html)) html = `<div role="tablist" aria-label="Sample">${html}</div>`;
  // React 19 hoists image preloads as <link>; a static fragment does not want them
  html = html.replace(/<link rel="preload"[^>]*\/?>/g, "");
  // sample pictures that name a file the site does not have get the neutral placeholder
  html = html.replace(/src="(?![a-z]+:|\/assets\/)[^"]*\.(?:png|jpe?g|webp|gif|svg)"/g, () => { PH.set("placeholder", placeholderSvg); return 'src="/assets/ph/placeholder.svg"'; });
  // one h1 per page: the page owns it, a sample heading is an h2
  html = html.replace(/<h1(?=[\s>])/g, "<h2").replace(/<\/h1>/g, "</h2>");
  return html;
}

/** the captured sample whose HTML is the richest that is still small (a table with rows beats an empty one, a page-sized one is too big) */
function best(type: any, name: string): { props: any; html: string } | null {
  let pick: { props: any; html: string } | null = null;
  for (const p of captured.get(name) ?? []) {
    let html = "";
    try { html = renderToStaticMarkup(React.createElement(type, p)); } catch { continue; }
    const len = html.length;
    const ok = (x: string) => x.length > 0 && x.length <= 6000;
    if (!pick) pick = { props: p, html };
    else if (ok(html) && (!ok(pick.html) || len > pick.html.length)) pick = { props: p, html };
    else if (!ok(pick.html) && !ok(html) && len < pick.html.length && len > 0) pick = { props: p, html };
  }
  return pick && pick.html ? pick : null;
}
const render = (type: any, props: any, children?: any) => renderToStaticMarkup(React.createElement(type, props, children));
const wrap = (...nodes: string[]) => nodes.join("\n");

// ---------- props tables
type Row = { name: string; type: string; required?: boolean; default?: string; values?: string[]; desc?: string };
type Table = { part: string; docs?: string; rows: Row[] };
const tyOf = (t: any): string => typeof t === "string" ? (t === "bool" ? "boolean" : t) : t?.ts ?? t?.record ?? JSON.stringify(t);
const strDef = (v: any) => v === undefined || v === null ? undefined : typeof v === "string" ? JSON.stringify(v) : String(JSON.stringify(v));

function primitiveTables(spec: any): Table[] {
  const variantsOf = (recipe: string) => {
    const f = spec.variants?.[recipe];
    return f ? rj(specDir("ui"), f) : null;
  };
  return spec.parts.map((p: any) => {
    const vr = p.recipeId ? variantsOf(p.recipeId) : null;
    // passthrough props (id, role, tabIndex, aria-*) and the attribute bag are standard HTML attributes: one note on the page instead of a row each
    const rows: Row[] = (p.props ?? []).filter((pr: any) => !pr.passthrough && pr.name !== "Attrs" && pr.name !== "DataUI8Kit").map((pr: any) => {
      const key = camel(pr.name);
      const r: Row = { name: key, type: tyOf(pr.type), desc: pr.docs };
      if (pr.cva && vr?.byKey?.[key]) {
        r.values = Object.keys(vr.byKey[key]);
        r.type = r.values.map((x) => JSON.stringify(x)).join(" | ");
        if (vr.defaults?.[key] !== undefined) r.default = JSON.stringify(vr.defaults[key]);
      }
      if (pr.required) r.required = true;
      if (r.default === undefined && pr.default !== undefined) r.default = strDef(pr.default);
      return r;
    });
    return { part: p.name, docs: p.docs, rows };
  });
}
function organismTable(spec: any): Table[] {
  const rows: Row[] = (spec.props ?? []).map((pr: any) => {
    const r: Row = { name: pr.name, type: tyOf(pr.type), desc: pr.docs };
    if (pr.required) r.required = true;
    if (pr.default !== undefined) r.default = strDef(pr.default);
    const lits = typeof pr.type === "object" && pr.type.ts ? pr.type.ts.split("|").map((x: string) => x.trim()) : null;
    if (lits && lits.every((x: string) => /^"[^"]*"$|^\d+$/.test(x))) r.values = lits.map((x: string) => x.replace(/"/g, ""));
    return r;
  });
  return [{ part: spec.name, docs: spec.docs, rows }];
}

// ---------- previews
const previews: Record<string, string> = {};
const props: Record<string, Table[]> = {};
const examplesFor = new Set<string>();
const capturedPrims = new Set<string>();
const problems: string[] = [];
const labelFor = (spec: any) => {
  const slot = spec.parts?.[0]?.slots ?? [];
  return slot.some((s: any) => s.name === "children") ? "Label" : undefined;
};

function primitivePreview(name: string, spec: any): string | null {
  const main = spec.parts[0];
  const C = ui8[main.name];
  if (!C) return null;
  const children = labelFor(spec);
  { const b = spec.parts.length > 1 ? best(C, main.name) : null; if (b) { capturedPrims.add(name); return b.html; } }
  const cells: string[] = [];
  const add = (cap: string, p: any) => cells.push(`<figure class="flex flex-col items-start gap-2"><figcaption class="text-xs text-muted-foreground">${cap}</figcaption>${render(C, children || main.name === "Break" ? p : { "aria-label": cap, ...p }, children)}</figure>`);
  const examples: any[] = spec.examples ?? [];
  const vr = main.recipeId && spec.variants?.[main.recipeId] ? rj(specDir("ui"), spec.variants[main.recipeId]) : null;
  const seen = new Set<string>();
  const pushEx = (id: string, p: any) => { const k = JSON.stringify(p); if (!seen.has(k)) { seen.add(k); add(id, p); } };
  if (vr) {
    // one specimen per value of the first two recipe keys, from the recipe itself
    for (const key of (vr.keys as string[]).slice(0, 2)) for (const v of Object.keys(vr.byKey[key])) if (v !== "icon") pushEx(`${key}: ${v}`, { [key]: v });
  } else {
    for (const e of examples.slice(0, 4)) {
      const p = Object.fromEntries(Object.entries(e.props).map(([k, v]) => [camel(k), v]));
      pushEx(e.id, p);
    }
  }
  if (!cells.length) pushEx("default", {});
  return `<div class="flex flex-wrap items-end gap-6">${cells.join("")}</div>`;
}

const ORDER: Record<string, number> = { block: 0, component: 1, primitive: 2 };
for (const it of [...(reg.items as any[])].sort((a, b) => (ORDER[a.kind] ?? 9) - (ORDER[b.kind] ?? 9))) {
  if (it.kind === "lib" || it.kind === "utils") continue;
  const n: string = it.name;
  try {
    if (it.kind === "block") {
      const org = S.organisms[n];
      props[n] = organismTable(org);
      const b = blocksByOrg[n];
      if (!b) { problems.push(`${n}: no xgen block sample`); continue; }
      const sets = dataSets(b);
      const v0 = b.variants[0];
      const p = resolve(merge(merge(b.sample.props, v0.set ?? {}), v0.props ?? {}), sets);
      capturing = true;
      try {
        previews[n] = finish(render(ui8[b.organism], p));
        // the other variants only feed the capture (more components get a sample)
        for (const v of b.variants.slice(1)) {
          try { render(ui8[b.organism], resolve(merge(merge(b.sample.props, v.set ?? {}), v.props ?? {}), sets)); } catch { /* a variant that does not render adds nothing */ }
        }
      } finally { capturing = false; }
    } else if (it.kind === "primitive") {
      const spec = S.ui[n];
      if (!spec) { problems.push(`${n}: no ui spec`); continue; }
      props[n] = primitiveTables(spec);
      const h = primitivePreview(n, spec);
      if (h) previews[n] = finish(h);
    } else {
      const spec = S.parts[n] ?? S.patterns[n] ?? S.organisms[n];
      if (!spec) { problems.push(`${n}: no spec`); continue; }
      props[n] = organismTable(spec);
      if (S.parts[n]?.examples?.length) {
        examplesFor.add(n);
        const C = ui8[spec.name];
        const cells = S.parts[n].examples.slice(0, 6).map((e: any) => `<figure class="flex flex-col items-start gap-2"><figcaption class="text-xs text-muted-foreground">${e.id}</figcaption>${render(C, e.props)}</figure>`);
        previews[n] = finish(`<div class="flex flex-wrap items-end gap-6">${cells.join("")}</div>`);
      }
    }
  } catch (e: any) {
    problems.push(`${n}: ${String(e?.message ?? e).split("\n")[0]}`);
  }
}

// components without their own examples: the props captured from the block samples
const fromBlocks = new Set<string>();
for (const it of reg.items as any[]) {
  if ((it.kind !== "component" && it.kind !== "block") || previews[it.name]) continue;
  const spec = S.parts[it.name] ?? S.patterns[it.name] ?? S.organisms[it.name];
  const C = spec && ui8[spec.name];
  const bp = C && best(C, spec.name);
  if (!C || !bp) continue;
  try { previews[it.name] = finish(bp.html); fromBlocks.add(it.name); } catch (e: any) { problems.push(`${it.name}: capture render: ${String(e?.message ?? e).split("\n")[0]}`); }
}

// ---------- write
rmSync(OUT, { recursive: true, force: true });
mkdirSync(path.join(OUT, "html"), { recursive: true });
mkdirSync(path.join(OUT, "ph"), { recursive: true });
for (const [n, h] of Object.entries(previews).sort()) writeFileSync(path.join(OUT, "html", n + ".html"), h + "\n");
for (const [h, svg] of [...PH].sort()) writeFileSync(path.join(OUT, "ph", h + ".svg"), svg);
writeFileSync(path.join(OUT, "props.json"), JSON.stringify(sortKeys(props), null, 1) + "\n");
const kinds: Record<string, [number, number, number]> = {};
for (const it of reg.items as any[]) {
  if (it.kind === "lib" || it.kind === "utils") continue;
  const k = (kinds[it.kind] ??= [0, 0, 0]);
  k[0]++; if (previews[it.name]) k[1]++; if (props[it.name]) k[2]++;
}
writeFileSync(path.join(OUT, "sources.json"), JSON.stringify({ examples: [...examplesFor].sort(), capturedFromBlocks: [...fromBlocks].sort(), primitivesCaptured: [...capturedPrims].sort() }, null, 1) + "\n");
console.log("kind: [items, with preview, with props]", kinds);
if (problems.length) console.log("problems:\n" + problems.join("\n"));
