import json
import logging
from pathlib import Path
from functools import lru_cache
import joblib
import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge
from sklearn.preprocessing import StandardScaler, PolynomialFeatures
from sklearn.pipeline import Pipeline
from sklearn.metrics import r2_score

from app.state import get_state
from app.regimes import REGIME_IDS, regime_segments
from app.engines.regime import get_run_regimes

logger = logging.getLogger(__name__)

INPUTS = [
    "SP_T_preheat_F", "SP_T_riser_ROT_F", "Fair", "MV_PA1", "MV_PA2", "MV_PA3", 
    "MV_PA4", "MV_reflux_ratio", "SP_LCO_T98", "SP_HN_T98", "dist_feed_API", 
    "feed_flow_lb_s", "dist_T_feed_in_F", "dist_T_ambient_F"
]

OUTPUTS = [
    "prod_LCO", "prod_HN", "prod_LN", "prod_LPG", "F_coke", "F5_fuel", 
    "power_CAB", "power_WGC", "LCO_T98_F", "HN_T98_F", "conversion_pct", 
    "dT_cyc_reg_F", "T2_preheat_F", "eff_C5", "MV_cw_flow"
]

UNIT_PRIMARY_TAGS = {
    "unit_1_furnace": ["T2_preheat_F"],
    "unit_2_riser": ["conversion_pct"],
    "unit_3_regenerator": ["dT_cyc_reg_F", "Treg_F"],
    "unit_4_fractionator": ["LCO_T98_F", "HN_T98_F"],
    "unit_5_condenser": ["MV_cw_flow"],
    "unit_6_stabiliser": ["eff_C5"]
}

def _fit_surrogates():
    st = get_state()
    out_dir = st.s.artifacts / "engines"
    pkl_path = out_dir / "surrogates.pkl"
    card_path = out_dir / "surrogate_card.json"
    
    if pkl_path.exists() and card_path.exists():
        return
        
    logger.info("Fitting surrogates E2...")
    
    X_list = []
    Y_list = []
    regimes = []
    
    regimes_csv = st.s.data_root / st.s["data"]["primary_batch"] / "_staged" / "regimes.csv"
    if not regimes_csv.exists():
        logger.warning(f"Missing {regimes_csv}")
        return
    seg_df = pd.read_csv(regimes_csv)
    
    for run_id, info in st.catalog.runs.items():
        if info.batch != st.s["data"]["primary_batch"]:
            continue
        seed = None
        if "random_s" in run_id:
            try:
                seed = int(run_id.split("random_s")[-1])
            except ValueError:
                pass
        if seed is None or seed >= 140:
            continue
            
        df = st.catalog.load(run_id)
        if df.empty:
            continue
            
        run_segs = seg_df[seg_df["run_id"] == run_id]
        if run_segs.empty:
            continue
            
        for _, seg in run_segs.iterrows():
            if seg.get("transition_complete") is False:
                continue
            t_end = seg.get("transition_end_min")
            if pd.isna(t_end):
                t_end = seg.get("t_start_min", 0)
            t_end = int(t_end)
            
            mask = (df["time_min"] >= t_end)
            if mask.sum() > 0:
                sub_df = df[mask]
                sub_df = sub_df.iloc[::3]  # subsample every 3rd minute
                if len(sub_df) == 0:
                    continue
                    
                x = sub_df[INPUTS].to_numpy()
                y = sub_df[OUTPUTS].to_numpy()
                X_list.append(x)
                Y_list.append(y)
                regimes.extend([seg["regime_id"]] * len(sub_df))
                
    if not X_list:
        logger.warning("No data for surrogates")
        return
        
    X = np.vstack(X_list)
    Y = np.vstack(Y_list)
    regimes = np.array(regimes)
    
    models = {}
    card = {}
    
    # pooled model
    pooled = Pipeline([
        ('scaler', StandardScaler()),
        ('poly', PolynomialFeatures(degree=2, include_bias=False)),
        ('ridge', Ridge(alpha=1.0))
    ])
    pooled.fit(X, Y)
    
    for r in REGIME_IDS:
        mask = regimes == r
        if mask.sum() < 500:
            models[r] = pooled
            logger.info(f"Regime {r} has {mask.sum()} samples, falling back to pooled")
            continue
            
        Xr = X[mask]
        Yr = Y[mask]
        
        m = Pipeline([
            ('scaler', StandardScaler()),
            ('poly', PolynomialFeatures(degree=2, include_bias=False)),
            ('ridge', Ridge(alpha=1.0))
        ])
        m.fit(Xr, Yr)
        models[r] = m
        
        preds = m.predict(Xr)
        r2_vals = r2_score(Yr, preds, multioutput='raw_values')
        
        card[r] = {
            "name": "regime_surrogate_v1",
            "regime_id": r,
            "inputs": INPUTS,
            "outputs": OUTPUTS,
            "n_train_minutes": int(mask.sum()),
            "r2": {out: round(float(val), 2) for out, val in zip(OUTPUTS, r2_vals)}
        }
        
    out_dir.mkdir(parents=True, exist_ok=True)
    joblib.dump(models, pkl_path)
    with open(card_path, "w") as f:
        json.dump(card, f)

