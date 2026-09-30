import { describe, expect, it } from "vitest";
import { dataSpan, sig3, spanLabel, tickFormatFor, yAxisFit } from "@/lib/format";

describe("window labels", () => {
  it("formats minutes and hours from the data span", () => {
    expect(dataSpan([0, 1, 59])).toBe(60);
    expect(dataSpan([])).toBe(0);
    expect(spanLabel(60)).toBe("Last 60 min");
    expect(spanLabel(720)).toBe("Last 12 h");
    expect(spanLabel(90)).toBe("Last 90 min");
    expect(spanLabel(150)).toBe("Last 2.5 h");
    expect(spanLabel(0)).toBe("Current window");
  });
});

describe("y-axis fit for flat signals", () => {
  it("enforces a minimum range of ±max(0.5% |mean|, floor)", () => {
    const fit = yAxisFit([476.3786, 476.3786, 476.3787], 0.5);
    expect(fit.range).toBeDefined();
    const [lo, hi] = fit.range!;
    expect(hi - lo).toBeCloseTo(2 * 0.005 * 476.3786, 3);
    expect(fit.tickformat).toBe(".1~f");
  });
  it("applies the unit floor when the mean is small", () => {
    const fit = yAxisFit([0, 0, 0], 0.5);
    expect(fit.range).toEqual([-0.5, 0.5]);
  });
  it("leaves varied signals on autorange", () => {
    const fit = yAxisFit([700, 760, 820]);
    expect(fit.range).toBeUndefined();
    expect(fit.tickformat).toBe(",.0f");
  });
  it("ignores nulls and handles empty", () => {
    expect(yAxisFit([null, undefined]).range).toBeUndefined();
    expect(tickFormatFor(0.05)).toBe(".3~f");
  });
});

describe("sig3", () => {
  it("rounds to three significant figures", () => {
    expect(sig3(14012.13)).toBe("14,000");
    expect(sig3(0.028705)).toBe("0.0287");
    expect(sig3(756.102)).toBe("756");
    expect(sig3(1e-6)).toBe("1.00e-6");
    expect(sig3(0)).toBe("0");
  });
});
