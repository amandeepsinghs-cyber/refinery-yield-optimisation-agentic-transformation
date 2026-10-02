"use client";

/**
 * L0 Decision Queue (DECISION_FIRST_REDESIGN §3, verbatim Voice Note 10: "the screen enables decisions and data is
 * shown to back up those decisions").
 *
 *   DecisionQueue    — the hero of the home screen. Open decisions first (verb sentence, P(on-spec) now → after,
 *                      spread, gates, deadline, Accept / Hold 30 min / Decline), then a compact "not yet" group
 *                      (withheld, with the reason — saying "not yet" is the product, P4), then "watching".
 *   DecisionEvidence — the right-hand pane for the selected decision: why it exists (problem + IOCL use case),
 *                      observed vs plan, N(μ,σ) now vs after the move, gates, ripple, lab, citations, data lineage.
 *
 * One quiet small-caps line per card names the IOCL use case it serves; hover gives the plant problem. No badges, no
 * value figures. Advisory only: Accept writes the audit log, never a control system.
 */

import Link from "next/link";
import { useState } from "react";
import { useCockpit } from "@/lib/store";
import { modelColor } from "@/lib/theme";
import { pOnSpec } from "@/lib/gauss";
import { dg, useScreenPart } from "@/lib/screenPart";
import { actOnDecision, type Decision, type DecisionQueueResp } from "@/lib/decisionsApi";
import type { TwinOverview } from "@/lib/twinTypes";
import GaussianPdf from "@/components/twin/shared/GaussianPdf";
import Sparkline from "@/components/twin/shared/Sparkline";
import { UNIT_CODE, UNIT_NAME, fmt, signed } from "./UnitTrain";

const pct = (p: number | null | undefined) => (p == null ? "—" : `${Math.round(p * 100)} %`);
const STATUS_WORD: Record<string, string> = {
  open: "Decide", held: "Held", accepted: "Accepted", declined: "Declined", withheld: "Not yet", watch: "Watching", expired: "Expired",
};

function minutes(m: number | null | undefined): string | null {
  if (m == null) return null;
  if (m < 90) return `~${Math.round(m)} min`;
  return `~${(m / 60).toFixed(m < 600 ? 1 : 0)} h`;
}

function gatesPass(d: Decision): { pass: number; total: number } {
  return { pass: d.gates.filter((g) => g.pass).length, total: d.gates.length };
}

/** Quiet traceability line: which IOCL use case this serves; hover shows the plant problem in plain words. */
function UseCaseLine({ d }: { d: Decision }) {
  return (
    <p className="dq-uc" title={d.problem_text.join("\n")} data-testid="decision-use-case">
      IOCL use case · {d.use_case.iocl_title}
    </p>
  );
}

function Actions({ d, runId, timeMin, onActed }: { d: Decision; runId: string | null; timeMin: number | null; onActed: () => void }) {
  const ask = useCockpit((s) => s.askCopilot);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const go = async (a: "accept" | "hold" | "decline") => {
    setBusy(a); setErr(null);
    try { await actOnDecision(d.id, a, runId, timeMin); onActed(); } catch (e) { setErr(e instanceof Error ? e.message : "failed"); }
    finally { setBusy(null); }
  };
  const canMove = d.status === "open" && (d.proposed.moves.length > 0 || !!d.proposed.sample);
  return (
    <div className="dq-actions">
      {canMove ? (
        <>
          <button type="button" className="btn primary sm" disabled={!!busy} onClick={() => go("accept")} data-testid="decision-accept">
            {d.proposed.sample ? "Pull sample" : "Accept"}
          </button>
          <button type="button" className="btn sm" disabled={!!busy} onClick={() => go("hold")} data-testid="decision-hold">Hold 30 min</button>
          <button type="button" className="btn ghost sm" disabled={!!busy} onClick={() => go("decline")} data-testid="decision-decline">Decline</button>
        </>
      ) : null}
      <Link href={`/twin/unit/${d.unit_id}${d.observed?.tag ? `?tag=${encodeURIComponent(d.observed.tag)}` : ""}`} className="btn ghost sm" data-testid="decision-open">
        Data →
      </Link>
      <button type="button" className="btn ghost sm" onClick={() => ask(`Explain decision "${d.headline}" (${d.id}): why it exists, the evidence, and what happens if I hold.`)}>
        Ask Gemini
      </button>
      {err ? <span className="dq-err">{err}</span> : null}
    </div>
  );
}