@lru_cache(maxsize=1)
def _load_surrogates():
    _fit_surrogates()
    st = get_state()
    out_dir = st.s.artifacts / "engines"
    pkl_path = out_dir / "surrogates.pkl"
    card_path = out_dir / "surrogate_card.json"
    if not pkl_path.exists() or not card_path.exists():
        return None, {}
    models = joblib.load(pkl_path)
    with open(card_path) as f:
        card = json.load(f)
    return models, card

def predict(regime_id: str, X_dict: dict) -> dict:
    models, _ = _load_surrogates()
    if not models:
        return {}
        
    m = models.get(regime_id)
    if not m:
        m = list(models.values())[0]
        
    # extract inputs in order
    X_arr = np.array([[X_dict.get(c, 0.0) for c in INPUTS]])
    pred = m.predict(X_arr)[0]
    return {c: float(v) for c, v in zip(OUTPUTS, pred)}

def expected_series(run_id: str, unit_id: str) -> dict:
    # return dict of tags -> expected series for this unit
    st = get_state()
    df = st.catalog.load(run_id)
    if df.empty:
        return {}
        
    tags = UNIT_PRIMARY_TAGS.get(unit_id, [])
    if not tags:
        return {}
        
    # U4 special case
    if unit_id == "unit_4_fractionator":
        v = st.run(run_id)
        if v is not None:
            arrs, _ = v
            # length might be different from df
            # but usually it's aligned. Wait, st.run(run_id) has `time_min`.
            out = {}
            for tag in tags:
                # "LCO_T98_F" -> "mean", "q05", "q95"
                if f"{tag}|mean" in arrs:
                    # we must align to df["time_min"]
                    t_est = arrs["time_min"]
                    t_df = df["time_min"].values
                    # map t_est to values
                    idx = np.searchsorted(t_est, t_df)
                    idx = np.clip(idx, 0, len(t_est) - 1)
                    # mask exact match
                    valid = (t_est[idx] == t_df)
                    
                    mean = arrs[f"{tag}|mean"][idx]
                    q05 = arrs[f"{tag}|q05"][idx]
                    q95 = arrs[f"{tag}|q95"][idx]
                    
                    mean[~valid] = np.nan
                    q05[~valid] = np.nan
                    q95[~valid] = np.nan
                    
                    out[f"expected:{tag}"] = mean.tolist()
                    out[f"band_lo:{tag}"] = q05.tolist()
                    out[f"band_hi:{tag}"] = q95.tolist()
            if out:
                return out
                
    # fallback to surrogate
    models, _ = _load_surrogates()
    if not models:
        return {}
        
    res = get_run_regimes(run_id)
    if res:
        det_regimes = res["detected_regime"]
    else:
        det_regimes = ["R3"] * len(df)
        
    X_all = df[INPUTS].fillna(0).to_numpy()
    
    preds_all = np.zeros((len(df), len(OUTPUTS)))
    for r in REGIME_IDS:
        mask = np.array([reg == r for reg in det_regimes])
        if mask.sum() > 0:
            m = models.get(r, list(models.values())[0])
            preds_all[mask] = m.predict(X_all[mask])
            
    out = {}
    for tag in tags:
        if tag in OUTPUTS:
            idx = OUTPUTS.index(tag)
            out[f"expected:{tag}"] = preds_all[:, idx].tolist()
            # for surrogate band, just use mean +- 2
            out[f"band_lo:{tag}"] = (preds_all[:, idx] - 2).tolist()
            out[f"band_hi:{tag}"] = (preds_all[:, idx] + 2).tolist()
            
    # For Treg_F which is in U3 but not in OUTPUTS, wait, is Treg_F in OUTPUTS? No, dT_cyc_reg_F is. 
    # Ah, U3 has 'dT_cyc_reg_F', 'Treg_F'.
    # If a tag is not in OUTPUTS, we can't predict it with surrogates.
    
    return out

def get_surrogate_card(regime_id: str) -> dict:
    _, card = _load_surrogates()
    return card.get(regime_id, {})
