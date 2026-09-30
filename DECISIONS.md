# Canonical Decisions: FCC Soft-Sensor Demo

> **Purpose:** the single list of facts that every document and every line of code must agree with. If a doc or config disagrees with this file, the doc or config is wrong. Change a fact here first (Lead only), then propagate it.
>
> **Order of authority:** `DECISIONS.md` (facts) → `demoflow.md` (what we show) → `features.md` (what we build) → `SDD.md` (how) → `BDD.md` (acceptance) → `build.md` (order) → `checklist.md` (progress).

Last updated: 2026-09-30 (Lead).

## 1. Scope

| # | Decision |
|---|---|
| S1 | The demo covers **D2** (where to set the LCO and heavy-naphtha cut points) and **D3** (can I act on the estimate or wait for the lab). **D1** (hydrotreater sulfur) is site-phase only, because the simulator has no sulfur. |
| S2 | **No financial figures anywhere.** Impact is technical: °F margin to spec, P(on-spec), and LCO yield shift in % of feed. |
| S3 | **Advisory only.** Accept/Decline is recorded; nothing writes to a control system. |
| S4 | Simulated data demonstrates **behaviour and method, never site accuracy**. Accuracy on the client's unit comes from a 6-week offline backtest on their historian and LIMS data (the ask). |

## 2. Data

| # | Decision |
|---|---|
| D1 | **Simulator:** Santander et al. (2022) FCC-Fractionator, ported to Octave in `sim_octave/`. Validated against the published data: 36/46 signals within 0.1%, 41/46 within 0.2% (`sim_octave/VALIDATION.md`). |
| D2 | **Primary batch `full_v1`:** 54 runs, `random_s100`–`random_s153` (seed = number), **1,600 simulated minutes each** (~26.7 h), one row per minute. It started 2026-09-30 13:30, runs at ~68 s per simulated minute, and should finish around **2026-10-01 20:00**. |
| D3 | **Temporary UI data:** `frontend_sample_1h` (4 fixed scenarios × 60 min; legacy perfect-control behaviour; 108 columns, no label columns). Used only until `full_v1` has complete runs. Always labelled as fallback. |
| D4 | **Storage:** local CSVs in `sim_octave/data/<batch>/` are what the API reads, so they are **kept**. BigQuery is the shared copy for analysis and the Copilot: project `fcc-soft-sensor`, dataset `fcc_soft_sensor` (**us-central1**), tables **`fcc_sim_minute`** (full) and **`fcc_sim_minute_sample`**. GCS: `gs://fcc-soft-sensor-sim-data/fcc_sim/<batch>/`. |
| D5 | **IDs:** run name = file stem (`random_s104`). The BigQuery `run_id` is `<batch>_<run>` (`full_v1_random_s104`). Knowledge documents use `sim_batch: full_v1` + `sim_run: random_s104`. |
| D6 | **Time:** `ts = 2026-09-01T00:00:00Z + time_min` minutes, for every run. Minute 0 is 00:00. |
| D7 | **Label columns:** `cutpoint_auto` (1 = operator trim window), `lab_sample` (1 = lab draw minute), `crude_id`, `event_code` (1 crude, 2 feed rate, 3 ROT, 4 feed temperature, 5 LCO set point, 6 HN set point; 0 none). |
| D8 | **Split:** train = `random_s100`–`s139` (40 runs); held-out test and demo = **`random_s140`–`s153`** (14 runs). Grouped by run. Leave-one-regime-out by crude family is also reported. |
| D9 | **Simulator physics note:** in this model the cut points respond strongly to **ROT, feed rate, feed temperature and set-point moves**, and only weakly to feed API. Demo moments are chosen from the data, not assumed. |

## 3. Labs, Control and Noise

