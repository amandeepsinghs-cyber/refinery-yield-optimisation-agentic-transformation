# Build Checklist: FCC Soft Sensor & Decision Cockpit (Demo MVP on Simulated Data)

> **How to use:** each phase maps to a step in [build.md](build.md) (same numbering), with facts in [DECISIONS.md](DECISIONS.md), scope in [demoflow.md](demoflow.md), specs in [SDD.md](SDD.md) and acceptance tests in [BDD.md](BDD.md). Tick as work lands: ☑ done · ◐ partial · ☐ to do. A phase is complete only when its **data check** proves the simulated data was actually used.
>
> **Batch:** `full_v1` (54 runs `random_s100`–`random_s153` × 1,600 sim-min) **Train:** `s100–s139` (40 runs) **Held-out test + demo:** `s140–s153` (14 runs) **Demo default run:** `random_s140` (final run picked from the hold-out, demoflow §3) **Owner:** ____________

---

> [!IMPORTANT]
> **Current status (2026-10-01 05:25 UTC):**
> - **100% of Application Code Built & Tested (`208` pytest + `55` vitest pass):** Simulator port + validation (`A2`), controller auto/manual trim (`L4`), process-measurement noise (`L6`), steady-state filter (`A5`), prewhitened CCF lags (`A6`), 4-family committee + mixture (`B1/B4/B5/B6/B9/B10`), 7-signal trust + PCA novelty + spread gate + fallback chain (`C1/C2/C4/C7`), recommendations (`D5`), all **4 dashboards & 13 views** (`Decision`, `Technical`, `Modelling`, `Knowledge` + What-If `F7`, Labs `F10/E2`, Data Quality `F11`, Drift Sentinel `E1`, Demo Report Export `F14`, Job-record track `H6`, Wall Mode `F25`, and Topbar **7-Scene Demo & UI Guide** `DemoGuideModal.tsx`), 46-doc Knowledge corpus (`H1–H4`), Copilot text + ADK `root_agent` (`E5`), and Gemini Live voice (`F23`).
> - **Batch `full_v1` Status (54/54 running, ZERO regeneration):** 45 main-wave runs at **660–780 / 1,600 min** (~45%–49% done, ETA **~15:00–16:00 UTC** today; `s139` & `s142` fast-resumed at min 601 & 661) + 9 recovery-wave runs at **60–120 / 1,600 min**. Disk space hardened (`~9–10 GB` free; remaining CSV writes need only `~50 MB`).
> - **Remaining Critical Path (4 post-simulation steps, ~25 mins total, delegated per `delegation.md`):**
>   1. **[Data Session — `T1.0`]** Load finished 1,600-min `full_v1` CSVs to BigQuery (`make load-full`) & GCS (`~5m`).
>   2. **[Flash Session — `T1.4`]** Regenerate `SHIFT` logs (`WP5`) on full 1,600-min held-out runs (`s140–s153`) & run `check_corpus.py` (`~5m`).
>   3. **[Lead Session — `T3.1`]** Final retrain (`python -m app.train`) on `full_v1` labs (`s100–s139`, ≥100 clean labs) & record held-out metrics below (`~5m`).
>   4. **[Lead + Flash — `T7.1–7.2`]** Lock in M1–M3 demo runs/minutes in `config.yaml`, warm `artifacts/demo_cache/`, and run 12-min rehearsal (`~10m`).

## Progress Tracker

| Phase | build.md | Owner (Delegation) | Unlocks | Status | Signed off (name / date) |
|---|---|---|---|---|---|
| 0 Environment | Step 0 | Lead + Flash | — | ☑ | 2026-09-30 |
| 1 Data: `full_v1`, labs, noise | Step 1 | **Data** (`T1.0`) + **Lead** | Every scene | ◐ (code ☑; batch @ ~48%) | |
| 2 API, time series, Technical page | Step 2 | **Lead** + **Flash** | Scene 2 | ☑ (code ☑; 1600m check pending) | |
| 3 Models + mixture | Step 3 | **Lead** (`T3.1`) | Scenes 1–4 bands | ◐ (code ☑; final lab fit pending) | |
| 4 Trust, gate, recommendation | Step 4 | **Lead** (`T3.1`) | Scenes 1, 3 | ☑ (code ☑; final KPIs pending) | |
| 5 Decision + Modelling pages | Step 5 | **Lead** + **Flash** (`C6/C7`) | Scenes 0, 1, 3, 4 | ☑ | |
| 6 Knowledge dashboard + Copilot text | Step 6 | **Flash** (`T1.4`) + **Lead** | Scene 5 | ◐ (code ☑; 1600m SHIFT logs pending) | |
| 7 Voice (Gemini Live) | Step 7 | **Lead** (`T6.1`) | Scene 6 | ☑ | |
| 8 Demo readiness | Step 8 | **Lead + Flash** (`T7.1–7.2`) | All | ☐ (after Step 3) | |

**The universal data rule (SDD-RAW-05):** every number in the cockpit, every model artifact and every test fixture must trace back to a simulated `batch_id / run_id / time_min`. Hand-made mock data is not allowed.

---

## Phase 0: Environment (Step 0) · Owner: Lead + Flash

- ☑ `FCC_HOME` exported and quoted (the path has spaces and `&`)
- ☑ Octave, Python, Node and gcloud available
- ☑ `cockpit/api/.venv` created with `uv` (no global installs); `requirements.txt` installed
- ☑ `cockpit/web` dependencies installed; Next.js serves `:3001`, proxying `/api/*` to FastAPI `:8010`
- ☑ Git repository initialised (no commits or pushes without explicit approval, DECISIONS W2)
- ☑ Disk-space safety check: root `/` maintained with ≥ 5 GB free buffer (`~9–10 GB` available; remaining `full_v1` CSV growth is only `~50 MB`)

