"""Regime engine E1 — crude-regime fingerprint classifier (SDD §1A E1, API_CONTRACT_v3 §1).

Per-minute EWMA fingerprint → Gaussian class posteriors per regime (fit on train seeds, `regime_fit.json`) → a
**settled** regime label: the detected regime only changes once the new regime has held the posterior argmax with
p ≥ `enter_posterior` for `dwell_min` consecutive minutes (default 15 min / 0.6). Without this the raw argmax flaps
~20× per run on ramps and noise; with it a real crude switch produces one `regime_change` and detection delay is the
dwell plus the fingerprint lag.
"""
import json
import logging
from functools import lru_cache
import numpy as np
import pandas as pd
from app.data.bq_source import staged_table

from app.state import get_state
from app.regimes import REGIME_IDS, REGIMES, regime_by_id, regime_segments

logger = logging.getLogger(__name__)

REGIME_FIT_VERSION = 3          # bump when the fingerprint, the fit or the settler changes (3: valid range + per-segment labels)
DEFAULT_DWELL_MIN, DEFAULT_ENTER_P = 15, 0.6


def _settings():
    st = get_state()
    cfg = dict(st.s.get("regime_engine", {}) or {})
    return int(cfg.get("dwell_min", DEFAULT_DWELL_MIN)), float(cfg.get("enter_posterior", DEFAULT_ENTER_P))


def settle_regimes(p_regime: np.ndarray, dwell_min: int, enter_p: float) -> list[str]:
    """Dwell + hysteresis filter over per-minute posteriors (n × len(REGIME_IDS)) → settled regime id per minute."""
    raw = p_regime.argmax(axis=1)
    cur, cand, count, out = int(raw[0]), None, 0, []
    for i in range(len(raw)):
        best = int(raw[i])
        if best == cur or p_regime[i, best] < enter_p:
            cand, count = None, 0
        else:
            count = count + 1 if best == cand else 1
            cand = best
            if count >= dwell_min:
                cur, cand, count = best, None, 0
        out.append(REGIME_IDS[cur])
    return out


def extract_features(df: pd.DataFrame) -> pd.DataFrame:
    """Extract EWMA (tau=10 min) fingerprint features."""
    out = pd.DataFrame(index=df.index)
    out["coke_per_feed"] = df["F_coke"] / df["feed_flow_lb_s"]
    out["riser_dT_F"] = df["Tr_riser_F"] - df["T2_preheat_F"]
    out["fuel_per_feed"] = df["F5_fuel"] / df["feed_flow_lb_s"]
    out["Treg_F"] = df["Treg_F"]
    out["conversion_pct"] = df["conversion_pct"]
    t13_20 = df[[f"T_tray{i:02d}_F" for i in range(13, 21)]].mean(axis=1)
    t01_06 = df[[f"T_tray{i:02d}_F" for i in range(1, 7)]].mean(axis=1)
    out["tray_dT_F"] = t13_20 - t01_06
    return out.ewm(com=10).mean()

def _fit_regime_model():
    st = get_state()
    out_dir = st.s.artifacts / "engines"
    fit_path = out_dir / "regime_fit.json"
    if fit_path.exists():
        return
        
    logger.info("Fitting regime E1 class models...")
    seg_df = staged_table(st.s, "regimes")      # BigQuery lakehouse (fcc_bronze.crude_regimes_raw) or local CSV
    if seg_df.empty:
        logger.warning("No crude segments (regimes) found")
        return
    features_list = []
    labels_list = []
    
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
            
        df = st.catalog.load_valid(run_id)
        if df.empty:
            continue
            
        run_segs = seg_df[seg_df["run_id"] == run_id]
        if run_segs.empty:
            continue
            
        feats = extract_features(df)
        for _, seg in run_segs.iterrows():
            if seg.get("transition_complete") is False:
                continue
            t_end = seg.get("transition_end_min")
            if pd.isna(t_end):
                t_end = seg.get("t_start_min", 0)
            t_end = int(t_end)
            seg_last = seg.get("t_end_min")
            mask = df["time_min"] >= t_end
            if not pd.isna(seg_last):
                mask &= df["time_min"] <= int(seg_last)     # this segment's minutes only (not to the end of the run)
            if mask.sum() > 0:
                features_list.append(feats[mask])
                labels_list.extend([seg["regime_id"]] * mask.sum())
                
    if not features_list:
        logger.warning("No data for E1 regime fit")
        return
        
    X = pd.concat(features_list, ignore_index=True).to_numpy()
    Y = np.array(labels_list)
    
    models = {}
    for r in REGIME_IDS:
        mask = Y == r
        if mask.sum() < 2:
            models[r] = {"mean": np.zeros(6).tolist(), "inv_cov": np.eye(6).tolist(), "det": 1.0}
            continue
        Xr = X[mask]
        mean = Xr.mean(axis=0)
        cov = np.cov(Xr, rowvar=False)
        # Shrinkage
        cov = cov + np.eye(Xr.shape[1]) * 1e-4
        models[r] = {
            "mean": mean.tolist(),
            "inv_cov": np.linalg.inv(cov).tolist(),
            "det": float(np.linalg.det(cov))
        }
        
    out_dir.mkdir(parents=True, exist_ok=True)
    with open(fit_path, "w") as f:
        json.dump(models, f)

