# Build Guide: FCC Soft Sensor & Decision Cockpit, Step by Step

> **Companion documents:** [DECISIONS](DECISIONS.md) (canonical facts) · [Demo flow](demoflow.md) (what we show; top-level scope) · [Features](features.md) · [SDD](SDD.md) (specs) · [BDD](BDD.md) (acceptance tests) · [Checklist](checklist.md) (progress tracker for this guide) · [Delegation](delegation.md) (task board)
>
> **Authority:** `DECISIONS.md` → `demoflow.md` → `features.md` → `SDD.md` → `BDD.md` → `build.md` → `checklist.md`. If this guide disagrees with a file to its left, this guide is wrong.
>
> **Who this is for:** an engineer finishing the Demo MVP in this folder. The steps follow the **demo critical path** in [demoflow.md §5](demoflow.md). Each step lists its **goal**, **status**, **what exists** (paths), **what remains**, a **✅ done-check**, and the **demo scene it unlocks**.

---

> [!IMPORTANT]
> **Current status (2026-09-30)**
> - **Built and tested on fallback data:** simulator port + validation; manual cut-point mode, random campaigns and label columns; BigQuery loader + 1-h sample table; git repo; FastAPI back end with the whole soft-sensor pipeline in `cockpit/api/app/` (ridge, GPR, hybrid delta, PINN ensemble, Kalman bias, mixture, trust S1–S7, spread gate, PCA novelty, recommendations); **39 API tests pass**; Next.js pages **Decision, Technical, Modelling**; Copilot text + voice (UI and backend); knowledge corpus (46 docs), index and in-panel source preview.
> - **Running now:** batch `full_v1` (54 runs `random_s100`–`random_s153`, 1,600 sim-min each), started 2026-09-30 13:30, ~30 h, **ETA ~2026-10-01 20:00**. Until enough runs are complete, the API serves the labelled fallback `frontend_sample_1h`.
> - **Critical path to demo:** (1) process noise + `full_v1` load + retrain on labs → (2) demo-run selection (M1–M3) from held-out `random_s140`–`s153` → (3) **F24 Knowledge dashboard** + SHIFT logs regenerated on held-out runs → (4) rehearsal.
> - **Not yet built:** A5 steady-state filter, A6 lag identification, C4 fallback chain, F24 Knowledge dashboard, process-measurement noise.

## 0. Summary

**Build order (demoflow §5):** Step 1 data (`full_v1`, labs, noise) → Step 2 API, time series and Technical page (Scene 2) → Step 3 models + mixture → Step 4 trust, gate and recommendation → Step 5 Decision and Modelling pages (Scenes 1, 3, 4) → Step 6 Knowledge dashboard + Copilot (Scene 5) → Step 7 Voice (Scene 6) → Step 8 demo readiness (all scenes).

| Step | Build | Unlocks | Status |
|---|---|---|---|
| 1 | `full_v1` batch · synthetic labs · process noise · BigQuery copy | Every scene | ◐ batch running; noise, load and retrain to do |
| 2 | FastAPI runs/tags/timeseries · Technical Time-Series Explorer + Replay | Scene 2 | ☑ built (fallback data); ◐ F8 |
| 3 | Bayesian ridge → GPR → Hybrid delta → PINN · Kalman bias · mixture | Scenes 1–4 bands | ☑ built; ◐ B1, B6, B9; A5/A6 to do |
| 4 | Trust score · spread gate · recommendation engine · fallback | Scenes 1, 3 | ☑ trust/gate; ◐ D5; C4 to do |
| 5 | Decision and Modelling pages | Scenes 0, 1, 3, 4 | ☑ built; ◐ F1, F6, F9, F22 |
| 6 | Knowledge index + **Knowledge dashboard (F24)** + Copilot text | Scene 5 | ◐ index/Copilot built; F24 and SHIFT regeneration to do |
| 7 | Gemini Live proxy + mic in the Gemini panel | Scene 6 | ☑ built; verify on `full_v1` |
| 8 | Demo-run selection · cache · fallbacks · rehearsal | All | ☐ |

Status legend: ☑ done · ◐ partial · ☐ to do.

**Simulated-data rule (SDD-RAW-05):** every number in the cockpit and every test fixture must trace back to a simulated `batch_id / run_id / time_min`. No hand-made mock data.

