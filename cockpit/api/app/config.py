"""Configuration loader. All paths resolve relative to the Refinery Agentic Optimisation repo root."""
from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

import yaml

API_DIR = Path(__file__).resolve().parents[1]          # cockpit/api
REPO_ROOT = API_DIR.parents[1]                          # Refinery Agentic Optimisation


class Settings:
    def __init__(self, raw: dict):
        self.raw = raw
        g = raw["gemini"]
        g["project"] = os.environ.get("FCC_GCP_PROJECT", g["project"])
        g["location"] = os.environ.get("FCC_GCP_LOCATION", g["location"])
        g["text_model"] = os.environ.get("FCC_TEXT_MODEL", g["text_model"])
        g["live_model"] = os.environ.get("FCC_LIVE_MODEL", g["live_model"])
        g["embed_model"] = os.environ.get("FCC_EMBED_MODEL", g["embed_model"])

    def __getitem__(self, k):
        return self.raw[k]

    def get(self, k, d=None):
        return self.raw.get(k, d)

    # paths
    @property
    def data_root(self) -> Path:
        return REPO_ROOT / self.raw["data"]["root"]

    @property
    def artifacts(self) -> Path:
        p = Path(os.environ.get("FCC_ARTIFACTS_DIR", REPO_ROOT / self.raw["artifacts_dir"]))
        p.mkdir(parents=True, exist_ok=True)
        return p

    @property
    def knowledge_dir(self) -> Path:
        return Path(os.environ.get("FCC_KNOWLEDGE_DIR", REPO_ROOT / self.raw["knowledge_dir"]))

    # frequently used scalars
    @property
    def R(self) -> float:
        return float(self.raw["lab"]["reproducibility_F"])

    @property
    def sigma_lab(self) -> float:
        return self.R / 2.77

    @property
    def targets(self) -> list[str]:
        return list(self.raw["targets"])

    def spec_max(self, prop: str) -> float:
        return float(self.raw["specs"][prop]["max"])

    def spec_margin(self, prop: str) -> float:
        return float(self.raw["specs"][prop].get("margin", 0.0))

    @property
    def w90_max(self) -> float:
        return float(self.raw["gate"]["w90_max_F"])


MODEL_IDS = ["bayes_ridge_v1", "gpr_v1", "hybrid_delta_v1", "pinn_ens_v1"]
MODEL_META = {
    "bayes_ridge_v1": {"label": "Bayesian ridge", "color": "#64748b", "family": "bayes_ridge"},
    "gpr_v1": {"label": "GPR", "color": "#ea580c", "family": "gpr"},
    "hybrid_delta_v1": {"label": "Hybrid delta", "color": "#2563eb", "family": "hybrid_delta"},
    "pinn_ens_v1": {"label": "PINN ensemble", "color": "#0d9488", "family": "pinn_ens"},
}
PROP_SHORT = {"LCO_T98_F": "LCO", "HN_T98_F": "HN"}


@lru_cache
def get_settings() -> Settings:
    path = Path(os.environ.get("FCC_CONFIG", API_DIR / "config.yaml"))
    with open(path) as f:
        return Settings(yaml.safe_load(f))
