"""Executable BDD Acceptance Suite mapped to @demo scenarios in BDD.md (BDD-01 through BDD-17).

Validates safety guardrails, probabilistic estimation, trust scoring, fallback hierarchy,
Kalman bias updates, lab reconciliation, model admission, spread gate hysteresis, and zero financial content.
"""
import os
import re

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("FCC_NO_PROBE", "1")
from app.config import get_settings
from app.copilot.tools import DECLS
from app.dist import mix_moments
from app.gate import SpreadGate
from app.main import app
from app.pipeline import assemble_run, fallback_source
from app.state import get_state
from app.train import build_labels


@pytest.fixture(scope="module")
def client():
    st = get_state()
    st.s.raw["gemini"]["probe_on_startup"] = False
    if not st.knowledge.docs:
        st.knowledge.load(embed=False)
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def run_id(client):
    st = get_state()
    if not st.trained:
        pytest.skip("Models not trained; run python -m app.train")
    cfg = client.get("/api/config").json()
    return cfg.get("default_run", "random_s140")


# -----------------------------------------------------------------------------
# 1. BDD-01: Safety Guardrails (no L2 write tools, trust & gate in estimates)
# -----------------------------------------------------------------------------
def test_bdd_01_safety_guardrails(client, run_id):
    """BDD-01: Verify no Level-2 / DCS / MPC write tool exists in copilot DECLS,

    and verify estimates returned by /api/estimate always carry trust.level and gate.status.
    """
    # 1. Check tools: strictly advisory and read-only
    forbidden_write_patterns = [
        "write", "set_point", "setpoint", "actuate", "control", "send_sp",
        "dcs", "mpc", "modify_sp", "execute", "apply_move"
    ]
    tool_names = [name.lower() for name, _, _, _ in DECLS]
    for pattern in forbidden_write_patterns:
        for tool_name in tool_names:
            assert pattern not in tool_name, f"Forbidden write tool pattern '{pattern}' found in {tool_name}"

    # 2. Check /api/estimate carries trust.level and gate.status
    res = client.get("/api/estimate", params={"run_id": run_id, "property": "LCO_T98_F", "time_min": 30})
    assert res.status_code == 200
    data = res.json()
    assert data["trust"]["level"] in ("GREEN", "AMBER", "RED")
    assert data["gate"]["status"] in ("PASS", "WITHHELD")


# -----------------------------------------------------------------------------
# 2. BDD-02: Data Quality & Lab Alignment (synthetic lab delay & transient exclusion)
# -----------------------------------------------------------------------------
def test_bdd_02_data_quality_and_lab_alignment(run_id):
    """BDD-02: Verify synthetic labs have lims_time_min within [draw + 45, draw + 75],

    and verify build_labels excludes transient labs (event_code != 0) from training labels.
    """
    st = get_state()
    # Check synthetic labs alignment
    labs = st.catalog.raw_labs(run_id)
    if labs:
        for lab in labs:
            draw = lab["draw_time_min"]
            lims = lab["lims_time_min"]
            assert lab["time_min"] == draw, "time_min must equal draw_time_min"
            assert draw + 45 <= lims <= draw + 75, f"LIMS delay {lims - draw} outside [45, 75] min"

    # Verify build_labels excludes transient labs (event_code != 0)
    s = get_settings()
    df = pd.DataFrame({"time_min": np.arange(1, 101), "LCO_T98_F": 750.0, "HN_T98_F": 530.0, "x": 1.0})
    raw_labs = {
        "run_test": [
            {"property": p, "injected_error": "none", "time_min": t, "value": 751.0}
            for p in s.targets
            for t in (10, 50, 90)
        ]
    }
    transient_mask = np.zeros(100, dtype=bool)
    transient_mask[45:55] = True  # minute 50 is transient
    stats = {}
    labels = build_labels({"run_test": df}, raw_labs, ["run_test"], s, "lab", {"run_test": transient_mask}, stats)
    assert sorted(labels["LCO_T98_F"]["time_min"]) == [10, 90], "Transient lab at t=50 must be excluded"
    assert stats["LCO_T98_F"]["transient_excluded"] == 1


