"use client";

/**
 * N(μ,σ) target distribution — the "bell curves" (verbatim VN-1/VN-5, Part 5 Screen B). One curve per committee
 * member (coloured, never grey), the mixture on top, with the plan / sweet-spot (gold dashed), spec or IOW limits
 * (rose dashed) and the measured value (cyan tick). Pure SVG so it is cheap enough for six L0 tiles.
 */

import { useId } from "react";
import { useCockpit } from "@/lib/store";
import { gaussGrid, gaussPath, mixtureMoments, pOnSpec, sharedPeak, type GaussMember } from "@/lib/gauss";
import { paletteFor } from "@/lib/palette";
import { hexA } from "@/lib/plotTheme";

export interface GaussianPdfProps {
  members: GaussMember[];
  /** Theoretical target / plan / sweet spot. */
  target?: { value: number; label?: string } | null;
  /** Spec or IOW limits (either side optional). */
  spec?: { lo?: number | null; hi?: number | null; label?: string } | null;
  /** Live measured value at the cursor. */
  measured?: number | null;
  unit?: string;
  height?: number;
  /** Compact = no axis ticks / member labels (L0 tile). */
  compact?: boolean;
  /** Show the mixture curve on top (default true when > 1 member). */
  showMixture?: boolean;
  ariaLabel?: string;
}

const fmt = (v: number, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : "—");

