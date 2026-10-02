import { describe, expect, it } from "vitest";
import {
  citationChips,
  decisionLine,
  eventCaption,
  openDecision,
  primaryMove,
  selectPanels,
  stripInputs,
  sweepPoints,
  traceColor,
  yieldAxis,
  trayNumber,
  indexAtMin,
} from "@/lib/l1";
import { isGrey } from "@/lib/palette";
import type { TwinDecision, TwinPanel, TwinRecipe } from "@/lib/twinTypes";

const panel = (panel_id: string, kind: TwinPanel["kind"]): TwinPanel => ({ panel_id, kind, title: panel_id });

describe("selectPanels (SDD-L1-02)", () => {
  it("keeps the first of each primary kind in SDD order and parks the rest under 'more'", () => {
    const { primary, more } = selectPanels([
      panel("quality", "measured_vs_expected"),
      panel("residual", "residual"),
      panel("quality_2", "measured_vs_expected"),
      panel("residual_2", "residual"),
      panel("yield", "yield"),
      panel("mv", "mv"),
      panel("disturbance", "disturbance"),
      panel("tray_profile", "tray_profile"),
    ]);
    expect(primary.map((p) => p.panel_id)).toEqual(["quality", "residual", "mv", "disturbance", "yield"]);
    expect(more.map((p) => p.panel_id)).toEqual(["quality_2", "residual_2", "tray_profile"]);
  });
});

describe("traceColor (contract §8)", () => {
  it("never returns grey, even when the payload asks for it", () => {
    expect(isGrey(traceColor("mv", "MV_PA1", 0, "#888888"))).toBe(false);
    expect(traceColor("measured", "LCO_T98_F", 0)).toBe("#1d4ed8");
    expect(traceColor("yield", "prod_LCO", 3)).toBe("#1d4ed8");
    expect(traceColor("yield", "prod_slurry", 0)).toBe("#7c2d12");
    expect(traceColor("cusum", "cusum:LCO_T98_F", 0)).toBe("#c2410c");
  });
  it("honours an explicit non-grey colour", () => {
    expect(traceColor("mv", "x", 0, "#ea580c")).toBe("#ea580c");
    // dark register: palette inks, explicit light-register colours are not carried onto the obsidian canvas
    expect(traceColor("measured", "LCO_T98_F", 0, undefined, "dark")).toBe("#22d3ee");
    expect(traceColor("expected", "x", 0, "#047857", "dark")).toBe("#34d399");
    expect(isGrey(traceColor("mv", "MV_PA1", 1, undefined, "dark"))).toBe(false);
  });
});

describe("sweepPoints", () => {
  it("spans the limit box and includes current and recommended", () => {
    const pts = sweepPoints(744.94, 762.75, 752.75, 9, 754.75);
    expect(pts[0]).toBeCloseTo(744.94, 2);
    expect(pts[pts.length - 1]).toBeCloseTo(762.75, 2);
    expect(pts).toContain(752.75);
    expect(pts).toContain(754.75);
    expect(pts).toEqual([...pts].sort((a, b) => a - b));
  });
  it("degrades to the current value when the box is degenerate", () => {
    expect(sweepPoints(5, 5, 5)).toEqual([5]);
  });
});

const decision: TwinDecision = {
  rec_id: "TWIN-x-U4-LCO-600",
  run_id: "r",
  time_min: 600,
  target_id: "LCO_T98_F",
  unit_id: "unit_4_fractionator",
  status: "OPEN",
  action: "RAISE",
  parameter: "SP_LCO_T98 (MV_T17_sp)",
  sp_before: 752.75,
  sp_after: 754.75,
  delta: 2.0,
  unit: "°F",
};

describe("primaryMove", () => {
  const inputs = [
    { tag: "feed_flow_lb_s", label: "Feed rate", value: 165.8, unit: "lb/s" },
    { tag: "SP_LCO_T98", label: "LCO T98 SP", value: 752.75, unit: "°F" },
  ];
  it("uses the first recipe move when the recipe is ISSUED", () => {
    const recipe = {
      moves: [{ sp_tag: "SP_HN_T98", label: "HN T98 SP", current: 532.8, recommended: 534.0, delta: 1.2, unit: "°F", limit_lo: 525, limit_hi: 540 }],
    } as unknown as TwinRecipe;
    expect(primaryMove(recipe, inputs, decision)?.tag).toBe("SP_HN_T98");
  });
  it("falls back to the open decision's set point when the recipe is WITHHELD", () => {
    const recipe = { moves: [], data_support: { searched: ["SP_LCO_T98"], unsupported: [], model_source: {}, note: "" } } as unknown as TwinRecipe;
    const m = primaryMove(recipe, inputs, decision);
    expect(m).toEqual({ tag: "SP_LCO_T98", current: 752.75, recommended: 754.75, unit: "°F", label: "LCO T98 SP" });
  });
  it("returns null when nothing is movable", () => {
    expect(primaryMove(null, [], null)).toBeNull();
  });
});

