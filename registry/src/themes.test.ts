import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { THEME_BASE, THEME_TARGET_DIR } from "./themes";

// Checks the committed r/: theme items of the TypeScript runtimes (chaosbun#143).
const R = path.resolve(import.meta.dir, "../../r");
const TS = ["svelte", "react", "vue", "solid"];
const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

describe("theme items (registry:theme)", () => {
  it("every TypeScript runtime has the same theme items, the server runtimes none", () => {
    const names = (rt: string) => read(path.join(R, rt, "index.json")).components.filter((c: any) => c.type === "registry:theme").map((c: any) => c.name);
    const svelte = names("svelte");
    expect(svelte).toContain(THEME_BASE);
    expect(svelte.length).toBeGreaterThan(1);
    for (const rt of TS) expect(names(rt)).toEqual(svelte);
    for (const rt of ["templ", "twig", "latte", "jinja2"]) expect(names(rt)).toEqual([]);
  });
  it("a skin item writes one CSS file under styles/skins, depends on theme-base and pins the skin JSON sha256", () => {
    for (const rt of TS) {
      for (const f of readdirSync(path.join(R, rt, "themes"))) {
        const it = read(path.join(R, rt, "themes", f));
        expect(it.type).toBe("registry:theme");
        for (const file of it.files) expect(file.target.startsWith(`${THEME_TARGET_DIR}/`)).toBe(true);
        if (it.name === THEME_BASE) continue;
        const id = it.name.slice("theme-".length);
        expect(it.registryDependencies).toEqual([THEME_BASE]);
        expect(it.files.map((x: any) => x.target)).toEqual([`${THEME_TARGET_DIR}/${id}.css`]);
        expect(it.files[0].content).toContain(`[data-skin="${id}"]`);
        expect(it.meta.skin.id).toBe(id);
        expect(it.meta.skin.sha256).toMatch(/^[0-9a-f]{64}$/);
      }
    }
  });
  it("the same skin file is byte-identical in every runtime and matches the manifest", () => {
    const manifest = read(path.join(R, "manifest.json"));
    for (const f of readdirSync(path.join(R, "svelte", "themes"))) {
      const base = read(path.join(R, "svelte", "themes", f));
      for (const rt of TS) {
        const p = path.join(R, rt, "themes", f);
        expect(existsSync(p)).toBe(true);
        const it = read(p);
        expect(it.files.map((x: any) => x.content)).toEqual(base.files.map((x: any) => x.content));
        for (const file of it.files) expect(manifest.runtimes[rt].entries[it.name].files[file.target].sha256).toBe(sha(file.content));
      }
    }
  });
});