@lru_cache(maxsize=1)
def _load_fit():
    _fit_regime_model()
    st = get_state()
    fit_path = st.s.artifacts / "engines" / "regime_fit.json"
    if not fit_path.exists():
        # dummy
        return {r: {"mean": np.zeros(6).tolist(), "inv_cov": np.eye(6).tolist(), "det": 1.0} for r in REGIME_IDS}
    with open(fit_path) as f:
        return json.load(f)

# per-run cache
_run_regime_cache = {}

def get_run_regimes(run_id: str):
    st = get_state()
    df = st.catalog.load(run_id)
    if df.empty:
        return None
        
    info = st.catalog.get(run_id)
    key = (info.mtime, info.size)
    if run_id in _run_regime_cache:
        cached_key, res = _run_regime_cache[run_id]
        if cached_key == key:
            return res
            
    models = _load_fit()
    feats = extract_features(df)
    X = feats.to_numpy()
    
    k = X.shape[1]
    p_densities = np.zeros((len(X), len(REGIME_IDS)))
    d2s = np.zeros((len(X), len(REGIME_IDS)))
    
    for j, r in enumerate(REGIME_IDS):
        mean = np.array(models[r]["mean"])
        inv_cov = np.array(models[r]["inv_cov"])
        det = models[r]["det"]
        
        diff = X - mean
        # (N, k) x (k, k) -> (N, k)
        # sum((N, k) * (N, k), axis=1) -> (N,)
        d2 = np.sum((diff @ inv_cov) * diff, axis=1)
        d2s[:, j] = d2
        p_densities[:, j] = np.exp(-0.5 * d2) / np.sqrt((2 * np.pi)**k * det)
        
    # sum of densities can be 0 if points are far, fallback to uniform
    s = p_densities.sum(axis=1, keepdims=True)
    s[s == 0] = 1.0
    p_regime = p_densities / s
    
    # novelty = 1 - exp(-d2_min / (2k))
    d2_min = d2s.min(axis=1)
    novelties = 1.0 - np.exp(-d2_min / (2 * k))
    
    # transition_pct, declared_vs_detected, etc.
    segs = regime_segments(df, run_id)
    dwell, enter_p = _settings()
    raw_regime = [REGIME_IDS[i] for i in p_regime.argmax(axis=1)]
    detected_regime = settle_regimes(p_regime, dwell, enter_p)

    res = {
        "time_min": df["time_min"].tolist(),
        "p_regime": p_regime,
        "novelties": novelties,
        "detected_regime": detected_regime,
        "raw_regime": raw_regime,
        "settler": {"dwell_min": dwell, "enter_posterior": enter_p, "version": REGIME_FIT_VERSION},
        "features": feats,
        "segs": segs,
        "df": df
    }
    _run_regime_cache[run_id] = (key, res)
    return res

