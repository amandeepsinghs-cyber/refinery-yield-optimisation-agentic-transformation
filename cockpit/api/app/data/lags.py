"""A6 lag identification and lagged (dynamically aligned) features (SDD-LAG, features.md A6).

Identification (training only, `identify_lags`):
  for each target and each `features.key_tags` input, on the TRAIN runs only,
  1. first differences of the input x and of the target y per run (removes level / slow drift);
  2. AR(p) (p <= `lags.ar_order`) fitted by least squares to the pooled input differences;
  3. both difference series filtered with the same AR filter (Box-Jenkins prewhitening);
  4. pooled cross-correlation CCF(k) = corr(e_x[t-k], e_y[t]), k = 0..`lags.max_lag_min` (input leads target);
  5. lag = argmax_k |CCF(k)| if that |CCF| exceeds the significance limit (`lags.min_abs_ccf`, `auto` = 2/sqrt(N)),
     else 0.
  The target used for identification is the SIMULATOR TRUTH (minute-by-minute); inputs are the measured (noisy) view.
  On the client's unit the same routine would run on a high-rate analyser signal or step-test data, because 3 labs a
  day are too sparse for a cross-correlation.

Lagged features (`apply_lags`), for every (target, tag) with lag L > 0:
  `<tag>__lag<L>`      value of the tag at the last minute <= t - L (first value of the run when t - L precedes it);
  `<tag>__lagmean<L>`  mean of the tag over the minutes in [t - L, t] (when `rolling_mean`).
  Both are causal (only rows at or before t) and deterministic. Scoring reuses the persisted table: nothing is
  re-identified outside training.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import numpy as np
import pandas as pd

LAG_RE = re.compile(r"__lag(?:mean)?\d+$")
METHOD = ("prewhitened cross-correlation on first differences (AR(p) least-squares prewhitening of the input, same "
          "filter on the target); argmax |CCF| over 0..max_lag if above the significance limit, else 0")


def is_lag_col(c: str) -> bool:
    return bool(LAG_RE.search(c))


def lag_config(s) -> dict:
    L = dict(s.get("lags") or {})
    return {"enabled": bool(L.get("enabled", False)), "max_lag_min": int(L.get("max_lag_min", 60)),
            "ar_order": int(L.get("ar_order", 5)), "min_abs_ccf": L.get("min_abs_ccf", "auto"),
            "rolling_mean": bool(L.get("rolling_mean", True))}


# ------------------------------------------------------------------------------------------------ identification
def _ar_fit(series: list[np.ndarray], p: int) -> np.ndarray:
    """Least-squares AR(p) coefficients a (x[t] ~ sum_k a_k x[t-k]) pooled over several demeaned series."""
    if p <= 0:
        return np.zeros(0)
    rows, tgt = [], []
    for x in series:
        if len(x) <= p + 2:
            continue
        x = x - x.mean()
        rows.append(np.column_stack([x[p - k - 1:len(x) - k - 1] for k in range(p)]))
        tgt.append(x[p:])
    if not rows:
        return np.zeros(p)
    A, b = np.vstack(rows), np.concatenate(tgt)
    if len(b) < 3 * p:
        return np.zeros(p)
    a, *_ = np.linalg.lstsq(A, b, rcond=None)
    return np.nan_to_num(a)


def _ar_filter(x: np.ndarray, a: np.ndarray) -> np.ndarray:
    """e[t] = x[t] - sum_k a_k x[t-k] for t >= p (first p samples dropped)."""
    p = len(a)
    if p == 0:
        return x.copy()
    e = x[p:].copy()
    for k in range(p):
        e -= a[k] * x[p - k - 1:len(x) - k - 1]
    return e


def pooled_ccf(pairs: list[tuple[np.ndarray, np.ndarray]], max_lag: int) -> tuple[np.ndarray, int]:
    """CCF(k) = sum_runs sum_t ex[t-k] ey[t] / sqrt(sum ex^2 sum ey^2), k = 0..max_lag (per-run demeaned).
    Returns (ccf[max_lag + 1], N = number of samples at lag 0)."""
    num = np.zeros(max_lag + 1)
    sxx = syy = 0.0
    N = 0
    for ex, ey in pairs:
        n = min(len(ex), len(ey))
        if n < 3:
            continue
        ex, ey = ex[:n] - ex[:n].mean(), ey[:n] - ey[:n].mean()
        sxx += float(ex @ ex)
        syy += float(ey @ ey)
        N += n
        for k in range(min(max_lag, n - 1) + 1):
            num[k] += float(ex[:n - k] @ ey[k:])
    den = np.sqrt(sxx * syy)
    return (num / den if den > 0 else np.zeros(max_lag + 1)), N


def identify_lag(xs: list[np.ndarray], ys: list[np.ndarray], max_lag: int, ar_order: int,
                 min_abs_ccf="auto") -> dict:
    """Lag (in samples = minutes) of y behind x from several runs. xs/ys: raw level series per run (same length)."""
    dx = [np.diff(np.asarray(x, float)) for x in xs]
    dy = [np.diff(np.asarray(y, float)) for y in ys]
    keep = [(a, b) for a, b in zip(dx, dy) if len(a) == len(b) and len(a) > ar_order + 3
            and np.isfinite(a).all() and np.isfinite(b).all()]
    out = {"lag_min": 0, "ccf": 0.0, "threshold": None, "n": 0, "significant": False, "ar_coef": []}
    if not keep or all(np.std(a) < 1e-12 for a, _ in keep):
        out["reason"] = "no usable variation in the input"
        return out
    a = _ar_fit([k[0] for k in keep], ar_order)
    pairs = [(_ar_filter(x, a), _ar_filter(y, a)) for x, y in keep]
    ccf, N = pooled_ccf(pairs, max_lag)
    thr = 2.0 / np.sqrt(max(N, 1)) if str(min_abs_ccf).lower() == "auto" else float(min_abs_ccf)
    k = int(np.argmax(np.abs(ccf)))
    sig = bool(abs(ccf[k]) > thr)
    out.update(lag_min=k if sig else 0, ccf=round(float(ccf[k]), 4), best_k=k, threshold=round(float(thr), 4),
               n=int(N), significant=sig, ar_coef=[round(float(v), 4) for v in a])
    return out


def identify_lags(frames: dict[str, pd.DataFrame], s, runs: list[str] | None = None) -> dict:
    """Lag table from the given (TRAIN) runs. frames: run_id -> frame with measured inputs and simulator-truth
    targets. Returns a JSON-serialisable table (see module docstring); `targets` is empty when disabled."""
    C = lag_config(s)
    runs = sorted(frames) if runs is None else list(runs)
    table = {"enabled": C["enabled"], "method": METHOD, "max_lag_min": C["max_lag_min"], "ar_order": C["ar_order"],
             "min_abs_ccf": C["min_abs_ccf"], "rolling_mean": C["rolling_mean"], "identified_on": runs,
             "target_source": "simulator truth (minute-by-minute); site: high-rate analyser or step tests",
             "input_source": "measured (process-measurement noise, DECISIONS L6)", "targets": {}}
    if not C["enabled"]:
        return table
    tags = [t for t in s["features"]["key_tags"]]
    for prop in s.targets:
        rows = {}
        for tag in tags:
            xs, ys = [], []
            for r in runs:
                f = frames[r]
                if tag in f.columns and prop in f.columns and len(f) > 3:
                    xs.append(f[tag].to_numpy(dtype=float))
                    ys.append(f[prop].to_numpy(dtype=float))
            if xs:
                rows[tag] = identify_lag(xs, ys, C["max_lag_min"], C["ar_order"], C["min_abs_ccf"])
        table["targets"][prop] = rows
    return table


# ------------------------------------------------------------------------------------------------ features
def lag_columns(table: dict | None, prop: str | None = None) -> list[str]:
    """Lagged feature names produced by `apply_lags` (for one target, or all targets when prop is None)."""
    if not table or not table.get("enabled") or not table.get("targets"):
        return []
    out = []
    for p, rows in table["targets"].items():
        if prop is not None and p != prop:
            continue
        for tag, r in rows.items():
            L = int(r.get("lag_min", 0))
            if L <= 0:
                continue
            for c in [f"{tag}__lag{L}"] + ([f"{tag}__lagmean{L}"] if table.get("rolling_mean", True) else []):
                if c not in out:
                    out.append(c)
    return out


def lagged_value(t: np.ndarray, x: np.ndarray, lag: int) -> np.ndarray:
    """x at the last row with time <= t - lag (causal); rows before the first such time take the run's first value."""
    j = np.searchsorted(t, t - lag, side="right") - 1
    return x[np.clip(j, 0, None)]