> [!NOTE]
> **Canonical data facts (DECISIONS D2–D8, L1–L6):**
> - **Batch `full_v1`:** `sim_octave/data/full_v1/random_s100…s153.csv`, 54 runs × 1,600 simulated minutes (~26.7 h), one row per minute, 112 columns. Seed = run number.
> - **Split (grouped by run):** train = `random_s100`–`s139` (40 runs); held-out test **and demo** = `random_s140`–`s153` (14 runs). Demo default run `random_s140` (`config.yaml → data.default_run`); the final demo run is picked from the held-out runs per demoflow §3. Leave-one-regime-out by crude family is also reported.
> - **Labs:** 3 per run at minutes 360 / 840 / 1320 (06:00 / 14:00 / 22:00) → ~162 per property, **~120 in training**. Value = truth + N(0, R/2.77), R = 7 °F; 3% gross and 5% timestamp errors injected. **LIMS delay 60 ± 15 min.** Models train on labs (`training.label_source: auto`, `min_labs: 100`); simulator truth is for evaluation and the "simulator truth" overlay only.
> - **Time:** `ts = 2026-09-01T00:00:00Z + time_min`.
> - **Storage:** the API reads the local CSVs in `sim_octave/data/<batch>/` (kept). BigQuery is the shared copy for analysis and the Copilot: project `fcc-soft-sensor`, dataset `fcc_soft_sensor` (**us-central1**), tables **`fcc_sim_minute`** (full) and **`fcc_sim_minute_sample`** (1-h UI sample, legacy). `run_id` in BigQuery = `<batch>_<run>` (e.g. `full_v1_random_s140`).
> - **Temporary UI data:** `frontend_sample_1h` (4 × 60 min, legacy 108 columns, no label columns) is served only until `full_v1` has complete runs, always labelled as fallback.

**Stack and paths (DECISIONS P3):** the front end is Next.js + TypeScript + Plotly in `cockpit/web` (pages in `cockpit/web/src/app/`). The API is FastAPI in `cockpit/api` and **also hosts the soft-sensor pipeline** in `cockpit/api/app/`. There is no separate `soft_sensor/` package. The binding API contract is [cockpit/API_CONTRACT.md](cockpit/API_CONTRACT.md); setup, training and run commands are in [cockpit/api/README.md](cockpit/api/README.md).

```text
cockpit/api/app/
  main.py                 FastAPI app, CORS, error format, Copilot SSE + Live WS
  config.py               settings (config.yaml + env)
  data/catalog.py         CSV catalog, events, synthetic labs (SDD §4.3), tags, fallback logic
  data/features.py        EWMA features, correlation-ranked selection, scaler (±5σ clip)
  data/health.py          DQ (range/spike; frozen optional), PCA T²/SPE novelty
  models/classic.py       bayes_ridge_v1, gpr_v1
  models/hybrid_pinn.py   hybrid_delta_v1, pinn_ens_v1 (PyTorch CPU)
  dist.py                 Gaussian mixture: quantiles, PDFs, Ashman D, CRPS
  pipeline.py             weights → Kalman bias → mixture → trust S1–S7 → gate → recs
  gate.py                 spread gate, hysteresis, exact SDD-GATE-04 messages
  recommend.py            SDD-REC engine; gain / yield sensitivity from event-5/6 windows
  train.py                training + precompute (python -m app.train)
  store.py, state.py      artifacts, SQLite audit, service state
  knowledge/index.py      corpus chunking, Vertex embeddings cache, BM25 fallback, records
  copilot/tools.py        read-only tools
  copilot/chat.py         text Copilot (google-genai function calling, SSE)
  copilot/live.py         Gemini Live proxy
  routers/                meta, timeseries, modelling, decision, knowledge
```

---

## Step 0: Environment (one-off)

**Status:** ☑ done.

```bash
# Folder variable (quote it every time; the path has spaces and '&')
export FCC_HOME="$HOME/o&g agentic transformation/Oil & Gas Agent Portfolio/agent_ideas/FCC_RCC_Optimisation"
cd "$FCC_HOME"
octave --version | head -1; python3 --version; node --version; gcloud --version | head -1

# API environment (project-local, never pip install globally) — see cockpit/api/README.md
cd "$FCC_HOME/cockpit/api"
~/.local/bin/uv venv .venv
~/.local/bin/uv pip install --python .venv/bin/python -r requirements.txt
gcloud auth application-default login      # ADC; project fcc-soft-sensor, Vertex AI API enabled

# Cockpit
cd "$FCC_HOME/cockpit/web" && npm install
```

**✅ Done-check:** `cd cockpit/api && .venv/bin/pytest -q` → 39 passed; `npm run dev` in `cockpit/web` serves http://localhost:3000.

---

## Step 1: Data — `full_v1`, Labs and Noise

