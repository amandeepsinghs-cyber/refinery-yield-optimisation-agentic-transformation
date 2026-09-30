# FCC Soft-Sensor Decision Cockpit — API (`cockpit/api`)

FastAPI back end for the cockpit **technical demo**. Every number comes from the Octave simulator CSVs in
`sim_octave/data/**` (no mock data). No financial content. **Advisory only**: Accept/Decline is written to a local
SQLite audit log (`artifacts/audit.db`) and nothing else — there is no route to any control system.

Binding contract: [`../API_CONTRACT.md`](../API_CONTRACT.md). Specification: [`../../SDD.md`](../../SDD.md) §4–§7, §9.

## Setup

```bash
cd "cockpit/api"
~/.local/bin/uv venv .venv
~/.local/bin/uv pip install --python .venv/bin/python -r requirements.txt
# torch comes from the CPU index:
# ~/.local/bin/uv pip install --python .venv/bin/python torch --index-url https://download.pytorch.org/whl/cpu
gcloud auth application-default login      # ADC; project fcc-soft-sensor, Vertex AI API enabled
```

## Train (and re-train when `full_v1` fills in)

```bash
cd cockpit/api
OMP_NUM_THREADS=4 .venv/bin/python -m app.train        # log: stdout; artifacts: cockpit/api/artifacts/
curl -X POST localhost:8010/api/admin/reload            # running server picks up new artifacts / new runs
# or start training from the API:  curl -X POST localhost:8010/api/admin/train   (log: artifacts/train.log)
```

`app.train` rescans the catalog every time, so re-running it after more `full_v1` rows exist picks them up
automatically. `POST /api/admin/reload` rescans CSVs, reloads artifacts and the knowledge index, and re-scores runs
that are new or have grown since training (with the final model; labelled `scored_by` in `provenance`).

## Demo Selection (`app.select_demo`)

```bash
cd cockpit/api && .venv/bin/python -m app.select_demo
# or from root:
make demo-select
```

Scans held-out test runs (`random_s140..s153`, seed >= 140) using the same pipeline scoring the API uses (`app.pipeline` / `state`). Identifies and ranks candidate windows for demoflow data moments:
- **M1 (Scene 2):** Blind drift between labs on manual cut point, tracked by soft sensor and confirmed by subsequent lab.
- **M2 (Scene 1):** Safe recommendation (GREEN/AMBER trust, P(on-spec) >= 0.95) safe in hindsight.
- **M3 (Scene 3):** Prudent withholding (W90 > 14 °F or bimodality/novelty).

Outputs a proposed `demo:` YAML block to stdout and writes a structured candidate report to `artifacts/demo_candidates.md` without modifying `config.yaml`. Degrades gracefully on partial runs (< `data.min_rows`, 1500).

**Data source.** `full_v1` (`random_s100..s153`, 1600 min each) is the only source of truth. While it has no data rows,
the catalog falls back to `frontend_sample_1h` (4 × 60-min fixed scenarios, legacy 108-column schema) as a clearly
labelled **temporary fallback** (`/api/health → data.source = "fallback"`, note in `data.note` and `/api/models eval.note`).
It drops out automatically once `full_v1` has enough **complete** runs: a run is complete at `data.min_rows` (1500)
data rows, and the primary batch becomes active only when ≥ `data.min_complete_train_runs` (4) complete train runs and
≥ `data.min_complete_test_runs` (1) complete held-out runs exist. Partial runs are never used for training, scoring or the
demo; they are reported in `/api/health → data.primary_progress` (`complete`, `partial`, `header_only`, `partial_runs`).
`data.retrain_recommended` turns true when the source is `full_v1` but the loaded model was trained on the fallback.
Header-only files are skipped; a trailing row with missing fields is dropped only while the file is still being
written (row count < `data.expected_rows`, 1600 for `full_v1`); complete files keep every row.

**Split.** Grouped by run. `full_v1`: train = `random_s100..s139`, held-out test = `random_s140..s153`
(`training.test_seed_min`). Grouped 4-fold by run on the train runs provides out-of-fold estimates for admission and
committee weights; the final model (all train runs) scores the test runs; `/api/models` metrics are on the test runs,
against simulator truth on every minute. Fallback data: leave-one-run-out (every run scored out-of-fold). Demo default
run: `random_s140` (config `data.default_run`).

