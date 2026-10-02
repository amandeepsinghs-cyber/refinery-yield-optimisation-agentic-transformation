"use client";

/**
 * SVG fan sparkline for an L0 unit tile (SDD-L0-02 amended): measured (cyan, 2 px) over the expected ŷ (emerald)
 * and its ±2σ band, plan dashed (gold), spec dotted (rose), live dot at the cursor. No axes — the tile's KPI
 * numerals carry the scale; hover title gives the window.
 */

import { useCockpit } from "@/lib/store";
import { paletteFor } from "@/lib/palette";
import { hexA } from "@/lib/plotTheme";
import type { TwinSpark } from "@/lib/twinTypes";

type Pt = [number, number];

function path(pts: Pt[], sx: (x: number) => number, sy: (y: number) => number): string {
  let d = "";
  let pen = false;
  for (const [x, y] of pts) {
    if (!Number.isFinite(y)) { pen = false; continue; }
    d += `${pen ? "L" : "M"}${sx(x).toFixed(1)},${sy(y).toFixed(1)}`;
    pen = true;
  }
  return d;
}

export default function Sparkline({ spark, height = 72, ariaLabel }: { spark: TwinSpark; height?: number; ariaLabel?: string }) {
  const theme = useCockpit((s) => s.theme);
  const P = paletteFor(theme);
  const W = 320, H = height, L = 2, R = 8, T = 6, B = 4;
  const t = spark.time_min;
  if (!t.length) return null;
  const ys: number[] = [];
  for (const arr of [spark.measured, spark.expected, spark.band_lo, spark.band_hi]) for (const v of arr) if (v != null && Number.isFinite(v)) ys.push(v);
  if (spark.plan != null) ys.push(spark.plan);
  if (!ys.length) return null;
  let lo = Math.min(...ys), hi = Math.max(...ys);
  if (spark.spec_hi != null && spark.spec_hi < hi + (hi - lo) * 0.6) hi = Math.max(hi, spark.spec_hi);
  const pad = (hi - lo) * 0.08 || 1;
  lo -= pad; hi += pad;
  const t0 = t[0], t1 = t[t.length - 1];
  const sx = (x: number) => L + ((x - t0) / (t1 - t0 || 1)) * (W - L - R);
  const sy = (y: number) => T + (1 - (y - lo) / (hi - lo || 1)) * (H - T - B);
  const zip = (arr: (number | null)[]): Pt[] => t.map((x, i) => [x, arr[i] == null ? NaN : (arr[i] as number)]);

  // band polygon: hi forward, lo backward (only finite segments)
  const hiPts = zip(spark.band_hi).filter((p) => Number.isFinite(p[1]));
  const loPts = zip(spark.band_lo).filter((p) => Number.isFinite(p[1]));
  const band = hiPts.length && loPts.length
    ? `${path(hiPts, sx, sy)}${loPts.slice().reverse().map(([x, y]) => `L${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join("")}Z`
    : "";
  const lastI = (() => { for (let i = t.length - 1; i >= 0; i--) if (spark.measured[i] != null) return i; return -1; })();
  const now = lastI >= 0 ? (spark.measured[lastI] as number) : null;
  const title = `${spark.label}: ${spark.time_min[0]}–${spark.time_min[spark.time_min.length - 1]} min · now ${now?.toFixed(2) ?? "—"} ${spark.unit} · expected ${spark.mu?.toFixed(2) ?? "—"} ± ${spark.sigma != null ? (2 * spark.sigma).toFixed(2) : "—"} (${spark.source})`;

  return (
    <svg className="spark-fan" viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" role="img" aria-label={ariaLabel ?? title} data-testid="unit-spark">
      <title>{title}</title>
      {band ? <path d={band} fill={hexA(P.band, theme === "dark" ? 0.1 : 0.08)} stroke="none" /> : null}
      {spark.spec_hi != null && spark.spec_hi >= lo && spark.spec_hi <= hi ? (
        <line x1={L} x2={W - R} y1={sy(spark.spec_hi)} y2={sy(spark.spec_hi)} stroke={P.spec} strokeWidth={1.2} strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
      ) : null}
      {spark.plan != null ? (
        <line x1={L} x2={W - R} y1={sy(spark.plan)} y2={sy(spark.plan)} stroke={P.plan} strokeWidth={1.2} strokeDasharray="5 3" vectorEffect="non-scaling-stroke" />
      ) : null}
      <path d={path(zip(spark.expected), sx, sy)} fill="none" stroke={P.expected} strokeWidth={1.2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      <path d={path(zip(spark.measured), sx, sy)} fill="none" stroke={P.measured} strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      {now != null && lastI >= 0 ? (
        <>
          <circle cx={sx(t[lastI])} cy={sy(now)} r={4.5} fill={hexA(P.measured, 0.25)} />
          <circle cx={sx(t[lastI])} cy={sy(now)} r={2.4} fill={P.measured} />
        </>
      ) : null}
    </svg>
  );
}
