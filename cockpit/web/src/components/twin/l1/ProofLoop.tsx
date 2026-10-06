"use client";

/**
 * Owner, 3 Oct 2026 (04:24): "how will we actually know if a particular parameter will actually maximise the yield?
 * … they will ask probing questions. Is our system answering those questions?"
 *
 *   ProofLoop         step ④ — Predict → Decide → Measure → Learn for the selected decision, each stage marked
 *                     Built / Shown, not run in the replay / Pilot, plus the evidence so far and the pilot line.
 *   CrudeSwitchStory  step ② — how a crude switch plays out on this run, step by step (scripted walkthrough: the
 *                     crude name follows the lab assay; see PROBING_QUESTIONS.md for the live classifier's accuracy).
 */

import type { Decision } from "@/lib/decisionsApi";
import type { TwinRegime } from "@/lib/twinTypes";
import { clock } from "@/lib/format";
import { LEVER_FIT, PILOT_LINE, PROOF_STATUS_LABEL, RECIPE_CHECK, type ProofCheck } from "@/lib/proofEvidence";
import { probPct } from "@/lib/prob";

type Stage = { k: string; title: string; text: string; state: "built" | "shown" | "pilot" | "scripted" | "measured" };
const STATE_LABEL: Record<Stage["state"], string> = { built: "Built", shown: "Shown, not run in the replay", pilot: "Pilot on site", scripted: "Scripted gain", measured: "Measured gain · chance scripted" };

/** What each decision type is measured by after the move (plain words). */
const MEASURED_BY: Record<string, string> = {
  D1: "the next lab sample of the cut point",
  D2: "the next lab sample of the cut point",
  D3: "the next lab samples (LCO and heavy-naphtha T98) and the unit's conversion",
  D5: "the cyclone temperature difference and flue-gas oxygen over the next 30–60 min",
  D6: "catalyst-to-oil and regenerator temperature over the next 30–60 min",
  D7: "the overhead temperature and condenser duty over the next 30–60 min",
  D9: "the extra lab sample itself",
};
const LAB_BASED = new Set(["D1", "D2", "D3", "D9"]);

function Check({ c }: { c: ProofCheck }) {
  return (
    <li className={`pl-check pl-${c.status}`}>
      <b>{c.title}</b> <i className="pl-chip">{PROOF_STATUS_LABEL[c.status]}</i>
      <span><em>Predicted:</em> {c.predicted}</span>
      <span><em>Observed:</em> {c.observed ?? "the runs are going; the result is added here when they finish"}</span>
      <small className="subtle">{c.how}</small>
    </li>
  );
}

