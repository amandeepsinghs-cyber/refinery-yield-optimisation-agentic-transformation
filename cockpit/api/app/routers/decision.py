"""Soft-sensor decision endpoints (contract §5): overview KPIs, recommendations, decisions (audit only), audit, SSE replay, what-if.

Digital-twin endpoints (`/api/twin*`, `/api/unit/*`) live in `routers/twin.py`.
Advisory only — there is no write path to any control system; decisions are stored in the SQLite audit log."""
from __future__ import annotations

import asyncio
import json
import time

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..config import MODEL_IDS
from ..dist import bimodality, components, mix_cdf, mix_moments, mix_quantiles
from ..state import get_state
from .common import check_prop, check_run

router = APIRouter(prefix="/api")


@router.get("/overview")
def overview(run_id: str | None = None, property: str = "LCO_T98_F", time_min: int | None = None):
    """KPIs for one property (default LCO_T98_F): lab/truth RMSE, coverage, trust mix, availability, recommendations."""
    st = get_state()
    run_id, prop = check_run(run_id), check_prop(property)
    v = st.run(run_id)
    if not v:
        return {"kpis": {}, "decisions_needed": [], "note": "run not scored yet"}
    arrs, meta = v
    P = lambda k: arrs[f"{prop}|{k}"]  # noqa: E731
    y, mean = P("truth"), P("mean")
    labs = [l for l in meta["labs"] if l["property"] == prop and l["status"] == "ACCEPT"]
    idx = {int(t): i for i, t in enumerate(arrs["time_min"])}
    le = [l["value"] - mean[idx[l["time_min"]]] for l in labs if l["time_min"] in idx]
    trust = P("trust")
    gate = P("gate")
    j = st.index_of(arrs, time_min)
    t_ref = int(arrs["time_min"][j]) if len(arrs["time_min"]) else None
    recs_all = st.recommendations(run_id, prop)
    recs_at = st.recommendations(run_id, prop, time_min=t_ref)
    kpis = {"rmse_vs_lab": round(float(np.sqrt(np.mean(np.square(le)))), 3) if le else None,
            "n_labs_accepted": len(le),
            "rmse_vs_truth": round(float(np.sqrt(np.nanmean((mean - y) ** 2))), 3),
            "rmse_target": st.s.R,
            "coverage90": round(float(np.nanmean((y >= P("q05")) & (y <= P("q95")))), 4),
            "trust_mix": {k: round(float(np.mean(trust == k)), 4) for k in ("GREEN", "AMBER", "RED")},
            "availability": round(float(np.mean((gate == "PASS") & (trust != "RED"))), 4),
            "recs_accepted": sum(r["status"] == "ACCEPTED" for r in recs_all),
            "recs_total": sum(r["status"] not in ("WITHHELD", "HOLD") for r in recs_all),
            "withheld": sum(r["status"] == "WITHHELD" for r in recs_all),
            "held_no_feasible_move": sum(r["status"] == "HOLD" for r in recs_all),
            "w90_now": round(float(P("w90")[j]), 2), "gate_now": str(gate[j]), "trust_now": str(trust[j])}
    needed = [r for r in recs_at if r["status"] == "OPEN"][::-1]
    if t_ref is not None:
        needed += [r for r in recs_at if r["status"] == "WITHHELD" and r["time_min"] >= t_ref - 30][-1:]
    note = None
    if not le:
        note = ("rmse_vs_lab is null: no accepted synthetic labs in this run (legacy scenario files carry no lab_sample "
                "flags); rmse_vs_truth is shown against simulator truth.")
    return {"kpis": kpis, "decisions_needed": needed, "note": note,
            "provenance": {"source": "simulated", "batch_id": meta.get("batch"), "run_id": run_id, "property": prop}}


@router.get("/recommendations")
def recommendations(run_id: str | None = None, status: str | None = None, property: str | None = None,
                    time_min: int | None = None, limit: int = 500):
    st = get_state()
    run_id = check_run(run_id)
    recs = st.recommendations(run_id, property, time_min=time_min)
    if status:
        want = {x.strip().upper() for x in status.split(",")}
        recs = [r for r in recs if r["status"] in want]
    return recs[-limit:][::-1]


