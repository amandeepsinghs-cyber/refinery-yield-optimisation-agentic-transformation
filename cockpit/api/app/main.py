"""FCC soft-sensor Decision Cockpit API (technical demo, simulated data only, advisory only).

Run: uvicorn app.main:app --host 0.0.0.0 --port 8010   (from cockpit/api; API_CONTRACT.md base URL, 8000 is taken by the IDE)"""
from __future__ import annotations

import asyncio
import logging

from fastapi import FastAPI, Request, WebSocket
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
from starlette.exceptions import HTTPException as StarletteHTTPException

from .copilot.chat import chat_stream
from .copilot.live import live_ws, probe_all
from .routers import decision, knowledge, meta, modelling, timeseries
from .state import get_state

log = logging.getLogger("cockpit")
app = FastAPI(title="FCC Soft-Sensor Decision Cockpit API", version="1.0",
              description="Technical demo on simulated data. Advisory only: no write path to any control system.")
app.add_middleware(CORSMiddleware, allow_origins=get_state().s["cors_origins"], allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])
for r in (meta.router, timeseries.router, modelling.router, decision.router, knowledge.router):
    app.include_router(r)


@app.exception_handler(StarletteHTTPException)
async def http_err(_: Request, exc: StarletteHTTPException):
    return JSONResponse(status_code=exc.status_code, content={"error": _reason(exc.status_code), "detail": exc.detail})


@app.exception_handler(RequestValidationError)
async def val_err(_: Request, exc: RequestValidationError):
    return JSONResponse(status_code=422, content={"error": "validation error", "detail": str(exc.errors())[:1000]})


@app.exception_handler(Exception)
async def any_err(_: Request, exc: Exception):
    log.exception("unhandled")
    return JSONResponse(status_code=500, content={"error": "internal error", "detail": str(exc)[:500]})


def _reason(code: int) -> str:
    return {400: "bad request", 404: "not found", 409: "conflict", 422: "validation error"}.get(code, "error")


@app.on_event("startup")
async def startup():
    st = get_state()
    st.knowledge.load(embed=True, background=True)
    st.rescore_stale_async()
    if st.s["gemini"].get("probe_on_startup", True):
        asyncio.create_task(probe_all())


class ChatBody(BaseModel):
    messages: list[dict] = []
    context: dict = {}


@app.post("/api/copilot/chat")
async def copilot_chat(body: ChatBody):
    return StreamingResponse(chat_stream(body.messages, body.context), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/api/admin/probe")
async def probe():
    await probe_all()
    return get_state().gemini


@app.websocket("/api/live")
async def live(ws: WebSocket, run_id: str | None = None, property: str | None = None, time_min: int | None = None,
               page: str | None = None):
    await live_ws(ws, {"run_id": run_id, "property": property, "time_min": time_min, "page": page})
