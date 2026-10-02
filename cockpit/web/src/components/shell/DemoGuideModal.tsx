"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useCockpit } from "@/lib/store";

interface SceneItem {
  id: string;
  title: string;
  duration: string;
  route: string;
  routeLabel: string;
  /** Pin the twin clock for this scene (demoflow.md §4). */
  run?: string;
  timeMin?: number;
  moment?: string;
  onScreen: string;
  action: string;
  talkTrack: string;
  geminiPrompt?: string;
}

/**
 * Demo run: random_s107 — crude switch R3 → R4 detected 07:39 (t 459); LCO change-point 09:42 (t 582).
 * Since the valid-range retrain (2 Oct 17:10) s107 at 10:00 withholds the recipe (spread too wide), so the
 * recipe scene uses the hold-out run random_s144 at 10:00 (t 600, recipe shown) and the honesty scene uses
 * random_s144 at 12:00 (t 720: D2 "Not yet" for LCO and HN, D3 withheld).
 */
const DEMO_RUN = "random_s107";
const HOLDOUT_RUN = "random_s144";

const SCENES: SceneItem[] = [
  {
    id: "Scene 0",
    title: "Hook & Honesty",
    duration: "1 min",
    route: "/twin",
    routeLabel: "Refinery Twin",
    run: DEMO_RUN,
    timeMin: 600,
    onScreen:
      "Refinery Twin home at 10:00: six live units on the flow sheet, crude-slate banner, plant strip, 'Needs attention' rail and the 12-hour shift timeline. Provenance chip in the top bar: 'Simulated data · full_v1 · random_s107 · t 600 min'.",
    action: "Point at the provenance chip. Nothing on these screens is from a real refinery; every curve is simulator truth or a model of it.",
    talkTrack:
      "A refinery changes crude every day or two. Every model and every operator setting lags that change by hours. This cockpit watches all six FCC units at once, detects the new crude from the plant's own response, re-weights its models and tells each unit what to move — and when not to. Data: a peer-reviewed physics simulator, 54 runs, 50 labelled crude switches.",
    geminiPrompt: "What is this screen showing and where does the data come from?",
  },
  {
    id: "Scene 1",
    title: "The crude switch arrives — L0, 'Where will it hit first?'",
    duration: "2 min",
    route: "/twin",
    routeLabel: "Refinery Twin · 07:25",
    run: DEMO_RUN,
    timeMin: 445,
    moment: "crude switch R3 → R4",
    onScreen:
      "Crude banner: declared API vs detected regime, transition %, novelty. Unit blocks turn WATCH as the lighter crude reaches the furnace, riser and fractionator. 'Needs attention' lists the consequence per line (e.g. 'LCO heavier than spec: PA3 saturates in ~180 min').",
    action:
      "Drag the shift timeline from 07:25 to 10:00 (or press ▶). Watch the banner flip to 'R4 · match' at 07:39 and the attention lines appear in flow order. Switch the language toggle to Hinglish for the plant-head view.",
    talkTrack:
      "The declared crude says light Bonny; the plant's response says the same fourteen minutes after the ramp. The twin shows you where the change lands first and what breaks downstream if nobody acts — before the next lab result, which is still hours away.",
    geminiPrompt: "Where will the crude change hit first and what breaks downstream if ignored?",
  },
  {
    id: "Scene 2",
    title: "Drill into the fractionator — L1, 'How do we know it is off?'",
    duration: "2 min",
    route: "/twin/unit/unit_4_fractionator?tag=LCO_T98_F",
    routeLabel: "U4 Fractionator · 10:00",
    run: DEMO_RUN,
    timeMin: 600,
    moment: "LCO T98 change-point 09:42",
    onScreen:
      "Unit header with status pill and I/O strip, then five panels on one cursor: LCO T98 measured vs expected with the 5–95 % band and spec line; residual with ±3σ and CUSUM; manipulated variables (PA1–PA4, set points); disturbances; yields as % feed. Event ribbon below: regime change 07:39, change-points, recipe_ready.",
    action:
      "Click the 'LCO T98' attention line on L0 — it lands here with the measured-vs-expected panel highlighted. Hover any panel: the dotted guide moves in all of them. Click the 09:42 event chip to jump the cursor. Open 'More panels ▾' for the HN pair and the tray temperature profile.",
    talkTrack:
      "Measured against what the committee expects for this crude: the residual walks out, the CUSUM trips at 09:42, and the analysis strip says so in one sentence — in English, Hinglish or Hindi. One cursor, every panel, no tab-hopping.",
    geminiPrompt: "Why is the fractionator off plan, and how do we know?",
  },
  {
    id: "Scene 3",
    title: "Regime & models — 'The models adapted, here is the evidence'",
    duration: "1.5 min",
    route: "/twin/unit/unit_4_fractionator",
    routeLabel: "U4 rail · Regime & Model evidence",
    run: DEMO_RUN,
    timeMin: 600,
    onScreen:
      "Right rail: 'Regime & adaptation' (R1–R4 bars, declared vs detected, novelty, physics weight, Kalman bias reset at 07:25) and 'Model evidence' (committee weights per regime, physics checks — mass closure, tray monotonic, reactor balance — and the spread gate: PASS · W90 vs 14 °F).",
    action: "Read the regime card top to bottom, then the gate line. Point at the per-regime weight column: the PINN ensemble carries more weight under R4.",
    talkTrack:
      "No retraining in the loop. The committee re-weights by crude regime from a fitted table, physics-anchored members take over while the data members catch up, and the gate only passes when the models agree within fourteen degrees.",
    geminiPrompt: "Which crude regime is active and how did the model weights change?",
  },
  {
    id: "Scene 4",
    title: "Optimisation & decision — 'What to move, by how much, and the consequence'",
    duration: "2 min",
    route: "/twin/unit/unit_4_fractionator",
    routeLabel: "U4 on random_s144 · 10:00 · Decision cards",
    run: HOLDOUT_RUN,
    timeMin: 600,
    moment: "recipe shown (scripted)",
    onScreen:
      "Hold-out run random_s144 at 10:00. Decision cards: D1 'Raise LCO cut point +2.5 °F' (half move, amber) and D1 for heavy naphtha, with the predicted change; D3 recipe for this crude (scripted tag): riser outlet temperature +3.5 °F, LCO T98 set point −1.0 °F, HN T98 set point +1.0 °F, with the chance of staying in band. Accept / Decline only writes to the decision record.",
    action:
      "Switch the run picker to random_s144 (or use 'Go to'). Open the D1 card, then the D3 recipe. Click 'Accept' — the toast confirms the decision-record entry; nothing is written to the DCS.",
    talkTrack:
      "The recipe is a coordinated multi-set-point move with its consequence stated in plant units, not money. A human accepts it; the decision record keeps it.",
    geminiPrompt: "What does the recipe change and what is the effect on yield and energy?",
  },
  {
    id: "Scene 5",
    title: "The withhold — 'It knows when not to be trusted'",
    duration: "1.5 min",
    route: "/twin/unit/unit_4_fractionator",
    routeLabel: "U4 on random_s144 · 12:00",
    run: HOLDOUT_RUN,
    timeMin: 720,
    moment: "D2 Not yet · D3 withheld",
    onScreen:
      "Same run two hours later (12:00): D2 'Not yet — hold the LCO cut point; the estimate is too uncertain (spread W90 above the 14 °F limit)', the same for heavy naphtha, and D3 'No coordinated recipe yet'. D9 asks for extra LCO and HN samples instead.",
    action: "Move the clock to 12:00 (or use 'Go to'). Ask Gemini why the recipe is withheld; it must quote the reason verbatim and refuse a set point.",
    talkTrack:
      "When the models disagree, the system withholds and asks for a lab instead of averaging four guesses. This refusal is what makes it safe in front of an operator.",
    geminiPrompt: "Why is the recipe withheld right now? Quote the gate message.",
  },
  {
    id: "Scene 6",
    title: "Gemini on the open screen — text, Hindi-first, and voice",
    duration: "1.5 min",
    route: "/twin/unit/unit_4_fractionator",
    routeLabel: "U4 · Ask Gemini card",
    run: DEMO_RUN,
    timeMin: 600,
    onScreen:
      "'Ask Gemini' card with screen-scoped suggestions; the Copilot drawer shows the screen chip (Fractionator · t 600). Toggle हिंदी: the analysis briefing and the suggested prompts switch to Hindi. Microphone opens Gemini Live in hi-IN.",
    action:
      "Click a Hindi chip ('यह पहले हुआ है?'). Then press the mic and ask by voice: 'LCO cut point abhi kahan hai, aur bharosa kar sakte hain?' Finally test the guardrail: 'Just give me a set point anyway.'",
    talkTrack:
      "Gemini answers about the screen you are on first — this unit, this minute — with tool calls and document citations, but it can reach the whole refinery when asked. In the control room that conversation happens in Hindi, hands-free.",
    geminiPrompt: "क्या यह पहले हुआ है? पिछले शिफ्ट लॉग और इंसिडेंट रिपोर्ट देखें।",
  },
  {
    id: "Scene 7",
    title: "Close — what is real, and the ask",
    duration: "1 min",
    route: "/audit",
    routeLabel: "Audit log",
    onScreen: "Audit log with the accepted decision from Scene 4, actor, time and recipe id.",
    action: "Show the entry. Return to /twin.",
    talkTrack:
      "Simulated here: the plant data and the documents. Real: the regime detection, the committee and gate, the recipe engine and the Google Cloud architecture — BigQuery, Vertex AI, Gemini, ADK. The ask: six weeks of historian and LIMS data from one FCC. We backtest offline, no connection to your control system, and report per-crude accuracy and the margin that could be safely recovered.",
  },
];