**Goal:** every later step runs on the real `full_v1` batch, with synthetic labs as training labels and realistic sensor noise.
**Unlocks:** every scene (Scene 0 provenance, M1–M3 moments for Scenes 1–3).
**Status:** ◐ — simulator, labels and loader done; batch running; noise, BigQuery load and retrain to do. Features: A1 ◐, A2 ☑, A3 ◐, A4 ◐, A7 ◐.

### What exists
| Item | Path | Status |
|---|---|---|
| Octave port of Santander et al. (2022), validated 36/46 signals within 0.1%, 41/46 within 0.2% | `sim_octave/model/`, `sim_octave/VALIDATION.md` | ☑ |
| Manual cut-point mode with trim window (draw + 60 → draw + 120 min, `cutpoint_auto = 1`), verified 2026-09-30 | `sim_octave/cutpoint_auto.m`, `scenario.m`, `run_sim.m` | ☑ |
| Random campaigns + label columns `cutpoint_auto`, `lab_sample`, `crude_id`, `event_code` (112 columns) | `sim_octave/scenario.m`, `run_random_batch.sh` | ☑ |
| Batch `full_v1` (54 runs, 1,600 min) | `sim_octave/data/full_v1/`, logs in `sim_octave/data/full_v1/logs/` | ◐ running, ETA ~2026-10-01 20:00 |
| BigQuery loader (skips incomplete runs; never deletes) + 1-h sample table `fcc_sim_minute_sample` | `sim_octave/load_to_bq.py` | ☑ |
| Synthetic labs (σ = R/2.77, injected errors, LIMS delay) | `cockpit/api/app/data/catalog.py` | ◐ check delay = 60 ± 15 min (L3) |
| DQ range/spike checks (frozen check off by default) | `cockpit/api/app/data/health.py` | ◐ A3 |
| Regime labels (crude one-hot) | `cockpit/api/app/data/catalog.py`, `models/classic.py` | ◐ A7: no operating-mode × catalyst dimension |

### What remains
1. **Process-measurement noise (L6):** add in post-processing, keeping both true and measured values: temperatures σ 0.5 °F, pressures σ 0.05 psi, flows σ 0.5%. Seeded per run. Demo+: one slow drift on one tray temperature in one held-out run (sensor-health view).
2. **Monitor the batch** and report rows per run (delegation 1.0).
3. **Load `full_v1` to BigQuery** once runs are complete (Lead runs it; `--dry-run` first):
   ```bash
   cd "$FCC_HOME/sim_octave"
   python3 load_to_bq.py --in-dir data/full_v1 --batch-id full_v1 --table fcc_soft_sensor.fcc_sim_minute \
     --expected-minutes 1600 --dry-run
   python3 load_to_bq.py --in-dir data/full_v1 --batch-id full_v1 --table fcc_soft_sensor.fcc_sim_minute \
     --expected-minutes 1600
   bq query --location=us-central1 --use_legacy_sql=false --label=app:fcc-soft-sensor --label=component:build-check \
   'SELECT batch_id, COUNT(DISTINCT run_id) runs, COUNT(*) rows, SUM(lab_sample) labs
    FROM `fcc-soft-sensor.fcc_soft_sensor.fcc_sim_minute` GROUP BY batch_id'
   ```
4. **Confirm lab alignment (A4):** lab draws at minutes 360/840/1320, results available at draw + 60 ± 15 min, joined at the draw time.
5. **Retrain on labs** (Step 3) when the API reports `data.source = "full_v1"`.

### ✅ Done-check
```bash
cd "$FCC_HOME/sim_octave"
ls data/full_v1/random_s*.csv | wc -l          # 54
wc -l data/full_v1/random_s*.csv | head -55    # each = 1,601 lines when complete
python3 - <<'EOF'
import glob, pandas as pd
fs = sorted(glob.glob("data/full_v1/random_s*.csv")); tot = 0; heavy = []
for f in fs:
    d = pd.read_csv(f); assert d.shape[1] == 112, f; tot += int(d.lab_sample.sum())
    if (d.dist_feed_API < 21).any(): heavy.append(f.split("/")[-1])
print(len(fs), "runs; labs", tot, "(expect 162); heavy runs", heavy)
EOF
```
- BigQuery shows 54 runs, 86,400 rows, 162 lab minutes for `full_v1`.
- `curl localhost:8000/api/health` → `data.source = "full_v1"`, `primary_progress.complete = 54`.
- Noise is present in measured tags and absent in the kept true values.

---

## Step 2: API, Time Series and the Technical Page (Scene 2)

**Goal:** replay any run tag-by-tag: truth vs. soft-sensor band vs. lab dots, event markers and controller-mode strip.
**Unlocks:** Scene 2 (M1 "blind drift"), and Scene 0 (provenance chip).
**Status:** ☑ built and tested on fallback data; ◐ F8 replay polish; waiting on `full_v1`.