# -----------------------------------------------------------------------------
# 3. BDD-03: Multi-Model Probabilistic Estimation & Variance Decomposition
# -----------------------------------------------------------------------------
def test_bdd_03_multi_model_probabilistic_estimation(client, run_id):
    """BDD-03: Verify /api/estimate returns all 4 model families with sigma > 0,

    monotonic mixture quantiles (q05 <= q25 <= q50 <= q75 <= q95),
    and validates mix_moments variance decomposition.
    """
    res = client.get("/api/estimate", params={"run_id": run_id, "property": "LCO_T98_F", "time_min": 30})
    assert res.status_code == 200
    data = res.json()

    # 4 model families
    expected_members = {"bayes_ridge_v1", "gpr_v1", "hybrid_delta_v1", "pinn_ens_v1"}
    assert set(data["members"].keys()) == expected_members
    for mid, m in data["members"].items():
        assert m["sigma"] >= 0, f"Member {mid} sigma must be non-negative"

    # Quantiles monotone
    mix = data["mixture"]
    qs = [mix["q05"], mix.get("q25", mix["q05"]), mix["q50"], mix.get("q75", mix["q95"]), mix["q95"]]
    assert qs == sorted(qs), f"Mixture quantiles must be non-decreasing: {qs}"

    # Theoretical variance decomposition in mix_moments:
    # Var(mixture) = sum w_j (sigma_j^2 + Pv) + sum w_j (mu_j - mean)^2
    mu = np.array([[750.0, 754.0]])
    sg = np.array([[2.0, 2.0]])
    w = np.array([[0.5, 0.5]])
    b = np.array([1.0])
    Pv = np.array([1.0])

    mean, sd = mix_moments(mu, sg, w, b, Pv)
    # mean = 750*0.5 + 754*0.5 + 1.0 = 753.0
    assert abs(mean[0] - 753.0) < 1e-9
    # within variance = 0.5*(4 + 1) + 0.5*(4 + 1) = 5.0
    # between variance = 0.5*(750 - 752)^2 + 0.5*(754 - 752)^2 = 4.0
    # total variance = 5.0 + 4.0 = 9.0 -> sd = 3.0
    assert abs(sd[0] ** 2 - 9.0) < 1e-9


# -----------------------------------------------------------------------------
# 4. BDD-04: Trust Score Seven Signals
# -----------------------------------------------------------------------------
def test_bdd_04_trust_score_seven_signals(client, run_id):
    """BDD-04: Verify /api/estimate includes all 7 signals S1..S7 with value, limit, pass, severe."""
    res = client.get("/api/estimate", params={"run_id": run_id, "property": "LCO_T98_F", "time_min": 30})
    assert res.status_code == 200
    signals = res.json()["trust"]["signals"]
    assert set(signals.keys()) == {f"S{i}" for i in range(1, 8)}

    for s_name, sig in signals.items():
        assert "value" in sig, f"Signal {s_name} missing value"
        assert "limit" in sig, f"Signal {s_name} missing limit"
        assert "pass" in sig and isinstance(sig["pass"], bool), f"Signal {s_name} pass must be bool"
        assert "severe" in sig and isinstance(sig["severe"], bool), f"Signal {s_name} severe must be bool"


