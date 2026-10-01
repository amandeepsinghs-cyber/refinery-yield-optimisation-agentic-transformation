"""Agent event bus endpoints (API_CONTRACT_v3 §3): E3 detection events, replay + live SSE tail.

Events are produced by the unit sentinels (`engines.detect`) and persisted in the SQLite `agent_events` table;
the stream replays the table for a run and then tails it by polling once a second."""
from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, Request
from sse_starlette.sse import EventSourceResponse

from ..state import get_state
from ..store import events_read
from .common import check_run

router = APIRouter(prefix="/api", tags=["agents"])

STREAM_POLL_S = 1.0


@router.get("/agents/events")
def get_agent_events(run_id: str | None = None, upto_time_min: int | None = None, unit_id: str | None = None):
    """Detection / regime / decision events for a run, optionally filtered by unit and capped at `upto_time_min`."""
    from ..engines.detect import events_for_run
    return events_for_run(check_run(run_id), upto_time_min, unit_id)


@router.get("/agents/stream")
async def stream_agent_events(request: Request, run_id: str | None = None, follow: bool = True):
    """SSE: replay every stored event for the run (`event: agent_event`), then tail new rows as they are written.

    `follow=false` closes the stream after the replay (used by tests and one-shot clients)."""
    from ..engines.detect import events_for_run
    rid = check_run(run_id)
    events_for_run(rid)  # make sure the sentinels have run for this run before we start replaying the table

    async def gen():
        st = get_state()
        last_ts = ""
        while not await request.is_disconnected():
            for ev in events_read(st.db, rid, since_ts=last_ts):
                yield {"event": "agent_event", "data": json.dumps(ev)}
                last_ts = ev["ts"]
            if not follow:
                return
            await asyncio.sleep(STREAM_POLL_S)

    return EventSourceResponse(gen())
