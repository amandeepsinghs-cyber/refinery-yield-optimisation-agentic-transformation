# Progress Log

Reverse-chronological journal of build / data-generation / infra events. Plans live in
[BUILD_PLAN_v3.md](../BUILD_PLAN_v3.md), [build.md](../build.md) and [checklist.md](../checklist.md);
this file records what actually happened and the state things were left in.

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