describe("decisionLine / openDecision / strip / chips / captions", () => {
  it("formats the action line like the mockup", () => {
    expect(decisionLine(decision)).toBe("RAISE SP_LCO_T98 +2.0 °F (752.8 → 754.8)");
  });
  it("prefers the OPEN decision", () => {
    expect(openDecision([{ ...decision, status: "ACCEPTED", rec_id: "a" }, decision])?.rec_id).toBe(decision.rec_id);
  });
  it("keeps feeds/disturbances in the I/O strip and leaves MVs to the chart", () => {
    const got = stripInputs([
      { tag: "dist_feed_API", label: "Feed API", value: 23.3, unit: "" },
      { tag: "MV_PA1", label: "PA1", value: 31.9, unit: "" },
      { tag: "SP_LCO_T98", label: "SP", value: 752, unit: "°F" },
      { tag: "feed_flow_lb_s", label: "Feed rate", value: 165, unit: "lb/s" },
    ]);
    expect(got.map((i) => i.tag)).toEqual(["dist_feed_API", "feed_flow_lb_s"]);
  });
  it("dedupes citation chips across sources", () => {
    expect(citationChips([{ doc_id: "SOP-FRAC-003" }], undefined, [{ doc_id: "INC-0507" }, { doc_id: "SOP-FRAC-003" }])).toEqual(["SOP-FRAC-003", "INC-0507"]);
  });
  it("captions events for the ribbon", () => {
    expect(eventCaption({ tag: "LCO_T98_F", time_min: 1, kind: "cusum", severity: "warn" })).toBe("LCO T98 change-point");
    expect(eventCaption({ tag: "LCO_T98_F", time_min: 1, kind: "breach", severity: "alarm", residual: 4.8, sigma: 3.1 })).toBe("LCO T98 residual breach +4.8 (3.1σ)");
    expect(eventCaption({ tag: "", time_min: 1, kind: "declined", severity: "info" })).toBe("recommendation declined");
  });
});

describe("yieldAxis (per-unit 'Yields / products' scale rule)", () => {
  it("puts product mass flows, coke and fuel on % feed", () => {
    expect(yieldAxis("prod_LCO", "lb/min")).toEqual({ scale: "feed", title: "% feed" });
    expect(yieldAxis("F_coke", "")).toEqual({ scale: "feed", title: "% feed" });
    expect(yieldAxis("F5_fuel", "")).toEqual({ scale: "feed", title: "% feed" });
  });
  it("keeps recoveries and wt-fractions on the percent axis and sends power to the right axis", () => {
    expect(yieldAxis("eff_C3", "%")).toEqual({ scale: "pct", title: "%" });
    expect(yieldAxis("conversion_pct", "")).toEqual({ scale: "pct", title: "%" });
    expect(yieldAxis("C_regen_cat", "")).toEqual({ scale: "wtpct", title: "wt %" });
    expect(yieldAxis("power_CAB", "")).toEqual({ scale: "raw", title: "power" });
    expect(yieldAxis("power_WGC", "")).toEqual({ scale: "raw", title: "power" });
    expect(yieldAxis("something_else", "kg")).toEqual({ scale: "raw", title: "kg" });
  });
});

describe("trayNumber / indexAtMin (tray-profile renderer)", () => {
  it("parses tray keys and rejects others", () => {
    expect(trayNumber("T_tray01_F")).toBe(1);
    expect(trayNumber("T_tray20_F")).toBe(20);
    expect(trayNumber("T2_preheat_F")).toBeNull();
  });
  it("finds the last sample at or before a minute", () => {
    const t = [0, 2, 4, 6, 8];
    expect(indexAtMin(t, 5)).toBe(2);
    expect(indexAtMin(t, 8)).toBe(4);
    expect(indexAtMin(t, 100)).toBe(4);
    expect(indexAtMin(t, -1)).toBe(-1);
    expect(indexAtMin([], 3)).toBe(-1);
  });
});
