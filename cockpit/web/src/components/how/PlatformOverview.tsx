"use client";

/**
 * Opening page — "How it works" (owner Voice Note 12, 3 Oct 2026 03:24; verbatim.md Part 10).
 * Leads the pitch with: IOCL's use cases → one specialist agent each → the decision a person takes, on six layers
 * (lakehouse → processing → models → agents → decisions → whole-refinery outcome), with the person-in-the-loop and
 * MeitY data-boundary bands. The cockpit is a façade; the agents behind it are separate modules.
 * Honesty: every use case carries its build status; nothing here claims more than the unit pages show. No value figures.
 */
import Link from "next/link";
import { STAGES, USE_CASES, DECISIONS, type Status } from "@/lib/howItWorks";

const LAYERS: { n: number; name: string; job: string; here: string }[] = [
  { n: 1, name: "Unified lakehouse", job: "One source of truth: every sensor, lab result, crude assay, event and decision, governed in one place.",
    here: "BigQuery bronze → silver → gold on Cloud Storage. Loaded in batches from the simulator." },
  { n: 2, name: "Data processing", job: "Make data fit to learn from: clean it, align each lab to its minute, flag broken readings.",
    here: "Valid-range cut, lab alignment, tag registry. Plant-edge de-identification is designed (MeitY band below)." },
  { n: 3, name: "Models", job: "Turn data into numbers people can trust, with a spread on every estimate.",
    here: "Crude classifier · four-model soft sensor incl. physics-informed (PINN) · response models · trust checks." },
  { n: 4, name: "Agents, one per use case", job: "Watch, diagnose and propose. Each agent owns a use case; they share the lakehouse event log.",
    here: "Separate modules today, run as one service for the demo; each can be deployed as its own agent." },
  { n: 5, name: "Decisions, person in the loop", job: "One advisory card per decision, with its evidence. A person accepts, holds or declines.",
    here: "Nine decision types. “Not yet” when the models cannot back a move. Nothing written to the control system." },
  { n: 6, name: "Whole refinery optimised", job: "Each move is checked for its effect on the next units before it is advised.",
    here: "Systems agent across the catalyst, heat and hydrocarbon loops; multi-set-point recipe." },
];

const AGENT: Record<string, string> = {
  "UC-01": "Soft-sensor agent", "UC-11": "Soft-sensor agent", "UC-02": "Light-ends agent", "UC-03": "Light-ends agent",
  "UC-04": "Regenerator agent", "UC-05": "Furnace agent", "UC-10": "Furnace agent", "UC-07": "Condenser agent",
  "UC-06": "Systems agent", "UC-08": "Systems agent", "UC-09": "Systems agent", FEED: "Crude-switch agent",
};

const STATUS: Record<Status, [string, string]> = {
  real: ["Live", "ok"], scripted: ["Scripted outcome", "sc"], partly: ["Partly", "pt"], watch: ["Watch only", "wa"],
  absent: ["Not in this build", "ab"],
};

// The stabiliser side of D7 (UC-02 / UC-03) asks its own question (decisions.py, unit_6_stabiliser).
const DEC_LINE: Record<string, string> = {
  "UC-02": "D7 · Adjust the stabiliser overhead temperature for C5 recovery?",
  "UC-03": "D7 · Adjust the stabiliser overhead temperature for the LPG / naphtha split?",
};

const rowNum = (r: string) => (r.startsWith("#") ? Number(r.slice(1)) : 99);