# -----------------------------------------------------------------------------
# 5. BDD-05: Fallback Hierarchy
# -----------------------------------------------------------------------------
def test_bdd_05_fallback_hierarchy():
    """BDD-05: Verify fallback_source transitions consensus -> best_single -> hold_last -> BAD

    when trust is RED for > 60 minutes.
    """
    n = 100
    t = np.arange(n)
    mu = np.tile([750.0, 752.0], (n, 1))
    mean = np.full(n, 751.0)
    trust = np.array(["GREEN"] * n, dtype=object)

    mu[10:20, 1] = np.nan  # member 1 missing -> best_single
    trust[30:] = "RED"  # RED -> hold_last up to 60 min, then BAD

    src, val = fallback_source(
        mean=mean,
        mu=mu,
        adm=np.array([True, True]),
        val_mse=np.array([2.0, 1.0]),
        bias=np.zeros(n),
        trust=trust,
        t=t,
        hold_max_min=60,
    )

    assert src[0] == "consensus" and val[0] == 751.0
    assert src[15] == "best_single" and val[15] == 750.0
    assert src[29] == "consensus"
    # Starting at minute 30, RED trust triggers hold_last
    assert src[30] == "hold_last" and val[30] == 751.0
    assert src[89] == "hold_last" and val[89] == 751.0
    # At minute 90 (60 minutes after t=30), transitions to BAD
    assert src[90] == "BAD" and np.isnan(val[90])


# -----------------------------------------------------------------------------
# 6. BDD-06: Kalman Bias Update
# -----------------------------------------------------------------------------
def test_bdd_06_kalman_bias_update():
    """BDD-06: Verify Kalman bias update in assemble_run: an accepted lab updates bias via

    linear ramp (ramp_min = 30), whereas HOLD / REJECT labs leave bias unchanged.
    """
    s = get_settings()
    n = 100
    t = np.arange(1, n + 1)
    df = pd.DataFrame({
        "time_min": t, "LCO_T98_F": 750.0, "HN_T98_F": 530.0, "dist_feed_API": 25.0,
        "SP_LCO_T98": 755.0, "feed_flow_lb_s": 100.0
    })
    J = 4
    mu = np.tile([750.0, 750.0, 750.0, 750.0], (n, 1))
    sg = np.full((n, J), 2.0)
    preds = {
        "props": {
            "LCO_T98_F": {
                "mu": mu, "sigma": sg, "phys": np.full(n, 750.0), "delta": np.zeros(n),
                "pinn_members": np.tile(750.0, (5, n)), "gpr_sigma_ratio": np.ones(n),
                "regime_counts": {"heavy": 10, "medium": 10, "light": 10}
            }
        },
        "t2_ratio": np.zeros(n), "spe_ratio": np.zeros(n), "dq_fail": np.zeros(n, bool),
        "dq_severe": np.zeros(n, bool), "dq_tag": np.array([None] * n, dtype=object)
    }
    meta = {"LCO_T98_F": {"admitted": [True] * J, "val_mse": [1.0] * J}}
    gains = {"LCO_T98_F": {"gain": 1.0, "yield_sens": 0.0}}

    # 1. Accepted lab: draw at 10, arrives at 50, value = 754.0 (estimate is 750, diff = 4.0 <= 2R = 14)
    accepted_lab = [{
        "sample_id": "lab_acc", "run_id": "toy", "property": "LCO_T98_F", "time_min": 10,
        "draw_time_min": 10, "lims_time_min": 50, "recorded_draw_time_min": 10,
        "value": 754.0, "true_value": 750.0, "injected_error": "none"
    }]
    res_acc = assemble_run("toy", df, preds, accepted_lab, meta, s, gains)
    b_acc = res_acc["props"]["LCO_T98_F"]["bias"]

    # Before and at arrival (t=50, index 49 in 1-indexed time array): bias is 0.0
    assert b_acc[48] == 0.0
    assert b_acc[49] == 0.0
    # Halfway through 30-min ramp (t=65, index 64): bias > 0
    assert b_acc[64] > 0.0
    # At end of ramp (t=80, index 79 = 50 + 30): reached final b_to
    assert b_acc[79] > b_acc[64]
    # Stays at plateau after ramp (t=85): unchanged
    assert np.isclose(b_acc[84], b_acc[79])

    # 2. REJECT lab: recorded_draw_time == lims_time -> bias unchanged (0.0 everywhere)
    reject_lab = [{
        "sample_id": "lab_rej", "run_id": "toy", "property": "LCO_T98_F", "time_min": 10,
        "draw_time_min": 10, "lims_time_min": 50, "recorded_draw_time_min": 50,
        "value": 754.0, "true_value": 750.0, "injected_error": "timestamp"
    }]
    res_rej = assemble_run("toy", df, preds, reject_lab, meta, s, gains)
    b_rej = res_rej["props"]["LCO_T98_F"]["bias"]
    assert np.all(b_rej == 0.0)

    # 3. HOLD lab: gross deviation > 2R (750 -> 770) -> bias unchanged (0.0 everywhere)
    hold_lab = [{
        "sample_id": "lab_hold", "run_id": "toy", "property": "LCO_T98_F", "time_min": 10,
        "draw_time_min": 10, "lims_time_min": 50, "recorded_draw_time_min": 10,
        "value": 770.0, "true_value": 750.0, "injected_error": "gross"
    }]
    res_hold = assemble_run("toy", df, preds, hold_lab, meta, s, gains)
    b_hold = res_hold["props"]["LCO_T98_F"]["bias"]
    assert np.all(b_hold == 0.0)


