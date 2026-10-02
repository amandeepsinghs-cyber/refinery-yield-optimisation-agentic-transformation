"use client";

/**
 * The flow for one unit (owner, 2 Oct: "when one clicks — I/O data, what we observe, what is the decision or the lever,
 * how we are optimising"). Four steps left → right, each saying which AI piece does the work:
 *
 *   1 DATA        what goes in and out of the unit, and what is measured (live values)
 *   2 OBSERVE     measured vs plan / expected, since when; the soft-sensor estimate N(μ,σ) between labs
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

interface Io { in: string[]; out: string[]; measured: [string, string, string][]; levers: [string, string, string][] }
// Process I/O per unit (simulator flowsheet, sim_octave). measured / levers: [tag, plain name, unit].
const FLOW: Record<string, Io> = {
  unit_1_furnace: { in: ["Fresh gas-oil feed"], out: ["Hot feed → riser"],
    measured: [["T2_preheat_F", "Preheat outlet", "°F"], ["T3_furnace_F", "Firebox", "°F"], ["fluegas_O2_pct", "Flue-gas O₂", "%"], ["F5_fuel", "Fuel gas", "lb/s"]],
    levers: [["SP_T_preheat_F", "Preheat set point", "°F"]] },
  unit_2_riser: { in: ["Hot feed", "Regenerated catalyst"], out: ["Cracked vapour → fractionator", "Spent catalyst → regenerator"],
    measured: [["Tr_riser_F", "Riser outlet T", "°F"], ["conversion_pct", "Conversion", "%"], ["dP_reactor_frac", "Hydraulic dP", "frac"]],
    levers: [["SP_T_riser_ROT_F", "Riser outlet T set point", "°F"]] },
  unit_3_regenerator: { in: ["Spent catalyst", "Combustion air"], out: ["Regenerated catalyst → riser", "Flue gas"],
    measured: [["Treg_F", "Bed temperature", "°F"], ["dT_cyc_reg_F", "Afterburn ΔT", "°F"], ["C_regen_cat", "Carbon on catalyst", "wt"]],
    levers: [["Fair", "Air flow", "lb/s"]] },
  unit_4_fractionator: { in: ["Cracked vapour"], out: ["Heavy naphtha", "LCO (diesel)", "Slurry", "Overhead vapour → gas plant"],
    measured: [["T_tray13_F", "LCO draw tray", "°F"], ["T_tray06_F", "HN draw tray", "°F"], ["MV_PA3", "Pumparound 3", "klb/h"], ["LCO_T98_F", "LCO T98 (lab every 8 h)", "°F"]],
    levers: [["SP_LCO_T98", "LCO cut-point set point", "°F"], ["SP_HN_T98", "HN cut-point set point", "°F"], ["MV_PA2", "Pumparound 2", "klb/h"]] },
  unit_5_condenser: { in: ["Overhead vapour"], out: ["Wet gas → compressor", "Reflux", "Unstabilised naphtha"],
    measured: [["dist_condenser_eff", "Condenser efficiency", "frac"], ["MV_cw_flow", "Cooling water", "lb/s"], ["power_WGC", "Compressor power", "MW"]],
    levers: [["MV_cw_flow", "Cooling-water flow", "lb/s"], ["MV_reflux_ratio", "Reflux ratio", "L/D"]] },
  unit_6_stabiliser: { in: ["Unstabilised naphtha"], out: ["LPG", "Stabilised light naphtha"],
    measured: [["eff_C5", "C5 recovery", "mol"], ["prod_LPG", "LPG make", "lb/min"], ["prod_LN", "Light naphtha", "lb/min"]],
    levers: [["SP_T_overhead", "Overhead T set point", "°F"]] },
};
const NAME: Record<string, string> = {
  unit_1_furnace: "Feed furnace", unit_2_riser: "Riser reactor", unit_3_regenerator: "Regenerator",
  unit_4_fractionator: "Main fractionator", unit_5_condenser: "Gas plant", unit_6_stabiliser: "Stabiliser",
};
const pct = (p?: number | null) => (p == null ? "—" : `${Math.round(p * 100)}%`);
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

  return (
    <section className="uf" data-testid="unit-flow" data-unit={unit.unit_id}>
      <div className="uf-title">
        <h2>{NAME[unit.unit_id]}</h2>
        <span className="subtle">click another unit on the drawing to follow its flow</span>
        {decisions.length > 1 ? (
          <span className="uf-pick">
            {decisions.map((x) => (
              <button key={x.id} type="button" className={`uf-pick-b p-${x.status} ${x.id === d?.id ? "on" : ""}`} onClick={() => onPick(x.id)} title={x.question}>
                {x.status === "open" ? "Decide" : x.status === "withheld" ? "Not yet" : "Watch"} · {x.type_name.split(":")[0].split(" ").slice(0, 3).join(" ")}
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
            {io.measured.map(([tag, name, u]) => <tr key={tag}><td>{name}</td><td className="num">{n(val(tag))}</td><td className="subtle">{u}</td></tr>)}
          </tbody></table>
          <Link href={`/twin/unit/${unit.unit_id}`} className="uf-link">All {unit.tag_table?.length ?? ""} tags and curves →</Link>
        </li>

        {/* 2 OBSERVE */}
        <li className="uf-step">
          <div className="uf-h"><span className="uf-n">2</span>What we observe <Who k="agent">drift-watch agent</Who>{members.length ? <Who k="ml">soft sensor</Who> : null}</div>
          {k ? (
            <p className="uf-big">
              <span className="num">{n(k.value)}</span> <span className="uf-u">{k.unit}</span>
              <span className={`uf-dev s-${k.state} num`}>{k.deviation >= 0 ? "+" : "−"}{Math.abs(k.deviation).toFixed(1)}</span>
              <span className="uf-vs">{k.label} vs plan {n(k.plan)}</span>
            </p>
          ) : null}
          {att.length ? (
            <ul className="uf-obs">{att.slice(0, 2).map((a) => <li key={a.event_id}><b className="num">{a.time_label}</b> {a.line.replace(/ since \d{2}:\d{2}$/, "")}</li>)}</ul>
          ) : <p className="uf-quiet">Tracking expected — nothing unusual.</p>}
          {members.length ? (
            <>
              <GaussianPdf members={members.slice(0, 1)} spec={spec != null ? { hi: spec, label: "spec" } : null} target={d?.observed?.plan != null ? { value: d.observed.plan, label: "plan" } : null}
                unit="°F" height={92} compact showMixture={false} showP={false} ariaLabel="estimate now" />
              <p className="uf-note">Estimated every minute between labs: <span className="num">{n(p.mu_before, 1)} ± {n(p.sigma, 1)} °F</span>, chance on spec <b className="num">{pct(p.p_on_spec_before)}</b></p>
            </>
          ) : null}
        </li>

        {/* 3 DECIDE */}
        <li className={`uf-step uf-decide s-${d?.status ?? "none"}`}>
          <div className="uf-h"><span className="uf-n">3</span>Decision and lever</div>
          {d ? (
            <>
              <p className="uf-q">{d.question}</p>
              {d.proposed.moves.length ? d.proposed.moves.map((m) => (
                <div key={m.tag} className="uf-lever">
                  <span className="uf-lever-name">{m.label}</span>
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
                <li><span>Goal</span>keep the product on spec (≥ 95 %) with the smallest move</li>
                <li><span>Limits</span>SOP step ≤ 5 °F, 30 min between moves, set-point range</li>
                <li><span>Model</span>4-model soft-sensor committee, weights for crude {d.enabled_by?.find((s) => s.name.startsWith("Crude"))?.did.match(/R\d[^;]*/)?.[0] ?? "in unit"}</li>
                <li><span>Checks</span>{d.gates.filter((g) => g.pass).length} of {d.gates.length} pass before advising</li>
              </ul>
              <GaussianPdf members={members} spec={spec != null ? { hi: spec, label: "spec" } : null} unit="°F" height={84} compact showMixture={false} showP={false} ariaLabel="before and after" />
              <p className="uf-note">Result: chance on spec <span className="num">{pct(p.p_on_spec_before)}</span> → <b className="num uf-good">{pct(p.p_on_spec_after)}</b> <span className="subtle">(solid now · dashed after)</span></p>
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
            <p className="uf-why subtle">Nothing to optimise on this unit right now; the systems agent keeps watching the downstream effect.</p>
          )}
        </li>
      </ol>
    </section>
  );
}