function OpenCard({ d, selected, onSelect, runId, timeMin, onActed }: {
  d: Decision; selected: boolean; onSelect: () => void; runId: string | null; timeMin: number | null; onActed: () => void;
}) {
  const p = d.predicted ?? {};
  const g = gatesPass(d);
  const ttc = minutes(d.urgency.time_to_consequence_min);
  const by = d.urgency.decide_by_label;
  const o = d.observed ?? {};
  return (
    <li className={`dq-card st-${d.status} ${selected ? "sel" : ""}`} data-testid="decision-card" data-type={d.type} data-status={d.status}
      onMouseEnter={onSelect} onFocus={onSelect} onClick={onSelect} tabIndex={0}>
      <div className="dq-top">
        <span className="dq-rank num">{d.urgency.rank}</span>
        <span className="dq-unit">{UNIT_CODE[d.unit_id]} · {UNIT_NAME[d.unit_id] ?? d.unit_label}</span>
        <span className="dq-q">{d.question}</span>
        <span className={`dq-status st-${d.status}`}><i className="u2-dot" aria-hidden />{STATUS_WORD[d.status]}{d.action ? ` ${d.action.time_label}` : ""}</span>
      </div>
      <div className="dq-main">
        <span className="dq-headline">{d.headline}</span>
        <span className="dq-figs num">
          {p.p_on_spec_before != null ? (
            <span title="Probability the product is inside spec, from the soft-sensor committee">
              {d.related ? "lowest " : ""}P(on-spec) {pct(p.p_on_spec_before)}{p.p_on_spec_after != null ? <> → <strong>{pct(p.p_on_spec_after)}</strong></> : null}
            </span>
          ) : null}
          {p.w90 != null ? <span title="Width of the 90 % interval of the estimate">spread {fmt(p.w90, 1)} °F</span> : null}
          {g.total ? <span className={g.pass === g.total ? "ok" : "warn"}>{g.pass}/{g.total} checks pass</span> : null}
        </span>
      </div>
      <p className="dq-why">
        {o.estimate == null && o.line ? <>{o.line} · </> : null}
        {o.estimate != null ? <>Estimate <span className="num">{fmt(o.estimate, 1)} ± {fmt(o.sigma, 1)} {o.unit}</span> vs plan <span className="num">{fmt(o.plan, 1)}</span>{o.since_label ? ` · drifting since ${o.since_label}` : ""} · </> : null}
        {d.urgency.consequence ? <>if nothing is done: {d.urgency.consequence}{ttc ? <span className="subtle"> ({ttc})</span> : null}</> : null}
      </p>
      {d.proposed.alternative ? <p className="dq-alt subtle">Alternative: {d.proposed.alternative}{by ? ` · recommendation valid until ${by}` : ""}</p> : null}
      <UseCaseLine d={d} />
      <Actions d={d} runId={runId} timeMin={timeMin} onActed={onActed} />
    </li>
  );
}

function CompactRow({ d, selected, onSelect }: { d: Decision; selected: boolean; onSelect: () => void }) {
  const ttc = minutes(d.urgency.time_to_consequence_min);
  return (
    <li className={`dq-row st-${d.status} ${selected ? "sel" : ""}`} data-testid="decision-row" data-type={d.type} data-status={d.status}
      onMouseEnter={onSelect} onFocus={onSelect} onClick={onSelect} tabIndex={0}>
      <span className={`dq-status st-${d.status}`}><i className="u2-dot" aria-hidden />{STATUS_WORD[d.status]}</span>
      <span className="dq-row-body">
        <span className="dq-row-line"><strong>{UNIT_NAME[d.unit_id] ?? d.unit_label}</strong> · {d.question}</span>
        <span className="dq-row-sub">
          {d.status === "withheld" ? <>No move proposed — {d.withheld_text}. </> : null}
          {d.observed?.line ? d.observed.line : null}
          {d.urgency.consequence && d.status === "watch" ? <> · {d.urgency.consequence}{ttc ? ` (${ttc})` : ""}</> : null}
        </span>
        <span className="dq-uc dq-uc-inline" title={d.problem_text.join("\n")}>IOCL use case · {d.use_case.iocl_title}</span>
      </span>
    </li>
  );
}

