"use client";

/**
 * The flow for one unit (owner, 2 Oct: "when one clicks — I/O data, what we observe, what is the decision or the lever,
 * how we are optimising"). Four steps left → right, each saying which AI piece does the work:
 *
 *   1 DATA        what goes in and out of the unit, and what is measured (live values)
 *   2 OBSERVE     measured vs set point / expected, since when; the soft-sensor estimate N(μ,σ) between labs
 *   3 DECIDE      the decision and the lever (set point from → to), Accept / Hold
 *   4 OPTIMISE    how the move was found: objective, limits, checks, result — or why no move is proposed yet
 */

import Link from "next/link";
import { useState } from "react";
import { useCockpit } from "@/lib/store";
import { modelColor } from "@/lib/theme";
import { actOnDecision, type Decision } from "@/lib/decisionsApi";
import type { TwinAttention, TwinUnit } from "@/lib/twinTypes";
import GaussianPdf from "@/components/twin/shared/GaussianPdf";
import { UNIT_INFO } from "@/lib/units";
import { probPct } from "@/lib/prob";
import { SUSPECT } from "@/lib/suspect";

interface Io { in: string[]; out: string[]; measured: [string, string, string][]; levers: [string, string, string][] }
// Process I/O per unit (simulator flowsheet, sim_octave). measured / levers: [tag, plain name, unit].
export const FLOW: Record<string, Io> = {
  unit_1_furnace: { in: ["Fresh gas-oil feed"], out: ["Hot feed → riser"],
    measured: [["T2_preheat_F", "Preheat outlet", "°F"], ["T3_furnace_F", "Firebox", "°F"], ["fluegas_O2_pct", "Flue-gas O₂", "%"], ["F5_fuel", "Fuel gas", "sim. units"]],
    levers: [["SP_T_preheat_F", "Feed preheat", "°F"]] },
  unit_2_riser: { in: ["Hot feed", "Regenerated catalyst"], out: ["Cracked vapour → fractionator", "Spent catalyst → regenerator"],
    measured: [["Tr_riser_F", "Riser outlet T", "°F"], ["conversion_pct", "Conversion", "%"], ["dP_reactor_frac", "Reactor–column ΔP", "sim. units"]],
    levers: [["SP_T_riser_ROT_F", "Riser outlet temperature", "°F"]] },
  unit_3_regenerator: { in: ["Spent catalyst", "Combustion air"], out: ["Regenerated catalyst → riser", "Flue gas"],
    measured: [["Treg_F", "Bed temperature", "°F"], ["dT_cyc_reg_F", "Afterburn ΔT", "°F"], ["C_regen_cat", "Carbon on catalyst", "wt %"]],
    levers: [["Fair", "Regenerator air (excess O₂ / afterburn)", "lb/s"]] },
  unit_4_fractionator: { in: ["Cracked vapour"], out: ["Heavy naphtha", "LCO (diesel)", "Slurry", "Overhead vapour → gas plant"],
    measured: [["T_tray13_F", "LCO draw tray", "°F"], ["T_tray06_F", "HN draw tray", "°F"], ["MV_PA3", "Pumparound 3", "klb/h"], ["LCO_T98_F", "LCO T98 (lab every 8 h)", "°F"]],
    levers: [["SP_LCO_T98", "LCO cut-point target (via LCO draw)", "°F"], ["SP_HN_T98", "HN cut-point target (via HN draw)", "°F"], ["MV_PA2", "Pumparound 2 duty", "klb/h"]] },
  unit_5_condenser: { in: ["Overhead vapour"], out: ["Wet gas → compressor", "Reflux", "Unstabilised naphtha"],
    measured: [["dist_condenser_eff", "Condenser efficiency", "frac"], ["MV_cw_flow", "Cooling-water flow (watched; not advised)", "lb/s"], ["power_WGC", "Compressor power", "sim. units"]],
    // Cooling-water flow is not a lever: it runs at fixed duty in practice (owner, 3 Oct). The overhead temperature
    // target is what operators move.
    levers: [["SP_T_overhead", "Overhead temperature target", "°F"], ["MV_reflux_ratio", "Reflux ratio", "L/D"]] },
  unit_6_stabiliser: { in: ["Unstabilised naphtha"], out: ["LPG", "Stabilised light naphtha"],
    measured: [["eff_C5", "C5 recovery", "sim. units"], ["prod_LPG", "LPG make", "lb/min"], ["prod_LN", "Light naphtha", "lb/min"]],
    levers: [["SP_T_overhead", "Overhead temperature target", "°F"]] },
};
export const NAME: Record<string, string> = Object.fromEntries(Object.entries(UNIT_INFO).map(([id, u]) => [id, u.name]));
const pct = (p?: number | null) => probPct(p, "");
const n = (v?: number | null, d?: number) => (v == null || !Number.isFinite(v) ? "—" : v.toFixed(d ?? (Math.abs(v) >= 100 ? 1 : 2)));

