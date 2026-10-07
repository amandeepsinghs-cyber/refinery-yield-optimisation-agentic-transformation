"use client";

/**
 * Opening page — "How it works" (owner Voice Note 12, 3 Oct 2026 03:24; verbatim.md Part 10).
 * 6 Oct (rev.): aligned with the Architecture tab — one refinery lakehouse → one specialist agent per use case →
 * Gemini orchestrator → one screen where a person decides. 6 Oct (owner): no "two agents working today" claim — the demo
 * runs on simulated data and shows what we are building. Agents sit on top of models: models produce the numbers, the agent checks them against limits,
 * history, SOPs and past decisions; numbers never come from the LLM. MeitY: the one agreed line only (no Category A/B).
 * Honesty: every use case carries its build status; nothing here claims more than the unit pages show. No value figures.
 */
import Link from "next/link";
import { STAGES, USE_CASES, DECISIONS, type Status } from "@/lib/howItWorks";
import { PILOT_LINE } from "@/lib/proofEvidence";
import RefineryMap from "./RefineryMap";
import DecisionsPanel from "./DecisionsPanel";
import ProductLadder from "./ProductLadder";

/** Models → agent → Gemini → person (the layering agreed for architecture/02_agents.md). */
const CHAIN: { n: number; name: string; job: string; here: string }[] = [
  { n: 1, name: "Models produce the numbers",
    job: "Statistical, hybrid, physics-informed (PINN) and Gaussian-process models, response models and a constrained optimiser give the estimate, its spread and the move that reaches the target safely.",
    here: "Deterministic and auditable; trained on the unit's own history." },
  { n: 2, name: "The agent checks and recommends",
    job: "Checks those numbers against SOP limits, recent history and past decisions on its unit, then gives one recommendation with its evidence, or says “Not yet”.",
    here: "One agent per use case, reading only its own unit's data. When the feed changes, the soft sensor resets its lab bias and checks it has lab results for this crude, and the recipe and preheat target follow the new crude." },
  { n: 3, name: "Gemini orchestrates",
    job: "Calls the right agents, combines their advice, explains it in plain words and cites the SOP.",
    here: "Read-only. The numbers never come from the language model." },
  { n: 4, name: "A person decides",
    job: "Accept, hold or decline on one screen. Every decision is recorded and informs the next advice.",
    here: "Nothing is written to the control system." },
];

// The agent that owns each use case — same names as the Architecture tab (lib/architecture.ts AGENTS).
const AGENT: Record<string, string> = {
  "UC-01": "Soft-sensor agent", "UC-11": "Soft-sensor agent",
  "UC-05": "Furnace agent", "UC-10": "Furnace agent", "UC-04": "Regenerator agent",
  "UC-02": "Light-ends agent", "UC-03": "Light-ends agent", "UC-07": "Light-ends agent",
  "UC-06": "Systems agent", "UC-08": "Systems agent", "UC-09": "Systems agent",
};

// The models under each agent in this build (6 Oct: kept as the small print, not the headline).
const SENSOR = "4-model soft sensor (incl. PINN) · trust checks";
const MOVE = "Anomaly detection · response model · optimiser";
const WATCH = "Anomaly detection · consequence check";
const MODELS: Record<string, string> = {
  "UC-01": SENSOR, "UC-11": SENSOR, "UC-02": MOVE, "UC-03": MOVE, "UC-04": MOVE, "UC-05": MOVE, "UC-10": MOVE,
  "UC-07": MOVE, "UC-06": WATCH, "UC-08": WATCH, "UC-09": WATCH,
};

