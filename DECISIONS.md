# Canonical Decisions: FCC Soft-Sensor Demo

> **Purpose:** the single list of facts that every document and every line of code must agree with. If a doc or config disagrees with this file, the doc or config is wrong. Change a fact here first (Lead only), then propagate it.
>
> **Order of authority:** `DECISIONS.md` (facts) → `demoflow.md` (what we show) → `features.md` (what we build) → `SDD.md` (how) → `BDD.md` (acceptance) → `build.md` (order) → `checklist.md` (progress).

Last updated: 2026-09-30 (Lead). **2026-10-02:** section 0 added (owner agreement 09:48–11:34 UTC). **2026-10-07:** S-8 added (feed quality, R-1).

## 0A. 2026-10-06 story-first pitch (6 Oct; adds to §0 and §5, supersedes the *presentation order* in P5 / P10)

Owner, 6 Oct 2026: 04:32 *"they gave us the value figures. It's them not ours, so we can keep them, otherwise they may feel we are not listening or we are not focussing on the high value use cases"*; 05:52 *"going use case by use case is not the most optimal … I am still missing … the story of a refinery … should I not read the story of the refinery first and then go? then … how we are helping in taking those decisions … the first decision is what should be the temp of furnace, which first and foremost is decided based on the input crude"*; 05:55 "sure" (restructure); 06:03 "update the relevant files that define the build". Context: [use_cases/important_context.ipynb](use_cases/important_context.ipynb).

