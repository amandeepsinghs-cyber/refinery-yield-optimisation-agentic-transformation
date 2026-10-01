import json
import logging
import sqlite3
import numpy as np
import pandas as pd
from typing import Optional

from app.state import get_state
from app.engines.surrogates import expected_series, INPUTS, OUTPUTS, _load_surrogates
from app.engines.regime import get_run_regimes

logger = logging.getLogger(__name__)

UNIT_PRIMARY_TAGS = {
    "unit_1_furnace": ["T2_preheat_F"],
    "unit_2_riser": ["conversion_pct"],
    "unit_3_regenerator": ["dT_cyc_reg_F", "Treg_F"],
    "unit_4_fractionator": ["LCO_T98_F", "HN_T98_F"],
    "unit_5_condenser": ["MV_cw_flow"],
    "unit_6_stabiliser": ["eff_C5"]
}

def get_cusum(residual: np.ndarray, k_val: np.ndarray) -> np.ndarray:
    pos = np.zeros_like(residual)
    neg = np.zeros_like(residual)
    for i in range(1, len(residual)):
        pos[i] = max(0, pos[i-1] + residual[i] - k_val[i])
        neg[i] = max(0, neg[i-1] - residual[i] - k_val[i])
    return pos, neg

def compute_detect(run_id: str):
    st = get_state()
    df = st.catalog.load(run_id)
    if df.empty:
        return
        
    con = st.db
    cur = con.execute("SELECT COUNT(*) FROM agent_events WHERE run_id=?", (run_id,))
    if cur.fetchone()[0] > 0:
        return # already computed
        
    models, _ = _load_surrogates()
    regimes_info = get_run_regimes(run_id)
    det_regimes = regimes_info["detected_regime"] if regimes_info else ["R3"] * len(df)
    
    events = []
    
    # 1. Regime changes
    for i in range(1, len(det_regimes)):
        if det_regimes[i] != det_regimes[i-1]:
            t = int(df["time_min"].iloc[i])
            r1, r2 = det_regimes[i-1], det_regimes[i]
            events.append({
                "event_id": f"ev_{run_id}_reg_{t}", "run_id": run_id, "time_min": t,
                "unit_id": None, "use_case_id": "UC-REG", "tag": "regime", 
                "kind": "regime_change", "severity": "info",
                "payload": {"label": f"Crude switch (regime {r1} to {r2})"},
                "status": "closed", "ts": st.ts(t)
            })
            

    # Rules
    t_min = df["time_min"].values
    
    # U1 Combustion
    if "fluegas_CO_ppm" in df.columns and "fluegas_O2_pct" in df.columns:
        co = df["fluegas_CO_ppm"].values
        o2 = df["fluegas_O2_pct"].values
        for i in range(10, len(df)):
            if co[i] - co[i-10] > 50 and abs(o2[i] - o2[i-10]) < 0.2:
                if i % 60 == 0:
                    t = int(t_min[i])
                    events.append({
                        "event_id": f"ev_{run_id}_comb_{t}", "run_id": run_id, "time_min": t,
                        "unit_id": "unit_1_furnace", "use_case_id": "UC-COMB", "tag": "fluegas_CO_ppm",
                        "kind": "combustion", "severity": "warn",
                        "payload": {"briefing": {"en": "Combustion issue detected.", "hinglish": "Combustion issue hai.", "hi": "दहन समस्या पाई गई।"}},
                        "status": "open", "ts": st.ts(t)
                    })
                    
    # U4 Flooding
    if "dP_reactor_frac" in df.columns and "T_tray13_F" in df.columns and "T_tray06_F" in df.columns:
        dp = df["dP_reactor_frac"].values
        t13 = df["T_tray13_F"].values
        t06 = df["T_tray06_F"].values
        for i in range(10, len(df)):
            if dp[i] - dp[i-10] > 0.5 and (t13[i] - t06[i]) < (t13[i-10] - t06[i-10]) - 5:
                if i % 60 == 0:
                    t = int(t_min[i])
                    events.append({
                        "event_id": f"ev_{run_id}_flood_{t}", "run_id": run_id, "time_min": t,
                        "unit_id": "unit_4_fractionator", "use_case_id": "UC-FLOOD", "tag": "dP_reactor_frac",
                        "kind": "flooding_pattern", "severity": "warn",
                        "payload": {"briefing": {"en": "Flooding pattern detected.", "hinglish": "Flooding pattern hai.", "hi": "फ्लडिंग पैटर्न पाया गया।"}},
                        "status": "open", "ts": st.ts(t)
                    })

                    
    # 2. Residual breaches and cusum
    for unit_id, tags in UNIT_PRIMARY_TAGS.items():
        exp = expected_series(run_id, unit_id)
        if not exp:
            continue
            
        for tag in tags:
            if tag not in df.columns or f"expected:{tag}" not in exp:
                continue
                
            meas = df[tag].values
            e = np.array(exp[f"expected:{tag}"])
            res = meas - e
            
            # MAD trailing 240
            sigma = np.zeros_like(res)
            for i in range(len(res)):
                start = max(0, i - 240)
                window = res[start:i+1]
                mad = np.median(np.abs(window - np.median(window)))
                s = mad * 1.4826
                sigma[i] = max(0.5, s) # floor
                
            pos, neg = get_cusum(res, 0.5 * sigma)
            cusum_val = np.maximum(pos, neg)
            
            breach_mask = np.abs(res) > 3 * sigma
            cusum_mask = cusum_val > 5 * sigma
            
            # trigger points
            trigger = np.zeros(len(res), dtype=bool)
            trigger[1:] = (breach_mask[1:] & ~breach_mask[:-1]) | (cusum_mask[1:] & ~cusum_mask[:-1])
            
            for i in np.where(trigger)[0]:
                t = int(t_min[i])
                r_id = det_regimes[i]
                
                # root cause (last 60 min)
                start = max(0, i - 60)
                X_win = df[INPUTS].iloc[start:i+1].fillna(0).values
                X_mean = X_win.mean(axis=0)
                X_std = X_win.std(axis=0) + 1e-6
                
                coefs = np.zeros(len(INPUTS))
                m = models.get(r_id) if models else None
                if m and tag in OUTPUTS:
                    out_idx = OUTPUTS.index(tag)
                    # pipeline: scaler -> poly -> ridge
                    # coef shape (n_targets, n_features)
                    ridge = m.named_steps["ridge"]
                    scaler = m.named_steps["scaler"]
                    # first len(INPUTS) terms are linear
                    c = ridge.coef_[out_idx, :len(INPUTS)]
                    # standardize
                    coefs = c
                    
                contribs = coefs * ((df[INPUTS].iloc[i].fillna(0).values - X_mean) / X_std)
                top_indices = np.argsort(np.abs(contribs))[-3:][::-1]
                
                rc = []
                for idx in top_indices:
                    v = contribs[idx]
                    if abs(v) > 1e-4:
                        rc.append({"tag": INPUTS[idx], "contrib": round(v, 2), "direction": "up" if v > 0 else "down"})
                        
                kind = "breach" if breach_mask[i] else "cusum"
                payload = {
                    "residual": round(float(res[i]), 2),
                    "sigma": round(float(sigma[i]), 2),
                    "cusum": round(float(cusum_val[i]), 2),
                    "expected": round(float(e[i]), 2),
                    "measured": round(float(meas[i]), 2),
                    "root_cause": rc,
                    "briefing": {
                        "en": f"{tag} deviated from expected.",
                        "hinglish": f"{tag} expect se alag hai.",
                        "hi": f"{tag} अपेक्षित से विचलित हो गया।"
                    },
                    "next_lab_min": ((t // 480) + 1) * 480
                }
                
                events.append({
                    "event_id": f"ev_{run_id}_{unit_id}_{t}_{tag}",
                    "run_id": run_id, "time_min": t, "unit_id": unit_id,
                    "use_case_id": "UC-DET", "tag": tag, "kind": kind,
                    "severity": "warn", "payload": payload,
                    "status": "open", "ts": st.ts(t)
                })
                
    # Insert to db
    if events:
        with st._lock:
            cur = con.cursor()
            for ev in events:
                cur.execute("""
                    INSERT OR IGNORE INTO agent_events (event_id, run_id, time_min, unit_id, use_case_id, tag, kind, severity, payload, status, ts)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    ev["event_id"], ev["run_id"], ev["time_min"], ev.get("unit_id"), ev.get("use_case_id"),
                    ev.get("tag"), ev["kind"], ev["severity"], json.dumps(ev.get("payload", {})),
                    ev["status"], ev["ts"]
                ))
            con.commit()

def events_for_run(run_id: str, upto_time_min: Optional[int] = None, unit_id: Optional[str] = None) -> list[dict]:
    compute_detect(run_id)
    st = get_state()
    con = st.db
    
    query = "SELECT event_id, run_id, time_min, unit_id, use_case_id, tag, kind, severity, payload, status, ts FROM agent_events WHERE run_id=?"
    params = [run_id]
    
    if upto_time_min is not None:
        query += " AND time_min <= ?"
        params.append(int(upto_time_min))
    if unit_id is not None:
        query += " AND unit_id = ?"
        params.append(unit_id)
        
    query += " ORDER BY time_min ASC"
    
    cur = con.execute(query, params)
    rows = cur.fetchall()
    
    out = []
    for r in rows:
        payload = json.loads(r[8]) if r[8] else {}
        out.append({
            "event_id": r[0], "run_id": r[1], "time_min": r[2], "unit_id": r[3],
            "use_case_id": r[4], "tag": r[5], "kind": r[6], "severity": r[7],
            **payload,
            "status": r[9], "ts": r[10]
        })
    return {"events": out}
