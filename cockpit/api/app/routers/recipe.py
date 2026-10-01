"""Prescriptive recipe endpoints (E4, API_CONTRACT_v3 §4; SDD-RCP-02..06): multi-parameter operating recipe and what-if.

Advisory only: a recipe is a recommendation card with a gate; nothing here writes to any control system."""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from .common import check_run

router = APIRouter(prefix="/api", tags=["recipe"])


@router.get("/recipe")
def get_recipe(unit_id: str, time_min: int, run_id: str | None = None):
    """Constrained multi-SP recipe for a unit at `time_min` (>= 2 coordinated moves, or WITHHELD with a reason)."""
    from ..engines.recipe import recipe_for
    return recipe_for(check_run(run_id), time_min, unit_id)


class WhatIfRequest(BaseModel):
    unit_id: str
    time_min: int
    moves: dict[str, float]
    run_id: str | None = None


@router.post("/recipe/whatif")
def post_recipe_whatif(body: WhatIfRequest):
    """Evaluate operator-chosen SP moves through the same surrogates / constraints as the recipe search."""
    from ..engines.recipe import whatif
    return whatif(check_run(body.run_id), body.time_min, body.unit_id, body.moves)