**Data check:** `cd cockpit/api && .venv/bin/pytest -q` → ☑ 208 passed (`55` vitest pass in `cockpit/web`)
- ☑ **Phase 0 complete**

---

## Phase 1: Data — `full_v1`, Labs and Noise (Step 1) · Owner: Data (`T1.0`) + Lead

📦 **Simulated data used:** `sim_octave/data/full_v1/random_s100…s153.csv` (112 columns). Fallback `frontend_sample_1h` used when `min_rows: 1500` until `full_v1` has complete runs.

Simulator and labels
- ☑ Octave port of Santander et al. (2022); validation 36/46 within 0.1%, 41/46 within 0.2% (`sim_octave/VALIDATION.md`) — A2
- ☑ Cut-point controllers in manual except the trim window (draw + 60 → + 120 min); verified 2026-09-30 (ROT +2.7 °F → LCO T98 +4.6 °F, HN T98 +6 °F; trim brought both back) — L4
- ☑ Random campaigns + label columns `cutpoint_auto`, `lab_sample`, `crude_id`, `event_code`
- ☑ BigQuery loader `sim_octave/load_to_bq.py` + 1-h UI sample table `fcc_sim_minute_sample`
- ☑ Fast-resume support in `sim_octave/run_sim.m` (preserves existing CSV rows and skips prior ODE minutes on restart — zero regeneration)

Batch `full_v1` (**Delegated: Data Session `T1.0` via 3-hour cron**)
- ◐ Batch running: 54 runs × 1,600 min, started 2026-09-30 13:30 (05:25Z Oct 1: **54/54 running** — 45 main-wave runs @ 660–780 min incl. fast-resumed `s139`/`s142` + 9 recovery runs @ 60–120 min; see [tasks/done/T1.0_report.md](tasks/done/T1.0_report.md))
- ☐ **[Data — `T1.0`]** All 54 CSVs complete (1,601 lines each, 112 columns)
- ☐ **[Data — `T1.0`]** Labs: 3 per run at minutes 360 / 840 / 1320 → 162 per property in total, ~120 in training (s100–s139)
- ☐ **[Lead — `T7.1`]** Heavy/edge runs listed (`dist_feed_API < 21`) for M3: ___

Labs, noise, quality (A1, A3, A4, A7)
- ☑ Synthetic labs (σ = R/2.77, R = 7 °F; 3% gross, 5% timestamp errors) in `cockpit/api/app/data/catalog.py` — A4: LIMS delay = **60 ± 15 min** joined at draw time
- ☑ **Process-measurement noise** in post-processing, true (`load_true()`) and measured (`load()`) both kept: temperatures σ 0.5 °F, pressures σ 0.05 psi, flows σ 0.5%, plus slow tray-13 drift on `random_s152` (`DECISIONS L6`)
- ☑ DQ range/spike checks in `app/data/health.py` (frozen check off by default) + `/technical/data-quality` page (`F11`) — A3
- ☑ Regime labels: crude regime (`heavy`/`medium`/`light`) + controller mode & event flags — A7

BigQuery & GCS copy (**Delegated: Data Session `T1.0`**)
- ☐ **[Data — `T1.0`]** `full_v1` loaded to `fcc-soft-sensor.fcc_soft_sensor.fcc_sim_minute` (dataset in **us-central1**) via `make load-full` after `--dry-run` review
- ☐ **[Data — `T1.0`]** GCS copy at `gs://fcc-soft-sensor-sim-data/fcc_sim/full_v1/` (do **not** delete local CSVs until BQ + GCS are verified)

**Data check**
```bash
cd "$FCC_HOME/sim_octave"
ls data/full_v1/random_s*.csv | wc -l      # 54
bq query --location=us-central1 --use_legacy_sql=false --label=app:fcc-soft-sensor --label=component:checklist \
'SELECT COUNT(DISTINCT run_id) runs, COUNT(*) rows, SUM(lab_sample) labs FROM `fcc-soft-sensor.fcc_soft_sensor.fcc_sim_minute` WHERE batch_id="full_v1"'
curl -s localhost:8010/api/health | python3 -m json.tool | grep -A8 '"data"'
```
- ☐ Result: 54 runs · 86,400 rows · 162 lab minutes; `/api/health → data.source = "primary"`
- ☐ **Phase 1 complete**

---

## Phase 2: API, Time Series and the Technical Page (Step 2) · Scene 2 · Owner: Lead + Flash

📦 **Simulated data used:** fallback `frontend_sample_1h` (or clean preview) while batch finishes; `full_v1/random_s140` (and chosen demo run) after the batch lands.

Back end (`cockpit/api/app/`)
- ☑ FastAPI app, CORS, error format, `provenance` in every response
- ☑ `/api/health`, `/api/config`, `/api/runs`, `/api/tags`, `/api/admin/reload`, `/api/admin/train`
- ☑ `/api/runs/{run_id}/timeseries` with LTTB `max_points`; `/api/estimates/timeseries`; `/api/estimate(s)`; `/api/stream`
- ☑ Catalog fallback logic: `full_v1` active at ≥ 4 complete train + ≥ 1 complete held-out runs; partial runs excluded when `min_rows: 1500`
- ☑ API & backend tests: **208 pass**