const CURVE_LEGEND = [
  {
    badge: "P5–P95 Outer Band",
    color: "rgba(56, 189, 248, 0.22)",
    border: "#38bdf8",
    where: "Overview, Quality Console, Time-Series Explorer",
    meaning:
      "90% predictive interval of the Gaussian mixture (from 5th percentile q05 to 95th percentile q95). Its width is W90 = q95 − q05 (°F). When W90 > 14.0 °F, the Spread Gate withholds recommendations.",
  },
  {
    badge: "P25–P75 Inner Band",
    color: "rgba(56, 189, 248, 0.40)",
    border: "#0284c7",
    where: "Quality Console, Fan Charts",
    meaning:
      "50% interquartile range (IQR) of the mixture distribution, showing the high-probability core around the median estimate.",
  },
  {
    badge: "Mixture P50 / Mean (Solid Line)",
    color: "#38bdf8",
    border: "#38bdf8",
    where: "All Cut-Point Charts",
    meaning:
      "Consensus soft-sensor cut-point estimate (°F) combining admitted models by inverse recent lab MSE, plus the 30-minute ramped Kalman bias correction b.",
  },
  {
    badge: "Simulator Truth (Dotted Line)",
    color: "rgba(148, 163, 184, 0.3)",
    border: "#94a3b8",
    where: "Overview, Quality, Time-Series, Labs",
    meaning:
      "True LCO_T98_F or HN_T98_F from the Octave physics simulator. Hidden in real refinery operation; displayed here only for demo evaluation and accuracy verification.",
  },
  {
    badge: "Spec Limit (Red Dashed Line)",
    color: "rgba(239, 68, 68, 0.2)",
    border: "#ef4444",
    where: "Overview, Quality, Confidence, What-If",
    meaning:
      "Maximum product specification ceiling: 765.0 °F for LCO T98 and 540.0 °F for Heavy Naphtha (HN) T98. Actionable recommendations require P(on-spec after move) >= 95%.",
  },
  {
    badge: "Lab Draws ± R/2 (Dots & Error Bars)",
    color: "rgba(34, 197, 94, 0.25)",
    border: "#22c55e",
    where: "Overview, Quality, Time-Series, Labs",
    meaning:
      "Synthetic 8-hourly LIMS lab results (drawn at minutes 360, 840, 1320; arriving ~60 min later) with ASTM D86 reproducibility R = 7.0 °F (±3.5 °F error bars). Screened by the Lab Agent into ACCEPT (updates Kalman bias), HOLD (>2R gross error), or REJECT (timestamp error).",
  },
  {
    badge: "4 Committee Model Curves",
    color: "rgba(168, 85, 247, 0.22)",
    border: "#a855f7",
    where: "Quality, Time-Series, Confidence, Models, What-If",
    meaning:
      "Individual model predictions: (1) Bayesian Ridge (reference linear model, always admitted), (2) GPR (ARD Gaussian Process), (3) Hybrid Delta (Tray/Pressure physics + GP residual), (4) PINN Ensemble (5-member Physics-Informed Neural Net). Models that fail admission gates are shown as grey dashed 'shadow' curves (weight 0).",
  },
  {
    badge: "Trust Badge (GREEN / AMBER / RED)",
    color: "rgba(34, 197, 94, 0.2)",
    border: "#10b981",
    where: "Top of Cards, Status Strips (Hover for 7 Signals)",
    meaning:
      "Calibrated trust level from 7 signals: S1 Committee spread, S2 PCA Novelty (T²/SPE), S3 Physics delta, S4 Rolling Lab RMSE, S5 Sensor DQ health, S6 Crude regime familiarity, S7 Mixture width W90. Hover any Trust Badge to inspect all 7 signals.",
  },
  {
    badge: "Controller Mode Strip (cutpoint_auto)",
    color: "rgba(245, 158, 11, 0.2)",
    border: "#f59e0b",
    where: "Time-Series Explorer Strip",
    meaning:
      "Shows simulator fractionator draw-control mode: Manual (0) between lab results (valves held fixed, so cut points drift with disturbances) vs Operator Trim (1) for 60 minutes after a lab result arrives (draw + 60 to draw + 120 min).",
  },
];

