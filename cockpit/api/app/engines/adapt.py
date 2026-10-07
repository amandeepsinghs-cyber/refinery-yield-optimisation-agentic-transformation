import json
import logging
import numpy as np
import pandas as pd
from app.data.bq_source import staged_table
from functools import lru_cache

from app.state import get_state
from app.regimes import REGIME_IDS
from app.engines.regime import regime_at

logger = logging.getLogger(__name__)

MEMBER_LABELS = {
    "ridge": "Bayesian ridge",
    "hybrid": "Hybrid delta",
    "pinn": "PINN ensemble",
    "gpr": "GPR"
}

def crps_gaussian(mu, sigma, truth):
    # approximation or simple CRPS formula
    # crps = sigma * (x * (2 * Phi(x) - 1) + 2 * phi(x) - 1 / sqrt(pi))
    # where x = (truth - mu) / sigma
    from scipy.stats import norm
    if sigma < 1e-6:
        return np.abs(truth - mu)
    x = (truth - mu) / sigma
    phi_x = norm.pdf(x)
    Phi_x = norm.cdf(x)
    return sigma * (x * (2 * Phi_x - 1) + 2 * phi_x - 1 / np.sqrt(np.pi))

@lru_cache(maxsize=1)
def _calc_train_weights():
    st = get_state()
    df = staged_table(st.s, "lab_results")      # BigQuery lakehouse (fcc_bronze.lab_results_raw) or local CSV
    if df.empty:
        return {}
    # Filter to train runs
    train_runs = [r for r in st.catalog.runs if "random_s" in r and int(r.split("random_s")[-1]) < 140]
    df = df[df["run_id"].isin(train_runs)]
    
    props = ["LCO_T98_F", "HN_T98_F"]
    out = {p: {"global": {}, "by_regime": {}} for p in props}
    
    for prop in props:
        d = df[df[prop].notna()]
        member_crps = {m: [] for m in MEMBER_LABELS}
        member_regime_crps = {r: {m: [] for m in MEMBER_LABELS} for r in REGIME_IDS}
        
        for run_id, g in d.groupby("run_id"):
            v = st.run(run_id)
            if not v:
                continue
            arrs, meta = v
            t_est = arrs["time_min"]
            mu = arrs[f"{prop}|mu"]
            sigma = arrs[f"{prop}|sigma"]
            
            for _, row in g.iterrows():
                t = int(row["time_min"])
                truth = row[prop]
                r_id = row.get("regime_id", "R3")
                
                idx = np.searchsorted(t_est, t)
                if idx >= len(t_est): idx = len(t_est) - 1
                
                for j, mid in enumerate(MEMBER_LABELS):
                    val = crps_gaussian(mu[idx, j], sigma[idx, j], truth)
                    if not np.isnan(val):
                        member_crps[mid].append(val)
                        member_regime_crps[r_id][mid].append(val)
                        
        # compute weights
        # weight propto exp(-mean_crps)
        def _get_w(crps_dict):
            m_c = {m: np.mean(v) for m, v in crps_dict.items() if v}
            if len(m_c) != 4:
                return {m: 0.25 for m in MEMBER_LABELS}
            c0 = min(m_c.values())   # shift before exp so large CRPS values do not underflow to 0/0
            w = {m: np.exp(-(c - c0)) for m, c in m_c.items()}
            tot = sum(w.values())
            if not np.isfinite(tot) or tot <= 0:
                return {m: 0.25 for m in MEMBER_LABELS}
            return {m: v/tot for m, v in w.items()}
            
        out[prop]["global"] = _get_w(member_crps)
        for r in REGIME_IDS:
            if len(member_regime_crps[r]["ridge"]) >= 5:
                out[prop]["by_regime"][r] = _get_w(member_regime_crps[r])
            else:
                out[prop]["by_regime"][r] = out[prop]["global"]
                
    return out

MEMBER_OF_MODEL = {"bayes_ridge_v1": "ridge", "gpr_v1": "gpr", "hybrid_delta_v1": "hybrid", "pinn_ens_v1": "pinn"}
WEIGHT_SOURCE_TEXT = {"recent_labs": "accuracy against the most recent accepted lab results in this run",
                      "out_of_fold": "accuracy on training runs held out from each fit (too few lab results in this run yet)"}


def adaptation_at(run_id: str, time_min: int, prop: str) -> dict:
    """The committee weights the estimate actually uses at this minute (pipeline.committee_weights: 1/MSE over the
    last accepted labs, else out-of-fold; ridge kept as a reference at weight 0), plus the crude family and the last
    bias reset. 7 Oct: replaces the earlier regime-blended display weights, which the estimate never used."""
    from app.config import MODEL_IDS
    st = get_state()
    reg_info = regime_at(run_id, time_min) or {}
    regime_id = reg_info.get("regime_id")
    novelty = reg_info.get("novelty", 0.0)
    v = st.run(run_id)
    live_w: dict[str, float] = {m: 0.0 for m in MEMBER_LABELS}
    admitted: dict[str, bool] = {m: False for m in MEMBER_LABELS}
    src = None
    bias = None
    if v:
        arrs, _meta = v
        j = st.index_of(arrs, int(time_min))
        w = arrs.get(f"{prop}|weight")
        adm = arrs.get(f"{prop}|admitted")
        ws = arrs.get(f"{prop}|weight_source")
        bs = arrs.get(f"{prop}|bias")
        if w is not None and j < len(w):
            for i, mid in enumerate(MODEL_IDS[: w.shape[1]]):
                m = MEMBER_OF_MODEL.get(mid)
                if m:
                    live_w[m] = float(w[j][i])
                    admitted[m] = bool(adm[i]) if adm is not None and i < len(adm) else live_w[m] > 0
        if ws is not None and j < len(ws):
            src = str(ws[j])
        if bs is not None and j < len(bs):
            bias = round(float(bs[j]), 2)
    physics_weight = live_w["hybrid"] + live_w["pinn"]

    segs = reg_info.get("segments", [])
    bias_reset_at_min = None
    for sg in reversed(segs or []):
        if sg.get("transition_end_min") is not None and sg.get("transition_end_min") <= time_min:
            bias_reset_at_min = sg["transition_end_min"]
            break

    src_txt = WEIGHT_SOURCE_TEXT.get(src, src or "held-out accuracy")
    reason = (f"Weights come from each model's {src_txt}. Bayesian ridge is shown for reference only (weight 0). "
              f"The crude family ({regime_id or 'unknown'} {reg_info.get('regime_label') or ''}".rstrip()
              + ") is used for the labels-for-this-crude check and the bias reset, not to set the weights.")
    weights_list = [{"member": m, "label": lbl, "weight": round(live_w[m], 4),
                     "role": "blended" if live_w[m] > 0 else "reference",
                     "by_regime": None}   # kept for the payload shape; weights are not regime-based
                    for m, lbl in MEMBER_LABELS.items()]
    return {
        "property": prop,
        "regime_id": regime_id,
        "novelty": novelty,
        "physics_weight": round(float(physics_weight), 2),
        "weights": weights_list,
        "weight_source": src,
        "weight_source_text": src_txt,
        "bias_F": bias,
        "bias_reset_at_min": bias_reset_at_min,
        "reason": reason,
    }
