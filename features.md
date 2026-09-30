# Product Features: Agent-Managed FCC Soft Sensors & Decision Cockpit

> **Companion documents:** [Canonical decisions](DECISIONS.md) · [Demo flow](demoflow.md) · [Demo case](BCC.md) · [Behaviour spec](BDD.md) · [SDD](SDD.md) · [Build guide](build.md) · [Checklist](checklist.md) · [Problem statement](fcc_soft_sensor_problem_statement.md) · [Solution design](fcc_ai_driven_soft_sensor_solutions.md)
>
> **Purpose:** the single catalogue of product features. Each entry gives its priority, delivery phase, current build status, the technical outcome it serves, and the BDD feature that defines "done". **Feature IDs defined here are used in every other document.**
>
> **Scope is driven by [demoflow.md](demoflow.md); facts by [DECISIONS.md](DECISIONS.md).**

---

## 1. Summary

**The product has 72 features in 8 epics; 52 are Must-haves. This is a technical demo: success is measured with technical metrics only (accuracy, calibration, gate precision, latency, availability, citation correctness). No financial figures are used anywhere. The front end (the "Cockpit", Epic F) is part of the core product and has four dashboards: Decision, Technical, Modelling and Knowledge, plus a floating Gemini panel on every screen.** Today 21 features are built and 16 are partial (see Status at a Glance); the rest are design only.

- **What changed in this revision:**
  - **Hybrid delta, PINN and GPR are now Must-haves.** They run side by side, and each produces a full **probability distribution**, not just a single number.
  - **Distribution Spread Gate (C7).** When the combined distribution becomes too wide, the system **withholds the recommendation** and says so: *"Distribution spread too wide — no recommendation issued."*
  - **Epic F has 25 features in four dashboards.** A clean **Decision** dashboard for decisions, a **Technical** dashboard with a full **Time-Series Explorer** (F12) over every simulated minute, a **Modelling** dashboard (F21) for a deep dive into each model's numbers, parameters and confidence, and a **Knowledge** dashboard (F24) with the document library, the full document opened at the cited section and the related records for the selected run. Cited sources first open as a compact preview inside the floating Gemini panel (H4), with an "Open in Knowledge" link to F24. Plotly charts and a **live Gemini Copilot agent** throughout. It is built step by step alongside the models (build.md), not at the end.
  - **Stack:** Next.js (App Router, TypeScript) + React + Plotly.js in `cockpit/web`, FastAPI in `cockpit/api`, which also hosts the soft-sensor pipeline (`cockpit/api/app/`: models, mixture, gate, trust, recommendations, Copilot, knowledge index); the binding API contract is [cockpit/API_CONTRACT.md](cockpit/API_CONTRACT.md). Vertex AI in `us-central1`: `gemini-2.5-flash` (Copilot), `gemini-live-2.5-flash-native-audio` (voice), `gemini-embedding-001` embeddings with `text-embedding-005` fallback and BM25 as a last resort (H2). The Copilot (E5) is implemented today with `google-genai` function calling; packaging it as an ADK agent is a Demo+ item.
  - **Dark/light theme toggle is a Must (F19):** default dark, persisted, no flash on load, every Plotly chart re-themes live. Wall mode moves to F25 (Demo+).
  - **Voice Copilot via the Gemini Live API (F23, Must):** `gemini-live-2.5-flash-native-audio` on Vertex AI (project `fcc-soft-sensor`, `us-central1`), with the same read-only tools and guardrails as the text Copilot.
  - **New Epic H: Knowledge & Records.** A Gemini-generated, SIMULATED knowledge corpus of 46 documents ([delegation.md](delegation.md)), a retrieval index, a citation contract (`[DOC-ID rN §x.y]`, "No cited source" below the relevance threshold), a source preview in the Gemini panel, similar past events on decision cards and a job-record track on the Time-Series Explorer.
  - **No financial content.** The former value/benefit features (value waterfall, value model, benefit M&V) are replaced by technical KPI features.
- **Demo MVP:** 40 features (§4.1). It runs entirely on the **simulated data** from `sim_octave/`.
- **Still deliberately deferred:** sequence models (B8), because there are too few labels for them.

### Status at a Glance

| Status | Count | Features |
|---|---|---|
| ✅ Built | 21 | A2, B2, B4, B5, B10, C1, C2, C7, F2, F3, F4, F5, F12, F13, F19, F20, F21, F23, H1, H2, H4 |
| 🟡 Partial | 16 | A1, A3, A4, A7, B1, B6, B9, D5, E5, F1, F6, F8, F9, F22, H3, H5 (gaps in each Status cell below) |
| ⚪ Design only | 35 | A5, A6, A8, B3, B7, B8, C3, C4, C5, C6, D1–D4, E1, E2, E3, E4, E6, F7, F10, F11, F14–F18, F24, F25, G1–G5, H6 |

### Priority at a Glance (MoSCoW)