export function DecisionQueue({ q, selectedId, onSelect, runId, timeMin, onActed }: {
  q: DecisionQueueResp; selectedId: string | null; onSelect: (id: string) => void; runId: string | null; timeMin: number | null; onActed: () => void;
}) {
  const live = q.decisions.filter((d) => d.status === "open" || d.status === "held" || d.status === "accepted" || d.status === "declined");
  const notYet = q.decisions.filter((d) => d.status === "withheld");
  const watching = q.decisions.filter((d) => d.status === "watch");
  useScreenPart("decision_queue", {
    clock: q.clock, counts: q.counts,
    decisions: q.decisions.map((d) => ({ rank: d.urgency.rank, id: d.id, type: d.type, status: d.status, unit: d.unit_label, question: d.question,
      headline: d.headline, p_on_spec_now: dg(d.predicted?.p_on_spec_before, 3), p_on_spec_after: dg(d.predicted?.p_on_spec_after, 3),
      withheld: d.withheld_text, consequence: d.urgency.consequence, time_to_consequence_min: d.urgency.time_to_consequence_min,
      problem: d.problem, iocl_use_case: d.use_case.iocl_title })),
  });
  return (
    <section className="dq" data-testid="decision-queue" aria-label="Decisions to take">
      <div className="dq-head">
        <h2 className="dq-title">Decisions</h2>
        <span className="dq-counts subtle">
          <span className="num">{q.counts.open}</span> to take · <span className="num">{notYet.length}</span> not yet (reason shown) ·{" "}
          <span className="num">{watching.length}</span> watching{q.counts.held ? <> · <span className="num">{q.counts.held}</span> held</> : null}
          {q.counts.accepted ? <> · <span className="num">{q.counts.accepted}</span> accepted</> : null}
        </span>
      </div>
      {live.length ? (
        <ol className="dq-list">
          {live.map((d) => <OpenCard key={d.id} d={d} selected={selectedId === d.id} onSelect={() => onSelect(d.id)} runId={runId} timeMin={timeMin} onActed={onActed} />)}
        </ol>
      ) : <p className="dq-empty">No decision to take at {q.clock} — every unit is holding plan or the models are waiting for data (below).</p>}
      {notYet.length ? (
        <>
          <h3 className="dq-sub">Not yet — the cockpit will not guess</h3>
          <ul className="dq-rows">{notYet.map((d) => <CompactRow key={d.id} d={d} selected={selectedId === d.id} onSelect={() => onSelect(d.id)} />)}</ul>
        </>
      ) : null}
      {watching.length ? (
        <>
          <h3 className="dq-sub">Watching — downstream consequence if it continues</h3>
          <ul className="dq-rows">{watching.map((d) => <CompactRow key={d.id} d={d} selected={selectedId === d.id} onSelect={() => onSelect(d.id)} />)}</ul>
        </>
      ) : null}
    </section>
  );
}

