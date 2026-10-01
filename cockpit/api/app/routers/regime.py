"""Crude-regime (E1) and model-adaptation (E2) endpoints (API_CONTRACT_v3 §1–§2; SDD-REG-01..05, SDD-ADP-01..04)."""
from __future__ import annotations

from fastapi import APIRouter

from .common import check_prop, check_run

router = APIRouter(prefix="/api", tags=["regime"])


@router.get("/regime")
def get_regime(run_id: str | None = None, time_min: int | None = None):
    """Active crude regime at `time_min`: posterior, novelty, transition %, declared-vs-detected, detection delay."""
    from ..engines.regime import regime_at
    return regime_at(check_run(run_id), time_min)


@router.get("/regime/timeseries")
def get_regime_timeseries(run_id: str | None = None, step: int = 5):
    """Regime posterior and novelty over the whole run, every `step` minutes."""
    from ..engines.regime import regime_timeseries
    return regime_timeseries(check_run(run_id), step)


@router.get("/adaptation")
def get_adaptation(time_min: int, run_id: str | None = None, property: str | None = None):
    """Committee weights for one property at `time_min`: per-regime weights, physics weight, bias reset, reason."""
    from ..engines.adapt import adaptation_at
    return adaptation_at(check_run(run_id), time_min, check_prop(property))
