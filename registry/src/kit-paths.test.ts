import { describe, expect, it } from "bun:test";
import { rewriteKitRefs } from "./kit-paths";

describe("rewriteKitRefs (chaosbun#123)", () => {
  it("rewrites the Tailwind @source of styles/index.css (no trailing slash) to the installed kit", () => {
    const css = '@source "../";\n@source "../../../kit/react/src";\n';
    const out = rewriteKitRefs(css, "styles/index.css", "react");
    expect(out).toBe('@source "../";\n@source "../kit";\n');
    expect(out).not.toContain("kit/react/src");
  });
  it("keeps rewriting imports with a trailing path", () => {
    expect(rewriteKitRefs('import { Box } from "../../kit/react/src/ui/box/box";', "compose/box.tsx", "react"))
      .toBe('import { Box } from "../kit/ui/box/box";');
    expect(rewriteKitRefs("import x from '../../../kit/vue/src/utils';", "blocks/hero/hero.vue", "vue"))
      .toBe("import x from '../../kit/utils';");
  });
  it("leaves other runtimes and unrelated paths alone", () => {
    const s = '@source "../../../kit/vue/src";\nimport a from "../kitchen/x";';
    expect(rewriteKitRefs(s, "styles/index.css", "react")).toBe(s);
  });
});
