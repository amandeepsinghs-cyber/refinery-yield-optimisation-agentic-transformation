"""Modelling endpoints (contract §4): model comparison and calibration."""
from __future__ import annotations

import numpy as np
from fastapi import APIRouter
from scipy.special import ndtr

from ..config import MODEL_IDS, MODEL_META
from ..lttb import lttb_indices
from ..state import get_state
from .common import check_prop

router = APIRouter(prefix="/api")
NOMINAL = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]


def _r(x, n=4):
    return None if x is None or not np.isfinite(x) else round(float(x), n)


def _ds(n, max_points=2000):
    return np.arange(n) if n <= max_points else np.linspace(0, n - 1, max_points).astype(int)



def evaluate_drift_sentinel(residuals: np.ndarray, lab_residuals: list[float] | np.ndarray,
                            R: float = 7.0, k: float = 0.5, h: float = 5.0,
                            challenger_metrics: dict | None = None,
                            champion_metrics: dict | None = None) -> dict:
    residuals = np.asarray(residuals, dtype=float)
    valid_res = residuals[np.isfinite(residuals)]
    sig = float(np.std(valid_res)) if len(valid_res) else 1.0
    if sig == 0.0:
        sig = 1.0
    zs = np.nan_to_num(residuals / sig)
    n = len(zs)
    sp = np.zeros(n)
    sn = np.zeros(n)
    for i in range(1, n):
        sp[i] = max(0.0, sp[i - 1] + zs[i] - k)
        sn[i] = max(0.0, sn[i - 1] - zs[i] - k)
    cus = np.maximum(sp, sn)
    max_cusum = float(np.max(cus)) if n > 0 else 0.0
    cusum_alert = bool(max_cusum > h)
    first_breach_idx = int(np.argmax(cus > h)) if cusum_alert else None

    lab_residuals = np.asarray(lab_residuals, dtype=float)
    valid_lab = lab_residuals[np.isfinite(lab_residuals)]
    if len(valid_lab) >= 5:
        mean_last_5 = float(np.mean(valid_lab[-5:]))
    elif len(valid_res) >= 5:
        mean_last_5 = float(np.mean(valid_res[-5:]))
    else:
        mean_last_5 = 0.0

    retrain_proposed = False
    bias_reason = None
    if abs(mean_last_5) >= 0.5 * R:
        retrain_proposed = True
        bias_reason = f"Sustained residual bias ({mean_last_5:+.2f} °F >= 0.5R over last 5 labs) — challenger job proposed"

    promotion_status = "champion_active"
    if retrain_proposed and challenger_metrics and champion_metrics:
        cha_time = challenger_metrics.get("time_blocked_rmse", float('inf'))
        cha_loro = challenger_metrics.get("loro_rmse", float('inf'))
        champ_time = champion_metrics.get("time_blocked_rmse", 0.0)
        champ_loro = champion_metrics.get("loro_rmse", 0.0)
        
        if cha_time < champ_time and cha_loro < champ_loro:
            promotion_status = "pending_approval"

    return {
        "cusum_alert": cusum_alert,
        "max_cusum": max_cusum,
        "first_breach_idx": first_breach_idx,
        "retrain_proposed": retrain_proposed,
        "bias_reason": bias_reason,
        "promotion_status": promotion_status,
        "moc_required": promotion_status == "pending_approval"
    }


@router.get("/models")
def models(property: str | None = None):
    st = get_state()
    prop = check_prop(property)
    b = st.bundle
    if not b:
        return {"property": prop, "eval": {"runs": [], "n_minutes": 0, "note": "not trained yet: run `python -m app.train`"},
                "models": [], "mixture": {}}
    ev = b["evaluation"][prop]
    cards = b["cards"][prop]
    meta = b["meta"][prop]
    br = ev["members"]["bayes_ridge_v1"]["rmse"]
    out = []
    for j, mid in enumerate(MODEL_IDS):
        m, c = ev["members"][mid], cards[mid]
        w = 0.0
        if meta["admitted"][j]:
            inv = [1 / max(meta["val_mse"][k], (0.25 * st.s.sigma_lab) ** 2) if meta["admitted"][k] else 0 for k in range(len(MODEL_IDS))]
            w = inv[j] / sum(inv)
        out.append({"model_id": mid, "family": MODEL_META[mid]["family"], "label": MODEL_META[mid]["label"],
                    "color": MODEL_META[mid]["color"], "version": "v1",
                    "status": "admitted" if meta["admitted"][j] else "shadow", "admission_reason": meta["reasons"][mid],
                    "weight": round(w, 4), "rmse": _r(m["rmse"]), "mae": _r(m["mae"]), "bias": _r(m["bias"]),
                    "coverage90": _r(m["coverage90"]), "crps": _r(m["crps"]), "mean_sigma": _r(m["mean_sigma"]),
                    "rmse_ratio_to_ridge": _r(m["rmse"] / br if br else None),
                    "params": c.get("params", {}), "per_regime": m["per_regime"], "features": c.get("features", []),
                    "n_labels": c.get("n_labels"), "label_source": c.get("label_source"),
                    "training_runs": c.get("training_runs")})
    n_min = int(ev["members"]["bayes_ridge_v1"]["n"])
    return {"property": prop,
            "eval": {"runs": b["eval_runs"], "n_minutes": n_min, "note": b["note"], "trained_at": b["trained_at"],
                     "mode": b["mode"], "label_source": b["label_source"]},
            "models": out,
            "mixture": {k: _r(v) for k, v in ev["mixture"].items()},
            "gains": b["gains"][prop],
            "lags": _lags_for(b.get("lags"), prop)}