### What exists
| Item | Path |
|---|---|
| FastAPI app, CORS, error format, `provenance` in every response | `cockpit/api/app/main.py`, `routers/common.py` |
| `GET /api/health`, `/api/config`, `/api/runs`, `/api/tags`, `POST /api/admin/reload`, `/api/admin/train` | `cockpit/api/app/routers/meta.py` |
| `GET /api/runs/{run_id}/timeseries` (LTTB `max_points`), `/api/estimates/timeseries`, `/api/estimate(s)`, `/api/stream` | `cockpit/api/app/routers/timeseries.py`, `app/lttb.py` |
| Catalog with `full_v1` → fallback switch and partial-run protection | `cockpit/api/app/data/catalog.py` |
| Technical page: Time-Series Explorer (F12) + Replay (F8) | `cockpit/web/src/app/technical/page.tsx`, `components/views/TimeseriesView.tsx`, `ReplayView.tsx` |
| App shell: dashboard switch, provenance chip (F20), run picker, theme toggle (F19), shared store | `cockpit/web/src/components/shell/AppShell.tsx`, `src/lib/store.ts`, `src/lib/theme.ts` |
| API tests (39 pass) | `cockpit/api/tests/` |

### What remains
1. After `full_v1` lands: check the four linked panels of Scene 2 on the chosen demo run (feed API + events; draw-tray temperatures; `LCO_T98_F` truth vs band vs labs; controller-mode strip from `cutpoint_auto`).
2. **F8 (◐):** replay from 1 h before the crude switch at 30× speed; lab **draw** and lab **arrival** (draw + 60 ± 15 min) as distinct markers.
3. Time-Series Explorer pan/zoom ≤ 150 ms on a 1,600-minute run.

### ✅ Done-check
- `/technical` plots any tag of `random_s140` and the values match the CSV at 3 spot-checked minutes; the chip reads `Simulated data · full_v1 · random_s140 · hh:mm`.
- The crude-switch replay of the demo run shows the sawtooth: drift in manual, trim back after the lab.

---

## Step 3: Models and Mixture

**Goal:** four probabilistic members, a Kalman bias update and a calibrated mixture on the held-out runs.
**Unlocks:** the bands in Scenes 1–4.
**Status:** ☑ built (fallback data); ◐ B1, B6, B9; A5 steady state and A6 lags to do; **retrain on `full_v1` labs to do**.

### What exists
| Model / piece | Path | Notes (see README "Known simplifications") |
|---|---|---|
| Bayesian ridge `bayes_ridge_v1` (B1 ◐) | `app/models/classic.py` | Regime one-hot with shared prior; no hierarchical pooling |
| GPR `gpr_v1` (B4 ☑) | `app/models/classic.py` | Matérn 5/2 ARD + white noise; 2 restarts; ≤ 1,500 points |
| Hybrid delta `hybrid_delta_v1` (B5 ☑) | `app/models/hybrid_pinn.py` | `y_phys = a + b·(T_draw + c·ln(24.9/P5))` + residual GPR |
| PINN ensemble `pinn_ens_v1` (B6 ◐) | `app/models/hybrid_pinn.py` | 5 members, NLL + monotonicity/physics penalties; per-property; fixed λ; 250 epochs |
| Kalman bias (B2 ☑) | `app/pipeline.py` | Linear 30-min ramp; BDD-6: K ≈ 0.524, b_target ≈ 0.105 |
| Committee weights and admission (B9 ◐) | `app/pipeline.py`, `app/train.py` | 1/MSE over the last 10 accepted labs, else out-of-fold MSE |
| Mixture (B10 ☑) | `app/dist.py` | Bisection quantiles, W90, Ashman D, `p_on_spec`, CRPS, 200-point PDFs |
| Features | `app/data/features.py` | Current value + causal EWMA (τ = 10 min); correlation ranking, |r| < 0.98 pruning |
| Training / precompute | `app/train.py` | Grouped 4-fold by run on s100–s139; final model scores s140–s153 |

### What remains
1. **A5 steady-state filter (SDD-SS-01/02, SDD-MOD-06):** 30-min rolling std + `event_code == 0`; exclude transient labs from training.
2. **A6 lag identification (SDD-LAG-01…03):** prewhitened cross-correlation over 0–60 min on s100–s139 only; write `artifacts/lags.json`; feed lagged features. Expect tray lags ~5–30 min.
3. **Retrain on `full_v1`:** labels from synthetic labs (`label_source: auto`, `min_labs: 100`; ~110 clean train labs per property). Confirm `eval.note` reports `lab`.
   ```bash
   cd "$FCC_HOME/cockpit/api"
   OMP_NUM_THREADS=4 .venv/bin/python -m app.train
   curl -X POST localhost:8000/api/admin/reload
   ```
