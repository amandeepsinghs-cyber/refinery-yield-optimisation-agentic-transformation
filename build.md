# Build Guide: FCC Soft Sensor & Decision Cockpit, Step by Step

> **Companion documents:** [DECISIONS](DECISIONS.md) (canonical facts) · [Demo flow](demoflow.md) (what we show; top-level scope) · [Features](features.md) · [SDD](SDD.md) (specs) · [BDD](BDD.md) (acceptance tests) · [Checklist](checklist.md) (progress tracker for this guide) · [Delegation](delegation.md) (task board)
>
> **Authority:** `DECISIONS.md` → `demoflow.md` → `features.md` → `SDD.md` → `BDD.md` → `build.md` → `checklist.md`. If this guide disagrees with a file to its left, this guide is wrong.
>
> **Who this is for:** an engineer finishing the Demo MVP in this folder. The steps follow the **demo critical path** in [demoflow.md §5](demoflow.md). Each step lists its **goal**, **status**, **what exists** (paths), **what remains**, a **✅ done-check**, and the **demo scene it unlocks**.

---

## 2026-10-02 agreement (supersedes earlier UI sections where they conflict)

> **Source:** owner's words 09:48–11:34 UTC on 2 Oct (recovered from the crashed session) and Voice Note 11 (12:02), recorded in [verbatim.md](verbatim.md) Part 9.5. Code at `2fc6402` (pushed to `origin/main` 2 Oct 12:59; production build passes). Where any older section of this guide (Steps 5, 13, 18, the 30 Sep status box) describes a different screen layout, **this section wins**.

**The rule (09:48):** "The screen enables decisions and data is shown to back up those decisions." Decision first; data underneath. No role views (09:53). No value figures on screens (10:16). No left bar or admin template (10:41). Accept / Hold / Decline writes the audit log only, never a control system.

> [!IMPORTANT]
> **Scripted outcomes (owner, 2 Oct 13:50–13:56):** "keep the input, mock the output … the idea is to demonstrate what the verbatim expects." About 1.5 months of simulated data across crude changes can't honestly train a crude classifier plus per-crude lever regressions. So the **inputs stay real** (live simulator tags) and the **outputs are scripted** from those live values in `api/app/engines/scripted.py`:
> - **Crude classifier (VN10/VN11 step 1):** names the crude the lab assay declares. Confidence ramps across the switch and settles at 93 %, confirmed 12 min after the switch completes.
> - **D3 recipe for the new crude, D5 regenerator air, D6 furnace preheat, D7 condenser:** open moves. Each moves a real lever inside its operating window and SOP step, with fixed plant-plausible gains. The chance of returning to the band goes from about 31 % to 96–98 %.
> - **Stays on the real engine:** D1 cut point, D2 trust or spread gate (wait for the lab), D9 lab sample, D8 watch.
> - **Labels:** the top pill reads "Simulated data · scripted outcomes", and each scripted lever carries a "scripted outcome" tag. Switch it off with `demo.scripted_outcomes: false` or `FCC_SCRIPTED=0`; tests run with it off and `tests/test_scripted.py` checks it on.
> - **Consistency rules (14:25):** crude-switch events use the scripted detection time (switch end + 12 min) so the shift list, crude block and classifier agree; the scripted D3 recipe is not released while D2 is withheld on spread, so run s144 still shows the cockpit refusing when the models disagree.
> - **How it works, on every screen (14:31–14:52):** no separate page. Each screen (Refinery + six units) opens with “What this screen solves”: its IOCL use cases in IOCL order, each as problem today → how it is solved → in → parts → decision rule → out → value in plant terms, linked to steps ①–④; every step has a “how this step works” strip that also says how to read its curves. Home chips open the same explainer. One source: `lib/howItWorks.ts`, component `components/how/UseCaseExplainer.tsx`. Status on every use case (Real · Scripted outcome · Partly · Watch only). No money figures, ever (standing rule). **Layout (15:15):** figures first — “What this screen solves” is a closed, expandable panel below step ④ (opens on click or via “What this solves ↓” in step ③, anchor `#s-why`); on home it is closed above the use-case chips. The old footer “Use cases on this unit” list (internal numbers) is removed. Each step’s “how this step works” strip is folded by default and opens on click (15:31).
> - **Gone in scripted mode:** the "Not yet" status for D3 and D5–D7, the real classifier's 57 % accuracy line, and the need for the lever batch, refit and closed-loop check before the demo.

### Screens