def _lags_for(table: dict | None, prop: str) -> dict | None:
    """A6 lag table for one property (additive field; None for bundles trained before lags existed)."""
    if not table:
        return None
    rows = (table.get("targets") or {}).get(prop, {})
    return {"enabled": bool(table.get("enabled")), "method": table.get("method"),
            "max_lag_min": table.get("max_lag_min"), "target_source": table.get("target_source"),
            "tags": [{"tag": t, "lag_min": r.get("lag_min"), "ccf": r.get("ccf"), "threshold": r.get("threshold"),
                      "significant": r.get("significant"), "n": r.get("n")}
                     for t, r in sorted(rows.items(), key=lambda kv: -abs(kv[1].get("ccf") or 0.0))]}


@router.get("/calibration")
def calibration(property: str | None = None):
    st = get_state()
    prop = check_prop(property)
    f = st.s.artifacts / f"eval_{prop}.npz"
    if not st.bundle or not f.exists():
        return {"parity": {}, "residuals": {"time_idx": []}, "pit": {"bins": []}, "reliability": {"nominal": NOMINAL},
                "coverage_over_time": {"time_idx": [], "mixture": []}, "gpr_relevance": [],
                "hybrid_decomposition": {"time_idx": [], "physics": [], "delta": []},
                "pinn_members": {"time_idx": [], "members": []}, "cusum": {"time_idx": [], "value": [], "h": None},
                "drift_sentinel": evaluate_drift_sentinel(np.array([]), np.array([])),
                "note": "not trained yet"}
    z = np.load(f)
    y = z["truth"]
    n = len(y)
    idx = _ds(n)
    ok = np.isfinite(y)
    parity, resid, pit, rel = {}, {"time_idx": idx.tolist()}, {"bins": [round(x, 1) for x in np.linspace(0, 1, 11)]}, {"nominal": NOMINAL}
    for mid in MODEL_IDS:
        mu, sd = z[f"mu|{mid}"], z[f"sigma|{mid}"]
        parity[mid] = {"pred": [round(float(v), 3) for v in mu[idx]], "truth": [round(float(v), 3) for v in y[idx]]}
        resid[mid] = [round(float(v), 3) for v in (mu - y)[idx]]
        u = ndtr((y[ok] - mu[ok]) / sd[ok])
        pit[mid] = np.histogram(u, bins=np.linspace(0, 1, 11))[0].tolist()
        zabs = np.abs((y[ok] - mu[ok]) / sd[ok])
        from scipy.stats import norm
        rel[mid] = [round(float(np.mean(zabs <= norm.ppf(0.5 + c / 2))), 4) for c in NOMINAL]
    # mixture reliability for the central intervals available (50% from q25/q75, 90% from q05/q95)
    rel["mixture"] = {"0.5": round(float(np.mean((y >= z["q25"]) & (y <= z["q75"]))), 4),
                      "0.9": round(float(np.mean((y >= z["q05"]) & (y <= z["q95"]))), 4)}
    cov = ((y >= z["q05"]) & (y <= z["q95"])).astype(float)
    win = min(60, max(1, n // 10))
    roll = np.convolve(cov, np.ones(win) / win, mode="same")
    # CUSUM (SDD-AGT-01): standardised mixture residual, k = 0.5, h = 5 (units of sigma)
    e = (z["mean"] - y)
    sig = np.nanstd(e) or 1.0
    zs = np.nan_to_num(e / sig)
    sp = np.zeros(n)
    sn = np.zeros(n)
    for i in range(1, n):
        sp[i] = max(0.0, sp[i - 1] + zs[i] - 0.5)
        sn[i] = max(0.0, sn[i - 1] - zs[i] - 0.5)
    cus = np.maximum(sp, sn)
    pm = z["pinn_members"]
    
    # We pass e (mixture residual) as residuals. lab_residuals is empty for now (since calibration is on test minutes)
    drift_sentinel = evaluate_drift_sentinel(e, np.array([]), R=st.s.R)
    
    return {"parity": parity, "residuals": resid, "pit": pit, "reliability": rel,
            "coverage_over_time": {"time_idx": idx.tolist(), "mixture": [round(float(v), 4) for v in roll[idx]], "window": win},
            "gpr_relevance": st.bundle["cards"][prop].get("gpr_relevance", [])[:15],
            "hybrid_decomposition": {"time_idx": idx.tolist(), "physics": [round(float(v), 3) for v in z["phys"][idx]],
                                     "delta": [round(float(v), 3) for v in z["delta"][idx]]},
            "pinn_members": {"time_idx": idx.tolist(), "members": [[round(float(v), 3) for v in row[idx]] for row in pm]},
            "cusum": {"time_idx": idx.tolist(), "value": [round(float(v), 3) for v in cus[idx]], "h": 5.0, "k": 0.5,
                      "units": "sigma of mixture residual"},
            "drift_sentinel": drift_sentinel,
            "index": {"run_id": z["run_id"][idx].tolist(), "time_min": z["time_min"][idx].tolist()},
            "crps": {mid: st.bundle["evaluation"][prop]["members"][mid]["crps"] for mid in MODEL_IDS} |
                    {"mixture": st.bundle["evaluation"][prop]["mixture"]["crps"]},
            "note": "Held-out minutes vs simulator truth. " + st.bundle["note"]}