def lagged_mean(t: np.ndarray, x: np.ndarray, lag: int) -> np.ndarray:
    """Mean of the finite x over rows with time in [t - lag, t] (causal)."""
    ok = np.isfinite(x)
    cs = np.concatenate([[0.0], np.cumsum(np.where(ok, x, 0.0))])
    cn = np.concatenate([[0], np.cumsum(ok)])
    lo = np.searchsorted(t, t - lag, side="left")
    hi = np.arange(len(t)) + 1
    cnt = cn[hi] - cn[lo]
    with np.errstate(invalid="ignore", divide="ignore"):
        return np.where(cnt > 0, (cs[hi] - cs[lo]) / np.maximum(cnt, 1), np.nan)


def apply_lags(df: pd.DataFrame, table: dict | None) -> pd.DataFrame:
    """Add the lagged features of `table` to a run frame (sorted by time_min). No-op for empty/disabled tables."""
    cols = lag_columns(table)
    if not cols or not len(df):
        return df
    out = df.copy()
    t = out["time_min"].to_numpy(dtype=float) if "time_min" in out else np.arange(len(out), dtype=float)
    new = {}
    for c in cols:
        m = re.match(r"^(.*)__lag(mean)?(\d+)$", c)
        tag, is_mean, L = m.group(1), bool(m.group(2)), int(m.group(3))
        if tag not in out.columns:
            continue
        x = out[tag].to_numpy(dtype=float)
        new[c] = lagged_mean(t, x, L) if is_mean else lagged_value(t, x, L)
    if new:
        out = out.drop(columns=[c for c in new if c in out.columns])
        out = pd.concat([out, pd.DataFrame(new, index=out.index)], axis=1)
    return out


# ------------------------------------------------------------------------------------------------ persistence
def lags_path(s) -> Path:
    return s.artifacts / "models" / "lags.json"


def save_lags(table: dict, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(table, indent=1))


_CACHE: dict[str, tuple[float, dict]] = {}


def load_lags(path: Path) -> dict | None:
    """Persisted lag table (cached by mtime), or None when no model has been trained with lags."""
    if not path.exists():
        return None
    mt = path.stat().st_mtime
    hit = _CACHE.get(str(path))
    if hit and hit[0] == mt:
        return hit[1]
    table = json.loads(path.read_text())
    _CACHE[str(path)] = (mt, table)
    return table


def summary(table: dict | None, top: int = 3) -> dict:
    """prop -> top tags by |CCF| with their lag (for logs / the eval note)."""
    out = {}
    for p, rows in ((table or {}).get("targets") or {}).items():
        best = sorted(rows.items(), key=lambda kv: -abs(kv[1].get("ccf", 0.0)))[:top]
        out[p] = {tag: f"{r['lag_min']} min (|ccf| {abs(r['ccf']):.2f}{'' if r['significant'] else ', n.s.'})"
                  for tag, r in best}
    return out