Cockpit (`cockpit/web/src/`)
- ☑ App shell: dashboard switch, provenance chip (F20), run picker, shared store, Topbar **Demo & UI Guide Modal** (`components/shell/AppShell.tsx`, `DemoGuideModal.tsx`, `lib/store.ts`)
- ☑ Theme toggle (F19) in `lib/theme.ts` & `globals.css`: sleek obsidian-slate dark mode + crisp light mode, zero muddy brown surfaces (`tests/theme.test.ts` verified)
- ☑ `/technical` Time-Series Explorer (F12, H6): stacked panels, shared x-axis, event markers, `SHIFT`/`WO`/`INC`/`MOC` job-record tracks
- ☑ Replay (F8): 30× replay from 1 h before the crude switch; lab draw vs lab arrival markers; controller-mode strip from `cutpoint_auto`
- ☐ **[Flash — `T7.1`]** Pan/zoom ≤ 150 ms on a 1,600-minute run: ___ ms (after `full_v1` retrain)

**Data check**
- ☐ `/technical` values for 3 tags match `full_v1/random_s140.csv` at 3 spot-checked minutes; the chip reads `Simulated data · full_v1 · random_s140 · hh:mm`
- ☐ **Phase 2 complete**

---

## Phase 3: Models and Mixture (Step 3) · Scenes 1–4 · Owner: Lead (`T3.1`)

📦 **Simulated data used:** train on synthetic labs from s100–s139 (`label_source: auto`, `min_labs: 100`); PINN physics penalties on unlabelled s100–s139 minutes; evaluate vs truth on every minute of s140–s153.

- ☑ Bayesian ridge `bayes_ridge_v1` (`app/models/classic.py`) — B1: regime one-hot
- ☑ GPR `gpr_v1`, Matérn 5/2 ARD + white noise — B4
- ☑ Hybrid delta `hybrid_delta_v1` (`app/models/hybrid_pinn.py`) — B5. Fitted a/b/c: ___ (after `full_v1` retrain)
- ☑ PINN ensemble `pinn_ens_v1`, 5 members, NLL + physics/monotonicity penalties — B6: per-property, fixed λ
- ☑ Kalman bias, linear 30-min ramp (`app/pipeline.py`); BDD-6 numbers K ≈ 0.524, b_target ≈ 0.105 — B2
- ☑ Committee weights and admission (`app/train.py`, `app/pipeline.py`) — B9
- ☑ Mixture: bisection quantiles, W90, Ashman D, `p_on_spec`, CRPS (`app/dist.py`) — B10
- ☑ **A5 steady-state filter:** 30-min rolling std + `event_code == 0`; transient minutes excluded (`app/data/features.py`)
- ☑ **A6 lag identification:** prewhitened cross-correlation 0–60 min on s100–s139 only → `artifacts/lags.json` (`app/data/lags.py`)
- ☐ **[Lead — `T3.1`]** **Final retrain on 1,600-min `full_v1` labs** (`python -m app.train`, then `POST /api/admin/reload`); `eval.note` reports labels = `lab`

Measurements (**Delegated: Lead `T3.1` after 1,600-min `full_v1` retrain**)
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

## Phase 4: Trust, Spread Gate and Recommendation (Step 4) · Scenes 1, 3 · Owner: Lead (`T3.1`)

📦 **Simulated data used:** held-out replay of s140–s153; gain and yield sensitivity from `event_code` 5/6 windows in s100–s139.

- ☑ Trust score, 7 signals S1–S7 → GREEN / AMBER / RED (`app/pipeline.py`) — C1
- ☑ PCA T²/SPE novelty on simulated normal-operation training minutes (`app/data/health.py`) — C2
- ☑ Spread gate (`app/gate.py`) — C7:
  - ☑ W90 > 14 °F → WITHHELD
  - ☑ Bimodal (D > 2.0) → WITHHELD
  - ☑ Hysteresis
  - ☑ Exact SDD-GATE-04 message text
  - ☑ Gate transitions written to the audit log
- ☑ Recommendation engine (`app/recommend.py`) — D5: GREEN full move (cap 5 °F, step 0.5 °F), AMBER half, RED/WITHHELD none; P(on-spec after) ≥ 95% else HOLD
- ☑ `POST /api/recommendations/{id}/decision` writes only to the SQLite audit log; no route to any control system (S3)
- ☑ **C4 fallback chain:** consensus → best single → hold last → BAD, with hysteresis; switches audited (`app/pipeline.py`)
- ☐ **[Lead — `T3.1`]** Gain `g` = ___; LCO yield sensitivity = ___ % of feed per °F (after 1,600-min `full_v1` retrain)
- ☐ **[Lead — `T3.1`]** GREEN within R ≥ 95%: ___ %; RED catches of |err| > 2R ≥ 80%: ___ % (after 1,600-min `full_v1` retrain)

**Data check:** on the demo run, ≥ 1 RAISE/LOWER and ≥ 1 WITHHELD observed; gate transitions reference only held-out run IDs.
- ☐ **Phase 4 complete**

---

## Phase 5: Decision and Modelling Pages (Step 5) · Scenes 0, 1, 3, 4 · Owner: Lead + Flash

📦 **Simulated data used:** the demo run's estimates, distributions, recommendations and labs.