| Priority | Count | Meaning |
|---|---|---|
| **Must** | 52 | Without it, the product is unsafe, untrustworthy, unusable for decisions, or cannot demonstrate the technical capability |
| **Should** | 16 | Material capability or differentiation; can slip one phase |
| **Could** | 3 | Upside |
| **Won't (initial)** | 1 | Explicitly out of the initial scope |

---

## 2. Epics

```mermaid
flowchart LR
    A["A. Data Platform<br/>8 features"] --> B["B. Probabilistic Models<br/>10 features"]
    B --> C["C. Trust, Spread Gate & Safety<br/>7 features"]
    C --> D["D. Decisions & Control Integration<br/>5 features"]
    B <--> E["E. Agentic Layer (Gemini + ADK)<br/>6 features"]
    C --> F["F. Cockpit: Decision, Technical, Modelling & Knowledge<br/>25 features"]
    D --> F
    E --> F
    E --> G["G. Governance & Technical KPIs<br/>5 features"]
    D --> G
    G --> F
    H["H. Knowledge & Records<br/>6 features"] --> F
    H <--> E
```

| Epic | Purpose | Main technical outcome (BCC §3) |
|---|---|---|
| **A. Data Platform** | Clean, aligned, regime-labelled simulated (later: site) data | Label alignment error; data-quality coverage |
| **B. Probabilistic Models** | Real-time quality estimates **with predictive distributions** from several model types | RMSE vs. reproducibility; 90% coverage; CRPS |
| **C. Trust, Spread Gate & Safety** | Know when to trust an estimate; **withhold advice when the distribution is too wide**; never act unsafely | Gate precision/recall; GREEN-within-R rate; zero unsafe writes |
| **D. Decisions & Control Integration** | Turn estimates into recommendations and MPC/hydrotreater inputs | P(on-spec) after move; margin to spec (°F) |
| **E. Agentic Layer** | Keep models healthy; live Gemini Copilot; cross-unit decisions | Drift detected < 48 h; lab screening rates; Copilot golden-set pass rate |
| **F. Cockpit (Decision / Technical / Modelling / Knowledge)** | Clean web app: decisions for managers and operators, time-series and model deep dives for engineers and data scientists, a knowledge library for everyone; a floating text and voice Copilot with cited source previews | Time to decision; every number traceable to a simulated run |
| **G. Governance & Technical KPIs** | Audit, MOC, technical KPI tracking | Audit completeness; KPI trend vs. baseline |
| **H. Knowledge & Records** | Simulated SOPs, operating windows, lab methods, work orders, shift logs, incidents and MOCs, retrievable and cited by section | Citation correctness (100% resolve); retrieval relevance; Copilot golden-set pass rate |

---

## 3. Feature Catalogue

**Legend:** Status ✅ Built · 🟡 Partial · ⚪ Design only. Phase = first delivery phase (BCC §8; "Demo" = simulator-only MVP). Decision = D1 hydrotreater severity · D2 cut points · D3 trust. BDD = the acceptance feature in [BDD.md](BDD.md); `BDD-n` means Feature n there, which avoids a clash with the Epic F IDs F1–F25. Every Demo-phase feature is built and tested **on the simulated data** (`sim_octave/data/full_v1/`, BigQuery `fcc_sim_minute`; sample table `fcc_sim_minute_sample`).

### Epic A: Data Platform

| ID | Feature | Description | Priority | Phase | Decision | Status | BDD |
|---|---|---|---|---|---|---|---|
| A1 | **Plant / simulator data ingestion to BigQuery** | Simulator CSVs (demo) and historian/LIMS/scheduling (site) land in BigQuery, clustered by run and time | Must | Demo+ | D1 D2 D3 | 🟡 `sim_octave/load_to_bq.py` loads CSVs to BigQuery; API reads local CSVs | BDD-2 |
| A2 | **Simulator data generator** | Octave port of Santander et al. (2022) FCC-Fractionator. Scripted scenarios plus seeded `random` / `random_test` campaigns with lab-draw flags, crude IDs and event codes | Should | Demo | D2 | ✅ `sim_octave/` | — |
| A3 | **Data-quality checks** | Frozen, spike and out-of-range detection per tag; flagged periods excluded from training | Must | Demo | D1 D2 D3 | 🟡 `cockpit/api/app/data/health.py`: range/spike only; flags not excluded from training | BDD-2 |
| A4 | **Lab sample-draw alignment** | Lab results joined at the *sample-draw* time minus transport delay, never at LIMS entry time. In the demo, lab results are synthesised from `lab_sample` flags | Must | Demo | D1 D2 | 🟡 `cockpit/api/app/pipeline.py`: draw-time join; delay being set to 60 min | BDD-2 |
| A5 | **Steady-state detection** | Rolling-variance test plus `event_code`; transient labels excluded | Must | Demo | D1 D2 | ⚪ | BDD-2 |
| A6 | **Lag identification & dynamic alignment** | Prewhitened cross-correlation and FOPDT/FIR fits give per-input delays and aligned features | Must | Demo | D1 D2 | ⚪ | BDD-3 |
| A7 | **Regime labelling** | Crude family (from feed API) × operating mode × catalyst campaign on every row | Must | Demo | D1 D3 | 🟡 `cockpit/api/app/data/catalog.py`: feed-API bands only | BDD-4, BDD-9 |
| A8 | **Blended assay features** | Recipe-weighted crude-assay S/N by boiling range (220–350 °C cut for LCO sulfur) | Must | 3 | D1 | ⚪ | BDD-10 |