export default function GaussianPdf({ members, target, spec, measured, unit = "", height = 120, compact = false, showMixture, ariaLabel }: GaussianPdfProps) {
  const theme = useCockpit((s) => s.theme);
  const P = paletteFor(theme);
  const uid = useId().replace(/:/g, "");
  const act = members.filter((m) => Number.isFinite(m.mu) && Number.isFinite(m.sigma) && m.sigma > 0);
  const mix = mixtureMoments(act);
  const curves = [...act];
  const withMix = (showMixture ?? act.length > 1) && mix;
  const grid = gaussGrid(withMix ? [...act, mix] : act, [target?.value, spec?.lo, spec?.hi, measured]);
  const W = 320, H = height;
  const L = compact ? 4 : 8, R = compact ? 4 : 8, T = compact ? 6 : 16, B = compact ? 4 : 18;
  const box = { x0: L, x1: W - R, yBase: H - B, yTop: T };
  const peak = sharedPeak(withMix ? [...act, mix] : act);
  if (!grid.length || !(peak > 0)) {
    return <div className="gauss-empty muted" aria-label={ariaLabel}>No distribution at this minute</div>;
  }
  const g0 = grid[0], g1 = grid[grid.length - 1];
  const sx = (x: number) => box.x0 + ((x - g0) / (g1 - g0 || 1)) * (box.x1 - box.x0);
  const belief = mix ?? { mu: act[0].mu, sigma: act[0].sigma };
  const pSpec = spec && (spec.lo != null || spec.hi != null) ? pOnSpec(belief.mu, belief.sigma, spec.lo, spec.hi) : null;
  const inLimits = (v: number | null | undefined) => v != null && Number.isFinite(v) && v >= g0 && v <= g1;

  return (
    <svg className={`gauss${compact ? " compact" : ""}`} viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label={ariaLabel ?? `Target distribution μ ${fmt(belief.mu)} σ ${fmt(belief.sigma)} ${unit}`}>
      <defs>
        {curves.map((m) => (
          <linearGradient key={m.id} id={`${uid}-${m.id}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={m.color} stopOpacity={theme === "dark" ? 0.32 : 0.22} />
            <stop offset="100%" stopColor={m.color} stopOpacity={0.02} />
          </linearGradient>
        ))}
      </defs>
      {/* spec band shading (outside spec = rose wash) */}
      {spec?.hi != null && inLimits(spec.hi) ? <rect x={sx(spec.hi)} y={T} width={Math.max(0, box.x1 - sx(spec.hi))} height={box.yBase - T} fill={hexA(P.spec, 0.08)} /> : null}
      {spec?.lo != null && inLimits(spec.lo) ? <rect x={box.x0} y={T} width={Math.max(0, sx(spec.lo) - box.x0)} height={box.yBase - T} fill={hexA(P.spec, 0.08)} /> : null}
      {/* baseline */}
      <line x1={box.x0} x2={box.x1} y1={box.yBase} y2={box.yBase} className="gauss-axis" />
      {/* member curves */}
      {curves.map((m) => (
        <g key={m.id}>
          <path d={gaussPath(grid, m.mu, m.sigma, peak, box, true)} fill={`url(#${uid}-${m.id})`} stroke="none" />
          <path d={gaussPath(grid, m.mu, m.sigma, peak, box)} fill="none" stroke={m.color} strokeWidth={compact ? 1.4 : 1.7} strokeDasharray={m.dashed ? "4 3" : undefined} strokeLinejoin="round">
            <title>{`${m.label}: μ ${fmt(m.mu)} σ ${fmt(m.sigma, 2)} ${unit} · w ${m.weight.toFixed(2)}`}</title>
          </path>
        </g>
      ))}
      {withMix && mix ? (
        <path d={gaussPath(grid, mix.mu, mix.sigma, peak, box)} fill="none" stroke="var(--text)" strokeWidth={compact ? 1.6 : 2.1} strokeLinejoin="round">
          <title>{`Mixture: μ ${fmt(mix.mu)} σ ${fmt(mix.sigma, 2)} ${unit}`}</title>
        </path>
      ) : null}
      {/* target / spec / measured */}
      {target && inLimits(target.value) ? (
        <g>
          <line x1={sx(target.value)} x2={sx(target.value)} y1={T} y2={box.yBase} stroke={P.plan} strokeWidth={1.4} strokeDasharray="5 3" />
          {!compact ? <text x={sx(target.value)} y={T - 4} textAnchor="middle" className="gauss-lbl" fill={P.plan}>{target.label ?? "plan"} {fmt(target.value)}</text> : null}
        </g>
      ) : null}
      {spec?.hi != null && inLimits(spec.hi) ? (
        <g>
          <line x1={sx(spec.hi)} x2={sx(spec.hi)} y1={T} y2={box.yBase} stroke={P.spec} strokeWidth={1.4} strokeDasharray="3 3" />
          {!compact ? <text x={sx(spec.hi) + 3} y={T + 9} textAnchor="start" className="gauss-lbl" fill={P.spec}>{spec.label ?? "spec"} ≤ {fmt(spec.hi)}</text> : null}
        </g>
      ) : null}
      {spec?.lo != null && inLimits(spec.lo) ? (
        <g>
          <line x1={sx(spec.lo)} x2={sx(spec.lo)} y1={T} y2={box.yBase} stroke={P.spec} strokeWidth={1.4} strokeDasharray="3 3" />
          {!compact ? <text x={sx(spec.lo) - 3} y={T + 9} textAnchor="end" className="gauss-lbl" fill={P.spec}>≥ {fmt(spec.lo)}</text> : null}
        </g>
      ) : null}
      {measured != null && inLimits(measured) ? (
        <g>
          <line x1={sx(measured)} x2={sx(measured)} y1={box.yBase - (compact ? 10 : 16)} y2={box.yBase + 3} stroke={P.measured} strokeWidth={2.2} />
          <circle cx={sx(measured)} cy={box.yBase} r={compact ? 2.6 : 3.4} fill={P.measured} />
          {!compact ? <text x={sx(measured)} y={box.yBase + 12} textAnchor="middle" className="gauss-lbl" fill={P.measured}>now {fmt(measured)}</text> : null}
        </g>
      ) : null}
      {/* axis ticks */}
      {!compact ? (
        <>
          <text x={box.x0} y={H - 5} className="gauss-tick" textAnchor="start">{fmt(g0)}</text>
          <text x={box.x1} y={H - 5} className="gauss-tick" textAnchor="end">{fmt(g1)} {unit}</text>
        </>
      ) : null}
      {pSpec != null && !compact ? (
        <text x={box.x0 + 2} y={box.yBase - (compact ? 3 : 5)} textAnchor="start" className={compact ? "gauss-p compact" : "gauss-p"} fill={pSpec >= 0.9 ? "var(--green)" : pSpec >= 0.6 ? "var(--amber)" : "var(--red)"}>
          P(on-spec) {Math.round(pSpec * 100)} %
        </text>
      ) : null}
    </svg>
  );
}