function Who({ k, children }: { k: "agent" | "ml" | "optimiser" | "check" | "data"; children: React.ReactNode }) {
  return <span className={`uf-who w-${k}`}>{children}</span>;
}

export default function UnitFlow({ unit, attention, decision, decisions, onPick, runId, timeMin, onActed }: {
  unit: TwinUnit; attention: TwinAttention[]; decision: Decision | null; decisions: Decision[]; onPick: (id: string) => void;
  runId: string | null; timeMin: number | null; onActed: () => void;
}) {
  const theme = useCockpit((s) => s.theme);
  const ask = useCockpit((s) => s.askCopilot);
  const [busy, setBusy] = useState(false);
  const io = FLOW[unit.unit_id];
  const val = (tag: string) => unit.tag_table?.find((t) => t.tag === tag)?.current ?? null;
  const k = unit.kpi_vs_plan;
  const att = attention.filter((a) => a.unit_id === unit.unit_id);
  const d = decision;
  const p = d?.predicted ?? {};
  const spec = p.spec_max ?? d?.observed?.spec_max ?? null;
  const members = p.mu_before != null && p.sigma ? [
    { id: "now", label: "now", mu: p.mu_before, sigma: p.sigma, weight: 1, color: modelColor("hybrid_delta_v1", theme) },
    ...(p.mu_after != null ? [{ id: "after", label: "after", mu: p.mu_after, sigma: p.sigma, weight: 1, color: modelColor("pinn_ens_v1", theme) }] : []),
  ] : [];
  const canAct = d?.status === "open" && (d.proposed.moves.length > 0 || !!d.proposed.sample);
  const act = async (a: "accept" | "hold" | "decline") => {
    if (!d) return;
    setBusy(true);
    try { await actOnDecision(d.id, a, runId, timeMin); onActed(); } finally { setBusy(false); }
  };
  const optim = d?.enabled_by?.filter((s) => s.kind === "optimiser" || s.kind === "check") ?? [];
  // Scripted D3/D5/D6/D7 items: no soft sensor and no lab behind them; the value is the measured tag in its own unit.
  const scriptTag = d?.scripted ? (d.gain_source === "measured" ? "gain measured · chance scripted" : "scripted outcome") : null;
  const pUnit = d?.scripted ? (p.unit ?? "") : "°F";

  return (
    <section className="uf" data-testid="unit-flow" data-unit={unit.unit_id}>
      <div className="uf-title">
        <h2>{NAME[unit.unit_id]}</h2>
        <span className="subtle">click another unit on the drawing to follow its flow</span>
        {decisions.length > 1 ? (
          <span className="uf-pick">
            {decisions.map((x) => (
              <button key={x.id} type="button" className={`uf-pick-b p-${x.status} ${x.id === d?.id ? "on" : ""}`} onClick={() => onPick(x.id)} title={x.scripted ? `${x.question} (scripted outcome)` : x.question}>
                {x.status === "open" ? "Decide" : x.status === "withheld" ? "Not yet" : "Watch"} · {SHORT[x.id.split("-")[0]] ?? x.type_name.split(":")[0]}
              </button>
            ))}
          </span>
        ) : null}
      </div>
      <ol className="uf-steps">
        {/* 1 DATA */}
        <li className="uf-step">
          <div className="uf-h"><span className="uf-n">1</span>Data in and out <Who k="data">historian · 1-min</Who></div>
          <div className="uf-io">
            <div><span className="uf-l">In</span>{io.in.map((s) => <span key={s} className="uf-stream">{s}</span>)}</div>
            <div><span className="uf-l">Out</span>{io.out.map((s) => <span key={s} className="uf-stream">{s}</span>)}</div>
          </div>
          <table className="uf-tags"><tbody>
            {io.measured.map(([tag, name, u]) => <tr key={tag}><td>{name}</td><td className="num">{n(tag === "C_regen_cat" && val(tag) != null ? (val(tag) as number) * 100 : val(tag))}</td><td className="subtle">{u}{SUSPECT[tag] ? <span className="us-suspect" title={SUSPECT[tag]}> · under review</span> : null}</td></tr>)}
          </tbody></table>
          <Link href={`/twin/unit/${unit.unit_id}`} className="uf-link">All {unit.tag_table?.length ?? ""} tags and curves →</Link>
        </li>

        {/* 2 OBSERVE */}
        <li className="uf-step">
          <div className="uf-h"><span className="uf-n">2</span>What we observe <Who k="agent">anomaly detection</Who>{members.length ? <Who k="ml">{scriptTag ? "response model (scripted)" : "soft sensor"}</Who> : null}</div>
          {k ? <p className="uf-kicker">Measured now</p> : null}
          {k ? (
            <p className="uf-big">
              <span className="num">{n(k.value)}</span> <span className="uf-u">{k.unit}</span>
              <span className={`uf-dev s-${k.state} num`}>{k.deviation >= 0 ? "+" : "−"}{Math.abs(k.deviation).toFixed(1)}</span>
              <span className="uf-vs">{k.label} · {k.plan_source === "set point" ? "set point" : "expected"} {n(k.plan)}{p.target != null ? ` · target ${n(p.target, 1)}` : ""}</span>
            </p>
          ) : null}
          {att.length ? (
            <ul className="uf-obs">{att.slice(0, 2).map((a) => <li key={a.event_id}><b className="num">{a.time_label}</b> {a.line.replace(/ since \d{2}:\d{2}$/, "")}</li>)}</ul>
          ) : <p className="uf-quiet">Tracking expected — nothing unusual.</p>}
          {members.length ? (
            <>
              <GaussianPdf members={members.slice(0, 1)} spec={spec != null ? { hi: spec, label: "spec" } : null} target={p.target != null ? { value: p.target, label: "target" } : d?.observed?.plan != null ? { value: d.observed.plan, label: d.scripted ? "expected" : "set point" } : null}
                unit={pUnit} height={92} compact showMixture={false} showP={false} ariaLabel="estimate now" />
              {scriptTag ? (
                <p className="uf-note"><b>Response model</b> <em className="us-scripted">{scriptTag}</em>: measured <span className="num">{n(p.mu_before, 1)} ± {n(p.sigma, 1)} {pUnit}</span>, chance in band <b className="num">{pct(p.p_on_spec_before)}</b> (no soft sensor or lab on this item)</p>
              ) : (
                <p className="uf-note"><b>Soft-sensor estimate</b> (the lab comes every 8 h): <span className="num">{n(p.mu_before, 1)} ± {n(p.sigma, 1)} °F</span>, chance on spec <b className="num">{pct(p.p_on_spec_before)}</b></p>
              )}
            </>
          ) : null}
        </li>

        {/* 3 DECIDE */}
        <li className={`uf-step uf-decide s-${d?.status ?? "none"}`}>
          <div className="uf-h"><span className="uf-n">3</span>Decision and lever</div>
          {d ? (
            <>
              <p className="uf-q">{d.question}</p>
              {d.feed_used?.line ? <p className="uf-alt" data-testid="feed-used">{d.feed_used.line}</p> : null}
              {d.proposed.moves.length ? d.proposed.moves.map((m) => (
                <div key={m.tag} className="uf-lever">
                  <span className="uf-lever-name">{m.label}{scriptTag ? <em className="us-scripted">{scriptTag}</em> : null}</span>
                  <span className="uf-lever-move num">{n(m.from, 1)} <i>→</i> <b>{n(m.to, 1)}</b> {m.unit}</span>
                  <span className="uf-lever-d num">{m.delta >= 0 ? "+" : "−"}{Math.abs(m.delta).toFixed(1)} {m.unit}</span>
                </div>
              )) : d.proposed.sample ? (
                <div className="uf-lever"><span className="uf-lever-name">Lever: an extra lab sample</span><span className="uf-lever-move">now, not at {d.observed?.next_lab_label}</span></div>
              ) : (
                <div className="uf-lever none"><span className="uf-lever-name">Levers here</span><span className="uf-lever-move">{io.levers.map((l) => l[1]).join(" · ")}</span>
                  <span className="uf-lever-d">{d.status === "withheld" ? "no move proposed yet" : "watching"}</span></div>
              )}
              {d.proposed.alternative ? <p className="uf-alt">Or: {d.proposed.alternative}</p> : null}
              <div className="uf-actions">
                {canAct ? (
                  <>
                    <button type="button" className="hs-btn primary" disabled={busy} onClick={() => act("accept")} data-testid="decision-accept">{d.proposed.sample ? "Pull sample" : "Accept"}</button>
                    <button type="button" className="hs-btn" disabled={busy} onClick={() => act("hold")}>Hold 30 min</button>
                  </>
                ) : null}
                <button type="button" className="hs-btn ghost" onClick={() => ask(`Explain decision "${d.headline}" (${d.id}) step by step: data, what we observe, the lever, how it was optimised.`)}>Ask Gemini</button>
                {d.action ? <span className="subtle">{d.action.action} {d.action.time_label} · audit only</span> : null}
              </div>
              <p className="uf-uc" title={d.problem_text.join("\n")}>IOCL use case · {d.use_case.iocl_title}</p>
            </>
          ) : (
            <>
              <p className="uf-q">No decision on this unit now.</p>
              <div className="uf-lever none"><span className="uf-lever-name">Levers here</span><span className="uf-lever-move">{io.levers.map((l) => `${l[1]} ${n(val(l[0]))} ${l[2]}`).join(" · ")}</span></div>
            </>
          )}
        </li>

        {/* 4 OPTIMISE */}
        <li className="uf-step">
          <div className="uf-h"><span className="uf-n">4</span>How the move is found <Who k="optimiser">optimiser</Who><Who k="check">checks</Who></div>
          {d && d.proposed.moves.length && members.length ? (
            <>
              <ul className="uf-opt">
                <li><span>Goal</span>{d.type === "D1" && d.predicted?.target != null ? `bring T98 to its ${d.predicted.target.toFixed(1)} °F target, never below 95 % chance on spec, ≤ 5 °F per SOP step` : scriptTag ? `${p.goal_label ?? "bring the reading back into its band"} — move = drift ÷ response gain, capped at the SOP step (scripted rule)` : "bring the reading back into its band, never below 95 % chance, inside the SOP step"}</li>
                <li><span>Limits</span>{scriptTag && d.proposed.sop ? d.proposed.sop : "SOP step ≤ 5 °F, 30 min between moves, set-point range"}</li>
                <li><span>Model</span>{d.predicted?.model ?? `Soft-sensor committee: 4 models, ${d.models?.members.filter((x) => x.role === "blended").length ?? 3} blended`}</li>
                <li><span>Checks</span>{d.gates.filter((g) => g.pass).length} of {d.gates.length} pass before advising</li>
              </ul>
              <GaussianPdf members={members} spec={spec != null ? { hi: spec, label: "spec" } : null} unit={pUnit} height={84} compact showMixture={false} showP={false} ariaLabel="before and after" />
              <p className="uf-note">Result{scriptTag ? ` (${scriptTag})` : ""}: chance {scriptTag ? "in band" : "on spec"} <span className="num">{pct(p.p_on_spec_before)}</span> → <b className="num uf-good">{pct(p.p_on_spec_after)}</b> <span className="subtle">(solid now · dashed after)</span></p>
            </>
          ) : d?.status === "withheld" ? (
            <>
              <p className="uf-why">Not run, on purpose: {d.withheld_text}.</p>
              {optim.map((s, i) => <p key={i} className="uf-note">{s.name}: {s.did}</p>)}
              <p className="uf-note subtle">Becomes a live recommendation once designed moves of these levers are in the training data (lever batch running).</p>
            </>
          ) : d?.proposed.sample ? (
            <p className="uf-why">The spread of the estimate is near its limit and the next lab is {d.observed?.next_lab_in_min} min away; a sample now is the cheapest way to cut uncertainty.</p>
          ) : (
            <p className="uf-why subtle">Nothing to optimise on this unit right now; the consequence check keeps watching the downstream effect.</p>
          )}
        </li>
      </ol>
    </section>
  );
}// short, whole-word labels for the decision picker (first-three-words cut mid-phrase, e.g. "Coordinated recipe for")
const SHORT: Record<string, string> = {
  D1: "Cut point", D2: "Trust the estimate", D3: "Recipe for this feed", D4: "Feed change", D5: "Regenerator air",
  D6: "Furnace preheat", D7: "Condenser and stabiliser", D8: "What breaks downstream", D9: "Extra lab sample",
};