### Epic B: Probabilistic Models

Every model returns a **predictive distribution** (mean + σ, or quantiles), not only a point value.

| ID | Feature | Description | Priority | Phase | Decision | Status | BDD |
|---|---|---|---|---|---|---|---|
| B1 | **Hierarchical Bayesian ridge / PLS (reference)** | Regularized regression on lagged features with partial pooling by regime. Bayesian ridge gives σ. Every other model must beat it to get weight | Must | Demo | D1 D2 | 🟡 `cockpit/api/app/models/classic.py`: regime one-hot, no PLS | BDD-3, BDD-9 |
| B2 | **Kalman bias update** | Random-walk bias corrected by each *accepted* lab; rate-limited; its variance is added to every distribution | Must | Demo | D1 D2 | ✅ `cockpit/api/app/pipeline.py` | BDD-6 |
| B3 | **Gradient-boosted trees (quantile)** | Quantile GBM (P5/P50/P95); non-linearity check; shadow member by default | Should | 1 | D1 D2 | ⚪ | BDD-9 |
| B4 | **Gaussian Process Regression** | ARD Matérn 5/2 kernel; predictive σ rises in unfamiliar states and feeds the novelty signal | Must | Demo | D1 D2 D3 | ✅ `cockpit/api/app/models/classic.py` | BDD-9, BDD-15 |
| B5 | **Hybrid delta model** | `ŷ = y_physics + Δ_ML`. Demo physics: pressure-corrected draw-tray temperature correlation for T98. Residual Δ modelled by a GPR, so it gives σ. Site phase: sulfur partitioning by boiling range | Must | Demo | D1 D2 | ✅ `cockpit/api/app/models/hybrid_pinn.py` | BDD-9, BDD-15 |
| B6 | **Physics-informed NN (PINN), deep ensemble** | 5-member ensemble with Gaussian heads (mean + variance). Loss = NLL on labels + bounds and monotonicity penalties on all unlabelled minutes. The ensemble spread gives the epistemic σ | Must | Demo | D1 D2 | 🟡 `cockpit/api/app/models/hybrid_pinn.py`: no bounds penalty | BDD-9, BDD-15 |
| B7 | **Symbolic distillation** | Closed-form equation distilled from the validated model, for a DCS-resident fallback and audit | Should | 2 | D3 | ⚪ | BDD-5 |
| B8 | **Sequence models (LSTM / GRU / TCN)** | Only with dense analyzer labels or a multi-step forecast requirement | Won't (initial) | — | D1 | ⚪ | — |
| B9 | **Committee weighting & admission** | Weights ∝ 1 / recent MSE. A model gets weight only if it passes the escalation gate **and** distribution calibration. Otherwise it is shown as **shadow** (visible, weight 0) | Must | Demo | D1 D2 | 🟡 `cockpit/api/app/pipeline.py`: weights static (recent_n never reached) | BDD-3, BDD-9 |
| B10 | **Mixture predictive distribution** | Combined distribution = weighted Gaussian mixture of admitted members, with bias variance added. Publishes P5/P10/P50/P90/P95, W90, P(on-spec) and a bimodality index | Must | Demo | D1 D2 D3 | ✅ `cockpit/api/app/dist.py` | BDD-3, BDD-15 |

### Epic C: Trust, Spread Gate & Safety

| ID | Feature | Description | Priority | Phase | Decision | Status | BDD |
|---|---|---|---|---|---|---|---|
| C1 | **Trust score (🟢 / 🟡 / 🔴)** | Combines **7** signals: committee spread, input novelty, physics consistency, track record, sensor health, regime familiarity, **distribution spread** | Must | Demo | D3 | ✅ `cockpit/api/app/pipeline.py` | BDD-4 |
| C2 | **Input novelty & sensor health (PCA T² / SPE)** | Multivariate envelope check against the training data, fitted on simulated normal-operation minutes (`full_v1` training runs, s100–s139); detects sensor drift and unseen states. PCA method validated against the public ML-PSE FCCU dataset (github.com/ML-PSE/FCCU-Dataset, MIT); not stored locally — re-clone if needed | Must | Demo | D3 | ✅ `cockpit/api/app/data/health.py` | BDD-4 |
| C3 | **Edge validity gating** | Only estimates carrying a trust level and gate status leave the estimator | Must | 1 | D3 | ⚪ | BDD-1, BDD-5 |
| C4 | **Fallback hierarchy** | Consensus → best single → symbolic → hold last → BAD | Must | Demo | D3 | ⚪ | BDD-5 |
| C5 | **Agent permission layer** | Read-only plant data; IT-artifact writes only; any Level 2 write is rejected and logged | Must | Demo+ | — | ⚪ | BDD-1 |
| C6 | **Trust & distribution calibration** | Thresholds set on held-out simulated runs: ≥ 95% of GREEN within tolerance; 90% intervals cover 85–95% of truth | Must | Demo+ | D3 | ⚪ | BDD-4, BDD-15 |
| C7 | **Distribution Spread Gate** | If W90 of the mixture > the spread limit, **or** the mixture is bimodal (models disagree), then **no recommendation is issued**. The cockpit and Copilot show *"Distribution spread too wide — no recommendation issued"* with the reason and the next action | Must | Demo | D1 D2 D3 | ✅ `cockpit/api/app/gate.py` | BDD-15 |