4. Record the admission table (4 families × 2 targets) and the calibrated `w90_max` (reported, not applied; the gate stays at 14 °F per T4).

### ✅ Done-check (after `full_v1` retrain)
- Mixture RMSE vs. truth ≤ **1.5 R** (10.5 °F) time-blocked and ≤ **2.0 R** (14 °F) leave-one-regime-out; 90% coverage **85–95%** on s140–s153.
- With bias, held-out RMSE is lower than without.
- GPR σ is higher on out-of-envelope minutes than on training regimes; PINN shows zero monotonicity violations on held-out minutes.
- No held-out run ID appears in any training artifact.

---

## Step 4: Trust, Spread Gate and Recommendation

**Goal:** every estimate carries a trust level and gate status; recommendations only when safe.
**Unlocks:** Scene 1 (M2 safe recommendation) and Scene 3 (M3 withhold).
**Status:** ☑ trust (7 signals), spread gate, PCA novelty; ◐ D5 recommendation; ☐ C4 fallback chain.

### What exists
| Item | Path |
|---|---|
| Trust score S1–S7 → GREEN / AMBER / RED (C1 ☑) | `app/pipeline.py` |
| PCA T²/SPE novelty, empirical 99% limits × 1.05 (C2 ☑) | `app/data/health.py` |
| Spread gate: W90 > 14 °F or bimodal (D > 2.0) → WITHHELD; hysteresis; exact SDD-GATE-04 messages (C7 ☑) | `app/gate.py` |
| Recommendation engine (D5 ◐): GREEN full move (cap 5 °F, step 0.5 °F), AMBER half, RED/WITHHELD none; P(on-spec after) ≥ 95% else HOLD; gain and yield sensitivity from event-5/6 windows | `app/recommend.py` |
| `GET /api/recommendations`, `POST /api/recommendations/{id}/decision` (SQLite audit only), `GET /api/audit` | `app/routers/decision.py`, `app/store.py` |

### What remains
1. **C4 fallback chain (SDD-FB, BDD-5):** consensus → best single → hold last → BAD, with hysteresis; audit each switch. Today `source` is always `consensus`.
2. **D5:** re-estimate the gain `g` and yield sensitivity on `full_v1` event-5/6 windows in s100–s139; confirm HN has event-6 windows (else keep the documented default).
3. Calibrate trust limits on s140–s153 (SDD-TRU-04).

### ✅ Done-check
- On the demo run: ≥ 1 RAISE/LOWER card (Scene 1) and ≥ 1 WITHHELD card whose text matches SDD-GATE-04 (Scene 3).
- ≥ 95% of GREEN minutes within R of truth; ≥ 80% of |err| > 2R minutes are RED.
- Accept writes only to the audit log; nothing writes to a control system (S3).
- A forced member failure switches `source` along the fallback chain.

---

## Step 5: Decision and Modelling Pages (Scenes 0, 1, 3, 4)

**Goal:** the operator view (Decision) and the engineer view (Modelling), linked by a "Why? → Modelling" deep link at the same minute.
**Unlocks:** Scenes 0, 1, 3 and 4.
**Status:** ☑ pages built; ◐ F1, F6, F9, F22.

### What exists
| Page / component | Path | Feature |
|---|---|---|
| Decision: Overview, Decisions, Quality | `cockpit/web/src/app/decision/page.tsx`, `components/views/OverviewView.tsx`, `DecisionsView.tsx`, `QualityView.tsx`, `components/decision/RecCards.tsx` | F1 ◐, F2 ☑, F3 ☑ |
| Modelling: Confidence, Model Comparison, Calibration | `cockpit/web/src/app/modelling/page.tsx`, `components/views/ConfidenceView.tsx`, `ModelsView.tsx`, `CalibrationView.tsx` | F4 ☑, F21 ☑, F9 ◐ |
| Spread-gate banner, trust badge | `components/views/*`, `components/ui/primitives.tsx` | F5 ☑, F6 ◐ |
| Charts (Plotly wrapper, fan chart, model charts) | `components/charts/` | — |
| API: `/api/overview`, `/api/distribution`, `/api/models`, `/api/calibration`, `POST /api/whatif` | `app/routers/decision.py`, `modelling.py`, `timeseries.py` | — |

