"""SDD-MOD-01 Bayesian ridge (reference) and SDD-MOD-03 GPR."""
from __future__ import annotations

import warnings

import numpy as np
import pandas as pd
from sklearn.exceptions import ConvergenceWarning
from sklearn.gaussian_process import GaussianProcessRegressor
from sklearn.gaussian_process.kernels import ConstantKernel, Matern, WhiteKernel
from sklearn.linear_model import BayesianRidge

from ..data.catalog import regime_of
from .base import BaseEstimator

REGIMES = ["heavy", "medium", "light"]


class BayesRidgeModel(BaseEstimator):
    model_id = "bayes_ridge_v1"
    family = "bayes_ridge"

    def _design(self, X: pd.DataFrame) -> np.ndarray:
        Z = self.scaler.transform(X)
        if "dist_feed_API" in X.columns:
            reg = regime_of(X["dist_feed_API"].to_numpy(dtype=float), self.s)
            oh = np.column_stack([(reg == r).astype(float) for r in REGIMES])
        else:
            oh = np.zeros((len(X), 3))
        return np.column_stack([Z, oh])

    def fit(self, X, y, candidates, X_unlabelled=None):
        self._select(X, y, candidates)
        self.m = BayesianRidge(compute_score=True, max_iter=500)
        self.m.fit(self._design(X), y)
        return self

    def predict_dist(self, X):
        mu, sd = self.m.predict(self._design(X), return_std=True)
        return mu, np.maximum(sd, 1e-3)

    def contributions(self, X: pd.DataFrame) -> list[dict]:
        """Coefficient x standardised deviation for one row (explain_estimate)."""
        Z = self.scaler.transform(X)[0]
        coef = self.m.coef_[: len(self.features)]
        c = coef * Z
        order = np.argsort(-np.abs(c))
        return [{"feature": self.features[i], "contribution_F": round(float(c[i]), 3),
                 "value": round(float(X[self.features[i]].iloc[0]), 4)} for i in order[:8]]

    def card(self):
        d = super().card()
        coef = self.m.coef_[: len(self.features)]
        order = np.argsort(-np.abs(coef))[:8]
        d["params"] = {"alpha": float(self.m.alpha_), "lambda": float(self.m.lambda_),
                       "intercept": round(float(self.m.intercept_), 3),
                       "top_coefficients": {self.features[i]: round(float(coef[i]), 4) for i in order},
                       "regime_terms": "one-hot heavy/medium/light (partial pooling simplified: shared prior)"}
        return d


class GPRModel(BaseEstimator):
    model_id = "gpr_v1"
    family = "gpr"

    def __init__(self, target, s, max_features, max_train, restarts, seed=0):
        super().__init__(target, s, max_features)
        self.max_train = max_train
        self.restarts = restarts
        self.seed = seed

    def fit(self, X, y, candidates, X_unlabelled=None):
        self._select(X, y, candidates)
        Z = self.scaler.transform(X)
        rng = np.random.default_rng(self.seed)
        idx = np.arange(len(y))
        if len(idx) > self.max_train:
            idx = np.sort(rng.choice(idx, self.max_train, replace=False))
        d = Z.shape[1]
        kernel = ConstantKernel(1.0, (1e-3, 1e3)) * Matern(length_scale=np.ones(d), length_scale_bounds=(1e-2, 1e3), nu=2.5) \
            + WhiteKernel(1e-2, (1e-6, 1e1))
        self.m = GaussianProcessRegressor(kernel=kernel, normalize_y=True, n_restarts_optimizer=self.restarts,
                                          random_state=self.seed)
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", ConvergenceWarning)
            self.m.fit(Z[idx], y[idx])
        self.n_train = int(len(idx))
        _, sd = self.m.predict(Z[idx], return_std=True)
        self.median_train_sigma = float(np.median(sd))
        return self

    def predict_dist(self, X):
        Z = self.scaler.transform(X)
        out_mu, out_sd = [], []
        for i in range(0, len(Z), 2000):
            mu, sd = self.m.predict(Z[i:i + 2000], return_std=True)
            out_mu.append(mu)
            out_sd.append(sd)
        return np.concatenate(out_mu), np.maximum(np.concatenate(out_sd), 1e-3)

    def lengthscales(self) -> np.ndarray:
        k = self.m.kernel_
        ls = np.atleast_1d(k.k1.k2.length_scale)
        return ls

    def relevance(self) -> list[dict]:
        ls = self.lengthscales()
        r = 1.0 / ls
        r = r / r.max() if r.max() > 0 else r
        order = np.argsort(-r)
        return [{"feature": self.features[i], "relevance": round(float(r[i]), 4),
                 "lengthscale": round(float(ls[i]), 4)} for i in order]

    def card(self):
        d = super().card()
        k = self.m.kernel_
        d["params"] = {"kernel": "ConstantKernel x Matern(nu=2.5, ARD) + WhiteKernel",
                       "amplitude": round(float(k.k1.k1.constant_value), 5),
                       "noise": round(float(k.k2.noise_level), 6),
                       "lengthscales": {f: round(float(l), 4) for f, l in zip(self.features, self.lengthscales())},
                       "log_marginal_likelihood": round(float(self.m.log_marginal_likelihood_value_), 3),
                       "n_train": self.n_train, "restarts": self.restarts}
        return d