### Epic D: Decisions & Control Integration

| ID | Feature | Description | Priority | Phase | Decision | Status | BDD |
|---|---|---|---|---|---|---|---|
| D1 | **Fractionator MPC CV feed** | LCO T95/flash and naphtha end point supplied as MPC controlled variables | Must | 2 | D2 | ⚪ | BDD-3, BDD-5 |
| D2 | **Hydrotreater feed-forward** | LCO S/N and naphtha S supplied as disturbance variables to DHDT / naphtha HDS MPCs | Must | 3 | D1 | ⚪ | BDD-11 |
| D3 | **Blending optimizer inputs** | Quality estimates passed to the blending optimizer | Could | 4 | D1 | ⚪ | — |
| D4 | **INDMAX constraint support** | Trusted estimates plus constraint monitoring for closer-to-limit operation | Could | 4 | D2 D3 | ⚪ | — |
| D5 | **Cut-point recommendation engine (advisory)** | Proposes a set-point move toward spec using the mixture distribution: GREEN full move (cap 5 °F), AMBER half move, blocked by C7, RED or WITHHELD; requires P(on-spec after move) ≥ 95%, otherwise HOLD. Shows margin to spec before → after (°F) and LCO yield shift (% of feed, from the simulator). Human accept/decline only | Must | Demo | D2 | 🟡 `cockpit/api/app/recommend.py`: infeasible-move bug being fixed | BDD-15, BDD-16 |

### Epic E: Agentic Layer (Gemini + ADK)

| ID | Feature | Description | Priority | Phase | Decision | Status | BDD |
|---|---|---|---|---|---|---|---|
| E1 | **Model Health & Drift Sentinel** | Residual, spread, σ, T²/SPE and bias-drift monitoring; CUSUM; retrain proposals; drift detected in < 48 h | Must | Demo+ | D3 | ⚪ | BDD-8 |
| E2 | **Lab / LIMS Reconciliation** | Accept / hold / reject each lab result against reproducibility, with rationale | Must | Demo+ | D1 D2 D3 | ⚪ | BDD-7 |
| E3 | **Feed-Change Foresight** | Crude schedule and assays → predicted feed S/N shifts and arrival time; regime labels | Should | 3 | D1 | ⚪ | BDD-10 |
| E4 | **Cross-Unit Orchestrator** | FCC quality forecasts → recommended hydrotreater targets, subject to constraints and human acceptance | Must | 3 | D1 | ⚪ | BDD-11 |
| E5 | **Gemini Copilot agent (live)** | Gemini agent (today `google-genai` function calling; ADK packaging is Demo+), streamed into the cockpit as text (F13) and voice (F23, Gemini Live). Explains estimates and distributions, answers what-if questions via model tools, queries simulated data in BigQuery (read-only), searches and cites the knowledge corpus (Epic H), drafts handovers and demo reports. **Relays spread-gate withholds and never invents a recommendation** | Must | Demo | D3 | 🟡 `cockpit/api/app/copilot/`: `google-genai`, not ADK | BDD-12, BDD-16, BDD-18 |
| E6 | **Governance Assistant** | Drafts MOC packages and validation reports; enforces the promotion approval workflow | Should | 2 | — | ⚪ | BDD-13 |

### Epic F: Cockpit (Front End): Decision, Technical, Modelling and Knowledge Dashboards

**Design direction:** clean and decision-first on top, with full technical depth one click away. Four dashboards share one shell, one provenance chip, one theme and one floating Copilot panel (SDD §7.3):

| Dashboard | For | Question it answers | Features |
|---|---|---|---|
| **Decision** | Managers, shift leads, operators | What should we do now, and can we trust it? | F1, F2, F3, F5, F6 |
| **Technical** | Process / APC engineers | What is the plant doing over time, and why did the estimate move? | F12 (Time-Series Explorer), F8, F10, F11, F7 |
| **Modelling** | Data scientists, model owners | How good is each model, what are its parameters, and how confident is it? | F21 (Model Comparison & Parameters), F4, F9 |
| **Knowledge** | Everyone | What do our procedures and past records say? | F24 (Knowledge Dashboard), H4, H5, H6 |

