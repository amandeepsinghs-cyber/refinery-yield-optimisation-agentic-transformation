/**
 * Pure helpers for the L1 Unit Workbench (SDD-L1-01..07). No React, no DOM — unit-tested in l1.test.ts.
 */

import type { TwinDecision, TwinEvent, TwinPanel, TwinRecipe, TwinUnitIO } from "./twinTypes";
import { TRACE_PALETTE, isGrey } from "./palette";

/** SDD-L1-02 primary stack order. Anything else (second property pair, tray profile, …) is "more". */
const PRIMARY_KINDS: TwinPanel["kind"][] = ["measured_vs_expected", "residual", "mv", "disturbance", "yield"];

export function selectPanels(panels: TwinPanel[]): { primary: TwinPanel[]; more: TwinPanel[] } {
  const primary: TwinPanel[] = [];
  const more: TwinPanel[] = [];
  const seen = new Set<string>();
  for (const p of panels) {
    const isPrimaryKind = PRIMARY_KINDS.includes(p.kind);
    if (isPrimaryKind && !seen.has(p.kind)) {
      primary.push(p);
      seen.add(p.kind);
    } else {
      more.push(p);
    }
  }
  primary.sort((a, b) => PRIMARY_KINDS.indexOf(a.kind) - PRIMARY_KINDS.indexOf(b.kind));
  return { primary, more };
}

/** Trace colour per contract §8 — never grey. Yields keyed by product; MVs / disturbances by index. */
export function traceColor(role: string, key: string, index: number, explicit?: string): string {
  if (explicit && /^#[0-9a-f]{6}$/i.test(explicit) && !isGrey(explicit)) return explicit;
  switch (role) {
    case "measured":
      return TRACE_PALETTE.measured;
    case "expected":
    case "band_lo":
    case "band_hi":
      return TRACE_PALETTE.expected;
    case "plan":
      return TRACE_PALETTE.plan;
    case "spec":
      return TRACE_PALETTE.spec;
    case "residual":
      return TRACE_PALETTE.residual.base;
    case "sigma3":
      return TRACE_PALETTE.residual.sigma3;
    case "cusum":
      return TRACE_PALETTE.residual.cusum;
    case "mv":
      return TRACE_PALETTE.mvs[index % TRACE_PALETTE.mvs.length];
    case "disturbance":
      return TRACE_PALETTE.disturbances[index % TRACE_PALETTE.disturbances.length];
    case "yield": {
      const k = key.replace(/^prod_/, "");
      const y = TRACE_PALETTE.yields as Record<string, string>;
      return y[k] ?? y[k.toLowerCase()] ?? TRACE_PALETTE.mvs[index % TRACE_PALETTE.mvs.length];
    }
    case "tray_profile":
      return [TRACE_PALETTE.measured, TRACE_PALETTE.expected, TRACE_PALETTE.yields.LN, TRACE_PALETTE.yields.LPG, TRACE_PALETTE.yields.slurry][index % 5];
    default:
      return TRACE_PALETTE.measured;
  }
}

/** Short event-ribbon caption: "breach" / "change-point" / "declined" … */
export function eventCaption(e: TwinEvent): string {
  const k = e.kind.toLowerCase();
  const tag = e.tag ? e.tag.replace(/_F$/, "").replace(/_/g, " ") : "";
  if (k === "cusum") return `${tag} change-point`.trim();
  if (k === "breach") return `${tag} residual breach${e.sigma ? ` ${fmtSigned(e.residual)} (${e.sigma.toFixed(1)}σ)` : ""}`.trim();
  if (k === "accepted") return "recommendation accepted";
  if (k === "declined") return "recommendation declined";
  if (k === "regime_change") return "regime change";
  return `${tag} ${e.kind}`.trim();
}

function fmtSigned(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "";
  return `${v > 0 ? "+" : ""}${v.toFixed(1)}`;
}

/** Evenly spaced sweep across [lo, hi] that always contains `cur` and the recipe's `rec` value. */
export function sweepPoints(lo: number, hi: number, cur: number, n = 9, rec?: number | null): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return [cur];
  const pts = new Set<number>();
  for (let i = 0; i < n; i++) pts.add(round3(lo + ((hi - lo) * i) / (n - 1)));
  pts.add(round3(cur));
  if (rec !== null && rec !== undefined && Number.isFinite(rec)) pts.add(round3(rec));
  return Array.from(pts).filter((v) => v >= lo - 1e-9 && v <= hi + 1e-9).sort((a, b) => a - b);
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;

/** Which set point the optimisation curve sweeps, and where it is now. */
export function primaryMove(
  recipe: TwinRecipe | null,
  inputs: TwinUnitIO[],
  decision?: TwinDecision | null,
): { tag: string; current: number; recommended: number | null; unit: string; label: string } | null {
  const m = recipe?.moves?.[0];
  if (m) return { tag: m.sp_tag, current: m.current, recommended: m.recommended, unit: m.unit, label: m.label };
  const fromDecision = decision?.parameter?.match(/^([A-Za-z0-9_]+)/)?.[1];
  const searched = recipe?.data_support?.searched ?? [];
  const candidates = [fromDecision, ...searched].filter((t): t is string => !!t);
  for (const tag of candidates) {
    const io = inputs.find((i) => i.tag === tag);
    if (io) return { tag, current: io.value, recommended: decision && fromDecision === tag ? decision.sp_after : null, unit: io.unit, label: io.label };
  }
  return null;
}

/** "RAISE SP_LCO_T98 +1.6 °F (758.4 → 760.0)" */
export function decisionLine(d: TwinDecision): string {
  const tag = d.parameter.split(" ")[0];
  const sign = d.delta > 0 ? "+" : d.delta < 0 ? "−" : "";
  return `${d.action} ${tag} ${sign}${Math.abs(d.delta).toFixed(1)} ${d.unit} (${d.sp_before.toFixed(1)} → ${d.sp_after.toFixed(1)})`;
}

/** I/O strip: feeds & disturbances in, products out — set points / MVs are in the MV panel, not the strip. */
export function stripInputs(inputs: TwinUnitIO[], max = 4): TwinUnitIO[] {
  const feeds = inputs.filter((i) => !/^(MV_|SP_)/.test(i.tag));
  return (feeds.length ? feeds : inputs).slice(0, max);
}

export function openDecision(decisions: TwinDecision[]): TwinDecision | null {
  return decisions.find((d) => d.status === "OPEN") ?? decisions[0] ?? null;
}

/** Unique doc ids from recipe + decision + workbench citations, in first-seen order. */
export function citationChips(...lists: ({ doc_id: string }[] | undefined | null)[]): string[] {
  const out: string[] = [];
  for (const l of lists) for (const c of l ?? []) if (c?.doc_id && !out.includes(c.doc_id)) out.push(c.doc_id);
  return out;
}
