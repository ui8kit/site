// Cleans only what registry:build generates under the output root (r/): the runtime dirs, schema/, variants/ and the
// top-level manifest.json / registry.json. r/ is SHARED with other registries (r/authfly, r/app, r/dashboard, ...):
// this is an explicit allowlist of what this build owns; never delete anything outside it.
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";

export const GENERATED_FILES = ["manifest.json", "registry.json"] as const;
export const GENERATED_DIRS = ["schema", "variants"] as const;

export function cleanGenerated(out: string, runtimes: readonly string[]): void {
  mkdirSync(out, { recursive: true });
  for (const d of [...runtimes, ...GENERATED_DIRS]) rmSync(path.join(out, d), { recursive: true, force: true });
  for (const f of GENERATED_FILES) rmSync(path.join(out, f), { force: true });
}