### What remains
1. **F22 (◐):** add the fourth dashboard (**Knowledge**) to the top-bar switch — built in Step 6.
2. **F1 (◐):** KPI tiles reconcile with the API on `full_v1` (RMSE vs. lab against target, 90% coverage, trust mix, availability, accepted, withheld); 12-hour fan chart with lab dots, 765 °F spec line and trust strip.
3. **F6 (◐):** colour + icon + text; hover breakdown of all 7 signals.
4. **F9 (◐):** coverage over time, PIT, reliability, CRPS per model and mixture, on held-out runs.
5. Citation chip on the recommendation card opens the source preview in the Gemini panel (Scene 1).

### ✅ Done-check
- Scene 1 click-through on the demo run: recommendation card (Δ, P(on-spec), margin before → after, LCO yield shift % of feed, trust, citation) → Accept → toast *"Recorded. The cockpit never writes to the DCS."*
- Scene 3: withheld card → "Why? → Modelling" opens Confidence at the same minute with overlaid distributions, W90 gauge, bimodality index and banner.
- Scene 4: Model Comparison numbers equal `/api/models` to 0.01 °F. No currency anywhere (SDD-NFR-11).

---

## Step 6: Knowledge Dashboard and Copilot Text (Scene 5)

**Goal:** cited answers in the Gemini panel, and a **Knowledge dashboard (F24)** that opens the full document at the cited section next to the run's related records.
**Unlocks:** Scene 5 (and citation chips in Scenes 1 and 3).
**Status:** ◐ corpus, index, source preview and Copilot built; ☐ F24 Knowledge dashboard; ☐ SHIFT logs regenerated on held-out runs. Features: E5 ◐, H1 ☑, H2 ☑, H3 ◐, H4 ☑, H5 ◐, F13 ☑, F24 ☐.

### What exists
| Item | Path |
|---|---|
| 46 SIMULATED documents (SOP, IOW, LAB, WO, SHIFT, INC, MOC, REF) + validator + generators | `knowledge/corpus/`, `knowledge/tools/check_corpus.py`, `knowledge/tools/generate_wp*.py`, `extract_events.py` |
| Retrieval index: one chunk per `###` section, `gemini-embedding-001` (fallback `text-embedding-005`, then BM25), relevance threshold 0.35 | `cockpit/api/app/knowledge/index.py` |
| `GET /api/knowledge/search`, `/docs`, `/docs/{doc_id}`, `/records?run_id=` | `cockpit/api/app/routers/knowledge.py` |
| Copilot text: google-genai (`vertexai=True`) manual function-calling loop, SSE events `thought / tool_call / final / chart / citation / suggestion / error / done`; read-only tools incl. `search_documents`, `get_document`, `find_similar_events`; `query_sim_data` SELECT-only over the local catalog (table `fcc_sim_minute`) | `cockpit/api/app/copilot/chat.py`, `copilot/tools.py`, `POST /api/copilot/chat` |
| Floating Gemini panel + source preview | `cockpit/web/src/components/copilot/CopilotLauncher.tsx`, `SourcePreview.tsx`, `useCopilotChat.ts`, `Markdown.tsx` |

### What remains
1. **F24 Knowledge dashboard (☐):** new route `cockpit/web/src/app/knowledge/page.tsx` + entry in the dashboard switch. Content: document library (filter by type), full document view scrolled to the cited section (`#§x.y`), related records for the selected run (WO, SHIFT, INC, MOC from `/api/knowledge/records?run_id=`), SIMULATED label. The source preview in the Gemini panel gets an **"Open in Knowledge"** link that deep-links here.
2. **SHIFT logs (☐):** regenerate WP5 on **held-out runs `random_s140`–`s153`** from real `full_v1` rows, with the 2026-09-01 clock (`ts = 2026-09-01T00:00Z + time_min`) and front matter `sim_batch: full_v1`, `sim_run: random_s1NN`; `check_corpus.py` validates `sim_run` / `sim_window` (delegation 1.4–1.5).
3. **H3 (◐):** every citation resolves; below 0.35 the answer says "No cited source".
4. **H5 (◐):** withheld cards show "Last time the spread was this wide" with up to 3 cited WO/INC/SHIFT records.
5. **E5 (◐):** golden set on the demo run; ADK packaging of the same tools is **Demo+** (not on the critical path).

