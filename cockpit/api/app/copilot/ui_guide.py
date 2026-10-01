"""Comprehensive UI, Graph, Curve, Button, and 7-Scene Demo Flow Guide for the Gemini Copilot.

Injected into `system_instruction(ctx)` in `chat.py` so the user can ask Gemini on any page:
- "What do the curves, bands, and buttons on this page mean?"
- "What is the demo flow / what should I click next?"
- "How do I read this chart?"
"""
from __future__ import annotations

PAGE_GUIDES: dict[str, str] = {
    "/decision/overview": (
        "CURRENT PAGE: Decision -> Overview (/decision/overview, Features F1, F14).\n"
        "- Top KPI Tiles (6 tiles): (1) RMSE vs Lab (°F error vs target <=1.5R = 10.5 °F), "
        "(2) 90% Interval Coverage (% of held-out truth inside P5-P95 band, target 85-95%), "
        "(3) Trust Mix (% of minutes in GREEN / AMBER / RED), "
        "(4) Validated-Estimate Availability (% of minutes not RED/BAD), "
        "(5) Recommendations Accepted (accepted / total actionable), "
        "(6) Withheld for Spread (minutes where gate status is WITHHELD).\n"
        "- Main Chart (12-Hour Fan Chart): Blue outer shaded band = P5-P95 (90% interval, width W90); "
        "darker blue inner band = P25-P75 (50% IQR); solid blue line = Mixture P50 median estimate (°F); "
        "dotted grey line = Simulator Truth (ground truth from Octave physics simulator, shown when 'Simulator truth' toggle is active); "
        "red dashed horizontal line = Product Spec Limit (765 °F for LCO T98, 540 °F for HN T98); "
        "coloured circles = 8-hourly LIMS lab draws (ACCEPT/HOLD/REJECT).\n"
        "- Strips Below Chart: Gate strip (green = PASS, amber = WITHHELD) and Trust strip (GREEN / AMBER / RED).\n"
        "- Right Panel ('Decisions needed now'): Lists OPEN cut-point recommendations and WITHHELD gate alerts.\n"
        "- Buttons: 'Simulator truth' toggle (shows/hides dotted ground-truth line), 'Export PDF (Print)' (opens print-isolated Demo Report), "
        "'Download .md' (downloads structured Markdown Demo Report)."
    ),
    "/decision/decisions": (
        "CURRENT PAGE: Decision -> Decision Center (/decision/decisions, Features F2, F15, H5).\n"
        "- Filter Tabs: Filter cards by All, Open, Withheld, Accepted, Declined, or Hold.\n"
        "- Actionable Recommendation Cards (status OPEN): Show recommended set-point move (RAISE/LOWER Δ °F, capped at ±5 °F in 0.5 °F steps), "
        "SP before -> after (°F), P(on-spec after move) (must be >=95%), margin to spec before -> after (°F), LCO yield shift (% of feed), "
        "TrustBadge (GREEN = full move, AMBER = conservative half move), SOP citation chips [DOC-ID rN §x.y], and 'Similar past events (H5)' footer.\n"
        "- Withheld Cards (status WITHHELD): Amber border, exact Spread-Gate message explaining why no recommendation was issued (W90 > 14 °F or bimodal D > 2.0), "
        "no Accept button, plus a 'Why? -> Modelling' deep-link button.\n"
        "- Buttons: 'Accept' / 'Decline' (opens modal recording operator name + note to SQLite audit log; advisory only, never writes to DCS/MPC), "
        "Citation chips (open quick source preview inside the Gemini panel), 'Why? -> Modelling' (jumps to /modelling/confidence at that exact minute)."
    ),
    "/decision/quality": (
        "CURRENT PAGE: Decision -> Live Quality Console (/decision/quality, Feature F3).\n"
        "- Main Fan Chart: Full-run trajectory of the selected property (LCO_T98_F or HN_T98_F). "
        "Outer blue band = P5-P95 (90% interval); inner blue band = P25-P75; solid line = Mixture P50 median; "
        "dotted line = Simulator Truth; red dashed line = Spec ceiling (765 °F LCO / 540 °F HN); markers = LIMS lab samples.\n"
        "- Individual Model Overlay Toggles: Buttons to overlay individual committee members — Bayesian Ridge (blue), GPR (teal), Hybrid Delta (purple), PINN Ensemble (orange).\n"
        "- Bottom Replay Bar: Play/Pause live SSE stream, speed selector (1x, 10x, 30x, 60x), and time scrubber."
    ),
    "/technical/timeseries": (
        "CURRENT PAGE: Technical -> Time-Series Explorer (/technical/timeseries, Features F8, F12, H6).\n"
        "- Synchronised Stacked Panels sharing a single time axis (hovering any panel shows a vertical crosshair across all panels):\n"
        "  1. Disturbances & Inputs: Feed API gravity (dist_feed_API), Riser Outlet Temp (Tr_riser_F), Feed flow (feed_flow_lb_s), Tray 13 & Tray 6 temperatures.\n"
        "  2. Target Cut-Point Panel: Mixture P5-P95 band, individual model traces (Bayesian Ridge, GPR, Hybrid Delta, PINN), Simulator Truth, and Lab dots.\n"
        "  3. Uncertainty Panel: 90% width W90 (°F) vs the 14.0 °F dashed Spread-Gate limit, plus Bimodality Ashman's D vs 2.0 limit.\n"
        "  4. Status Strips: Controller mode strip (cutpoint_auto: 0 = Manual between labs, 1 = Operator Trim window 60-120 min after lab draw), "
        "Gate strip (PASS / WITHHELD), and Trust strip (GREEN / AMBER / RED).\n"
        "  5. Job & Shift Record Track (H6): Proportional horizontal timeline bars for SHIFT logs (using sim_window [start, end] minutes) and date-listed WO/INC/MOC cards.\n"
        "- Buttons: Tag selector pills (add/remove process tags), 'Job & Shift Records (H6)' toggle, Replay bar (Play/Pause, 1x-60x speed)."
    ),
    "/technical/whatif": (
        "CURRENT PAGE: Technical -> What-If Explorer (/technical/whatif, Feature F7).\n"
        "- Interactive Sliders (left card): Perturb 5 key operating inputs around the current minute's baseline: "
        "Riser Outlet Temp (Tr_riser_F, °F), Feed API Gravity (dist_feed_API), Fresh Feed Flow (feed_flow_lb_s, lb/s), "
        "Tray 13 Temp (T_tray13_F, °F), and Tray 6 Temp (T_tray06_F, °F), plus 'Reset to baseline' button.\n"
        "- Comparison KPI Strip: Shows Baseline -> What-If delta for Mixture Mean (°F), W90 Spread (°F vs 14 °F limit), P(on-spec) (%), Margin to Spec (°F), and Spread Gate status.\n"
        "- Comparison Chart & Table: Horizontal error-bar chart and table comparing Baseline (μ ± σ) vs What-If (μ ± σ) for all 4 committee models and the Mixture (q05-q95)."
    ),
    "/technical/labs": (
        "CURRENT PAGE: Technical -> Lab / LIMS Reconciliation (/technical/labs, Features F10, E2).\n"
        "- KPI Summary Cards: Total synthetic lab draws, Accepted count, Held/Rejected count, ASTM D86 Reproducibility R = 7.0 °F, and Injected Errors count.\n"
        "- Reconciliation Chart: Plots Lab Draw values (°F) with ±R/2 (±3.5 °F) error bars against Soft-Sensor Mixture Estimate at draw time and Simulator Truth.\n"
        "- Reconciliation Table: Lists Draw Time (time_min), LIMS Arrival Time (~60 min later), Lab Value, Soft-Sensor Estimate, Residual |y_lab - y_hat|, "
        "Lab Agent Status badge (ACCEPT updates Kalman bias; HOLD flags >2R gross errors; REJECT blocks timestamp-copied errors where recorded_draw_time == lims_time), and Agent Rationale."
    ),
    "/technical/data-quality": (
        "CURRENT PAGE: Technical -> Data Quality & PCA Novelty (/technical/data-quality, Feature F11).\n"
        "- KPI Strip: Monitored key tags count, Healthy tags count, Range/Spike flags, and PCA Novelty status.\n"
        "- Two Stacked Novelty Charts: (1) Hotelling T² statistic over time vs dashed 99% training envelope limit (t2_limit = 1.0 normalized); "
        "(2) Squared Prediction Error (SPE / Q-residual) over time vs dashed limit (spe_limit = 1.0). Breaches drive Trust Signal S2 (Novelty).\n"
        "- Tag Health Table: Per-tag missing %, MAD spike count, out-of-range count, and OK / WARN / FAIL status badge."
    ),
    "/modelling/models": (
        "CURRENT PAGE: Modelling -> Model Comparison & Parameters (/modelling/models, Feature F21).\n"
        "- Committee Table: Lists all 4 model families (Bayesian Ridge reference, Gaussian Process ARD, Hybrid Physics + Delta, PINN 5-member Ensemble) "
        "with Admission status ('admitted' vs 'shadow' weight 0), Committee Weight, held-out RMSE (°F), MAE, Bias, 90% Coverage, CRPS, Mean Sigma, and per-regime RMSE (Heavy / Medium / Light crude).\n"
        "- Model Parameter Cards: Hyperparameters for each family (Ridge alpha/lambda, GPR ARD length-scales, Hybrid Antoine/tray coefficients a, b, c, PINN architecture & epistemic/aleatoric split) plus A6 prewhitened CCF lag table.\n"
        "- Diagnostic Charts: Parity plot (Predicted vs Simulator Truth with 1:1 line), Residuals over time, GPR ARD Feature Relevance bar chart, and Hybrid Physics vs Residual Delta decomposition."
    ),
    "/modelling/confidence": (
        "CURRENT PAGE: Modelling -> Model Confidence (/modelling/confidence, Features F4, F5).\n"
        "- Overlaid Probability Density Chart (PDF): Shows the bell curves N(mu, sigma) for all 4 committee models at the current minute, overlaid with the bold Mixture PDF. "
        "Shadow models (weight 0) are drawn as grey dashed curves; vertical dashed lines mark Mixture P05, P50, P95 and the Spec limit.\n"
        "- W90 Spread Gauge & Bimodality Card: Shows 90% interval width W90 = q95 - q05 (°F) against the 14.0 °F gate threshold, and Ashman's D bimodality index against the 2.0 threshold.\n"
        "- Spread-Gate Banner (F5): When WITHHELD, explains the exact cause ('models disagree', 'inputs outside training envelope', or '10-min hysteresis hold')."
    ),
    "/modelling/calibration": (
        "CURRENT PAGE: Modelling -> Calibration & Drift Sentinel (/modelling/calibration, Features F9, E1).\n"
        "- Drift Sentinel & Model Lifecycle Card (E1 / BDD-8): Shows (1) Two-sided CUSUM Structural-Break Detector (ALERT if CUSUM > 5.0 sigma else NOMINAL), "
        "(2) Residual Bias Monitor (proposes challenger retrain if mean residual over last 5 labs >= 0.5R = 3.5 °F), and "
        "(3) Champion-Challenger Promotion Gate (requires Challenger to win BOTH time-blocked and leave-one-regime-out validation, and stays 'pending_approval' until human MOC sign-off).\n"
        "- Live Run W90 Spread & Kalman Bias History Chart (F9): Tracks W90 (°F), the 14 °F gate limit, and the ramped Kalman bias correction b (°F) across the current run.\n"
        "- Calibration Charts: Rolling 90% Empirical Coverage vs 90% target band, Probability Integral Transform (PIT) histogram, Reliability Diagram (observed vs nominal coverage), and two-sided CUSUM chart."
    ),
    "/knowledge": (
        "CURRENT PAGE: Knowledge -> Knowledge Corpus & Procedures (/knowledge, Feature F24, Epic H).\n"
        "- Left Rail / Library: Filterable list of all 46 SIMULATED refinery documents across 8 types: SOP (Standard Operating Procedures), IOW (Integrity Operating Windows), "
        "LAB (ASTM D86 & QC methods), WO (Work Orders), INC (Incident Reports), MOC (Management of Change), SHIFT (Shift Handover Logs mapped to simulator runs), and REF (References).\n"
        "- Center Reader: Full Markdown document viewer with section anchors (§x.y) highlighted when opened from a citation chip.\n"
        "- Right Panel ('Related records for this run'): Lists SHIFT logs and WO/INC records tied to the active run_id."
    ),
    "/audit": (
        "CURRENT PAGE: Governance -> Audit Log (/audit, Feature F16).\n"
        "- Searchable table of every immutable SQLite audit record: operator Accept/Decline decisions, automatic Spread-Gate transitions (PASS <-> WITHHELD), and system reloads, with timestamp, actor, action, target, and JSON detail."
    ),
    "/settings": (
        "CURRENT PAGE: Settings & Display Mode (/settings, Feature F25).\n"
        "- Control-Room Wall Mode Toggle (F25): Enlarges typography (118% zoom) and contrast for control-room big-screen displays.\n"
        "- Role Switcher: Quick-jump presets for Operator (/decision/overview), Process Engineer (/technical/timeseries), Data Scientist (/modelling/models), and Shift Lead (/knowledge).\n"
        "- Live System Health & Thresholds: Shows Gemini text/live/embedding probe status, active data batch (full_v1), and configured spec/gate thresholds."
    ),
}

