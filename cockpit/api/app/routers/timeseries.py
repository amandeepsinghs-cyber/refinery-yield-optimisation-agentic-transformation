"""Time series and minute detail (contract §2, §3)."""
from __future__ import annotations

import numpy as np
from fastapi import APIRouter, HTTPException, Query

from ..config import MODEL_IDS
from ..dist import mix_cdf, mix_pdf_grid
from ..lttb import lttb_indices
from ..state import get_state, r2, r3
from ..pipeline import prepare
from .common import check_prop, check_run, window_mask

router = APIRouter(prefix="/api")


def _clean(a) -> list:
    a = np.asarray(a, dtype=float)
    return [None if not np.isfinite(v) else round(float(v), 4) for v in a]


def _labs(st, run_id, prop=None):
    v = st.run(run_id)
    labs = v[1]["labs"] if v else [dict(l, status="UNSCORED") for l in st.catalog.raw_labs(run_id)]
    return [{"time_min": l["time_min"], "property": l["property"], "value": l["value"], "status": l["status"],
             "lims_time_min": l["lims_time_min"], "recorded_draw_time_min": l["recorded_draw_time_min"],
             "true_value": l["true_value"], "injected_error": l["injected_error"],
             "status_reason": l.get("status_reason")} for l in labs if prop is None or l["property"] == prop]


@router.get("/runs/{run_id}/timeseries")
def run_timeseries(run_id: str, cols: str = "", frm: int | None = Query(None, alias="from"), to: int | None = None,
                   max_points: int = 2000):
    st = get_state()
    run_id = check_run(run_id)
    df = st.catalog.load(run_id)
    t = df["time_min"].to_numpy()
    m = window_mask(t, frm, to)
    want = [c.strip() for c in cols.split(",") if c.strip()] or ["T_tray13_F", "T_tray06_F", "LCO_T98_F", "HN_T98_F"]
    missing = [c for c in want if c not in df.columns]
    want = [c for c in want if c in df.columns]
    tt = t[m]
    idx = np.arange(len(tt))
    down = False
    if len(tt) > max_points and want:
        idx = lttb_indices(tt, df[want[0]].to_numpy()[m], max_points)
        down = True
    series = {c: _clean(df[c].to_numpy()[m][idx]) for c in want}
    lo, hi = (int(tt.min()), int(tt.max())) if len(tt) else (0, -1)
    events = [e for e in st.catalog.events(run_id) if e["time_min"] + e["duration"] >= lo and e["time_min"] <= hi]
    labs = [l for l in _labs(st, run_id) if lo <= l["time_min"] <= hi]
    note = None
    if missing:
        note = f"columns not in this run: {missing}"
    if not len(tt):
        note = "no simulated minutes in the requested window"
    return {"run_id": run_id, "time_min": [int(x) for x in tt[idx]], "series": series, "events": events, "labs": labs,
            "downsampled": down, "note": note,
            "provenance": {"source": "simulated", "batch_id": st.catalog.get(run_id).batch, "run_id": run_id}}


@router.get("/estimates/timeseries")
def estimates_timeseries(run_id: str | None = None, property: str | None = None,
                         frm: int | None = Query(None, alias="from"), to: int | None = None, max_points: int = 2000):
    st = get_state()
    run_id, prop = check_run(run_id), check_prop(property)
    v = st.run(run_id)
    base = {"run_id": run_id, "property": prop, "spec_max": st.s.spec_max(prop), "w90_limit": st.s.w90_max}
    if not v:
        return {**base, "time_min": [], "truth": [], "members": {}, "mixture": {}, "w90": [], "bimodality_d": [],
                "gate": [], "gate_reason": [], "trust": [], "labs": [], "events": [],
                "note": "run not scored yet (train, or POST /api/admin/reload to score new runs)"}
    arrs, meta = v
    t = arrs["time_min"]
    m = np.where(window_mask(t, frm, to))[0]
    P = lambda k: arrs[f"{prop}|{k}"]  # noqa: E731
    idx = m
    down = False
    if len(m) > max_points:
        idx = m[lttb_indices(t[m], P("mean")[m], max_points)]
        down = True
    members = {mid: {"mu": _clean(P("mu")[idx, j]), "sigma": _clean(P("sigma")[idx, j]), "weight": _clean(P("weight")[idx, j]),
                     "admitted": bool(P("admitted")[j])} for j, mid in enumerate(MODEL_IDS)}
    lo, hi = (int(t[m].min()), int(t[m].max())) if len(m) else (0, -1)
    return {**base, "time_min": [int(x) for x in t[idx]], "truth": _clean(P("truth")[idx]), "truth_label": "simulator truth",
            "members": members,
            "mixture": {k: _clean(P(k)[idx]) for k in ("mean", "q05", "q25", "q50", "q75", "q95")},
            "w90": _clean(P("w90")[idx]), "bimodality_d": _clean(P("bimodality_d")[idx]),
            "gate": [str(x) for x in P("gate")[idx]], "gate_reason": [str(x) or None for x in P("gate_reason")[idx]],
            "trust": [str(x) for x in P("trust")[idx]], "bias": _clean(P("bias")[idx]),
            "p_on_spec": _clean(P("p_on_spec")[idx]),
            "labs": [l for l in _labs(st, run_id, prop) if lo <= l["time_min"] <= hi],
            "events": [e for e in st.catalog.events(run_id) if e["time_min"] + e["duration"] >= lo and e["time_min"] <= hi],
            "downsampled": down, "note": None,
            "provenance": {"source": "simulated", "batch_id": meta.get("batch"), "run_id": run_id, "scored_by": meta.get("scored_by")}}