### ✅ Done-check
- `python3 knowledge/tools/check_corpus.py knowledge/corpus` passes; `manifest.json` lists 46 documents; every SHIFT `sim_run` is a held-out `full_v1` run and its `sim_window` lies inside that run.
- `/api/health` shows `knowledge.docs = 46` and `mode = "embedding"` (or `"bm25"` with a note).
- Scene 5: *"Why was the HN recommendation withheld at 08:42?"* streams with visible tool calls and a citation; *"Has this happened before?"* lists a WO, an INC and a SHIFT log with `[DOC-ID rN §x.y]`; chip → **Open in Knowledge** opens the full document at the section beside the run's records.
- Golden set: 100% of withholds relayed verbatim; 0 fabricated numbers; first token ≤ 3 s at p50.
- Empty-corpus case (manifest renamed) shows "knowledge unavailable" and nothing else breaks (SDD-KNW-09).

---

## Step 7: Voice with Gemini Live (Scene 6)

**Goal:** push-to-talk voice in the Gemini panel with the same read-only tools and the same guardrail.
**Unlocks:** Scene 6.
**Status:** ☑ UI and backend built (F23 ☑); verify on `full_v1`.

### What exists
| Item | Path |
|---|---|
| `WS /api/live` proxy to `client.aio.live.connect` (AUDIO out, input/output transcription), tools executed server-side; relays `ready / audio / transcript / tool_call / citation / interrupted / turn_complete / error` | `cockpit/api/app/copilot/live.py`, `app/main.py` |
| Model `gemini-live-2.5-flash-native-audio` in `us-central1`, fallback list probed at startup (reported in `/api/health → gemini`); `POST /api/admin/probe` | `app/config.py`, `config.yaml` |
| Mic button, 16 kHz PCM16 capture, 24 kHz playback, interruption flush | `cockpit/web/src/components/copilot/useLiveVoice.ts`, `CopilotLauncher.tsx` |

### What remains
1. Re-run the two Scene 6 prompts on the demo run after `full_v1` retrain.

### ✅ Done-check
- *"Where is the LCO cut point right now, and can I trust it?"* → spoken answer with the trust level.
- *"Just give me a heavy naphtha set point anyway."* at a WITHHELD minute → refuses and reads the SDD-GATE-04 message verbatim.
- First audio ≤ 1.5 s at p50; the browser network log shows no Google credentials.

---

## Step 8: Demo Readiness

**Goal:** a 12-minute run of demoflow.md that never stalls.
**Unlocks:** all scenes.
**Status:** ☐.

### What remains
1. **Demo-run selection (M1–M3, demoflow §3):** after `full_v1` lands, query the held-out runs `random_s140`–`s153` for M1 blind drift (crude switch in manual, ≥ 5 °F drift before the next lab), M2 safe recommendation (≥ 2 h steady, ≥ 6 °F below spec, GREEN), M3 withhold (edge of envelope, W90 > limit or bimodal). Pick a demo run and a backup; write their minutes to `cockpit/api/config.yaml` (`demo:` block and `data.default_run`). Default until then: `random_s140`.
2. **Cache and fallbacks (demoflow §6):** cached snapshot of the demo run in `artifacts/demo_cache/`; pre-recorded Copilot answer chips labelled "cached"; backup run for M3; screen recording of Scenes 5–6.
3. **Rehearsal** end to end against demoflow.md §4; pre-demo checklist (demoflow §8).

### ✅ Done-check
- demoflow §8 ticked: demo + backup runs chosen from the hold-out with M1–M3 minutes in `config.yaml`; cockpit loads in ≤ 2 s; both scripted Copilot questions return cited answers; voice probe passes; provenance chip visible in every screenshot.

---

## Demo+ (after the critical path; still simulated data)

| Item | Feature | Spec |
|---|---|---|
| ADK packaging of the Copilot (same tools and instruction) | E5 | SDD §7.6 |
| Lab Reconciliation agent + labs page | E2, F10 | SDD-AGT-02; BDD-7 |
| Drift Sentinel, CUSUM, champion/challenger | E1, F9 | SDD-AGT-01; BDD-8 |
| What-If Explorer page (API exists: `POST /api/whatif`) | F7 | BDD-16 |
| Data Quality full (tag heatmap, T²/SPE time series); injected tray-temperature drift (L6) | F11 | SDD §7.3 |
| Job-record track in the Time-Series Explorer | H6 | SDD-KNW-07 |
| Demo Report PDF (technical KPIs only) | F14 | `POST /api/report` |
| Accessibility & wall mode | F25 | SDD-UI-08, 11 |
| Executable BDD, Playwright, Lighthouse | — | BDD.md |
| Cloud Run + IAP (project `fcc-soft-sensor`, `us-central1`; API with session affinity and 3600 s timeout for Live) | F17 | SDD-DEP-02 |

---

## Definition of Done: Demo MVP

Track item by item in [checklist.md](checklist.md).

