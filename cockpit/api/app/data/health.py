"""Input health (SDD §5.1 DQ, simplified) and novelty (SDD-TRU-02, PCA T²/SPE) models fitted on training rows."""
from __future__ import annotations

import numpy as np
import pandas as pd


class DQModel:
    """Range + spike (+ optional frozen) checks on key tags, limits from training data."""

    def __init__(self, s):
        self.s = s
        self.tags = [t for t in s["features"]["key_tags"]]
        self.lims: dict[str, tuple] = {}

    def fit(self, frames: list[pd.DataFrame]) -> "DQModel":
        cfg = self.s["dq"]
        for t in self.tags:
            vals = np.concatenate([f[t].to_numpy(dtype=float) for f in frames if t in f.columns]) if frames else np.array([])
            vals = vals[np.isfinite(vals)]
            if len(vals) < 5:
                continue
            lo, hi = np.percentile(vals, [0.1, 99.9])
            span = max(hi - lo, 1e-6 * max(1.0, abs(hi)))
            diffs = np.concatenate([np.diff(f[t].to_numpy(dtype=float)) for f in frames if t in f.columns and len(f) > 1])
            diffs = diffs[np.isfinite(diffs)]
            mad = 1.4826 * np.median(np.abs(diffs - np.median(diffs))) if len(diffs) else 0.0
            thr = max(cfg["spike_mad_k"] * mad, 0.5 * float(np.std(vals)), 1e-6 * max(1.0, abs(hi)))
            self.lims[t] = (lo - cfg["range_pad"] * span, hi + cfg["range_pad"] * span, thr, span)
        return self

    def evaluate(self, df: pd.DataFrame) -> tuple[np.ndarray, np.ndarray, list]:
        """Returns fail (n,), severe (n,), failing tag per minute (None or tag)."""
        n = len(df)
        fail = np.zeros(n, bool)
        severe = np.zeros(n, bool)
        tag = [None] * n
        cfg = self.s["dq"]
        for t, (lo, hi, thr, span) in self.lims.items():
            if t not in df.columns:
                continue
            x = df[t].to_numpy(dtype=float)
            bad = (x < lo) | (x > hi) | ~np.isfinite(x)
            d = np.abs(np.diff(x, prepend=x[0]))
            bad |= d > thr
            if cfg.get("frozen_enabled"):
                frozen = np.zeros(n, bool)
                run = 0
                for i in range(1, n):
                    run = run + 1 if d[i] < 1e-6 * span else 0
                    frozen[i] = run >= cfg["frozen_min"]
                bad |= frozen
                severe |= frozen
            for i in np.where(bad & ~fail)[0]:
                tag[i] = t
            fail |= bad
        return fail, severe, tag


class NoveltyModel:
    """PCA on standardised training inputs; T² and SPE with empirical 99% limits."""

    def __init__(self, cols: list[str]):
        self.cols = cols

    def fit(self, X: pd.DataFrame) -> "NoveltyModel":
        A = X[self.cols].to_numpy(dtype=float)
        self.mean = np.nanmean(A, 0)
        sd = np.nanstd(A, 0)
        keep = sd > 1e-9
        self.cols = [c for c, k in zip(self.cols, keep) if k]
        self.mean, self.sd = self.mean[keep], sd[keep]
        Z = np.nan_to_num((A[:, keep] - self.mean) / self.sd)
        if Z.shape[1] == 0:
            self.k = 0
            self.t2_lim = self.spe_lim = np.inf
            return self
        U, S, Vt = np.linalg.svd(Z, full_matrices=False)
        ev = S ** 2 / max(len(Z) - 1, 1)
        frac = np.cumsum(ev) / ev.sum()
        self.k = int(min(np.searchsorted(frac, 0.95) + 1, 10, len(ev)))
        self.P = Vt[: self.k].T
        self.ev = np.maximum(ev[: self.k], 1e-12)
        t2, spe = self._stats(Z)
        self.t2_lim = float(np.percentile(t2, 99)) * 1.05 + 1e-9
        self.spe_lim = float(np.percentile(spe, 99)) * 1.05 + 1e-9
        return self

    def _stats(self, Z):
        T = Z @ self.P
        t2 = np.sum(T ** 2 / self.ev, axis=1)
        spe = np.sum((Z - T @ self.P.T) ** 2, axis=1)
        return t2, spe

    def evaluate(self, X: pd.DataFrame):
        if self.k == 0:
            n = len(X)
            return np.zeros(n), np.zeros(n)
        Z = np.nan_to_num((X[self.cols].to_numpy(dtype=float) - self.mean) / self.sd)
        t2, spe = self._stats(Z)
        return t2 / self.t2_lim, spe / self.spe_lim