Next.js (App Router, TypeScript) + React + Plotly.js front end in `cockpit/web` (CSS design tokens + CSS Modules), FastAPI back end in `cockpit/api`, which also hosts the soft-sensor pipeline (`cockpit/api/app/`: models, mixture, gate, trust, recommendations, Copilot, knowledge index), live Gemini agent by text and voice (SDD §7; implemented with `google-genai` function calling today, ADK packaging is Demo+). Embeddings: `gemini-embedding-001` with `text-embedding-005` fallback, BM25 as a last resort (H2). The binding API contract is [cockpit/API_CONTRACT.md](cockpit/API_CONTRACT.md). Visual reference: `docs/ui/` mockups (layout only; their text and numbers are illustrative).

| ID | Feature | Description | Priority | Phase | Status | BDD |
|---|---|---|---|---|---|---|
| F1 | **Decision Overview** | KPI tiles (technical only): accuracy vs. lab (RMSE °F vs. target), 90% interval coverage, trust mix, validated-estimate availability, recommendations accepted, withheld-for-spread count. Plus a "Decisions needed now" list, a 12-hour fan-chart time series and a one-paragraph Gemini summary | Must | Demo | 🟡 `cockpit/web/src/components/views/OverviewView.tsx`: KPIs ignore property | BDD-16 |
| F2 | **Decision Center** | Recommendation cards: action, P(on-spec), margin to spec before → after (°F), confidence, rationale, Accept / Decline (recorded only). Withheld cards show the spread-gate message | Must | Demo | ✅ `cockpit/web/src/components/views/DecisionsView.tsx` | BDD-15, BDD-16 |
| F3 | **Live Quality Console** | One card per property: consensus, P5–P95 fan chart over time, spec line, lab dots, trust badge, reason, "simulator truth" overlay toggle | Must | Demo | ✅ `cockpit/web/src/components/views/QualityView.tsx` | BDD-4, BDD-16 |
| F4 | **Model Confidence & Distributions** | Overlaid PDFs of Hybrid delta, PINN, GPR and Bayesian ridge plus the mixture; weights; spread gauge vs. limit; model-agreement table; shadow members greyed | Must | Demo | ✅ `cockpit/web/src/components/views/ConfidenceView.tsx` | BDD-15, BDD-16 |
| F5 | **Spread-gate banner & messaging** | Global banner and card state whenever C7 triggers: W90 vs. limit, cause (disagreement / novelty), suggested action | Must | Demo | ✅ `cockpit/web/src/components/ui/primitives.tsx` | BDD-15 |
| F6 | **Trust badge & reason component** | Colour **plus icon plus text** (colour-blind safe), with a hover breakdown of the 7 signals | Must | Demo | 🟡 `cockpit/web/src/components/ui/primitives.tsx`: no 7-signal hover | BDD-4 |
| F7 | **What-If Explorer** | Sliders (ROT, feed API, feed rate, LCO SP) → re-predicted distributions from all models, P(on-spec) and margin-to-spec impact; compared against the nearest simulated scenario | Should | Demo+ | ⚪ | BDD-16 |
| F8 | **Simulation Replay & Timeline** | Pick a batch and run from the simulated data; play, pause and speed up to 60×; event markers (`event_code`), lab draws, crude changes | Must | Demo | 🟡 `cockpit/web/src/components/views/ReplayView.tsx`: no 30×, no markers | BDD-16 |
| F9 | **Model Health, Calibration & Drift (Modelling)** | Residual time series per model, CUSUM, bias history, per-regime accuracy, calibration (PIT histogram, reliability diagram, coverage over time), W90 over time, champion vs. challenger | Must | Demo | 🟡 `cockpit/web/src/components/views/CalibrationView.tsx`: no bias history / champion-challenger | BDD-8, BDD-16 |
| F10 | **Lab Reconciliation** | Lab table with accept / hold / reject, agent rationale, injected-error ground truth (simulator only) | Should | Demo+ | ⚪ | BDD-7 |
| F11 | **Data Quality & Sensor Health** | Tag-health heatmap; T² / SPE charts with limits | Should | Demo+ | ⚪ | BDD-2, BDD-4 |
| F12 | **Time-Series Explorer (Technical)** | Multi-panel, x-synchronised 1-minute time series for any simulator tag (inputs, MVs, draw-tray temperatures, targets), every model's estimate with its P5–P95 band, the mixture, simulator truth, lab draws/arrivals, and W90 / gate / trust strips. Event markers (`event_code`, crude changes), range slider, zoom/pan, hover crosshair across panels, compare two runs, CSV/PNG export. WebGL rendering for 1,600-minute runs | Must | Demo | ✅ `cockpit/web/src/components/views/TimeseriesView.tsx` | BDD-16 |
| F13 | **Gemini Copilot panel** | Floating "Ask Gemini" launcher fixed bottom-right on every page, opening an overlay panel that does not reflow the page; the conversation persists across pages; a visible minimise button on every screen (and `Esc`) collapses it back to the launcher, and a keyboard shortcut opens it. Streamed answers (thoughts vs. final answer), suggestion chips, multi-turn, charts in replies, citations to tool data and to knowledge documents as `[DOC-ID rN §x.y]` chips (H3) that open a compact source preview in the panel (H4); the same panel hosts the microphone for voice (F23) | Must | Demo | ✅ `cockpit/web/src/components/copilot/` | BDD-12, BDD-16, BDD-17 |
| F14 | **Demo Report export** | One-click PDF of Decision Overview, Decisions (including withheld), Confidence, Model Comparison and technical KPIs, with a Gemini-drafted narrative for the period | Should | Demo+ | ⚪ | BDD-16 |
| F15 | **Alerts & notifications** | In-app alert centre: RED trust, spread withholds, drift, held labs | Should | 2 | ⚪ | BDD-16 |
| F16 | **Audit & Governance explorer** | Search decisions, approvals, lab statuses and source switches | Should | 2 | ⚪ | BDD-13 |
| F17 | **Role-based views & auth** | Manager, Operator, Process/APC engineer, Data scientist, Admin (each lands on its default dashboard); Google IAP sign-in | Should | 1 | ⚪ | BDD-16 |
| F18 | **Settings & thresholds (view / propose)** | Read-only thresholds; changes proposed through the approval workflow | Could | 2 | ⚪ | BDD-1 |
| F19 | **Dark / light theme toggle** | Every screen is dark by default; one top-bar toggle switches the whole app to light; the choice is persisted and applied before first paint (no flash); every Plotly chart re-themes live from the CSS design tokens without reloading data | Must | Demo | ✅ `cockpit/web/src/lib/theme.ts` | BDD-16 |
| F20 | **Data provenance indicator** | Always-visible chip: "Simulated data · batch · run · timestamp"; truth overlays labelled "simulator truth" | Must | Demo | ✅ `cockpit/web/src/components/shell/AppShell.tsx` | BDD-16 |
| F21 | **Model Comparison & Parameters (Modelling)** | One table per property with every model family: status (admitted / shadow), weight, RMSE, MAE, bias, 90% coverage, CRPS, mean σ, per-regime RMSE. Key parameters per model: ridge α and coefficients; GPR kernel hyperparameters and ARD length-scales; hybrid physics coefficients (a, b, c) and physics-vs-Δ share; PINN architecture, λ_phys, aleatoric vs. epistemic σ split. Charts: parity (predicted vs. simulator truth), residuals over time, error by regime, GPR relevance, hybrid decomposition over time, PINN member spread. Filter by run, regime and time window | Must | Demo | ✅ `cockpit/web/src/components/views/ModelsView.tsx` | BDD-9, BDD-16 |
| F22 | **Four-dashboard navigation** | Top-level switch between Decision, Technical, Modelling and Knowledge dashboards; shared time cursor, run picker, provenance chip, theme and Copilot; deep links (e.g. a withheld card → Modelling view at the same minute) | Must | Demo | 🟡 `cockpit/web/src/lib/nav.ts`: 3 of 4 dashboards | BDD-16 |
| F23 | **Voice Copilot (Gemini Live)** | Push-to-talk voice conversation from the microphone button inside the floating Gemini panel (F13) through the Gemini Live API (`gemini-live-2.5-flash-native-audio` on Vertex AI, project `fcc-soft-sensor`, location `us-central1`; the Live API is US-only) via a FastAPI WebSocket proxy (`/api/live`). Live transcript, barge-in interruption, credentials server-side only. Same read-only tools and guardrails as the text Copilot: gate message verbatim, no set point while WITHHELD, citations | Must | Demo | ✅ `cockpit/api/app/copilot/live.py`, `cockpit/web/src/components/copilot/useLiveVoice.ts` | BDD-18 |
| F24 | **Knowledge Dashboard** | Document library by type (SOP / IOW / LAB / WO / SHIFT / INC / MOC / REF); full document viewer that opens at the cited section; related records for the selected run (SHIFT / WO / INC / MOC, matched via `sim_batch` + `sim_run`); search box using the knowledge search API. Opened from citation chips via "Open in Knowledge" in the Gemini panel source preview (H4) | Must | Demo | ⚪ | BDD-16, BDD-17 |
| F25 | **Accessibility & wall mode** | WCAG AA, keyboard navigation, large-screen control-room mode | Should | Demo+ | ⚪ | BDD-16 |

