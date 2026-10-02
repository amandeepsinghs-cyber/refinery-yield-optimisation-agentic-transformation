"use client";

/**
 * How it works (owner, 2 Oct 2026 14:31–14:38): explain the tool problem-first. "There should be a problem statement,
 * which explains what actually is the problem at each stage and then explain how this platform solves it … the problem
 * is what the use cases are."
 *
 * Order: the problem (P1–P4) → problem and solution stage by stage, one block per IOCL use case (the problem today → how
 * the cockpit solves it → decision, parts, status) → under the hood: the parts → every decision it helps with → data
 * path → words on the screen. Content: src/lib/howItWorks.ts. Anchors (#D1, #UC-01, #part-crude, #stage-furnace) are
 * linked from the unit pages and the home page.
 */

import Link from "next/link";
import UseCaseExplainer from "@/components/how/UseCaseExplainer";
import {
  DECISIONS, GLOSSARY, PARTS, PART_NAME, PROBLEMS, STAGES, STATUS_LABEL, UC_TITLE, USE_CASES,
  type PartId, type Status,
} from "@/lib/howItWorks";

const PART_ORDER: PartId[] = ["watch", "crude", "estimators", "response", "checks", "optimiser", "gemini"];
const PART_N: Record<PartId, number> = Object.fromEntries(PARTS.map((p) => [p.id, p.n])) as Record<PartId, number>;

const SOLVES: Record<string, { how: string; parts: PartId[] }> = {
  P1: { how: "The quality is estimated every minute between labs, with the chance of being on spec.", parts: ["estimators", "optimiser"] },
  P2: { how: "The crude is recognised from the unit’s own behaviour; every model re-weights for it and the moves are worked out for the new crude.", parts: ["crude", "response", "optimiser"] },
  P3: { how: "Every move shows its downstream effect, and a drift is followed to the next unit before it arrives.", parts: ["watch", "gemini"] },
  P4: { how: "Trust checks hold the advice back and ask for a lab sample when the models disagree.", parts: ["checks"] },
};

function Pill({ s }: { s: Status }) {
  return <span className={`hw-pill s-${s}`}>{STATUS_LABEL[s]}</span>;
}