| # | Decision |
|---|---|
| S-1 | **Story first, then follow the oil.** The pitch order is: refinery story → IOCL's list (their figures, attributed) → one data foundation (`/platform`) → **follow the oil** (stop 1 feed D4 → 2 furnace D6 → 3 riser D8 → 4 regenerator D5 → 5 fractionator D1/D2/D9 → 6 gas plant & stabiliser D7 → 7 whole FCC, D3/#6) on `random_s107` 10:00 → **stress test** on held-out `random_s144` (10:00 D1, 12:00 "Not yet") → decision record → back to IOCL's list and the pilot ask. IOCL use cases are met *at the stop where they happen*, not one by one. `/platform` stays the landing page (P5); only the spoken order changes. Script: [use_cases/PRESENTER_PACK.md](use_cases/PRESENTER_PACK.md). |
| S-2 | **The FCC is fed heavy gas oil, not crude.** Crude → crude unit (CDU / VDU) → heavy gas oil (VGO) → FCC. In this build "crude switch" means the FCC feed changed because the crude slate changed. Say *"the crude slate changes the FCC feed, and preheat follows the feed"*, never *"we set the furnace from the crude"*. D4 (which feed, is the switch done) is therefore the first decision; D6 (preheat) follows it. |
| S-3 | **IOCL's value figures are kept, attributed to IOCL.** Shown in the opening and closing table of the pitch and in `use_cases/` (column "IOCL-reported benefit", footnote *"IOCL's figures, not our estimates or commitments"*), always in a separate column from our status. **Not on cockpit screens** — U3 / S2 stand. Figures not traceable to IOCL's original (the £4.3M gas-turbine filter, the $8.7M flare NPV, the missing coker-outage value) are marked *(check)*. |
| S-4 | **One status vocabulary everywhere:** 🟢 Interactive · 🟠 Scripted outcome · 🟡 Partly · 👁 Watch only · ⚪ Not claimed, plus the tag *FCC equivalent* when IOCL named a unit we do not have (reformer, CDU, alkylation, …). Matches `STATUS_LABEL` in `cockpit/web/src/lib/howItWorks.ts`. |
| S-5 | **Epic L (app) is proposed, not built:** L1 "The story of a refinery" band at the top of `/platform`; L2 "Follow the oil" guided stops 1–7 + stress test. Build locally, test, then redeploy **only on the owner's go-ahead** (redeploy resets the decision record — P13). L3 / L4 (presenter pack, attributed use-case docs) are done. |
| S-6 | **Correction to L5 (training labels).** The served bundle (`cockpit/api/artifacts/bundle.json`) reports `label_source: truth` — the soft sensor trains on simulator values sampled every 30 min (728 LCO / 697 HN labels), because the simulated lab record is too thin (`training.label_source: auto`). Quote it that way; on site the models train on IOCL lab history. L5 below keeps its original wording for history. |
| S-7 | **Front Overview page (`/platform`) = FP-1 refinery overview + FP-2 decisions; everything else stays.** Owner, 6 Oct 2026: 06:47 *"there should be an overview of refinery … the refinery view is critical, and then we go to FCC"*; 06:51 *"make a front overview page. That will have details about the refinery, what happens on the top level with sufficient details, and then mention where their use cases fit and then, on that, which we have built. Then subsequently in the bottom part as an expandable screen the decisions being made. Then the individual sections as they are today on tabs will remain"*; 06:53 *"let's keep them for now"* (existing Overview sections); 06:39 *"I want to see the coloured dots"*; 06:43 *"they don't want to have a black box"*. **FP-1 (top):** what happens in a refinery, top level with enough detail — crude in → crude unit (CDU/VDU) → streams → reformer, hydrotreaters, **FCC**, coker, LPG/alkylation → utilities & flare → blending → products. On that picture: **where each IOCL use case fits** (pinned where IOCL named it) and **what we have built** (status dot 🟢 Interactive · 🟠 Scripted outcome · 🟡 Partly · 👁 Watch only · ⚪ Not claimed; *FCC equivalent* pins also say which FCC unit shows it). The FCC is highlighted as "where we built" and opens `/twin`. **FP-2 (below FP-1):** an expandable section "Decisions the platform enables" — nine decisions in follow-the-oil order; each opens a card: pain point · how we solve it · how it works (data in · algorithms, in order · checks before advising · what the operator gets · on your plant · what we need from you) · IOCL use cases · "See it running on U# →". **Kept below, unchanged for now** (owner reviews later): six layers, use-case cards, person decides, MeitY, how it learns, proof loop. **Unit tabs unchanged:** FCC Complex, U1–U6, Decision record. No value figures (U3). Supersedes L1 (refinery story band). Content contract: SDD §14.6E. **Order of work: docs → restore local app → build FP-1 → owner review → build FP-2 → owner review → deploy last, on go-ahead.** |
| S-8 | **Feed quality drives every FCC decision; the feed model estimates properties, not the crude name** (7 Oct; refines S-2 and D4; spec [ONGOING_REFINEMENTS.md](ONGOING_REFINEMENTS.md) R-1). Owner, 7 Oct 2026: 04:17 *"why would someone like to run a classification model for crude identification when the input is heavy gas oil? … any way this is scripted and fixed at 93 %"*; 04:20 *"just renaming may not solve the problem"*; 04:25 *"the problem is not just with fractionator … it is with the entire FCC unit starting from riser … the classification would identify or use the properties of the input gas oil"*. **(a) What the feed model answers, in order:** ① *is the feed changing, and how far through is it* (change detection on the unit's own response — riser ΔT, coke per feed, regenerator temperature, conversion, tray ΔT); ② *what are its properties* (soft sensor: estimated API gravity with a confidence band; on site also Conradson carbon, K-factor, nitrogen and metals from IOCL lab history — the simulator records API only, so only API is estimated here); ③ *is it outside what the models were trained on* (novelty; advice is withheld, not extrapolated); ④ a **feed-quality class derived from the estimate** (e.g. light/easy-cracking · intermediate · heavy/high-carbon), easier for operators to read. **(b) Crude family is context only** — one line ("from the Urals-type slate"), never the headline and never a probability bar. **(c) Every downstream decision states the feed it used** — D3 riser outlet temperature, D6 preheat, D5 air / flue-gas O₂, D1 cut points, D7 overhead — as *"For this feed (API ≈ x) …"*, and is **held while the feed is changing or novel**. **(d) Catalyst flow / catalyst-to-oil is a result of the heat balance, never advised:** the slide valve moves catalyst to hold riser outlet temperature; levers are ROT, preheat and air. C/O is shown as a consequence on U2/U3. Stays on the never-advise list (with feed rate, catalyst addition, cooling water). **(e) Status honesty:** until R-1c is built the feed panel stays labelled 🟠 Scripted outcome; the 12-min scripted detection lag and the 0.4 novelty cap are removed in R-1c. |

---

## 0. 2026-10-02 agreement (supersedes earlier UI sections where they conflict)

Owner's words recovered from the crashed session and confirmed by Voice Note 11; see [verbatim.md](verbatim.md) Part 9.5. **This section overrides P1 below** (four dashboards) and the older scope numbering in S1 (`D1` hydrotreater · `D2` cut points · `D3` trust), which is a different list from the decision inventory D1–D9 used in the cockpit; that old numbering was **renamed to OD1–OD3 on 2 Oct** (features.md, BDD.md); S1 keeps its original wording for history. The data facts D1–D9 in §2 are also a separate list.

| # | Decision | Owner's words · time |
|---|---|---|
| U1 | **Decision first.** Every screen opens on a decision; the data that backs it sits underneath. | "The screen enables decisions and data is shown to back up those decisions." · 09:48 |
| U2 | **No owner / role views** (no operator / shift-super / plant-manager screens or labels). | "Yes to the design reorganisation. Owner roles — not now." · 09:53 |
| U3 | **No value figures on screens.** Each decision names its plant problem (P1–P4) and IOCL use case in one quiet line, no badges. IOCL's own benefit figures stay only in `refinery_optimisation_use_cases.md`, attributed to IOCL. Extends S2. | "Spell out the use case… without being tacky." · 10:16 |
| U4 | **No left bar, no admin template.** | "I seriously loathe the design… left bar…" · 10:41 |
| U5 | **Home** = top view of the refinery (the FCC's six units) → what went wrong → decisions pinned to units → how AI / ML / agents enable them (flow ①–④) → IOCL use-case band. | 10:43 |
| U6 | **Unit page** = ① Data in / out · ② What we observe · ③ Decision and lever · ④ How the move is found · footer (use cases, action history). Fractionator first, then all six units. | 10:48, 11:00–11:01, 11:20 |
| U7 | **Audit-only actions.** Accept / Hold 30 min / Decline write the audit log and the decision record (`/audit`); `control_system_write = false`; nothing reaches a control system or another person. Restates S3. | — |
| U8 | **Honesty call — multi-set-point recipe withheld by the plausibility check.** If the predicted effect exceeds ±3 MW compressor power, ±50 lb/s furnace fuel or ±1.5 % of feed on any yield, D3 is shown as "Not yet" with the reason, not as advice. | 10:36 |
| U9 | **Honesty call — LCO-yield ripple hidden.** The simulator's yield response to a cut-point move has the opposite sign to plant practice; the ripple entry shows no number and says why. | 10:36 |
| U9a | **D1 consequence no longer states an LCO-yield number.** The consequence line reads "LCO heavier than spec: PA3 saturates in ~180 min if the cut point is not pulled back". | 2 Oct, owner approved |
| U10 | **"Not yet" is a first-class answer.** D3, D5, D6, D7 stay "Not yet" until `lever_v1` (12 runs, seeds 200–211, launched 12:15 UTC 2 Oct) is in, the surrogates are refit and one recipe has been run back through the simulator to confirm the predicted gain. | Voice Note 10–11 |
| U11 | **Front end first, then back end.** | "Just build the front end, then we fix the back end." · 11:34 |

**Decision inventory (cockpit):** D1 cut point now or wait (`SP_LCO_T98`, `SP_HN_T98`) · D2 trust the estimate · D3 coordinated recipe (`SP_T_riser_ROT_F`, `MV_PA1..4`) · D4 which crude · D5 regenerator air (`Fair` via `SP_T_reg_F`) · D6 furnace preheat (`SP_T_preheat_F`) · D7 gas plant / stabiliser (`MV_reflux_ratio`, `MV_cw_flow`, `SP_T_overhead`) · D8 what first · D9 extra lab sample. Live: D1, D2, D4, D8, D9. Not yet: D3, D5, D6, D7.

**Problems:** P1 quality known only every 8 h · P2 crude changes every 12–48 h · P3 a move in one unit shows up hours later in another · P4 an AI that always answers is dangerous.

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
| P5 | **2026-10-03 — Opening page first.** `/platform` ("Overview") leads: six layers, one card per IOCL use case → agent → decision → status, person-in-the-loop band, MeitY band. `/` redirects there. |
| P6 | **2026-10-03 — Person in the loop, three levels.** Advise (this build: accept / hold / decline, recorded only, nothing written to the DCS) → Assist (only if IOCL asks) → Act within an envelope (never in this pitch). |
| P7 | **2026-10-03 — Honest claims.** Say "modular by design; deployed as one service for this demo"; "designed for MeitY", never "certified"; "simulated data only"; demo lake is in `us-central1`, production would be `asia-south1/2`; the edge gateway is a design. |
| P8 | **2026-10-03 — Lever honesty.** D6 text claims catalyst-to-oil only. D7 has no simulator basis for its gain (cooling water is an open-loop input) and stays scripted and labelled pending the owner's call. D5 stays scripted unless the owner re-expresses it as the regenerator-temperature set point. |
| P9 | **2026-10-03 — Prove, don't just predict.** Every advised move is shown going round predict → decide → measure → learn, each stage marked Built / Scripted / Shown / Pilot. Scripted parts stay (owner 04:24: the data has too few scenarios), always labelled. The answer to "will it maximise yield?" is a step-test pilot on IOCL's plant, not a claim. The crude name in the demo follows the lab assay (labelled); the live classifier (8 of 15 held-out switches) is not shown as the source. |
| P10 | **2026-10-03 07:33 — Owner: "go ahead with your recommendation for now".** D5 and D7 stay scripted (labelled). D6 decided after the new lever runs. "Overview" (`/platform`) is the first demo screen. |
| P11 | **2026-10-03 18:11 — Owner: "yes" — D6 gain measured, chance scripted.** Gap fit on 80 lever runs (52 preheat moves): outlet 1.007 °F per °F (held-out R² 1.0), catalyst circulation −109 per °F (every move, held-out R² 0.95), reproduced on seeds 252–287 alone. `scripted.py` D6 carries `gain_source: "measured"` + evidence; the decision stays `scripted: True` because σ and gate values are a fixed rule. UI: Predict chip "Measured gain · chance scripted"; lever tag "gain measured · chance scripted". D5 and D7 stay scripted (refit confirms: D5 rarely settles, D7 gain ≈ 0). |
| P12 | **2026-10-03 18:16 — Owner: "yes" — accuracy quoted on unpinned truth.** The simulator's T98 sticks at its calculation ceiling (LCO 770.364 °F, HN 644.767 °F). Training never used those minutes (label clip); held-out scoring did. Quoted figures now exclude them: LCO MAE 7.5 °F / RMSE 17.1 / 90 % coverage 79 %; HN 13.2 / 24.5 / 59 %. All-minute figures kept as a footnote. Live model unchanged; `training.pinned_truth` flag (default off) reproduces the scoring. |
| P13 | **2026-10-03 18:22–18:51 — Owner: "deploy on cloud run"; "give access to admin account but also give access to google employees"; "also do scale to 0".** One Cloud Run service `fcc-cockpit` (us-central1, project fcc-soft-sensor): nginx → API + web in one container ("modular by design; deployed as one service for this demo"). Sign-in through IAP for `admin@amandeepsinghs.altostrat.com` and `domain:google.com`; no public access (org policy forbids it anyway). min-instances 0 / max 1: first visit after idle waits ~1–2 min — open the URL a few minutes before the pitch, or set min-instances 1 that morning. Service account `fcc-cockpit-run` (BigQuery read + jobs, Vertex AI user, GCS read). The decision record starts from the published seed and resets on every redeploy. |
| P14 | **2026-10-03 19:06–19:12 — Owner: "what is the point of putting data in BigQuery if we are not using it? … it will fetch nothing from GCS? … needs no SOPs or text data?" → lake-only serving.** The image holds code only (upload 244 MB → 4 MB). Runs: list from `fcc_silver.run_registry`, rows from `fcc_silver.telemetry_minute` (`FCC_RUN_INDEX=bigquery`). Models, response-gain engines, held-out evaluation and scored runs: published to `gs://fcc-soft-sensor-sim-data/models/serving/<release>/` (`deploy/publish_release.sh`, checksum manifest `RELEASE.json`) and pulled at start-up (`deploy/hydrate.py`); serving never refits (`FCC_FREEZE_ENGINES=1`) — fitting is offline, then published. Documents: pulled from `gs://…/knowledge/`; search by BigQuery `VECTOR_SEARCH` over `fcc_gold.knowledge_chunks` (`FCC_KNOWLEDGE_BACKEND=bigquery`), closing the gap named in `data_and_analytics_flow.md` §8. Local development keeps the file-based defaults. Checked: the lake-only API returns the identical demo decisions (fingerprint `293ce76a…`). |

## 6. Ways of Working

| # | Decision |
|---|---|
| W1 | The Lead session owns the repo, and delegates to sub-agents (Flash for mechanical tasks, larger models for review) per `delegation.md`. |
| W2 | No git commit or push without the user's explicit approval. |
| W3 | Nothing is deleted without approval, except scratch or generated files. |
