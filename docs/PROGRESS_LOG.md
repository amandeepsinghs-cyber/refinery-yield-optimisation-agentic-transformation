# Progress Log

Reverse-chronological journal of build / data-generation / infra events. Plans live in
[BUILD_PLAN_v3.md](../BUILD_PLAN_v3.md), [build.md](../build.md) and [checklist.md](../checklist.md);
this file records what actually happened and the state things were left in.

---

## 2026-10-01 18:20 — L1 Pass C: U4 Unit Workbench built to the mockup; all six units render from one component (uncommitted at time of writing)

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
