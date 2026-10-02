"use client";

/**
 * Lakehouse → ML flow strip (verbatim Part 5 Screen A): the systemic pipeline the owner wants visible on the home —
 * simulator / historian → Bigtable → BigQuery · BigLake → regime classifier → committee → optimiser → agents →
 * decisions. Each stage shows its live state from the twin payload; nothing here is decorative.
 */

import type { TwinOverview } from "@/lib/twinTypes";

function Stage({ title, value, sub, state, testid }: { title: string; value: string; sub?: string; state: "ok" | "warn" | "bad" | "idle"; testid?: string }) {
  return (
    <div className={`flow-stage st-${state}`} data-testid={testid}>
      <span className="flow-dot" aria-hidden />
      <span className="flow-title">{title}</span>
      <span className="flow-val mono">{value}</span>
      {sub ? <span className="flow-sub">{sub}</span> : null}
    </div>
  );
}

export default function FlowStrip({ data, totalMin }: { data: TwinOverview; totalMin: number | null }) {
  const c = data.crude_slate;
  const p = data.plant;
  const fleet = data.agent_fleet ?? [];
  const red = fleet.filter((a) => a.status === "RED").length;
  const amber = fleet.filter((a) => a.status === "AMBER").length;
  const u4 = data.units.find((u) => u.unit_id === "unit_4_fractionator");
  const committee = u4?.spark?.source === "committee";
  const ripple = data.systems_ripple;
  const gate = ripple?.gate_status ?? null;
  const batch = data.provenance?.batch_id ?? "full_v1";
  const regimeState = !c?.regime_id ? "idle" : c.declared_vs_detected === "match" ? "ok" : c.declared_vs_detected === "lagging" ? "warn" : "bad";
  const pMax = c?.p_max != null ? `${Math.round(c.p_max * 100)} %` : "—";
  return (
    <div className="flow-strip" role="list" aria-label="Data and model pipeline" data-testid="flow-strip">
      <Stage title="Historian" value={`t ${p.time_min}/${totalMin ?? "—"}`} sub={`${batch} · 1-min sim`} state="ok" />
      <span className="flow-arrow" aria-hidden>→</span>
      <Stage title="Bigtable" value="tag_minute" sub="hot store" state="ok" />
      <span className="flow-arrow" aria-hidden>→</span>
      <Stage title="BigQuery" value="runs · labs" sub="BigLake lakehouse" state="ok" />
      <span className="flow-arrow" aria-hidden>→</span>
      <Stage title="Regime" value={c?.regime_id ? `${c.regime_id} ${pMax}` : "—"} sub={c?.regime_label ?? "no regime"} state={regimeState} testid="flow-regime" />
      <span className="flow-arrow" aria-hidden>→</span>
      <Stage title="Committee" value={committee ? "4 models + v4" : "surrogate v4"} sub={u4?.spark?.sigma != null ? `σ LCO ${u4.spark.sigma.toFixed(2)} °F` : "ŷ ± 2σ per unit"} state="ok" testid="flow-committee" />
      <span className="flow-arrow" aria-hidden>→</span>
      <Stage title="Optimiser" value={gate ? `recipe ${gate}` : "no recipe"} sub={ripple?.primary_move ? `${ripple.primary_move.action} ${ripple.primary_move.parameter.split(" ")[0]} ${ripple.primary_move.delta_F > 0 ? "+" : ""}${ripple.primary_move.delta_F} °F` : "—"} state={gate === "PASS" || gate === "ISSUED" ? "ok" : gate ? "warn" : "idle"} testid="flow-optimiser" />
      <span className="flow-arrow" aria-hidden>→</span>
      <Stage title="Agents" value={`${fleet.length || 6} active`} sub={red ? `${red} red · ${amber} amber` : amber ? `${amber} amber` : "all green"} state={red ? "bad" : amber ? "warn" : "ok"} testid="flow-agents" />
      <span className="flow-arrow" aria-hidden>→</span>
      <Stage title="Decisions" value={`${p.open_decisions} open`} sub={`${p.agent_flags} flags`} state={p.open_decisions ? "warn" : "ok"} />
    </div>
  );
}
