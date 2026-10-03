"""Pinned simulator truth: T98 values stuck at the simulator's calculation ceiling (2026-10-03 scan).

In full_v1 the Octave T98 calculation saturates: LCO_T98_F sits at exactly 770.364 °F (its global maximum) in
11,867 of 59,420 valid rows (20 %, 45 of 54 runs) and HN_T98_F at exactly 644.767 °F in 3,943 rows (25 runs), while
the tray temperatures, riser temperature and flows keep moving. Those minutes are not process behaviour, so
`validity.valid_until` (a range check, 650–820 / 450–680 °F) does not cut them, but they are not usable as labels or
as evaluation truth either.

Detection rule (chosen and documented): a target value is "pinned" when it equals the configured ceiling for that
target within `tol` (default 1e-3 °F, i.e. the CSV's 3-decimal rounding). A pure "≥ 5 identical consecutive values"
rule was rejected: in full_v1 it also flags ~840 legitimate rows where LCO T98 holds near 755.6 °F under the
cut-point controller (e.g. random_s152, random_s144), which are real, on-spec behaviour.

Config (`training.pinned_truth`, default OFF so the live behaviour is unchanged):
    pinned_truth:
      enabled: false
      targets: [LCO_T98_F]                       # which targets are masked when enabled
      ceilings: {LCO_T98_F: 770.364, HN_T98_F: 644.767}
      tol: 0.001
Env override: FCC_MASK_PINNED_TRUTH = 0 | 1 | comma list of targets (e.g. "LCO_T98_F,HN_T98_F"; a list implies on).
"""
from __future__ import annotations

import os

import numpy as np
import pandas as pd

DEFAULTS = {"enabled": False, "targets": ["LCO_T98_F"],
            "ceilings": {"LCO_T98_F": 770.364, "HN_T98_F": 644.767}, "tol": 1e-3}


def pinned_config(s=None, env: dict | None = None) -> dict:
    """Effective config: DEFAULTS <- settings training.pinned_truth <- env FCC_MASK_PINNED_TRUTH."""
    raw = {}
    if s is not None:
        raw = dict(((s.get("training") or {}) if hasattr(s, "get") else {}).get("pinned_truth") or {})
    c = {**DEFAULTS, **raw}
    c["ceilings"] = {**DEFAULTS["ceilings"], **(raw.get("ceilings") or {})}
    c["targets"] = list(c.get("targets") or [])
    env = os.environ if env is None else env
    v = (env.get("FCC_MASK_PINNED_TRUTH") or "").strip()
    if v:
        if v.lower() in ("0", "false", "off", "no"):
            c["enabled"] = False
        elif v.lower() in ("1", "true", "on", "yes"):
            c["enabled"] = True
        else:
            c["enabled"] = True
            c["targets"] = [t.strip() for t in v.split(",") if t.strip()]
    c["enabled"] = bool(c["enabled"])
    c["tol"] = float(c["tol"])
    return c


def active_targets(cfg: dict) -> list[str]:
    """Targets masked under this config (empty when disabled or no ceiling is known for the target)."""
    if not cfg or not cfg.get("enabled"):
        return []
    return [t for t in cfg.get("targets", []) if t in (cfg.get("ceilings") or {})]


def pinned_mask(values, ceiling: float, tol: float = 1e-3) -> np.ndarray:
    """True where the value equals the ceiling within tol. NaN / inf are never 'pinned' (they are missing already)."""
    v = np.asarray(values, dtype=float)
    return np.isfinite(v) & (np.abs(v - float(ceiling)) <= float(tol))


def target_pinned(df: pd.DataFrame, prop: str, cfg: dict) -> np.ndarray:
    """Pinned-minute mask for one target of a frame under cfg (all False when the target is not active)."""
    if prop not in active_targets(cfg) or prop not in df.columns:
        return np.zeros(len(df), bool)
    return pinned_mask(df[prop].to_numpy(dtype=float), cfg["ceilings"][prop], cfg["tol"])


def mask_truth(values, prop: str, cfg: dict) -> np.ndarray:
    """Copy of a truth array with pinned values set to NaN (unchanged when the target is not active)."""
    y = np.array(values, dtype=float, copy=True)
    if prop in active_targets(cfg):
        y[pinned_mask(y, cfg["ceilings"][prop], cfg["tol"])] = np.nan
    return y


def detect_ceiling(values, min_count: int = 1000, tol: float = 1e-3) -> float | None:
    """Diagnostic: the column maximum if it is repeated >= min_count times (a saturated calculation), else None."""
    v = np.asarray(values, dtype=float)
    v = v[np.isfinite(v)]
    if v.size == 0:
        return None
    top = float(v.max())
    return round(top, 3) if int((np.abs(v - top) <= tol).sum()) >= int(min_count) else None
