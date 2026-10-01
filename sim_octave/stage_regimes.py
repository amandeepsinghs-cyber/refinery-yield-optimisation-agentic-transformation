#!/usr/bin/env python3
"""Stage crude-regime labels and lab results for one simulator batch (SDD-DATA-12).

For every <run>.csv in sim_octave/data/<batch>/ (112-column schema with crude_id / event_code):
  _staged/regimes.csv      one row per (run_id, crude_id) segment: regime_id, api_target,
                           transition_start_min / transition_end_min (the 60-min API ramp), n_labs
  _staged/lab_results.csv  one row per lab_sample minute: LCO_T98_F, HN_T98_F, regime_id
Both files are BigQuery-loadable as-is. `_staged` is never scanned as a run by the cockpit catalog.
Safe to re-run (files are rewritten); never deletes simulator output. Partial runs are included
and flagged by n_minutes so training can filter them.

Usage:
  .venv/bin/python sim_octave/stage_regimes.py --batch full_v1
"""
from __future__ import annotations

import argparse
import pathlib
import sys

import pandas as pd

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "cockpit" / "api"))
from app.regimes import lab_rows, regime_segments  # noqa: E402

NEED = ["time_min", "dist_feed_API", "crude_id", "event_code", "lab_sample", "LCO_T98_F", "HN_T98_F"]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--batch", default="full_v1")
    ap.add_argument("--data-root", default=str(HERE / "data"))
    args = ap.parse_args()
    bdir = pathlib.Path(args.data_root) / args.batch
    out = bdir / "_staged"
    out.mkdir(exist_ok=True)
    segs, labs, skipped = [], [], []
    for f in sorted(bdir.glob("*.csv")):
        try:
            df = pd.read_csv(f, usecols=lambda c: c in NEED, engine="python", on_bad_lines="skip")
        except Exception as e:  # header-only or still being written
            skipped.append((f.name, str(e)[:60])); continue
        if any(c not in df.columns for c in NEED) or len(df) == 0:
            skipped.append((f.name, "schema/empty")); continue
        df = df.apply(pd.to_numeric, errors="coerce").dropna(subset=["time_min", "crude_id"])
        segs.append(regime_segments(df, run_id=f.stem, batch_id=args.batch))
        labs.append(lab_rows(df, run_id=f.stem))
    if not segs:
        print(f"no eligible runs in {bdir}"); return 1
    S = pd.concat(segs, ignore_index=True)
    L = pd.concat(labs, ignore_index=True)
    S.to_csv(out / "regimes.csv", index=False)
    L.to_csv(out / "lab_results.csv", index=False)
    n_sw = int((S["crude_id"] > 1).sum())
    print(f"{args.batch}: {S['run_id'].nunique()} runs, {len(S)} segments, {n_sw} crude switches, {len(L)} labs")
    print("regime counts (segments):", S["regime_id"].value_counts().sort_index().to_dict())
    print("post-switch regime counts:", S.loc[S["crude_id"] > 1, "regime_id"].value_counts().sort_index().to_dict())
    print(f"-> {out / 'regimes.csv'}\n-> {out / 'lab_results.csv'}")
    if skipped:
        print("skipped:", skipped)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
