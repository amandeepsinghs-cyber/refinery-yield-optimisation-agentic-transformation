"""Meta endpoints (contract §1) + admin reload/train."""
from __future__ import annotations

import subprocess
import sys

from fastapi import APIRouter

from ..config import API_DIR, MODEL_IDS, MODEL_META
from ..data.catalog import tag_meta
from ..state import get_state
from .common import default_run

router = APIRouter(prefix="/api")


@router.get("/health")
def health():
    st = get_state()
    b = st.bundle or {}
    dm = st.catalog.data_mode
    trained_on_fallback = "FALLBACK" in str(b.get("mode") or "")
    return {"status": "ok",
            "data": {"runs": len(st.catalog.runs), "batches": st.catalog.batches, "trained": st.trained,
                     "trained_at": b.get("trained_at"), "stale_runs": len(st.stale_runs()) if st.trained else None,
                     "rescoring": st.scoring, "source": dm["source"],
                     "note": dm["note"], "split": b.get("mode"), "primary_progress": dm.get("primary_progress"),
                     "store": dm.get("store"),
                     "retrain_recommended": bool(st.trained and dm["source"] == "primary" and trained_on_fallback)},
            "gemini": st.gemini,
            "knowledge": {**st.knowledge.info(), "note": st.knowledge.note}}


@router.get("/runs")
def runs():
    st = get_state()
    b = st.bundle or {}
    test = set(b.get("test_runs", []))
    out = []
    for r, info in sorted(st.catalog.runs.items()):
        v = st.run(r)
        split = v[1].get("split") if v else ("test" if r in test else ("train" if r in b.get("train_runs", []) else "test"))
        out.append({"run_id": r, "batch": info.batch, "scenario": info.scenario, "n_minutes": info.n_minutes,
                    "split": split, "has_events": bool(st.catalog.events(r)), "scored": v is not None,
                    "schema": info.schema})
    return out


@router.get("/tags")
def tags():
    st = get_state()
    cols = []
    for info in st.catalog.runs.values():
        for c in info.columns:
            if c not in cols:
                cols.append(c)
    return [m for m in (tag_meta(c) for c in cols) if m]


@router.get("/config")
def config():
    st = get_state()
    s = st.s
    return {"spec": {p: s.spec_max(p) for p in s.targets}, "R": s.R, "w90_limit": s.w90_max,
            "hysteresis_ratio": float(s["gate"]["hysteresis_ratio"]), "hysteresis_min": int(s["gate"]["hysteresis_min"]),
            "properties": s.targets,
            "models": [{"model_id": m, "label": MODEL_META[m]["label"], "color": MODEL_META[m]["color"]} for m in MODEL_IDS],
            "mixture_color": "text", "sigma_lab": round(s.sigma_lab, 4),
            "default_run": default_run(), "default_time_min": s["data"].get("default_time_min"), "data_source": st.catalog.data_mode,
            "recommend": {k: s["recommend"][k] for k in ("every_min", "max_move_F", "step_F", "p_on_spec_min", "valid_min")}}


@router.post("/admin/reload")
def reload():
    return get_state().reload()


_train_proc = {"p": None}


@router.post("/admin/train")
def train():
    """Start `python -m app.train` in the background; call /api/admin/reload when it finishes."""
    p = _train_proc["p"]
    if p is not None and p.poll() is None:
        return {"started": False, "note": "training already running", "pid": p.pid}
    log = open(get_state().s.artifacts / "train.log", "w")
    _train_proc["p"] = subprocess.Popen([sys.executable, "-m", "app.train"], cwd=API_DIR, stdout=log, stderr=subprocess.STDOUT)
    return {"started": True, "pid": _train_proc["p"].pid, "log": str(get_state().s.artifacts / "train.log")}
