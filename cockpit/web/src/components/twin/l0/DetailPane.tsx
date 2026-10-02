"use client";

/**
 * L0 detail pane (UI v2, verbatim VN-6 "a pane on the right which shows whatever incremental information we would
 * like the person to know"). Two modes:
 *
 *   • focus unit (hovered / focused / pinned tile): the unit's curve with ŷ ± 2σ, its N(μ,σ) vs plan / spec,
 *     since-when-and-why (agent lines with consequence), the systems ripple if the proposed move is on this unit,
 *     and the unit's real recommendations (Δ ≠ 0; holds are summarised, never listed as decisions).
 *   • default: needs attention (ranked) and the plant's real recommendations, plus the cause → effect of the
 *     primary move behind a disclosure.
 *
 * Accept / Decline is deliberately NOT here (one primary action per screen; it lives on L1 with the evidence).
 */

import Link from "next/link";
import { useCockpit } from "@/lib/store";
import { modelColor } from "@/lib/theme";
import { pOnSpec } from "@/lib/gauss";
import { decisionLine } from "@/lib/l1";
import { dg, useScreenPart } from "@/lib/screenPart";
import type { TwinAttention, TwinDecision, TwinOverview, TwinUnit } from "@/lib/twinTypes";
import Sparkline from "@/components/twin/shared/Sparkline";
import GaussianPdf from "@/components/twin/shared/GaussianPdf";
import { KPI_NAME, STATE_WORD, UNIT_CODE, UNIT_NAME, fmt, signed, unitState } from "./UnitTrain";

const TRUST_RANK: Record<string, number> = { RED: 0, AMBER: 1, GREEN: 2 };

export function realDecisions(units: TwinUnit[]): { moves: TwinDecision[]; holds: number } {
  const open = units.flatMap((u) => (u.decisions_needed ?? []).filter((d) => d.status === "OPEN"));
  const moves = open.filter((d) => Math.abs(d.delta) >= 0.05 && d.action !== "HOLD");
  moves.sort((a, b) => (TRUST_RANK[a.trust ?? "AMBER"] ?? 1) - (TRUST_RANK[b.trust ?? "AMBER"] ?? 1) || Math.abs(b.delta) - Math.abs(a.delta));
  return { moves, holds: open.length - moves.length };
}

function humanParam(p: string): string {
  const tag = p.split(" ")[0];
  const names: Record<string, string> = {
    SP_LCO_T98: "LCO cut-point set point", SP_HN_T98: "HN cut-point set point", SP_T_riser_ROT_F: "Riser outlet temperature set point",
    SP_T_preheat_F: "Feed preheat set point", Fair: "Regenerator air", MV_PA4: "Bottom pumparound", MV_PA1: "Top pumparound",
    MV_PA2: "Pumparound 2", MV_PA3: "Pumparound 3", MV_reflux_ratio: "Reflux ratio", SP_T_overhead: "Overhead temperature set point", MV_cw_flow: "Cooling-water flow",
  };
  return names[tag] ?? tag.replace(/_/g, " ");
}

function DecisionRow({ d }: { d: TwinDecision }) {
  const href = `/twin/unit/${d.unit_id}${d.use_case_id ? `?uc=${encodeURIComponent(d.use_case_id)}` : ""}`;
  const trust = d.trust ?? d.gate_status ?? "";
  const trustCls = trust === "GREEN" || trust === "PASS" ? "ok" : trust === "RED" ? "bad" : "warn";
  return (
    <li className="pane-dec" data-testid="pane-decision" data-rec={d.rec_id}>
      <div className="pane-dec-top">
        <span className="pane-dec-unit">{UNIT_CODE[d.unit_id]} · {UNIT_NAME[d.unit_id] ?? d.unit_id}</span>
        {trust ? <span className={`pane-trust ${trustCls}`}><i className="u2-dot" aria-hidden />{trust === "GREEN" || trust === "PASS" ? "gate pass" : trust === "RED" ? "withheld" : "watch"}</span> : null}
      </div>
      <div className="pane-dec-line">
        <span className="pane-dec-action">{d.action === "LOWER" ? "Lower" : d.action === "RAISE" ? "Raise" : d.action}</span> {humanParam(d.parameter)}{" "}
        <span className="num">{signed(d.delta, 1)} {d.unit}</span> <span className="subtle num">({d.sp_before.toFixed(1)} → {d.sp_after.toFixed(1)})</span>
      </div>
      {d.rationale ? <p className="pane-dec-why">{d.rationale}</p> : null}
      <Link href={href} className="pane-link" data-testid="pane-review">Review in workbench →</Link>
    </li>
  );
}

