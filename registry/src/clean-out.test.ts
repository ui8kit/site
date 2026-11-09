import { expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { cleanGenerated } from "./clean-out";

test("cleanGenerated removes stale generated runtimes, keeps foreign dirs", () => {
  const out = mkdtempSync(path.join(tmpdir(), "r-"));
  try {
    const put = (p: string, s = "x") => { mkdirSync(path.dirname(path.join(out, p)), { recursive: true }); writeFileSync(path.join(out, p), s); };
    put("react/components/ui/stale.json");
    put("twig/index.json");
    put("schema/old.json");
    put("variants/v0.json");
    put("variants/v0.json.sha256");
    put("manifest.json");
    put("registry.json");
    put("authfly/react/index.json", "authfly");
    for (const d of ["app", "dashboard", "messanger"]) put(`${d}/react/index.json`, d);
    put("vercel.json", "{}");
    cleanGenerated(out, ["react", "twig", "vue"]);
    for (const p of ["react", "twig", "schema", "variants", "manifest.json", "registry.json"]) expect(existsSync(path.join(out, p))).toBe(false);
    expect(readFileSync(path.join(out, "authfly/react/index.json"), "utf8")).toBe("authfly");
    for (const d of ["app", "dashboard", "messanger"]) expect(readFileSync(path.join(out, `${d}/react/index.json`), "utf8")).toBe(d);
    expect(readFileSync(path.join(out, "vercel.json"), "utf8")).toBe("{}");
  } finally { rmSync(out, { recursive: true, force: true }); }
});