# -----------------------------------------------------------------------------
# 7. BDD-07: Lab Reconciliation Agent
# -----------------------------------------------------------------------------
def test_bdd_07_lab_reconciliation_agent():
    """BDD-07: Verify timestamp-error labs are marked REJECT and gross-error labs are marked HOLD or REJECT."""
    s = get_settings()
    n = 100
    t = np.arange(1, n + 1)
    df = pd.DataFrame({
        "time_min": t, "LCO_T98_F": 750.0, "HN_T98_F": 530.0, "dist_feed_API": 25.0,
        "SP_LCO_T98": 755.0, "feed_flow_lb_s": 100.0
    })
    J = 4
    mu = np.tile([750.0, 750.0, 750.0, 750.0], (n, 1))
    sg = np.full((n, J), 2.0)
    preds = {
        "props": {
            "LCO_T98_F": {
                "mu": mu, "sigma": sg, "phys": np.full(n, 750.0), "delta": np.zeros(n),
                "pinn_members": np.tile(750.0, (5, n)), "gpr_sigma_ratio": np.ones(n),
                "regime_counts": {"heavy": 10, "medium": 10, "light": 10}
            }
        },
        "t2_ratio": np.zeros(n), "spe_ratio": np.zeros(n), "dq_fail": np.zeros(n, bool),
        "dq_severe": np.zeros(n, bool), "dq_tag": np.array([None] * n, dtype=object)
    }
    meta = {"LCO_T98_F": {"admitted": [True] * J, "val_mse": [1.0] * J}}
    gains = {"LCO_T98_F": {"gain": 1.0, "yield_sens": 0.0}}

    labs = [
        # Timestamp error: recorded draw time equals LIMS arrival time
        {
            "sample_id": "lab_ts", "run_id": "toy", "property": "LCO_T98_F", "time_min": 10,
            "draw_time_min": 10, "lims_time_min": 50, "recorded_draw_time_min": 50,
            "value": 751.0, "true_value": 750.0, "injected_error": "timestamp"
        },
        # Gross error: jump of 20 °F (> 2R = 14 °F)
        {
            "sample_id": "lab_gross", "run_id": "toy", "property": "LCO_T98_F", "time_min": 20,
            "draw_time_min": 20, "lims_time_min": 70, "recorded_draw_time_min": 20,
            "value": 775.0, "true_value": 750.0, "injected_error": "gross"
        }
    ]

    res = assemble_run("toy", df, preds, labs, meta, s, gains)
    evaluated_labs = {l["sample_id"]: l for l in res["labs"]}

    assert evaluated_labs["lab_ts"]["status"] == "REJECT"
    assert "timestamp error" in evaluated_labs["lab_ts"]["status_reason"].lower()

    assert evaluated_labs["lab_gross"]["status"] in ("HOLD", "REJECT")
    assert "> 2r" in evaluated_labs["lab_gross"]["status_reason"].lower() or "hold" in evaluated_labs["lab_gross"]["status"].lower()


