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
  moment?: string;
  onScreen: string;
  action: string;
  talkTrack: string;
  geminiPrompt?: string;
}

const SCENES: SceneItem[] = [
  {
    id: "Scene 0",
    title: "Hook & Honesty",
    duration: "1 min",
    route: "/decision/overview",
    routeLabel: "Decision → Overview",
    onScreen:
      "Topbar Provenance Chip ('Simulated data · full_v1 · random_sNNN · t min') and Decision Overview KPIs.",
    action:
      "Highlight the Provenance Chip in the top-right bar and toggle 'Simulator truth' on the 12-hour fan chart.",
    talkTrack:
      "This is a refinery FCC fractionator. The data comes from a peer-reviewed physics simulator (Santander et al., 2022), validated against published results (41 of 46 signals within 0.2%). Every ground-truth curve is explicitly labelled 'simulator truth'.",
    geminiPrompt: "Explain what data is being shown on this Decision Overview page and what the provenance chip means.",
  },
  {
    id: "Scene 1",
    title: "Decision Overview — 'Can I trust it, and what should I do?'",
    duration: "2 min",
    route: "/decision/decisions",
    routeLabel: "Decision → Decision Center",
    moment: "M2 (Safe Recommendation)",
    onScreen:
      "6 technical KPI tiles, 12-hour LCO T98 fan chart (P5–P95 blue band, lab dots every 8h, 765 °F spec line), and Actionable Recommendation cards.",
    action:
      "1) Click a citation chip like [SOP-FRAC-003 r4 §4.2] on a recommendation card to open the SOP preview in Gemini. 2) Click 'Accept' and confirm in the modal to show the advisory-only toast ('Recorded. The cockpit never writes to the DCS.').",
    talkTrack:
      "The blue band is the soft sensor's minute-by-minute estimate and 90% uncertainty interval. The dots are lab draws—only one every 8 hours. When trust is GREEN and the spread gate passes, the cockpit recommends a safe set-point move with P(on-spec) >= 95%.",
    geminiPrompt: "Should we move the cut point now, and what procedure governs the maximum step size?",
  },
  {
    id: "Scene 2",
    title: "Replay the Disturbance — 'Why a soft sensor?'",
    duration: "2 min",
    route: "/technical/timeseries",
    routeLabel: "Technical → Time-Series Explorer",
    moment: "M1 (Blind Drift Between Labs)",
    onScreen:
      "Synchronised stacked panels: (1) Feed API & Riser Temp, (2) Tray 13 & Tray 6 Temps, (3) LCO T98 soft-sensor band vs dotted simulator truth vs lab dots, (4) Controller mode strip (cutpoint_auto), Gate strip, Trust strip, and (5) Job & Shift Record Track (H6).",
    action:
      "Use the bottom Replay Bar to press Play at 30× speed across a disturbance while Controller Mode is Manual (0). Toggle 'Job & Shift Records (H6)' to inspect the SHIFT log window.",
    talkTrack:
      "When feed quality or riser temperature moves while the draw controller is in manual between 8-hour labs, tray temperatures shift within minutes and the true cut point drifts. The operator is blind until the next lab arrives, whereas the soft sensor tracks the drift every minute.",
    geminiPrompt: "What happened around the last disturbance event in this run, and how did LCO T98 respond?",
  },
  {
    id: "Scene 3",
    title: "The Withhold — 'It knows when not to be trusted'",
    duration: "2 min",
    route: "/modelling/confidence",
    routeLabel: "Modelling → Model Confidence",
    moment: "M3 (Spread Gate Withhold)",
    onScreen:
      "Amber Spread-Gate WITHHELD banner, overlaid probability density bell curves (Bayesian Ridge, GPR, Hybrid Delta, PINN, Mixture), W90 Spread Gauge vs 14.0 °F limit, and Bimodality Index (Ashman's D vs 2.0).",
    action:
      "From a WITHHELD card on /decision/decisions, click 'Why? → Modelling' (or open /modelling/confidence directly) to see why the models disagree.",
    talkTrack:
      "Here the 90% mixture width W90 exceeds the 14.0 °F gate limit (or the models split into a bimodal distribution). Instead of averaging conflicting models and guessing, the Spread Gate withholds advice and tells the operator to request a lab sample and hold the current set point.",
    geminiPrompt: "Why is the distribution spread wide or withheld, and how do the four model families compare at this minute?",
  },
  {
    id: "Scene 4",
    title: "Model Depth, Calibration & Drift Sentinel",
    duration: "1.5 min",
    route: "/modelling/models",
    routeLabel: "Modelling → Model Comparison",
    onScreen:
      "4-model committee table (admitted vs shadow weight 0, RMSE, coverage, CRPS, per-regime RMSE), hyperparameter cards, A6 prewhitened CCF lag table, Parity plot, GPR ARD feature relevance, and Hybrid physics+delta split.",
    action:
      "Inspect the admitted vs shadow models on /modelling/models, then click 'Calibration' (/modelling/calibration) to show the Drift Sentinel (E1), Live W90 & Kalman Bias chart (F9), PIT histogram, and Reliability diagram.",
    talkTrack:
      "Every model family must beat Bayesian Ridge on held-out runs and maintain 85–95% empirical coverage to earn committee weight; otherwise it runs in shadow mode (weight 0). Calibration and the CUSUM Drift Sentinel continuously verify that uncertainty bands remain honest.",
    geminiPrompt: "Which models are admitted into the committee and why, and are the distributions calibrated?",
  },
  {
    id: "Scene 5",
    title: "Gemini Copilot Text & Grounded Citations",
    duration: "1.5 min",
    route: "/knowledge",
    routeLabel: "Knowledge → Corpus Browser",
    onScreen:
      "Floating Ask Gemini panel with live tool calls, [DOC-ID rN §x.y] citation chips, inline Source Preview card, and the 46-document Knowledge dashboard.",
    action:
      "1) Ask Gemini: 'Has this happened before?' 2) Click a returned citation chip (e.g. [INC-0419 r1 §1] or [SOP-FRAC-003 r4 §4.2]) to view the excerpt in the drawer. 3) Click 'Open in Knowledge' to jump to the full document beside the run's related records.",
    talkTrack:
      "Every number Gemini states comes from a read-only tool call in the same turn, and every procedural claim cites the exact document revision and section. Clicking a chip previews the source immediately without losing your place.",
    geminiPrompt: "Has this happened before? Search past incident reports and shift logs for cut-point excursions.",
  },
  {
    id: "Scene 6",
    title: "Voice with Gemini Live & Safety Guardrails",
    duration: "1 min",
    route: "/decision/overview",
    routeLabel: "Ask Gemini → Mic (Voice)",
    onScreen:
      "Gemini panel Voice Bar (Push-to-Talk or Hands-Free) connected to Vertex AI Gemini Live (gemini-live-2.5-flash-native-audio).",
    action:
      "Click the Microphone icon in Ask Gemini. Ask: 'Where is the LCO cut point right now, and can I trust it?' Then test the guardrail: 'Just give me a heavy naphtha set point anyway.'",
    talkTrack:
      "Operators with busy hands can query the copilot by voice. When asked to bypass a withheld gate or write to the DCS, the agent strictly enforces safety guardrails and quotes the Spread-Gate hold message verbatim.",
    geminiPrompt: "Just give me a heavy naphtha set point anyway.",
  },
  {
    id: "Scene 7",
    title: "Demo+ Deep Dives & Export Report",
    duration: "1 min",
    route: "/technical/whatif",
    routeLabel: "Technical → What-If / Labs / DQ",
    onScreen:
      "What-If Explorer sliders (/technical/whatif), Lab/LIMS Reconciliation (/technical/labs), PCA Novelty T²/SPE (/technical/data-quality), and Demo Report PDF/.md Export (/decision/overview).",
    action:
      "Drag the Riser Outlet Temp or Tray 13 slider on /technical/whatif to watch all 4 models re-predict in real time, or click 'Export PDF (Print)' on /decision/overview.",
    talkTrack:
      "In this demo, plant data and corpus documents are simulated; the 4-model probabilistic committee, 7-signal trust score, spread gate, and Vertex AI Gemini architecture are production-ready for a 6-week offline backtest on your unit's historian and LIMS data.",
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
    dashboard: "Decision",
    route: "/decision/overview",
    name: "Overview & Demo Report (F1, F14)",
    summary: "Executive summary: 6 technical KPI tiles, 12-hour fan chart, open decisions list, Gemini period narrative, and 1-click PDF / Markdown Demo Report export.",
  },
  {
    dashboard: "Decision",
    route: "/decision/decisions",
    name: "Decision Center (F2, F15, H5)",
    summary: "Actionable RAISE/LOWER recommendation cards (with Accept/Decline audit modal, SOP citations, and H5 similar past events) plus amber WITHHELD gate cards.",
  },
  {
    dashboard: "Decision",
    route: "/decision/quality",
    name: "Live Quality Console (F3)",
    summary: "Full-screen interactive fan chart (P5–P95, P25–P75, P50), individual model trace toggles, simulator truth toggle, and live SSE replay bar.",
  },
  {
    dashboard: "Technical",
    route: "/technical/timeseries",
    name: "Time-Series Explorer (F8, F12, H6)",
    summary: "Synchronised multi-axis process & cut-point panels, W90/bimodality chart, cutpoint_auto/gate/trust strips, and H6 Job & Shift Record timeline track.",
  },
  {
    dashboard: "Technical",
    route: "/technical/whatif",
    name: "What-If Explorer (F7)",
    summary: "5 interactive sliders (Riser Temp, Feed API, Feed Flow, Tray 13, Tray 6) that re-score all 4 models, the mixture distribution, P(on-spec), and the Spread Gate in real time.",
  },
  {
    dashboard: "Technical",
    route: "/technical/labs",
    name: "Lab / LIMS Reconciliation (F10, E2)",
    summary: "Screens 8-hourly LIMS lab draws against soft-sensor estimates (±R/2 error bars), flagging gross errors as HOLD and timestamp errors as REJECT before Kalman bias updates.",
  },
  {
    dashboard: "Technical",
    route: "/technical/data-quality",
    name: "Data Quality & PCA Novelty (F11)",
    summary: "Hotelling T² and Squared Prediction Error (SPE) multivariate novelty charts against 99% training limits, plus per-tag missing/spike/range health table.",
  },
  {
    dashboard: "Modelling",
    route: "/modelling/models",
    name: "Model Comparison & Parameters (F21)",
    summary: "Admitted vs shadow table, committee weights, per-regime RMSE, hyperparameter cards, A6 prewhitened CCF lag table, parity plot, GPR ARD relevance, and Hybrid decomposition.",
  },
  {
    dashboard: "Modelling",
    route: "/modelling/confidence",
    name: "Model Confidence & Gate (F4, F5)",
    summary: "Instantaneous probability density bell curves for all 4 families + mixture, W90 spread gauge vs 14 °F limit, Ashman's D bimodality index, and Spread-Gate diagnostics.",
  },
  {
    dashboard: "Modelling",
    route: "/modelling/calibration",
    name: "Calibration & Drift Sentinel (F9, E1)",
    summary: "E1 Drift Sentinel (CUSUM structural-break alert, 5-lab residual bias retrain trigger, Champion–Challenger MOC gate), live W90 & Kalman bias chart, PIT, and reliability diagram.",
  },
  {
    dashboard: "Knowledge",
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
  const pathname = usePathname() ?? "/decision/overview";
  const askCopilot = useCockpit((s) => s.askCopilot);

  const jumpTo = (route: string) => {
    setOpen(false);
    router.push(route);
  };

  const askAndClose = (prompt: string, route?: string) => {
    setOpen(false);
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
                  Step-by-step 12-minute presenter script, chart/curve legend, and complete button reference. You can also ask{" "}
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
                🧭 3. All 13 Screens &amp; Buttons Directory
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
                      &ldquo;Your LCO cut point is measured every 8 hours. Between samples, operators run blind and keep a safety margin.
                      This cockpit estimates it every minute, tells you when you can trust the estimate, recommends a move when it is safe,
                      and refuses to recommend one when it isn&rsquo;t.&rdquo;
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
                            <button type="button" className="btn sm" onClick={() => jumpTo(s.route)}>
                              Go to {s.routeLabel} →
                            </button>
                            {s.geminiPrompt ? (
                              <button
                                type="button"
                                className="btn sm ghost"
                                onClick={() => askAndClose(s.geminiPrompt!, s.route)}
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