export default function PlatformOverview() {
  const ucs = [...USE_CASES].sort((a, b) => rowNum(a.row) - rowNum(b.row));
  const q = Object.fromEntries(DECISIONS.map((d) => [d.id, d.question]));
  const href = Object.fromEntries(STAGES.map((s) => [s.id, s.href]));
  return (
    <main id="main" className="pf">
      <header className="pf-head">
        <p className="pf-kicker">How it works</p>
        <h1>One platform for IOCL&apos;s refinery use cases</h1>
        <p className="pf-lede">
          One source of truth · one specialist agent per use case · people decide. The cockpit you will see is the front
          of it; each agent behind it is a separate module, working with the others on the whole FCC.
        </p>
      </header>

      <section aria-labelledby="pf-layers-h">
        <h2 id="pf-layers-h" className="pf-h2">Six layers, each with one job</h2>
        <ol className="pf-layers">
          {LAYERS.map((l) => (
            <li key={l.n} className={l.n === 4 ? "pf-layer pf-layer-agents" : "pf-layer"}>
              <span className="pf-n">{l.n}</span>
              <b>{l.name}</b>
              <p>{l.job}</p>
              <small>{l.here}</small>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="pf-uc-h">
        <h2 id="pf-uc-h" className="pf-h2">Your use cases → the agent that owns it → the decision on screen</h2>
        <p className="pf-sub">IOCL list: “High-value use cases by value area”, rows #1–#11, plus feedstock evaluation. Click a card to open its unit.</p>
        <div className="pf-ucs">
          {ucs.map((u) => {
            const [label, cls] = STATUS[u.status];
            const to = href[u.stage] ?? "/twin";
            return (
              <Link key={u.id} href={to} className="pf-uc">
                <span className="pf-uc-top"><em>{u.row === "Catalogue" ? "Catalogue" : `IOCL ${u.row}`}</em><i className={`pf-st ${cls}`}>{label}</i></span>
                <b>{u.iocl}</b>
                <span className="pf-agent">{AGENT[u.id] ?? "Agent"}</span>
                <span className="pf-dec">{DEC_LINE[u.id] ?? u.decisions.map((d) => `${d} · ${q[d] ?? ""}`)[0]}</span>
              </Link>
            );
          })}
          <div className="pf-uc pf-uc-off">
            <span className="pf-uc-top"><em>Rest of the list</em><i className="pf-st ab">Not claimed</i></span>
            <b>Coker, alkylation, gas turbines, flare, pipelines</b>
            <span className="pf-agent">Same pattern</span>
            <span className="pf-dec">A new agent on the same lakehouse, same decision desk.</span>
          </div>
        </div>
      </section>

      <div className="pf-bands">
        <section className="pf-band" aria-labelledby="pf-hitl-h">
          <h2 id="pf-hitl-h" className="pf-h2">A person decides — every time</h2>
          <ol className="pf-steps">
            <li className="on"><b>Advise</b><span>This build. Agents propose; a person accepts, holds or declines; every action is recorded.</span></li>
            <li><b>Assist</b><span>Later, only if IOCL asks: the accepted move is pre-filled for the board operator.</span></li>
            <li><b>Act within limits</b><span>Not part of this proposal.</span></li>
          </ol>
          <p className="pf-note">Nothing is written to the control system. When the models disagree, the cockpit says “Not yet” and asks for a lab sample. It only recommends settings operators actually move.</p>
        </section>

        <section className="pf-band" aria-labelledby="pf-meity-h">
          <h2 id="pf-meity-h" className="pf-h2">MeitY data boundary — Category A stays on site</h2>
          <div className="pf-flow">
            <div><b>On site · Category A</b><span>DCS, safety systems, closed-loop control, raw tag names, cargo and supplier names</span></div>
            <i aria-hidden>→</i>
            <div><b>Edge gateway</b><span>Tags → tokens · values → deviations · names → crude groups · 1-minute roll-up · one-way only, no write path back</span></div>
            <i aria-hidden>→</i>
            <div><b>India cloud regions · Category B</b><span>De-identified telemetry, models, advisory decisions · Mumbai / Delhi · customer-managed keys</span></div>
          </div>
          <p className="pf-note">Basis: MeitY OM 9(3)/2025-EG-II of 20 Mar 2026 (para 6: the department classifies its data). This demo uses simulated data only — no IOCL data. The edge gateway is a design, not part of this build.</p>
        </section>
      </div>

      <p className="pf-cta"><Link href="/twin" className="btn primary">Open the refinery →</Link></p>
    </main>
  );
}