const STATUS: Record<Status, [string, string]> = {
  real: ["Interactive", "ok"], scripted: ["Scripted outcome", "sc"], partly: ["Partly", "pt"], watch: ["Watch only", "wa"],
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
        <h1>One screen to steer the agentic transformation of refinery operations</h1>
        <p className="pf-lede">
          Behind the screen, a separate AI agent handles each use case, from product quality between lab samples to feed
          changes and furnace settings. All the agents work from the same refinery data, so each new use case is quicker
          to add. Each agent watches its own part of the refinery and, when something needs attention, recommends a move or
          flags a problem, with its reasons. Each recommendation reaches the relevant engineer, based on their unit and
          role, who accepts, holds or declines it. Shown here on a simulated FCC unit.{" "}
          <Link href="/architecture">See the architecture →</Link>
        </p>
      </header>

      <RefineryMap />

      <ProductLadder />

      <section aria-labelledby="pf-uc-h">
        <h2 id="pf-uc-h" className="pf-h2">Your use case → its agent → the decision on screen</h2>
        <p className="pf-sub">IOCL list: “High-value use cases by value area”, rows #1–#11. Click a card to open its unit.</p>
        <div className="pf-ucs">
          {ucs.map((u) => {
            const [label, cls] = STATUS[u.status];
            const to = href[u.stage] ?? "/twin";
            return (
              <Link key={u.id} href={to} className="pf-uc">
                <span className="pf-uc-top"><em>{`IOCL ${u.row}`}</em><i className={`pf-st ${cls}`}>{label}</i></span>
                <b>{u.iocl}</b>
                <span className="pf-agent">{AGENT[u.id] ?? ""}</span>
                <small className="pf-models">{MODELS[u.id] ?? ""}</small>
                <span className="pf-dec">{DEC_LINE[u.id] ?? u.decisions.map((d) => `${d} · ${q[d] ?? ""}`)[0]}</span>
              </Link>
            );
          })}
          <div className="pf-uc pf-uc-off">
            <span className="pf-uc-top"><em>Rest of the list</em><i className="pf-st ab">Not claimed</i></span>
            <b>Coker, alkylation, gas turbines, flare, pipelines</b>
            <span className="pf-agent">Next agents, same pattern</span>
            <span className="pf-dec">Trained on that unit&apos;s data; same lakehouse, same screen.</span>
          </div>
        </div>
      </section>

      <section aria-labelledby="pf-chain-h">
        <h2 id="pf-chain-h" className="pf-h2">How an agent works — models, agent, Gemini, a person</h2>
        <ol className="pf-layers pf-chain">
          {CHAIN.map((l) => (
            <li key={l.n} className={l.n === 2 ? "pf-layer pf-layer-agents" : "pf-layer"}>
              <span className="pf-n">{l.n}</span>
              <b>{l.name}</b>
              <p>{l.job}</p>
              <small>{l.here}</small>
            </li>
          ))}
        </ol>
      </section>

      <DecisionsPanel />

      <div className="pf-bands pf-bands-even">
        <section className="pf-band" aria-labelledby="pf-hitl-h">
          <h2 id="pf-hitl-h" className="pf-h2">A person decides — every time</h2>
          <p className="pf-note">
            Advisory only. Agents propose; a person accepts, holds or declines; every action is recorded. Nothing is
            written to the control system. When the models disagree, the screen says “Not yet” and asks for a lab sample.
            It only recommends settings operators actually move.
          </p>
        </section>

        <section className="pf-band" aria-labelledby="pf-meity-h">
          <h2 id="pf-meity-h" className="pf-h2">MeitY-compliant boundary</h2>
          <p className="pf-note">
            Your data stays in India, under keys you hold. Control and safety systems stay on site, and nothing is written
            to them. This demo uses simulated data only — no IOCL data.
          </p>
        </section>
      </div>

      <section className="pf-band pf-proof" aria-labelledby="pf-proof-h">
        <h2 id="pf-proof-h" className="pf-h2">How it learns and proves itself — predict, decide, measure, learn</h2>
        <ol className="pf-steps" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
          <li className="on"><b>Predict</b><span>Models trained on the unit&apos;s data give the expected effect of a move and how sure they are. A crude never seen starts from its nearest crude family and physics, and moves smaller. When the models disagree: “Not yet”.</span></li>
          <li className="on"><b>Decide</b><span>A person accepts, holds or declines. Recorded; nothing sent to the plant.</span></li>
          <li className="on"><b>Measure</b><span>The next lab sample, or the unit&apos;s own instruments, show what really happened. Inside the predicted band = confirmed.</span></li>
          <li className="on"><b>Learn</b><span>Each lab result re-anchors the soft sensor. Response models start from physics, then learn from moves operators already made and small planned step tests.</span></li>
        </ol>
        <p className="pf-note">In the demo, on simulated data, with one recipe fed back through the simulator to test its prediction. <b>On your plant:</b> {PILOT_LINE.replace(/^On your plant, /, "")}</p>
      </section>

      <p className="pf-cta"><Link href="/twin" className="btn primary">Open the refinery →</Link></p>
    </main>
  );
}
