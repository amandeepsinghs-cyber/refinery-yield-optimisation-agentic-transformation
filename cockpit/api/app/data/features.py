"""Feature engineering (SDD §5.4): current value + causal EWMA (tau = 10 min) of key tags + A6 lagged features
(`lags.py`: value at t - lag and mean over [t - lag, t] per target/tag, lag table identified at training);
correlation-ranked selection with collinearity pruning (|r| < max_abs_corr); standardisation."""
from __future__ import annotations

import numpy as np
import pandas as pd

from ..config import Settings
from .catalog import assert_no_excluded, feature_candidates
from .lags import apply_lags


def add_ewma(df: pd.DataFrame, s: Settings) -> pd.DataFrame:
    tau = float(s["features"]["ewma_tau_min"])
    alpha = 1.0 - np.exp(-1.0 / tau)
    out = df.copy()
    for k in s["features"]["key_tags"]:
        if k in out.columns:
            out[k + "__ewma"] = out[k].ewm(alpha=alpha, adjust=False).mean()   # causal
    return out


def add_features(df: pd.DataFrame, s: Settings, lag_table: dict | None = None) -> pd.DataFrame:
    """EWMA features + lagged features from a (persisted) lag table. Both causal and deterministic."""
    return apply_lags(add_ewma(df, s), lag_table)


def candidate_columns(df: pd.DataFrame, s: Settings) -> list[str]:
    cols = feature_candidates(list(df.columns), s)
    cols = [c for c in cols if pd.api.types.is_numeric_dtype(df[c])]
    return cols


def select_features(X: pd.DataFrame, y: np.ndarray, max_n: int, force: list[str], max_abs_corr: float) -> list[str]:
    std = X.std(ddof=0)
    usable = [c for c in X.columns if np.isfinite(std[c]) and std[c] > 1e-9 * max(1.0, abs(X[c].mean()))]
    Z = (X[usable] - X[usable].mean()) / X[usable].std(ddof=0)
    Z = Z.fillna(0.0)
    yc = (y - y.mean()) / (y.std() + 1e-12)
    corr = np.abs(Z.to_numpy().T @ yc / len(yc))
    order = [usable[i] for i in np.argsort(-corr)]
    chosen: list[str] = [f for f in force if f in usable]
    for c in order:
        if len(chosen) >= max_n:
            break
        if c in chosen:
            continue
        ok = True
        for d in chosen:
            r = float(np.mean(Z[c].to_numpy() * Z[d].to_numpy()))
            if abs(r) >= max_abs_corr:
                ok = False
                break
        if ok:
            chosen.append(c)
    return chosen


class Scaler:
    def __init__(self, cols: list[str]):
        self.cols = list(cols)
        self.mean = None
        self.std = None
        self.z_clip = 5.0

    def fit(self, X: pd.DataFrame, s: Settings | None = None) -> "Scaler":
        if s is not None:
            assert_no_excluded(self.cols, s)
        self.mean = X[self.cols].mean().to_numpy()
        sd = X[self.cols].std(ddof=0).to_numpy()
        self.std = np.where(sd > 1e-12, sd, 1.0)
        return self

    def transform(self, X: pd.DataFrame) -> np.ndarray:
        A = (X[self.cols].to_numpy(dtype=float) - self.mean) / self.std
        # clip to +-z_clip standard deviations of the training data: bounds extrapolation of near-constant inputs
        return np.clip(np.nan_to_num(A, nan=0.0, posinf=0.0, neginf=0.0), -self.z_clip, self.z_clip)


def transient_mask(df: pd.DataFrame, codes: np.ndarray | None, s: Settings) -> np.ndarray:
    """A5 steady-state flag (SDD-MOD-06, minimal): True = transient minute.

    Transient when event_code != 0 (config steady_state.event_transient) or when the trailing rolling std
    (steady_state.window_min) of any features.key_tag exceeds std_ratio × max(median rolling std of that tag over the
    run, the tag's measurement-noise sigma). Causal (trailing window), so it can run online."""
    from .catalog import noise_kind
    n = len(df)
    C = s.get("steady_state") or {}
    if not C.get("enabled", True) or n == 0:
        return np.zeros(n, bool)
    out = np.zeros(n, bool)
    if C.get("event_transient", True) and codes is not None and len(codes) == n:
        out |= np.asarray(codes) != 0
    win = int(C.get("window_min", 30))
    ratio = float(C.get("std_ratio", 3.0))
    N = s.get("noise") or {}
    for k in s["features"]["key_tags"]:
        if k not in df.columns:
            continue
        v = df[k].astype(float)
        sd = v.rolling(win, min_periods=max(5, win // 3)).std(ddof=0).to_numpy()
        kind = noise_kind(k, s)
        floor = {"temp": float(N.get("temp_F", 0.5)), "pressure": float(N.get("pressure_psi", 0.05)),
                 "flow": float(N.get("flow_rel", 0.005)) * float(np.nanmedian(np.abs(v)) or 0.0)}.get(kind, 0.0)
        ref = max(float(np.nanmedian(sd)) if np.isfinite(sd).any() else 0.0, floor, 1e-9)
        out |= np.nan_to_num(sd, nan=0.0) > ratio * ref
    return out
