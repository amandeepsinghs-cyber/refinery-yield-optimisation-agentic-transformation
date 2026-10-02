"use client";

/**
 * useScreenPart — register what a component is showing so Gemini can describe the open screen (SDD-GEM-04).
 *
 * Call once per rendered tile / panel / card with a compact JSON-serialisable payload (numbers already rounded,
 * labels as the operator reads them). The payload is stored under `id` in the cockpit store's `screenDigest`,
 * re-sent on every Copilot turn as `context.screen.visible`, and removed when the component unmounts.
 * Pass `null` to unregister without unmounting (e.g. a pane that closed).
 */

import { useEffect } from "react";
import { useCockpit } from "./store";

function stableKey(payload: unknown): string {
  try {
    return JSON.stringify(payload) ?? "";
  } catch {
    return "[unserialisable]";
  }
}

export function useScreenPart(id: string, payload: unknown | null) {
  const setScreenPart = useCockpit((s) => s.setScreenPart);
  const key = stableKey(payload);
  useEffect(() => {
    setScreenPart(id, payload);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the serialised payload; identity changes are irrelevant
  }, [id, key, setScreenPart]);
  useEffect(() => () => setScreenPart(id, null), [id, setScreenPart]);
}

/** Round for the digest: 1 decimal above 100, 2 below; null-safe. */
export function dg(v: number | null | undefined, d?: number): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  const dd = d ?? (Math.abs(v) >= 100 ? 1 : 2);
  return Number(v.toFixed(dd));
}
