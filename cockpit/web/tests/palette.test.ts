import { describe, expect, it } from "vitest";
import { TRACE_PALETTE, TRACE_PALETTE_DARK, paletteFor, isGrey } from "@/lib/palette";

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

  it("no palette colour is grey (light and dark registers)", () => {
    for (const pal of [TRACE_PALETTE, TRACE_PALETTE_DARK]) {
      const colors = getAllColors(pal);
      expect(colors.length).toBeGreaterThan(0);
      for (const c of colors) {
        expect(isGrey(c), `Color ${c} should not be grey`).toBe(false);
      }
    }
  });

  it("dark register uses high-chroma inks (cyan measured, emerald expected) and paletteFor selects it", () => {
    expect(paletteFor("dark")).toBe(TRACE_PALETTE_DARK);
    expect(paletteFor("light")).toBe(TRACE_PALETTE);
    expect(TRACE_PALETTE_DARK.measured).toBe("#22d3ee");
    expect(TRACE_PALETTE_DARK.expected).toBe("#34d399");
    // every dark ink must be lighter than its light-register counterpart (readable on obsidian)
    const lum = (hex: string) => { const n = parseInt(hex.slice(1), 16); return 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255); };
    expect(lum(TRACE_PALETTE_DARK.measured)).toBeGreaterThan(lum(TRACE_PALETTE.measured));
    expect(lum(TRACE_PALETTE_DARK.spec)).toBeGreaterThan(lum(TRACE_PALETTE.spec));
  });
  
  it("isGrey detects greys correctly", () => {
    expect(isGrey("#808080")).toBe(true);
    expect(isGrey("#ffffff")).toBe(true);
    expect(isGrey("#000000")).toBe(true);
    expect(isGrey("#1d4ed8")).toBe(false);
  });
});