@router.get("/estimate")
def estimate(run_id: str | None = None, property: str | None = None, time_min: int | None = None):
    st = get_state()
    run_id, prop = check_run(run_id), check_prop(property)
    msg = st.estimate_message(run_id, prop, time_min)
    if msg is None:
        raise HTTPException(404, detail="run not scored yet")
    return msg


@router.get("/estimates")
def estimates(run_id: str | None = None, property: str | None = None, frm: int | None = Query(None, alias="from"),
              to: int | None = None, limit: int = 500):
    st = get_state()
    run_id, prop = check_run(run_id), check_prop(property)
    v = st.run(run_id)
    if not v:
        return []
    t = v[0]["time_min"]
    ts = [int(x) for x in t[window_mask(t, frm, to)]][:limit]
    return [st.estimate_message(run_id, prop, x) for x in ts]


@router.get("/distribution")
def distribution(run_id: str | None = None, property: str | None = None, time_min: int | None = None):
    st = get_state()
    run_id, prop = check_run(run_id), check_prop(property)
    v = st.run(run_id)
    if not v:
        raise HTTPException(404, detail="run not scored yet")
    arrs, _ = v
    i = st.index_of(arrs, time_min)
    P = lambda k: arrs[f"{prop}|{k}"]  # noqa: E731
    mu, sg, w, adm = P("mu")[i], P("sigma")[i], P("weight")[i], P("admitted")
    b, Pv = float(P("bias")[i]), float(P("bias_var")[i])
    m, s_ = mu + b, np.sqrt(sg ** 2 + Pv)
    lo, hi = float(P("q01")[i]) - 3, float(P("q99")[i]) + 3
    lo = min(lo, float(np.min(m - 3 * s_)))
    hi = max(hi, float(np.max(m + 3 * s_)))
    grid = np.linspace(lo, hi, int(st.s["mixture"]["grid_points"]))
    comp, mix = mix_pdf_grid(grid, m, s_, w)
    spec = st.s.spec_max(prop)
    p_on = float(mix_cdf(np.array([spec]), m[None], s_[None], w[None])[0])
    gm = str(P("gate_message")[i]) or None
    truth = float(P("truth")[i])
    return {"run_id": run_id, "property": prop, "time_min": int(arrs["time_min"][i]),
            "grid": [round(float(x), 3) for x in grid],
            "members": {mid: {"pdf": [round(float(x), 6) for x in comp[j]], "mu": r2(m[j]), "sigma": r2(s_[j]),
                              "mu_raw": r2(mu[j]), "sigma_raw": r2(sg[j]), "weight": r3(w[j]),
                              "admitted": bool(adm[j]), "shadow": not bool(adm[j])} for j, mid in enumerate(MODEL_IDS)},
            "mixture": {"pdf": [round(float(x), 6) for x in mix], "mean": r2(P("mean")[i]), "q05": r2(P("q05")[i]),
                        "q25": r2(P("q25")[i]), "q50": r2(P("q50")[i]), "q75": r2(P("q75")[i]), "q95": r2(P("q95")[i]),
                        "p_on_spec": round(p_on, 4)},
            "w90": r2(P("w90")[i]), "bimodality_d": r2(P("bimodality_d")[i]), "bimodal": bool(P("bimodal")[i]),
            "bias": {"b": r3(b), "var": r3(Pv)},
            "gate": {"status": str(P("gate")[i]), "reason": str(P("gate_reason")[i]) or None, "message": gm},
            "trust": {"level": str(P("trust")[i]), "reason": str(P("trust_reason")[i])},
            "spec_max": spec, "w90_limit": st.s.w90_max,
            "truth": None if not np.isfinite(truth) else round(truth, 2), "truth_label": "simulator truth",
            "note": "member pdfs include the Kalman bias b and its variance P (SDD §5.7)"}