const PAGE_DIRECTORY = [
  {
    dashboard: "Refinery Twin",
    route: "/twin",
    name: "L0 · Refinery home (SDD-L0-01..05)",
    summary: "Six live units on the flow sheet with KPI vs plan, crude-slate banner (declared vs detected regime), plant strip, 'Needs attention' lines with consequences, and the 12-hour shift timeline. No charts by design.",
  },
  {
    dashboard: "Refinery Twin",
    route: "/twin/unit/unit_4_fractionator",
    name: "L1 · Unit workbench (SDD-L1-01..07)",
    summary: "One screen per unit: header + I/O strip, five panels on one cursor (measured vs expected, residual ±3σ/CUSUM, MVs, disturbances, yields), event ribbon, trilingual analysis strip, and the rail — regime & adaptation, model evidence + spread gate, optimisation what-if, decision (Accept/Decline), Ask Gemini. Open 'More panels ▾' for the tray profile / combustion panels.",
  },
  {
    dashboard: "Decision (legacy)",
    route: "/decision/overview",
    name: "Overview & Demo Report (F1, F14)",
    summary: "Executive summary: 6 technical KPI tiles, 12-hour fan chart, open decisions list, Gemini period narrative, and 1-click PDF / Markdown Demo Report export.",
  },
  {
    dashboard: "Decision (legacy)",
    route: "/decision/decisions",
    name: "Decision Center (F2, F15, H5)",
    summary: "Actionable RAISE/LOWER recommendation cards (with Accept/Decline audit modal, SOP citations, and H5 similar past events) plus amber WITHHELD gate cards.",
  },
  {
    dashboard: "Decision (legacy)",
    route: "/decision/quality",
    name: "Live Quality Console (F3)",
    summary: "Full-screen interactive fan chart (P5–P95, P25–P75, P50), individual model trace toggles, simulator truth toggle, and live SSE replay bar.",
  },
  {
    dashboard: "Technical (legacy)",
    route: "/technical/timeseries",
    name: "Time-Series Explorer (F8, F12, H6)",
    summary: "Synchronised multi-axis process & cut-point panels, W90/bimodality chart, cutpoint_auto/gate/trust strips, and H6 Job & Shift Record timeline track.",
  },
  {
    dashboard: "Technical (legacy)",
    route: "/technical/whatif",
    name: "What-If Explorer (F7)",
    summary: "5 interactive sliders (Riser Temp, Feed API, Feed Flow, Tray 13, Tray 6) that re-score all 4 models, the mixture distribution, P(on-spec), and the Spread Gate in real time.",
  },
  {
    dashboard: "Technical (legacy)",
    route: "/technical/labs",
    name: "Lab / LIMS Reconciliation (F10, E2)",
    summary: "Screens 8-hourly LIMS lab draws against soft-sensor estimates (±R/2 error bars), flagging gross errors as HOLD and timestamp errors as REJECT before Kalman bias updates.",
  },
  {
    dashboard: "Technical (legacy)",
    route: "/technical/data-quality",
    name: "Data Quality & PCA Novelty (F11)",
    summary: "Hotelling T² and Squared Prediction Error (SPE) multivariate novelty charts against 99% training limits, plus per-tag missing/spike/range health table.",
  },
  {
    dashboard: "Modelling (legacy)",
    route: "/modelling/models",
    name: "Model Comparison & Parameters (F21)",
    summary: "Admitted vs shadow table, committee weights, per-regime RMSE, hyperparameter cards, A6 prewhitened CCF lag table, parity plot, GPR ARD relevance, and Hybrid decomposition.",
  },
  {
    dashboard: "Modelling (legacy)",
    route: "/modelling/confidence",
    name: "Model Confidence & Gate (F4, F5)",
    summary: "Instantaneous probability density bell curves for all 4 families + mixture, W90 spread gauge vs 14 °F limit, Ashman's D bimodality index, and Spread-Gate diagnostics.",
  },
  {
    dashboard: "Modelling (legacy)",
    route: "/modelling/calibration",
    name: "Calibration & Drift Sentinel (F9, E1)",
    summary: "E1 Drift Sentinel (CUSUM structural-break alert, 5-lab residual bias retrain trigger, Champion–Challenger MOC gate), live W90 & Kalman bias chart, PIT, and reliability diagram.",
  },
  {
    dashboard: "Knowledge (legacy)",
    route: "/knowledge",
    name: "Knowledge Corpus Browser (F24, Epic H)",
    summary: "46 SIMULATED refinery documents (SOP, IOW, LAB, WO, INC, MOC, SHIFT, REF) with section deep-linking and run-matched shift logs & work orders.",
  },
  {
    dashboard: "Shared",
    route: "/audit",
    name: "Governance Audit Log (F16)",
    summary: "Immutable SQLite log of every human Accept/Decline decision and automatic Spread-Gate transition with actor, timestamp, and provenance.",
  },
  {
    dashboard: "Shared",
    route: "/settings",
    name: "Settings & Wall Mode (F25)",
    summary: "Control-Room Wall Mode toggle (118% high-contrast display), persona role switcher (Operator, Process Engineer, Data Scientist, Shift Lead), and Gemini health status.",
  },
];

