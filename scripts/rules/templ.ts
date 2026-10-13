// templ adapter of the `rules` group: a .templ file -> the common tree. templ has no public AST for TypeScript, so this reads the
// statement grammar of a templ body (markup, `@Component(...) { }`, `if/else`, `for`, `switch/case`, `{ expr }`, `{{ go }}`).
// The rendered templ of a file is the one named after the file (pager.templ -> Pager), else the first; the others (slot fills,
// helpers) are detached. Props of a component are the fields of its props literal (`AriaLabel: ...`), and the pairs of an
// `Attrs: uiutils.Attrs("k", v, ...)` field are attributes. `@templ.Raw` is raw HTML; `@` of a slot (`@p.Actions`, `{ children... }`)
// renders unknown markup; `@` of a local variable is a component chosen from a value (dynamic-tag).
import { basename, extname } from "node:path";
import { choice, type IrAttr, type IrFile, type IrNode } from "./ir";

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const STR = /^"(?:[^"\\]|\\.)*"$|^`[^`]*`$/;
const LIT = /^("(?:[^"\\]|\\.)*"|`[^`]*`|true|false|nil|-?\d+(\.\d+)?|float64\(-?\d+(\.\d+)?\))$/;
const unq = (s: string): string => (s.startsWith("`") ? s.slice(1, -1) : JSON.parse(s) as string);

