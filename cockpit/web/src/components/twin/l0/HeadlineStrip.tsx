"use client";

/**
 * L0 headline, crude line and footer (UI v2, Pyramid Principle Q1 / Q2 / Q4):
 *
 *   Headline — one sentence that answers "is the refinery OK, and if not where": units in envelope, the worst
 *              deviation with since-when and the crude-switch cause when it applies, and how many real
 *              recommendations (Δ ≠ 0) are open. No counters, no pills.
 *   CrudeLine — declared vs detected slate on one line (match / lagging / mismatch as dot + word).
 *   Footer    — "can I trust the numbers": data provenance, cadence, mass closure, flags. Muted, one line.
 */

import { clock } from "@/lib/format";
import { dg, useScreenPart } from "@/lib/screenPart";
import type { TwinOverview } from "@/lib/twinTypes";
import { realDecisions } from "./DetailPane";
import { KPI_NAME, UNIT_NAME, signed, unitState } from "./UnitTrain";

const RANK = { ACT: 0, WATCH: 1, OK: 2 } as const;

export function Headline({ data }: { data: TwinOverview }) {
  const units = data.units;
  const ok = units.filter((u) => unitState(u) === "OK").length;
  const worst = [...units].sort((a, b) => RANK[unitState(a)] - RANK[unitState(b)] || Math.abs(b.kpi_vs_plan?.deviation ?? 0) - Math.abs(a.kpi_vs_plan?.deviation ?? 0))[0];
  const ws = worst ? unitState(worst) : "OK";
  const k = worst?.kpi_vs_plan ?? null;
  const since = worst ? data.needs_attention.find((n) => n.unit_id === worst.unit_id)?.time_label ?? null : null;
  const c = data.crude_slate;
  const t = data.plant.time_min;
  const switchRecent = c && c.last_switch_min != null && t - c.last_switch_min >= 0 && t - c.last_switch_min <= 360;
  const { moves } = realDecisions(units);

  let issue: string;
  if (ws === "OK" || !worst || !k) issue = "all units tracking plan";
  else issue = `${UNIT_NAME[worst.unit_id] ?? worst.short_name} ${KPI_NAME[k.tag] ?? k.label} ${signed(k.deviation, 1)} ${k.unit} vs plan${since ? ` since ${since}` : ""}`;
  const cause = switchRecent && ws !== "OK" ? ` (crude switch ${c.declared_regime_id !== c.regime_id ? `${c.declared_regime_id}→` : ""}${c.regime_id} at ${clock(c.last_switch_min)})` : "";
  const action = moves.length ? `${moves.length} recommendation${moves.length === 1 ? "" : "s"} to review` : "no set-point move needed";

  useScreenPart("headline", { units_in_envelope: `${ok} of ${units.length}`, issue: issue + cause, action, clock: data.plant.clock, shift: data.plant.shift_label });

  return (
    <p className={`l0-headline st-${ws}`} data-testid="l0-headline">
      <span className="l0-headline-count"><span className="num">{ok}</span> of <span className="num">{units.length}</span> units in envelope</span>
      <span className="l0-headline-sep" aria-hidden>·</span>
      <span className={`l0-headline-issue ${ws !== "OK" ? `dev-${ws}` : ""}`}>{issue}<span className="subtle">{cause}</span></span>
      <span className="l0-headline-sep" aria-hidden>·</span>
      <span className="l0-headline-action">{action}</span>
    </p>
  );
}

export function CrudeLine({ data }: { data: TwinOverview }) {
  const c = data.crude_slate;
  const has = !!c?.regime_id;
  const match = c?.declared_vs_detected ?? "match";
  const cls = match === "match" ? "OK" : match === "lagging" ? "WATCH" : "ACT";
  const word = match === "match" ? "declared matches detected" : match === "lagging" ? "detection lagging the declared switch" : "declared ≠ detected";
  useScreenPart("crude", has ? { declared_api: dg(c.declared_api, 1), declared_regime: c.declared_regime_id, detected_regime: `${c.regime_id} ${c.regime_label}`,
    detected_confidence_pct: Math.round((c.p_max ?? 0) * 100), transition_pct: c.transition_pct, novelty: dg(c.novelty, 2), status: word,
    last_switch: clock(c.last_switch_min), settled_min: c.settled_min } : null);
  if (!has) return null;
  return (
    <p className="l0-crude" data-testid="crude-banner">
      <span className="l0-crude-label">Crude slate</span>
      <span>Declared <span className="num">{c.declared_api?.toFixed(1)} °API</span> <span className="subtle">({c.declared_regime_id})</span></span>
      <span className="l0-headline-sep" aria-hidden>·</span>
      <span>Detected <strong>{c.regime_label}</strong> <span className="num">{Math.round((c.p_max ?? 0) * 100)} %</span></span>
      <span className="l0-headline-sep" aria-hidden>·</span>
      <span className={`u2-state st-${cls}`}><i className="u2-dot" aria-hidden />{word}</span>
      <span className="l0-headline-sep" aria-hidden>·</span>
      <span className="subtle">switched <span className="num">{clock(c.last_switch_min)}</span>, transition <span className="num">{c.transition_pct}%</span>, novelty <span className="num">{(c.novelty ?? 0).toFixed(2)}</span></span>
    </p>
  );
}

export function Footer({ data, totalMin }: { data: TwinOverview; totalMin: number | null }) {
  const p = data.plant;
  const prov = data.provenance;
  const mc = p.mass_closure_pct == null ? null : Math.abs(p.mass_closure_pct) < 0.005 ? 0 : p.mass_closure_pct;
  useScreenPart("footer", { data_source: prov ? `${prov.source} · ${prov.batch_id} · ${prov.run_id}` : "simulated", cadence: "1-min historian", sim_minute: `${p.time_min}${totalMin ? ` / ${totalMin}` : ""}`,
    mass_closure_pct: dg(mc, 2), open_decisions: p.open_decisions, agent_flags: p.agent_flags, top_flag: p.top_flag, advisory_only: prov?.advisory_only ?? true });
  return (
    <p className="l0-foot" data-testid="plant-strip">
      <span>{prov ? `Simulated data · ${prov.batch_id} · ${prov.run_id}` : "Simulated data"}</span>
      <span className="l0-headline-sep" aria-hidden>·</span>
      <span>1-min historian · t <span className="num">{p.time_min}</span>{totalMin ? <span className="subtle num"> / {totalMin}</span> : null}</span>
      <span className="l0-headline-sep" aria-hidden>·</span>
      <span>Plant mass closure <span className="num">{mc == null ? "—" : mc === 0 ? "0.00 %" : `${mc > 0 ? "+" : "−"}${Math.abs(mc).toFixed(2)} %`}</span></span>
      <span className="l0-headline-sep" aria-hidden>·</span>
      <span><span className="num">{p.open_decisions}</span> open decision{p.open_decisions === 1 ? "" : "s"}</span>
      <span className="l0-headline-sep" aria-hidden>·</span>
      <span><span className="num">{p.agent_flags}</span> proactive agent flag{p.agent_flags === 1 ? "" : "s"}{p.top_flag ? <span className="subtle"> ({p.top_flag})</span> : null}</span>
      <span className="l0-headline-sep" aria-hidden>·</span>
      <span className="subtle">advisory only — nothing here writes to a control system</span>
    </p>
  );
}