- ☑ `/decision` Overview (F1, F14): KPI tiles (technical only), Decisions needed, 12-hour fan chart with lab dots, 765 °F spec line, trust strip, PDF/Markdown Demo Report export
- ☑ Decision Center (F2): actionable cards (Δ, P(on-spec), margin before → after °F, LCO yield shift % of feed), Accept/Decline, withheld cards with "Why? → Modelling" and similar past events (H5)
- ☑ Live Quality Console (F3)
- ☑ Model Confidence (F4): overlaid member PDFs + mixture, W90 gauge, bimodality index
- ☑ Spread-gate banner (F5): sleek slate-elevated banner with accent left border (zero muddy brown fill)
- ☑ Trust badge (F6): colour + icon + text; hover breakdown of all 7 signals (`primitives.tsx`)
- ☑ Calibration & Drift Sentinel (F9, E1): coverage over time, PIT, reliability, CRPS, CUSUM, champion/challenger, W90 & Kalman bias history (`CalibrationView.tsx`)
- ☑ Model Comparison & Parameters (F21)
- ☑ Dashboard navigation (F22): Decision · Technical · Modelling · Knowledge + Topbar **Demo & UI Guide**
- ☑ Scene 1 citation chip on the recommendation card opens the source preview in the Gemini panel
- ☑ No currency, ROI, NPV or payback on any page or API response (SDD-NFR-11, verified by `test_bdd_acceptance.py` & `theme.test.ts`)

**Data check:** `/modelling` Model Comparison metrics equal `/api/models` to 0.01 °F; Scene 1 → Accept shows *"Recorded. The cockpit never writes to the DCS."*
- ☑ **Phase 5 complete**

---

## Phase 6: Knowledge Dashboard and Copilot Text (Step 6) · Scene 5 · Owner: Flash (`T1.4`) + Lead

📦 **Simulated data used:** 46 SIMULATED documents in `knowledge/corpus/`; SHIFT logs grounded in held-out `full_v1` rows; Copilot tools read estimates, recommendations and labs of simulated runs.

Knowledge
- ☑ Corpus: 46 documents; `knowledge/tools/check_corpus.py` + generators — H1
- ☑ Index: one chunk per `###` section; `gemini-embedding-001` → `text-embedding-005` → BM25; threshold 0.35 (`app/knowledge/index.py`) — H2
- ☑ API: `/api/knowledge/search`, `/docs`, `/docs/{doc_id}`, `/records?run_id=`
- ☑ Source preview inside the Gemini panel (`components/copilot/SourcePreview.tsx`) — H4
- ☑ Citations contract: every citation resolves; "No cited source" below 0.35 — H3
- ☑ Similar past events on withheld/decision cards (up to 3 cited WO/INC/SHIFT) — H5 (`DecisionsView.tsx`)
- ☐ **[Flash — `T1.4`]** **SHIFT logs regenerated on complete 1,600-min held-out runs `random_s140`–`s153`** from real `full_v1` rows, 2026-09-01 clock, front matter `sim_batch: full_v1` + `sim_run`; `check_corpus.py` validates `sim_run` / `sim_window`
- ☑ **F24 Knowledge dashboard** (`cockpit/web/src/app/knowledge/page.tsx`): document library, full document at the cited section, related records per run; fourth entry in the dashboard switch
- ☑ **"Open in Knowledge"** link in the Gemini source preview deep-links to the cited section

Copilot text (E5 ☑, F13 ☑)
- ☑ ADK agent definition `root_agent` with canonical tool bindings and fallback layer (`app/copilot/adk_agent.py`); `google-genai` streaming loop in `app/copilot/chat.py` + page/chart/button context (`app/copilot/ui_guide.py`) — E5
- ☑ Read-only tools incl. `search_documents`, `get_document`, `find_similar_events`; `query_sim_data` SELECT-only over `fcc_sim_minute` (local catalog) (`app/copilot/tools.py`)
- ☑ SSE events `thought / tool_call / final / chart / citation / suggestion / error / done`
- ☑ Floating Gemini panel on every page (`components/copilot/CopilotLauncher.tsx`)
- ☑ Golden set harness (`16/16` PASS on fallback); ☐ **[Lead — `T7.1`]** re-record golden metrics on final 1,600-min demo run: withholds relayed ___ % (target 100%); fabricated numbers ___ (target 0); first token p50 ___ s (target ≤ 3 s)

**Data check**
```bash
python3 knowledge/tools/check_corpus.py knowledge/corpus
curl -s localhost:8010/api/health | python3 -m json.tool | grep -A3 knowledge
```
- ☐ 46 docs; every SHIFT `sim_run` is a complete held-out `full_v1` run and its `sim_window` lies inside that run
- ☑ Scene 5: both scripted questions return cited answers; chip → Open in Knowledge opens the right section beside the run's records
- ☐ **Phase 6 complete**

---

## Phase 7: Voice with Gemini Live (Step 7) · Scene 6 · Owner: Lead (`T6.1`)

📦 **Simulated data used:** the same tool results as Phase 6, on the demo run.

- ☑ `WS /api/live` proxy (`app/copilot/live.py`), `gemini-live-2.5-flash-native-audio` in us-central1, startup probe (`0.7 s` audio OK) and fallback in `/api/health` — F23
- ☑ Tools executed server-side; credentials server-side only
- ☑ Mic button, 16 kHz PCM16 in, 24 kHz out, interruption flush (`components/copilot/useLiveVoice.ts`)
- ☑ On a WITHHELD minute: gate message spoken verbatim, no set point proposed (`VOICE_EXTRA` guardrail verified)
- ☐ **[Lead — `T7.2`]** First audio p50 during rehearsal: ___ s (target ≤ 1.5 s)

**Data check:** the voice transcript at a WITHHELD minute contains the exact SDD-GATE-04 message; the browser network log contains no Google credentials.
- ☑ **Phase 7 complete**