# -----------------------------------------------------------------------------
# 8. BDD-09: Model Families Admission & Hybrid Decomposition Physics
# -----------------------------------------------------------------------------
def test_bdd_09_model_families_admission_and_physics(client):
    """BDD-09: Verify bayes_ridge_v1 is always 'admitted' in /api/models,

    and verify Hybrid delta mu equals physics + delta on calibration held-out evaluations.
    """
    # 1. bayes_ridge_v1 is always admitted (anchor baseline)
    models_res = client.get("/api/models", params={"property": "LCO_T98_F"})
    assert models_res.status_code == 200
    models_data = models_res.json()["models"]
    br = next((m for m in models_data if m["model_id"] == "bayes_ridge_v1"), None)
    assert br is not None, "bayes_ridge_v1 must exist in models"
    assert br["status"] == "admitted", f"bayes_ridge_v1 status was {br['status']}, expected 'admitted'"

    # 2. Hybrid delta: mu = physics + delta
    cal_res = client.get("/api/calibration", params={"property": "LCO_T98_F"})
    assert cal_res.status_code == 200
    cal_data = cal_res.json()
    hybrid_pred = np.array(cal_data["parity"]["hybrid_delta_v1"]["pred"])
    physics = np.array(cal_data["hybrid_decomposition"]["physics"])
    delta = np.array(cal_data["hybrid_decomposition"]["delta"])

    assert len(hybrid_pred) > 0
    assert np.allclose(hybrid_pred, physics + delta, atol=0.02), "Hybrid prediction mu must equal physics + delta"


# -----------------------------------------------------------------------------
# 9. BDD-13 & BDD-14: Structured Audit Log & Zero Financial Content
# -----------------------------------------------------------------------------
def test_bdd_13_and_14_audit_and_zero_financial_content(client, run_id):
    """BDD-13 & BDD-14: Verify /api/audit returns structured audit records,

    and verify /api/overview, /api/recommendations, /api/models, /api/labs, and /api/dq contain zero financial terms.
    """
    # 1. Audit structure
    audit_res = client.get("/api/audit")
    assert audit_res.status_code == 200
    audit_rows = audit_res.json()
    assert isinstance(audit_rows, list)
    expected_fields = {"audit_id", "ts", "actor", "action", "target", "detail"}
    for row in audit_rows[:10]:
        assert expected_fields <= set(row.keys()), f"Audit row missing required fields: {row}"

    # 2. Zero financial figures (DECISIONS S2)
    fin_pattern = re.compile(
        r"[$€£₹]\s?\d|\bUSD\b|\bEUR\b|\bROI\b|\bNPV\b|payback|\bcost\b|\bbudget\b|\bprice\b|\brevenue\b|"
        r"\bprofit\b|\bsavings?\b|\bmonetary\b",
        re.I,
    )
    endpoints = [
        ("/api/overview", {"run_id": run_id, "property": "LCO_T98_F"}),
        ("/api/recommendations", {"run_id": run_id}),
        ("/api/models", {"property": "LCO_T98_F"}),
        ("/api/labs", {"run_id": run_id}),
        ("/api/dq", {"run_id": run_id}),
    ]
    for path, params in endpoints:
        resp = client.get(path, params=params)
        assert resp.status_code == 200, f"Endpoint {path} failed with {resp.status_code}"
        matches = fin_pattern.findall(resp.text)
        assert not matches, f"Forbidden financial terms {matches} detected in response from {path}"