function AttentionList({ items, compact = false }: { items: TwinAttention[]; compact?: boolean }) {
  if (!items.length) return <p className="pane-empty">No agent flags — all units tracking plan.</p>;
  return (
    <ul className="l0-attn pane-attn">
      {items.map((n) => (
        <li key={n.event_id} className="l0-attn-item" data-severity={n.severity}>
          <Link href={n.tag ? `/twin/unit/${n.unit_id}?tag=${encodeURIComponent(n.tag)}` : `/twin/unit/${n.unit_id}`} className="l0-attn-link" data-testid="attention-link">
            <span className={`l0-attn-dot sev-${n.severity}`} aria-label={n.severity} />
            <span className="l0-attn-body">
              <span className="l0-attn-line">
                {compact ? null : <strong>{UNIT_NAME[n.unit_id] ?? n.unit_label}</strong>}{compact ? null : " · "}{n.line.replace(/ since \d{2}:\d{2}$/, "")}
                <span className="l0-attn-time num"> · {n.time_label}</span>
              </span>
              {n.consequence ? <span className="l0-attn-cons">{n.consequence}</span> : null}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Ripple({ data, inline = false }: { data: TwinOverview; inline?: boolean }) {
  const r = data.systems_ripple;
  if (!r?.primary_move) return null;
  const pm = r.primary_move;
  const domains = r.domains ? Object.values(r.domains).slice(0, 3) : [];
  const body = (
    <div className="pane-ripple" data-testid="pane-ripple">
      <div className="pane-ripple-move">
        {pm.action === "LOWER" ? "Lower" : pm.action === "RAISE" ? "Raise" : pm.action} {humanParam(pm.parameter)} <span className="num">{signed(pm.delta_F, 1)} °F</span>
        <span className="subtle"> on {UNIT_NAME[pm.unit_id] ?? pm.unit_id}</span>
      </div>
      <ul className="pane-ripple-list">
        {domains.map((d) => (
          <li key={d.title}>
            <span className="pane-ripple-title">{d.title.replace(/^\d+\.\s*/, "")}</span>
            <span className="pane-ripple-metrics">
              {(d.metrics ?? []).slice(0, 3).map((m) => (
                <span key={m.label} className={`num rip-${m.direction}`}>{m.label} {signed(m.delta, Math.abs(m.delta) >= 10 ? 0 : 2)} {m.unit}</span>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
  if (inline) return body;
  return (
    <details className="pane-details">
      <summary>What the proposed move does to the rest of the train</summary>
      {body}
    </details>
  );
}

function UnitDetail({ unit, data }: { unit: TwinUnit; data: TwinOverview }) {
  const theme = useCockpit((s) => s.theme);
  const pinned = useCockpit((s) => s.pinnedUnit);
  const setPinned = useCockpit((s) => s.setPinnedUnit);
  const k = unit.kpi_vs_plan ?? null;
  const state = unitState(unit);
  const sp = unit.spark ?? null;
  const code = UNIT_CODE[unit.unit_id], name = UNIT_NAME[unit.unit_id] ?? unit.short_name;
  const href = sp?.tag ? `/twin/unit/${unit.unit_id}?tag=${encodeURIComponent(sp.tag)}` : `/twin/unit/${unit.unit_id}`;
  const attn = data.needs_attention.filter((n) => n.unit_id === unit.unit_id);
  const { moves, holds } = realDecisions([unit]);
  const members = sp && sp.mu != null && sp.sigma != null
    ? [{ id: "belief", label: sp.source, mu: sp.mu, sigma: sp.sigma, weight: 1, color: modelColor("hybrid_delta_v1", theme) }]
    : [];
  const specLo = sp ? (sp.spec_lo ?? (sp.plan != null && sp.tol != null ? sp.plan - sp.tol : null)) : null;
  const specHi = sp ? (sp.spec_hi ?? (sp.plan != null && sp.tol != null ? sp.plan + sp.tol : null)) : null;
  const spec = sp && (specLo != null || specHi != null) ? { lo: specLo, hi: specHi, label: sp.spec_hi != null || sp.spec_lo != null ? "spec" : "tol" } : null;
  const p = sp && sp.mu != null && sp.sigma != null ? pOnSpec(sp.mu, sp.sigma, specLo, specHi) : null;
  const rippleHere = data.systems_ripple?.primary_move?.unit_id === unit.unit_id;

  useScreenPart("pane", {
    mode: "unit_detail", unit: `${code} ${name}`, state: STATE_WORD[state],
    kpi: k ? { label: KPI_NAME[k.tag] ?? k.label, value: dg(k.value), unit: k.unit, plan: dg(k.plan), plan_source: k.plan_source, delta_vs_plan: dg(k.deviation, 1) } : null,
    curve: sp ? { tag: sp.tag, window_min: sp.time_min.length, legend: ["measured (simulator truth)", "expected ŷ", "±2σ band", sp.plan != null ? "plan" : null].filter(Boolean), breach_open: !!sp.breach_open } : null,
    distribution: sp && sp.mu != null ? { mu: dg(sp.mu), sigma: dg(sp.sigma, 2), plan: dg(sp.plan), spec_lo: dg(specLo), spec_hi: dg(specHi), p_on_spec_pct: p != null ? Math.round(p * 100) : null, source: sp.source } : null,
    since_why: attn.map((n) => ({ line: n.line, since: n.time_label, consequence: n.consequence, downstream: n.downstream_unit_id })),
    recommendations: moves.map((d) => ({ line: decisionLine(d), parameter: humanParam(d.parameter), trust: d.trust ?? d.gate_status ?? null, rationale: d.rationale ?? null })),
    holds_without_change: holds,
  });

  return (
    <div className="pane-unit" data-testid="pane-unit" data-unit={unit.unit_id}>
      <div className="pane-head">
        <div>
          <div className="pane-title">{name} <span className="subtle">{code}</span></div>
          <div className={`u2-state st-${state}`}><i className="u2-dot" aria-hidden />{STATE_WORD[state]}</div>
        </div>
        <div className="pane-head-actions">
          <button type="button" className={`btn ghost sm pane-pin ${pinned === unit.unit_id ? "on" : ""}`} aria-pressed={pinned === unit.unit_id}
            onClick={() => setPinned(pinned === unit.unit_id ? null : unit.unit_id)} title={pinned === unit.unit_id ? "Unpin pane" : "Keep this pane open"} data-testid="pane-pin">
            {pinned === unit.unit_id ? "Pinned" : "Pin"}
          </button>
          <Link href={href} className="btn sm" data-testid="pane-open">Open workbench →</Link>
        </div>
      </div>

      {k ? (
        <div className="pane-kpi">
          <span className="pane-kpi-val num">{fmt(k.value)}</span><span className="pane-kpi-unit">{k.unit}</span>
          <span className={`pane-kpi-dev num dev-${state}`}>{signed(k.deviation, 1)}</span>
          <span className="pane-kpi-plan">{KPI_NAME[k.tag] ?? k.label} · plan {fmt(k.plan)} <span className="subtle">({k.plan_source})</span></span>
        </div>
      ) : null}

      {sp ? (
        <section className="pane-sec">
          <div className="pane-sec-head"><span className="pane-sec-title">Last 4 h — measured vs expected</span>
            <span className="pane-legend"><i className="lg-measured" />measured <i className="lg-expected" />expected <i className="lg-band" />±2σ {sp.plan != null ? <><i className="lg-plan" />plan</> : null}</span>
          </div>
          <div className="pane-spark"><Sparkline spark={sp} height={150} ariaLabel={`${sp.label} last 4 h`} /></div>
        </section>
      ) : null}

      {members.length ? (
        <section className="pane-sec">
          <div className="pane-sec-head"><span className="pane-sec-title">Where the value is likely to be — N(μ, σ)</span>
            {p != null ? <span className={`num ${p >= 0.9 ? "ok" : p >= 0.6 ? "warn" : "bad"}`}>P(on-spec) {Math.round(p * 100)} %</span> : null}
          </div>
          <GaussianPdf members={members} target={sp?.plan != null ? { value: sp.plan, label: "plan" } : null} spec={spec} measured={k?.value ?? null} unit={sp?.unit} height={110} showP={false} ariaLabel={`${sp?.label} belief`} />
          <div className="pane-stats num">μ {fmt(sp?.mu)} · σ {fmt(sp?.sigma, 2)} {sp?.unit} <span className="subtle">· {sp?.source}</span></div>
        </section>
      ) : null}

      <section className="pane-sec">
        <div className="pane-sec-head"><span className="pane-sec-title">Since when, and why</span></div>
        <AttentionList items={attn} compact />
      </section>

      {rippleHere ? (
        <section className="pane-sec">
          <div className="pane-sec-head"><span className="pane-sec-title">What the proposed move does to the train</span></div>
          <Ripple data={data} inline />
        </section>
      ) : null}

      <section className="pane-sec">
        <div className="pane-sec-head"><span className="pane-sec-title">Recommendation{moves.length === 1 ? "" : "s"}</span>
          {holds ? <span className="subtle">{holds} hold{holds === 1 ? "" : "s"} · no change</span> : null}</div>
        {moves.length ? <ul className="pane-dec-list">{moves.map((d) => <DecisionRow key={d.rec_id} d={d} />)}</ul> : <p className="pane-empty">No set-point move proposed for this unit.</p>}
      </section>
    </div>
  );
}

function PlantDefault({ data }: { data: TwinOverview }) {
  const { moves, holds } = realDecisions(data.units);
  const shown = moves.slice(0, 3);
  useScreenPart("pane", {
    mode: "plant_overview",
    needs_attention: data.needs_attention.slice(0, 5).map((n) => ({ unit: UNIT_NAME[n.unit_id] ?? n.unit_label, severity: n.severity, line: n.line, since: n.time_label, consequence: n.consequence })),
    recommendations: shown.map((d) => ({ unit: UNIT_NAME[d.unit_id] ?? d.unit_id, line: decisionLine(d), parameter: humanParam(d.parameter), trust: d.trust ?? d.gate_status ?? null, rationale: d.rationale ?? null })),
    more_recommendations: Math.max(0, moves.length - shown.length), holds_without_change: holds,
    ripple: data.systems_ripple?.primary_move ? { move: `${data.systems_ripple.primary_move.action} ${humanParam(data.systems_ripple.primary_move.parameter)} ${signed(data.systems_ripple.primary_move.delta_F, 1)} °F`, gate: data.systems_ripple.gate_status,
      domains: Object.values(data.systems_ripple.domains ?? {}).slice(0, 3).map((d) => ({ title: d.title, summary: d.summary })) } : null,
  });
  return (
    <div className="pane-plant" data-testid="pane-plant">
      <section className="pane-sec">
        <div className="pane-sec-head"><span className="pane-sec-title">Needs attention</span><span className="subtle num">{data.needs_attention.length}</span></div>
        <AttentionList items={data.needs_attention.slice(0, 5)} />
      </section>
      <section className="pane-sec">
        <div className="pane-sec-head"><span className="pane-sec-title">Recommendation{moves.length === 1 ? "" : "s"}</span>
          <span className="subtle">{holds ? `${holds} hold${holds === 1 ? "" : "s"} · no change` : ""}</span></div>
        {shown.length ? <ul className="pane-dec-list" data-testid="pane-decisions">{shown.map((d) => <DecisionRow key={d.rec_id} d={d} />)}</ul> : <p className="pane-empty">No set-point move proposed — all units holding plan.</p>}
        {moves.length > shown.length ? <p className="subtle pane-more">+{moves.length - shown.length} more in the unit workbenches</p> : null}
      </section>
      <Ripple data={data} />
      <p className="pane-hint subtle">Hover or focus a unit for its curve, distribution and reasons. Click to open the workbench.</p>
    </div>
  );
}

export default function DetailPane({ data }: { data: TwinOverview }) {
  const hover = useCockpit((s) => s.hoverUnit);
  const pinned = useCockpit((s) => s.pinnedUnit);
  const focus = pinned ?? hover;
  const unit = focus ? data.units.find((u) => u.unit_id === focus) : undefined;
  return (
    <aside className="l0-pane" data-testid="l0-pane" data-mode={unit ? "unit" : "plant"} aria-live="polite">
      {unit ? <UnitDetail unit={unit} data={data} /> : <PlantDefault data={data} />}
    </aside>
  );
}