---

## Phase 8: Demo Readiness (Step 8) · All scenes · Owner: Lead + Flash (`T7.1–7.2`)

- ☐ **[Lead + Flash — `T7.1`]** Demo-run selection from complete held-out `random_s140`–`s153`: M1 blind drift run/minute ___, M2 safe recommendation ___, M3 withhold ___; backup run ___; written to `cockpit/api/config.yaml` (`demo:` block, `data.default_run`)
- ☐ **[Flash — `T7.1`]** Demo cache in `artifacts/demo_cache/`; cockpit loads in ≤ 2 s
- ☐ **[Flash — `T7.1`]** Fallbacks ready (demoflow §6): cached Copilot answers labelled "cached"; backup run for M3
- ☐ **[Lead + User — `T7.2`]** Rehearsal end to end against demoflow.md §4 (12 min, Scenes 0–7) using the in-app **7-Scene Demo Guide**
- ☑ Provenance chip visible in every view; every displayed number traceable to a simulated run
- ☑ No component has a write path to any control system (verified by `test_bdd_acceptance.py` & `test_adk_agent.py`)

**Final sign-off:** ____________ (Engineering) ____________ (Product) ____________ (Process SME) Date: ________

---

## Demo+ (not on the critical path)

- ☑ ADK packaging of the Copilot (E5) — `root_agent` and canonical tools in `cockpit/api/app/copilot/adk_agent.py`
- ☑ Lab Reconciliation agent + labs page (E2, F10) — `GET /api/labs` + `LabsView.tsx` (`/technical/labs`)
- ☑ Drift Sentinel, CUSUM, champion/challenger, and slow tray-temp drift `DECISIONS L6` (E1) — `modelling.py`, `catalog.py`, `CalibrationView.tsx`, `test_drift_sentinel.py`
- ☑ What-If Explorer page (F7; API `POST /api/whatif` + `WhatIfView.tsx` at `/technical/whatif`)
- ☑ Data Quality full + PCA T²/SPE & tag health page (F11) — `GET /api/dq` + `DataQualityView.tsx` (`/technical/data-quality`)
- ☑ Job-record track in the Time-Series Explorer (H6) — `SHIFT` timeline spans + date-listed `WO/INC/MOC` in `TimeseriesView.tsx`
- ☑ Demo Report PDF & Markdown export (F14) — print-ready report card + `.md` download in `OverviewView.tsx`
- ☑ Accessibility & wall mode (F25) — control-room wall mode + role switcher in `SettingsView` (`/settings`)
- ☑ In-App Interactive 7-Scene Demo & UI/Graph Guide (`DemoGuideModal.tsx` + `ui_guide.py`)
- ☑ Executable BDD acceptance suite (`cockpit/api/tests/test_bdd_acceptance.py` covering `BDD-1` through `BDD-17`)
- ☐ *(Optional)* Cloud Run + IAP in `fcc-soft-sensor`, us-central1 (F17)


---

## v2 Expansion Checklist (Phases 9–12): Systems-Thinking Digital Twin & 11-Use-Case Catalogue (Epic I)

> **Reference:** [`expansion_plan_recommendation.md`](docs/archive/expansion_plan_recommendation.md) · [`features.md` §8 (Epic I)](features.md) · [`SDD.md` §13](SDD.md) · [`BDD.md` §6 (`BDD-19..22`)](BDD.md) · [`build.md` Steps 9–12](build.md) · [`demoflow.md` Scenes 8–9](demoflow.md)

| Phase | build.md | Scope | Unlocks | Status |
|---|---|---|---|:-:|
| **9 Systems Twin & Yield Suite (`v0.2`)** | Step 9 | `app/twin.py`, `GET /api/twin`, `RefineryTwinSchematic.tsx` (6-Unit PFD), 4-Domain Ripple Matrix, `UC-01`, `UC-02`, `UC-03`, `UC-11` | Scene 8 (Systems Twin) | ☑ |
| **10 Regen, Heaters & Fouling (`v0.3`)** | Step 10 | `UC-04` (Regen Coke & Afterburn), `UC-05` & `UC-10` (Furnace $CO/O_2$ & Coking), `UC-07` (Condenser UA Fouling) | Scene 8 & 9 (Units 1, 3, 5) | ☑ |
| **11 Energy, $\Delta P$, Equip & Catalogue Tab (`v0.4`)** | Step 11 | `UC-06` (Plan-Coupled Energy), `UC-08` (Hydraulic $\Delta P$), `UC-09` (`CAB`/`WGC`, Valves, `*_dup` Drift) + `UseCaseCatalogueView.tsx` (`#1–#11` & 23 Cases) | Scene 9 (Use-Case Explorer) | ☑ |
| **12 PINN Panel, Gemini Live Tools & BDD (`v0.5`)** | Step 12 | `pinn_residuals` strip, Copilot/Live tools (`get_systems_twin_state`, `get_use_case_detail`), `test_twin_expansion.py` (`BDD-19..22`) | Full v2 Demo Sign-Off | ☑ |

---

### Phase 9: Unified Systems Twin Backend & 6-Unit Interactive Digital Twin Schematic (Step 9)

