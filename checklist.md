# Build Checklist: FCC Soft Sensor & Decision Cockpit (Demo MVP on Simulated Data)

> **How to use:** each phase maps to a step in [build.md](build.md) (same numbering), with facts in [DECISIONS.md](DECISIONS.md), scope in [demoflow.md](demoflow.md), specs in [SDD.md](SDD.md) and acceptance tests in [BDD.md](BDD.md). Tick as work lands: ☑ done · ◐ partial · ☐ to do. A phase is complete only when its **data check** proves the simulated data was actually used.
>
> **Batch:** `full_v1` (54 runs `random_s100`–`random_s153` × 1,600 sim-min) **Train:** `s100–s139` (40 runs) **Held-out test + demo:** `s140–s153` (14 runs) **Demo default run:** `random_s140` (final run picked from the hold-out, demoflow §3) **Owner:** ____________

---

> [!IMPORTANT]
> **Current status (2026-09-30):** pipeline, API (39 tests pass), Decision/Technical/Modelling pages, Copilot text + voice and the knowledge index are built and running on the labelled fallback `frontend_sample_1h`. Batch `full_v1` started 2026-09-30 13:30 (~30 h, **ETA ~2026-10-01 20:00**). Next on the critical path: process noise → `full_v1` load + retrain on labs → demo-run selection (M1–M3) → F24 Knowledge dashboard + SHIFT logs on held-out runs → rehearsal. Measurement blanks (`___`) are filled **after the `full_v1` retrain**.

## Progress Tracker

| Phase | build.md | Unlocks | Status | Signed off (name / date) |
|---|---|---|---|---|
| 0 Environment | Step 0 | — | ☑ | |
| 1 Data: `full_v1`, labs, noise | Step 1 | Every scene | ◐ | |
| 2 API, time series, Technical page | Step 2 | Scene 2 | ◐ | |
| 3 Models + mixture | Step 3 | Scenes 1–4 bands | ◐ | |
| 4 Trust, gate, recommendation | Step 4 | Scenes 1, 3 | ◐ | |
| 5 Decision + Modelling pages | Step 5 | Scenes 0, 1, 3, 4 | ◐ | |
| 6 Knowledge dashboard + Copilot text | Step 6 | Scene 5 | ◐ | |
| 7 Voice (Gemini Live) | Step 7 | Scene 6 | ◐ | |
| 8 Demo readiness | Step 8 | All | ☐ | |

**The universal data rule (SDD-RAW-05):** every number in the cockpit, every model artifact and every test fixture must trace back to a simulated `batch_id / run_id / time_min`. Hand-made mock data is not allowed.

---

## Phase 0: Environment (Step 0)

- ☑ `FCC_HOME` exported and quoted (the path has spaces and `&`)
- ☑ Octave, Python, Node and gcloud available
- ☑ `cockpit/api/.venv` created with `uv` (no global installs); `requirements.txt` installed
- ☑ `cockpit/web` dependencies installed; `npm run dev` serves port 3000
- ☑ Git repository initialised (no commits or pushes without explicit approval, DECISIONS W2)

**Data check:** `cd cockpit/api && .venv/bin/pytest -q` → ☑ 39 passed
- ☑ **Phase 0 complete**

---

## Phase 1: Data — `full_v1`, Labs and Noise (Step 1)

📦 **Simulated data used:** `sim_octave/data/full_v1/random_s100…s153.csv` (112 columns). Fallback `frontend_sample_1h` only until `full_v1` has complete runs.

Simulator and labels
- ☑ Octave port of Santander et al. (2022); validation 36/46 within 0.1%, 41/46 within 0.2% (`sim_octave/VALIDATION.md`) — A2
- ☑ Cut-point controllers in manual except the trim window (draw + 60 → + 120 min); verified 2026-09-30 (ROT +2.7 °F → LCO T98 +4.6 °F, HN T98 +6 °F; trim brought both back) — L4
- ☑ Random campaigns + label columns `cutpoint_auto`, `lab_sample`, `crude_id`, `event_code`
- ☑ BigQuery loader `sim_octave/load_to_bq.py` + 1-h UI sample table `fcc_sim_minute_sample`