/** split at top-level commas (outside (), {}, [], strings) */
function splitTop(s: string, sep = ","): string[] {
  const out: string[] = [];
  let depth = 0, cur = "", q = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (q) { cur += c; if (c === "\\" && q === '"') { cur += s[++i] ?? ""; continue; } if (c === q) q = ""; continue; }
    if (c === '"' || c === "`") { q = c; cur += c; continue; }
    if ("({[".includes(c)) depth++;
    if (")}]".includes(c)) depth--;
    if (c === sep && depth === 0) { out.push(cur); cur = ""; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

/** the string literals a Go value can evaluate to: a literal, the branches of uiutils.If / Cond, the arguments of S / Text / Coalesce */
function goStrings(v: string): string[] {
  v = v.trim();
  if (STR.test(v)) return [unq(v)];
  const m = /^uiutils\.(If|Cond|S|Text|Str|Coalesce|Def)\((.*)\)$/s.exec(v);
  if (!m) return [];
  const args = splitTop(m[2]!);
  const results = m[1] === "If" || m[1] === "Cond" ? args.slice(1) : m[1] === "Def" ? args : args;
  return results.flatMap(goStrings);
}

/** the props of a component call: fields of the props literal, plus the pairs of uiutils.Attrs */
function propsOf(args: string, line: number): IrAttr[] {
  const lit = /^[\w.]*\{(.*)\}$/s.exec(args.trim());
  if (!lit) return [];
  return splitTop(lit[1]!).flatMap((field): IrAttr[] => {
    const i = field.indexOf(":");
    if (i < 0) return [];
    const name = field.slice(0, i).trim(), value = field.slice(i + 1).trim();
    if (name === "Attrs") return attrsCall(value, line);
    return [{ name, line, static: LIT.test(value), value: STR.test(value) ? unq(value) : undefined, strings: goStrings(value) }];
  });
}
function attrsCall(value: string, line: number): IrAttr[] {
  const m = /^uiutils\.Attrs\((.*)\)$/s.exec(value);
  if (!m) return [];
  const a = splitTop(m[1]!);
  const out: IrAttr[] = [];
  for (let k = 0; k + 1 < a.length; k += 2) if (STR.test(a[k]!)) out.push({ name: unq(a[k]!), line, static: LIT.test(a[k + 1]!), value: STR.test(a[k + 1]!) ? unq(a[k + 1]!) : undefined, strings: goStrings(a[k + 1]!) });
  return out;
}

/** read up to the matching close of an opening bracket at s[i] */
function balanced(s: string, i: number, open: string, close: string): number {
  let depth = 0, q = "";
  for (let k = i; k < s.length; k++) {
    const c = s[k]!;
    if (q) { if (c === "\\" && q === '"') { k++; continue; } if (c === q) q = ""; continue; }
    if (c === '"' || c === "`") { q = c; continue; }
    if (c === open) depth++;
    else if (c === close && --depth === 0) return k;
  }
  return -1;
}

type Frame = { kind: "root" | "element" | "component" | "loop" | "branch" | "case" | "switch" | "plain"; node?: IrNode; list: IrNode[]; tag?: string; choice?: IrNode & { kind: "choice" } };

export function templToIr(src: string, file = ""): IrFile {
  const imports = new Map<string, string>();
  for (const m of src.matchAll(/^\s*(?:import\s+)?(?:(\w+)\s+)?"([^"]+)"\s*$/gm)) { const alias = m[1] ?? m[2]!.split("/").pop()!.replace(/-/g, ""); imports.set(alias, m[2]!); }
  const want = basename(file, extname(file)).split(/[-_.]/).map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join("");
  const comps: Array<{ name: string; nodes: IrNode[] }> = [];
  let error: string | undefined;
  const lineAt = (pos: number): number => src.slice(0, pos).split("\n").length;
  for (const m of src.matchAll(/^templ\s+(\w+)\s*\(/gm)) {
    const open = src.indexOf("{", balanced(src, m.index! + m[0].length - 1, "(", ")"));
    const close = balanced(src, open, "{", "}");
    if (open < 0 || close < 0) { error = `templ ${m[1]}: unbalanced braces`; break; }
    try { comps.push({ name: m[1]!, nodes: body(src, open + 1, close, lineAt) }); } catch (e) { error = `templ ${m[1]}: ${(e as Error).message}`; }
  }
  const main = comps.find((c) => c.name === want) ?? comps[0];
  const nodes: IrNode[] = main ? [...main.nodes] : [];
  for (const c of comps) if (c !== main) nodes.push({ kind: "detached", line: 0, children: c.nodes });
  return { runtime: "templ", nodes, imports, error };

  function body(s: string, from: number, to: number, lineAt: (p: number) => number): IrNode[] {
    const root: Frame = { kind: "root", list: [] };
    const stack: Frame[] = [root];
    const top = (): Frame => stack[stack.length - 1]!;
    const push = (n: IrNode): void => { top().list.push(n); };
    const openChild = (kind: Frame["kind"], node: IrNode & { children: IrNode[] }, tag?: string): void => { push(node); stack.push({ kind, node, list: node.children, tag }); };
    const newBranch = (ch: IrNode & { kind: "choice" }, kind: "branch" | "case"): void => { const b: IrNode[] = []; ch.branches.push(b); stack.push({ kind, list: b, choice: ch }); };
    const closeBrace = (): void => {
      const f = stack.pop();
      if (!f || f.kind === "root" || f.kind === "element") throw new Error(`unexpected } at line ${lineAt(i)}`);
      if (f.kind === "case") { const sw = stack.pop(); if (sw?.kind !== "switch") throw new Error(`switch close at line ${lineAt(i)}`); finish(f.choice!); }
      if (f.kind === "branch") finish(f.choice!);
    };
    const finish = (ch: IrNode & { kind: "choice" }): void => { if (ch.branches.length === 1) ch.branches.push([]); ch.children = ch.branches.flat(); };
    let i = from;
    let lineStart = true;
    while (i < to) {
      const c = s[i]!;
      if (c === "\n") { lineStart = true; i++; continue; }
      if (c === " " || c === "\t" || c === "\r") { i++; continue; }
      const line = lineAt(i);
      const eol = (): number => { const e = s.indexOf("\n", i); return e < 0 || e > to ? to : e; };
      const rest = s.slice(i, eol());
      if (lineStart) {
        lineStart = false;
        let m: RegExpExecArray | null;
        if (rest.startsWith("//")) { i = eol(); continue; }
        if (rest.startsWith("{{")) { const e = s.indexOf("}}", i); i = e + 2; continue; }
        if ((m = /^\}\s*else\s+if\b.*\{\s*$/.exec(rest)) || (m = /^\}\s*else\s*\{\s*$/.exec(rest))) {
          const f = stack.pop();
          if (f?.kind !== "branch") throw new Error(`else without if at line ${line}`);
          newBranch(f.choice!, "branch"); i = eol(); continue;
        }
        if (/^if\b.*\{\s*$/.test(rest)) { const ch = choice(line, []) as IrNode & { kind: "choice" }; ch.branches.length = 0; push(ch); newBranch(ch, "branch"); i = eol(); continue; }
        if (/^for\b.*\{\s*$/.test(rest)) { openChild("loop", { kind: "loop", line, children: [] }); i = eol(); continue; }
        if (/^switch\b.*\{\s*$/.test(rest)) { const ch = choice(line, []) as IrNode & { kind: "choice" }; ch.branches.length = 0; push(ch); stack.push({ kind: "switch", list: [], choice: ch }); i = eol(); continue; }
        if (/^(case\b.*|default\s*):\s*$/.test(rest)) {
          if (top().kind === "case") stack.pop();
          const sw = top();
          if (sw.kind !== "switch") throw new Error(`case outside switch at line ${line}`);
          newBranch(sw.choice!, "case"); i = eol(); continue;
        }
        if (/^\}\s*$/.test(rest)) { closeBrace(); i = eol(); continue; }
        if (rest.startsWith("@")) {
          const m2 = /^@([\w.]+)/.exec(rest)!;
          const callee = m2[1]!;
          let k = i + 1 + callee.length;
          let args = "";
          if (s[k] === "(") { const e = balanced(s, k, "(", ")"); args = s.slice(k + 1, e); k = e + 1; }
          while (s[k] === " ") k++;
          const hasBody = s[k] === "{" && /^\{\s*$/.test(s.slice(k, s.indexOf("\n", k)));
          const parts = callee.split(".");
          const name = parts[parts.length - 1]!;
          let node: IrNode & { children?: IrNode[] };
          if (callee === "templ.Raw") node = { kind: "raw-html", name: "@templ.Raw", line };
          else if (parts.length === 2 && imports.has(parts[0]!) && /^[A-Z]/.test(name)) node = { kind: "component", name, line, attrs: propsOf(args, line), children: [] };
          else if (parts.length === 1 && /^[A-Z]/.test(name)) node = { kind: "component", name, line, attrs: propsOf(args, line), children: [] };
          else if (parts.length === 1) node = { kind: "dynamic", name: callee, line, attrs: [], children: [] };
          else node = { kind: "render", line };
          if (hasBody) {
            if (!("children" in node) || !node.children) { const g = { kind: "group" as const, line, children: [] as IrNode[] }; push(node); openChild("plain", g); }
            else openChild("component", node as IrNode & { children: IrNode[] });
            i = k + 1;
          } else { push(node); i = k; }
          continue;
        }
      }
      // markup on the line
      if (c === "{") {
        const e = balanced(s, i, "{", "}");
        const code = s.slice(i + 1, e).trim();
        if (/^\w+\.\.\.$/.test(code)) push({ kind: "render", line });
        else push({ kind: "expr", strings: goStrings(code), line });
        i = e + 1; continue;
      }
      if (c === "<" && s[i + 1] === "!") { i = s.indexOf(">", i) + 1; continue; } // <!doctype html>, <!-- comment -->
      if (c === "<" && s[i + 1] === "/") {
        const e = s.indexOf(">", i);
        const tag = s.slice(i + 2, e).trim();
        const f = stack.pop();
        if (f?.kind !== "element" || f.tag !== tag) throw new Error(`</${tag}> does not close the open element at line ${line}`);
        i = e + 1; continue;
      }
      if (c === "<" && /[a-zA-Z]/.test(s[i + 1] ?? "")) {
        const tag = /^<([\w-]+)/.exec(s.slice(i, i + 64))![1]!;
        let k = i + 1 + tag.length;
        const attrs: IrAttr[] = [];
        for (;;) {
          while (/\s/.test(s[k]!)) k++;
          if (s[k] === ">" || (s[k] === "/" && s[k + 1] === ">")) break;
          if (s[k] === "{") { k = balanced(s, k, "{", "}") + 1; continue; } // spread or a conditional attribute block
          const am = /^([\w:@.-]+)(\??=)?/.exec(s.slice(k, k + 200));
          if (!am) throw new Error(`bad attribute at line ${lineAt(k)}`);
          k += am[0].length;
          const name = am[1]!, al = lineAt(k);
          if (!am[2]) { attrs.push({ name, line: al, static: true, strings: [] }); continue; }
          if (s[k] === '"') { const e = s.indexOf('"', k + 1); const v = s.slice(k + 1, e); attrs.push({ name, line: al, static: true, value: v, strings: [v] }); k = e + 1; continue; }
          if (s[k] === "{") { const e = balanced(s, k, "{", "}"); const v = s.slice(k + 1, e).trim(); attrs.push({ name, line: al, static: LIT.test(v), value: STR.test(v) ? unq(v) : undefined, strings: goStrings(v) }); k = e + 1; continue; }
          throw new Error(`bad attribute value at line ${lineAt(k)}`);
        }
        const self = s[k] === "/";
        const node = { kind: "element" as const, name: tag, line, attrs, children: [] as IrNode[] };
        if (self || VOID.has(tag)) { push(node); i = k + (self ? 2 : 1); }
        else { openChild("element", node, tag); i = k + 1; }
        continue;
      }
      // text up to the next markup
      let e = i;
      while (e < to && !"<{\n".includes(s[e]!)) e++;
      if (e === i) e++; // a lone "<" that opens no tag is text
      const text = s.slice(i, e);
      if (text.trim()) push({ kind: "text", text, line });
      i = e;
    }
    if (stack.length !== 1) throw new Error(`${stack.length - 1} unclosed block(s) at the end`);
    return root.list;
  }
}