| # | Decision |
|---|---|
| L1 | **Lab draws** at minutes 360, 840, 1320 (06:00, 14:00, 22:00), so **3 per run**, ~162 per property in total and **~120 in training**. |
| L2 | **Lab value** = simulator truth at the draw minute + Gaussian noise with σ = R/2.77, where **R = 7 °F** (placeholder reproducibility). Plus injected errors for the reconciliation demo: 3% gross, 5% timestamp. |
| L3 | **LIMS delay: 60 min** (±15 min jitter) from draw to result. This matches the simulator, where the operator trims 60 min after the draw. Relation to the problem statement's "4–12 h blind": in the demo, the blind period is the 8 h sampling interval plus the 1 h delay, so up to ~9 h, which sits inside the industry range. |
| L4 | **Cut-point controllers:** in **manual** except during the trim window (draw + 60 to draw + 120 min, `cutpoint_auto = 1`). In manual the draw valves hold, so the cut point drifts with disturbances. Verified on 2026-09-30: a ROT move of +2.7 °F drifted LCO T98 by +4.6 °F and HN T98 by +6 °F; the trim brought both back. |
| L5 | **Training labels:** models train on **synthetic labs** (`label_source: lab`), not on minute-by-minute simulator truth. Simulator truth is used only for evaluation and the "simulator truth" overlay. |
| L6 | **Process-measurement noise** is added in post-processing (both true and measured values are kept): temperatures σ 0.5 °F, pressures σ 0.05 psi, flows σ 0.5%. One slow drift is injected on one tray temperature in one held-out run, for the sensor-health view (Demo+). |

## 4. Targets and Thresholds (placeholders until the client confirms)

| # | Decision |
|---|---|
| T1 | Targets are `LCO_T98_F` and `HN_T98_F` (98% cut points, °F). Industry specs are usually ASTM D86 T90/T95. We say so, and T98 stands in for the heavy-end cut point. |
| T2 | Specs: **LCO T98 ≤ 765 °F**, **HN T98 ≤ 540 °F**. |
| T3 | Accuracy targets (simulated): RMSE ≤ **1.5 R** time-blocked, ≤ **2.0 R** leave-one-regime-out. 90% interval coverage 85–95%. |
| T4 | Spread gate: **W90 > 14 °F** or a bimodal mixture (D > 2.0) → **withhold**. |
| T5 | Recommendation: **GREEN** full move (cap 5 °F, step 0.5 °F), **AMBER** half move, **RED or WITHHELD** none. Requires P(on-spec after move) ≥ 95%. |

## 5. Product

| # | Decision |
|---|---|
| P1 | **Four dashboards:** Decision, Technical, Modelling, **Knowledge** (F24: document library, full document at the cited section, related records per run). A floating Gemini panel appears on every screen, with a source preview and an "Open in Knowledge" link. |
| P2 | **Model committee:** Bayesian ridge (reference) + GPR + Hybrid delta + PINN ensemble, with a Kalman bias update, mixture distribution, trust score (7 signals), spread gate and fallback. |
| P3 | **Stack:** Next.js + TypeScript + Plotly (`cockpit/web`). FastAPI (`cockpit/api`), which also hosts the soft-sensor pipeline (`cockpit/api/app/`). Vertex AI in **us-central1**: `gemini-2.5-flash` (Copilot), `gemini-live-2.5-flash-native-audio` (voice), `gemini-embedding-001` with `text-embedding-005` fallback, and BM25 as a last resort. Cloud Run + IAP for deployment (Demo+). |
| P4 | **Knowledge corpus:** 46 SIMULATED documents in `knowledge/corpus/`. Shift logs must be grounded in real `full_v1` rows (regenerated after the batch lands). |

## 6. Ways of Working

| # | Decision |
|---|---|
| W1 | The Lead session owns the repo, and delegates to sub-agents (Flash for mechanical tasks, larger models for review) per `delegation.md`. |
| W2 | No git commit or push without the user's explicit approval. |
| W3 | Nothing is deleted without approval, except scratch or generated files. |
