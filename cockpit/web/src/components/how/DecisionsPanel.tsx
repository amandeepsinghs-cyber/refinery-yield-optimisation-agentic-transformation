"use client";

/**
 * FP-2 "Decisions the platform enables" — expandable (SDD §14.6E SDD-FP-06..07, BDD-38).
 * Rows follow the oil through the FCC (DECISION_ORDER). Each card: pain point · how we solve it · how it works (1–6) ·
 * IOCL use cases · link to the unit. Text from DECISION_CARD; status from DECISIONS. No value figures (U3).
 */
import Link from "next/link";
import {
  DECISIONS, DECISION_CARD, DECISION_ORDER, FP2_FOOTER, SCRIPTED_LINE, USE_CASES, WATCH_LINE, decisionHref,
  type DecisionInfo,
} from "@/lib/howItWorks";
import StatusDot from "./StatusDot";
import { unitLabel } from "./RefineryMap";

const DEC = Object.fromEntries(DECISIONS.map((d) => [d.id, d])) as Record<string, DecisionInfo>;
const UC = Object.fromEntries(USE_CASES.map((u) => [u.id, u]));
const ucName = (id: string) => {
  const r = UC[id]?.row ?? "";
  return r.startsWith("#") ? `IOCL ${r}` : "Feedstock evaluation";
};

function Card({ d }: { d: DecisionInfo }) {
  const c = DECISION_CARD[d.id];
  const href = decisionHref(d);
  const how: [string, string][] = [
    ["Data in", c.dataIn],
    ["Algorithms, in order", c.algorithms],
    ["Checks before advising", c.checks],
    ["What the operator gets", c.operatorGets],
    ["On your plant", c.onYourPlant],
    ["What we need from you", c.needFromYou],
  ];
  return (
    <div className="dp-card">
      <div className="dp-ps">
        <p><em>Pain point</em>{c.pain}</p>
        <p><em>How we solve it</em>{c.solve}</p>
      </div>
      <p className="dp-how-h"><em>How it works</em></p>
      <ol className="dp-how">
        {how.map(([k, v], i) => (
          <li key={k}><span className="pf-n">{i + 1}</span><b>{k}</b><span>{v}</span></li>
        ))}
      </ol>
      {d.status === "scripted" && <p className="dp-honest">{SCRIPTED_LINE}</p>}
      {d.status === "watch" && <p className="dp-honest">{WATCH_LINE}</p>}
      <div className="dp-foot">
        <span className="dp-ucs">
          <em>IOCL use cases</em>
          {d.ucs.map((id) => UC[id] && (
            <span key={id} className="dp-uc"><StatusDot status={UC[id].status} word={false} />{ucName(id)}</span>
          ))}
        </span>
        <Link href={href}>See it running on {unitLabel(href)} →</Link>
      </div>
    </div>
  );
}

export default function DecisionsPanel() {
  return (
    <details className="dp">
      <summary><h2 id="dp-h" className="pf-h2">Decisions the platform enables ({DECISION_ORDER.length})</h2>
        <span className="dp-hint">In the order the oil meets them · open a decision to see how it works</span></summary>
      <ol className="dp-rows">
        {DECISION_ORDER.map((id, i) => {
          const d = DEC[id];
          if (!d) return null;
          const c = DECISION_CARD[id];
          return (
            <li key={id}>
              <details className="dp-row">
                <summary>
                  <span className="dp-n">{i + 1}</span>
                  <b className="dp-id">{id}</b>
                  <span className="dp-q">{c.question}</span>
                  <span className="dp-unit">{d.unit}</span>
                  <span className="dp-st"><StatusDot status={d.status} />{c.statusNote && <small> · {c.statusNote}</small>}</span>
                </summary>
                <Card d={d} />
              </details>
            </li>
          );
        })}
      </ol>
      <p className="pf-note dp-footer">{FP2_FOOTER}</p>
    </details>
  );
}