class Decision(BaseModel):
    decision: str
    user: str = "operator"
    note: str = ""


@router.post("/recommendations/{rec_id}/decision")
def decide(rec_id: str, body: Decision):
    st = get_state()
    if body.decision not in ("accepted", "declined"):
        raise HTTPException(400, detail="decision must be 'accepted' or 'declined'")
    parts = rec_id.split("-")
    run_id = "-".join(parts[1:-2]) if len(parts) >= 4 else None
    if not run_id or run_id not in st.catalog.runs:
        raise HTTPException(404, detail=f"unknown recommendation '{rec_id}'")
    rec_t = int(parts[-1]) if len(parts) >= 4 and parts[-1].isdigit() else None
    rec = next((r for r in st.recommendations(run_id, time_min=rec_t) if r["rec_id"] == rec_id), None)
    if rec is None:
        raise HTTPException(404, detail=f"unknown recommendation '{rec_id}'")
    if rec["status"] != "OPEN":
        raise HTTPException(409, detail=f"recommendation is {rec['status']}; only OPEN recommendations can be decided")
    aid = st.audit(body.user, f"recommendation {body.decision}", rec_id,
                   {"note": body.note, "action": rec["action"], "delta_F": rec["delta_F"], "property": rec["property"],
                    "control_system_write": False})
    st.db.execute("INSERT OR REPLACE INTO decisions VALUES (?,?,?,?,datetime('now'),?)",
                  (rec_id, body.decision, body.user, body.note, aid))
    st.db.commit()
    return {"ok": True, "audit_id": aid, "note": "recorded in the audit log only; nothing is written to any control system"}


@router.get("/audit")
def audit(q: str | None = None, limit: int = 500):
    st = get_state()
    sql = "SELECT audit_id, ts, actor, action, target, detail FROM audit"
    args: tuple = ()
    if q:
        sql += " WHERE actor LIKE ? OR action LIKE ? OR target LIKE ? OR detail LIKE ?"
        args = (f"%{q}%",) * 4
    sql += " ORDER BY audit_id DESC LIMIT ?"
    rows = st.db.execute(sql, args + (limit,)).fetchall()
    out = []
    for r in rows:
        try:
            d = json.loads(r[5])
        except (TypeError, ValueError):
            d = r[5]
        out.append({"audit_id": r[0], "ts": r[1], "actor": r[2], "action": r[3], "target": r[4], "detail": d})
    return out


def _sse(event: str, data) -> str:
    return f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n"


@router.get("/stream")
async def stream(request: Request, run_id: str | None = None, property: str | None = None, speed: float = 10.0,
                 frm: int | None = Query(None, alias="from")):
    """SSE replay. speed = simulated minutes per real minute (1, 10, 60 …); 0 = as fast as possible."""
    st = get_state()
    run_id, prop = check_run(run_id), check_prop(property)
    v = st.run(run_id)
    if not v:
        raise HTTPException(404, detail="run not scored yet")
    arrs, meta = v
    t = arrs["time_min"]
    start = int(np.searchsorted(t, frm)) if frm is not None else 0
    recs = {r["time_min"]: r for r in st.recommendations(run_id, prop)}
    labs_by_arrival: dict[int, list] = {}
    for l in meta["labs"]:
        if l["property"] == prop:
            labs_by_arrival.setdefault(int(l["lims_time_min"]), []).append(l)
    period = 60.0 / speed if speed > 0 else 0.0

    async def gen():
        last_hb = time.monotonic()
        prev_gate = None
        yield _sse("heartbeat", {"ts": time.time(), "run_id": run_id, "property": prop, "speed": speed})
        for i in range(start, len(t)):
            if await request.is_disconnected():
                return
            tm = int(t[i])
            msg = st.estimate_message(run_id, prop, tm)
            yield _sse("estimate", msg)
            if msg["gate"]["status"] != prev_gate:
                yield _sse("gate", {"time_min": tm, "property": prop, **msg["gate"], "w90": msg["mixture"]["w90"]})
                prev_gate = msg["gate"]["status"]
            for l in labs_by_arrival.get(tm, []):
                yield _sse("lab", l)
            if tm in recs:
                yield _sse("recommendation", recs[tm])
            if time.monotonic() - last_hb >= 15:
                yield _sse("heartbeat", {"ts": time.time()})
                last_hb = time.monotonic()
            if period:
                await asyncio.sleep(period)
        yield _sse("end", {"run_id": run_id, "time_min": int(t[-1])})

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


