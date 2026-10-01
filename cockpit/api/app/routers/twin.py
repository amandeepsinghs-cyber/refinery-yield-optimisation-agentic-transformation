"""Digital-twin endpoints (API_CONTRACT_v3 §5–§6): plant state (L0), unit workbench (L1), use-case detail, decisions.

Advisory only — there is no write path to any control system; decisions are stored in the SQLite audit log and
mirrored as `accepted|declined` agent events when they reference a recipe."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..state import get_state, now_iso
from ..store import event_write
from .common import check_run

router = APIRouter(prefix="/api", tags=["twin"])


@router.get("/twin")
def get_twin(run_id: str | None = None, time_min: int | None = None):
    """Unified 6-unit connected refinery twin state (SDD §13 / Epic I; §14 L0 additions: crude_slate, needs_attention, timeline)."""
    from ..twin import evaluate_twin_state
    rid = check_run(run_id)
    return evaluate_twin_state(run_id=rid, time_min=time_min)


@router.get("/twin/use-case/{use_case_id}")
def get_twin_use_case(use_case_id: str, run_id: str | None = None, time_min: int | None = None):
    """Detailed evaluation for a single refinery optimisation use case (UC-01 through UC-11)."""
    from ..twin import get_use_case_detail
    rid = check_run(run_id)
    try:
        return get_use_case_detail(use_case_id=use_case_id, run_id=rid, time_min=time_min)
    except KeyError as exc:
        raise HTTPException(404, detail=str(exc)) from exc


@router.get("/unit/{unit_id}/workbench")
def get_unit_workbench(unit_id: str, time_min: int | None = None, run_id: str | None = None,
                       window_min: int = 720, step: int = 2):
    """L1 workbench aggregate for one unit: Data · Analysis · Models · Decisions (SDD-L1-01..07, contract §5).

    `time_min` defaults to the run's last minute (same convention as `/api/twin`) so a fresh browser can open L1."""
    from ..engines.workbench import workbench
    rid = check_run(run_id)
    if time_min is None:
        df = get_state().catalog.load(rid)
        if df.empty:
            raise HTTPException(404, detail=f"run '{rid}' has no rows")
        time_min = int(round(float(df["time_min"].iloc[-1])))
    out = workbench(unit_id, rid, time_min, window_min, step)
    if out:
        out.setdefault("run_id", rid)
    return out


class TwinDecisionRequest(BaseModel):
    rec_id: str
    decision: str
    user: str = "operator"
    note: str = ""
    run_id: str | None = None
    time_min: int | None = None
    recipe_id: str | None = None


@router.post("/twin/decision")
def decide_twin_recommendation(body: TwinDecisionRequest):
    """Record operator Accept or Decline on any unit / use-case / recipe decision card (SDD-TWIN-06, SDD-RCP-06)."""
    from ..twin import record_twin_decision
    rid = check_run(body.run_id)
    try:
        res = record_twin_decision(rec_id=body.rec_id, decision=body.decision, user=body.user, note=body.note,
                                   run_id=rid, time_min=body.time_min)
    except ValueError as exc:
        raise HTTPException(400, detail=str(exc)) from exc
    except KeyError as exc:
        raise HTTPException(404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(409, detail=str(exc)) from exc
    if body.recipe_id:
        st = get_state()
        event_write(st.db, {
            "event_id": f"ev_{rid}_{body.time_min}_{body.recipe_id}_{body.decision}",
            "run_id": rid, "time_min": body.time_min or 0, "unit_id": None, "use_case_id": None, "tag": None,
            "kind": body.decision, "severity": "info", "payload": {"recipe_id": body.recipe_id},
            "status": "closed", "ts": now_iso(),
        })
    return res