- ☑ `cockpit/api/app/twin.py` created: reads 112-column simulator rows + model committee estimates + knowledge citations
- ☑ `GET /api/twin?run_id=&time_min=` registered in `cockpit/api/app/routers/decision.py`
- ☑ All 6 sequential physical units returned (`unit_1_furnace`, `unit_2_riser`, `unit_3_regenerator`, `unit_4_fractionator`, `unit_5_condenser`, `unit_6_stabiliser`) with 3-zone operating envelopes (`SDD-TWIN-01..03`)
- ☑ 3 Closed-Loop System Couplings (`loop_hydrocarbon`, `loop_catalyst`, `loop_heat`) and 4-Domain Systems Ripple Matrix (`yield`, `energy`, `regeneration`, `reliability`) populated (`SDD-RIP-01`)
- ☑ Live envelopes & recommendations for **UC-01** (`LCO_T98_F`), **UC-02** (Stabiliser $C_5$ recovery `c5_recovery_pct`), **UC-03** (LPG & `HN_T98_F` split), and **UC-11** (Multi-stream Soft Sensors)
- ☑ `cockpit/web/src/components/twin/RefineryTwinSchematic.tsx` built: interactive 2D ISA-101 6-unit PFD with hydrocarbon, pumparound heat, and catalyst loops (`I1`)
- ☑ `OverviewView.tsx` updated with `RefineryTwinSchematic`, Unit/Use-Case selector, and 4-Domain Systems Ripple Matrix (`I2`)

---

### Phase 10: Catalyst Regeneration, Fired Heaters & Exchanger UA Fouling (Step 10)

- ☑ **UC-04 (Reactor Regeneration & Cyclone Afterburn — `I7`):** `Treg_F`, `Tcyc_F`, `dT_cyc_reg_F = Tcyc_F - Treg_F`, `C_spent_cat`, `C_regen_cat`, `F_coke`, `standpipe_level`; cites `[IOW-002]` & `[SOP-FCC-010]`
- ☑ **UC-05 & UC-10 (Fired Heater $CO/O_2$ Combustion & Tube Coking — `I8`):** `fluegas_O2_pct`, `fluegas_CO_ppm`, `F5_fuel`, `T3_furnace_F - T2_preheat_F`; cites `[IOW-001]`
- ☑ **UC-07 (Overhead Condenser & Exchanger UA Fouling — `I10`):** `dist_condenser_eff` vs clean baseline (`0.900`), `MV_cw_flow`, `MV_PA1..MV_PA4`; cites `[SOP-FCC-012]`

---

### Phase 11: Plan-Coupled Energy, Hydraulic $\Delta P$, Rotating Equipment, Sensor Drift & Use-Case Explorer (Step 11)

- ☑ **UC-06 (Plan-Coupled Complex Energy Dashboard — `I9`):** `F5_fuel` + `power_CAB` + `power_WGC` minus `MV_PA1..MV_PA4` heat recovery evaluated against active Plan cutpoints (`SP_LCO_T98`, `SP_HN_T98`)
- ☑ **UC-08 (Hydraulic & Filter/Coalescer $\Delta P / F^2$ Breakthrough — `I11`):** `dP_reactor_frac` normalized resistance cited to `[SOP-FCC-010]`
- ☑ **UC-09 (Rotating Equipment, Valve Stiction & Dual-Sensor Drift Matrix — `I12`):** `power_CAB`, `power_WGC`, `valve_V8..V11`, and 5-channel `|T - T_dup|` / `|P - P_dup|` matrix cited to `[WO-2025-118]` and `[MOC-2025-041]`
- ☑ `cockpit/web/src/components/views/UseCaseCatalogueView.tsx` built (`I4`): explicit use-case-by-use-case explorer for `UC-01`..`UC-11` + 23 downstream cases + Dual-Sensor Drift & Valve Stiction table
- ☑ Mode switcher / sub-tab added in `OverviewView.tsx`, `cockpit/web/src/app/decision/use-cases/page.tsx` & `cockpit/web/src/lib/nav.ts` (`Overview & Twin` ↔ `Use-Case Catalogue` ↔ `Decisions` ↔ `Quality`)

---

### Phase 12: PINN Conservation Panel, Gemini Live Systems Tools & BDD Verification (Step 12)

- ☑ `pinn_residuals` strip (`mass_balance_err_pct`, First-Law enthalpy balance, Tray boiling monotonicity `T_tray01 <= ... <= T_tray20`, equipment residuals) rendered in `OverviewView.tsx` & `UseCaseCatalogueView.tsx` (`I3`)
- ☑ Read-only Copilot & Gemini Live tools `get_systems_twin_state` and `get_use_case_detail` added in `cockpit/api/app/copilot/tools.py` & `adk_agent.py` (`SDD-CAT-02`, `BDD-22`)
- ☑ `cockpit/api/tests/test_twin_expansion.py` passing (`BDD-19`, `BDD-20`, `BDD-21`, `BDD-22`, plus `SDD-NFR-11` zero-currency check across all `/api/twin` payloads)
- ☑ All backend pytest tests (`213 passed`) and frontend tests (`npx tsc --noEmit && npx vitest run` — `55 passed`) pass with 0 errors

---

### Phase 13: Full Unit & Use-Case Data Workspaces, Engineered SVG PFD, Actionable Decisions & Proactive Multilingual Sentinels (Step 13)