@router.get("/labs")
def api_labs(run_id: str | None = None, property: str | None = None):
    st = get_state()
    run_id = check_run(run_id)
    prop = check_prop(property) if property else None
    
    labs = _labs(st, run_id, prop)
    v = st.run(run_id)
    
    if v:
        arrs, _ = v
        for l in labs:
            p = l["property"]
            try:
                idx = st.index_of(arrs, l["time_min"])
                est = float(arrs[f"{p}|mean"][idx])
                l["estimate_at_draw"] = round(est, 2)
                l["residual_F"] = round(l["value"] - est, 2)
            except KeyError:
                pass
            
    summary = {
        "total": len(labs),
        "accepted": sum(1 for l in labs if l["status"] == "ACCEPT"),
        "held": sum(1 for l in labs if l["status"] == "HOLD"),
        "rejected": sum(1 for l in labs if l["status"] == "REJECT"),
        "injected_errors": sum(1 for l in labs if l.get("injected_error", "none") != "none")
    }
    
    return {
        "run_id": run_id,
        "reproducibility_F": st.s.R,
        "labs": labs,
        "summary": summary,
        "provenance": {"source": "simulated", "batch_id": st.catalog.get(run_id).batch, "run_id": run_id}
    }

@router.get("/dq")
def api_dq(run_id: str | None = None):
    st = get_state()
    run_id = check_run(run_id)
    df = st.catalog.load(run_id)
    df_prep = prepare(df, st.s)
    
    if st.final is None:
        raise HTTPException(500, "Model not trained")
        
    df_lagged = st.final.lagged(df_prep)
    t2_ratio, spe_ratio = st.final.novelty.evaluate(df_lagged)
    
    t2_limit = st.final.novelty.t2_lim
    spe_limit = st.final.novelty.spe_lim
    
    t2 = t2_ratio * t2_limit
    spe = spe_ratio * spe_limit
    
    tags_out = []
    for tag in st.final.dq.tags:
        if tag not in df_lagged.columns:
            continue
        x = df_lagged[tag].to_numpy(dtype=float)
        lo, hi, thr, span = st.final.dq.lims[tag]
        
        missing = int(np.sum(~np.isfinite(x)))
        bad = (x < lo) | (x > hi)
        out_of_range = int(np.sum(bad & np.isfinite(x)))
        d = np.abs(np.diff(x, prepend=x[0]))
        spikes = int(np.sum((d > thr) & np.isfinite(x)))
        
        missing_pct = round(missing / len(x) * 100, 1) if len(x) > 0 else 0
        
        status = "OK"
        if missing_pct > 10 or spikes > 10 or out_of_range > 10:
            status = "FAIL"
        elif missing_pct > 0 or spikes > 0 or out_of_range > 0:
            status = "WARN"
            
        group = "Process"
        if "T_" in tag or "_T" in tag:
            group = "Temperature"
        elif "P_" in tag or "_P" in tag:
            group = "Pressure"
        elif "F_" in tag or "_F" in tag:
            group = "Flow"
            
        tags_out.append({
            "tag": tag,
            "group": group,
            "missing_pct": missing_pct,
            "spike_count": spikes,
            "out_of_range_count": out_of_range,
            "status": status
        })
        
    return {
        "run_id": run_id,
        "time_min": df["time_min"].tolist(),
        "t2": _clean(t2),
        "t2_limit": round(float(t2_limit), 2),
        "spe": _clean(spe),
        "spe_limit": round(float(spe_limit), 2),
        "tags": tags_out,
        "provenance": {"source": "simulated", "batch_id": st.catalog.get(run_id).batch, "run_id": run_id}
    }