Batch `full_v1`
- ◐ Batch running: 54 runs × 1,600 min, started 2026-09-30 13:30, ETA ~2026-10-01 20:00 (progress in `sim_octave/data/full_v1/logs/`)
- ☐ All 54 CSVs complete (1,601 lines each, 112 columns)
- ☐ Labs: 3 per run at minutes 360 / 840 / 1320 → 162 per property in total, ~120 in training (s100–s139)
- ☐ Heavy/edge runs listed (`dist_feed_API < 21`) for M3: ___

Labs, noise, quality (A1, A3, A4, A7)
- ◐ Synthetic labs (σ = R/2.77, R = 7 °F; 3% gross, 5% timestamp errors) in `cockpit/api/app/data/catalog.py` — A4: confirm LIMS delay = **60 ± 15 min** and join at the draw time
- ☐ **Process-measurement noise** in post-processing, true and measured both kept: temperatures σ 0.5 °F, pressures σ 0.05 psi, flows σ 0.5% (L6)
- ◐ DQ range/spike checks in `app/data/health.py` (frozen check off by default) — A3
- ◐ Regime labels: crude one-hot only; operating mode × catalyst campaign not yet — A7

BigQuery copy (A1 ◐)
- ☐ `full_v1` loaded to `fcc-soft-sensor.fcc_soft_sensor.fcc_sim_minute` (dataset in **us-central1**) after `--dry-run` review; no legacy 108-column file in the full table
- ☐ GCS copy at `gs://fcc-soft-sensor-sim-data/fcc_sim/full_v1/`

**Data check**
```bash
cd "$FCC_HOME/sim_octave"
ls data/full_v1/random_s*.csv | wc -l      # 54
bq query --location=us-central1 --use_legacy_sql=false --label=app:fcc-soft-sensor --label=component:checklist \
'SELECT COUNT(DISTINCT run_id) runs, COUNT(*) rows, SUM(lab_sample) labs FROM `fcc-soft-sensor.fcc_soft_sensor.fcc_sim_minute` WHERE batch_id="full_v1"'
curl -s localhost:8000/api/health | python3 -m json.tool | grep -A8 '"data"'
```
- ☐ Result: 54 runs · 86,400 rows · 162 lab minutes; `/api/health → data.source = "full_v1"`
- ☐ **Phase 1 complete**

---

## Phase 2: API, Time Series and the Technical Page (Step 2) · Scene 2

📦 **Simulated data used:** fallback today; `full_v1/random_s140` (and the chosen demo run) after the batch lands.

Back end (`cockpit/api/app/`)
- ☑ FastAPI app, CORS, error format, `provenance` in every response
- ☑ `/api/health`, `/api/config`, `/api/runs`, `/api/tags`, `/api/admin/reload`, `/api/admin/train`
- ☑ `/api/runs/{run_id}/timeseries` with LTTB `max_points`; `/api/estimates/timeseries`; `/api/estimate(s)`; `/api/stream`
- ☑ Catalog fallback logic: `full_v1` active at ≥ 4 complete train + ≥ 1 complete held-out runs; partial runs never used
- ☑ API tests: 39 pass

Cockpit (`cockpit/web/src/`)
- ☑ App shell: dashboard switch, provenance chip (F20), run picker, shared store (`components/shell/AppShell.tsx`, `lib/store.ts`)
- ◐ Theme toggle (F19) in `lib/theme.ts`: implemented; live re-theme and no-flash check to verify
- ☑ `/technical` Time-Series Explorer (F12): stacked panels, shared x-axis, event markers
- ◐ Replay (F8): 30× replay from 1 h before the crude switch; lab draw vs lab arrival markers; controller-mode strip from `cutpoint_auto`
- ☐ Pan/zoom ≤ 150 ms on a 1,600-minute run: ___ ms (after `full_v1` retrain)

