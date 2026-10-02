"use client";

/**
 * L0 unit train (UI v2, verbatim VN-6 + ISA-101 register): the six units in process order as flat tiles separated by
 * hairline connectors. A tile answers only the plant head's first question — which unit, is it OK, how far from plan,
 * which way is it trending. Everything deeper (curve with band, N(μ,σ), since-when, ripple, decisions) opens in the
 * right-hand detail pane on hover / focus / tap and in the unit workbench on click.
 *
 * Register rules: status = dot + word (no stripes, no pills); colour only when abnormal; numbers in tabular mono.
 */

import Link from "next/link";
import { useCallback, useRef } from "react";
import { useCockpit } from "@/lib/store";
import { dg, useScreenPart } from "@/lib/screenPart";
import { pOnSpec } from "@/lib/gauss";
import type { KpiState, TwinUnit } from "@/lib/twinTypes";

export const ORDER = ["unit_1_furnace", "unit_2_riser", "unit_3_regenerator", "unit_4_fractionator", "unit_5_condenser", "unit_6_stabiliser"];
export const UNIT_NAME: Record<string, string> = {
  unit_1_furnace: "Feed furnace", unit_2_riser: "Riser reactor", unit_3_regenerator: "Regenerator",
  unit_4_fractionator: "Fractionator", unit_5_condenser: "Gas plant", unit_6_stabiliser: "Stabiliser",
};
export const UNIT_CODE: Record<string, string> = {
  unit_1_furnace: "U1", unit_2_riser: "U2", unit_3_regenerator: "U3", unit_4_fractionator: "U4", unit_5_condenser: "U5", unit_6_stabiliser: "U6",
};
export const STATE_WORD: Record<KpiState, string> = { OK: "In envelope", WATCH: "Drifting", ACT: "Act now" };
export const KPI_NAME: Record<string, string> = {
  T2_preheat_F: "Preheat outlet", conversion_pct: "Riser conversion", dT_cyc_reg_F: "Cyclone ΔT (afterburn)", Treg_F: "Regenerator bed T",
  LCO_T98_F: "LCO T98", HN_T98_F: "HN T98", MV_cw_flow: "Cooling-water flow", eff_C5: "C5 recovery",
};

export const fmt = (v: number | null | undefined, d?: number) => {
  if (v == null || !Number.isFinite(v)) return "—";
  const dd = d ?? (Math.abs(v) >= 100 ? 1 : 2);
  return v.toFixed(dd);
};
export const signed = (v: number, d = 1) => (Math.abs(v) < 0.05 ? "0.0" : `${v > 0 ? "+" : "−"}${Math.abs(v).toFixed(d)}`);

export function unitState(u: TwinUnit): KpiState {
  return u.kpi_vs_plan?.state ?? u.headline_kpi?.state ?? "OK";
}

/** 1 px trend of the measured headline tag (last 4 h). Neutral when normal; coloured only when the unit is abnormal. */
function MiniSpark({ unit, state }: { unit: TwinUnit; state: KpiState }) {
  const sp = unit.spark;
  if (!sp || !sp.time_min.length) return <div className="u2-spark u2-spark-empty" aria-hidden />;
  const W = 220, H = 34, T = 3, B = 3;
  // tile trend = 5-min centred mean of the measured tag (the pane and L1 show the raw 1-min curve)
  const raw = sp.measured;
  const smooth: (number | null)[] = raw.map((_, i) => {
    let n = 0, acc = 0;
    for (let j = Math.max(0, i - 2); j <= Math.min(raw.length - 1, i + 2); j++) { const v = raw[j]; if (v != null && Number.isFinite(v)) { acc += v; n++; } }
    return n ? acc / n : null;
  });
  const ys = smooth.filter((v): v is number => v != null && Number.isFinite(v));
  if (!ys.length) return <div className="u2-spark u2-spark-empty" aria-hidden />;
  let lo = Math.min(...ys), hi = Math.max(...ys);
  if (sp.plan != null) { lo = Math.min(lo, sp.plan); hi = Math.max(hi, sp.plan); }
  const pad = (hi - lo) * 0.1 || 1;
  lo -= pad; hi += pad;
  const t0 = sp.time_min[0], t1 = sp.time_min[sp.time_min.length - 1] || t0 + 1;
  const sx = (x: number) => ((x - t0) / (t1 - t0 || 1)) * W;
  const sy = (y: number) => T + (1 - (y - lo) / (hi - lo)) * (H - T - B);
  let d = "", pen = false;
  sp.time_min.forEach((x, i) => {
    const y = smooth[i];
    if (y == null || !Number.isFinite(y)) { pen = false; return; }
    d += `${pen ? "L" : "M"}${sx(x).toFixed(1)},${sy(y).toFixed(1)}`;
    pen = true;
  });
  const last = [...smooth].reverse().find((v) => v != null && Number.isFinite(v)) as number | undefined;
  return (
    <svg className={`u2-spark st-${state}`} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" data-testid="unit-spark" aria-hidden>
      {sp.plan != null ? <line x1={0} x2={W} y1={sy(sp.plan)} y2={sy(sp.plan)} className="u2-spark-plan" /> : null}
      <path d={d} className="u2-spark-line" vectorEffect="non-scaling-stroke" />
      {last != null ? <circle cx={W} cy={sy(last)} r={2.2} className="u2-spark-dot" /> : null}
    </svg>
  );
}

