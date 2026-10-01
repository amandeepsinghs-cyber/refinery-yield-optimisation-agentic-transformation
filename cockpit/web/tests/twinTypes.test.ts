import { describe, expect, it } from "vitest";
import { TwinUnit } from "@/lib/twinTypes";

describe("twinTypes", () => {
  it("type checking sample", () => {
    const unit: TwinUnit = {
      unit_id: "unit_4_fractionator",
      seq: 4,
      name: "FCC Fractionator",
      short_name: "Fractionator",
      status: "WATCH",
      status_label: "LCO T98 off-spec",
      headline_kpi: {
        label: "LCO T98 vs plan",
        value: 761.9,
        plan: 755.0,
        tol: 3.0,
        unit: "°F"
      },
      io: {
        inputs: [],
        outputs: []
      },
      use_cases: []
    };
    expect(unit.unit_id).toBe("unit_4_fractionator");
  });
});