**Data check**
- ☐ `/technical` values for 3 tags match `full_v1/random_s140.csv` at 3 spot-checked minutes; the chip reads `Simulated data · full_v1 · random_s140 · hh:mm`
- ☐ **Phase 2 complete**

---

## Phase 3: Models and Mixture (Step 3) · Scenes 1–4

📦 **Simulated data used:** train on synthetic labs from s100–s139 (`label_source: auto`, `min_labs: 100`); PINN physics penalties on unlabelled s100–s139 minutes; evaluate vs truth on every minute of s140–s153.

- ◐ Bayesian ridge `bayes_ridge_v1` (`app/models/classic.py`) — B1: regime one-hot, no hierarchical pooling
- ☑ GPR `gpr_v1`, Matérn 5/2 ARD + white noise — B4
- ☑ Hybrid delta `hybrid_delta_v1` (`app/models/hybrid_pinn.py`) — B5. Fitted a/b/c: ___ (after `full_v1` retrain)
- ◐ PINN ensemble `pinn_ens_v1`, 5 members, NLL + physics/monotonicity penalties — B6: per-property, fixed λ
- ☑ Kalman bias, linear 30-min ramp (`app/pipeline.py`); BDD-6 numbers K ≈ 0.524, b_target ≈ 0.105 — B2
- ◐ Committee weights and admission — B9
- ☑ Mixture: bisection quantiles, W90, Ashman D, `p_on_spec`, CRPS (`app/dist.py`) — B10
- ☐ **A5 steady-state filter:** 30-min rolling std + `event_code == 0`; transient labs excluded
- ☐ **A6 lag identification:** prewhitened cross-correlation 0–60 min on s100–s139 only → `artifacts/lags.json`; tray lags ___ min
- ☐ **Retrain on `full_v1` labs** (`python -m app.train`, then `POST /api/admin/reload`); `eval.note` reports labels = `lab`

Measurements (after `full_v1` retrain)
- ☐ Ridge baseline RMSE vs truth: LCO ___ °F, HN ___ °F
- ☐ Mixture RMSE vs truth, time-blocked (target ≤ 1.5R = 10.5 °F): LCO ___ °F, HN ___ °F
- ☐ Mixture RMSE vs truth, leave-one-regime-out (target ≤ 2.0R = 14 °F): LCO ___ °F, HN ___ °F
- ☐ Mixture 90% coverage (target 85–95%): LCO ___ %, HN ___ %
- ☐ RMSE with bias vs without bias on s140–s153: ___ vs ___
- ☐ Admission table recorded for 4 families × 2 targets
- ☐ Calibrated `w90_max` (reported, not applied; gate stays 14 °F): ___ °F

**Data check:** no held-out run ID (`random_s140`–`s153`) appears in any training artifact; the calibration report covers 14 runs × 1,600 minutes per property.
- ☐ **Phase 3 complete**

---

## Phase 4: Trust, Spread Gate and Recommendation (Step 4) · Scenes 1, 3

📦 **Simulated data used:** held-out replay of s140–s153; gain and yield sensitivity from `event_code` 5/6 windows in s100–s139.

- ☑ Trust score, 7 signals S1–S7 → GREEN / AMBER / RED (`app/pipeline.py`) — C1
- ☑ PCA T²/SPE novelty on simulated normal-operation training minutes (`app/data/health.py`) — C2
- ☑ Spread gate (`app/gate.py`) — C7:
  - ☑ W90 > 14 °F → WITHHELD
  - ☑ Bimodal (D > 2.0) → WITHHELD
  - ☑ Hysteresis
  - ☑ Exact SDD-GATE-04 message text
  - ☑ Gate transitions written to the audit log
