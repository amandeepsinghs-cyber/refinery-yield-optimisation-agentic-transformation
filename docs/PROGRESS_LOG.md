# Progress Log

Reverse-chronological journal of build / data-generation / infra events. Plans live in
[BUILD_PLAN_v3.md](../BUILD_PLAN_v3.md), [build.md](../build.md) and [checklist.md](../checklist.md);
this file records what actually happened and the state things were left in.

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