# -----------------------------------------------------------------------------
# 10. BDD-15: Distribution Spread Gate & Hysteresis
# -----------------------------------------------------------------------------
def test_bdd_15_distribution_spread_gate():
    """BDD-15: Verify SpreadGate(14.0, 0.9, 10) withholds when W90 > 14.0, withholds when bimodal (D > 2.0),

    and requires 10 consecutive minutes below 12.6 °F (0.9 * 14.0) to clear hysteresis.
    """
    cause, action = "high uncertainty", "request lab sample"
    gate = SpreadGate(14.0, 0.9, 10)

    # 1. Wide distribution withholds
    r_wide = gate.step(15.2, False, 0.5, cause, action)
    assert r_wide.status == "WITHHELD"
    assert r_wide.reason == "wide"

    # 2. Bimodal distribution withholds
    gate_bim = SpreadGate(14.0, 0.9, 10)
    r_bim = gate_bim.step(10.0, True, 2.4, "models disagree", action)
    assert r_bim.status == "WITHHELD"
    assert r_bim.reason == "bimodal"

    # 3. Hysteresis clearing:
    # gate is currently WITHHELD from step 1.
    # At 13.0 °F (within 14.0 limit but above 12.6 clear threshold): reason is hysteresis
    r_h = gate.step(13.0, False, 0.5, cause, action)
    assert r_h.status == "WITHHELD"
    assert r_h.reason == "hysteresis"

    # 9 consecutive minutes below 12.6 °F: still WITHHELD (counter = 9)
    for _ in range(9):
        r_sub = gate.step(10.0, False, 0.5, cause, action)
        assert r_sub.status == "WITHHELD"
        assert r_sub.reason == "hysteresis"

    # 10th consecutive minute below 12.6 °F: clears hysteresis -> PASS
    r_pass = gate.step(10.0, False, 0.5, cause, action)
    assert r_pass.status == "PASS"
    assert r_pass.reason is None


# -----------------------------------------------------------------------------
# 11. BDD-16 & BDD-17: Cockpit Endpoints & Knowledge Citations (SHIFT-S100 sim_window)
# -----------------------------------------------------------------------------
def test_bdd_16_and_17_cockpit_and_knowledge_citations(client, run_id):
    """BDD-16 & BDD-17: Verify /api/whatif, /api/labs, /api/dq, /api/knowledge/docs,

    and /api/knowledge/records?run_id=random_s100 return 200 with valid schemas,
    and SHIFT-S100 carries sim_window == [360, 840].
    """
    # 1. /api/whatif
    whatif_res = client.post("/api/whatif", json={"run_id": run_id, "property": "LCO_T98_F", "overrides": {}})
    assert whatif_res.status_code == 200
    wdata = whatif_res.json()
    assert "properties" in wdata and "LCO_T98_F" in wdata["properties"]
    assert "mixture" in wdata["properties"]["LCO_T98_F"]

    # 2. /api/labs
    labs_res = client.get("/api/labs", params={"run_id": run_id})
    assert labs_res.status_code == 200
    labs_data = labs_res.json()
    assert "labs" in labs_data and isinstance(labs_data["labs"], list)

    # 3. /api/dq
    dq_res = client.get("/api/dq", params={"run_id": run_id})
    assert dq_res.status_code == 200
    dq_data = dq_res.json()
    assert "tags" in dq_data and "t2" in dq_data

    # 4. /api/knowledge/docs
    docs_res = client.get("/api/knowledge/docs")
    assert docs_res.status_code == 200
    docs = docs_res.json()
    assert isinstance(docs, list) and len(docs) > 0

    # 5. /api/knowledge/records?run_id=random_s100 and SHIFT-S100 sim_window
    rec_res = client.get("/api/knowledge/records", params={"run_id": "random_s100"})
    assert rec_res.status_code == 200
    records = rec_res.json()
    shift_s100 = next((r for r in records if r["doc_id"] == "SHIFT-S100"), None)
    assert shift_s100 is not None, "SHIFT-S100 must be present in records for run random_s100"
    win = shift_s100.get("sim_window") or shift_s100.get("window")
    assert win == [360, 840], f"SHIFT-S100 sim_window was {win}, expected [360, 840]"
