/** FP-1 front page (SDD §14.6E SDD-FP-03..05, BDD-37): pins, steps, computed summary, no value figures. */
import { describe, expect, it } from "vitest";
import { REFINERY_STEPS, UC_PINS, USE_CASES, statusSummary } from "@/lib/howItWorks";
import { unitLabel } from "@/components/how/RefineryMap";

describe("FP-1 refinery map", () => {
  it("pins every IOCL use case exactly once", () => {
    for (const u of USE_CASES) expect(UC_PINS.filter((p) => p.uc === u.id)).toHaveLength(1);
    expect(UC_PINS).toHaveLength(USE_CASES.length);
  });

  it("places every pin on a refinery step that exists", () => {
    const ids = new Set(REFINERY_STEPS.map((s) => s.id));
    for (const p of UC_PINS) expect(ids.has(p.step)).toBe(true);
  });

  it("has the nine agreed steps with the FCC highlighted and fed heavy gas oil", () => {
    expect(REFINERY_STEPS.map((s) => s.id)).toEqual(
      ["crude", "cdu", "reformer", "hydrotreaters", "fcc", "coker", "lpg", "utilities", "blending"]);
    const fcc = REFINERY_STEPS.filter((s) => s.fcc);
    expect(fcc).toHaveLength(1);
    expect(fcc[0].stream).toBe("heavy gas oil");
    expect(fcc[0].what).toMatch(/heavy gas oil/);
  });

  it("only links pins to real cockpit pages", () => {
    for (const p of UC_PINS) expect(p.href).toMatch(/^\/twin(\/unit\/unit_[1-6]_[a-z]+)?$/);
    expect(unitLabel("/twin/unit/unit_4_fractionator")).toBe("U4");
    expect(unitLabel("/twin")).toBe("FCC Complex");
  });

  it("computes the status summary from USE_CASES", () => {
    expect(statusSummary()).toBe("2 interactive · 4 scripted outcome · 3 partly · 2 watch only · rest not claimed");
  });

  it("shows no value figures", () => {
    const text = JSON.stringify([REFINERY_STEPS, UC_PINS, USE_CASES.map((u) => [u.iocl, u.here, u.where])]);
    expect(text).not.toMatch(/₹|\$|crore|lakh|NPV|ROI|saving|payback|USD|INR/i);
  });
});

/** FP-2 decisions (SDD §14.6E SDD-FP-06..09, BDD-38). */
import { DECISIONS, DECISION_CARD, DECISION_ORDER, FP2_FOOTER, decisionHref } from "@/lib/howItWorks";

describe("FP-2 decisions", () => {
  it("orders all nine decisions once, following the oil", () => {
    expect(DECISION_ORDER).toEqual(["D4", "D6", "D8", "D5", "D1", "D2", "D9", "D3", "D7"]);
    expect(new Set(DECISION_ORDER)).toEqual(new Set(DECISIONS.map((d) => d.id)));
  });

  it("fills every card field", () => {
    for (const id of DECISION_ORDER) {
      const c = DECISION_CARD[id];
      for (const k of ["question", "pain", "solve", "dataIn", "algorithms", "checks", "operatorGets", "onYourPlant", "needFromYou"] as const)
        expect(c[k].trim().length, `${id}.${k}`).toBeGreaterThan(0);
    }
  });

  it("links D1 to the fractionator and D4 to U4", () => {
    const d = Object.fromEntries(DECISIONS.map((x) => [x.id, x]));
    expect(decisionHref(d.D1)).toBe("/twin/unit/unit_4_fractionator");
    expect(decisionHref(d.D4)).toBe("/twin/unit/unit_4_fractionator");
  });

  it("shows no value figures", () => {
    const text = JSON.stringify([DECISION_CARD, FP2_FOOTER]);
    expect(text).not.toMatch(/₹|\$|crore|lakh|NPV|ROI|saving|payback|USD|INR/i);
  });
});