class WhatIf(BaseModel):
    run_id: str | None = None
    time_min: int | None = None
    ts: int | None = None
    property: str | None = None
    overrides: dict[str, float] = {}


def run_whatif(run_id, time_min, overrides, prop=None) -> dict:
    """Re-evaluate the four members with tag overrides at one simulated minute (final model), keeping the run's bias
    state at that minute. Read-only: nothing is written anywhere."""
    from ..pipeline import prepare
    st = get_state()
    run_id = check_run(run_id)
    if st.final is None:
        raise HTTPException(409, detail="not trained yet")
    df = prepare(st.catalog.load(run_id), st.s)
    t = df["time_min"].to_numpy()
    i = int(np.searchsorted(t, time_min)) if time_min is not None else len(t) - 1
    i = min(max(i, 0), len(t) - 1)
    row = df.iloc[[i]].copy()
    bad = [k for k in overrides if k not in row.columns]
    if bad:
        raise HTTPException(400, detail=f"unknown tags: {bad}")
    for k, val in overrides.items():
        row[k] = float(val)
        if k + "__ewma" in row.columns:
            row[k + "__ewma"] = float(val)
    v = st.run(run_id)
    out = {"run_id": run_id, "time_min": int(t[i]), "overrides": overrides, "properties": {},
           "note": "what-if on the final model; EWMA features set to the override value (steady-state assumption)"}
    for p in ([prop] if prop else st.s.targets):
        ms = st.final.models[p]
        mu = np.array([[ms[m].predict_dist(row)[0][0] for m in MODEL_IDS]])
        sg = np.array([[ms[m].predict_dist(row)[1][0] for m in MODEL_IDS]])
        if v:
            A = v[0]
            j = st.index_of(A, int(t[i]))
            w = A[f"{p}|weight"][j][None]
            b, Pv = np.array([A[f"{p}|bias"][j]]), np.array([A[f"{p}|bias_var"][j]])
            adm = A[f"{p}|admitted"]
        else:
            adm = np.array(st.bundle["meta"][p]["admitted"])
            w = (adm / adm.sum())[None]
            b, Pv = np.zeros(1), np.array([st.s.sigma_lab ** 2])
        m, s_ = components(mu, sg, b, Pv)
        q = mix_quantiles([0.05, 0.5, 0.95], m, s_, w)
        mean, sd = mix_moments(mu, sg, w, b, Pv)
        D, bim = bimodality(m, s_, w, adm)
        spec = st.s.spec_max(p)
        w90 = float(q[0.95][0] - q[0.05][0])
        status = "WITHHELD" if (w90 > st.s.w90_max or bool(bim[0])) else "PASS"
        out["properties"][p] = {
            "members": {mid: {"mu": round(float(mu[0, k]), 2), "sigma": round(float(sg[0, k]), 2),
                              "weight": round(float(w[0, k]), 4), "admitted": bool(adm[k])} for k, mid in enumerate(MODEL_IDS)},
            "mixture": {"mean": round(float(mean[0]), 2), "q05": round(float(q[0.05][0]), 2), "q50": round(float(q[0.5][0]), 2),
                        "q95": round(float(q[0.95][0]), 2), "w90": round(w90, 2), "bimodality_d": round(float(D[0]), 2),
                        "p_on_spec": round(float(mix_cdf(np.array([spec]), m, s_, w)[0]), 4)},
            "margin_to_spec_F": round(spec - float(q[0.95][0]), 2), "spec_max": spec,
            "gate": {"status": status, "note": "instantaneous check (no hysteresis)"}}
    return out


@router.post("/whatif")
def whatif(body: WhatIf):
    return run_whatif(body.run_id, body.time_min if body.time_min is not None else body.ts, body.overrides,
                      check_prop(body.property) if body.property else None)