- ◐ Recommendation engine (`app/recommend.py`) — D5: GREEN full move (cap 5 °F, step 0.5 °F), AMBER half, RED/WITHHELD none; P(on-spec after) ≥ 95% else HOLD
- ☑ `POST /api/recommendations/{id}/decision` writes only to the SQLite audit log; no route to any control system (S3)
- ☐ **C4 fallback chain:** consensus → best single → hold last → BAD, with hysteresis; switches audited
- ☐ Gain `g` = ___; LCO yield sensitivity = ___ % of feed per °F (after `full_v1` retrain)
- ☐ GREEN within R ≥ 95%: ___ %; RED catches of |err| > 2R ≥ 80%: ___ % (after `full_v1` retrain)

**Data check:** on the demo run, ≥ 1 RAISE/LOWER and ≥ 1 WITHHELD observed; gate transitions reference only held-out run IDs.
- ☐ **Phase 4 complete**

---

## Phase 5: Decision and Modelling Pages (Step 5) · Scenes 0, 1, 3, 4

📦 **Simulated data used:** the demo run's estimates, distributions, recommendations and labs.

- ◐ `/decision` Overview (F1): KPI tiles (technical only), Decisions needed, 12-hour fan chart with lab dots, 765 °F spec line, trust strip — reconcile KPIs with the API on `full_v1`
- ☑ Decision Center (F2): actionable cards (Δ, P(on-spec), margin before → after °F, LCO yield shift % of feed), Accept/Decline, withheld cards with "Why? → Modelling"
- ☑ Live Quality Console (F3)
- ☑ Model Confidence (F4): overlaid member PDFs + mixture, W90 gauge, bimodality index
- ☑ Spread-gate banner (F5)
- ◐ Trust badge (F6): colour + icon + text; hover breakdown of all 7 signals
- ◐ Calibration (F9): coverage over time, PIT, reliability, CRPS on held-out runs
- ☑ Model Comparison & Parameters (F21)
- ◐ Dashboard navigation (F22): Decision · Technical · Modelling built; **Knowledge** added in Phase 6
- ☐ Scene 1 citation chip on the recommendation card opens the source preview in the Gemini panel
- ☐ No currency, ROI, NPV or payback on any page or API response (SDD-NFR-11) — verify on `full_v1`

**Data check:** `/modelling` Model Comparison metrics equal `/api/models` to 0.01 °F; Scene 1 → Accept shows *"Recorded. The cockpit never writes to the DCS."*
- ☐ **Phase 5 complete**

---

## Phase 6: Knowledge Dashboard and Copilot Text (Step 6) · Scene 5

📦 **Simulated data used:** 46 SIMULATED documents in `knowledge/corpus/`; SHIFT logs grounded in held-out `full_v1` rows; Copilot tools read estimates, recommendations and labs of simulated runs.

Knowledge
- ☑ Corpus: 46 documents; `knowledge/tools/check_corpus.py` + generators — H1
- ☑ Index: one chunk per `###` section; `gemini-embedding-001` → `text-embedding-005` → BM25; threshold 0.35 (`app/knowledge/index.py`) — H2
- ☑ API: `/api/knowledge/search`, `/docs`, `/docs/{doc_id}`, `/records?run_id=`
- ☑ Source preview inside the Gemini panel (`components/copilot/SourcePreview.tsx`) — H4
- ◐ Citations contract: every citation resolves; "No cited source" below 0.35 — H3
- ◐ Similar past events on withheld cards (up to 3 cited WO/INC/SHIFT) — H5
- ☐ **SHIFT logs regenerated on held-out runs `random_s140`–`s153`** from real `full_v1` rows, 2026-09-01 clock, front matter `sim_batch: full_v1` + `sim_run`; `check_corpus.py` validates `sim_run` / `sim_window`
- ☐ **F24 Knowledge dashboard** (`cockpit/web/src/app/knowledge/page.tsx`): document library, full document at the cited section, related records per run; fourth entry in the dashboard switch
- ☐ **"Open in Knowledge"** link in the Gemini source preview deep-links to the cited section

