import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { checkVariants, publishVariants, VARIANTS_SRC } from "./variants";

const sha = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");
const body = { version: "0", registry: "https://registry.buildy.tw", items: { "about-company": { block: "about", defaultVariant: "split", variants: { split: { asset: "block.about/split", set: {}, props: { layout: "split" } } } } } };
const file = (b: any) => JSON.stringify({ version: b.version, digest: "sha256:" + sha(JSON.stringify(b)), registry: b.registry, items: b.items }, null, 2) + "\n";
const withSrc = (content: string, fn: (src: string, out: string) => void) => {
  const root = mkdtempSync(path.join(tmpdir(), "variants-"));
  try {
    const src = path.join(root, "src");
    mkdirSync(path.dirname(path.join(src, VARIANTS_SRC)), { recursive: true });
    writeFileSync(path.join(src, VARIANTS_SRC), content);
    fn(src, path.join(root, "r"));
  } finally { rmSync(root, { recursive: true, force: true }); }
};

test("publishVariants copies the file verbatim to variants/v0.json with a sha256 sidecar", () => {
  const content = file(body);
  withSrc(content, (src, out) => {
    const e = publishVariants(src, out, new Set(["about-company"]));
    expect(readFileSync(path.join(out, "variants/v0.json"), "utf8")).toBe(content);
    expect(e).toEqual({ path: "variants/v0.json", sha256: sha(content), bytes: Buffer.byteLength(content), digest: "sha256:" + sha(JSON.stringify(body)), version: "0", items: 1, variants: 1 });
    expect(readFileSync(path.join(out, "variants/v0.json.sha256"), "utf8")).toBe(`${sha(content)}  v0.json\n`);
  });
});

test("checkVariants rejects a stale digest, unknown registry names and a bad defaultVariant", () => {
  const bad = JSON.parse(file(body));
  bad.items["about-company"].defaultVariant = "nope";
  bad.items["ghost-block"] = { variants: { a: {} } };
  const { problems } = checkVariants(Buffer.from(JSON.stringify(bad)), new Set(["about-company"]));
  expect(problems.some((p) => p.includes("digest"))).toBe(true);
  expect(problems.some((p) => p.includes("ghost-block is not a registry item"))).toBe(true);
  expect(problems.some((p) => p.includes("defaultVariant nope"))).toBe(true);
  withSrc(JSON.stringify(bad), (src, out) => expect(() => publishVariants(src, out, new Set(["about-company"]))).toThrow());
});
