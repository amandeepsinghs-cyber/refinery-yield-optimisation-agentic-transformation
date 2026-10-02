import { describe, expect, it } from "vitest";
import { cdf, gaussGrid, gaussPath, mixtureMoments, pOnSpec, pdf, sharedPeak } from "@/lib/gauss";

describe("gauss (N(μ,σ) target distributions)", () => {
  it("pdf integrates to ~1 and peaks at μ", () => {
    const g = gaussGrid([{ mu: 760, sigma: 2 }], [], 2001);
    const dx = g[1] - g[0];
    const area = g.reduce((s, x) => s + pdf(x, 760, 2) * dx, 0);
    expect(area).toBeGreaterThan(0.995);
    expect(pdf(760, 760, 2)).toBeGreaterThan(pdf(761, 760, 2));
  });

  it("cdf / P(on-spec) match the normal table", () => {
    expect(cdf(0)).toBeCloseTo(0.5, 6);
    expect(cdf(1.96)).toBeCloseTo(0.975, 3);
    expect(pOnSpec(760, 2, null, 765)).toBeCloseTo(0.9938, 3);     // spec max only
    expect(pOnSpec(760, 2, 756, 764)).toBeCloseTo(0.9545, 3);      // ±2σ tolerance
    expect(pOnSpec(770, 2, null, 765)).toBeLessThan(0.01);         // off-spec belief
  });

  it("grid spans every member ±3.5σ plus reference lines", () => {
    const g = gaussGrid([{ mu: 760, sigma: 1 }, { mu: 762, sigma: 3 }], [775]);
    expect(g[0]).toBeLessThan(756.5);
    expect(g[g.length - 1]).toBeGreaterThan(775);
    expect(gaussGrid([], [])).toEqual([]);
  });

  it("mixture moments are weight-averaged and widen with disagreement", () => {
    const m = mixtureMoments([
      { id: "a", label: "a", mu: 758, sigma: 1, weight: 0.5, color: "#000" },
      { id: "b", label: "b", mu: 762, sigma: 1, weight: 0.5, color: "#000" },
    ])!;
    expect(m.mu).toBeCloseTo(760, 9);
    expect(m.sigma).toBeGreaterThan(2);
    expect(mixtureMoments([])).toBeNull();
  });

  it("path is drawn into the box on a shared peak", () => {
    const members = [{ mu: 0, sigma: 1 }, { mu: 1, sigma: 2 }];
    const peak = sharedPeak(members);
    expect(peak).toBeCloseTo(pdf(0, 0, 1), 9);
    const d = gaussPath(gaussGrid(members), 0, 1, peak, { x0: 0, x1: 100, yBase: 50, yTop: 5 });
    expect(d.startsWith("M")).toBe(true);
    expect(d).toContain("5.0");    // the sharper curve touches the top of the box
    expect(gaussPath([], 0, 1, peak, { x0: 0, x1: 1, yBase: 1, yTop: 0 })).toBe("");
  });
});
