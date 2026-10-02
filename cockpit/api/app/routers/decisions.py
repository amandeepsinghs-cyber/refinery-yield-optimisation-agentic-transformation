"""Decision endpoints (DECISION_FIRST_REDESIGN §2): the queue the L0 screen is built around.

`GET /api/decisions` → ranked Decision objects at (run, minute); `GET /api/decisions/{id}`;
`POST /api/decisions/{id}/act` {accept|hold|decline} → audit log only (advisory; no control-system write);
`GET /api/decisions-coverage` → IOCL use-case lens (which of their use cases a live decision exercises now)."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..state import get_state
from .common import check_run

router = APIRouter(prefix="/api", tags=["decisions"])


def _t(rid: str, time_min: int | None) -> int:
    if time_min is not None:
        return int(time_min)
    df = get_state().catalog.load(rid)
    if df.empty:
        raise HTTPException(404, detail=f"run '{rid}' has no rows")
    return int(round(float(df["time_min"].iloc[-1])))


@router.get("/decisions")
def list_decisions(run_id: str | None = None, time_min: int | None = None):
    from ..engines.decisions import build
    rid = check_run(run_id)
    return build(rid, _t(rid, time_min))


@router.get("/decisions-coverage")
def decisions_coverage(run_id: str | None = None, time_min: int | None = None):
    from ..engines.decisions import coverage
    rid = check_run(run_id)
    return {"run_id": rid, "rows": coverage(rid, _t(rid, time_min))}


@router.get("/decisions/{decision_id}")
def get_decision(decision_id: str, run_id: str | None = None, time_min: int | None = None):
    from ..engines.decisions import get
    rid = check_run(run_id)
    d = get(rid, _t(rid, time_min), decision_id)
    if d is None:
        raise HTTPException(404, detail=f"decision '{decision_id}' is not live at this minute")
    return d


class ActBody(BaseModel):
    action: str
    run_id: str | None = None
    time_min: int | None = None
    user: str = "operator"
    note: str = ""


@router.post("/decisions/{decision_id}/act")
def act_on_decision(decision_id: str, body: ActBody):
    from ..engines.decisions import act
    rid = check_run(body.run_id)
    try:
        return act(decision_id, body.action, rid, _t(rid, body.time_min), body.user, body.note)
    except ValueError as exc:
        raise HTTPException(400, detail=str(exc)) from exc
    except KeyError as exc:
        raise HTTPException(404, detail=f"decision {exc} is not live at this minute") from exc
    except PermissionError as exc:
        raise HTTPException(409, detail=str(exc)) from exc
