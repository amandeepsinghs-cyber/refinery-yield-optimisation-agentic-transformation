import { afterEach, describe, expect, it, vi } from "vitest";
import { labDrawMinutes, modeOf, modeSegments } from "@/lib/controllerMode";
import { useToasts, toast } from "@/lib/toast";

describe("controller mode strip", () => {
  it("maps cutpoint_auto to Manual / Trim", () => {
    expect(modeOf(0)).toBe("Manual");
    expect(modeOf(1)).toBe("Trim");
    expect(modeOf(null)).toBeNull();
    expect(modeOf(Number.NaN)).toBeNull();
  });
  it("builds contiguous segments", () => {
    const t = [0, 1, 2, 3, 4, 5];
    expect(modeSegments(t, [0, 0, 1, 1, 1, 0])).toEqual([
      { mode: "Manual", start: 0, end: 2 },
      { mode: "Trim", start: 2, end: 5 },
      { mode: "Manual", start: 5, end: 6 },
    ]);
  });
  it("null samples break segments; empty input gives nothing", () => {
    expect(modeSegments([10, 11, 12, 13], [1, null, null, 1])).toEqual([
      { mode: "Trim", start: 10, end: 11 },
      { mode: "Trim", start: 13, end: 14 },
    ]);
    expect(modeSegments([], [])).toEqual([]);
  });
  it("finds lab draw minutes", () => {
    expect(labDrawMinutes([0, 1, 2, 3], [0, 1, null, 1])).toEqual([1, 3]);
  });
});

describe("toast store", () => {
  afterEach(() => {
    vi.useRealTimers();
    useToasts.setState({ toasts: [] });
  });
  it("shows the Scene 1 accept text and auto-dismisses", () => {
    vi.useFakeTimers();
    toast("Recorded. The cockpit never writes to the DCS.");
    expect(useToasts.getState().toasts.map((t) => t.text)).toEqual(["Recorded. The cockpit never writes to the DCS."]);
    vi.advanceTimersByTime(5000);
    expect(useToasts.getState().toasts).toEqual([]);
  });
});
