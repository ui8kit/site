// Skins as installable registry items (alexy-os/chaosbun#143): `npx ui8kit add theme-<skin>` writes the skin's tokens CSS.
// Source data is the source monorepo: packages/skins/skins/index.json (+ <id>.json, sha256 each) and the CSS that
// `bun skins.ts build` generates from them into packages/compose-gen/runtimes/core/assets/styles/skins/. The build re-runs
// `skins build --check` there (generated CSS up to date with the JSON), checks every skin JSON against its index sha256 and
// ships the generated CSS verbatim. A brand is applied by tokens only (colours, radius, shadows, fonts): no component is forked.
//
// Items (TypeScript runtimes, whose utils item ships styles/; the server-template runtimes ship no CSS):
//   theme-base     styles/skins/base.css (start values of a skin scoped on an element) + styles/skins/NOTICE.md (licences)
//   theme-<id>     styles/skins/<id>.css: [data-skin="<id>"] light tokens, the dark twin under .dark / data-theme="dark"
// Activate: import the file after the styles entry and set data-skin="<id>" on <html> (or on any element to scope it).
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const THEME_TYPE = "registry:theme";
export const THEME_FOLDER = "themes";
export const THEME_BASE = "theme-base";
export const THEME_TARGET_DIR = "styles/skins";
export const themeItemName = (id: string) => `theme-${id}`;

export type ThemeFile = { path: string; target: string; content: string };
export type ThemeSpec = {
  name: string; title: string; description: string; registryDependencies: string[]; files: ThemeFile[];
  meta: { kind: "theme"; category: "themes"; skin?: { id: string; name: string; version: string; source: string; license: string; sha256: string; fonts: string[] } };
};

const sha = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");
const ID = /^[a-z0-9][a-z0-9-]{0,62}$/;

/** Theme items read from the source monorepo (same for every TypeScript runtime). Throws on stale or tampered data. */
export function themeSpecs(src: string, opts: { check?: boolean } = {}): ThemeSpec[] {
  const skinsPkg = path.join(src, "packages/skins");
  const jsonDir = path.join(skinsPkg, "skins");
  const cssDir = path.join(src, "packages/compose-gen/runtimes/core/assets/styles/skins");
  for (const d of [jsonDir, cssDir]) if (!existsSync(d)) throw new Error(`themes: missing ${d}`);
  if (opts.check !== false) {
    // generated CSS up to date with the skin JSON (the source's own gate; needs `bun install` in the source)
    execFileSync("bun", ["skins.ts", "build", "--check"], { cwd: skinsPkg, stdio: ["ignore", "ignore", "inherit"] });
  }
  const index = JSON.parse(readFileSync(path.join(jsonDir, "index.json"), "utf8")) as { skins: { id: string; name: string; version: string; file: string; sha256: string }[] };
  const fontsOf = JSON.parse(readFileSync(path.join(cssDir, "skins.json"), "utf8")) as Record<string, { fonts?: string[] }>;
  const read = (f: string) => readFileSync(path.join(cssDir, f), "utf8");
  const out: ThemeSpec[] = [{
    name: THEME_BASE, title: "Theme Base",
    description: "Start values of a skin scoped on an element (data-skin on any element but <html>): the kit font, tracking, radius and shadows, so the element shows its own skin only. Licences of the skins in NOTICE.md.",
    registryDependencies: [],
    files: ["base.css", "NOTICE.md"].map((f) => ({ path: `${THEME_TARGET_DIR}/${f}`, target: `${THEME_TARGET_DIR}/${f}`, content: read(f) })),
    meta: { kind: "theme", category: "themes" },
  }];
  const seen = new Set<string>();
  for (const s of [...index.skins].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    if (!ID.test(s.id) || seen.has(s.id)) throw new Error(`themes: bad or duplicate skin id ${s.id}`);
    seen.add(s.id);
    const raw = readFileSync(path.join(jsonDir, s.file));
    if (sha(raw) !== s.sha256) throw new Error(`themes: ${s.file} sha256 differs from index.json`);
    const j = JSON.parse(raw.toString("utf8"));
    if (j.id !== s.id) throw new Error(`themes: ${s.file} id ${j.id} != ${s.id}`);
    const css = `${s.id}.css`;
    if (!existsSync(path.join(cssDir, css))) throw new Error(`themes: missing generated ${css}`);
    out.push({
      name: themeItemName(s.id), title: s.name,
      description: `Skin ${s.name}: brand tokens (colours, radius, shadows, fonts) for every UI8Kit component, light and dark; on with data-skin="${s.id}".`,
      registryDependencies: [THEME_BASE],
      files: [{ path: `${THEME_TARGET_DIR}/${css}`, target: `${THEME_TARGET_DIR}/${css}`, content: read(css) }],
      meta: {
        kind: "theme", category: "themes",
        skin: { id: s.id, name: s.name, version: s.version, source: j.attribution?.source ?? "ui8kit", license: j.attribution?.license ?? "MIT", sha256: s.sha256, fonts: fontsOf[s.id]?.fonts ?? [] },
      },
    });
  }
  return out;
}