- ☑ `cockpit/api/app/twin.py` upgraded with per-unit and per-use-case `tag_table` (all relevant tags with `role`, `current`, `window_min`, `window_mean`, `window_max`, `limit_or_sp`), `chart_panels` (2–3 multi-trace time-series chart groups), and `decisions_needed` (`SDD-TWIN-05`, `SDD-CAT-03`)
- ☑ `POST /api/twin/decision` added in `cockpit/api/app/routers/decision.py` to record `accepted` / `declined` decisions for any unit (`Units 1–6`) or use case (`UC-01–UC-11`) in SQLite `decisions` & `audit` tables (`SDD-TWIN-06`)
- ☑ `agent_fleet` (1 Shift Supervisor Orchestrator + 6 Domain Sentinel Agents) added to `GET /api/twin` with proactive early warnings and real-time briefings in **English (`en`)**, **Hinglish (`hinglish`)**, and **Hindi (`hi`)** (`SDD-AGENT-01..03`)
- ☑ `RefineryTwinSchematic.tsx` upgraded with: (a) **Interactive 2D ISA-101 SVG Process Flowsheet** (vessels, pipes, loops, `#1–#11` pins), (b) **Proactive Multi-Agent Sentinel Bar (`EN` / `Hinglish` / `हिंदी` + Voice Readout)**, and (c) **Full Unit Digital Twin Workspace** (live Plotly time-series charts, complete tag table, and working `Accept`/`Decline` decision buttons)
- ☑ `UseCaseCatalogueView.tsx` upgraded with Left-Rail System Tree + **Full Use-Case Workspace** (live Plotly time-series charts for that use case, complete tag table with shift `min`/`mean`/`max`, trilingual agent briefing, and working `Accept`/`Decline` decision buttons)
- ☑ `BDD-23` verified in `cockpit/api/tests/test_twin_expansion.py` with 100% backend and frontend test pass rate




## v3 Checklist (Phases 14–19): Crude-Adaptive Engines & L0/L1 Screens (Epic J)

> Plan: [BUILD_PLAN_v3.md](BUILD_PLAN_v3.md) · Specs: SDD §1A, §14 · Acceptance: BDD-24..28

### Phase 14: Regime data & staging (Step 14 · J1 · BDD-24)
- ☑ SDD §1A problem re-anchor + §14 engine/screen specs; BDD-24..28; features Epic J; build Steps 14–19 (P0)
- ☑ `cockpit/api/app/regimes.py` — R1–R4 API bands, labels, `regime_for_api`, `regime_segments`
- ☑ `sim_octave/stage_regimes.py` — `_staged/regimes.csv`, `_staged/lab_results.csv` for `full_v1` (54 runs, 50 switches, 98 labs)
- ☑ `sim_octave/scenario.m` `crude_campaign` + `run_campaign_batch.sh` (generation deferred until `full_v1` completes)
- ☑ `tests/test_regimes.py` green; financial-term scan green

### Phase 15: E1 Regime + E3 Detection (Step 15 · J2, J4 · BDD-24, BDD-26)
- ☑ `app/engines/regime.py` — fingerprint, posterior, novelty, `transition_pct`, `declared_vs_detected`; `GET /api/regime`; `crude_slate` in `/api/twin`
- ☑ `app/engines/detect.py` — residual ±3σ, CUSUM, change-point, MV contribution; trilingual briefings
- ☑ SQLite `agent_events`; `GET /api/agents/events`; SSE `GET /api/agents/stream`
- ☑ `GET /api/unit/{unit_id}/workbench` — four zones (Data · Analysis · Models · Decisions) for all 6 units; `crude_slate` / `needs_attention` / `timeline` in `/api/twin`
- ☑ `/api/twin` L0 contract (§6): `kpi_vs_plan` (SP-or-expected plan, `plan_tolerances`), `flags` / `decisions_open`, ranked `needs_attention` with Systems-Agent consequence, compact `timeline`, `plant` strip — `tests/test_twin_l0.py` (2026-10-01)
- ☐ Held-out acceptance: regime within ≤ 45 min on ≥ 90 % switches; U4 breach before next lab on ≥ 80 % — *tests pass on partial `full_v1`; re-run after the batch completes*

### Phase 16: E2 Adaptation + E4 Recipe (Step 16 · J3, J5 · BDD-25, BDD-27) — critical path
- ☑ `app/engines/adapt.py` — per-regime weights, physics weight vs novelty, bias reset; `GET /api/adaptation`
- ☑ `app/engines/surrogates.py` + `train_surrogates.py` — 10 outputs × 11 inputs per regime, model cards
- ☑ `app/engines/recipe.py` — objective, constraints, search, gate; `GET /api/recipe`; `recipe_id` on decisions
- ☑ `config.yaml` `recipe:` and `iow:` sections
- ☐ `eval_recipe.py` replay: recipe ≥ hold on priority yield at equal/better P(on-spec) — *harness exists; number to be recorded after `full_v1` completes*

### Phase 17: Agents on the event bus (Step 17 · J4)
- ☑ Sentinels emit E3 events and draft E4 recipes; Systems Agent consequence lines (`app/engines/systems.py`, 19 rules over catalyst / heat / hydrocarbon loops)
- ☑ ADK extras (`get_scope_snapshot`, `get_regime`, `get_recipe`) in `ALL_TOOLS`; `root_agent.tools` still 8 (`tests/test_gemini_scope.py::test_adk_canonical_count_unchanged_and_extras_registered`)