**Labels.** `training.label_source: auto` trains on synthetic labs (SDD §4.3, `injected_error == none`) when the
**train runs** (seed < `training.test_seed_min`) carry ≥ `training.min_labs` (100) clean labs per property; otherwise on
simulator truth at every minute (fallback data has no labs). Held-out labs never influence the choice. Lab labels drawn
in a **transient** (A5 steady-state flag, below) are excluded; counts (`clean`, `transient_excluded`, `used`) are in
`eval.note` and `bundle.json → label_stats`. The chosen source is reported in `eval.note` and model cards.

**Measurement noise (DECISIONS L6).** `noise.enabled: true` adds deterministic Gaussian noise to model inputs in
`Catalog.load()` (seeded by `sha256(run_id|noise.seed|tag)`, keyed on `time_min`, so growing files keep their noise):
temperatures (tags ending `_F`) σ `noise.temp_F` 0.5 °F, pressures (tags containing `psia`) σ `noise.pressure_psi`
0.05 psi, flows (`feed_flow_lb_s`, `prod_*`, `F_*`, `MV_*`) σ `noise.flow_rel` 0.5 % relative. Targets
(`LCO_T98_F`, `HN_T98_F`), set points (`SP_*`) and label columns are never noised. Models train and score on the measured
view; simulator truth of the targets is kept for evaluation and the overlay; `Catalog.load_true()` returns noise-free
values for every column. Synthetic labs are built from truth (+ lab error, L2).

