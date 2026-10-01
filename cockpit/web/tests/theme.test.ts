import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MODEL_COLORS, STATUS, THEME_BOOT_SCRIPT, TOKENS, cssVarName, modelColor } from "@/lib/theme";
import { baseLayout } from "@/lib/plotTheme";
import { extractSection } from "@/lib/knowledge";
import { linkifyCitations, parseCiteHref } from "@/components/copilot/Markdown";
import { clock, citationLabel, minToX, xToMin } from "@/lib/format";

const css = readFileSync(path.resolve(__dirname, "../src/app/globals.css"), "utf8");

function block(selector: string): string {
  const i = css.indexOf(selector);
  expect(i).toBeGreaterThanOrEqual(0);
  return css.slice(i, css.indexOf("}", i));
}

describe("theme tokens", () => {
  it("SDD-UI-02 core values", () => {
    expect(TOKENS.light.bg).toBe("#ffffff");
    expect(TOKENS.dark.bg).toBe("#09090b");
    expect(TOKENS.dark.card).toBe("#0c0c0f");
    expect(TOKENS.dark.border).toBe("#1e1e24");
    expect(TOKENS.light.border).toBe("#e4e4e7");
    expect(TOKENS.light.accent).toBe("#2563eb");
    expect(TOKENS.dark.accent).toBe("#3b82f6");
    expect(STATUS).toEqual({ GREEN: "#16a34a", AMBER: "#d97706", RED: "#dc2626" });
    expect(MODEL_COLORS).toEqual({
      hybrid_delta_v1: "#2563eb",
      pinn_ens_v1: "#0d9488",
      gpr_v1: "#ea580c",
      bayes_ridge_v1: "#64748b",
    });
  });

  it("CSS custom properties mirror the TS tokens for both themes", () => {
    const dark = block('[data-theme="dark"]');
    const light = block('[data-theme="light"] {');
    for (const [k, v] of Object.entries(TOKENS.dark)) expect(dark).toContain(`${cssVarName(k)}: ${v};`);
    for (const [k, v] of Object.entries(TOKENS.light)) expect(light).toContain(`${cssVarName(k)}: ${v};`);
  });

  it("mixture uses the theme text colour", () => {
    expect(modelColor("mixture", "dark")).toBe("#fafafa");
    expect(modelColor("mixture", "light")).toBe("#09090b");
  });

  it("Plotly layout re-themes from tokens", () => {
    const d = baseLayout("dark");
    const l = baseLayout("light");
    expect(d.font?.color).toBe(TOKENS.dark.text);
    expect(l.font?.color).toBe(TOKENS.light.text);
    expect((d.xaxis as { gridcolor: string }).gridcolor).toBe(TOKENS.dark.grid);
    expect((l.xaxis as { gridcolor: string }).gridcolor).toBe(TOKENS.light.grid);
    expect(d.paper_bgcolor).toBe("rgba(0,0,0,0)");
  });

  it("boot script defaults to light and honours a stored choice", () => {
    const run = (stored: string | null) => {
      const attrs: Record<string, string> = {};
      const document = { documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v), style: {} as Record<string, string> } };
      const localStorage = { getItem: () => stored };
      new Function("document", "localStorage", "window", THEME_BOOT_SCRIPT)(document, localStorage, {});
      return attrs["data-theme"];
    };
    expect(run(null)).toBe("light");
    expect(run("light")).toBe("light");
    expect(run("garbage")).toBe("light");
  });

  it("no financial wording in UI tokens / labels", () => {
    expect(/\$|ROI|price|cost/i.test(JSON.stringify(TOKENS))).toBe(false);
  });
});

describe("helpers", () => {
  it("time axis round-trips minutes", () => {
    expect(xToMin(minToX(412))).toBe(412);
    expect(xToMin(minToX(2000))).toBe(2000);
    expect(clock(412)).toBe("06:52");
    expect(clock(1440 + 5)).toBe("D2 00:05");
  });

  it("citation label format [DOC-ID rN §x.y]", () => {
    expect(citationLabel({ doc_id: "SOP-FRAC-003", revision: 4, section: "4.2" })).toBe("[SOP-FRAC-003 r4 §4.2]");
  });

  it("linkifies plain-text citations into preview links", () => {
    const md = linkifyCitations("Hold the set point [SOP-FRAC-003 r4 §4.2].");
    const href = /\((#cite:[^)]+)\)/.exec(md)?.[1];
    expect(href).toBeTruthy();
    expect(parseCiteHref(href!)).toEqual({ doc_id: "SOP-FRAC-003", revision: "4", section: "4.2" });
  });

  it("extracts a numbered section from markdown", () => {
    const md = "# SOP\n## 4 Actions\n### 4.1 Check\ntext a\n### 4.2 Raise the set point\nstep 1\nstep 2\n#### 4.2.1 Detail\nmore\n### 4.3 Next\nz";
    const s = extractSection(md, "4.2");
    expect(s?.title).toBe("Raise the set point");
    expect(s?.markdown).toContain("step 2");
    expect(s?.markdown).toContain("4.2.1 Detail");
    expect(s?.markdown).not.toContain("4.3");
    expect(extractSection(md, "9.9")).toBeNull();
  });
});
