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

def adaptation_at(run_id: str, time_min: int, prop: str) -> dict:
    reg_info = regime_at(run_id, time_min)
    if not reg_info:
        return {}
        
    p_regime = reg_info.get("p_regime", {})
    novelty = reg_info.get("novelty", 0.0)
    regime_id = reg_info.get("regime_id", "R3")
    
    train_w = _calc_train_weights()
    w_info = train_w.get(prop)
    if not w_info:
        w_info = {"global": {m: 0.25 for m in MEMBER_LABELS}, "by_regime": {r: {m: 0.25 for m in MEMBER_LABELS} for r in REGIME_IDS}}
        
    live_w = {}
    for m in MEMBER_LABELS:
        w = 0
        for r, p in p_regime.items():
            w += p * w_info["by_regime"][r][m]
        live_w[m] = w
        
    tot = sum(live_w.values())
    if not np.isfinite(tot) or tot <= 0:
        # no regime probabilities at this minute (e.g. the run's last minute): fall back to the global weights
        live_w = dict(w_info["global"])
        tot = sum(live_w.values()) or 1.0
    live_w = {m: v/tot for m, v in live_w.items()}
    
    w_hybrid = live_w["hybrid"]
    w_pinn = live_w["pinn"]
    physics_weight = np.clip(w_hybrid + w_pinn + novelty * (1 - w_hybrid - w_pinn), 0, 1)
    
    # bias reset at min
    # latest transition_end_min
    segs = reg_info.get("segments", [])
    bias_reset_at_min = None
    if segs:
        for s in reversed(segs):
            if s.get("transition_end_min") is not None and s.get("transition_end_min") <= time_min:
                bias_reset_at_min = s["transition_end_min"]
                break
                
    reason = f"Regime {regime_id} ({reg_info.get('regime_label', '')}) detected with novelty {novelty}: physics-anchored members carry {int(physics_weight*100)} % of the committee."
    
    weights_list = []
    for m, lbl in MEMBER_LABELS.items():
        by_r = {r: round(w_info["by_regime"][r][m], 2) for r in REGIME_IDS}
        weights_list.append({
            "member": m,
            "label": lbl,
            "weight": round(live_w[m], 2),
            "by_regime": by_r
        })
        
    return {
        "property": prop,
        "regime_id": regime_id,
        "novelty": novelty,
        "physics_weight": round(float(physics_weight), 2),
        "weights": weights_list,
        "bias_reset_at_min": bias_reset_at_min,
        "reason": reason
    }