**Steady-state flag (A5, minimal).** `app.data.features.transient_mask`: a minute is transient when `event_code != 0`
or the trailing `steady_state.window_min` (30 min) std of any `features.key_tags` exceeds `steady_state.std_ratio` (3) ×
max(median rolling std of that tag in the run, the tag's measurement-noise σ).

**Lags (A6, `app/data/lags.py`, config `lags:`).** For each target and each `features.key_tags` input, the delay
(0..`lags.max_lag_min` = 60 min) is identified by **prewhitened cross-correlation**: first differences of input and
target per run, AR(`lags.ar_order` ≤ 5) fitted by least squares to the input differences, the same filter applied to
both, pooled CCF over runs, lag = argmax |CCF| if above `lags.min_abs_ccf` (`auto` = 2/√N), else 0. Identification
uses only the training runs of each fit (each CV fold and the final fit; never held-out runs), measured (noisy)
inputs and the **simulator-truth target** (3 labs/day are too sparse for a CCF; on site this would use a high-rate
analyser or step tests). Features per (target, tag) with lag L > 0: `<tag>__lag<L>` (value at the last minute ≤ t − L)
and `<tag>__lagmean<L>` (mean over [t − L, t]); both causal and deterministic, and each target only sees its own lagged
columns. The table is persisted in `artifacts/models/lags.json`, `bundle.json → lags` and inside
`final_bundle.pkl`; `prepare()` and `FoldBundle.predict_run()` reuse it at scoring (no re-identification).
`GET /api/models` returns it as `lags` (per property, sorted by |CCF|). `lags.enabled: false` turns it off.

## Run

```bash
cd cockpit/api
setsid nohup .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8010 > artifacts/server.log 2>&1 &
curl localhost:8010/api/health
```

CORS allows `http://localhost:3000`. Tests: `.venv/bin/pytest -q` (add `RUN_GEMINI=1` for the real Vertex checks).

## Config

`config.yaml` (SDD §9 subset). Env overrides: `FCC_GCP_PROJECT`, `FCC_GCP_LOCATION`, `FCC_TEXT_MODEL`,
`FCC_LIVE_MODEL`, `FCC_EMBED_MODEL`, `FCC_CONFIG`, `FCC_ARTIFACTS_DIR`, `FCC_KNOWLEDGE_DIR`.
Gemini: project `fcc-soft-sensor`, `us-central1`, text `gemini-2.5-flash`, Live `gemini-live-2.5-flash-native-audio`
(fallback list probed at startup; the working model is reported in `/api/health → gemini`), embeddings
`gemini-embedding-001` (fallback `text-embedding-005`, then BM25).

## Layout

```
app/main.py            FastAPI app, CORS, error format, copilot SSE + Live WS
app/config.py          settings (config.yaml + env)
app/data/catalog.py    CSV catalog, events (event_code or scenario.m), synthetic labs (SDD §4.3), tags
app/data/features.py   EWMA features, correlation-ranked selection with collinearity pruning, scaler (±5σ clip)
app/data/lags.py       A6 lag identification (prewhitened CCF), causal lagged features, lags.json persistence
app/data/health.py     DQ (range/spike; frozen optional) and PCA T²/SPE novelty
app/models/            bayes_ridge_v1, gpr_v1 (classic.py); hybrid_delta_v1, pinn_ens_v1 (hybrid_pinn.py, PyTorch CPU)
app/dist.py            Gaussian mixture: bisection quantiles, PDFs, Ashman D, CRPS
app/pipeline.py        fold bundle + per-run assembly: weights → Kalman bias → mixture → trust S1–S7 → gate → recs
app/gate.py            spread gate, hysteresis, exact SDD-GATE-04 messages
app/recommend.py       SDD-REC engine; gain / yield sensitivity from event-5/6 windows
app/train.py           training + precompute (`python -m app.train`)
app/store.py, state.py artifacts (npz/json per run), SQLite audit, service state, estimate message (SDD §6.2)
app/knowledge/index.py corpus chunking, Vertex embeddings cache, BM25 fallback, records
app/copilot/           tools.py (read-only tools), chat.py (text, SSE), live.py (Gemini Live proxy)
app/routers/           meta, timeseries, modelling, decision, knowledge
```

## Copilot

Plain **google-genai** (`vertexai=True`) with a manual function-calling loop — not ADK. Streaming SSE events
`thought`, `tool_call`, `final`, `chart`, `citation`, `suggestion`, `error`, `done`. Tools are read-only (SDD-COP-02 +
`search_documents`, `get_document`, `find_similar_events`). `query_sim_data` runs **SELECT-only SQL with DuckDB over the
local catalog** (table `fcc_sim_minute`, alias `fcc_sim_minute_v2`, external access disabled, ≤ 1000 rows) instead of
BigQuery. The system instruction enforces SDD-COP-05 (gate message verbatim, no set point while WITHHELD, numbers only
from tools, simulator truth labelled, `[DOC-ID rN §x.y]` citations or "No cited source", no financial content).
Live (`WS /api/live`) proxies to `client.aio.live.connect` (AUDIO out, input/output transcription on), executes the
same tools server-side, and relays `ready/audio/transcript/tool_call/citation/interrupted/turn_complete/error`.

### Golden Evaluation Harness & Guardrails

The golden test set (`golden/golden.yaml`) contains 16 evaluation cases spanning demo Scenes 5 & 6 (verbatim and paraphrased questions) and strict guardrail verifications:
- **Refuse DCS writes**: Rejects write commands and states advisory-only governance (DECISIONS S3).
- **Gate discipline**: Prohibits recommendations and set-point suggestions while WITHHELD (DECISIONS T5, SDD-COP-05).
- **Decline financial figures**: Rejects dollar figures, savings, ROI, or NPV requests per DECISIONS S2; reports technical metrics only (°F margin, P(on-spec), yield shift %).
- **Sulfur scope (D1)**: Clarifies that the simulator has no sulfur chemistry and D1 is evaluated site-phase only (DECISIONS S1).
- **Unknown tags / numbers**: Declines to hallucinate unmeasured parameters (e.g. ambient humidity or cooling water temps).
- **Prompt injection resistance**: Retains safety and advisory constraints under simulated override prompts.

Run the evaluation harness and offline test suite:
```bash
make copilot-eval                                # run all 16 cases against Vertex AI
.venv/bin/python -m pytest tests/test_golden_offline.py -q  # offline structural suite
```
Results and latency metrics are written to `artifacts/copilot_eval.md` and `artifacts/copilot_eval.json`.

## Known simplifications vs SDD

- **Labels**: simulator truth when < `min_labs` clean synthetic labs per property on the train runs (see above);
  SDD-MOD-06 steady-state filter = minimal A5 rolling-std + event flag, applied to lab labels only.
- **Lags (SDD-LAG)**: prewhitened-CCF delay per (target, key tag) only (no FOPDT/FIR fit); identified against simulator
  truth, not labs; the what-if endpoint overrides current values/EWMA but leaves lagged columns at their history.
- **Features**: correlation ranking with |r| < 0.98 pruning (ridge 25, GPR/hybrid 12, PINN 20) instead of VIF/PLS;
  standardised inputs clipped at ±5σ of training data to bound extrapolation.
- **Bayesian ridge**: regime one-hot with shared prior (no hierarchical partial pooling).
- **GPR**: 2 optimizer restarts (SDD: 5), ≤ 1500 training points (≤ 800 in CV folds).
- **PINN**: per-property networks (no joint HN/LCO bound penalty); physics penalty toward the hybrid physics base
  and monotonicity dT98/dT_draw ≥ 0 on ≤ 1000 unlabelled minutes; λ fixed from config (no λ sweep); 250 epochs.
- **Hybrid physics**: `c` (pressure correction) is set to 0 when P5 does not vary in training data.
- **Committee weights**: 1/MSE per admitted member over the most recent `committee.recent_n` (3) accepted labs,
  pooled over the scored history available for the run (the run's accepted labs so far plus an optional prior
  `history` passed to `assemble_run`); with fewer, the out-of-fold (training) weights. A lab updates the weights from
  the minute after its LIMS arrival. With 3 labs per run the lab-based weights start after the 3rd accepted lab
  (~minute 1380 in `full_v1`); the source per minute is stored as `weight_source` (`out_of_fold` | `recent_labs`).
- **Lab status** (Lab Reconciliation agent stand-in): REJECT on timestamp error, HOLD if |lab − estimate| > 2R, else ACCEPT; rules only.
- **Trust**: S2 = PCA T²/SPE (empirical 99% limits ×1.05) or GPR σ > 2× median training σ; S4 passes when no labs
  yet; S5 = range + spike checks (frozen check disabled by default: simulator outputs are legitimately flat at 8
  significant figures in steady state); S3 severe when HN q50 ≥ LCO q50; S6 counts training rows per regime.
- **Fallback chain (SDD-FB / C4, minimal)**: per minute `source` = `consensus` (finite mixture, ≥ 2 admitted
  members usable, trust ≠ RED) → `best_single` (only one admitted member usable: lowest out-of-fold MSE, + bias) →
  `hold_last` (last good value, at most `fallback.hold_max_min` = 60 min) → `BAD`. Exposed in the estimate message as
  `source` and `source_value`.
- **Recommendations (DECISIONS T5)**: `yield_shift_pct = 100·Δ·g·yield_sens / feed(lb/min)`; HN gain/yield default
  when no event-6 windows; OPEN = within the last 30 min of the run, else EXPIRED. GREEN: full move (largest feasible
  Δ, |Δ| ≤ `max_move_F` 5 °F, on the `step_F` 0.5 °F grid). AMBER: half move rounded toward zero to `step_F` for
  raises; a lowering move is not halved (it is the smallest move that restores P(on-spec) ≥ 0.95). RED → no card;
  WITHHELD → WITHHELD card, no move. If no move within ±5 °F reaches P(on-spec) ≥ `p_on_spec_min` (0.95), the card is
  `status: "HOLD"`, `action: "HOLD"`, Δ = 0 (never OPEN; not counted in `recs_total`, counted in
  `kpis.held_no_feasible_move`).
- **Overview**: `GET /api/overview?run_id=&property=` (default `LCO_T98_F`) computes every KPI for that property.
- **Gate limit**: fixed 14 °F; the SDD-CAL-02 calibrated value is reported (`/api/models mixture.w90_max_calibrated`) but not applied.
- **Timestamps**: `ts = 2026-09-01T00:00Z + time_min` (synthetic, DECISIONS D6) for every run. Knowledge records:
  SHIFT docs are placed only by `sim_run` + `sim_window[0]` (optional `sim_batch`, default `full_v1`); records without
  `sim_run`/`sim_window` have `time_min: null` and are listed by date only.
- **Copilot SQL guard**: single SELECT/WITH; keywords checked outside string literals / quoted identifiers; the scalar
  `REPLACE(...)` function is allowed; DDL/DML, `SET`, `COPY`, `ATTACH`, `PRAGMA` and file/network readers are blocked.
- **Audit / persistence**: SQLite instead of BigQuery; gate transitions are written at training time (`actor = system:gate`).
