"""Valid range of a simulated run: where the Octave simulator's numerics broke down (2026-10-02 scan).

When the stiff solver (lsode) or the fractionator solve (fsolve) fails, `run_sim.m` restores the last good state and
repeats the previous row, then tries the next minute from the same state. Once a run gets into that state it rarely
recovers: every later minute is a copied row, an impossible value (e.g. LCO T98 of -30,927 °F), or a complex-valued row
(dropped by the CSV reader). Those minutes are not process behaviour and must not train or score the models.

A run is valid up to (not including) the first minute where either
  * `copy_run` or more consecutive rows repeat the previous row exactly on the core state tags (failed minutes), or
  * LCO / HN T98 leave their physical range or are not finite.
Fast moves that are scripted (the cut-point controller switching to auto at minutes 420 / 900 / 1380 kicks LCO T98 by
~60 °F in three minutes) are real simulator behaviour and are kept.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

STATE_TAGS = ("LCO_T98_F", "HN_T98_F", "Treg_F", "Tr_riser_F", "T_tray10_F", "prod_LCO", "C_regen_cat", "dT_cyc_reg_F")
DEFAULTS = {"copy_run": 5, "lco_range": (650.0, 820.0), "hn_range": (450.0, 680.0)}


def valid_until(df: pd.DataFrame, cfg: dict | None = None) -> int | None:
    """First invalid minute of the run (rows with time_min >= it are invalid), or None when the whole run is valid."""
    if df is None or df.empty or "time_min" not in df.columns:
        return None
    c = {**DEFAULTS, **(cfg or {})}
    t = df["time_min"].to_numpy()
    bad = np.zeros(len(df), bool)
    tags = [x for x in STATE_TAGS if x in df.columns]
    if tags:
        same = (df[tags].diff().abs().sum(axis=1, min_count=1) == 0).to_numpy().copy()
        same[0] = False
        k = int(c["copy_run"])
        if k > 0 and len(same) >= k:
            win = np.convolve(same.astype(int), np.ones(k, int), "valid") == k
            first = np.argmax(win) if win.any() else None
            if first is not None:
                bad[first] = True
    for tag, key in (("LCO_T98_F", "lco_range"), ("HN_T98_F", "hn_range")):
        if tag in df.columns:
            v = pd.to_numeric(df[tag], errors="coerce").to_numpy(float)
            lo, hi = (float(x) for x in c[key])
            bad |= ~np.isfinite(v) | (v < lo) | (v > hi)
    if not bad.any():
        return None
    return int(t[np.argmax(bad)])


def trim(df: pd.DataFrame, cut: int | None) -> pd.DataFrame:
    """Rows before the first invalid minute."""
    return df if cut is None else df[df["time_min"] < cut].reset_index(drop=True)