def regime_at(run_id: str, time_min: int | None) -> dict:
    res = get_run_regimes(run_id)
    if not res:
        return {}
    
    t_arr = np.array(res["time_min"])
    if time_min is None:
        idx = len(t_arr) - 1
    else:
        idx = np.searchsorted(t_arr, int(time_min))
        idx = min(max(idx, 0), len(t_arr) - 1)
        
    t = int(t_arr[idx])
    
    segs = res["segs"]
    current_seg = segs[segs["t_end_min"] >= t].iloc[0] if not segs[segs["t_end_min"] >= t].empty else segs.iloc[-1]
    
    declared_api = current_seg["api_target"]
    declared_regime_id = current_seg["regime_id"]
    
    det_reg_id = res["detected_regime"][idx]
    det_reg = regime_by_id(det_reg_id)
    
    # declared_vs_detected: match, lagging, mismatch
    # mismatch if differing for > 30 min after ramp ends
    # lagging while the fingerprint votes previous regime during a ramp
    # Need history to calculate this accurately.
    # We will trace backward to find the latest switch.
    
    # Find latest switch in segs up to t
    past_segs = segs[segs["t_start_min"] <= t]
    detected_at_min = None
    detection_delay_min = None
    
    if len(past_segs) > 1:
        prev_seg = past_segs.iloc[-2]
        latest_switch_end = current_seg["transition_end_min"]
        if pd.isna(latest_switch_end):
            latest_switch_end = current_seg["t_start_min"]
            
        ramp_start = current_seg["transition_start_min"]
        
        # When did it switch to the current detected regime?
        det_arr = np.array(res["detected_regime"])[:idx+1]
        t_hist = t_arr[:idx+1]
        
        # Find first time it consistently became det_reg_id after ramp_start?
        # A simple approach: find the first time after ramp_start it switched to det_reg_id and stayed
        after_ramp = (t_hist >= ramp_start) if not pd.isna(ramp_start) else (t_hist >= 0)
        idx_after = np.where(after_ramp)[0]
        if len(idx_after):
            # check the switches
            changed_to_new = (det_arr[idx_after[0]:] == declared_regime_id)
            if changed_to_new.any():
                detected_at_min = int(t_hist[idx_after[changed_to_new.argmax()]])
                if not pd.isna(latest_switch_end):
                    detection_delay_min = int(detected_at_min - latest_switch_end)
                    
        # declared vs detected
        if declared_regime_id == det_reg_id:
            d_vs_d = "match"
        else:
            if not pd.isna(latest_switch_end) and t <= latest_switch_end + 30:
                d_vs_d = "lagging"
            else:
                d_vs_d = "mismatch"
                
        # transition_pct
        pct = 100
        if not pd.isna(ramp_start) and not pd.isna(latest_switch_end):
            if t < ramp_start:
                pct = 0
            elif t >= latest_switch_end:
                pct = 100
            else:
                pct = int(100 * (t - ramp_start) / (latest_switch_end - ramp_start))
    else:
        d_vs_d = "match" if declared_regime_id == det_reg_id else "mismatch"
        pct = 100
        
    p_dict = {r: float(res["p_regime"][idx, i]) for i, r in enumerate(REGIME_IDS)}
    
    feats = res["features"].iloc[idx]
    
    from app.engines import scripted  # local: scripted imports regime lazily
    return scripted.regime({
        "run_id": run_id,
        "time_min": t,
        "regime_id": det_reg_id,
        "regime_label": det_reg.label,
        "p_regime": p_dict,
        "novelty": round(float(res["novelties"][idx]), 2),
        "transition_pct": pct,
        "declared_api": round(float(declared_api), 1),
        "declared_regime_id": declared_regime_id,
        "declared_vs_detected": d_vs_d,
        "fingerprint": {
            "coke_per_feed": round(float(feats["coke_per_feed"]), 4),
            "riser_dT_F": round(float(feats["riser_dT_F"]), 1),
            "fuel_per_feed": round(float(feats["fuel_per_feed"]), 3),
            "Treg_F": round(float(feats["Treg_F"]), 1),
            "conversion_pct": round(float(feats["conversion_pct"]), 1),
            "tray_dT_F": round(float(feats["tray_dT_F"]), 1)
        },
        "segments": [
            {
                "crude_id": int(r["crude_id"]),
                "regime_id": r["regime_id"],
                "t_start_min": int(r["t_start_min"]),
                "t_end_min": int(r["t_end_min"]),
                "transition_start_min": int(r["transition_start_min"]) if pd.notna(r["transition_start_min"]) else None,
                "transition_end_min": int(r["transition_end_min"]) if pd.notna(r["transition_end_min"]) else None
            } for _, r in segs.iterrows()
        ],
        "detected_at_min": detected_at_min,
        "detection_delay_min": detection_delay_min
    })

def regime_timeseries(run_id: str, step: int = 5) -> dict:
    res = get_run_regimes(run_id)
    if not res:
        return {}
    
    t_arr = np.array(res["time_min"])
    # downsample
    t_ds = t_arr[::step]
    idx_ds = np.arange(len(t_arr))[::step]
    
    df = res["df"]
    segs = res["segs"]
    api = df["dist_feed_API"].values
    api_ds = api[idx_ds]
    
    p_reg = res["p_regime"][idx_ds]
    p_dict = {r: p_reg[:, i].tolist() for i, r in enumerate(REGIME_IDS)}
    
    return {
        "time_min": t_ds.tolist(),
        "regime_id": [res["detected_regime"][i] for i in idx_ds],
        "novelty": res["novelties"][idx_ds].tolist(),
        "declared_api": [round(float(v), 1) for v in api_ds],
        "p_regime": p_dict
    }


@lru_cache(maxsize=1)
def holdout_score() -> dict:
    """How often the classifier names the right crude 45 min after a crude switch, on the held-out runs
    (seed >= training.test_seed_min). Shown next to the crude classifier so its accuracy can be checked."""
    st = get_state()
    seg_df = staged_table(st.s, "regimes")
    if seg_df.empty:
        return {}
    test_min = int(st.s["training"].get("test_seed_min", 140))
    correct = total = 0
    for run_id in st.catalog.runs:
        if "random_s" not in run_id:
            continue
        try:
            if int(run_id.split("random_s")[-1]) < test_min:
                continue
        except ValueError:
            continue
        segs = seg_df[(seg_df["run_id"] == run_id) & (seg_df["transition_complete"] == True)]  # noqa: E712
        for _, seg in segs.iterrows():
            if pd.isna(seg.get("transition_end_min")):
                continue
            reg = regime_at(run_id, int(seg["transition_end_min"]) + 45)
            correct += int(bool(reg) and reg.get("regime_id") == seg["regime_id"])
            total += 1
    return {"correct": correct, "total": total, "rate": round(correct / total, 3) if total else None,
            "what": "held-out crude switches named correctly 45 min after the switch"}