Copilot text (E5 ◐, F13 ☑)
- ☑ google-genai (`vertexai=True`) function-calling loop, `gemini-2.5-flash`, us-central1 (`app/copilot/chat.py`); ADK packaging = Demo+
- ☑ Read-only tools incl. `search_documents`, `get_document`, `find_similar_events`; `query_sim_data` SELECT-only over `fcc_sim_minute` (local catalog) (`app/copilot/tools.py`)
- ☑ SSE events `thought / tool_call / final / chart / citation / suggestion / error / done`
- ☑ Floating Gemini panel on every page (`components/copilot/CopilotLauncher.tsx`)
- ☐ Golden set on the demo run (after `full_v1` retrain): withholds relayed ___ % (target 100%); fabricated numbers ___ (target 0); first token p50 ___ s (target ≤ 3 s)

**Data check**
```bash
python3 knowledge/tools/check_corpus.py knowledge/corpus
curl -s localhost:8000/api/health | python3 -m json.tool | grep -A3 knowledge
```
- ☐ 46 docs; every SHIFT `sim_run` is a held-out `full_v1` run and its `sim_window` lies inside that run
- ☐ Scene 5: both scripted questions return cited answers; chip → Open in Knowledge opens the right section beside the run's records
- ☐ **Phase 6 complete**

---

## Phase 7: Voice with Gemini Live (Step 7) · Scene 6

📦 **Simulated data used:** the same tool results as Phase 6, on the demo run.

- ☑ `WS /api/live` proxy (`app/copilot/live.py`), `gemini-live-2.5-flash-native-audio` in us-central1, startup probe and fallback in `/api/health` — F23
- ☑ Tools executed server-side; credentials server-side only
- ☑ Mic button, 16 kHz PCM16 in, 24 kHz out, interruption flush (`components/copilot/useLiveVoice.ts`)
- ☐ On the demo run at a WITHHELD minute: gate message spoken verbatim, no set point proposed
- ☐ First audio p50: ___ s (target ≤ 1.5 s; after `full_v1` retrain)

**Data check:** the voice transcript at a WITHHELD minute contains the exact SDD-GATE-04 message; the browser network log contains no Google credentials.
- ☐ **Phase 7 complete**

---

## Phase 8: Demo Readiness (Step 8) · All scenes

- ☐ Demo-run selection from held-out `random_s140`–`s153`: M1 blind drift run/minute ___, M2 safe recommendation ___, M3 withhold ___; backup run ___; written to `cockpit/api/config.yaml` (`demo:` block, `data.default_run`)
- ☐ Demo cache in `artifacts/demo_cache/`; cockpit loads in ≤ 2 s
- ☐ Fallbacks ready (demoflow §6): cached Copilot answers labelled "cached"; backup run for M3; screen recording of Scenes 5–6
- ☐ Rehearsal end to end against demoflow.md §4 (12 min, Scenes 0–7)
- ☐ Provenance chip visible in every screenshot; every displayed number traceable to a simulated run (spot-check 10 values)
- ☐ No component has a write path to any control system (code review signed)

**Final sign-off:** ____________ (Engineering) ____________ (Product) ____________ (Process SME) Date: ________

---

## Demo+ (not on the critical path)

- ☐ ADK packaging of the Copilot (E5)
- ☐ Lab Reconciliation agent + labs page (E2, F10)
- ☐ Drift Sentinel, CUSUM, champion/challenger (E1)
- ☐ What-If Explorer page (F7; API `POST /api/whatif` exists)
- ☐ Data Quality full + injected tray-temperature drift in one held-out run (F11, L6)
- ☐ Job-record track in the Time-Series Explorer (H6)
- ☐ Demo Report PDF (F14)
- ☐ Accessibility & wall mode (F25)
- ☐ Executable BDD, Playwright, Lighthouse
- ☐ Cloud Run + IAP in `fcc-soft-sensor`, us-central1 (F17)
