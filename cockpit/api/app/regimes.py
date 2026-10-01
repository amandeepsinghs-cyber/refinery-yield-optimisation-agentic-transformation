"""Crude regime definitions (SDD-DATA-11) — the single source for staging, training and UI labels.

The simulator characterises crude by `dist_feed_API` only, so a "crude family" is an API band with a
distinct unit-response signature. Family names are illustrative labels for the demo, not assay claims.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

CRUDE_EVENT_CODE = 1          # scenario.m: event_code 1 = crude change (60-min API ramp)
DEFAULT_RAMP_MIN = 60


@dataclass(frozen=True)
class Regime:
    regime_id: str
    label: str
    api_lo: float   # inclusive
    api_hi: float   # exclusive (inclusive for the last band)
    signature: str

    @property
    def api_centre(self) -> float:
        return 0.5 * (self.api_lo + self.api_hi)


REGIMES: tuple[Regime, ...] = (
    Regime("R1", "Heavy (Basrah-Heavy-type)", 20.0, 22.5,
           "higher coke per feed, higher Treg and air demand, lower conversion, LCO T98 drifts up at fixed PA duty"),
    Regime("R2", "Medium-heavy (Urals-type)", 22.5, 24.5,
           "moderately higher coke, slightly higher tray dT in the LCO section"),
    Regime("R3", "Base / medium (Arab-Light-type)", 24.5, 26.5,
           "training baseline (simulator start value 25.0 API)"),
    Regime("R4", "Light (Bonny-Light-type)", 26.5, 29.0,
           "lower coke and Treg, more LPG and LN make, HN T98 falls below plan"),
)
REGIME_IDS = tuple(r.regime_id for r in REGIMES)
_BY_ID = {r.regime_id: r for r in REGIMES}


def regime_by_id(regime_id: str) -> Regime:
    return _BY_ID[regime_id]


def regime_for_api(api: float) -> Regime:
    """Band lookup; values outside [20, 29] clip to the nearest band."""
    if not np.isfinite(api):
        raise ValueError("api must be finite")
    if api < REGIMES[0].api_lo:
        return REGIMES[0]
    for r in REGIMES[:-1]:
        if r.api_lo <= api < r.api_hi:
            return r
    return REGIMES[-1]


def regime_ids_for_api(api: np.ndarray | pd.Series) -> np.ndarray:
    a = np.asarray(api, dtype=float)
    out = np.empty(a.shape, dtype=object)
    for i, v in enumerate(a.ravel()):
        out.ravel()[i] = regime_for_api(v).regime_id if np.isfinite(v) else None
    return out


def regime_segments(df: pd.DataFrame, run_id: str = "", batch_id: str = "") -> pd.DataFrame:
    """One row per (run, crude_id) segment with regime label and transition window (SDD-DATA-12).

    Requires columns time_min, dist_feed_API, crude_id, event_code, lab_sample (112-column schema).
    The regime of a segment is taken from the API value at the end of the segment (after the ramp).
    transition_* are the first/last minute where event_code == 1 inside the segment, else NaN.
    """
    need = ["time_min", "dist_feed_API", "crude_id", "event_code", "lab_sample"]
    missing = [c for c in need if c not in df.columns]
    if missing:
        raise ValueError(f"missing columns: {missing}")
    d = df[need].apply(pd.to_numeric, errors="coerce").dropna(subset=["time_min", "crude_id"])
    d = d.sort_values("time_min")
    rows = []
    for cid, g in d.groupby("crude_id", sort=True):
        api_end = float(g["dist_feed_API"].iloc[-1])
        reg = regime_for_api(api_end)
        ramp = g.loc[g["event_code"] == CRUDE_EVENT_CODE, "time_min"]
        if int(cid) > 1:
            # Start = first labelled ramp minute (scenario.m labels the ramp with event_code 1; a later event
            # starting inside the ramp overwrites the label, so the END is taken from the API profile itself:
            # the first minute at which the API has reached its settled value).
            t0 = float(ramp.iloc[0]) if len(ramp) else float(g["time_min"].iloc[0])
            settled = g.loc[(g["time_min"] > t0) & ((g["dist_feed_API"] - api_end).abs() < 1e-6), "time_min"]
            t1 = float(settled.iloc[0]) if len(settled) else t0 + DEFAULT_RAMP_MIN
            complete = bool(t1 - t0 >= DEFAULT_RAMP_MIN - 1 and g["time_min"].iloc[-1] > t1)
        else:
            t0 = t1 = float("nan"); complete = True
        rows.append({
            "run_id": run_id, "batch_id": batch_id, "crude_id": int(cid),
            "regime_id": reg.regime_id, "regime_label": reg.label, "api_target": round(api_end, 2),
            "t_start_min": int(g["time_min"].iloc[0]), "t_end_min": int(g["time_min"].iloc[-1]),
            "transition_start_min": t0, "transition_end_min": t1, "ramp_min": (t1 - t0) if t0 == t0 else float("nan"),
            "transition_complete": complete,
            "n_minutes": int(len(g)), "n_labs": int((g["lab_sample"] > 0).sum()),
        })
    return pd.DataFrame(rows)


def lab_rows(df: pd.DataFrame, run_id: str = "") -> pd.DataFrame:
    """Lab-sample minutes with truth T98 values and regime id (SDD-DATA-12 lab_results shape)."""
    need = ["time_min", "crude_id", "lab_sample", "LCO_T98_F", "HN_T98_F", "dist_feed_API"]
    d = df[[c for c in need if c in df.columns]].apply(pd.to_numeric, errors="coerce")
    d = d[d["lab_sample"] > 0].copy()
    d.insert(0, "run_id", run_id)
    d["regime_id"] = regime_ids_for_api(d["dist_feed_API"])
    return d[["run_id", "time_min", "crude_id", "regime_id", "LCO_T98_F", "HN_T98_F"]].reset_index(drop=True)