"Demo+" = built on the simulated data right after the Demo MVP, before Phase 1 on site.

### Epic G: Governance & Technical KPIs

| ID | Feature | Description | Priority | Phase | Decision | Status | BDD |
|---|---|---|---|---|---|---|---|
| G1 | **Immutable audit log** | Every model version, bias update, lab decision, recommendation, accept/decline and gate event logged in BigQuery | Must | 2 | — | ⚪ | BDD-13 |
| G2 | **Champion / challenger pipeline** | Vertex AI Pipelines + Model Registry; time-blocked and leave-one-regime-out evaluation | Must | 2 | D1 D2 | ⚪ | BDD-8, BDD-9 |
| G3 | **MOC package generation** | Validation per regime, risk assessment, rollback plan | Should | 2 | — | ⚪ | BDD-13 |
| G4 | **Technical KPI tracking** | Accuracy, coverage, gate precision, validated-estimate availability, closed-loop uptime and drift-detection time, tracked against the agreed technical baseline | Must | 2 | — | ⚪ | BDD-14 |
| G5 | **Site data audit & technical baseline** | Tag inventory, lab-timestamp audit and baseline lab-vs-spec variance, agreed before any model goes live | Must | 0 | — | ⚪ | — |

### Epic H: Knowledge & Records

Every document is **SIMULATED** (generated by Gemini for the demo) and carries no financial content. The API is specified in [cockpit/API_CONTRACT.md](cockpit/API_CONTRACT.md) §6 and SDD §7.9.

