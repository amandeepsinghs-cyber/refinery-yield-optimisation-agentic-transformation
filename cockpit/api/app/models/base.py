"""Shared model utilities and the first-principles-inspired physics base (SDD-MOD-04).

y_phys = a + b * T_draw_corr,  T_draw_corr = T_draw + c * ln(P_ref / P5_frac_psia)
Fitted by least squares as y = a + b*T + (b*c)*L with L = ln(P_ref/P5). If P5 does not vary in the
training data, c is set to 0 (not identifiable)."""
from __future__ import annotations

import numpy as np
import pandas as pd

from ..data.features import Scaler, select_features


class PhysicsBase:
    def __init__(self, draw_tray: str, p_ref: float):
        self.draw_tray = draw_tray
        self.p_ref = p_ref
        self.a = self.b = self.c = 0.0

    def _L(self, X: pd.DataFrame) -> np.ndarray:
        if "P5_frac_psia" not in X.columns:
            return np.zeros(len(X))
        p = X["P5_frac_psia"].to_numpy(dtype=float)
        return np.log(self.p_ref / np.clip(p, 1e-3, None))

    def fit(self, X: pd.DataFrame, y: np.ndarray) -> "PhysicsBase":
        T = X[self.draw_tray].to_numpy(dtype=float)
        L = self._L(X)
        if np.std(L) > 1e-9:
            A = np.column_stack([np.ones_like(T), T, L])
            coef, *_ = np.linalg.lstsq(A, y, rcond=None)
            self.a, self.b = float(coef[0]), float(coef[1])
            self.c = float(coef[2] / self.b) if abs(self.b) > 1e-9 else 0.0
        else:
            A = np.column_stack([np.ones_like(T), T])
            coef, *_ = np.linalg.lstsq(A, y, rcond=None)
            self.a, self.b, self.c = float(coef[0]), float(coef[1]), 0.0
        return self

    def predict(self, X: pd.DataFrame) -> np.ndarray:
        T = X[self.draw_tray].to_numpy(dtype=float)
        return self.a + self.b * (T + self.c * self._L(X))

    def params(self) -> dict:
        return {"a": round(self.a, 4), "b": round(self.b, 5), "c": round(self.c, 4), "draw_tray": self.draw_tray,
                "p_ref_psia": self.p_ref}


class BaseEstimator:
    model_id = ""
    family = ""

    def __init__(self, target: str, s, max_features: int):
        self.target = target
        self.s = s
        self.max_features = max_features
        self.features: list[str] = []
        self.scaler: Scaler | None = None
        self.draw_tray = s["hybrid"]["draw_tray"][target]

    def _select(self, X: pd.DataFrame, y: np.ndarray, candidates: list[str]) -> None:
        self.features = select_features(X[candidates], y, self.max_features, [self.draw_tray],
                                        float(self.s["features"]["max_abs_corr"]))
        self.scaler = Scaler(self.features).fit(X, self.s)

    def predict_dist(self, X: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
        raise NotImplementedError

    def card(self) -> dict:
        return {"model_id": self.model_id, "family": self.family, "target": self.target, "features": self.features}
