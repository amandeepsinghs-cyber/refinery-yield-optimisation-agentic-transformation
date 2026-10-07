"use client";

/**
 * Rail card 2 — Optimisation / Recipe (E4, SDD-L1-03): recommended moves with what-if sliders bound to the regime
 * surrogates, plus a P(on-spec) · Δ-yield curve over the primary set point's limit box (client-side sweep of
 * POST /api/recipe/whatif). When the recipe is WITHHELD the card still lets the operator explore, but says so.
 */

import { probPct } from "@/lib/prob";
import { useEffect, useMemo, useRef, useState } from "react";
import { postWhatIf } from "@/lib/twinApi";
import { num, signed } from "@/lib/format";
import { primaryMove, sweepPoints } from "@/lib/l1";
import type { TwinDecision, TwinRecipe, TwinUnitIO, TwinWhatIf } from "@/lib/twinTypes";

interface CurvePt { sp: number; p: number | null; dy: number | null; obj: number | null }

export interface OptimisationCardProps {
  recipe: TwinRecipe | null;
  decision: TwinDecision | null;
  inputs: TwinUnitIO[];
  unitId: string;
  runId: string;
  timeMin: number;
}

export default function OptimisationCard({ recipe, decision, inputs, unitId, runId, timeMin }: OptimisationCardProps) {
  const pm = useMemo(() => primaryMove(recipe, inputs, decision), [recipe, inputs, decision]);
  const moves = recipe?.moves ?? [];
  const withheld = !recipe || recipe.gate === "WITHHELD";

  const [vals, setVals] = useState<Record<string, number>>({});
  const [effects, setEffects] = useState<TwinWhatIf | null>(null);
  const [curve, setCurve] = useState<CurvePt[]>([]);
  const [box, setBox] = useState<{ lo: number; hi: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset slider state whenever the recipe (minute) changes.
  useEffect(() => {
    const init: Record<string, number> = {};
    for (const m of moves) init[m.sp_tag] = m.recommended;
    if (pm && !(pm.tag in init)) init[pm.tag] = pm.recommended ?? pm.current;
    setVals(init);
    setEffects(null);
    setCurve([]);
    setBox(null);
  }, [recipe?.recipe_id, pm?.tag]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sweep the primary set point across its limit box (one probe to learn the box, then ≤ 11 points in parallel).
  useEffect(() => {
    if (!pm || !runId) return;
    let live = true;
    (async () => {
      try {
        setBusy(true);
        const probe = await postWhatIf(runId, timeMin, unitId, { [pm.tag]: pm.current });
        if (!live) return;
        const lim = probe.limits?.[pm.tag];
        const m = moves.find((x) => x.sp_tag === pm.tag);
        const lo = lim?.box_lo ?? m?.limit_lo ?? pm.current - 5;
        const hi = lim?.box_hi ?? m?.limit_hi ?? pm.current + 5;
        setBox({ lo, hi });
        const pts = sweepPoints(lo, hi, pm.current, 9, pm.recommended);
        const others: Record<string, number> = {};
        for (const o of moves) if (o.sp_tag !== pm.tag) others[o.sp_tag] = o.recommended;
        const atRecommended: Record<string, number> = { ...others, [pm.tag]: pm.recommended ?? pm.current };
        const [res, eff] = await Promise.all([
          Promise.all(pts.map((sp) => postWhatIf(runId, timeMin, unitId, { ...others, [pm.tag]: sp }).catch(() => null))),
          postWhatIf(runId, timeMin, unitId, atRecommended).catch(() => probe),
        ]);
        if (!live) return;
        setCurve(pts.map((sp, i) => {
          const r = res[i];
          const pk = r ? Object.keys(r.p_on_spec)[0] : undefined;
          const yk = r ? Object.keys(r.d_yield_pct_feed)[0] : undefined;
          return { sp, p: r && pk ? r.p_on_spec[pk] : null, dy: r && yk ? r.d_yield_pct_feed[yk] : null, obj: r?.objective ?? null };
        }));
        setEffects(eff);
      } finally {
        if (live) setBusy(false);
      }
    })();
    return () => { live = false; };
  }, [pm?.tag, pm?.current, runId, timeMin, unitId]); // eslint-disable-line react-hooks/exhaustive-deps

  const onSlide = (tag: string, v: number) => {
    const next = { ...vals, [tag]: v };
    setVals(next);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      if (!runId) return;
      postWhatIf(runId, timeMin, unitId, next).then(setEffects).catch(() => undefined);
    }, 250);
  };

  if (!pm) {
    return (
      <section className="l1-card" data-testid="rail-optimisation">
        <h3 className="l1-card-title">Optimisation</h3>
        <p className="muted">No movable set point is exposed for this unit yet.</p>
      </section>
    );
  }

  const pKey = effects ? Object.keys(effects.p_on_spec)[0] : undefined;
  const yKey = effects ? Object.keys(effects.d_yield_pct_feed)[0] : undefined;
  const pNow = effects && pKey ? effects.p_on_spec[pKey] : null;
  const dyNow = effects && yKey ? effects.d_yield_pct_feed[yKey] : null;
  const sliders = moves.length ? moves.map((m) => ({ tag: m.sp_tag, label: m.label, current: m.current, lo: m.limit_lo, hi: m.limit_hi, unit: m.unit }))
    : [{ tag: pm.tag, label: pm.label, current: pm.current, lo: box?.lo ?? pm.current - 5, hi: box?.hi ?? pm.current + 5, unit: pm.unit }];

  return (
    <section className="l1-card" data-testid="rail-optimisation" aria-busy={busy}>
      <h3 className="l1-card-title">Optimisation {withheld && <span className="l1-tag warn">recipe withheld — exploration only</span>}</h3>
      {withheld && recipe?.gate_reason && <p className="l1-card-note">{recipe.explanation || `Gate: ${recipe.gate_reason}`}</p>}
      <Curve pts={curve} current={pm.current} chosen={vals[pm.tag] ?? pm.current} recommended={pm.recommended} tag={pm.tag} unit={pm.unit} pKey={pKey} yKey={yKey} />
      <div className="l1-sliders">
        {sliders.map((s) => {
          const v = vals[s.tag] ?? s.current;
          const d = v - s.current;
          return (
            <label key={s.tag} className="l1-slider">
              <span className="l1-slider-head">
                <span>{s.label} <span className="mono muted">{s.tag}</span></span>
                <span className="mono">{num(s.current, 1)} → <strong>{num(v, 1)}</strong> {s.unit} <span className={d > 0 ? "ok" : d < 0 ? "warn" : "muted"}>Δ {signed(d, 1)}</span></span>
              </span>
              <input type="range" min={s.lo} max={s.hi} step={0.1} value={v} onChange={(e) => onSlide(s.tag, parseFloat(e.target.value))} aria-label={`${s.label} set point`} />
              <span className="l1-slider-lim mono muted"><span>{num(s.lo, 1)}</span><span>{num(s.hi, 1)}</span></span>
            </label>
          );
        })}
      </div>
      <div className="l1-effects">
        <div><span className="l1-stat-k">P(off-spec){pKey ? ` ${pKey}` : ""}</span><span className="l1-stat-v mono big">{pNow == null ? "—" : probPct(1 - pNow)}</span></div>
        <div><span className="l1-stat-k">Yield shift{yKey ? ` ${yKey}` : ""}</span><span className="l1-stat-v mono big">{dyNow == null ? "—" : `${signed(dyNow, 2)} % feed`}</span></div>
        {effects && (
          <div className="l1-effects-row mono muted">
            fuel {signed(effects.d_fuel_lb_s ?? recipe?.d_fuel_lb_s ?? 0, 2)} lb/s · power {signed(effects.d_power_MW ?? recipe?.d_power_MW ?? 0, 2)} MW · coke {signed(effects.d_coke_pct ?? recipe?.d_coke_pct ?? 0, 2)} %
            {effects.within_limits === false && <span className="bad"> · outside limits</span>}
          </div>
        )}
      </div>
    </section>
  );
}