| Screen | Route | What it shows (in order) | Built in |
|---|---|---|---|
| **Home** (10:43 brief) | `/twin` | Top view of the six units (Feed furnace → Riser reactor → Regenerator → Main fractionator → Gas plant → Stabiliser), no left bar → one line on **what went wrong**, the unit glows → **decisions pinned to their units**, Accept / Hold → the **four-step flow ①–④** under the drawing (how agents, ML, checks, optimiser and Gemini enable the decision) → **IOCL use-case band** | `994380a`, `beee022` (`components/twin/l0/L0Home.tsx`, `PlantCanvas.tsx`, `UnitFlow.tsx`, `DecisionQueue.tsx`, `HomeStory.tsx`) |
| **Unit page** (10:48 flow, 11:01 spec) | `/twin/unit/{unit_id}` | **① Data in / out** (process drawing with live values, how fresh each reading is) · **② What we observe** (live vs expected band, four models' bell curves, crude switch) · **③ Decision and lever** (every decision on the unit, the lever, what-if slider, Accept / Hold / Decline) · **④ How the move is found** (goal, each check pass / fail) · **Footer** (IOCL use cases for this unit). Sticky 1-2-3-4 strip. Engineer's all-panels view at `?view=classic`. | `beee022`, `112aa48`, `11876cc` (`components/twin/l1/UnitStory.tsx`, `UnitDrawings.tsx`) |
| **Decision record** | `/audit` | Every decision and the action taken on it (replaces the old audit log) | `112aa48` (`components/record/DecisionRecord.tsx`) |

### Decisions D1–D9 and their real levers

| ID | Decision | Unit | Lever (real tag) | Status today |
|:-:|:---|:---|:---|:---|
| D1 | Move the cut point now, or wait for the lab? | Main fractionator | `SP_LCO_T98`, `SP_HN_T98` | **Live** |
| D2 | Can the estimate be trusted now? | Main fractionator | — (go / no-go on D1) | **Live** |
| D9 | Pull an extra lab sample? | Main fractionator | sampling schedule | **Live** |
| D4 | Which crude is in the unit; is the switch finished? | Riser reactor | — (confirm crude) | **Scripted** classifier: agrees with the lab assay, 93 % after the switch. Real classifier with scripting off: 8 of 14 held-out switches (57 %) |
| D8 | What first; what breaks downstream if nothing is done? | Plant | — | **Live** (watch items) |
| D3 | Coordinated recipe for the new crude | Main fractionator / Riser | `SP_T_riser_ROT_F` + `SP_LCO_T98` −1 + `SP_HN_T98` +1 | **Scripted move** (real engine withholds it: plausibility check) |
| D5 | Regenerator air vs severity | Regenerator | `Fair` | **Scripted move** (gain 40 °F cyclone ΔT per unit air; step ≤ 0.08) |
| D6 | Furnace preheat | Feed furnace | `SP_T_preheat_F` | **Scripted move** (outlet follows set point 1 : 1; step ≤ 5 °F) |
| D7 | Condenser cooling water / overhead T | Condenser | `SP_T_overhead` (`MV_cw_flow` is the target) | **Scripted move** (−2.6 lb/s cooling water per °F; step ≤ 3 °F) |

Full lever table with typical values and allowed ranges: [verbatim.md §9.5.3](verbatim.md).

### Problems and IOCL use cases (one quiet line per decision, no badges, no value figures)

| Problem | In plant words | Decisions | IOCL use cases (platform ID) |
|:-:|:---|:---|:---|
| P1 | Quality known only every 8 h from the lab | D1, D9 | UC-01 FCC product-quality inferential · UC-11 product soft sensor |
| P2 | Crude changes every 12–48 h; set points for the new crude unknown | D4, D3, D6 | Feedstock evaluation · UC-01 · UC-05 · UC-10 |
| P3 | A move in one unit shows up hours later in another | D3, D5, D6, D7, D8 | UC-04 regeneration · UC-02 stabiliser C5 · UC-03 C4/C5 split · UC-07 exchanger fouling · UC-06 energy · UC-08 filter / hydraulic · UC-09 rotating equipment |
| P4 | An AI that always answers is dangerous | D2, D9 | UC-11 |

### Done vs open

| Item | Status |
|---|---|
| Decision API (`GET /api/decisions`, `GET /api/decisions/{id}`, `POST /api/decisions/{id}/act`, `GET /api/decisions-coverage`) | ☑ `994380a` |
| Home page: top view, what went wrong, decisions on units, flow ①–④, use-case band | ☑ `994380a`, `beee022` |
| Unit page four steps, all six units with drawings, reading freshness, bell curves, crude block, checks | ☑ `beee022`, `112aa48`, `11876cc` |
| Decision record page (`/audit`) | ☑ `112aa48` |
| Plain-words copy clean-up | ☑ `11876cc` |
| Lever batch code (`scenario.m` 'lever', `run_lever_batch.sh`, surrogate event map) | ☑ `1edeb3e` |
| Lever batch `lever_v1` (12 runs, seeds 200–211, `sim_octave/data/lever_v1/`) | ◐ launched 12:15 UTC 2 Oct, running |
| Refit surrogates on `lever_v1` → D3, D5–D7 give real target values | ☑ back-end change `af43f5c` (fit now reads `lever_v1`, see Step 20); ☐ stage regimes + refit after the batch |
| Run one recipe back through the simulator to confirm the predicted gain | ☐ after the refit |
| ② Soft-sensor estimate over time with lab points | ☑ `c694166` |
| ③ Earlier decisions on this unit (accepted / held / declined) | ☑ `c694166` |
| ④ Which limits bind the move; for "Not yet", the exact missing data | ☑ `c694166` |
| ① Full tag list (collapsible) | ☑ `c694166` |
| Footer: history of actions on this unit | ☑ `c694166` |
| ③ Each lever with its current value and allowed range (from the config operating windows; `levers[]` on every decision) | ☑ alignment review, 2 Oct 13:15 |
| ② Crude classifier accuracy shown on the page (held-out crude switches, VN10 "check the accuracy") | ☑ alignment review, 2 Oct 13:15 |
| ④ "What the models were trained on" line (runs, hold-out, lab count). Answers VN10's "how did we train / how do we know yield is maximised" | ☐ open; the full answer to the second part is the closed-loop simulator check above |

> [!NOTE]
> **Alignment review against verbatim.md (2 Oct 13:05–13:20).** Two older asks were replaced by the 11:00 agreement ("on the surface looks better; then click for details"):
> - **VN6, hover a unit for a mini-graph or right pane:** replaced by click-through to the unit page. `l0/DetailPane.tsx` is still in the code but not used on the home page.
> - **VN1, data flow from Bigtable to BigQuery lakehouse to models:** shown as the lakehouse source line under ④ on the unit page. `l0/FlowStrip.tsx` is still in the code but not used on the home page. Owner 14:08: show the simulation path only (Simulation → BigQuery → Lakehouse → Models → Decision); it is now a one-line strip on the home page above the timeline.
>
> Everything else in VN1–VN11 is covered by the rows above: dark default with a light toggle, coloured curves (no grey), a band around the live value, bell curves, the systemic "if nothing is done", Gemini with window context in Hindi, explicit levers, and the spread gate that waits for the lab.

> [!WARNING]
> **Superseded (kept for history):** the "Current status (2026-09-30)" box below, the Step 5 Decision / Modelling pages and the Step 18 L0 / L1 layout describe screens that the 2 Oct agreement replaced. Their engines and APIs still stand.

> [!IMPORTANT]
> **Current status (2026-09-30)** — *superseded by the 2026-10-02 section above*
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
  copilot/adk_agent.py    ADK root_agent + canonical tools + fallback compatibility
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


---

## v2 Expansion Build Guide (Steps 9–12): Systems-Thinking Digital Twin & 11-Use-Case Catalogue (Epic I)

> **Purpose of Steps 9–12:** Expand the completed `v0.1` Cockpit into the holistic **6-Unit Systems-Thinking Refinery Digital Twin + Explicit 11-Use-Case Catalogue Explorer (`#1–#11` & 23 Downstream Cases)** specified in [`expansion_plan_recommendation.md`](docs/archive/expansion_plan_recommendation.md), `features.md §8 (Epic I)`, `SDD.md §13`, and `BDD.md §6 (BDD-19..22)`.
>
> **Strict Rule (`SDD-NFR-11`):** Every API field, UI card, chart label, and Copilot response in Steps 9–12 MUST use **technical engineering units only** (`°F`, `% of feed`, `lb/s`, `ppm`, `%`, `psig`, `MW`, dimensionless efficiency). Zero currency symbols (`$`), ROI, NPV, or payback strings may appear in `cockpit/api` or `cockpit/web`.

| Step | Sprint / Version | Build Scope | Unlocks | Est. LOC & Time | Status |
|---|:-:|---|---|:-:|:-:|
| **Step 9** | Sprint 1 (`v0.2`) | Unified Systems Twin Backend (`cockpit/api/app/twin.py`, `GET /api/twin`) + Interactive 6-Unit Connected Digital Twin Canvas (`RefineryTwinSchematic.tsx`) + 4-Domain Systems Ripple Matrix + Yield Suite (`UC-01`, `UC-02`, `UC-03`, `UC-11`) | Scene 8 (Systems Twin) | `~620 LOC` (`4 hrs`) | ☐ |
| **Step 10** | Sprint 2 (`v0.3`) | Catalyst Regeneration & Cyclone Afterburn (`UC-04`), Fired Heater $CO/O_2$ & Tube Coking (`UC-05`, `UC-10`), Overhead Condenser UA Fouling (`UC-07`) + Fault Scenario Jumpers | Scene 8 & 9 (Units 1, 3, 5) | `~260 LOC` (`2.5 hrs`) | ☐ |
| **Step 11** | Sprint 3 (`v0.4`) | Plan-Coupled Energy (`UC-06`), Hydraulic $\Delta P / F^2$ (`UC-08`), Rotating Equipment `CAB`/`WGC`, Valve Stiction & Dual-Sensor Drift Matrix (`UC-09`) + Dedicated **Use-Case Catalogue Explorer (`UseCaseCatalogueView.tsx`)** | Scene 9 (All 11 Use Cases + 23 Cases) | `~355 LOC` (`3 hrs`) | ☐ |
| **Step 12** | Sprint 4 (`v0.5`) | PINN Conservation & Equipment Residual Strip (`pinn_residuals`) + Copilot / Gemini Live Systems Twin Tools (`get_systems_twin_state`, `get_use_case_detail`) + `test_twin_expansion.py` BDD Suite | Scene 8 & 9 + Voice Systems Co-Pilot | `~225 LOC` (`2 hrs`) | ☐ |

---

### Step 9: Unified Systems Twin Backend & 6-Unit Interactive Digital Twin Schematic (`Sprint 1 / v0.2`)

**Goal:** Build the single unified backend engine (`cockpit/api/app/twin.py`) that reads all 112 simulator columns at `(run_id, time_min)` and serves `GET /api/twin`, plus the interactive 2D ISA-101 **6-Unit Connected Refinery Digital Twin Schematic** (`RefineryTwinSchematic.tsx`) and **4-Domain Systems Ripple Matrix** on the Decision dashboard.
**Features:** `I1`, `I2`, `I5`, `I6`.

#### Files to Create / Update
1. **`cockpit/api/app/twin.py` (NEW, `~320 LOC`):**
   - Implement `evaluate_twin_state(run_id: str, time_min: int | None)` reading the current 112-column row from `catalog` + model committee estimates from `state` + resolved citations from `knowledge/index.py`.
   - Compute all **6 sequential physical units** (`unit_1_furnace`, `unit_2_riser`, `unit_3_regenerator`, `unit_4_fractionator`, `unit_5_condenser`, `unit_6_stabiliser`), the **3 Closed-Loop System Couplings** (`loop_1_yield_plan`, `loop_2_energy_pumparound`, `loop_3_catalyst_regen`), and the **4-Domain Systems Ripple Matrix** (`yield`, `energy`, `regeneration`, `reliability`).
   - Compute live 3-Zone Operating Envelopes for **UC-01** (`LCO_T98_F`), **UC-02** (`c5_recovery_pct = 100 * eff_C5 / (eff_C4 + eff_C5)`), **UC-03** (`HN_T98_F` & `prod_LPG` split), and **UC-11** (Multi-stream Soft Sensors).
2. **`cockpit/api/app/routers/decision.py` (`+35 LOC`):**
   - Register `GET /api/twin?run_id=&time_min=` and `GET /api/twin/use-cases?run_id=&time_min=`.
3. **`cockpit/web/src/components/twin/RefineryTwinSchematic.tsx` (NEW, `~260 LOC`):**
   - Render the interactive 6-unit sequential PFD schematic (`[1. Preheat Furnace] ──► [2. Riser Reactor] ◄──► [3. Regenerator & CAB] ──► [4. 20-Tray Main Fractionator & PA1–4] ──► [5. Overhead Condenser & WGC] ──► [6. Stabiliser & Light-Ends]`) with live tag readouts, animated hydrocarbon/catalyst/pumparound heat-recovery loops, status halos, and click-to-select unit/use-case inspection.
4. **`cockpit/web/src/components/views/OverviewView.tsx` (`+120 LOC`):**
   - Integrate `RefineryTwinSchematic`, the Selected Unit / Use-Case 3-Zone Operating Envelope, and the **4-Domain Systems Ripple Matrix** card.

#### ✅ Done-check
```bash
cd "$FCC_HOME/cockpit/api" && .venv/bin/pytest -q
curl -s "http://localhost:8010/api/twin?time_min=125" | python3 -m json.tool | head -n 45
cd "$FCC_HOME/cockpit/web" && npx tsc --noEmit && npx vitest run
```

---

### Step 10: Catalyst Regeneration, Fired Heaters & Exchanger UA Fouling (`Sprint 2 / v0.3`)

**Goal:** Activate full physics residuals, 3-Zone Operating Envelopes, and RAG-cited recommendations for **Unit 1 (Preheat Furnace — `UC-05` & `UC-10`)**, **Unit 3 (Catalyst Regenerator — `UC-04`)**, and **Unit 5 (Overhead Condenser UA Fouling — `UC-07`)**.
**Features:** `I7`, `I8`, `I10`.

#### Files to Update
1. **`cockpit/api/app/twin.py` (`+140 LOC`):**
   - **UC-04 (Regenerator Coke & Afterburn):** Compute `dT_cyc_reg_F = Tcyc_F - Treg_F`, `C_spent_cat`, `C_regen_cat`, `F_coke`, `standpipe_level`; cite `[IOW-FCC-02]` & `[SOP-FCC-005]`.
   - **UC-05 & UC-10 (Fired Heater $CO/O_2$ & Tube Coking):** Compute stoichiometric excess air (`fluegas_O2_pct`), `fluegas_CO_ppm`, fuel firing (`F5_fuel`), and tube-skin thermal delta (`T3_furnace_F - T2_preheat_F`); cite `[SOP-FCC-006]` & `[IOW-FCC-02]`.
   - **UC-07 (Condenser & Exchanger UA Fouling):** Track `dist_condenser_eff` vs clean baseline (`0.900`), `MV_cw_flow`, and `MV_PA1..MV_PA4`; when `dist_condenser_eff < 0.885`, recommend shifting heat duty to `PA1/PA2` and cite `[IOW-HX-03]`, `[WO-24031]`, and `[WO-25041]`.
2. **`cockpit/web/src/components/views/OverviewView.tsx` (`+90 LOC`):**
   - Add context-aware fault/regime jumpers so clicking **Unit 5 (`UC-07`)** or **Unit 3 (`UC-04`)** surfaces the unit's live envelope, degradation trend, and cited work orders.

#### ✅ Done-check
- `GET /api/twin` returns complete envelopes and citations (`IOW-FCC-02`, `SOP-FCC-006`, `IOW-HX-03`, `WO-24031`) for `UC-04`, `UC-05`, `UC-07`, and `UC-10`.

---

### Step 11: Plan-Coupled Energy, Hydraulic $\Delta P$, Rotating Equipment, Sensor Drift & Use-Case Explorer (`Sprint 3 / v0.4`)

**Goal:** Activate **UC-06 (Plan-Coupled Energy & Pumparound Balance)**, **UC-08 (Hydraulic & Filter $\Delta P / F^2$ Breakthrough)**, and **UC-09 (`CAB`/`WGC` Compressors, Control Valve Stiction & Dual-Sensor Drift Matrix)**, and build the dedicated **Use-Case-by-Use-Case Catalogue Explorer (`UseCaseCatalogueView.tsx`)** so the user can toggle between **Systems Twin Mode** and **Use-Case Catalogue Mode (`#1–#11` + 23 Downstream Cases)**.
**Features:** `I4`, `I9`, `I11`, `I12`.

#### Files to Create / Update
1. **`cockpit/api/app/twin.py` (`+110 LOC`):**
   - **UC-06:** Compute Net Complex Energy Index (`F5_fuel`, `power_CAB + power_WGC`, `MV_PA1..MV_PA4` heat recovery) conditional on active Plan cutpoints (`SP_LCO_T98`, `SP_HN_T98`).
   - **UC-08:** Compute normalized hydraulic resistance (`dP_reactor_frac`, `P4_reactor_psia - P5_frac_psia`) cited to `[WO-25007]`.
   - **UC-09:** Compute `power_CAB`, `power_WGC`, valve positions (`valve_V8..V11`), and the **5-Channel Dual-Sensor Drift Matrix** (`|T2 - T2_dup|`, `|Tr - Tr_dup|`, `|Treg - Treg_dup|`, `|P5 - P5_dup|`, `|P6 - P6_dup|`), citing `[WO-24133]`, `[WO-24102]`, `[WO-26049]`, `[WO-24058]`, `[INC-0733]`, and `[SOP-APC-008]`.
   - Populate `downstream_cases_summary` (all 23 cases from `refinery_optimisation.md` §2).
2. **`cockpit/web/src/components/views/UseCaseCatalogueView.tsx` (NEW, `~240 LOC`):**
   - Dedicated problem-by-problem explorer with:
     - Left/Top Rail of all **11 Core Use Cases (`UC-01`..`UC-11`)** grouped by Value Lever (`Yield & Quality`, `Energy`, `Reliability`) with live status badges.
     - Selected Use-Case Deep-Dive Panel: 3-Zone Operating Envelope, 4 Live Technical KPIs, Systems-Thinking Coupling Matrix, Gated Recommendation + Citations, and a **"Highlight Unit on Digital Twin ↗"** button.
     - Interactive **23 Downstream Case Examples Matrix** + **5-Channel Dual-Sensor Drift & Valve Stiction Table**.
3. **`cockpit/web/src/app/decision/page.tsx` & `cockpit/web/src/lib/nav.ts` (`+30 LOC`):**
   - Add **`Use-Case Catalogue (#1–#11)`** to the Decision sub-navigation (and mode toggle bar on `OverviewView`) so it is 1 click away from the Systems Twin.

#### ✅ Done-check
- All 11 use cases (`UC-01`..`UC-11`) and 23 downstream cases render in `UseCaseCatalogueView.tsx` with live simulated numbers and resolved citations.

---

### Step 12: PINN Conservation Panel, Gemini Live Systems Tools & BDD Verification (`Sprint 4 / v0.5`)

**Goal:** Surface the live **PINN Conservation & Residual Health Strip** (`pinn_residuals`), wire `get_systems_twin_state` and `get_use_case_detail` into the **Gemini Copilot & Gemini Live Voice Agent**, and verify `BDD-19` through `BDD-22` with automated tests (`test_twin_expansion.py`).
**Features:** `I3`, `E5`, `F23`.

#### Files to Create / Update
1. **`cockpit/api/app/copilot/tools.py` & `adk_agent.py` (`+65 LOC`):**
   - Add read-only tools `get_systems_twin_state(run_id, time_min)` and `get_use_case_detail(use_case_id, run_id, time_min)` so text and voice queries can inspect all 6 units, 11 use cases, PINN residuals, and 4-domain systems ripples.
2. **`cockpit/api/tests/test_twin_expansion.py` (NEW, `~140 LOC`):**
   - Automated pytest verification for `BDD-19` (6 units + 4-domain ripple matrix), `BDD-20` (PINN mass/enthalpy/monotonicity + condenser fouling & sensor drift residuals), `BDD-21` (all 11 use cases `UC-01`..`UC-11` + 23 downstream cases + zero financial strings per `SDD-NFR-11`), and `BDD-22` (Copilot/Live tool execution).

#### ✅ Done-check
```bash
cd "$FCC_HOME/cockpit/api" && .venv/bin/pytest -q
cd "$FCC_HOME/cockpit/web" && npx tsc --noEmit && npx vitest run
```

---

### Step 13: Full Unit & Use-Case Data Workspaces, Engineered SVG PFD, Actionable Decisions & Proactive Multilingual Multi-Agent Sentinels (`Sprint 5 / v0.6`)

**Goal:** Upgrade every Unit (`unit_1_furnace`..`unit_6_stabiliser`) and every Use Case (`UC-01`..`UC-11`) into a **complete operational workspace** with live multi-trace Plotly time-series charts (`chart_panels`), full tag tables (`tag_table` with shift `min`/`mean`/`max`), an engineered 2D SVG Process Flowsheet, actionable `Accept` / `Decline` decision cards (`POST /api/twin/decision`), and a **7-Agent Proactive Sentinel Fleet** briefing the operator in **English (`en`)**, **Hinglish (`hinglish`)**, and **Hindi (`hi`)**.
**Features:** `I13`, `I14` (`BDD-23`).

#### Files to Create / Update
1. **`cockpit/api/app/twin.py` & `cockpit/api/app/routers/decision.py` (`+280 LOC`):**
   - Compute window statistics (`window_min`, `window_mean`, `window_max`, `current`) and populate `tag_table` (8–22 tags per unit/use case), `chart_panels` (2–3 multi-trace time-series chart specs per unit/use case), and `decisions_needed` (actionable recommendation cards synced with SQLite `decisions` table) on every unit and use case.
   - Compute `agent_fleet`: 1 Shift Supervisor Orchestrator (`agent_supervisor`) + 6 Domain Sentinel Agents (`agent_furnace`, `agent_riser`, `agent_regenerator`, `agent_fractionator`, `agent_condenser`, `agent_stabiliser_instr`) with proactive early warnings and real-time briefings in `en` (English), `hinglish` (Hinglish control-room phrasing), and `hi` (Hindi Devanagari).
   - Add `POST /api/twin/decision` in `decision.py` to record `accepted` / `declined` decisions for any unit or use case into SQLite `decisions` and `audit` tables.
2. **`cockpit/api/app/copilot/chat.py` (`+25 LOC`):**
   - Support `lang` (`"en"` | `"hinglish"` | `"hi"`) in context so text Copilot and Gemini Live respond naturally in English, Hinglish, or Hindi while preserving exact technical numbers and Spread Gate verbatim rules.
3. **`cockpit/web/src/components/twin/RefineryTwinSchematic.tsx` (`~450 LOC`):**
   - Replace the 6-card grid with a **1200×430 interactive 2D ISA-101 SVG Process Flowsheet** (Cabin Furnace, Riser + Disengager Dome, Regenerator + CAB Figure-8 Loop, 20-Tray Main Fractionator + PA1–PA4 Exchangers, Overhead Condenser + Reflux Drum + WGC, Stabiliser Tower + Product Headers, plus `#1–#11` Use-Case Callout Pins).
   - Render the **Proactive Multi-Agent Sentinel Bar** with language switcher (`English` | `Hinglish (Control Room)` | `हिंदी (Hindi)`), 1-click voice readout (`window.speechSynthesis` + Gemini Live handoff), and agent drill-down.
   - Render the **Full Unit Digital Twin Workspace** below the SVG PFD whenever any unit is clicked: 2–3 live multi-trace Plotly time-series charts, complete unit `tag_table`, 3-Zone Operating Envelope, 4-Domain Ripple Matrix, and interactive `Accept` / `Decline` decision cards.
4. **`cockpit/web/src/components/views/UseCaseCatalogueView.tsx` (`~380 LOC`):**
   - Organize the 11 core use cases into a **Left-Rail System Tree** + **Full Use-Case Operational Workspace** showing: live multi-trace Plotly time-series charts (`chart_panels`) for that use case, complete relevant `tag_table` (with shift `min`/`mean`/`max`), proactive Sentinel Agent briefing in `EN` / `Hinglish` / `Hindi`, 3-zone operating envelope, 4-domain ripple impact, and working `Accept` / `Decline` decision buttons.
5. **`cockpit/api/tests/test_twin_expansion.py` (`+75 LOC`):**
   - Add `test_bdd_23_full_workspaces_decisions_and_multilingual_agents` verifying `tag_table`, `chart_panels`, `decisions_needed`, `POST /api/twin/decision` audit persistence, and `agent_fleet` trilingual (`en`, `hinglish`, `hi`) briefings.


## v3 Build Guide (Steps 14–19): Crude-Adaptive Engines & L0/L1 Screens (Epic J)

> Governing plan: [BUILD_PLAN_v3.md](BUILD_PLAN_v3.md). Specs: SDD §1A, §14. Acceptance: BDD-24..28. Run tests with `cd cockpit/api && .venv/bin/pytest -q` and `cd cockpit/web && npx tsc --noEmit && npx vitest run`.
>
> **Compute note (measured 2026-10-01):** the Octave model runs at ≈ 78 s per simulated minute per core; a 1600-min run takes ≈ 35 h. The `full_v1` batch (54 runs) is still completing on all 64 cores. **Do not launch new Octave batches until `full_v1` finishes.** `full_v1` already holds 50 labelled crude switches, which is sufficient for E1–E4.

### Step 14 (P1): Regime data & staging — `J1`
1. `cockpit/api/app/regimes.py`: `REGIMES` (R1–R4, API bands, labels, signatures), `regime_for_api(api)`, `regime_segments(df)` (per `crude_id`: start/end, transition window from `event_code == 1`).
2. `sim_octave/stage_regimes.py --batch full_v1`: writes `_staged/regimes.csv` and `_staged/lab_results.csv` (SDD-DATA-12). Stdlib + pandas; safe to re-run; never deletes.
3. `sim_octave/scenario.m`: add `crude_campaign` (`build_random(..., 'campaign')`: regime walk, 60/180-min transitions, 8–16 h dwell) and `run_campaign_batch.sh` (SDD-DATA-13). Generation is optional and deferred.
4. Tests: `cockpit/api/tests/test_regimes.py` (band edges, segment extraction on a synthetic frame, staged CSV columns).

### Step 15 (P2): E1 Regime + E3 Detection — `J2`, `J4`
1. `app/engines/regime.py`: fingerprint features (EWMA τ = 10), per-regime Gaussian fit on train runs, posterior, novelty, `transition_pct`, `declared_vs_detected`; cached per run as `.npz` next to estimates.
2. `app/engines/detect.py`: per-unit primary tag/expected (SDD-DET-01), robust σ, two-sided CUSUM, change-point, MV contribution ranking, trilingual briefing templates.
3. `app/store.py`: `agent_events` table; `app/routers/agents.py`: `GET /api/agents/events`, `GET /api/agents/stream` (SSE), `GET /api/regime`.
4. `twin.py`: embed `crude_slate`, `needs_attention`, `timeline` and per-unit `events_open` / `kpi_vs_plan` into `GET /api/twin` (API_CONTRACT_v3 §6).
5. `app/routers/workbench.py`: `GET /api/unit/{unit_id}/workbench` — one aggregate payload with the four zones Data · Analysis · Models · Decisions (API_CONTRACT_v3 §5); `app/engines/workbench.py` assembles series (downsampled), panels (no grey colours), analysis, models, regime, recipe, decisions.
6. Tests: `test_regime_engine.py` (≤ 45 min detection on ≥ 90 % held-out switches), `test_detect.py` (breach before next lab on the U4 tags), `test_workbench.py` (all 6 units return the four zones; no grey trace colours; financial scan).

### Step 16 (P3, critical path): E2 Adaptation + E4 Recipe — `J3`, `J5`
1. `app/engines/adapt.py`: per-regime member scoring (CRPS on train labs), live weights = `p_regime` blend, physics weight rule, bias reset hook in `pipeline.py`.
2. `app/engines/surrogates.py`: per-regime ridge + quadratic surrogates for the 10 outputs vs 11 inputs (SDD-RCP-01); fit script `app/train_surrogates.py`; model cards.
3. `app/engines/recipe.py`: objective + constraints (SDD-RCP-02/03), bounded coordinate search with restarts, gate logic; `GET /api/recipe`; `recipe_id` on `POST /api/twin/decision`.
4. `config.yaml`: `recipe:` (product priorities, penalty weights, step limits) and `iow:` (per-SP limits).
5. Replay harness `app/eval_recipe.py` (BDD-27 "beats hold"). Financial-term scan stays green.

### Step 17 (P4): Agents on the event bus — `J4`
1. Unit sentinels emit E3 events and draft E4 recipes; Systems Agent consequence rules over catalyst / heat / hydrocarbon loops produce "Needs attention" lines.
2. ADK: add `get_scope_snapshot`, `get_regime`, `get_recipe` to `ALL_TOOLS` / DECLS; `root_agent.tools` remains the 8 canonical tools.

### Step 18 (P5): Screens — `J6`, `J7`
1. `cockpit/web/src/app/twin/page.tsx` (L0) and `twin/unit/[unit_id]/page.tsx` (L1); `components/twin/l0/*`, `components/twin/l1/*`; shared `ChartStack` with one x-axis and store-bound cursor; `theme.ts`: light default, named trace palette (SDD-L0-04).
2. Retire `UseCaseCatalogueView` and the Phase-13 unit workspace from navigation; keep backend payloads.
3. Playwright: `e2e/twin.spec.ts` (no charts on L0, one cursor on L1, no grey traces, light/dark, 1440 px).

### Step 19 (P6): Gemini scope, Hindi-first, director script — `J8`
1. `copilot/chat.py`: read `context.screen`; fetch the scope snapshot server-side (`engines/workbench.scope_snapshot`) and embed it in the system instruction — plant snapshot on L0 / other pages, unit snapshot on L1 — so Gemini always knows which screen is open yet can answer about the whole refinery; screen-specific suggestions; Hindi system prompt variants; Live voice `hi-IN` / `en-IN`. `adk_agent.py`: add `get_scope_snapshot`, `get_regime`, `get_recipe` to `ALL_TOOLS` (canonical 8 unchanged). Frontend `useCopilotChat.usePageContext` adds `screen` from the route.
2. `demoflow.md`: 7-scene crude-switch storyline (BUILD_PLAN_v3 §6) with the exact run / minutes to use.

## Step 20 (2026-10-02): Decision-first cockpit — home, four-step unit page, decision record

> Spec: the [2026-10-02 agreement](#2026-10-02-agreement-supersedes-earlier-ui-sections-where-they-conflict) at the top of this guide. Acceptance: BDD-31..34. Supersedes the Step 18 screen layout (engines unchanged).

1. ☑ `app/engines/decisions.py` + `app/routers/decisions.py`: Decision objects D1–D9 with problem (P1–P4) and IOCL use case; `POST /api/decisions/{id}/act` writes audit only (`994380a`).
2. ☑ Home `/twin`: `PlantCanvas`, `UnitFlow`, `DecisionQueue`, `HomeStory` use-case band (`994380a`, `beee022`).
3. ☑ Unit page `/twin/unit/{unit_id}`: `UnitStory.tsx` four steps + `UnitDrawings.tsx` for all six units (`beee022`, `112aa48`, `11876cc`).
4. ☑ Decision record `/audit`: `components/record/DecisionRecord.tsx` (`112aa48`).
5. ◐ `lever_v1` batch (`./sim_octave/run_lever_batch.sh 12 <minutes> data/lever_v1 200`), launched 12:15 UTC 2 Oct → ☐ refit surrogates → ☐ feed one recipe back through Octave to confirm the predicted gain → D3, D5–D7 become Live.
   > [!WARNING]
   > **Code gap found 2 Oct (fixed in `af43f5c`: `surrogates.py` reads `lever_sNNN`, train s200–s209 / hold-out s210–s211, merges `lever_v1/_staged/regimes.csv`, version 6, auto-refit when lever runs change; `catalog.get` falls back to all runs):** the surrogate fit (`app/engines/surrogates.py`, `_fit_surrogates` / `_step_samples`) reads only runs of `data.primary_batch` (`full_v1`) and takes the seed from `random_sNNN` names, so `lever_sNNN` runs are skipped today; seeds ≥ `test_seed_min` (140) would also all be treated as hold-out, and the crude segments come from `full_v1/_staged/regimes.csv` only. The refit therefore needs a small back-end change (include `lever_v1`, give it a train / hold-out split, stage its regimes) plus a `SURROGATE_VERSION` bump. There is no `app/train_surrogates.py`; the fit runs lazily and is cached in `artifacts/engines/surrogates.pkl`.
6. ☑ Front-end items: ② estimate over time with lab points · ③ earlier decisions · ④ binding limits and, for "Not yet", the exact missing data · ① full tag list · footer action history · crude classifier (`c694166`). Home page at 1366 px fixed. Hindi / Hinglish checked (12:46): Gemini answers in all three; the D3 plausibility check now lives in the recipe engine (`engines/recipe.py` `plausibility_issue`, gate_reason `implausible`), so the decision list, the unit page, the older views and Gemini all report the recipe as withheld. Test runs used to write "Held by Operator" / "Accepted by Ravi" rows into the live decision record that the demo shows; tests now use a throw-away audit file (`FCC_AUDIT_DB`, `tests/conftest.py`). Back-end tests: 281 pass; 9 of the 10 old failures fixed (NaN in `adapt.py` weights; tests updated to 1,600-min runs and to the honest zero LCO-yield response). Open: crude classifier held-out switch accuracy 57 % (test wants 80 %), R2 Urals-type confused; revisit with the lever runs' extra crude switches. Lever runs now enter the surrogate fit while still running once they hold ≥ 6 h (`training.lever_min_rows: 360`); the fit is redone on each API restart as they grow.
