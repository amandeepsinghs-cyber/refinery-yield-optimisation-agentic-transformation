"""SDD-MOD-04 Hybrid delta (physics base + GPR residual) and SDD-MOD-05 PINN deep ensemble (PyTorch CPU)."""
from __future__ import annotations

import numpy as np
import pandas as pd
import torch
from torch import nn

from .base import BaseEstimator, PhysicsBase
from .classic import GPRModel


def _bmin(s):
    v = (s["hybrid"] or {}).get("b_min") if hasattr(s["hybrid"], "get") else None
    return None if v is None else float(v)


class HybridDeltaModel(BaseEstimator):
    model_id = "hybrid_delta_v1"
    family = "hybrid_delta"

    def __init__(self, target, s, max_features, max_train, restarts, seed=0):
        super().__init__(target, s, max_features)
        self.phys = PhysicsBase(self.draw_tray, float(s["hybrid"]["p_ref_psia"]), _bmin(s))
        self.delta = GPRModel(target, s, max_features, max_train, restarts, seed)

    def fit(self, X, y, candidates, X_unlabelled=None):
        self.phys.fit(X, y)
        r = y - self.phys.predict(X)
        self.delta.fit(X, r, candidates)
        self.features = self.delta.features
        yp = self.phys.predict(X)
        self.var_explained_physics = float(1 - np.var(y - yp) / max(np.var(y), 1e-12))
        return self

    def decompose(self, X) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        p = self.phys.predict(X)
        d, sd = self.delta.predict_dist(X)
        return p, d, sd

    def predict_dist(self, X):
        p, d, sd = self.decompose(X)
        return p + d, sd

    def card(self):
        d = super().card()
        ls = self.delta.lengthscales()
        top = np.argsort(ls)[:3]
        d["params"] = {"physics": "a + b·T_draw,corr, T_draw,corr = T_draw + c·ln(P_ref/P5)", **self.phys.params(),
                       "residual": "GPR Matérn 5/2, ℓ=" + ", ".join(f"{self.features[i]}:{ls[i]:.2f}" for i in top),
                       "physics_share_var": round(self.var_explained_physics, 4),
                       "residual_kernel": self.delta.card()["params"]}
        return d


class _EnsembleMLP(nn.Module):
    """K independent MLPs evaluated in one batched pass. Input x: (K, N, d). Output mu, var: (K, N)."""

    def __init__(self, K, d, hidden, seed):
        super().__init__()
        g = torch.Generator().manual_seed(seed)
        dims = [d] + list(hidden) + [2]
        self.W = nn.ParameterList()
        self.b = nn.ParameterList()
        for a, b_ in zip(dims[:-1], dims[1:]):
            self.W.append(nn.Parameter(torch.randn(K, a, b_, generator=g) * (1.0 / np.sqrt(a))))
            self.b.append(nn.Parameter(torch.zeros(K, 1, b_)))

    def forward(self, x):
        h = x
        for i, (W, b) in enumerate(zip(self.W, self.b)):
            h = torch.baddbmm(b, h, W)
            if i < len(self.W) - 1:
                h = torch.tanh(h)
        return h[..., 0], nn.functional.softplus(h[..., 1]) + 1e-4


