"""Largest-Triangle-Three-Buckets down-sampling (SDD-TS-04)."""
from __future__ import annotations

import numpy as np


def lttb_indices(x: np.ndarray, y: np.ndarray, n_out: int) -> np.ndarray:
    """Return sorted indices of the points kept. Always keeps the first and last point. NaNs in y are treated as 0
    for bucket selection only."""
    n = len(x)
    if n_out >= n or n_out < 3:
        return np.arange(n)
    x = np.asarray(x, dtype=float)
    y = np.nan_to_num(np.asarray(y, dtype=float))
    idx = np.zeros(n_out, dtype=int)
    idx[0], idx[-1] = 0, n - 1
    edges = np.linspace(1, n - 1, n_out - 1)
    a = 0
    for i in range(n_out - 2):
        lo, hi = int(edges[i]), int(edges[i + 1])
        hi = max(hi, lo + 1)
        nlo, nhi = int(edges[i + 1]), int(edges[i + 2]) if i + 2 < len(edges) else n
        nhi = max(nhi, nlo + 1)
        avg_x, avg_y = x[nlo:nhi].mean(), y[nlo:nhi].mean()
        xs, ys = x[lo:hi], y[lo:hi]
        area = np.abs((x[a] - avg_x) * (ys - y[a]) - (x[a] - xs) * (avg_y - y[a]))
        a = lo + int(np.argmax(area))
        idx[i + 1] = a
    return np.unique(idx)