export default function HowItWorks() {
  return (
    <div className="hw">
      <header className="hw-head">
        <p className="hw-crumb"><Link href="/twin">Refinery</Link> / How it works</p>
        <h1>The problem, and how the cockpit solves it</h1>
        <p className="hw-lede">
          An FCC changes crude every day or two. After each change <b>every stage drifts away from its plan</b>, the lab only
          reports <b>every 8 hours</b>, and a move in one unit shows up <b>hours later in the next</b>. IOCL’s use cases are
          these problems, stage by stage. Below, each one is shown as <b>the problem today</b> and <b>how the cockpit solves it</b>.
          A person always makes the decision, and nothing is written to the control system.
        </p>
        <nav className="hw-toc" aria-label="On this page">
          <a href="#problem">The problem</a><a href="#usecases">Stage by stage</a><a href="#chain">Under the hood</a>
          <a href="#decisions">Decisions</a><a href="#data">Data path</a><a href="#words">Words on the screen</a>
        </nav>
      </header>

      {/* 1 — the problem */}
      <section id="problem" className="hw-sec">
        <h2>The problem in four lines</h2>
        <div className="hw-probs">
          {Object.entries(PROBLEMS).map(([id, text]) => (
            <article key={id} className="hw-prob">
              <p className="hw-pt"><span>Problem</span>{text}</p>
              <p className="hw-ps"><span>The cockpit</span>{SOLVES[id].how}</p>
              <p className="hw-pp">Parts: {SOLVES[id].parts.map((p) => <a key={p} href={`#part-${p}`}>{PART_N[p]} {PART_NAME[p]}</a>)}</p>
            </article>
          ))}
        </div>
      </section>

      {/* 2 — stage by stage, one block per IOCL use case */}
      <section id="usecases" className="hw-sec">
        <h2>Stage by stage: IOCL use case → problem today → how it is solved</h2>
        <p className="hw-sub">
          Following the FCC from feed to products. Each block is one use case from IOCL’s list of high-value refinery analytics
          (rows 1–11, plus feedstock evaluation from the catalogue). This build is the FCC only, so a use case written for
          another unit (e.g. the reformer) is shown on its FCC equivalent, and the block says so.
        </p>
        {STAGES.map((st) => {
          const ucs = USE_CASES.filter((u) => u.stage === st.id);
          if (!ucs.length) return null;
          return (
            <div key={st.id} id={`stage-${st.id}`} className="hw-stage">
              <h3 className="hw-sth">{st.href ? <Link href={st.href}>{st.name}</Link> : st.name}<span>{st.role}</span></h3>
              {ucs.map((u) => <UseCaseExplainer key={u.id} id={u.id} anchor />)}
            </div>
          );
        })}
      </section>

      {/* 3 — the chain */}
      <section id="chain" className="hw-sec">
        <h2>Under the hood: the parts, in the order they work</h2>
        <p className="hw-sub">Each part answers one question and passes its answer to the next.</p>
        <ol className="hw-chain">
          {PARTS.map((p) => (
            <li key={p.id}><a href={`#part-${p.id}`}><i>{p.n}</i><b>{p.name}</b><span>{p.question}</span></a></li>
          ))}
          <li className="hw-you"><a href="#decisions"><i>✓</i><b>You decide</b><span>Accept · Hold · Decline, written to the decision record</span></a></li>
        </ol>
        <div className="hw-parts">
          {PARTS.map((p) => (
            <article key={p.id} id={`part-${p.id}`} className="hw-part">
              <header><i>{p.n}</i><h3>{p.name}</h3><Pill s={p.status} /></header>
              <p className="hw-q">“{p.question}”</p>
              <p>{p.kind}</p>
              {p.members ? (
                <ul className="hw-members">{p.members.map(([n, d]) => <li key={n}><b>{n}</b> {d}</li>)}</ul>
              ) : null}
              <dl>
                <dt>In</dt><dd>{p.input}</dd>
                <dt>Out</dt><dd>{p.output}</dd>
                <dt>Where</dt><dd>{p.where}</dd>
                <dt>Status</dt><dd>{p.statusNote}</dd>
              </dl>
            </article>
          ))}
        </div>
      </section>

      {/* 4 — decisions */}
      <section id="decisions" className="hw-sec">
        <h2>Every decision it helps with</h2>
        <p className="hw-sub">Each decision uses part of the chain and solves one or more of the IOCL use cases. A dot means the decision uses that part.</p>
        <div className="hw-tablewrap">
          <table className="hw-table">
            <thead>
              <tr>
                <th>Decision</th><th>Unit</th>
                {PART_ORDER.map((id) => <th key={id} className="hw-pc" title={PART_NAME[id]}>{PART_N[id]}</th>)}
                <th>IOCL use case solved</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {DECISIONS.map((d) => (
                <tr key={d.id} id={d.id}>
                  <td className="hw-dq"><b>{d.id}</b> {d.question}<small>Lever: {d.lever}</small><small className="hw-note">{d.note}</small></td>
                  <td>{d.unitHref ? <Link href={d.unitHref}>{d.unit}</Link> : d.unit}</td>
                  {PART_ORDER.map((id) => <td key={id} className="hw-pc">{d.parts.includes(id) ? <span className="hw-dot" aria-label={PART_NAME[id]} /> : null}</td>)}
                  <td className="hw-ucs">
                    {d.ucs.map((u) => <a key={u} href={`#${u}`}>{UC_TITLE[u]}</a>)}
                  </td>
                  <td><Pill s={d.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hw-legend">Columns 1–7: {PARTS.map((p) => `${p.n} ${p.name}`).join(" · ")}</p>
      </section>

      {/* 5 — data path */}
      <section id="data" className="hw-sec">
        <h2>Data path</h2>
        <ol className="hw-path">
          <li><b>Simulation</b><span>FCC simulator, every tag each minute and a lab every 8 h; 54 runs with 50 crude switches</span></li>
          <li><b>BigQuery</b><span>raw tags and lab results land here</span></li>
          <li><b>Lakehouse</b><span>cleaned, lab-aligned tables per unit</span></li>
          <li><b>Models</b><span>parts 1–6 above</span></li>
          <li><b>Decision</b><span>the move, its checks, and your Accept / Hold / Decline</span></li>
        </ol>
        <p className="hw-sub">Today the cockpit reads the simulator files directly. BigQuery holds a sample, and the lakehouse tables are the next step.</p>
      </section>

      {/* 6 — glossary */}
      <section id="words" className="hw-sec">
        <h2>Words on the screen</h2>
        <dl className="hw-gloss">
          {GLOSSARY.map(([t, d]) => <div key={t}><dt>{t}</dt><dd>{d}</dd></div>)}
        </dl>
      </section>

      <p className="hw-foot">Simulated data · advisory only. Nothing here writes to a control system. No value figures are shown by design.</p>
    </div>
  );
}