class PinnEnsembleModel(BaseEstimator):
    model_id = "pinn_ens_v1"
    family = "pinn_ens"

    def __init__(self, target, s, max_features, seed=0):
        super().__init__(target, s, max_features)
        c = s["pinn"]
        self.n_members, self.hidden, self.epochs, self.lr = int(c["members"]), list(c["hidden"]), int(c["epochs"]), float(c["lr"])
        self.lam_phys, self.lam_mono = float(c["lambda_phys"]), float(c["lambda_mono"])
        self.seed = seed
        torch.set_num_threads(int(c.get("threads", 4)))

    def fit(self, X, y, candidates, X_unlabelled=None):
        self._select(X, y, candidates)
        self.phys = PhysicsBase(self.draw_tray, float(self.s["hybrid"]["p_ref_psia"]), _bmin(self.s)).fit(X, y)
        self.ym, self.ys = float(np.mean(y)), float(np.std(y) + 1e-6)
        Xl = torch.tensor(self.scaler.transform(X), dtype=torch.float32)
        yl = torch.tensor((y - self.ym) / self.ys, dtype=torch.float32)
        Xu_df = X_unlabelled if X_unlabelled is not None else X
        rng = np.random.default_rng(self.seed)
        nu, nl = int(self.s["pinn"].get("max_unlabelled", 1000)), int(self.s["pinn"].get("max_labelled", 3000))
        if len(Xu_df) > nu:
            Xu_df = Xu_df.iloc[np.sort(rng.choice(len(Xu_df), nu, replace=False))]
        Xu = torch.tensor(self.scaler.transform(Xu_df), dtype=torch.float32)
        yphys_u = torch.tensor((self.phys.predict(Xu_df) - self.ym) / self.ys, dtype=torch.float32)
        if len(Xl) > nl:
            sel = np.sort(rng.choice(len(Xl), nl, replace=False))
            Xl, yl = Xl[sel], yl[sel]
        j = self.features.index(self.draw_tray)
        K = self.n_members
        torch.manual_seed(self.seed)
        self.net = _EnsembleMLP(K, Xl.shape[1], self.hidden, self.seed * 100 + 7)
        opt = torch.optim.Adam(self.net.parameters(), lr=self.lr, weight_decay=1e-4)
        XlK = Xl.unsqueeze(0).expand(K, -1, -1).contiguous()
        for _ in range(self.epochs):
            opt.zero_grad()
            mu, var = self.net(XlK)
            nll = 0.5 * (torch.log(var) + (yl[None] - mu) ** 2 / var).mean(1).sum()
            xu = Xu.unsqueeze(0).expand(K, -1, -1).clone().requires_grad_(True)
            mu_u, _ = self.net(xu)
            g = torch.autograd.grad(mu_u.sum(), xu, create_graph=True)[0][..., j]      # per-member dmu/dT_draw
            phys = ((mu_u - yphys_u[None]) ** 2).mean(1).sum()
            mono = torch.relu(-g).mean(1).sum()
            loss = nll + self.lam_phys * phys + self.lam_mono * mono
            loss.backward()
            opt.step()
        self.net.eval()
        xu = Xu.unsqueeze(0).expand(K, -1, -1).clone().requires_grad_(True)
        mu_u, _ = self.net(xu)
        g = torch.autograd.grad(mu_u.sum(), xu)[0][..., j]
        self.mono_violations = int((g < 0).sum())
        _, _, ale, epi = self._members(X.iloc[: min(len(X), 3000)])
        self.aleatoric_sd, self.epistemic_sd = float(np.sqrt(np.mean(ale))), float(np.sqrt(np.mean(epi)))
        return self

    def _members(self, X):
        Z = torch.tensor(self.scaler.transform(X), dtype=torch.float32)
        with torch.no_grad():
            m, v = self.net(Z.unsqueeze(0).expand(self.n_members, -1, -1).contiguous())
        mus, vars_ = m.numpy() * self.ys + self.ym, v.numpy() * self.ys ** 2
        return mus, vars_, vars_.mean(0), mus.var(0)

    def member_means(self, X) -> np.ndarray:
        return self._members(X)[0]

    def predict_dist(self, X):
        mus, _, ale, epi = self._members(X)
        return mus.mean(0), np.maximum(np.sqrt(ale + epi), 1e-3)

    def card(self):
        d = super().card()
        d["params"] = {"architecture": f"{self.n_members} x MLP {self.hidden} tanh, Gaussian head (mu, log var)",
                       "lambda_phys": self.lam_phys, "lambda_mono": self.lam_mono,
                       "physics_penalty": "mean((mu - y_phys)^2) on unlabelled simulated minutes",
                       "monotonicity": f"ReLU(-d mu / d {self.draw_tray}) on unlabelled minutes",
                       "monotonicity_violations": self.mono_violations,
                       "aleatoric_sd_F": round(self.aleatoric_sd, 3), "epistemic_sd_F": round(self.epistemic_sd, 3),
                       "epochs": self.epochs, "lambda_selection": "fixed from config (validation sweep not run)"}
        return d