/** Small SVG: P(on-spec) (left axis) and Δ yield (right axis) vs set point; current ○, chosen │, recommended ●. */
function Curve({ pts, current, chosen, recommended, tag, unit, pKey, yKey }: {
  pts: CurvePt[]; current: number; chosen: number; recommended: number | null; tag: string; unit: string; pKey?: string; yKey?: string;
}) {
  const W = 300, H = 120, L = 34, R = 34, T = 10, B = 24;
  const xs = pts.map((p) => p.sp);
  const lo = xs.length ? Math.min(...xs) : current - 1;
  const hi = xs.length ? Math.max(...xs) : current + 1;
  const dys = pts.map((p) => p.dy).filter((v): v is number => v != null);
  const dyMin = dys.length ? Math.min(0, ...dys) : -1;
  const dyMax = dys.length ? Math.max(0, ...dys) : 1;
  const X = (sp: number) => L + ((sp - lo) / Math.max(hi - lo, 1e-9)) * (W - L - R);
  const YP = (p: number) => T + (1 - p) * (H - T - B);
  const YD = (d: number) => T + (1 - (d - dyMin) / Math.max(dyMax - dyMin, 1e-9)) * (H - T - B);
  const path = (sel: (p: CurvePt) => number | null, Y: (v: number) => number) =>
    pts.filter((p) => sel(p) != null).map((p, i) => `${i ? "L" : "M"}${X(p.sp).toFixed(1)},${Y(sel(p) as number).toFixed(1)}`).join(" ");
  const best = pts.reduce<CurvePt | null>((b, p) => (p.obj != null && (b == null || (b.obj ?? -Infinity) < p.obj) ? p : b), null);
  const optSp = recommended ?? best?.sp ?? null;
  return (
    <svg className="l1-curve" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`P(on-spec) and yield shift versus ${tag}`} data-testid="optimisation-curve">
      <line x1={L} y1={H - B} x2={W - R} y2={H - B} className="l1-curve-axis" />
      <line x1={L} y1={T} x2={L} y2={H - B} className="l1-curve-axis" />
      <line x1={W - R} y1={T} x2={W - R} y2={H - B} className="l1-curve-axis" />
      {[0, 0.5, 1].map((p) => <text key={p} x={L - 4} y={YP(p) + 3} textAnchor="end" className="l1-curve-tick">{p.toFixed(1)}</text>)}
      {dys.length > 0 && [dyMin, dyMax].map((d, i) => <text key={`dy-${i}`} x={W - R + 4} y={YD(d) + 3} textAnchor="start" className="l1-curve-tick">{signed(d, 2)}</text>)}
      <text x={L} y={H - 6} className="l1-curve-tick">{num(lo, 1)}</text>
      <text x={W - R} y={H - 6} textAnchor="end" className="l1-curve-tick">{num(hi, 1)}</text>
      <text x={(L + W - R) / 2} y={H - 6} textAnchor="middle" className="l1-curve-label">{tag}{unit ? ` (${unit})` : ""}</text>
      <text x={L + 2} y={H - B - 4} className="l1-curve-label" fill="var(--m-hybrid)">P(on-spec{pKey ? ` ${pKey}` : ""})</text>
      {yKey && <text x={W - R - 2} y={H - B - 4} textAnchor="end" className="l1-curve-label" fill="var(--m-pinn)">Δ yield {yKey}</text>}
      {pts.length > 1 && <path d={path((p) => p.p, YP)} fill="none" stroke="var(--m-hybrid)" strokeWidth={1.8} />}
      {pts.length > 1 && dys.length > 0 && <path d={path((p) => p.dy, YD)} fill="none" stroke="var(--m-pinn)" strokeWidth={1.4} strokeDasharray="4 3" />}
      <line x1={X(chosen)} y1={T} x2={X(chosen)} y2={H - B} stroke="var(--text)" strokeWidth={1} strokeDasharray="2 2" opacity={0.6} />
      <circle cx={X(current)} cy={pAt(pts, current, YP, H - B)} r={4} fill="var(--card)" stroke="var(--m-hybrid)" strokeWidth={1.6}><title>current {num(current, 1)}</title></circle>
      {optSp != null && <circle cx={X(optSp)} cy={pAt(pts, optSp, YP, H - B)} r={4.5} fill="var(--m-pinn)"><title>recommended {num(optSp, 1)}</title></circle>}
      {pts.length === 0 && <text x={W / 2} y={H / 2} textAnchor="middle" className="l1-curve-tick">sweeping surrogate…</text>}
    </svg>
  );
}

function pAt(pts: CurvePt[], sp: number, YP: (p: number) => number, floor: number): number {
  const hit = pts.find((p) => Math.abs(p.sp - sp) < 1e-6 && p.p != null);
  if (hit) return YP(hit.p as number);
  const near = pts.filter((p) => p.p != null).sort((a, b) => Math.abs(a.sp - sp) - Math.abs(b.sp - sp))[0];
  return near ? YP(near.p as number) : floor;
}