| ID | Feature | Description | Priority | Phase | Decision | Status | BDD |
|---|---|---|---|---|---|---|---|
| H1 | **Simulated knowledge corpus** | 46 SIMULATED documents (SOP, IOW, LAB, WO, SHIFT, INC, MOC, REF) generated by Gemini in 7 work packages ([delegation.md](delegation.md)), with fixed register IDs, revisions and section templates. Shift logs are grounded in `full_v1` simulator runs. Validated by `knowledge/tools/check_corpus.py`, which writes `knowledge/corpus/manifest.json` | Must | Demo | D2 D3 | ✅ `knowledge/corpus/` | BDD-17 |
| H2 | **Retrieval index** | One chunk per `###` section (per `##` section if it has no subsections) with `doc_id`, `revision`, `section` and `title` metadata. Vertex AI embeddings (`gemini-embedding-001`, with `text-embedding-005` as fallback), and BM25 as a last resort when embeddings are unavailable | Must | Demo | D2 D3 | ✅ `cockpit/api/app/knowledge/index.py` | BDD-17 |
| H3 | **Citations contract** | Document-based statements cite `[DOC-ID rN §x.y]`. Only chunks at or above the relevance threshold (0.35) may be cited; otherwise the answer is labelled "No cited source". Every citation resolves to a manifest document, revision and section | Must | Demo | D3 | 🟡 `cockpit/api/app/knowledge/index.py`: resolves doc only | BDD-17 |
| H4 | **Source preview in the Gemini panel** | Citation chips in the Gemini panel and on decision and withheld cards open a compact preview of the cited section inside the floating Gemini panel: doc ID, revision, section number and title, section text and the SIMULATED label, plus an "Open in Knowledge" link that opens the full document at the cited section in the Knowledge dashboard (F24) | Must | Demo | D2 D3 | ✅ `cockpit/web/src/components/copilot/SourcePreview.tsx` | BDD-17 |
| H5 | **Similar past events** | Decision and withheld cards show the closest past WO, INC and SHIFT records ("Last time the spread was this wide") with citations, via the `find_similar_events` tool | Should | Demo | D2 D3 | 🟡 `cockpit/api/app/copilot/tools.py`: INC/SHIFT only; not on cards | BDD-17 |
| H6 | **Job-record track** | A Time-Series Explorer track with WO, SHIFT, INC and MOC markers; SHIFT logs are placed at the start of their `sim_window` on the matching `sim_run`; records without a simulator minute are listed by date, never placed at an invented minute | Should | Demo+ | D3 | ⚪ | BDD-17 |

---

## 4. Releases

### 4.1 Demo MVP: 40 features, simulated data only

**Goal:** a clean cockpit where three model families disagree or agree visibly, over time and as distributions, and the system withholds advice when it should. Engineers can drill into every time series and every model parameter. Every procedure-based answer cites a simulated document section, by text or by voice.

| Group | Features |
|---|---|
| Data (6) | A2, A3, A4, A5, A6, A7 |
| Models (7) | B1, B2, B4, B5, B6, B9, B10 |
| Trust & gate (4) | C1, C2, C4, C7 |
| Decisions (1) | D5 |
| Agent (1) | E5 |
| Cockpit (16) | F1, F2, F3, F4, F5, F6, F8, F9, F12, F13, F19, F20, F21, F22, F23, F24 |
| Knowledge (5) | H1, H2, H3, H4, H5 |

**Demo+ (next, still on simulated data):** A1 (BigQuery path), C5, C6, E1, E2, E5 ADK packaging, F7, F10, F11, F14, F25, H6.

> [!NOTE]
> The simulator models cut points, not sulfur. The demo covers **D2 and D3**; **D1 is site only** (DECISIONS.md S1). D1 sulfur features (A8, D2, E3, E4, and the sulfur form of B5) need site data or a sulfur surrogate.