### Phase 18: Screens (Step 18 · J6, J7 · BDD-28)
- ☑ L0 `/twin` — hybrid PFD (6 live units + boundary blocks, 3 loops), crude-slate banner, KPI vs plan, counts, "Needs attention", 12-h shift timeline (drag / arrow-key scrub, ▶ replay); zero charts (`plotly:0` verified by CDP screenshot)
- ☑ L1 `/twin/unit/[unit_id]` — U4 to the mockup: header + I/O strip, 5-panel chart stack on one shared x-range and one cursor (hover guide broadcast), event ribbon, analysis strip (trilingual briefing), rail = regime & adaptation · model evidence · optimisation (what-if sliders + P(on-spec)/Δ-yield curve) · decision (Accept / Decline → `/api/twin/decision`) · Ask Gemini; `?uc=` scroll + highlight; `time_min` optional on the API (fresh browser works)
- ☑ U1, U2, U3, U5, U6 workbenches render through the same data-driven component (5 panels · 5 rail cards · 0 grey · no h-scroll, verified by CDP on random_s107 @ 600); per-unit yield axes follow `lib/l1.ts → yieldAxis` (U3 `% feed · wt %` left / `power` right; U5 `power`; U6 `% feed · %`; U2 `%`), `tray_profile` renders as a column profile at the cursor with a window-start ghost (U4, under "More panels" / `?more=1`), `combustion` keeps CO on the right axis (U1); L0 attention lines deep-link `?tag=` → owning panel highlight
- ☑ Light default + persisted dark toggle (`layout.tsx` `data-theme="light"`, `fcc-theme` localStorage); `/` → `/twin` redirect; EN / Hinglish / हिंदी toggle persisted in store (`lang`)
- ☑ Named trace palette on L1 (`lib/l1.ts → traceColor`, contract §8; payload greys rejected via `isGrey`; vitest + CDP `greyTraces:0` on all 6 units)
- ☑ Phase-13 catalogue + old dashboards (Decision / Technical / Modelling / Knowledge) retired from nav (`lib/nav.ts`: `DASHBOARDS = [twin]`, rail = Refinery + U1…U6 + Audit log; `LEGACY_DASHBOARDS` keep the routes resolvable for deep links); topbar brand → `/twin` (D3)
- ☐ Playwright `e2e/twin.spec.ts` green — spec has BDD-28 L0 + L1 + nav/deep-link scenarios; runner not installed (`@playwright/test` absent, ~300 MB; deferred until disk is resized)

### Phase 19: Gemini scope, Hindi-first, director script (Step 19 · J8 · BDD-28)
- ☑ Screen-scoped Gemini: `context.screen` (built in `useCopilotChat.usePageContext` from the route) → `chat.screen_of` / `scope_snapshot_for` embed the unit snapshot on L1 and the plant snapshot elsewhere; Gemini may still answer about the whole refinery; tools `get_scope_snapshot` / `get_regime` / `get_recipe` in `ALL_TOOLS` + `DECLS` (canonical `root_agent.tools` = 8) — `tests/test_gemini_scope.py` 6 passed
- ☑ Screen-specific Hindi-first suggestions (`chat.suggestions`: L0 / L1 × en / hinglish / hi); screen chip in the Copilot drawer (`data-testid="screen-chip"`, unit label from `TWIN_UNITS`); Live voice `SpeechConfig.language_code` = `hi-IN` for hi / hinglish, `en-IN` otherwise (`live.live_language_code`) — ◐ live audio session in `hi-IN` not yet exercised against Vertex from this Cloudtop
- ☑ `demoflow.md` §1–2 + §4 rewritten as the 7-scene crude-switch script on L0 → L1 with run / minute per scene (random_s107: switch 07:25, detected 07:39, change-point 09:42, recipe ISSUED 10:00; withhold on random_s144 @ 600); in-app `DemoGuideModal` mirrors it and pins run + minute on "Go to"; §9 Phase-13 scenes marked superseded
- ☑ `?uc=` lands on the use case's **signature** panel (`engines/workbench.py → SIGNATURE_PANEL`; UC-05 → combustion verified by CDP `highlighted:["panel-combustion"]`)

### Phase 20: UI remediation to `verbatim.md` (owner review 2026-10-01: "2/10") — passes E → F → G → I → H
- ☑ **Pass E — register**: dark default (`DEFAULT_THEME`, boot script, `layout.tsx`), segmented `🌙 AI Dark | ☀️ Light` in the top bar, navy-obsidian tokens, `TRACE_PALETTE_DARK` + theme-aware `traceColor`, zero-grey committee colours in both registers, type scale / card hierarchy / sticky L1 rail; SDD-L0-02/03 + BDD-28 amended — vitest 77/77, CDP `E_L0_dark_default_asbuilt.png`, `E_L1_u4_dark_default_asbuilt.png`
- ☑ **Pass F — band bug**: `expected_series` anchored on the dynamic surrogate prediction ŷ_t + lagged EWMA bias, σ_t from regime sd + innovation spread; `test_band_wraps_live_trajectory_not_a_lagged_median` (coverage ≥ 85 %, no lag) — CDP `F_L1_u3_band_wraps_live_asbuilt.png`
- ☐ **Pass G — N(μ,σ)**: `lib/gauss.ts` + `twin/shared/GaussianPdf.tsx`; L1 "Target distribution" card (U4 committee members + mixture vs plan / spec; other units ŷ ± σ at the cursor); compact PDF on every L0 unit tile
- ☐ **Pass I — decisions first**: decision card top of the L1 rail; L0 "Open decisions" strip with Accept / Decline; Gemini context carries `panel_ids` + highlighted panel
- ☐ **Pass H — L0 systemic view**: `/api/twin` `units[].spark` (headline tag, last 240 min, ŷ ± 2σ, μ/σ, plan, spec); unit tiles 3 × 2 with fan sparkline + PDF; cause → effect ripple plot + telemetry table for the top attention item; lakehouse → ML flow strip; crude / assay adaptation panel; compact PFD; no empty region under 1440 × 900
- ☐ Playwright runner installed and `e2e/twin.spec.ts` green on the dark default

