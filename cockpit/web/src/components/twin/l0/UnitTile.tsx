"use client";

/**
 * L0 unit tile (SDD-L0-02 amended, verbatim Part 5 Screen A): one live unit = name + state, headline KPI numeral vs
 * plan, the last-4-h fan sparkline (measured over ŷ ± 2σ), a compact N(μ,σ) belief vs plan / spec, and the open
 * decision / agent-flag counts. The whole tile is a link to the unit workbench (`?tag=` lands on the owning panel).
 */

import Link from "next/link";
import { useCockpit } from "@/lib/store";
import { modelColor } from "@/lib/theme";
import { pOnSpec } from "@/lib/gauss";
import type { KpiState, TwinUnit } from "@/lib/twinTypes";
import Sparkline from "@/components/twin/shared/Sparkline";
import GaussianPdf from "@/components/twin/shared/GaussianPdf";

export const STATE_LABEL: Record<KpiState, string> = { OK: "IN ENVELOPE", WATCH: "DRIFT", ACT: "ACT NOW" };
export const UNIT_SHORT: Record<string, string> = {
  unit_1_furnace: "U1 · Feed furnace", unit_2_riser: "U2 · Riser reactor", unit_3_regenerator: "U3 · Regenerator",
  unit_4_fractionator: "U4 · Main fractionator", unit_5_condenser: "U5 · Gas plant", unit_6_stabiliser: "U6 · Stabiliser",
};
const KPI_SHORT: Record<string, string> = { T2_preheat_F: "Preheat outlet T2", conversion_pct: "Riser conversion",
  dT_cyc_reg_F: "Cyclone ΔT (afterburn)", Treg_F: "Regenerator bed T", LCO_T98_F: "LCO T98", HN_T98_F: "HN T98",
  MV_cw_flow: "Cooling-water flow", eff_C5: "C5 recovery" };

const fmt = (v: number | null | undefined, d?: number) => {
  if (v == null || !Number.isFinite(v)) return "—";
  const dd = d ?? (Math.abs(v) >= 100 ? 1 : 2);
  return v.toFixed(dd);
};
const signed = (v: number, d = 1) => `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v).toFixed(d)}`;

export default function UnitTile({ unit }: { unit: TwinUnit }) {
  const theme = useCockpit((s) => s.theme);
  const k = unit.kpi_vs_plan ?? null;
  const state: KpiState = k?.state ?? unit.headline_kpi?.state ?? "OK";
  const sp = unit.spark ?? null;
  const flags = unit.flags ?? 0;
  const dec = unit.decisions_open ?? 0;
  const href = sp?.tag ? `/twin/unit/${unit.unit_id}?tag=${encodeURIComponent(sp.tag)}` : `/twin/unit/${unit.unit_id}`;
  const members = sp && sp.mu != null && sp.sigma != null
    ? [{ id: "belief", label: sp.source, mu: sp.mu, sigma: sp.sigma, weight: 1, color: modelColor("hybrid_delta_v1", theme) }]
    : [];
  const spec = sp
    ? sp.spec_hi != null || sp.spec_lo != null
      ? { lo: sp.spec_lo ?? null, hi: sp.spec_hi ?? null, label: "spec" }
      : sp.plan != null && sp.tol != null
        ? { lo: sp.plan - sp.tol, hi: sp.plan + sp.tol, label: "tol" }
        : null
    : null;
  const p = members.length && spec ? pOnSpec(members[0].mu, members[0].sigma, spec.lo, spec.hi) : null;

  return (
    <Link href={href} className={`u-tile state-${state}`} data-testid="unit-tile" data-unit={unit.unit_id} data-state={state}
      aria-label={`${UNIT_SHORT[unit.unit_id] ?? unit.short_name}: ${k ? `${k.label} ${fmt(k.value)} ${k.unit} vs plan ${fmt(k.plan)}` : "no KPI"}, ${STATE_LABEL[state]}, ${dec} decisions, ${flags} agent flags. Open workbench`}>
      <div className="u-tile-head">
        <span className="u-tile-name">{UNIT_SHORT[unit.unit_id] ?? unit.short_name}</span>
        <span className={`twin-pill-${state} u-tile-pill`}>{STATE_LABEL[state]}</span>
      </div>
      {k ? (
        <div className="u-tile-kpi">
          <span className="u-tile-kpi-label">{KPI_SHORT[k.tag] ?? k.label}</span>
          <span className="u-tile-kpi-row">
            <span className="u-tile-kpi-val mono">{fmt(k.value)}</span>
            <span className="u-tile-kpi-unit">{k.unit}</span>
            <span className={`u-tile-dev mono dev-${state}`}>{signed(k.deviation, Math.abs(k.deviation) >= 10 ? 0 : 1)}</span>
            <span className="u-tile-kpi-plan">vs plan {fmt(k.plan)} <span className="muted">({k.plan_source})</span></span>
          </span>
        </div>
      ) : (
        <div className="u-tile-kpi"><span className="u-tile-kpi-label muted">no expected-value model</span></div>
      )}
      {sp ? (
        <div className="u-tile-curves">
          <div className="u-tile-spark"><Sparkline spark={sp} height={78} /></div>
          <div className="u-tile-pdf">
            {members.length ? (
              <GaussianPdf members={members} target={sp.plan != null ? { value: sp.plan } : null} spec={spec} measured={k?.value ?? null} unit={sp.unit} height={78} compact ariaLabel={`${sp.label} belief μ ${fmt(sp.mu)} σ ${fmt(sp.sigma, 2)}`} />
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="u-tile-foot">
        <span className="mono">{sp?.mu != null ? `μ ${fmt(sp.mu)} · σ ${fmt(sp.sigma, 2)}` : ""}</span>
        {p != null ? <span className={`mono ${p >= 0.9 ? "ok" : p >= 0.6 ? "warn" : "bad"}`}>P(on-spec) {Math.round(p * 100)} %</span> : null}
        <span className="u-tile-counts">{dec} decision{dec === 1 ? "" : "s"} · {flags} flag{flags === 1 ? "" : "s"}</span>
      </div>
    </Link>
  );
}
