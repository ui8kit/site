// The shared detectors of the `rules` group. They read the common tree only (ir.ts), so one detector covers Svelte, React and Vue.
import type { IrAttr, IrFile, IrNode } from "./ir";

export const DETECTORS = ["block-root", "raw-html", "dynamic-tag", "raw-native-tag", "reactive-aria", "literal-text"] as const;
export type Detector = (typeof DETECTORS)[number];
export interface Finding { detector: Detector; line: number; message: string }

/** what a detector needs to know about the file besides its tree */
export interface FileContext {
  /** the file is in the blockRoot part of the composition (a block, a screen, a template, the app frame) */
  blockRoot: boolean;
  /** does the component of this name (as imported by the file) open on Block? undefined when it cannot be resolved */
  rootsOnBlock: (name: string) => boolean | undefined;
}

/** naming attributes: not state, may come from an expression (rule 03 §4) */
const ARIA_NAMING = new Set(["aria-label", "aria-labelledby", "aria-describedby", "aria-haspopup", "aria-roledescription", "aria-description", "aria-placeholder", "aria-valuetext"]);
/** attributes and props that carry visible or announced text (rule 06) */
const TEXT_NAMES = new Set(["label", "title", "text", "description", "placeholder", "hint", "caption", "heading", "subtitle", "message", "summary", "tooltip", "alt", "note", "lead", "legend", "eyebrow", "aria-label", "aria-description", "aria-placeholder", "aria-roledescription", "aria-valuetext"]);
const LETTER = /\p{L}/u;
const BLOCK = "Block";

/** AriaLabel -> aria-label, ariaLabel -> aria-label, label -> label */
export const kebab = (name: string): string => name.replace(/^[A-Z]/, (c) => c.toLowerCase()).replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** every node of the tree, detached markup included */
export function* walk(nodes: IrNode[]): Generator<IrNode> {
  for (const n of nodes) {
    yield n;
    if ("children" in n) yield* walk(n.children);
  }
}

/** the first rendered node of a file: groups are looked through, detached markup is skipped */
export function rootOf(nodes: IrNode[]): IrNode | undefined {
  for (const n of nodes) {
    if (n.kind === "detached") continue;
    if (n.kind === "group" || n.kind === "choice" || n.kind === "loop") { const r = rootOf(n.children); if (r) return r; continue; }
    return n;
  }
  return undefined;
}

const attrsOf = (n: IrNode): IrAttr[] => ("attrs" in n ? n.attrs : []);
const textValue = (s: string): boolean => LETTER.test(s) && !/^[a-z0-9]+([.-][a-z0-9]+)*$/.test(s.trim());
const where = (n: IrNode): string => ("name" in n ? `<${n.name}>` : n.kind);

/**
 * Block count of rule 01: the Blocks of one render path. Exclusive branches (choice) are alternatives, so a path takes the branch
 * with the most Blocks; everything else (siblings, groups, detached markup such as a second component or a snippet) adds up.
 * A Block inside a loop or inside another Block is reported on its own and not counted on the path.
 */
function blockCount(nodes: IrNode[]): Finding[] {
  const out: Finding[] = [];
  const path = (list: IrNode[], inLoop: boolean, inBlock: boolean): IrNode[] => {
    const acc: IrNode[] = [];
    for (const n of list) {
      if (n.kind === "component" && n.name === BLOCK) {
        if (inBlock) out.push({ detector: "block-root", line: n.line, message: "Block nested inside Block" });
        else if (inLoop) out.push({ detector: "block-root", line: n.line, message: "Block inside a loop renders one Block per item; extract the item into its own file" });
        else acc.push(n);
        path(n.children, inLoop, true);
      } else if (n.kind === "choice") {
        let best: IrNode[] = [];
        for (const b of n.branches) { const x = path(b, inLoop, inBlock); if (x.length > best.length) best = x; }
        acc.push(...best);
      } else if (n.kind === "loop") path(n.children, true, inBlock);
      else if ("children" in n) acc.push(...path(n.children, inLoop, inBlock));
    }
    return acc;
  };
  const top = path(nodes, false, false);
  if (top.length > 1) out.unshift({ detector: "block-root", line: top[1]!.line, message: `${top.length} Block in one render path (exclusive if/else branches may each have one); extract the second into its own file` });
  return out;
}

export function detect(file: IrFile, ctx: FileContext): Finding[] {
  const out: Finding[] = [];
  const all = [...walk(file.nodes)];
  // block-root
  const root = rootOf(file.nodes);
  const blockLike = (n: IrNode | undefined): boolean => !!n && n.kind === "component" && (n.name === BLOCK || ctx.rootsOnBlock(n.name) === true);
  if (ctx.blockRoot && root && !blockLike(root)) out.push({ detector: "block-root", line: root.line, message: `root is ${where(root)}, not Block` });
  // any other file (a composite, a part) may open on one Block with a semantic tag: no finding for its root (rule 01 §2)
  out.push(...blockCount(file.nodes));
  for (const n of all) {
    if (n.kind === "raw-html") out.push({ detector: "raw-html", line: n.line, message: `raw HTML injection (${n.name})` });
    if (n.kind === "dynamic") out.push({ detector: "dynamic-tag", line: n.line, message: `dynamic tag ${n.name}` });
    if (n.kind === "element") out.push({ detector: "raw-native-tag", line: n.line, message: `raw <${n.name}>` });
    for (const a of attrsOf(n)) {
      const name = kebab(a.name);
      if (name.startsWith("aria-") && !a.static && !ARIA_NAMING.has(name)) out.push({ detector: "reactive-aria", line: a.line, message: `${a.name} on ${where(n)} is an expression; pass the state through a primitive prop` });
      if (TEXT_NAMES.has(name) && a.strings.some(textValue)) out.push({ detector: "literal-text", line: a.line, message: `literal text in ${a.name}: ${JSON.stringify(a.strings.find(textValue)!.slice(0, 40))}` });
    }
    if (n.kind === "text" && LETTER.test(n.text)) out.push({ detector: "literal-text", line: n.line, message: `text node ${JSON.stringify(n.text.trim().slice(0, 40))}` });
    if (n.kind === "expr" && n.strings.some((s) => LETTER.test(s))) out.push({ detector: "literal-text", line: n.line, message: `literal text in an expression: ${JSON.stringify(n.strings.find((s) => LETTER.test(s))!.slice(0, 40))}` });
  }
  return out;
}
