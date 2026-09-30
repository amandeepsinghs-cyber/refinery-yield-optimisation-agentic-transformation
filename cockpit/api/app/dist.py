"""Gaussian-mixture predictive distribution (SDD §5.7, SDD-DIST-01..05), vectorised over minutes.

Arrays: mu, sigma, w have shape (n, J) (n minutes, J members). Bias b and variance P have shape (n,)."""
from __future__ import annotations

import numpy as np
from scipy.special import ndtr

SQ2PI = np.sqrt(2 * np.pi)


def _norm_pdf(z):
    return np.exp(-0.5 * z * z) / SQ2PI


def components(mu, sigma, b, P):
    m = mu + b[:, None]
    s = np.sqrt(sigma ** 2 + P[:, None])
    return m, s


def mix_cdf(x, m, s, w):
    """x: (n,) or (n,k); m,s,w: (n,J)."""
    x = np.asarray(x, dtype=float)
    if x.ndim == 1:
        return np.sum(w * ndtr((x[:, None] - m) / s), axis=1)
    return np.sum(w[:, None, :] * ndtr((x[:, :, None] - m[:, None, :]) / s[:, None, :]), axis=2)


def mix_pdf_grid(grid, m, s, w):
    """grid (G,), single minute m,s,w (J,) -> (J,G) member pdfs (unweighted), (G,) mixture pdf."""
    z = (grid[None, :] - m[:, None]) / s[:, None]
    comp = _norm_pdf(z) / s[:, None]
    return comp, np.sum(w[:, None] * comp, axis=0)


def mix_quantiles(qs, m, s, w, tol=0.01):
    """Bisection on the mixture CDF (SDD-DIST-01), tolerance tol degF. Returns dict q->(n,)."""
    lo0 = np.min(m - 8 * s, axis=1)
    hi0 = np.max(m + 8 * s, axis=1)
    out = {}
    for q in qs:
        lo, hi = lo0.copy(), hi0.copy()
        n_iter = int(np.ceil(np.log2(max(np.max(hi - lo), 1e-6) / tol))) + 1
        for _ in range(n_iter):
            mid = 0.5 * (lo + hi)
            c = mix_cdf(mid, m, s, w)
            below = c < q
            lo = np.where(below, mid, lo)
            hi = np.where(below, hi, mid)
        out[q] = 0.5 * (lo + hi)
    return out


def mix_moments(mu, sigma, w, b, P):
    mbar = np.sum(w * mu, axis=1)
    var = np.sum(w * (sigma ** 2 + P[:, None]), axis=1) + np.sum(w * (mu - mbar[:, None]) ** 2, axis=1)
    return mbar + b, np.sqrt(var)


def bimodality(m, s, w, admitted_mask, d_thr=2.0, w_min=0.2):
    """SDD-DIST-03 Ashman's D on the two highest-weight admitted components."""
    n, J = m.shape
    ww = np.where(admitted_mask[None, :], w, -1.0)
    order = np.argsort(-ww, axis=1)
    i1, i2 = order[:, 0], order[:, 1] if J > 1 else order[:, 0]
    r = np.arange(n)
    m1, m2, s1, s2 = m[r, i1], m[r, i2], s[r, i1], s[r, i2]
    w1, w2 = ww[r, i1], ww[r, i2]
    D = np.sqrt(2) * np.abs(m1 - m2) / np.sqrt(s1 ** 2 + s2 ** 2)
    valid = (w2 > 0) & (admitted_mask.sum() >= 2)
    D = np.where(valid, D, 0.0)
    bim = valid & (D > d_thr) & (w1 >= w_min) & (w2 >= w_min)
    return D, bim


def _A(mu, sig):
    z = mu / sig
    return 2 * sig * _norm_pdf(z) + mu * (2 * ndtr(z) - 1)


def crps_gaussian(y, mu, sigma):
    z = (y - mu) / sigma
    return sigma * (z * (2 * ndtr(z) - 1) + 2 * _norm_pdf(z) - 1 / np.sqrt(np.pi))


def crps_mixture(y, m, s, w):
    t1 = np.sum(w * _A(y[:, None] - m, s), axis=1)
    J = m.shape[1]
    t2 = np.zeros(len(y))
    for i in range(J):
        for j in range(J):
            t2 += w[:, i] * w[:, j] * _A(m[:, i] - m[:, j], np.sqrt(s[:, i] ** 2 + s[:, j] ** 2))
    return t1 - 0.5 * t2
