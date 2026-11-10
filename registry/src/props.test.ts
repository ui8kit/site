import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { checkProps, publishProps, PROPS_SRC } from "./props";

const sha = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");
const schema = { $schema: "https://json-schema.org/draft/2020-12/schema", type: "object", properties: { title: { type: "string" } }, additionalProperties: false };
const body = { version: "0", registry: "https://registry.buildy.tw", items: { "about-company": { organism: "AboutCompany", events: [], slots: [], schema } } };
const file = (b: any) => JSON.stringify({ version: b.version, digest: "sha256:" + sha(JSON.stringify(b)), registry: b.registry, items: b.items }, null, 2) + "\n";
const withSrc = (content: string, fn: (src: string, out: string) => void) => {
  const root = mkdtempSync(path.join(tmpdir(), "props-"));
  try {
    const src = path.join(root, "src");
    mkdirSync(path.dirname(path.join(src, PROPS_SRC)), { recursive: true });
    writeFileSync(path.join(src, PROPS_SRC), content);
    fn(src, path.join(root, "r"));
  } finally { rmSync(root, { recursive: true, force: true }); }
};

test("publishProps copies the file verbatim to props/v0.json with a sha256 sidecar", () => {
  const content = file(body);
  withSrc(content, (src, out) => {
    const e = publishProps(src, out, new Set(["about-company"]), new Map([["about-company", "AboutCompany"]]));
    expect(readFileSync(path.join(out, "props/v0.json"), "utf8")).toBe(content);
    expect(e).toEqual({ path: "props/v0.json", sha256: sha(content), bytes: Buffer.byteLength(content), digest: "sha256:" + sha(JSON.stringify(body)), version: "0", items: 1 });
    expect(readFileSync(path.join(out, "props/v0.json.sha256"), "utf8")).toBe(`${sha(content)}  v0.json\n`);
  });
});

test("checkProps rejects a stale digest, unknown names, a missing schema and variants without props", () => {
  const bad = JSON.parse(file(body));
  bad.items["ghost-block"] = { organism: "Ghost", events: [], slots: [] };
  const variants = new Map([["about-company", "Other"], ["hero-split", "HeroSplit"]]);
  const { problems } = checkProps(Buffer.from(JSON.stringify(bad)), new Set(["about-company", "ghost-block"]), variants);
  expect(problems.some((p) => p.includes("digest"))).toBe(true);
  expect(problems.some((p) => p.includes("ghost-block has no object schema"))).toBe(true);
  expect(problems.some((p) => p.includes("variants item hero-split has no props schema"))).toBe(true);
  expect(problems.some((p) => p.includes("about-company organism AboutCompany differs"))).toBe(true);
  expect(checkProps(Buffer.from(file(body)), new Set(), undefined).problems.some((p) => p.includes("about-company is not a registry item"))).toBe(true);
  withSrc(JSON.stringify(bad), (src, out) => expect(() => publishProps(src, out, new Set(["about-company"]))).toThrow());
});
