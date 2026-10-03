# Progress Log

Reverse-chronological journal of build / data-generation / infra events. Plans live in
[BUILD_PLAN_v3.md](../BUILD_PLAN_v3.md), [build.md](../build.md) and [checklist.md](../checklist.md);
this file records what actually happened and the state things were left in.

---

## 2026-10-02 12:25 — Decision-first cockpit agreed and built; session crash at 11:36 (no work lost); `lever_v1` launched; docs aligned

**Finding first:** the owner's agreement of 09:48–11:34 UTC (decision first, data underneath; home = top view of the refinery → what went wrong → decisions → how AI / ML / agents enable them → IOCL use cases; unit page = four steps) is built for all six units and committed. The session that built it crashed at 11:36. No work was lost: `994380a`, `1edeb3e` and `beee022` were committed before the crash, and `112aa48` (11:44) and `11876cc` (11:57) were committed after it. Five agreed front-end items are still open, and decisions D3, D5–D7 stay "Not yet" until the lever batch is in and the surrogates are refit.

### What was built (commits, 2 Oct)
- `994380a` 11:02 — decision API (`engines/decisions.py`, `routers/decisions.py`, D1–D9 with P1–P4 and IOCL use case, audit-only actions) + refinery home redesign (`PlantCanvas`, `UnitFlow`, `DecisionQueue`, `HomeStory`).
- `1edeb3e` 11:02 — lever scenario in `scenario.m` (events 7–12), `run_lever_batch.sh`, surrogate `EVENT_INPUT` map, lakehouse loader.
- `beee022` 11:21 — four-step unit page (`UnitStory.tsx`) + home polish.
- `112aa48` 11:44 — process drawings for all six units (`UnitDrawings.tsx`), suspect-value flags, `/audit` restyled as the Decision record.
- `11876cc` 11:57 — plain-words copy (why-list under the decision, engineer's note tucked away, checks without data shown as skipped).

### The crash (11:36)
- **Cause:** a full-page screenshot of 1600 × 2600 px was attached to the conversation; 2600 px is over the 2576 px limit for conversations carrying many images, and the session stopped.
- **Impact:** none on code or data; the owner had to re-state the agreement (Voice Note 11, 12:02). The agreement was recovered word for word from the crashed session's log.
- **Fix:** the screenshot script is now capped at 2400 px on the long side.

### Data
- `lever_v1` launched 12:15 UTC: 12 runs, seeds 200–211, `sim_octave/data/lever_v1/lever_s200…s211.csv`. Adds designed moves of preheat, regenerator T (air), PA2, reflux, cooling water and overhead T.
- **Gap found while updating docs:** the surrogate fit (`engines/surrogates.py → _step_samples`) only reads `full_v1` runs named `random_sNNN`, so it will skip `lever_sNNN` runs as written. It needs a small change (include `lever_v1`, train / hold-out split, staged regimes) and a `SURROGATE_VERSION` bump before the refit.

### Docs (uncommitted)
- `verbatim.md` Part 9.5 (add-only): corrects Part 9's invented tags (`MV_cat_oil_ratio`, `SP_Fair_kNm3h`, `MV_PA_duty_MMBtu`, `SP_stab_reflux_ratio`, `SP_column_P_delta`, `SP_excess_O2_pct`), numbers (ROT really ≈ 966–969 °F, allowed 955–985; preheat 616 °F), unit train and dollar figures; real lever → decision table.
- 2026-10-02 sections added to `build.md`, `features.md` (Epic K), `BDD.md` (BDD-31..34), `checklist.md` (Phase 22), `SDD.md`, `BUILD_PLAN_v3.md`, `docs/L0_BUILD_PLAN.md`, `demoflow.md`, `DECISIONS.md`, `cockpit/API_CONTRACT_v3.md` (§9 decisions API).

### Next
- [ ] Front end (in progress): ② estimate over time with lab points · ③ earlier decisions on this unit · ④ binding limits and, for "Not yet", the exact missing data · ① full tag list · footer action history.
- [ ] Teach the surrogate fit to read `lever_v1`; refit when the batch finishes; feed one recipe back through Octave to confirm the predicted gain; then D3, D5–D7 may show target values.
- [ ] Owner to approve committing the doc updates.

---

## 2026-10-02 04:45 — UI v2 "instrument, not dashboard" (Voice Note 6) + Gemini can now describe the screen; Playwright 20 / 20

**Finding first:** the owner's Voice Note 6 asked for the L0 to be simplified to *units + in / out of envelope* with the curves one hover away, and for Gemini to be able to "explain what is going on on the screen in full detail". Both are in. The home is now the Pyramid top-to-bottom — one-sentence headline (n of 6 in envelope · worst deviation since when · k recommendations), crude line, six flat tiles in process order (hero numeral, Δ vs plan, 1 px trend), shift timeline, trust footer — with a right-hand **detail pane** that shows the plant overview by default and swaps to a unit's fan curve, N(μ,σ), since-why lines and recommendation on hover / focus (📌 to pin). Colour is spent only on abnormality (ISA-101): pills and left stripes are gone everywhere, status is a dot + word, normal traces are neutral grey-blue, WATCH / ACT traces coloured. Demo controls (run, register, guide) moved into a collapsed "Scenario" tray. SDD-L0-V2-01..05, BDD-29 (question tree) and BDD-30 (screen-aware Gemini).

**Why Gemini could not see the screen:** it only ever received the server-side *scope snapshot* (regime, statuses, four attention lines) — the state, not what was rendered. Fix: every region registers a compact digest of what it shows (`lib/screenPart.ts → useScreenPart`, `store.screenDigest`: `train.U#`, `pane`, `l1` with trace values at the cursor, `l1.target_distribution`); `usePageContext` ships it as `screen.visible` + `focus_unit` + `theme`; `chat.py` embeds it as an ON-SCREEN RIGHT NOW block (≤ 7 000 chars) and the first suggestion is "Explain what is going on on this screen…"; `live.py` accepts a `context` message after `ready` (sent once, then debounced 1.5 s on change) and injects the same block mid-session. SDD-GEM-05. Verified with a realistic L0 digest: the reply walks headline → crude → U1…U6 values → pane (curve legend, μ/σ/P, since-why, both recommendations) → footer.

**Verification:** `tsc --noEmit` 0 · eslint 0 errors in touched files (25 pre-existing: `RefineryTwinSchematic`, `L1Workbench`, `OptimisationCard`, legacy `components/views/*`) · `make web-e2e` **20 / 20** (L0 block rewritten for v2: pyramid order, headline grammar, dot + word, stroke `rgb(159,179,200)` normal / `rgb(244,63,94)` ACT, pane default → hover → pin → focus, scenario tray, footer, both registers; one L1 test fixed to open the tray before clicking the register toggle) · CDP shots `docs/ui/L0_v2_home_dark.png`, `L0_v2_pane_dark.png`, `L0_v2_home_light.png`, `L1_v2_u4_dark.png`. Seven superseded L0 components deleted (`UnitTile`, `UnitFlowGrid`, `OpenDecisionsCard`, `NeedsAttentionRail`, `RippleCard`, `PlantStatusStrip`, `CrudeAdaptationCard`).

**Gotcha (cost 10 min):** the CDP screenshot helper must load `http://localhost:3001`, not `127.0.0.1` — Next 16's dev server refuses cross-origin dev chunks from another host, the page renders the SSR shell and never hydrates (no console error, no API calls). Already noted in the spec header; now also here.

**Carried forward:** ChartStack band alpha could drop 0.13 → ~0.08; the L1 MV panel reads flat on `random_s107` because the MVs really are held in that run — honest, not a defect. Next: lakehouse (BigQuery-only build; Bigtable / Pub/Sub / Dataflow stay production-architecture-only in `data_and_analytics_flow.md`).

---

## 2026-10-02 03:10 — Playwright finally executed (19 / 19 green) + Gemini page context knows the panels on screen

**Finding first:** the e2e suite had been ☐ since Phase 18 because `@playwright/test` could not be installed — `npm i -D` re-resolves the whole lockfile and the Airlock npm mirror 404s a transitive dependency (`JSV`). Workaround that works: run the runner from the npx cache with `NODE_PATH` pointed at it and use the system Chrome (`channel: "chrome"`), so nothing is added to `package.json` and no browser is downloaded. `make web-e2e` now does exactly that; `playwright.config.ts` added (1440 × 1000, dark, 2 workers so the Octave batch is not starved, traces/screenshots on failure under `cockpit/web/artifacts/`).

**First run (unseeded) — 16 / 19**: the three failures were all *context*, not UI: without a seeded store the page opened the newest run at its last minute (recipe WITHHELD → no Accept button, 0 open decisions). The spec now seeds the demo context (`random_s107 @ 600`, EN) per test via `addInitScript`, only when absent so the scrub / register-persistence tests keep their own state. **Second run — 18 / 19**: the remaining failure was a stale expectation (`?uc=UC-03` → `#panel-quality`); since Phase 19 UC-03's signature panel is `quality_2` (HN T98, under "more", auto-opened) — verified from the failure screenshot, assertion corrected to "exactly one highlighted panel, id `panel-quality_2`, text HN T98, in viewport". **Third run — 19 / 19 in 1.6 min** via `make web-e2e`.

**Gemini page context (Pass I leftover closed)**: `store.screenPanels {panel_ids, highlighted}` ← `L1Workbench` (visible panels in order + the `?uc=` / `?tag=` owning panel; cleared on unmount) → `usePageContext().screen.panel_ids / highlighted_panel` (L1 only) → `chat.screen_of` keeps them and `screen_block` adds "CHART PANELS ON SCREEN (top to bottom): … The operator is looking at the '<id>' panel — 'this chart' means that panel." Test `test_screen_carries_visible_panels_and_highlight_on_l1_only` (7 / 7 in `test_gemini_scope.py`).

**Verification**: `tsc` 0 · vitest 82/82 · pytest `test_gemini_scope` 7 passed · API restarted · Playwright 19/19. `.gitignore` + `playwright-results/`.

---

## 2026-10-02 02:55 — UI remediation Pass G (N(μ,σ)) + Pass I (decisions first) + Pass H (L0 systemic view)

**Finding first:** L0 is now a data-first systemic home — six unit tiles each carrying a 4-h fan sparkline (measured over ŷ ± 2σ, plan, spec) and a compact N(μ,σ) bell, process connectors between them, a lakehouse → ML → agents flow strip, a cause → effect ripple card, an Open-decisions rail with Accept / Decline, and a crude-adaptation card with the regime posterior. L1's rail is reordered decisions-first and gains a Target-distribution card. This closes verbatim Part 6 §3 (bell curves), §4 (decisions visible) and §5 (systemic thinking) in code; the Playwright run is still outstanding.

**Pass G — N(μ,σ)**
- `web/src/lib/gauss.ts` (pdf / cdf / `pOnSpec` / `mixtureMoments` / `gaussPath` / `sharedPeak`, 5 vitest cases) + `twin/shared/GaussianPdf.tsx` (pure SVG, theme palette, plan dashed gold, spec dotted rose, measured cyan marker, P(on-spec) coloured by ≥ 90 / ≥ 60 %).
- `twin/l1/TargetDistributionCard.tsx`: U4 — the four committee members + weighted mixture from `/api/distribution` with spec_max and the W90 gate; other units — ŷ ± σ at the cursor minute from the detection band (`expected: / band_lo: / band_hi:`), tolerance from the plan hline. In-chart P text hidden in compact (tile) mode; P label moved bottom-left so it does not collide with the "now" marker.

**Pass I — decisions first**
- `L1Workbench.tsx` rail: zone *Decisions* (Decision → Target distribution → Optimisation) above zone *Models* (Regime → Model evidence → Ask Gemini). SDD-L1-03 amended.
- L0 `OpenDecisionsCard.tsx`: every OPEN recommendation across the six units with unit, UC id, risk pill, gate, one-line rationale, Accept / Decline (`postTwinDecision`) and "Open workbench →" (`?uc=` deep link). `CrudeAdaptationCard.tsx` shows declared vs detected assay and the regime posterior `p_regime` (new on `/api/twin crude_slate`).
- **Not done**: Gemini page-context `panel_ids` + highlighted panel (critic finding) — left for a later pass.

**Pass H — L0 systemic view**
- API `engines/systems.py unit_spark(run_id, unit_id, time_min, kpi)` → `{tag, label, unit, source, time_min[], measured[], expected[], band_lo[], band_hi[], mu, sigma, plan, tol, spec_hi, spec_lo, breach_open}` over the last 240 min at 2-min step, reusing the cached detection series (Pass F band); `l0_fields` attaches it as `units[].spark`. Payload 217 KB, 0.7 s cold / 0.02 s cached. `/api/twin` `crude_slate.p_regime` added. Tests `test_every_unit_carries_a_live_spark_with_band_and_moments`, `test_crude_slate_posterior_sums_to_one`.
- Web: `twin/shared/Sparkline.tsx` (SVG fan, `data-testid="unit-spark"`), `twin/l0/UnitTile.tsx` (28 px KPI numeral, deviation chip, sparkline + compact bell, μ/σ, P(on-spec), counts; links `/twin/unit/{id}?tag=`), `UnitFlowGrid.tsx` (3 × 2 grid with a measured SVG overlay: hydrocarbon U1→U2→U4→U5→U6 animated dash, catalyst U2⇄U3, heat recovery U4→U1), `FlowStrip.tsx` (Historian → Bigtable → BigQuery → Regime → Committee → Optimiser → Agents → Decisions with live states), `RippleCard.tsx` (primary move + per-domain before → after bars), `L0Home.tsx` recomposed (main column: tiles → ripple → PFD behind a `<details>`; sticky rail: Open decisions → Needs attention → Crude adaptation).
- Fixes found by screenshot: legacy `.spark {76 × 22 px}` rule was squashing the fan chart (renamed `.spark-fan`); U2 → U4 connector landed in the gutter (`bc.x` → `b.x`); flow-strip stage text overlapped at 1440 (ellipsis + shorter labels); tiles in a row now equal height; state pills `nowrap`.
- L1 MV panel: per-trace "% of own window range" normalisation when scales differ > 20× **and** at least one MV genuinely moves (span > 8 × robust σ); held MVs stay raw so flat lines honestly read "held" (the first cut normalised noise into a hairball — reverted to the gated version).

**Verification**: `tsc` 0 errors · vitest 82/82 · pytest `test_twin_l0 + test_workbench + test_detect` 21 passed · API restarted on :8010 with the new payload · CDP (random_s107 @ 600): L0 dark 1440 × 1000 `plotly:0 · live:6 · greyTraces:0 · hscroll:false`, L0 light 1920 × 1080 `hscroll:false`, L1 U4 / U2 dark `plotly:5 · railCards:5 · greyTraces:0`. As-built: `docs/ui/H_L0_systemic_dark_asbuilt.png`, `H_L0_systemic_light_1920_asbuilt.png`, `G_L1_u4_target_distribution_asbuilt.png`, `I_L1_u2_decisions_first_asbuilt.png`. `e2e/twin.spec.ts` L0 scenarios rewritten for the new home (tiles, sparks, flow strip, ripple, open decisions, PFD disclosure) and L1 rail check extended — **not executed** (runner not installed).

**Observed while verifying**: `/api/health` reports `full_v1` **53 / 54 runs complete** (`random_s101` at 540 / 550 rows), `retrain_recommended: false`; Gemini probe fails with "Reauthentication is needed" — `gcloud auth application-default login` is required before the Gemini / Live demo.

---

## 2026-10-02 02:35 — UI remediation Pass E (dark register) + Pass F (band bug) — response to the owner's "2/10" review

**Finding first:** the owner rated the UI 2/10 and pointed at `verbatim.md`. All four complaints in verbatim Part 6 were true in the code and three of them were *spec-driven*: SDD-L0-02 forbade charts on L0, SDD-L0-03 mandated a light default, and the mockups were light / flat / chart-less. An independent critic subagent (`scratch/ui_critic_report.md`) reached the same four root causes. Remediation plan approved by the owner ("yes for all"): dark default, charts + model output on L0, autonomous passes E → F → G → I → H with a push per pass.

**Pass E — register**
- `web/src/lib/theme.ts`: dark tokens re-cut as a navy obsidian (`bg #0b0f17`, `card #111622`, `border #1f2738`, `text #e8ecf4`, `accent #4f8cff`); `DEFAULT_THEME = "dark"`; `THEME_BOOT_SCRIPT` defaults dark; `STATUS_DARK` (brighter green/amber/rose) + `statusColor()`; committee colours: light `bayes_ridge` grey `#64748b` → violet `#7c3aed`, dark set cyan / emerald / gold / violet. `store.ts` default `DEFAULT_THEME`; `layout.tsx` `data-theme="dark"`.
- `web/src/lib/palette.ts`: `TRACE_PALETTE_DARK` (cyan measured, emerald expected/band, gold plan, rose spec, high-chroma MVs) + `paletteFor(theme)`; `lib/l1.ts traceColor(role, key, i, explicit, theme)` picks the register (explicit light colours are not carried onto the dark canvas).
- `ChartStack.tsx`: theme threaded into every colour, strokes 2.2 / 1.8 / 1.7 px with spline smoothing, panels 230 / 190 / 165 px, legend 11.5 px, regime / change-point markers per theme.
- `globals.css`: dark block mirrors the tokens and now owns `--green/--amber/--red/--m-*` (previously a later `:root` rule overrode them); `--m-ridge` grey → violet; type scale up (L0 title 20, L1 title 22, panel titles 13.5, KPI numerals 17–26 px tabular), cards get `--shadow-card`, L1 rail 380 px and **sticky**; `.theme-seg` segmented switch.
- `AppShell.tsx`: icon button → segmented `🌙 AI Dark | ☀️ Light` (`data-testid="theme-seg"`, `#theme-toggle`).
- `OptimisationCard.tsx` / `RefineryPFD.tsx`: hard-coded hexes → `var(--m-*)` so loops and curves follow the register.
- Specs amended: SDD-L0-02 (L0 is a data-first systemic view: live curve + ŷ ± 2σ band + N(μ,σ) PDF per unit), SDD-L0-03 (dark default, segmented toggle, dark trace palette); BDD-28 "no charts" scenario → "live curves per unit", "default theme is light" → dark; `e2e/twin.spec.ts` register tests inverted and pointed at `theme-seg`.

**Pass F — band anchored to the live prediction** (`api/app/engines/surrogates.py expected_series`)
- Before: `expected = rolling(240).median(y).shift(1) + B·(X − rolling-median(X))` → a flat, lagging envelope (verbatim Part 6 §2 "looks stupid").
- After: `ŷ_t = predict_matrix(regime_t, X_t)` (dynamic surrogate at the current inputs) `+ bias_t`, where `bias_t` is a one-step-lagged EWMA of past innovations (`BIAS_HALFLIFE_MIN = 45`); `σ_t = sqrt(resid_sd_regime² + ½·EWMstd(innovation)²)`; band = `ŷ_t ± 2σ_t`. U4 still uses the committee `mean / q05 / q95`.
- New test `test_detect.py::test_band_wraps_live_trajectory_not_a_lagged_median` on `random_s144` + `random_s107` × U1/U2/U3/U5/U6: measured inside the band 86–99 %, expected carries ≥ 0.36× of the 60-min movement of the smoothed measured curve, lag-0 correlation beats lag-120 everywhere (e.g. U3 `c0 0.98 / c120 0.76`, U2 `0.74 / 0.15`).

**Verification**: `tsc` 0 errors · vitest 77/77 (theme / palette / l1 tests updated: dark default, no grey in either register, dark luminance > light) · pytest `test_detect + test_workbench + test_twin_l0 + test_engines_api + test_recipe + test_gemini_scope` 52 passed · API restarted · CDP dark shots `docs/ui/E_L0_dark_default_asbuilt.png`, `E_L1_u4_dark_default_asbuilt.png`, `F_L1_u3_band_wraps_live_asbuilt.png` (0 grey traces, no h-scroll). Playwright still not installed (runner), `/tmp/cdp-*` cleared (4 GB) with owner approval.

**Next**: Pass G (N(μ,σ) PDFs on L1 rail + L0 tiles — `lib/gauss.ts` + `twin/shared/GaussianPdf.tsx` already written), Pass I (decisions first), Pass H (L0 systemic view with sparklines, ripple plot, lakehouse → ML strip, assay panel).

---

## 2026-10-01 18:45 — Phase 19 (J8): screen-scoped Gemini verified, Hindi-first + hi-IN voice, director script on the Twin, `?uc=` signature panels

**Finding first:** most of J8 was already in the code base from Epic J (`chat.screen_of`, `scope_snapshot_for`, `suggestions` per screen × language, `get_scope_snapshot` / `get_regime` / `get_recipe` tools, `context.screen` from the route) but the checklist still showed it ☐ because it had never been verified end-to-end. `tests/test_gemini_scope.py` passes (5 → 6 with the new language test); the Copilot drawer already sent `screen` and showed a chip.

**What changed**
- `api/app/copilot/live.py`: `live_language_code(ctx)` → `SpeechConfig(language_code=hi-IN|en-IN, voice_config=…)`; previously only the voice name was set, so Hindi operators got an English session.
- `api/app/engines/workbench.py`: `SIGNATURE_PANEL` map — each use case's `panel_id` now points at its signature chart (UC-05 → `combustion`, UC-03 → `quality_2`, UC-06/07/10 → `mv`, UC-02/04/08/09 → `yield`), falling back to `quality` when the panel is absent. `L1Workbench` now prefers that `panel_id` over the broad `use_case_ids` match (which tagged every panel). CDP: `/twin/unit/unit_1_furnace?uc=UC-05` → `highlighted:["panel-combustion"]` with "more" auto-opened — BDD-28 scenario satisfied. Test `test_use_case_signature_panels_point_at_real_panels` added.
- `web/src/components/shell/DemoGuideModal.tsx`: scenes rewritten for the crude-switch story on L0 → L1 (Scene 0 hook, 1 L0 switch 07:25→10:00, 2 U4 via `?tag=LCO_T98_F`, 3 regime + evidence, 4 optimisation + Accept, 5 withhold on `random_s144`, 6 Hindi chips + `hi-IN` voice + guardrail, 7 audit + ask); each "Go to" pins `run` / `timeMin` through `store.setRun`. Page directory lists L0 / L1 first; the old dashboards are labelled "(legacy)".
- `web/src/components/copilot/CopilotLauncher.tsx`: screen chip uses `TWIN_UNITS` labels ("Fractionator · t 600", "Refinery · t 600") instead of a `unit_4_` string hack; `data-testid="screen-chip"`.
- `demoflow.md`: §1 story line, §2 cast (two levels + Audit; demo run `random_s107`, withhold run `random_s144`), §4 the 7-scene script with route · run · minute per scene; §9 marked superseded by L0/L1.

**Verification**: `tsc` 0 errors · vitest 75/75 · pytest `test_workbench + test_twin_l0 + test_gemini_scope + test_adk_agent` green · API restarted on :8010 with the engine change · CDP L0 still `plotly:0`, no console errors. Facts in the script checked against the live API: `random_s107 @ 600` recipe ISSUED (3 moves, gate PASS W90 13.7), `random_s144 @ 600` recipe WITHHELD (`spread_gate`, HN side).

**Not verified**: a real `hi-IN` Live audio session from this Cloudtop (needs the Vertex probe + mic); Playwright still not installed.

---

## 2026-10-01 18:35 — L1 Pass D: other units polished, nav retired to the Twin, L0 → L1 deep links (committed as `ef06b25`)

**What changed**
- **Per-unit yield axes** (`cockpit/web/src/lib/l1.ts → yieldAxis`, used by `ChartStack`): the Pass-C rule divided *every* "Yields / products" trace by feed, which was wrong outside U4 (U3 blower power and carbon-on-catalyst, U5 compressor power, U6 recoveries were all shown as "% feed"). Now mass flows (`prod_*`, `F_coke`, `F5_fuel`, unit `lb/min`) → % feed; recoveries / `*_pct` → %; `C_*` and `*_frac` → ×100 (wt % / %); everything else (power) → right axis in its own units, promoted to the left axis when nothing else is plotted. Verified by CDP axis titles: U3 `% feed · wt %` / `power`, U5 `power`, U6 `% feed · %`, U2 `%` / `%`.
- **Tray profile renderer** (`ChartStack → buildTrayProfile`): `tray_profile` panels now plot temperature vs tray number at the cursor minute (solid) with the window-start profile dashed; x axis "Tray (1 = top)" pinned 0.5–20.5; no time cursor / hover broadcast on this panel. Lives under "More panels ▾"; `?more=1` opens it on load.
- **Nav retirement (D3, SDD-L1-05)** (`lib/nav.ts`, `AppShell.tsx`): topbar shows one tab — Refinery Twin; rail = Refinery + U1…U6 + Audit log + Settings; brand → `/twin`. Decision / Technical / Modelling / Knowledge moved to `LEGACY_DASHBOARDS` (not in nav; routes still resolve a rail when opened from a Gemini citation or old link).
- **L0 → L1 deep link**: "Needs attention" lines link `/twin/unit/{id}?tag={tag}`; the workbench resolves the measured-vs-expected panel plotting that tag (falls back to any panel with the trace), opens "more" if needed, scrolls and highlights 6 s. `?uc=` unchanged.
- **Live voice language** (`api/app/copilot/live.py`): `SpeechConfig.language_code` = `hi-IN` for Hindi / Hinglish operators, `en-IN` otherwise (SDD-GEM-04). Unit test added to `tests/test_gemini_scope.py`.
- Playwright spec: four new scenarios (nav retired, attention deep link, `?more=1` tray/combustion, per-unit yield axes). **Still not executed** — runner not installed.

**Verification**: `tsc --noEmit` 0 errors · vitest 75/75 (10 files; +4 helper tests) · pytest `test_workbench + test_twin_l0 + test_gemini_scope` 16 passed · CDP (random_s107 @ 600, light, 1440 px): L0 `plotly:0 · tabs:[Refinery Twin] · brand:/twin · attnHrefs ?tag=…`; all six units `plotly:5 · railCards:5 · greyTraces:0 · hscroll:false · 0 console errors`; U4 `?more=1` → 8 panels incl. `tray_profile:Tray (1 = top):°F`; U1 `?more=1` → `combustion … CO ppm`. As-built: `docs/ui/L1_u3_workbench_asbuilt_light.png`, `docs/ui/L1_u4_all_panels_asbuilt_light.png`, `docs/ui/L0_nav_retired_asbuilt_light.png`.

**Known / deferred**: Playwright run (disk); tag units for `power_*` / `F5_fuel` are not in the simulator tag dictionary (`unit: '-'`) so the right axis is titled "power" without a unit — fix at the data dictionary when `full_v1` lands; `DemoGuideModal` scenes still point at legacy routes (Phase 19 director script will replace them).

---

## 2026-10-01 18:20 — L1 Pass C: U4 Unit Workbench built to the mockup; all six units render from one component (committed as `8c0fe12`)

Plan agreed with the user ([L1 build plan](../../.gemini/jetski/brain/d627c2de-d6ce-4d3a-9669-df0b312f1591/L1_build_plan.md), recommendations
accepted): 5 primary panels + "More panels ▾"; keep Plotly, restyle + synchronise; client-side what-if sweep for the optimisation curve.

### Found on the way in (both blocking, both fixed)
- The L1 scaffold crashed on any fresh browser: Next 16 delivers `params` as a Promise, so the page fetched
  `/api/unit/undefined/workbench` (422); and the API required `time_min` while the store starts `null`.
  `page.tsx` now awaits `params`; `GET /api/unit/{id}/workbench` accepts no `time_min` (→ default run's last minute,
  echoes `run_id`) and the client persists what the API chose, so L0 and L1 agree (contract §5 updated; route test added).
- `yaxis2: undefined` in a Plotly layout silently blanks the chart — four of five panels were empty until the key was made
  conditional. `Chart.tsx` now wires `onError` to `console.error` so this class of failure is visible.

### Built — `cockpit/web/src/components/twin/l1/`
| File | Role |
|---|---|
| `L1Header.tsx` | breadcrumb → `/twin`, title `<unit> · Unit Workbench — <property> · <regime>`, status pill, clock, next-lab, shared `LangToggle` |
| `UnitIOStrip.tsx` | IN feeds/disturbances → unit → OUT products, headline KPI with plan ± tol (MVs stay in the chart) |
| `ChartStack.tsx` (rewrite) | data-driven panels on one shared x-range; solid cursor at `store.timeMin` + dotted hover guide broadcast to every panel; click sets `timeMin`; ±3σ as dashed limits, CUSUM on y2, yields → % feed when feed flow present, change-point markers (labels thinned), §8 palette via `traceColor`, `fixedrange` so panels never de-align |
| `AnalysisStrip.tsx` | residual / σ / CUSUM / breach, root-cause ranking, briefing in the store language |
| `EventRibbon.tsx` | chronological chips; click → cursor |
| `RegimeCard.tsx` | p(regime) bars, declared-vs-detected, detection delay, novelty, physics weight / bias reset (E1 + E2) |
| `ModelEvidenceCard.tsx` | member table with regime-specific weight column, PINN checks, spread-gate banner with per-property committee gate, surrogate provenance |
| `OptimisationCard.tsx` | recipe moves as what-if sliders (debounced `POST /api/recipe/whatif`), P(on-spec) · Δ-yield curve over the primary SP's limit box (≤ 11 points, parallel); works in WITHHELD state via the open decision's SP, labelled "exploration only" |
| `DecisionCard.tsx` | action line, rationale, systems ripple, citations, Accept / Decline / Note → `POST /api/twin/decision` → shows audit # |
| `AskGeminiCard.tsx` | input + mic → copilot (screen-scoped by `usePageContext`), Hindi-first suggestion chips, live-tag + doc chips |
| `L1Workbench.tsx` (rewrite) | composes the above; labelled Data / Analysis / Models / Decisions zones (SDD-L1-07); `?uc=` resolves the owning panel via `use_case_ids` (old code looked up a non-existent id), scrolls + highlights |
| `lib/l1.ts` + `tests/l1.test.ts` | pure helpers (panel selection, palette, sweep points, primary move, decision line, strip filter) — 13 tests |
| deleted | `AnalysisZone.tsx`, `ModelsZone.tsx`, `RecipeCard.tsx` |

Also: `twin/LangToggle.tsx` shared by L0 and L1; `twinTypes.ts` typed to the real payload (no more `any` for regime / decisions / citations); `.l1-*` CSS.

### Verification
| Check | Result |
|---|---|
| `npx tsc --noEmit` | 0 errors |
| `vitest` | 71 / 71 (10 files) |
| `pytest tests/test_workbench.py tests/test_twin_l0.py` | 10 passed |
| CDP, fresh browser, `/twin/unit/unit_4_fractionator` | no 422; API default run `random_s144` @ 1260 (= L0's Shift B · 21:00) |
| CDP, all 6 units (`random_s144` @ 600) | each: `plotly:5 · railCards:5 · greyTraces:0 · hscroll:false`, cursor shape in every panel |
| CDP, U4 `random_s107` @ 600 (recipe ISSUED) | 3 sliders, spread gate PASS, Decision GREEN with Accept / Decline; light + dark |
| CDP, `?uc=UC-03` + Hinglish | briefing renders in Hinglish; owning panel resolved |
| Playwright `e2e/twin.spec.ts` | 7 L1 scenarios written (one cursor per panel, rail cards, `?uc=`, language, evidence/decision, sober register, all units) — **not run**, runner still not installed |

As-built: `docs/ui/L1_u4_workbench_asbuilt_{light,dark}.png` (U4, `random_s107` @ 600) vs `design/L1_fcc_fractionator_workbench_mockup.jpg`.

### Left open (Pass D)
- Per-unit visual review of U1 / U2 / U3 / U5 / U6; dedicated renderers for `tray_profile` (x = tray) and `combustion` (CO on y2) if wanted.
- Retire old dashboards from the nav, brand link → `/twin` (**D3**).
- `?uc=` deep links from the L0 attention rail; the audit log view of accepted decisions.
- Playwright install + green run after the Cloudtop resize.
- Known data caveat: `random_s144` is still being simulated — NaN tails are tolerated (null gaps) but numbers will move.

---

## 2026-10-01 17:50 — L0 Pass B: `/twin` Refinery Digital Twin home built to the mockup

### Done — `cockpit/web/src/components/twin/l0/`
- `RefineryPFD.tsx` — SVG (viewBox 1180×540) hybrid plant map per **D1**: 6 live blocks keyed by `unit_id`
  (`data-unit`, `data-state`, class `.pfd-live`; keyboard-focusable; hover "Open workbench →"; click → `/twin/unit/[id]`),
  9 muted `.pfd-boundary` blocks (CDU/VDU, HDT, Alky, …), three loops drawn as dashed lines — hydrocarbon `#1d4ed8`,
  catalyst `#ea580c`, heat `#047857`. State captions: OK → "IN ENVELOPE", WATCH → "DRIFT", ACT → "ACT NOW".
- `L0Header.tsx` — "Refinery Digital Twin · Shift X · HH:MM", EN / Hinglish / हिंदी segmented toggle
  (`data-testid="lang-toggle"`, persisted as `lang` in the zustand store; `usePageContext()` now forwards it to the copilot),
  Gemini Live button → copilot voice tab.
- `PlantStatusStrip.tsx` (`plant-strip`, `crude-banner`), `NeedsAttentionRail.tsx` (`.l0-attn-item` with horizon,
  consequence and loop chip), `ShiftTimeline.tsx` (12-h SVG; `role="slider"` + `aria-valuenow`; drag and ←/→ scrub,
  Shift = 60 min, via `setTimeMin`; ▶ replay 1 sim-min / 400 ms).
- `L0Home.tsx` rewritten to compose the above (`data-testid="l0-root"`); `PFDSvg.tsx` and `TimelineStrip.tsx` deleted.
- `layout.tsx` default theme → light (dark persisted under `fcc-theme`); `.l0-*` / `.pfd-*` styles appended to `globals.css`.
- `e2e/twin.spec.ts` rewritten with real BDD-28 assertions (zero Plotly on L0, 6 live units, attention rail ≤ 5,
  slider keyboard scrub, theme persistence, `/` redirect).
- As-built screenshots: `docs/ui/L0_refinery_twin_asbuilt_{light,dark}.png` (compare with `design/L0_refinery_twin_mockup.jpg`).

### Verification
| Check | Result |
|---|---|
| `npx tsc --noEmit` | 0 errors |
| `vitest` | 58 / 58 |
| CDP screenshot metrics on `http://localhost:3001/twin` | `plotly:0 · live:6 · attn:5 · hscroll:false · theme=light default, dark via localStorage OK` |
| Playwright `e2e/twin.spec.ts` | **not run** — `@playwright/test` is not installed (≈300 MB; disk at 90 %). Spec kept behind `// @ts-nocheck`. |

Screenshot method (reusable): `node --experimental-websocket shot.mjs <url> <out.png> [waitMs] [w] [h] [light|dark]`
against the Next dev server on :3001 (API on :8010). Use `localhost`, not `127.0.0.1` — Next dev blocks cross-origin
dev resources and the page never hydrates.

### Left open
- Playwright install + green run (after Cloudtop resize).
- Old dashboards remain in the nav and the topbar brand still links to `/decision/overview` — retire after L1 (**D3**).
- Hinglish / हिंदी copy is a toggle only; the strings are still English until Phase 19.

### Next — L1 Unit Workbench (U4 first)
Per `BUILD_PLAN_v3` Step 18 / `design/L1_fcc_fractionator_workbench_mockup.jpg` / `API_CONTRACT_v3 §5`: I/O strip, aligned
chart stack on one cursor, event ribbon, right rail (regime & adaptation, recipe card, evidence, decision, Gemini); then
U1 / U3 / U6 / U5 / U2 and the `?uc=` entry.

---

## 2026-10-01 17:30 — L0 Pass A: `/api/twin` now honours the L0 contract; Systems Agent consequence rules

Decisions taken with the user ([L0 build plan](L0_BUILD_PLAN.md)):
**D1** hybrid whole-refinery PFD with the 6 simulator units live (U1–U4 inside the FCC/RFCC complex, U5 = gas plant,
U6 = stabiliser) and other blocks "boundary data only" · **D2** Systems Agent consequence rules built now ·
**D3** `/` → `/twin` redirect only; old dashboards retired after L1.

### Done
- New `cockpit/api/app/engines/systems.py`: 19-rule consequence table keyed `(unit, tag, direction)` over the catalyst /
  heat / hydrocarbon loops, horizon 180 → 45 min as the residual goes 3σ → 7σ; `kpi_vs_plan` (plan = set point where one
  exists else regime-surrogate / committee expected; `tol` from new `config.yaml → plan_tolerances`; OK ≤ tol, WATCH ≤ 2·tol,
  else ACT); `flags` = distinct warn/alarm tags; `decisions_open` = OPEN cards; `needs_attention` top-5 ranked and
  de-duplicated; timeline labels ≤ 60 chars; `plant` strip (shift, clock, mass closure, counts, top flag).
- `twin.py` placeholder block removed (`"Action required"`, `tol=3`, `state="WATCH"`, `flags == events_open` are gone).
- `API_CONTRACT_v3.md` §6 rewritten to the implemented payload; `twinTypes.ts` extended (`TwinKpiVsPlan`, `TwinAttention`,
  `TwinTimelineItem`, `TwinPlantStrip`).
- Tests: new `tests/test_twin_l0.py` (5 tests incl. placeholder/financial scan and rule coverage for every primary tag in
  both directions). `test_detect` band check made NaN-aware because `random_s144` is still being simulated (CSV grows past
  the committee estimates).
- `checklist.md` Phases 15–17 ticked where code + tests exist; held-out acceptance numbers deferred to post-`full_v1`.

### Next — Pass B (frontend)
`L0Header` (shift · clock · run · EN/Hinglish/हिंदी · Gemini Live), `PlantStatusStrip`, `RefineryPFD` (hybrid per D1),
`NeedsAttentionRail`, `ShiftTimeline` (draggable cursor, ▶), `/` redirect, `layout.tsx` light default, real Playwright asserts.

---

## 2026-10-01 17:00 — Epic J engine hardening committed; `full_v1` still generating; disk / resize plan

### Code
- Committed the Steps 15–16 engine work (E1 regime, E3 detection, E4 recipe + surrogates, unit workbench
  aggregate) plus the `config.yaml` `recipe:` / `iow:` rework (per-unit movable set points, step limits,
  `{rel: x}` windows, `no_gain` gate reason) and the matching contract note in `API_CONTRACT_v3.md`.
- Fix found while verifying: E3 briefings formatted the raw residual while the event payload stored a 2-dp
  rounded value, so the two could disagree at the 0.05 boundary (`-0.549` → text `-0.5`, payload `-0.55` →
  `-0.6`). `detect.py` now rounds once and feeds the same numbers to both.
- Verification: `cockpit/api` engine suites (`test_detect`, `test_recipe`, `test_regime_engine`,
  `test_workbench`, `test_engines_api`) — see result line at the bottom of this entry.

### Data generation — `sim_octave/data/full_v1` (54 × 1600-min `random` runs)
| Metric | Value |
|---|---|
| Octave processes running | **49** (~99 % CPU each, 64 cores, load ≈ 66) |
| Runs complete (1600 rows) | **0 / 54** |
| Progress of original batch (launched 2026-09-30) | ≈ 1200–1380 / 1600 min |
| Progress of re-launched seeds (03:10 / 05:08 today) | ≈ 480–960 / 1600 min |
| Measured rate | ≈ 80 s per simulated minute per core |
| ETA — original batch | ≈ 9 h (≈ 2026-10-02 02:00) |
| ETA — re-launched seeds | ≈ 22 h (≈ 2026-10-02 15:00) |
| **Dead runs (no process, partial CSV)** | **s102, s127, s128, s150 (901 rows), s149 (1081 rows)** → must be re-run |

Guard rails still in force: `run_campaign_batch.sh` refuses to start while any `run_sim(` process exists;
do **not** launch `crude_campaign` until `full_v1` finishes. Generated data is gitignored and lives only
on this Cloudtop (`sim_octave/data/`, `cockpit/api/artifacts/`).

### Disk
- Root volume 85 G; was 90 % used with 8.2 G free — not full. Sim output is tiny (≈ 1.2 MB per run,
  58 MB total); the pressure is from regenerable tooling (`cockpit/api/.venv` 1.4 G, `cockpit/web/.next`
  1.2 G, `node_modules` 0.6 G), `~/.gemini` 4.1 G, `~/.config` 4.9 G, `~/.cache/google-chrome` 1.7 G,
  `/var/log/journal` 4.0 G, and other project folders.
- Cleaned without sudo (≈ 1.1 G freed → 9.3 G free): stale `/tmp/sar.*` dirs from a dead PID (1.5 G
  logical) and rotated `*.log.BINARY_INFO.*` / `cli.*.log.*` files older than 2 days in
  `/usr/local/google/tmp`.
- Still available when convenient: `~/.cache/google-chrome` (close Chrome first), `sudo apt clean`,
  `sudo journalctl --vacuum-size=500M` (≈ 3.5 G), `Downloads` / `tar` / `archive` review.

### Cloudtop resize — **deferred on purpose**
A resize (go/mytech → Cloudtop → Resize → same machine type, larger disk) **reboots the VM**, which would
kill all 49 Octave runs with no checkpoint/resume. Sequence agreed:
1. Let `full_v1` finish (≈ 22 h worst case).
2. Re-run the 5 dead seeds (102, 127, 128, 149, 150).
3. Then resize.

### Next steps
- [ ] After `full_v1` completes: re-run s102/s127/s128/s149/s150, then `sim_octave/stage_regimes.py --batch full_v1`.
- [ ] Resize Cloudtop disk (post-sim).
- [ ] Resume BUILD_PLAN_v3 Step 16 remainder (`adapt.py`, `train_surrogates.py` model cards, `eval_recipe` replay) and Step 17.

## 2026-10-02 16:05 — cockpit reads from BigQuery

- Lakehouse top-up: `load_lakehouse.py --batch full_v1 --skip-audit --skip-knowledge --skip-models`, 1,029 s. 54 runs in `fcc_silver` (44 complete, 10 still simulating). Decision record in BigQuery left as it was (167 archived actions).
- API: new `app/data/bq_source.py`; `Catalog.load_true()` reads lake runs from `fcc_silver.telemetry_minute`; detect / adapt / regime read the lab schedule and crude segments from `fcc_bronze`. Parallel warm-up on start (54 runs into `artifacts/bq_cache`). CSV fallback if BigQuery fails, shown on the home page.
- Parity: random_s107 from BigQuery vs CSV, 1,600 rows × 112 columns, max difference 0.0, no NaN mismatches.
- New dependency: `google-cloud-bigquery==3.46.1` (pinned in `requirements.txt`).
- Tests: 289 back-end pass (3 new in `tests/test_bq_source.py`, offline), 82 front-end pass.
- Not changed: models (same rows), scripted outcomes, the lever batch (still CSV; not in the lake, not needed for the demo).

## 2026-10-02 16:15 — demo click-through (scenes A–J)

- All scenes on BigQuery data: A–G and I–J OK. Scene H (s144) fixed: the D1 consequence matched to the move direction (raise → product giveaway text), the S2 check named “GPR model outside its range” when it fails with its value inside the limit, “one is amber, so the move is cut to half size” in the summary, and the stray `rcp_test_contract` agent event archived to `agent_events_archive` (backup `artifacts/audit_backup_20261002_1612.db`).
- 286 back-end tests pass.


## 2026-10-02 16:35 — plain labels, IOCL numbering, Gemini check

- Unit footer "This shift on the unit" shows plain names, not tags: e.g. "Preheat outlet outside its normal band", "Cyclone ΔT drifting (sustained)", "Cooling water drifting (sustained)". The API now adds `tag_label` to each unit event (`engines/workbench.py`); the page falls back to the unit's own label map, never the raw tag.
- Chart corner labels read "IOCL #1 · #6 · #11" (IOCL list rows) instead of internal `UC-01 · UC-03 · UC-11` (`ChartStack.tsx`, mapped through `howItWorks.ts` `USE_CASES`).
- Gemini (demoflow Scene 6) checked on s144 fractionator at 10:00, asking "why half size, what if I hold?" in English, Hinglish and Hindi. First run: answered in all three languages but contradicted the D1 card ("no move", "withheld"), because Gemini only saw the older recipe / gate snapshot. Fix: `copilot/chat.py` `decisions_block` sends the unit's decision cards (headline, why, trust, half-move flag, if-you-hold, failed checks, Not-yet reason) with every turn; voice uses the same block. Second run: all three answers match the card (+2.5 °F half move because trust AMBER; holding sends product to the heavier stream). Also removed a citation template from the language instruction that Gemini copied literally into a Hindi answer, and asked for plain control-room Hindi.
- Voice: startup probe OK (`gemini-live-2.5-flash-native-audio`, audio returned).
- Tests: 286 back-end pass, 82 front-end pass.

## 2026-10-02 17:20 — simulator breakdown cut, retrain, more lever runs (uncommitted)

- Baseline frozen: the 9 still-running `full_v1` simulations were stopped (their files kept). They were not hung: the Octave solvers (lsode / fsolve) had failed and every later minute repeated the failure (1.5–6 h per simulated hour, rows copied or impossible, e.g. LCO T98 −30,927 °F). `run_sim.m` resume restarts from the start-up state, so resuming would not continue the run.
- Compute: 40 more lever runs launched (seeds 212–251, `data/lever_v1`), 52 simulations in parallel on the 64-core machine; one core per run (the simulator is sequential in time). Lever hold-out is now an explicit range s210–s211 (`training.lever_test_seed_max`).
- Valid-range cut (`api/app/data/validity.py`, `data.validity` in config): a run is valid up to the first of ≥ 5 repeated failed-step rows, LCO/HN T98 outside 650–820 / 450–680 °F, or complex-valued output. Used by the soft-sensor training, the response models (`SURROGATE_VERSION` 7) and the crude classifier (`REGIME_FIT_VERSION` 3). 21 of 54 baseline runs are whole, 33 are cut; 72 % of baseline minutes are valid. Recorded in BigQuery: `fcc_silver.run_registry.breakdown_from_min` (backup `run_registry_backup_20261002_1708`), `fcc_gold.v_run_coverage.valid_until_min` now uses it; the loader writes it on every load.
- Crude classifier bug fixed: each crude segment labelled every minute to the end of the run, not just its own. Held-out crude switches named correctly: 15 of 15 (was 57 %).
- Soft sensors retrained (backup `artifacts/model_backup_20261002_1706`). Held-out error, same 54 runs: without the cut LCO 516 °F / HN 5,353 °F; with the cut LCO 16.6 °F / HN 36.5 °F. Yesterday's models (34 train / 11 test runs): LCO 21.3 °F / HN 29.4 °F. Remaining error is the models predicting an almost flat line while the truth swings, and LCO truth pinned at 770.36 °F for 22 % of held-out minutes (simulator ceiling).
- Open: 8 engine tests pinned to old behaviour (real multi-set-point recipe now withheld as implausible on s144; D1/D2 mix at s107 10:00); Scene 5/H honesty case now at s144 12:00 (t 720); s107 at 10:00 shows the recipe withheld.

## 2026-10-02 17:40 — demo repointed, tests moved to the new behaviour, committed

- Demo: the recipe scene (Scene 4 / rows D–G) now runs on hold-out `random_s144` at 10:00 (D1 raise LCO cut point +2.5 °F; scripted D3 recipe riser outlet +3.5 °F, LCO T98 −1.0 °F, HN T98 +1.0 °F). The honesty scene (Scene 5 / row H) runs on `random_s144` at 12:00 (D2 "Not yet" for LCO and HN, D3 "No coordinated recipe yet", D9 pull a sample; checked on screen, 5 of 8 checks pass, spread 17.3 vs 14 °F). `DemoGuideModal.tsx` (`HOLDOUT_RUN`) and `demoflow.md` updated; s107 at 10:00 no longer claims an issued recipe.
- Tests: the 8 engine tests pinned to the old behaviour now check the new one — real recipe ISSUED on hold-out `random_s147` t300 (one of the few minutes where the spread gate passes and the move is plausible; the real engine withholds every s144 minute); spread-gate withhold on s144 t720; scripted D3 on s144 t600; `implausible` accepted as a gate reason (imported from `engines/recipe.py`); D1 LCO check on s144 t600; novel-crude check on s107 t800 (s107 breaks down at minute 851).
- API restarted (Hindi wording fix live).
- Checks: 290 back-end pass (2 skipped), 82 front-end pass, tsc and eslint clean.

## 2026-10-02 17:55 — work with the lever data on hand (owner: "whatever data we have we work with that")

- Staged `lever_v1` now instead of waiting (`sim_octave/stage_regimes.py --batch lever_v1`): 11 runs with 6–8 h each (s200–s206, s208–s211); s207 (5 h) and s212–s251 (no rows yet) skipped. Backup `api/artifacts/model_backup_20261002_1752/engines`.
- Surrogates refit on API restart: `lever_runs` = 11; 64 train / 16 hold-out moves; cut-point yield fit hold-out R² LCO 0.90, HN 0.81, conversion 0.82.
- Finding: the ~50 lever moves of codes 7–12 in these runs (≈ 8–9 per lever) are almost all rejected by the fit — only 1 preheat move used. `scenario.m` spaces consecutive moves ramp + 30 min apart, while the fit needs 15 min before and 60 min after with no other move. More simulated hours add more moves with the same spacing, so waiting does not fix it. D5–D7 stay scripted (labelled) as before.
- Demo scenes unchanged (s144 10:00 recipe, s144 12:00 "Not yet", s107 10:00).

## 2026-10-02 18:35 — data secured (local, GCS, BigQuery) and overnight watch

- Local snapshot of all simulator data: `sim_octave/data/_snapshots/sim_data_20261002_1759.tar.gz` (110 CSVs, 23 MB), copied to `gs://fcc-soft-sensor-sim-data/_archive/`.
- BigQuery backup before loading: dataset `fcc-soft-sensor:fcc_backup_20261002_1800` (all 7 silver tables; row counts checked, e.g. telemetry 82,940, tag_minute 8,459,880).
- Lake top-up `full_v1` (10 partial runs, 300 more rows; 12,840 rows now = all local rows) plus model bundle to `gs://…/models/full_v1/` and `fcc_gold.model_registry`.
- First lake load of `lever_v1` (52 runs, 7,440 rows, partial; 19 min). API restarted on BigQuery with lever runs in the lake: demo decisions at s144 10:00 / 12:00 and s107 10:00 unchanged.
- New `sim_octave/monitor_runs.py`: per-run rows, last write, process alive, first broken minute, share of copied failed-solver rows; `--heal` stops runs stuck in solver failure (≥ 80 % copied rows in the last hour; valid rows kept) and relaunches runs that never wrote a row. Stopped so far: s208 (stuck from minute 315), s210 (376), s205 (418).
- Overnight: a check every 30 min (monitor + heal, GCS rsync to `_archive/lever_v1_live`), lake load every 3 h, and a final load + stage + refit + push when the last run ends.

## 2026-10-02 19:30 — Google Cloud sign-in expired (owner action in the morning)

- `gcloud` and Application Default Credentials both need re-authentication ("Reauthentication failed. cannot prompt during non-interactive execution"). Uploads to GCS / BigQuery pause until the owner runs `gcloud auth login` and `gcloud auth application-default login`.
- Nothing lost: simulations keep running and are monitored / healed every 30 min; a rolling local snapshot `sim_octave/data/_snapshots/lever_v1_live.tar.gz` is refreshed each check instead. The last GCS sync was 19:00 and the last lake load 18:28 (7,440 lever rows).
- The API keeps serving from its BigQuery cache (demo decisions return 200).
- After sign-in, catch up with one command each: the GCS rsync and `load_lakehouse.py --batch lever_v1 --skip-knowledge --skip-audit --skip-models`.

## 2026-10-03 02:49–03:15 — simulations stopped; real-world lever check (owner: "yes" to both)

- **All simulations stopped at 02:49** (owner: stop and wrap up the data). Overnight watch cancelled. Lever runs end with ~25,900 rows (~22,500 valid) and about 285 test moves (≈ 45–50 per lever setting). Runs stopped earlier as stuck in solver failure keep their valid rows.
- Data secured: lake load of `lever_v1` 02:35–02:53 (52 runs, partial; non-real cells in s203/s206/s207/s237/s247 loaded as missing); a last load and GCS rsync to `_archive/lever_v1_live` after the stop; final snapshot `sim_octave/data/_snapshots/sim_data_20261003_0256.tar.gz` (29 MB) also in `gs://fcc-soft-sensor-sim-data/_archive/`.
- `lever_v1` restaged with all 52 runs (67 segments, 15 crude switches); engine backup `api/artifacts/model_backup_20261003_0256`; API restarted (surrogates refit). Demo moments unchanged: s144 10:00 (D1 ×2, D3 recipe, D5, D7, D9 open; D6 withheld), s144 12:00 (D2 ×2 / D3 "Not yet"), s107 10:00 (D6, D1, D5, D7, D9 open).
- **Real-world lever check (owner 02:49):** the cockpit only recommends settings operators actually move on that unit.
  - Each lever row on the unit page now says it is one of the main settings operators adjust on that unit, and why (`decisions.py` `LEVER_ROLE` → `levers[].role`; `UnitStory.tsx`).
  - Line under every lever list, and `never_recommended` in `GET /api/decisions`: condenser cooling-water flow (fixed duty), feed rate (planning), catalyst addition (not in the simulator).
  - D7: cooling-water flow is the fouling symptom and a limit, never a lever. Question "Move the overhead temperature target to keep the condenser inside its cooling duty?"; goal "condenser back inside its fixed cooling duty". Cooling water drawn as "fixed duty", removed from the gas plant's lever list.
  - D6: no longer circular. Preheat is moved to set catalyst-to-oil and regenerator temperature for the crude, inside the feed-nozzle limit.
  - Labels: "LCO / HN cut-point target (via draw)", "Regenerator air (excess O₂ / afterburn)", "Feed preheat", "Riser outlet temperature".
- Checks: 290 back-end pass (2 skipped), 82 front-end pass, tsc and eslint clean. Screenshot of the gas plant ③ checked.
- 03:08 final lake load and GCS rsync done. `fcc_silver.run_registry`: `lever_v1` 52 runs / 26,580 rows (= every local row); `full_v1` 54 runs / 83,240 rows. Nothing is running any more except the API and the web server.

## 2026-10-03 03:20–03:45 — v0.3, rehearsal, pitch spine and opening page (Voice Note 12)

- **v0.3 tagged and pushed** (`4234128`): `scripts/reset_decision_record.py` (archives `audit.db`, removes human clicks, keeps `system:*` rows; run 03:26, 1 test click removed, 139 "withheld by checks" kept); D1 wording when a move takes back margin; lever header uses the lever-row label; rehearsal checklist.
- Rehearsal click-through scenes A–J: demo moments unchanged (s144 10:00, s144 12:00, s107 10:00).
- **Voice Note 12:** use-case tie-back is the most critical task. Analysis written as verbatim Part 10 (six layers; honest monolith answer — modular code, one service; use case → agent → decision → status; HITL Advise / Assist / Act; MeitY Cat A → B with honest status; recommend an opening page; four gaps).
- **Opening page `/platform`** built and made the first screen (`/` redirects; nav "Overview").
- D6 model text softened to what the fit supports (catalyst-to-oil only). API restarted 03:37.
- **Background (Lever Fit Engineer):** gap fit behind `FCC_SURROGATE_GAP_FIT=1`; usable moves per lever 0–2 → 22–30 (+4–7 hold-out). D6 gain ≈ 1.0 (matches script; conversion barely moves and the regenerator temperature is held by its controller). D5's designed move ramps the regenerator-temperature set point, not air (fit: cyclone dT −0.34 ± 0.07 °F/°F). D7: cooling water is an open-loop input in the simulator; no basis for the scripted gain. Candidate artifacts in `api/artifacts/engines_v7_candidate/`; decisions unchanged.
- Recipe check launched 03:27 (recipe + same-seed control, s144, ~50–70 s per sim-minute): ROT / conversion verdict ~15:00 UTC, T98 ~20:00 UTC.

## 2026-10-03 04:24–05:10 — "How do we know?" (owner: probing questions)

- Owner asked whether the system answers the probing questions: crude classification, ideal temperature, and how we know a setting maximises yield. Honest answer: partly. Predict and decide were built; measure-and-learn was not shown; the demo crude name is scripted (follows the assay). Owner: "yes add".
- Fact found: the live crude classifier names 8 of 15 held-out crude switches (53 %) 45 min after the switch (`regime.holdout_score()`), so the scripted crude name stays and is now labelled "scripted" on screen.
- Built: proof loop on unit step ④ (`ProofLoop.tsx`, `lib/proofEvidence.ts`); crude-switch walkthrough on step ② (scripted walkthrough, from the run's segments); Overview band "How do we know a move works?" + pilot line; `PROBING_QUESTIONS.md` (A–E, 20 questions).
- Recipe check (subagent, 04:35): both runs replay s144 exactly for the first 120 min; ~34 s per sim-minute; ROT / conversion answer ~10:30–11:30 UTC, T98 and end ~12:30–13:30 UTC.
- Checks: tsc, eslint, front-end tests; screenshots `proof_furnace.png`, `crude_story.png`, `platform_proof.png`.

## 2026-10-03 05:11–05:25 — v0.4, data in GCP, more lever data, demo script

- **Tag `v0.4`** pushed (Overview page, proof loop, crude walkthrough, probing questions).
- **GCP check:** BigQuery `fcc_silver.run_registry` = local exactly (full_v1 54 runs / 83,240 rows; lever_v1 52 runs / 26,580 rows). Uploaded to `gs://fcc-soft-sensor-sim-data`: `models/engines_live_20261003/`, `models/engines_v7_candidate_20261003/`, `_archive/audit_archive/`, `_archive/recipe_check_v1_live/`.
- **More lever data:** the simulator cannot resume a run, and each seed is deterministic (re-running repeats the same first ~510 min and breaks at the same minute). So the remaining lever data comes from **36 new runs, seeds 252–287, 1,600 min, `nice 10`** into `sim_octave/data/lever_v1` (05:15Z). That is about 57,600 sim-minutes, the same as the shortfall of the 52 partial runs. Estimated 1–1.5 days. Watch every 30 min (`monitor_runs.py --heal`), GCS rsync every 1.5 h, lake load every 3 h. The 10 broken full_v1 runs aren't re-run (same seed = same breakdown); 44 complete runs remain.
- **Fix:** the s107 heavy-naphtha D1 said "cut too light" while advising to lower the cut point (it borrowed the drift line for the opposite direction). It now reads "HN T98 could go over spec: the upper end of the estimate is above the limit". 297 tests pass.
- **`DEMO_SCRIPT.md`:** scenes 0, A–M, each with problem / how solved / action / support / result / test / say; function test checklist; fallbacks; never say.

## 2026-10-03 05:38–05:50 — STORY.md (owner: "I do not know our story and philosophy")

- New `STORY.md`. It covers:
  - the 60-second story;
  - the problem (FCC, levers, P1–P4 with real moments);
  - five principles;
  - the three questions (soft sensor / response model / search), each with how it's trained and real examples;
  - the never-seen crude;
  - predict-decide-measure-learn and the pilot;
  - where the demo data came from;
  - honest numbers;
  - the tie-back (layers, use case → problem → question → agent → decision, the s107 morning end to end);
  - a glossary;
  - a 3-hour step-by-step learning plan with 5 self-check questions.
- Facts surfaced and recorded: demo soft sensor trained on simulator truth (72 clean labs per product < 100 minimum); held-out average miss LCO 9.1 °F / HN 19.2 °F with 90 % bands covering 62 % / 56 %; cut-point gain 1 : 1 is a physics assumption (no set-point-move windows); flow responses fitted from ~3,000 min around past moves.
- Overview gains a "How it learns" band (three questions + new crude). `PROBING_QUESTIONS.md` and `DEMO_SCRIPT.md` point to `STORY.md`.

## 2026-10-03 05:48–05:58 — STORY §11 "How it runs in a real plant" (owner: why not learn on day one?)

- Philosophy reworded in §0 and §2: learn from history before day one; prove before advising; keep learning. The old "we don't claim to know the best setting on day one" wording implied it doesn't use history.
- §11 added:
  - 11.1 what history gives versus can't, and why;
  - 11.2 the on-site data path (read-only, edge gateway, India region, a person types targets);
  - 11.3 a six-phase execution plan with deliverables and gates;
  - 11.4 the live routine and approval levels;
  - 11.5 governance;
  - 11.6 benefit by phase in plant terms;
  - 11.7 failure modes;
  - 11.8 one illustrative shift.
- `PROBING_QUESTIONS.md` A6 (why not day one) and A7 (when do we benefit); `DEMO_SCRIPT.md` Scene M journey line; learning plan includes §11 and 2 more self-check questions.

## 2026-10-03 07:33 — owner decisions

- D5, D7: keep scripted (labelled). D6: decide after the new lever runs. Overview first screen: confirmed.
- Data watch 07:30: 35 of 36 new lever runs OK, 1 started to break down (heal will stop it when stuck); 32,220 lever rows (28,599 valid). Recipe check re-estimated: conversion ~12:30 UTC, T98 ~15:00–15:30 UTC.

