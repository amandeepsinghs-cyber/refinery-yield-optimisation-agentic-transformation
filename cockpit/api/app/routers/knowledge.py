"""Knowledge & records endpoints (contract §6)."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..knowledge.index import DEFAULT_SIM_BATCH
from ..state import get_state

router = APIRouter(prefix="/api/knowledge")


@router.get("/search")
def search(q: str = "", type: str | None = None, k: int = 8):
    kn = get_state().knowledge
    return {"results": kn.search(q, type, k), "index": kn.info()}


@router.get("/docs")
def docs():
    kn = get_state().knowledge
    items = kn.manifest()
    out = []
    for item in items:
        did = item.get("doc_id")
        doc_info = kn.docs.get(did)
        m = doc_info.get("meta", {}) if doc_info else {}
        srun = m.get("sim_run") or item.get("sim_run")
        sbatch = m.get("sim_batch") or item.get("sim_batch")
        swin = m.get("sim_window") if "sim_window" in m else item.get("sim_window")
        d = dict(item)
        if srun:
            d["sim_run"] = srun
            d["sim_batch"] = sbatch or DEFAULT_SIM_BATCH
        elif sbatch:
            d["sim_batch"] = sbatch
        if swin is not None:
            try:
                win = [int(float(x)) for x in swin][:2] if isinstance(swin, list) and swin else swin
            except (TypeError, ValueError):
                win = swin
            d["sim_window"] = win
        out.append(d)
    return out


@router.get("/docs/{doc_id}")
def doc(doc_id: str, section: str | None = None):
    d = get_state().knowledge.get_doc(doc_id, section)
    if d is None:
        raise HTTPException(404, detail=f"unknown document '{doc_id}'")
    return d


@router.get("/records")
def records(run_id: str | None = None):
    st = get_state()
    info = st.catalog.all_runs.get(run_id) if run_id else None
    recs = st.knowledge.records(run_id, run_minutes=info.n_minutes if info else None)
    out = []
    for r in recs:
        did = r.get("doc_id")
        doc_info = st.knowledge.docs.get(did)
        m = doc_info.get("meta", {}) if doc_info else {}
        d = dict(r)
        srun = m.get("sim_run") or d.get("sim_run") or d.get("run_id")
        if srun:
            d["sim_run"] = srun
            d["sim_batch"] = m.get("sim_batch") or d.get("sim_batch") or DEFAULT_SIM_BATCH
            swin = d.get("sim_window") or d.get("window")
            if swin is None and "sim_window" in m:
                w = m["sim_window"]
                try:
                    swin = [int(float(x)) for x in w][:2] if isinstance(w, list) and w else w
                except (TypeError, ValueError):
                    swin = w
            if swin is not None:
                d["sim_window"] = swin
        elif m.get("sim_batch") or d.get("sim_batch"):
            d["sim_batch"] = m.get("sim_batch") or d.get("sim_batch")
        out.append(d)
    return out
