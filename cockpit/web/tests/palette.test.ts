import { describe, expect, it } from "vitest";
import { TRACE_PALETTE, isGrey } from "@/lib/palette";

describe("palette", () => {
  const getAllColors = (obj: any): string[] => {
    let colors: string[] = [];
    for (const val of Object.values(obj)) {
      if (typeof val === "string") colors.push(val);
      else if (Array.isArray(val)) colors.push(...val);
      else colors.push(...getAllColors(val));
    }
    return colors;
  };

  it("no palette colour is grey", () => {
    const colors = getAllColors(TRACE_PALETTE);
    expect(colors.length).toBeGreaterThan(0);
    for (const c of colors) {
      expect(isGrey(c), `Color ${c} should not be grey`).toBe(false);
    }
  });
  
  it("isGrey detects greys correctly", () => {
    expect(isGrey("#808080")).toBe(true);
    expect(isGrey("#ffffff")).toBe(true);
    expect(isGrey("#000000")).toBe(true);
    expect(isGrey("#1d4ed8")).toBe(false);
  });
});