### 4.2 Release Plan by Phase

| Phase | Features delivered | Exit criterion (BCC §8) |
|---|---|---|
| **Demo** (simulated data) | Demo MVP (§4.1) plus Demo+ | checklist.md fully ticked |
| **0** Data audit | G5; site version of A1, A3, A4 | Data quality OK; technical baseline agreed |
| **1** Advisory on site | B3, C3, F17; site retrain of all Demo models | RMSE ≤ 1–1.5× ASTM on live data |
| **2** Agent lifecycle + MPC | B7, D1, E6, F15, F16, F18, G1–G4 | ≥ 90% closed-loop uptime; drift detected < 48 h |
| **3** Cross-unit feed-forward | A8, D2, E3, E4; sulfur hybrid | Measured reduction in quality variance and H₂ use per bbl vs. baseline |
| **4** Scale-out | D3, D4 | Technical KPI tracking across units |

---

## 5. Dependencies

```mermaid
flowchart TD
    SIM[A2 Simulated data] --> A3[A3 Data quality]
    SIM --> A4[A4 Lab alignment]
    A3 --> A5[A5 Steady state]
    A4 --> B1[B1 Bayesian ridge]
    A5 --> B1
    A6[A6 Lags] --> B1
    A7[A7 Regimes] --> B1
    B1 --> B9[B9 Committee]
    B4[B4 GPR] --> B9
    B5[B5 Hybrid delta] --> B9
    B6[B6 PINN ensemble] --> B9
    B9 --> B10[B10 Mixture distribution]
    B2[B2 Kalman bias] --> B10
    B10 --> C7[C7 Spread gate]
    B10 --> C1[C1 Trust score]
    C2[C2 PCA novelty] --> C1
    C1 --> D5[D5 Cut-point advisor]
    C7 --> D5
    D5 --> F2[F2 Decision Center]
    B10 --> F4[F4 Confidence view]
    C7 --> F5[F5 Spread banner]
    E5[E5 Gemini agent] --> F13[F13 Copilot panel]
    F2 --> F1[F1 Decision Overview]
    SIM --> F12[F12 Time-Series Explorer]
    B9 --> F21[F21 Model Comparison]
    B10 --> F9[F9 Calibration and drift]
    F1 --> F22[F22 Four dashboards]
    F12 --> F22
    F21 --> F22
    H4 --> F24[F24 Knowledge dashboard]
    F24 --> F22
    H1[H1 Knowledge corpus] --> H2[H2 Retrieval index]
    H2 --> H3[H3 Citations]
    H3 --> H4[H4 Source preview]
    H4 --> F13
    H3 --> F13
    H2 --> H5[H5 Similar past events]
    H5 --> F2
    E5 --> F23[F23 Voice Copilot]
```

**Critical path:** A2 → A4 → B1 → B9 → B10 → C7 → D5 → F2 → F1. Lab alignment (A4) and distribution calibration (C6) are the highest-risk links.

---

## 6. Non-Functional Requirements

| Category | Requirement | Target |
|---|---|---|
| Latency | Estimator step (4 models + mixture + gate) | ≤ 1 s per minute |
| Latency | Cockpit: first meaningful paint / live update | ≤ 2 s / ≤ 1 s after the estimate |
| Latency | Copilot: first streamed token | ≤ 3 s |
| Latency | Time-Series Explorer: pan/zoom on a 1,600-minute run with 12 series | ≤ 150 ms per interaction (WebGL) |
| Latency | Voice Copilot: first audio after the user stops speaking | ≤ 1.5 s at p50 |
| Latency | Knowledge search | ≤ 500 ms at p95 |
| Citation correctness | Every citation shown by the Copilot, cards or source preview | 100% resolve to a manifest document, revision and section retrieved in the same turn; "No cited source" below the threshold |
| Theme | Dark/light switch | No flash of the wrong theme on load; all charts re-themed ≤ 300 ms |
| Availability | Validated estimate available | ≥ 95% of operating time |
| Accuracy | RMSE vs. lab / truth | RMSE ≤ 1.5R time-blocked, ≤ 2.0R leave-one-regime-out (simulated); 1–1.5× reproducibility on site (Phase 1) |
| Calibration | 90% interval coverage on held-out simulated runs | 85–95% |
| Security | Zoning | IEC 62443; no cloud-to-L2 write path; the cockpit's Accept button records a decision and never writes to control |
| Accessibility | Cockpit | WCAG 2.1 AA; trust shown by colour, icon and text |
| Explainability | Every estimate | Trust colour, reason, distribution; spread-gate message when withheld |
| Provenance | Every screen | Data source chip; simulator truth clearly labelled |

---

## 7. Out of Scope

- Replacing certified online analyzers used for product certification.
- Any autonomous write to the DCS or MPC by an AI component or the cockpit (autonomy level L3 is prohibited).
- Rigorous kinetic simulation in real time.
- Sequence models (B8) until dense labels or a forecast requirement exist.
