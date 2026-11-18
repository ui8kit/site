import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { checkPublished, publishPrototypes, PROTOTYPES_SRC, readPrototypes } from "./prototypes";

const sha = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");
const schema = JSON.stringify({ $schema: "https://json-schema.org/draft/2020-12/schema", $id: "https://registry.buildy.tw/models/hero@1.schema.json", type: "object" });
const contract = JSON.stringify({ item: "hero-simple", version: 1, block: "block.herosimple", model: "hero@1", modelSchema: "https://registry.buildy.tw/models/hero@1.schema.json" });
const index = JSON.stringify({ version: 0, items: { "hero-simple": { version: 1, path: "hero-simple/1.json", model: "hero@1" } } });
const FILES: Record<string, string> = { "models/hero@1.schema.json": schema, "contracts/hero-simple/1.json": contract, "contracts/v0.json": index, "svelte/index.ts": "export {};\n" };

const withSrc = (files: Record<string, string>, manifest: Record<string, string>, fn: (src: string, out: string) => void) => {
  const root = mkdtempSync(path.join(tmpdir(), "prototypes-"));
  try {
    const src = path.join(root, "src"), base = path.join(src, PROTOTYPES_SRC);
    for (const [f, c] of Object.entries(files)) { mkdirSync(path.dirname(path.join(base, f)), { recursive: true }); writeFileSync(path.join(base, f), c); }
    writeFileSync(path.join(base, "manifest.json"), JSON.stringify({ files: manifest }));
    fn(src, path.join(root, "r"));
  } finally { rmSync(root, { recursive: true, force: true }); }
};
const shas = (files: Record<string, string>) => Object.fromEntries(Object.entries(files).map(([f, c]) => [f, sha(c)]));

test("publishes the models and contracts verbatim with sidecars; the block links name them", () => {
  withSrc(FILES, shas(FILES), (src, out) => {
    const read = readPrototypes(src)!;
    expect(read.problems).toEqual([]);
    expect([...read.links]).toEqual([["hero-simple", { model: "hero@1", contract: "contracts/hero-simple/1.json" }]]);
    const e = publishPrototypes(read, out, new Set(["hero-simple"]));
    expect(readFileSync(path.join(out, "models/hero@1.schema.json"), "utf8")).toBe(schema);
    expect(readFileSync(path.join(out, "contracts/hero-simple/1.json.sha256"), "utf8")).toBe(`${sha(contract)}  1.json\n`);
    expect(e.models["hero@1"]).toEqual({ id: "hero@1", path: "models/hero@1.schema.json", sha256: sha(schema), bytes: schema.length });
    expect(e.contracts["hero-simple@1"]!.model).toBe("hero@1");
    expect(e.index.path).toBe("contracts/v0.json");
    expect(checkPublished(out, e)).toEqual([]);
    writeFileSync(path.join(out, "contracts/v0.json"), "{}");
    expect(checkPublished(out, e).join("\n")).toContain("contracts/v0.json differs from manifest");
  });
});

test("a file that differs from out/manifest.json, a contract of an unpublished model, an unknown block are rejected", () => {
  withSrc(FILES, { ...shas(FILES), "models/hero@1.schema.json": "0".repeat(64) }, (src) => {
    expect(readPrototypes(src)!.problems.join("\n")).toContain("differs from its sha256");
  });
  const noModel = { ...FILES };
  delete noModel["models/hero@1.schema.json"];
  withSrc(noModel, shas(noModel), (src, out) => {
    const read = readPrototypes(src)!;
    expect(read.problems.join("\n")).toContain("reads model hero@1, which is not published");
    expect(() => publishPrototypes(read, out, new Set(["hero-simple"]))).toThrow();
  });
  withSrc(FILES, shas(FILES), (src, out) => expect(() => publishPrototypes(readPrototypes(src)!, out, new Set())).toThrow());
  expect(readPrototypes("/nonexistent")).toBeNull();
});
