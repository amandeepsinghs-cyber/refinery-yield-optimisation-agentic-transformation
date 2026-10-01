import pytest
import numpy as np
from app.state import get_state
from app.routers.modelling import evaluate_drift_sentinel

def test_slow_tray_temp_drift():
    # DECISIONS L6
    import copy
    st = get_state()
    orig_noise = copy.deepcopy(st.s.raw.get("noise"))
    try:
        st.s.raw["noise"] = {
            "enabled": True,
            "temp_F": 0.0,  # Zero base noise for predictable test
            "pressure_psi": 0.0,
            "flow_rel": 0.0,
            "drift_run": "random_s152",
            "drift_tag": "T_tray13_F",
            "drift_start_min": 300,
            "drift_per_day_F": 4.0
        }
        st.catalog._mcache.clear()
        if "random_s152" in st.catalog.runs:
            df_true = st.catalog.load_true("random_s152")
            df_noise = st.catalog.load("random_s152")
            t = df_noise["time_min"].values
            diff = df_noise["T_tray13_F"].values - df_true["T_tray13_F"].values
            before = diff[t <= 300]
            assert np.allclose(before, 0.0)
            after = diff[t > 300]
            expected_drift = np.maximum(0.0, (t[t > 300] - 300) / 1440.0) * 4.0
            assert np.allclose(after, expected_drift)
    finally:
        st.s.raw["noise"] = orig_noise
        st.catalog._mcache.clear()
        
def test_cusum_drift_alert():
    # BDD-8
    R = 7.0
    k = 0.5
    h = 5.0
    
    # Nominal residuals (mean 0, std 1)
    res = np.random.normal(0, 1, 100)
    res_drift = evaluate_drift_sentinel(res, np.array([]), R=R, k=k, h=h)
    assert not res_drift["cusum_alert"]
    
    # Drifting residuals
    drift_res = np.concatenate([np.random.normal(0, 1, 100), np.linspace(0, 10, 100)])
    res_drift_alert = evaluate_drift_sentinel(drift_res, np.array([]), R=R, k=k, h=h)
    assert res_drift_alert["cusum_alert"]
    assert res_drift_alert["first_breach_idx"] is not None

def test_sustained_bias_retrain():
    # BDD-8
    R = 7.0
    
    # Not sustained
    lab_res = [0.0, 0.1, -0.2, 0.1, 0.2]
    res_ok = evaluate_drift_sentinel(np.array(lab_res), np.array(lab_res), R=R)
    assert not res_ok["retrain_proposed"]
    assert res_ok["bias_reason"] is None
    
    # Sustained bias >= 0.5R = 3.5
    lab_res_bias = [3.6, 3.5, 3.7, 3.6, 3.5]
    res_bias = evaluate_drift_sentinel(np.array(lab_res_bias), np.array(lab_res_bias), R=R)
    assert res_bias["retrain_proposed"]
    assert "Sustained residual bias" in res_bias["bias_reason"]
    
def test_champion_challenger_dual_validation():
    # BDD-8 & BDD-1
    R = 7.0
    lab_res_bias = [3.6, 3.5, 3.7, 3.6, 3.5]
    
    # Challenger wins both
    res = evaluate_drift_sentinel(
        np.array(lab_res_bias), np.array(lab_res_bias), R=R,
        challenger_metrics={"time_blocked_rmse": 2.0, "loro_rmse": 2.1},
        champion_metrics={"time_blocked_rmse": 3.0, "loro_rmse": 3.1}
    )
    assert res["promotion_status"] == "pending_approval"
    assert res["moc_required"]
    
    # Challenger wins only one (time-blocked)
    res2 = evaluate_drift_sentinel(
        np.array(lab_res_bias), np.array(lab_res_bias), R=R,
        challenger_metrics={"time_blocked_rmse": 2.0, "loro_rmse": 3.5},
        champion_metrics={"time_blocked_rmse": 3.0, "loro_rmse": 3.1}
    )
    assert res2["promotion_status"] == "champion_active"
    assert not res2["moc_required"]
    
    # Challenger wins only one (LORO)
    res3 = evaluate_drift_sentinel(
        np.array(lab_res_bias), np.array(lab_res_bias), R=R,
        challenger_metrics={"time_blocked_rmse": 3.5, "loro_rmse": 2.1},
        champion_metrics={"time_blocked_rmse": 3.0, "loro_rmse": 3.1}
    )
    assert res3["promotion_status"] == "champion_active"
    