function UnitTileV2({ unit, onHover }: { unit: TwinUnit; onHover: (id: string | null) => void }) {
  const k = unit.kpi_vs_plan ?? null;
  const state = unitState(unit);
  const sp = unit.spark ?? null;
  const href = sp?.tag ? `/twin/unit/${unit.unit_id}?tag=${encodeURIComponent(sp.tag)}` : `/twin/unit/${unit.unit_id}`;
  const name = UNIT_NAME[unit.unit_id] ?? unit.short_name;
  const code = UNIT_CODE[unit.unit_id] ?? "";
  const kpiLabel = k ? (KPI_NAME[k.tag] ?? k.label) : null;
  const p = sp && sp.mu != null && sp.sigma != null
    ? pOnSpec(sp.mu, sp.sigma, sp.spec_lo ?? (sp.plan != null && sp.tol != null ? sp.plan - sp.tol : null), sp.spec_hi ?? (sp.plan != null && sp.tol != null ? sp.plan + sp.tol : null))
    : null;

  useScreenPart(`train.${code}`, {
    unit: `${code} ${name}`, state: STATE_WORD[state],
    kpi: k ? { label: kpiLabel, value: dg(k.value), unit: k.unit, plan: dg(k.plan), plan_source: k.plan_source, delta_vs_plan: dg(k.deviation, 1) } : null,
    trend_4h: sp ? { first: dg(sp.measured.find((v) => v != null) ?? null), last: dg([...sp.measured].reverse().find((v) => v != null) ?? null) } : null,
    belief: sp && sp.mu != null ? { mu: dg(sp.mu), sigma: dg(sp.sigma, 2), p_on_spec_pct: p != null ? Math.round(p * 100) : null } : null,
    open_decisions: unit.decisions_open ?? 0, agent_flags: unit.flags ?? 0,
  });

  return (
    <Link
      href={href}
      className={`u2-tile st-${state}`}
      data-testid="unit-tile"
      data-unit={unit.unit_id}
      data-state={state}
      onMouseEnter={() => onHover(unit.unit_id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(unit.unit_id)}
      onBlur={() => onHover(null)}
      aria-label={`${code} ${name}: ${STATE_WORD[state]}${k ? `, ${kpiLabel} ${fmt(k.value)} ${k.unit}, ${signed(k.deviation)} vs plan ${fmt(k.plan)}` : ""}. Open workbench`}
    >
      <div className="u2-head">
        <span className="u2-name">{name}</span>
        <span className="u2-code">{code}</span>
      </div>
      <div className={`u2-state st-${state}`}><i className="u2-dot" aria-hidden />{STATE_WORD[state]}</div>
      {k ? (
        <>
          <div className="u2-kpi">
            <span className="u2-val num">{fmt(k.value)}</span>
            <span className="u2-unit">{k.unit}</span>
          </div>
          <div className="u2-sub">
            <span className="u2-label">{kpiLabel}</span>
            <span className={`u2-dev num dev-${state}`}>{signed(k.deviation, Math.abs(k.deviation) >= 10 ? 0 : 1)} <span className="u2-plan">vs plan {fmt(k.plan)}</span></span>
          </div>
        </>
      ) : (
        <div className="u2-kpi"><span className="u2-label subtle">no expected-value model</span></div>
      )}
      <MiniSpark unit={unit} state={state} />
    </Link>
  );
}

export default function UnitTrain({ units }: { units: TwinUnit[] }) {
  const byId = Object.fromEntries(units.map((u) => [u.unit_id, u]));
  const setHoverUnit = useCockpit((s) => s.setHoverUnit);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 120 ms enter / 160 ms leave hysteresis: the pane does not flicker while the pointer crosses the gaps.
  const onHover = useCallback((id: string | null) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setHoverUnit(id), id ? 120 : 160);
  }, [setHoverUnit]);
  return (
    <div className="u-train" data-testid="unit-train" role="list" aria-label="Process units in flow order">
      {ORDER.map((id, i) => {
        const u = byId[id];
        return (
          <div key={id} className="u-train-cell" role="listitem">
            {i > 0 ? <span className={`u-train-link ${id === "unit_3_regenerator" ? "loop" : ""}`} aria-hidden /> : null}
            {u ? <UnitTileV2 unit={u} onHover={onHover} /> : <div className="u2-tile muted">{id}: no data</div>}
          </div>
        );
      })}
    </div>
  );
}
