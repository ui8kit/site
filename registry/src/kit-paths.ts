/**
 * Compose sources reach the primitives through the monorepo path `../../kit/<rt>/src/...` (imports) or
 * `../../../kit/<rt>/src` (Tailwind `@source`, no trailing slash). In the registry layout the primitives sit at
 * `kit/`, so each such reference is rewritten relative to the file's own target (`rel`). A reference left as is
 * points outside the user's project after install (alexy-os/chaosbun#123: `@source "../../../kit/react/src"`).
 */
export function rewriteKitRefs(content: string, rel: string, rt: string): string {
  const kitRe = new RegExp(`(["'])((?:\\.\\./)+)kit/${rt}/src(/|(?=["']))`, "g");
  const dir = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : ".";
  const up = relativePosix(dir, "kit");
  return content.replace(kitRe, (_m, q: string, _ups: string, tail: string) => `${q}${up.startsWith(".") ? up : "./" + up}${tail}`);
}

function relativePosix(from: string, to: string): string {
  const a = from === "." ? [] : from.split("/").filter(Boolean);
  const b = to.split("/").filter(Boolean);
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return [...a.slice(i).map(() => ".."), ...b.slice(i)].join("/") || ".";
}