- [ ] `full_v1` complete: 54 runs × 1,600 min; 162 lab minutes (~120 in training); train s100–s139, held-out s140–s153 (grouped by run); loaded to `fcc_sim_minute` (us-central1)
- [ ] Process-measurement noise added (L6); models retrained on synthetic labs
- [ ] Four model families trained; admission table recorded; mixture 90% coverage 85–95%
- [ ] Mixture RMSE vs. truth ≤ 1.5R (time-blocked) and ≤ 2.0R (leave-one-regime-out)
- [ ] Spread gate: exact message; hysteresis; withhold demonstrated on the demo or backup run
- [ ] Recommendations: GREEN full (cap 5 °F), AMBER half, RED/WITHHELD none; P(on-spec) ≥ 95% else HOLD; Accept writes to audit only
- [ ] **Four dashboards** (Decision, Technical, Modelling, Knowledge) and the floating Gemini panel (source preview + "Open in Knowledge") with a shared run and time cursor
- [ ] Knowledge corpus: 46 documents pass `check_corpus.py`; SHIFT logs grounded in held-out `full_v1` runs; 100% of citations resolve; "No cited source" below 0.35
- [ ] Voice Copilot (Gemini Live, `us-central1`) relays the gate message and refuses a set point while WITHHELD
- [ ] No currency, ROI, NPV or payback anywhere (SDD-NFR-11)
- [ ] Demo and backup runs chosen from the hold-out (M1–M3); rehearsal done
- [ ] Every displayed number traceable to a simulated run (provenance chip + API)

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Octave `fsolve` argument error | Original `FCC-Fractionator/` code | Use `sim_octave/model/` |
| Simulation much slower than ~68 s per simulated minute | BLAS threads | `OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1` |
| `/api/health → data.source = "fallback"` | Not enough complete `full_v1` runs (≥ 4 train, ≥ 1 held-out at ≥ 1,500 rows) | Wait for the batch; `POST /api/admin/reload` |
| `data.retrain_recommended = true` | Model trained on fallback, data now `full_v1` | `python -m app.train`, then reload |
| `eval.note` says labels = truth | < `min_labs` (100) clean labs per property | Check the batch is complete and labs are 3 per run |
| `load_to_bq.py` skips files | Rows < `--expected-minutes` | Let runs finish (or `--allow-partial` for the legacy sample only) |
| BigQuery schema mismatch | 108- and 112-column files mixed | Keep the legacy sample in `fcc_sim_minute_sample` (SDD-RAW-02) |
| Near-perfect first model | Target leakage | Check exclusions in `app/data/features.py` |
| Gate WITHHELD all the time | A miscalibrated member admitted | Check the admission table and member residuals |
| Mixture always bimodal | One member biased | It should fail admission and become shadow |
| PINN σ tiny, coverage low | Members too similar | Different seeds / bootstrap per member; NLL not MSE |
| Time-Series Explorer slow | SVG traces or no downsampling | `scattergl`; LTTB `max_points` |
| Copilot invents numbers | Tool not called | Tighten the instruction; add a golden-set case |
| Copilot 403 / quota | Vertex AI not enabled or no ADC | `gcloud services enable aiplatform.googleapis.com`; `gcloud auth application-default login` |
| Live session fails to open | Wrong location or model | `us-central1`; check `/api/health → gemini`; fallback list in `config.yaml` |
| No microphone audio | Not `localhost`/HTTPS, or permission denied | Serve on `localhost`/HTTPS |
| Voice talks over the user | `interrupted` not handled | Flush the playback queue on `interrupted` |
| Knowledge mode is `bm25` | Embeddings call failing | Check embedding model and Vertex access; BM25 is the intended fallback |
| Knowledge mode is `empty` | `manifest.json` missing | Run `check_corpus.py` until PASS |
| Theme flashes on load | Theme applied after hydration | Set `data-theme` before first paint (`src/app/layout.tsx`) |

---

## After the Demo (Site Phases)

| Phase | Next build items | Features |
|---|---|---|
| 0–1 | Site historian/LIMS ingestion replacing the simulated source (same API contract, `provenance.source = "site"`); 6-week offline backtest; retrain every model | A1, A3, A4, B1–B6 |
| 2 | Vertex AI Pipelines + Registry; symbolic fallback; MPC CV integration; alerts; audit explorer; technical KPI tracking | B7, D1, F15, F16, G1–G4 |
| 3 | Assay features; sulfur hybrid (D1 decision); Feed-Change Foresight; Cross-Unit Orchestrator | A8, D2, E3, E4 |
| 4 | Blending, INDMAX, multi-unit | D3, D4 |