/** Right pane: the evidence behind the selected decision (Level 1 of the hierarchy), with the data one click away. */
export function DecisionEvidence({ d, data }: { d: Decision; data: TwinOverview }) {
  const theme = useCockpit((s) => s.theme);
  const p = d.predicted ?? {};
  const o = d.observed ?? {};
  const unit = data.units.find((u) => u.unit_id === d.unit_id);
  const sp = unit?.spark && (!o.tag || unit.spark.tag === o.tag) ? unit.spark : null;
  const specHi = p.spec_max ?? o.spec_max ?? null;
  const members = p.mu_before != null && p.sigma != null ? [
    { id: "now", label: "now", mu: p.mu_before, sigma: p.sigma, weight: 1, color: modelColor("hybrid_delta_v1", theme) },
    ...(p.mu_after != null ? [{ id: "after", label: "after move", mu: p.mu_after, sigma: p.sigma, weight: 1, color: modelColor("pinn_ens_v1", theme), dashed: true }] : []),
  ] : [];
  const pNow = p.mu_before != null && p.sigma != null ? pOnSpec(p.mu_before, p.sigma, null, specHi) : null;
  useScreenPart("pane", {
    mode: "decision_evidence", id: d.id, type: d.type, question: d.question, headline: d.headline, status: d.status,
    why_this_exists: d.why_this_exists, problem: d.problem_text, iocl_use_case: d.use_case,
    observed: o, predicted: { ...p, ripple: undefined }, gates: d.gates.map((g) => `${g.id} ${g.pass ? "pass" : "fail"}`),
    withheld: d.withheld_text, evidence: d.evidence,
  });
  return (
    <div className="pane-unit dq-evidence" data-testid="decision-evidence" data-decision={d.id}>
      <div className="pane-head">
        <div>
          <div className="pane-title">{d.type_name}</div>
          <div className={`dq-status st-${d.status}`}><i className="u2-dot" aria-hidden />{STATUS_WORD[d.status]} · {UNIT_NAME[d.unit_id] ?? d.unit_label} · raised {d.created_label}</div>
        </div>
        <Link href={`/twin/unit/${d.unit_id}${o.tag ? `?tag=${encodeURIComponent(o.tag)}` : ""}`} className="btn sm">Open data →</Link>
      </div>

      <section className="pane-sec dq-exists">
        <div className="pane-sec-head"><span className="pane-sec-title">Why this decision exists</span></div>
        <p className="dq-exists-p">{d.problem_text[0]}</p>
        <p className="dq-exists-p subtle">{d.why_this_exists}.</p>
        <p className="dq-uc">IOCL use case · {d.use_cases.map((u) => u.iocl_title).join(" · ")}</p>
      </section>

      {d.status === "withheld" ? (
        <section className="pane-sec">
          <div className="pane-sec-head"><span className="pane-sec-title">Why no move is proposed</span></div>
          <p className="dq-exists-p">{d.withheld_text}.</p>
          {d.diagnosed?.text ? <p className="pane-dec-why">{d.diagnosed.text}</p> : null}
        </section>
      ) : null}

      {sp ? (
        <section className="pane-sec">
          <div className="pane-sec-head"><span className="pane-sec-title">Last 4 h — measured vs expected</span>
            <span className="pane-legend"><i className="lg-measured" />measured <i className="lg-expected" />expected <i className="lg-band" />±2σ {sp.plan != null ? <><i className="lg-plan" />plan</> : null}</span>
          </div>
          <div className="pane-spark"><Sparkline spark={sp} height={130} ariaLabel={`${sp.label} last 4 h`} /></div>
        </section>
      ) : null}

      {members.length ? (
        <section className="pane-sec">
          <div className="pane-sec-head"><span className="pane-sec-title">Where the value is likely to be — now{p.mu_after != null ? " vs after the move" : ""}</span>
            {pNow != null ? <span className="num">P(on-spec) {pct(p.p_on_spec_before ?? pNow)}{p.p_on_spec_after != null ? ` → ${pct(p.p_on_spec_after)}` : ""}</span> : null}
          </div>
          <GaussianPdf members={members} target={o.plan != null ? { value: o.plan, label: "plan" } : null} spec={specHi != null ? { hi: specHi, label: "spec" } : null}
            unit={o.unit ?? "°F"} height={120} showMixture={false} showP={false} ariaLabel="estimate now and after the move" />
          <div className="pane-stats num">μ {fmt(p.mu_before, 1)}{p.mu_after != null ? ` → ${fmt(p.mu_after, 1)}` : ""} · σ {fmt(p.sigma, 2)} {o.unit ?? ""}{specHi != null ? ` · spec ≤ ${fmt(specHi, 1)}` : ""}</div>
        </section>
      ) : null}

      {d.gates.length ? (
        <section className="pane-sec">
          <div className="pane-sec-head"><span className="pane-sec-title">Checks before advising</span><span className="subtle num">{gatesPass(d).pass}/{d.gates.length} pass</span></div>
          <ul className="dq-gates num">
            {d.gates.map((g) => (
              <li key={g.id} className={g.pass ? "ok" : "bad"} title={g.id}><i className="u2-dot" aria-hidden />{g.name ?? g.id}{g.value != null ? ` ${fmt(g.value, 2)}` : ""}{g.limit != null ? ` (${g.op ?? "≤"} ${fmt(g.limit, 2)})` : ""}{g.unit ? ` ${g.unit}` : ""}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {p.ripple?.length ? (
        <section className="pane-sec">
          <div className="pane-sec-head"><span className="pane-sec-title">What the move does elsewhere</span></div>
          <ul className="dq-ripple">
            {p.ripple.map((r) => <li key={r.what}>{r.what}: {r.delta != null ? <span className="num">{signed(r.delta, 2)} {r.unit}</span> : <span className="subtle">{r.note}</span>}</li>)}
          </ul>
        </section>
      ) : null}

      <section className="pane-sec">
        <div className="pane-sec-head"><span className="pane-sec-title">Behind this</span></div>
        <ul className="dq-lineage">
          {o.last_lab ? <li>Last lab {o.last_lab.reported_label}: <span className="num">{fmt(o.last_lab.value, 1)}</span> ({o.last_lab.status.toLowerCase()}{o.last_lab.status_reason ? ` — ${o.last_lab.status_reason}` : ""})</li> : null}
          {o.next_lab_label ? <li>Next scheduled lab {o.next_lab_label} <span className="subtle">(in {o.next_lab_in_min} min)</span></li> : null}
          {d.evidence.docs.length ? <li>Procedure: {d.evidence.docs.join(" · ")}</li> : null}
          <li>Tags: <span className="num">{d.evidence.tags.join(", ")}</span></li>
          {d.evidence.lakehouse ? <li className="subtle">Lakehouse: {d.evidence.lakehouse}</li> : null}
          <li className="subtle">Advisory only — accepting writes the audit log, never a control system.</li>
        </ul>
      </section>
    </div>
  );
}