export function ProofLoop({ d, nextLab }: { d: Decision; nextLab?: string | null }) {
  const move = d.proposed.moves[0];
  const p = d.predicted;
  const pct = (x?: number | null) => probPct(x);
  const lab = LAB_BASED.has(d.type);
  const measured = d.gain_source === "measured";
  const gainNote = !d.scripted ? "" : measured ? ` The gain is measured: ${p?.gain_evidence ?? "simulator step tests"}. The chance band is scripted.` : " The size of this gain is scripted.";
  const predict = d.proposed.sample
    ? "An earlier lab sample cuts the estimate's spread back under the limit."
    : move
      ? `${move.label} ${move.from.toFixed(1)} → ${move.to.toFixed(1)} ${move.unit}: ${(p?.goal_label ?? "chance on spec").toLowerCase()} ${pct(p?.p_on_spec_before)} → ${pct(p?.p_on_spec_after)}.${gainNote}`
      : "No move proposed.";
  const stages: Stage[] = [
    { k: "1", title: "Predict", text: predict, state: d.scripted ? (measured ? "measured" : "scripted") : "built" },
    { k: "2", title: "Decide", text: d.action ? `${d.action.action} at ${d.action.time_label}, recorded; nothing sent to the plant.` : "The operator accepts, holds or declines. Every action is recorded; nothing is sent to the plant.", state: "built" },
    { k: "3", title: "Measure", text: `Checked by ${MEASURED_BY[d.type] ?? "the unit's own instruments"}${lab && nextLab ? ` (next due ${nextLab})` : ""}. Inside the predicted band = confirmed; outside = flagged.`, state: "shown" },
    { k: "4", title: "Learn", text: lab ? "Each lab result re-anchors the soft sensor (rate-limited bias update, built). Accepted moves and their results refit the lever models (on site)." : "Accepted moves and their measured results refit this lever's model for each crude.", state: lab ? "built" : "pilot" },
  ];
  const evidence = d.type === "D3" || move?.tag === "SP_T_riser_ROT_F" ? [RECIPE_CHECK, LEVER_FIT] : ["D5", "D6", "D7"].includes(d.type) ? [LEVER_FIT, RECIPE_CHECK] : [RECIPE_CHECK];
  return (
    <section className="pl" aria-labelledby="pl-h" data-testid="proof-loop">
      <h3 id="pl-h">How do we know the move works?</h3>
      <ol className="pl-stages">
        {stages.map((s) => (
          <li key={s.k} className={`pl-stage st-${s.state}`}>
            <span className="pl-n">{s.k}</span>
            <b>{s.title}</b>
            <i className="pl-chip">{STATE_LABEL[s.state]}</i>
            <span>{s.text}</span>
          </li>
        ))}
      </ol>
      <p className="us-note subtle">In this demo the replay does not apply accepted moves to the simulator, so step 3 is shown, not run. The checks below were run separately in the simulator.</p>
      <h4>Evidence so far (simulated data)</h4>
      <ul className="pl-checks">{evidence.map((c) => <Check key={c.id} c={c} />)}</ul>
      <p className="pl-pilot"><b>On your plant:</b> {PILOT_LINE.replace(/^On your plant, /, "")}</p>
    </section>
  );
}

export function CrudeSwitchStory({ r, physicsPct }: { r: TwinRegime; physicsPct: string | null }) {
  const t = r.time_min;
  const segs = (r.segments ?? []).filter((s) => s.t_start_min <= t);
  if (segs.length < 2) return null;
  const cur = segs[segs.length - 1], prev = segs[segs.length - 2];
  const tEnd = cur.transition_end_min ?? cur.t_start_min;
  const steps: [string, string][] = [
    [clock(cur.t_start_min), `A new crude starts arriving. The lab assay says ${cur.regime_id} (API ${r.declared_api?.toFixed(1) ?? "—"}); the unit was on ${prev.regime_id}.`],
    [`${clock(cur.transition_start_min ?? cur.t_start_min)}–${clock(tEnd)}`, "The unit's behaviour shifts: riser temperature rise, conversion, coke and regenerator temperature move to a new pattern."],
    [r.detected_at_min != null ? clock(r.detected_at_min) : "—", `The crude is named${r.detection_delay_min != null ? `, ${r.detection_delay_min} min after the blend settles` : ""}. It must hold for 15 min before the label changes, so noise does not flip it.`],
    ["then", `The soft sensor re-weights its models for this crude${physicsPct ? ` (physics-based models ${physicsPct} %)` : ""} while the data-driven ones catch up.`],
    ["then", "The set-point search uses this crude's response models, so the advice changes with the crude."],
  ];
  return (
    <div className="pl-crude" data-testid="crude-story">
      <h3>How a crude switch plays out on this run <em className="us-scripted">scripted walkthrough</em></h3>
      <ol className="pl-crude-steps">{steps.map(([when, what], i) => <li key={i}><span className="num">{when}</span>{what}</li>)}</ol>
      {r.scripted ? <p className="us-note subtle">Scripted: the crude name shown follows the lab assay. The live classifier needs more crude switches in the training data before it is shown as the source.</p> : null}
    </div>
  );
}
