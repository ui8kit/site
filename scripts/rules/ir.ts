// Copied from the source monorepo (xgen/check/src/rules/ir.ts): the common tree of the ui8kit `rules` group, without the
// TypeScript-expression helpers that only the Svelte, React and Vue adapters use. detectors.ts and templ.ts are verbatim copies.
export type Runtime = "svelte" | "react" | "vue" | "templ";

/** an attribute or a prop: static (a literal string or a bare flag) or an expression with the string literals it can evaluate to */
export interface IrAttr { name: string; line: number; static: boolean; value?: string; strings: string[] }

export type IrNode =
  /** a lowercase host element: <div>, <svg> */
  | { kind: "element"; name: string; line: number; attrs: IrAttr[]; children: IrNode[] }
  /** a component: <Block>, <Text> */
  | { kind: "component"; name: string; line: number; attrs: IrAttr[]; children: IrNode[] }
  /** a host tag chosen from a value: svelte:element, <component :is>, <Tag/> of a variable, createElement(tag) */
  | { kind: "dynamic"; name: string; line: number; attrs: IrAttr[]; children: IrNode[] }
  /** raw HTML injection: {@html}, v-html, dangerouslySetInnerHTML */
  | { kind: "raw-html"; name: string; line: number }
  /** a text node */
  | { kind: "text"; text: string; line: number }
  /** a template expression with the string literals it can render */
  | { kind: "expr"; strings: string[]; line: number }
  /** control flow, fragments, slots: transparent for the root, its children are rendered in place */
  | { kind: "group"; line: number; children: IrNode[] }
  /** mutually exclusive branches ({#if}/{:else}, a ternary or `&&`, early returns, v-if/v-else): `branches` holds each branch,
   *  `children` all of them in source order (so a walk still sees every node); an absent branch is an empty list */
  | { kind: "choice"; line: number; children: IrNode[]; branches: IrNode[][] }
  /** markup repeated per item ({#each}, .map, v-for) */
  | { kind: "loop"; line: number; children: IrNode[] }
  /** content rendered from a slot or a snippet: unknown markup, ends the search for a root */
  | { kind: "render"; line: number }
  /** markup that is declared but not rendered at its place (a snippet body, a render function): scanned, never a root */
  | { kind: "detached"; line: number; children: IrNode[] };

export interface IrFile {
  runtime: Runtime;
  /** the rendered top level of the file, in order */
  nodes: IrNode[];
  /** local component name -> import specifier */
  imports: Map<string, string>;
  /** parse error, when the adapter could not read the file */
  error?: string;
}

/** exclusive branches as one node */
export const choice = (line: number, branches: IrNode[][]): IrNode => ({ kind: "choice", line, branches, children: branches.flat() });