DEMO_FLOW_SUMMARY = """
SEVEN-SCENE DEMO FLOW (demoflow.md — 12 minutes total):
- Core Story: "Your LCO cut point is measured every 8 hours. Between samples, operators run blind and keep a safety margin. This cockpit estimates it every minute, tells you when you can trust the estimate, recommends a move when it is safe, and refuses to recommend one when it is not."
- Scene 0 — Hook & Honesty (1 min, /decision/overview): Point to the topbar Provenance Chip ('Simulated data · full_v1 · <run_id> · t <min>'). Explain that data comes from the peer-reviewed Santander et al. (2022) FCC-Fractionator physics simulator (41/46 signals within 0.2%).
- Scene 1 — Decision Overview & Safe Move (2 min, /decision/overview & /decision/decisions, Moment M2): Show KPI tiles, the 12-hour LCO T98 fan chart (blue P5-P95 band vs sparse 8-hourly lab dots vs 765 °F spec line). Click an OPEN recommendation card, click its [SOP-FRAC-003 r4 §4.2] citation chip to preview the SOP in the Gemini drawer, then click 'Accept' to show the toast: "Recorded. The cockpit never writes to the DCS."
- Scene 2 — Replay the Crude Switch (2 min, /technical/timeseries, Moment M1): Show linked panels (Feed API, Tray 13/6 temps, LCO T98 band vs dotted simulator truth, and Controller Mode strip). Press Play at 30x speed across a disturbance while cutpoint_auto = 0 (manual): show how the true cut point drifts between 8-hour labs while the soft sensor tracks it every minute.
- Scene 3 — The Withhold / Spread Gate (2 min, /decision/decisions -> click 'Why? -> Modelling' -> /modelling/confidence, Moment M3): Inspect an amber WITHHELD card where W90 > 14.0 °F or models disagree (bimodal D > 2.0). Click 'Why?' to open /modelling/confidence and show the diverging model bell curves (Bayesian Ridge, GPR, Hybrid Delta, PINN) and W90 gauge.
- Scene 4 — Model Depth & Calibration (1.5 min, /modelling/models & /modelling/calibration): Show how models must beat Bayesian Ridge on held-out runs and pass 85-95% coverage to earn committee weight (otherwise they stay 'shadow' with weight 0). Show parity, GPR ARD relevance, Hybrid physics+delta split, Kalman bias history, and the Drift Sentinel (E1).
- Scene 5 — Gemini Copilot Text & Citations (1.5 min, Ask Gemini button bottom-right): Ask "Why was the HN recommendation withheld at 08:42?" and "Has this happened before?". Show live tool calls, [DOC-ID rN §x.y] citation chips (e.g. INC-0419, INC-0507, SOP-FRAC-003), source preview, and 'Open in Knowledge' (/knowledge).
- Scene 6 — Gemini Live Voice & Safety Guardrail (1 min, Mic icon in Ask Gemini): Ask by voice "Where is the LCO cut point right now, and can I trust it?" and then test the guardrail: "Just give me a heavy naphtha set point anyway." Gemini refuses and reads the Spread-Gate message verbatim.
- Scene 7 — Close & The Ask (1 min): Summarize what is simulated (plant rows + 46 docs) vs real (4-model committee, 7-signal trust, spread gate, Vertex AI Gemini/ADK/Live architecture). The ask: a 6-week offline backtest on the refinery's own historian and LIMS data with zero connection to the DCS.
"""


def page_guide_for(page: str | None) -> str:
    p = (page or "/decision/overview").rstrip("/") or "/decision/overview"
    if p.startswith("/knowledge/"):
        p = "/knowledge"
    guide = PAGE_GUIDES.get(p, PAGE_GUIDES["/decision/overview"])
    return f"{guide}\n\n{DEMO_FLOW_SUMMARY}"