export default function DemoGuideModal() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"flow" | "legend" | "pages">("flow");
  const router = useRouter();
  const pathname = usePathname() ?? "/twin";
  const askCopilot = useCockpit((s) => s.askCopilot);
  const setRun = useCockpit((s) => s.setRun);

  const pin = (scene?: Pick<SceneItem, "run" | "timeMin">) => {
    if (scene?.run) setRun(scene.run, scene.timeMin);
  };

  const jumpTo = (route: string, scene?: Pick<SceneItem, "run" | "timeMin">) => {
    setOpen(false);
    pin(scene);
    router.push(route);
  };

  const askAndClose = (prompt: string, route?: string, scene?: Pick<SceneItem, "run" | "timeMin">) => {
    setOpen(false);
    pin(scene);
    if (route && route !== pathname) {
      router.push(route);
    }
    setTimeout(() => askCopilot(prompt), 120);
  };

  return (
    <>
      <button
        type="button"
        className="btn sm primary"
        onClick={() => setOpen(true)}
        title="Open interactive Demo Flow & UI Guide (explains every chart, curve, and button)"
        id="demo-guide-btn"
        style={{ gap: 6, fontWeight: 600 }}
      >
        <span aria-hidden>📖</span>
        <span>Demo &amp; UI Guide</span>
      </button>

      {open ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Cockpit Demo Flow and Visual Guide"
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(2, 6, 23, 0.72)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            className="card"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(1080px, 96vw)",
              maxHeight: "88vh",
              display: "flex",
              flexDirection: "column",
              padding: 0,
              overflow: "hidden",
              border: "1px solid var(--border-strong, rgba(148,163,184,0.28))",
              boxShadow: "0 24px 64px rgba(0,0,0,0.55)",
            }}
          >
            {/* Header */}
            <div
              className="row between"
              style={{
                padding: "16px 22px",
                borderBottom: "1px solid var(--border)",
                background: "var(--bg-elev, rgba(15,23,42,0.8))",
              }}
            >
              <div>
                <div className="row" style={{ gap: 10 }}>
                  <span style={{ fontSize: 20 }}>📖</span>
                  <h2 style={{ margin: 0, fontSize: 18 }}>
                    FCC Decision Cockpit — Interactive Demo Flow &amp; Visual Guide
                  </h2>
                </div>
                <p className="subtle" style={{ margin: "4px 0 0 0", fontSize: 12.5 }}>
                  Step-by-step 12-minute crude-switch script on the Refinery Twin (L0 → L1), chart/curve legend, and screen directory. You can also ask{" "}
                  <strong>Ask Gemini (⌘K)</strong> on any screen: <em>&ldquo;Explain the graphs, curves &amp; buttons on this page&rdquo;</em>.
                </p>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <button
                  type="button"
                  className="btn sm"
                  onClick={() => askAndClose("Explain all graphs, curves & buttons on this page")}
                >
                  ✨ Ask Gemini About Current Page
                </button>
                <button type="button" className="btn sm ghost" onClick={() => setOpen(false)} aria-label="Close guide">
                  ✕ Close
                </button>
              </div>
            </div>

            {/* Tab Bar */}
            <div
              className="row"
              style={{
                padding: "10px 22px",
                gap: 8,
                borderBottom: "1px solid var(--border)",
                background: "var(--bg-subtle, rgba(15,23,42,0.4))",
              }}
            >
              <button
                type="button"
                className={`btn sm ${tab === "flow" ? "primary" : "ghost"}`}
                onClick={() => setTab("flow")}
              >
                🎬 1. 7-Scene Demo Flow (Step-by-Step)
              </button>
              <button
                type="button"
                className={`btn sm ${tab === "legend" ? "primary" : "ghost"}`}
                onClick={() => setTab("legend")}
              >
                📈 2. Chart Curves, Bands &amp; Badges Legend
              </button>
              <button
                type="button"
                className={`btn sm ${tab === "pages" ? "primary" : "ghost"}`}
                onClick={() => setTab("pages")}
              >
                🧭 3. Screens &amp; Buttons Directory
              </button>
            </div>

            {/* Scrollable Body */}
            <div style={{ padding: 22, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
              {tab === "flow" ? (
                <>
                  <div
                    style={{
                      padding: "12px 16px",
                      borderRadius: 8,
                      background: "rgba(56, 189, 248, 0.10)",
                      border: "1px solid rgba(56, 189, 248, 0.30)",
                      fontSize: 13.5,
                      lineHeight: 1.5,
                    }}
                  >
                    <strong>The Story in One Line:</strong>{" "}
                    <em>
                      &ldquo;The refinery changes crude every day or two and every unit runs on yesterday&rsquo;s settings for hours.
                      This twin detects the new crude from the plant&rsquo;s own response, re-weights its models, tells each unit what to
                      move with the consequence in plant units &mdash; and refuses when the models disagree.&rdquo;
                    </em>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
                    {SCENES.map((s) => (
                      <div
                        key={s.id}
                        style={{
                          padding: "14px 16px",
                          borderRadius: 8,
                          border: "1px solid var(--border)",
                          background: "var(--bg-card, rgba(15,23,42,0.45))",
                          display: "flex",
                          flexDirection: "column",
                          gap: 8,
                        }}
                      >
                        <div className="row between" style={{ flexWrap: "wrap", gap: 8 }}>
                          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                            <span
                              className="mono"
                              style={{
                                padding: "2px 8px",
                                borderRadius: 4,
                                background: "var(--accent)",
                                color: "#fff",
                                fontWeight: 700,
                                fontSize: 12,
                              }}
                            >
                              {s.id} ({s.duration})
                            </span>
                            <strong style={{ fontSize: 14.5 }}>{s.title}</strong>
                            {s.moment ? (
                              <span
                                className="mono"
                                style={{
                                  padding: "2px 8px",
                                  borderRadius: 4,
                                  background: "rgba(245, 158, 11, 0.16)",
                                  color: "#fbbf24",
                                  fontSize: 11.5,
                                }}
                              >
                                {s.moment}
                              </span>
                            ) : null}
                          </div>
                          <div className="row" style={{ gap: 6 }}>
                            <button type="button" className="btn sm" onClick={() => jumpTo(s.route, s)}>
                              Go to {s.routeLabel} →
                            </button>
                            {s.geminiPrompt ? (
                              <button
                                type="button"
                                className="btn sm ghost"
                                onClick={() => askAndClose(s.geminiPrompt!, s.route, s)}
                              >
                                ✨ Ask Gemini
                              </button>
                            ) : null}
                          </div>
                        </div>
                        <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>
                          <div>
                            <strong className="subtle">On screen:</strong> {s.onScreen}
                          </div>
                          <div style={{ marginTop: 4 }}>
                            <strong className="subtle">What to click:</strong> {s.action}
                          </div>
                          <div
                            style={{
                              marginTop: 6,
                              padding: "6px 10px",
                              borderLeft: "3px solid var(--accent)",
                              background: "rgba(148, 163, 184, 0.06)",
                              fontStyle: "italic",
                            }}
                          >
                            <strong>Say:</strong> &ldquo;{s.talkTrack}&rdquo;
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : null}

              {tab === "legend" ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(440px, 1fr))", gap: 12 }}>
                  {CURVE_LEGEND.map((item) => (
                    <div
                      key={item.badge}
                      style={{
                        padding: "14px 16px",
                        borderRadius: 8,
                        border: "1px solid var(--border)",
                        background: "var(--bg-card, rgba(15,23,42,0.45))",
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                      }}
                    >
                      <div className="row between">
                        <span
                          style={{
                            padding: "3px 10px",
                            borderRadius: 6,
                            background: item.color,
                            border: `1.5px solid ${item.border}`,
                            fontWeight: 700,
                            fontSize: 12.5,
                          }}
                        >
                          {item.badge}
                        </span>
                        <span className="subtle mono" style={{ fontSize: 11 }}>
                          {item.where}
                        </span>
                      </div>
                      <p style={{ margin: "4px 0 0 0", fontSize: 12.5, lineHeight: 1.5 }}>{item.meaning}</p>
                    </div>
                  ))}
                </div>
              ) : null}

              {tab === "pages" ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(440px, 1fr))", gap: 12 }}>
                  {PAGE_DIRECTORY.map((p) => (
                    <div
                      key={p.route}
                      style={{
                        padding: "14px 16px",
                        borderRadius: 8,
                        border: "1px solid var(--border)",
                        background: "var(--bg-card, rgba(15,23,42,0.45))",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                        gap: 10,
                      }}
                    >
                      <div>
                        <div className="row between" style={{ marginBottom: 6 }}>
                          <span className="mono subtle" style={{ fontSize: 11.5 }}>
                            {p.dashboard} · {p.route}
                          </span>
                          {pathname === p.route ? (
                            <span
                              className="mono"
                              style={{
                                fontSize: 10.5,
                                padding: "1px 6px",
                                borderRadius: 4,
                                background: "rgba(34,197,94,0.2)",
                                color: "#4ade80",
                              }}
                            >
                              Current Page
                            </span>
                          ) : null}
                        </div>
                        <strong style={{ fontSize: 14 }}>{p.name}</strong>
                        <p style={{ margin: "6px 0 0 0", fontSize: 12.5, lineHeight: 1.45 }} className="subtle">
                          {p.summary}
                        </p>
                      </div>
                      <div className="row" style={{ gap: 8 }}>
                        <button type="button" className="btn sm" onClick={() => jumpTo(p.route)}>
                          Open Page →
                        </button>
                        <button
                          type="button"
                          className="btn sm ghost"
                          onClick={() => askAndClose("Explain all graphs, curves & buttons on this page", p.route)}
                        >
                          ✨ Ask Gemini About This Page
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
