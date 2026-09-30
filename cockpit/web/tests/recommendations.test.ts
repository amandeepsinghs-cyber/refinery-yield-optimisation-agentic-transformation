import { describe, expect, it } from "vitest";
import {
  REC_STATUS_BADGE,
  REC_STATUS_LABEL,
  REC_STATUS_META,
  recStatusBadge,
  isRecActionable,
} from "@/lib/recommendations";
import {
  REC_STATUS_BADGE as RE_REC_STATUS_BADGE,
  REC_STATUS_LABEL as RE_REC_STATUS_LABEL,
  recStatusBadge as reRecStatusBadge,
} from "@/components/decision/RecCards";
import type { RecStatus } from "@/lib/types";

describe("recommendation status badge and label mappings", () => {
  it("maps HOLD status to 'HOLD — no safe move' and neutral badge styling", () => {
    expect(REC_STATUS_LABEL.HOLD).toBe("HOLD — no safe move");
    expect(REC_STATUS_BADGE.HOLD).toBe("neutral");

    const badge = recStatusBadge("HOLD");
    expect(badge.label).toBe("HOLD — no safe move");
    expect(badge.badgeClass).toBe("neutral");
    expect(badge.status).toBe("HOLD");
  });

  it("re-exports from RecCards preserve HOLD mapping", () => {
    expect(RE_REC_STATUS_LABEL.HOLD).toBe("HOLD — no safe move");
    expect(RE_REC_STATUS_BADGE.HOLD).toBe("neutral");
    expect(reRecStatusBadge("HOLD")).toEqual({
      status: "HOLD",
      label: "HOLD — no safe move",
      badgeClass: "neutral",
    });
  });

  it("covers all RecStatus values", () => {
    const statuses: RecStatus[] = ["OPEN", "ACCEPTED", "DECLINED", "WITHHELD", "EXPIRED", "HOLD"];
    for (const status of statuses) {
      expect(REC_STATUS_BADGE[status]).toBeDefined();
      expect(REC_STATUS_LABEL[status]).toBeDefined();
      expect(REC_STATUS_META[status]).toBeDefined();

      const b = recStatusBadge(status);
      expect(b.label).toBe(REC_STATUS_LABEL[status]);
      expect(b.badgeClass).toBe(REC_STATUS_BADGE[status]);
    }
  });

  it("correctly identifies non-actionable cards", () => {
    expect(isRecActionable("OPEN")).toBe(true);
    expect(isRecActionable("HOLD")).toBe(false);
    expect(isRecActionable("WITHHELD")).toBe(false);
    expect(isRecActionable("ACCEPTED")).toBe(false);
    expect(isRecActionable("DECLINED")).toBe(false);
    expect(isRecActionable("EXPIRED")).toBe(false);
  });

  it("gracefully falls back for unknown status strings", () => {
    const fallback = recStatusBadge("CUSTOM_STATUS");
    expect(fallback.label).toBe("CUSTOM_STATUS");
    expect(fallback.badgeClass).toBe("neutral");
  });
});
