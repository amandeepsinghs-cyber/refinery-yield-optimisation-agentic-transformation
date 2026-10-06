"""Executable BDD Acceptance Suite for Epic I: Connected Refinery Digital Twin,
Systems-Thinking Ripple Matrix, PINN Residuals & Use-Case Catalogue (BDD-19 through BDD-22).
"""
from __future__ import annotations

import os
import pathlib
import re

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("FCC_NO_PROBE", "1")
from app.copilot.adk_agent import get_systems_twin_state, get_use_case_detail  # noqa: E402
from app.copilot.tools import ToolBox  # noqa: E402
from app.main import app  # noqa: E402
from app.state import get_state  # noqa: E402

FIN = re.compile(
    r"[$€£₹]\s?\d|\bUSD\b|\bEUR\b|\bNPV\b|\bROI\b|payback|\bcost\b|\bbudget\b|\bprice\b|\brevenue\b|"
    r"\bprofit\b|\bsavings?\b|\bmonetary\b",
    re.I,
)


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
    return cfg.get("default_run", "random_s144")


def test_bdd_19_six_unit_connected_refinery_digital_twin(client, run_id):
    """BDD-19: Verify /api/twin returns all 6 sequential physical units, 3 closed-loop
    thermodynamic couplings, and live tag telemetry.
    """
    res = client.get("/api/twin", params={"run_id": run_id, "time_min": 60})
    assert res.status_code == 200
    data = res.json()

    assert data["schema_version"] == "2.0"
    assert data["provenance"]["source"] == "simulated"
    assert data["provenance"]["run_id"] == run_id
    assert data["provenance"]["advisory_only"] is True

    # 6 sequential physical units
    units = data["units"]
    assert len(units) == 6
    expected_ids = [
        "unit_1_furnace",
        "unit_2_riser",
        "unit_3_regenerator",
        "unit_4_fractionator",
        "unit_5_condenser",
        "unit_6_stabiliser",
    ]
    assert [u["unit_id"] for u in units] == expected_ids

    by_id = {u["unit_id"]: u for u in units}
    assert {"T3_furnace_F", "T2_preheat_F", "F5_fuel", "fluegas_O2_pct", "fluegas_CO_ppm"} <= set(by_id["unit_1_furnace"]["tags"])
    assert {"Tr_riser_out_F", "conversion_pct", "dP_reactor_frac", "W_riser", "standpipe_level"} <= set(by_id["unit_2_riser"]["tags"])
    assert {"Treg_F", "Tcyc_F", "dT_cyc_reg_F", "C_spent_cat", "C_regen_cat", "F_coke", "power_CAB"} <= set(by_id["unit_3_regenerator"]["tags"])
    assert {"LCO_T98_F", "HN_T98_F", "MV_T17_sp", "MV_PA1", "MV_PA4", "valve_V11"} <= set(by_id["unit_4_fractionator"]["tags"])
    assert {"dist_condenser_eff", "MV_cw_flow", "MV_reflux_ratio", "SP_T_overhead", "power_WGC"} <= set(by_id["unit_5_condenser"]["tags"])
    assert {"eff_C1", "eff_C5", "c5_recovery_pct", "prod_LPG", "prod_LN", "prod_HN", "prod_LCO", "prod_slurry"} <= set(by_id["unit_6_stabiliser"]["tags"])

    # Every unit has a 3-zone operating envelope
    for u in units:
        env = u["envelope"]
        assert set(env) >= {
            "parameter", "label", "unit", "current_value", "p50", "p95",
            "sweet_spot_min", "sweet_spot_max", "spec_limit", "zone", "zone_label", "advice"
        }
        assert env["zone"] in ("OVER_TREATING", "SWEET_SPOT", "UNDER_TREATING", "TRANSITION_LOCK")

    # 3 closed-loop thermodynamic couplings
    loops = data["system_loops"]
    assert len(loops) == 3
    assert [l["loop_id"] for l in loops] == ["loop_hydrocarbon", "loop_catalyst", "loop_heat"]


def test_bdd_20_four_domain_systems_ripple_matrix(client, run_id):
    """BDD-20: Verify /api/twin returns the 4-domain Systems Ripple Matrix (yield, energy,
    regeneration, reliability) with before/after/delta metrics.
    """
    res = client.get("/api/twin", params={"run_id": run_id, "time_min": 60})
    assert res.status_code == 200
    ripple = res.json()["systems_ripple"]

    assert set(ripple) >= {"rec_id", "time_min", "gate_status", "primary_move", "domains"}
    assert set(ripple["domains"]) == {"yield", "energy", "regeneration", "reliability"}

    for dom_name, dom in ripple["domains"].items():
        assert "title" in dom and "summary" in dom and "metrics" in dom
        assert len(dom["metrics"]) >= 3, f"Domain {dom_name} must expose at least 3 metrics"
        for m in dom["metrics"]:
            assert set(m) >= {"label", "before", "after", "delta", "unit", "direction"}


def test_bdd_21_pinn_residuals_and_dual_sensor_drift_matrix(client, run_id):
    """BDD-21: Verify PINN conservation residuals, 5-channel dual-sensor drift matrix,
    and 8-channel control valve authority matrix.
    """
    res = client.get("/api/twin", params={"run_id": run_id, "time_min": 60})
    assert res.status_code == 200
    pinn = res.json()["pinn_residuals"]

    assert set(pinn) >= {
        "mass_balance_err_pct",
        "mass_closure_ok",
        "tray_monotonicity_ok",
        "tray_profile_F",
        "cutpoint_gap_F",
        "cutpoint_gap_ok",
        "condenser_eff",
        "condenser_ua_residual",
        "furnace_coking_residual_F",
        "hydraulic_dp_frac",
        "hydraulic_dp_norm",
        "sensor_drift_matrix",
        "valve_health_matrix",
    }

    # 5 redundant sensor pairs
    drift = pinn["sensor_drift_matrix"]
    assert len(drift) == 5
    assert [d["dup_tag"] for d in drift] == ["T2_dup", "Tr_dup", "Treg_dup", "P5_dup", "P6_dup"]
    for d in drift:
        assert d["abs_drift"] >= 0.0
        assert d["status"] in ("GREEN", "AMBER", "RED")

    # 8 control valves
    valves = pinn["valve_health_matrix"]
    assert len(valves) == 8
    assert {"valve_V8", "valve_V9", "valve_V10", "valve_V11"} <= {v["tag"] for v in valves}


def test_bdd_22_use_case_catalogue_and_copilot_tools(client, run_id):
    """BDD-22: Verify all 11 core use cases (UC-01..UC-11), 23 downstream cases (#12..#34),
    /api/twin/use-case/{id}, and Copilot/ADK tools get_systems_twin_state & get_use_case_detail.
    """
    res = client.get("/api/twin", params={"run_id": run_id, "time_min": 60})
    assert res.status_code == 200
    data = res.json()

    # 11 core use cases
    ucs = data["use_cases"]
    assert len(ucs) == 11
    assert [u["id"] for u in ucs] == [f"UC-{i:02d}" for i in range(1, 12)]
    for uc in ucs:
        assert set(uc) >= {
            "id", "number", "title", "category", "unit_id", "unit_name",
            "status", "problem_statement", "solution_summary", "kpis",
            "envelope", "recommendation", "systems_ripple", "citations"
        }
        assert len(uc["kpis"]) == 4
        assert set(uc["systems_ripple"]) == {"yield_impact", "energy_impact", "regeneration_impact", "reliability_impact"}

    # 23 downstream cases (#12..#34)
    downstream = data["downstream_cases_summary"]
    assert len(downstream) == 23
    tiers = {d["tier"] for d in downstream}
    assert tiers == {"BOUNDARY_LINKED", "ARCHITECTURE_READY", "PLANT_WIDE_ROADMAP"}

    # Single use-case detail endpoint
    uc_res = client.get("/api/twin/use-case/UC-02", params={"run_id": run_id, "time_min": 60})
    assert uc_res.status_code == 200
    uc_detail = uc_res.json()
    assert uc_detail["use_case"]["id"] == "UC-02"
    assert uc_detail["unit"]["unit_id"] == "unit_6_stabiliser"

    # Invalid use-case ID returns 404
    bad_res = client.get("/api/twin/use-case/UC-99", params={"run_id": run_id})
    assert bad_res.status_code == 404

    # Copilot ToolBox & ADK functions
    tb = ToolBox({"run_id": run_id, "time_min": 60})
    t_twin = tb.call("get_systems_twin_state", {"run_id": run_id, "time_min": 60})
    assert len(t_twin["units"]) == 6
    t_uc = tb.call("get_use_case_detail", {"use_case_id": "UC-05", "run_id": run_id, "time_min": 60})
    assert t_uc["use_case"]["id"] == "UC-05"

    adk_twin = get_systems_twin_state(run_id=run_id, time_min=60)
    assert len(adk_twin["use_cases"]) == 11
    adk_uc = get_use_case_detail("4", run_id=run_id, time_min=60)
    assert adk_uc["use_case"]["id"] == "UC-04"


def test_sdd_nfr_11_zero_financial_terms_in_twin_and_ui(client, run_id):
    """SDD-NFR-11: Verify zero financial or currency terms exist in /api/twin responses
    or in the new frontend components.
    """
    r1 = client.get("/api/twin", params={"run_id": run_id, "time_min": 60})
    assert r1.status_code == 200
    m1 = FIN.search(r1.text)
    assert m1 is None, f"Forbidden financial term '{m1.group(0)}' in /api/twin response"

    r2 = client.get("/api/twin/use-case/UC-01", params={"run_id": run_id, "time_min": 60})
    assert r2.status_code == 200
    m2 = FIN.search(r2.text)
    assert m2 is None, f"Forbidden financial term '{m2.group(0)}' in /api/twin/use-case/UC-01 response"

    web_root = pathlib.Path(__file__).resolve().parents[2] / "web" / "src"
    # 6 Oct 2026: the legacy screens this test used to scan were removed; scan every page and screen component instead.
    target_files = sorted(
        p for d in ("app", "components/how", "components/twin", "components/record") for p in (web_root / d).rglob("*.tsx")
    )
    assert target_files, f"No frontend files found under {web_root}"
    for fp in target_files:
        assert fp.exists(), f"Missing expected frontend file: {fp}"
        txt = fp.read_text()
        m = FIN.search(txt)
        assert m is None, f"Forbidden financial term '{m.group(0)}' in {fp.name}"


def test_bdd_23_full_workspaces_decisions_and_multilingual_agents(client, run_id):
    """BDD-23: Verify full Unit & Use-Case workspaces (tag_table, chart_panels, decisions_needed),
    actionable POST /api/twin/decision persistence, and 7-agent multilingual sentinel fleet
    (English, Hinglish, Hindi).
    """
    from app.copilot.chat import system_instruction

    res = client.get("/api/twin", params={"run_id": run_id, "time_min": 60})
    assert res.status_code == 200
    data = res.json()

    # 1. Every unit has complete tag_table, chart_panels, and decisions_needed
    for u in data["units"]:
        assert len(u["tag_table"]) >= 9, f"Unit {u['unit_id']} must have >= 9 rows in tag_table"
        for row in u["tag_table"]:
            assert set(row) >= {
                "tag", "label", "role", "unit", "current",
                "window_min", "window_mean", "window_max", "limit_or_sp", "status"
            }
            assert row["window_min"] <= row["window_mean"] <= row["window_max"]
        assert len(u["chart_panels"]) == 2
        for cp in u["chart_panels"]:
            assert set(cp) >= {"panel_id", "title", "subtitle", "unit", "traces"}
            assert len(cp["traces"]) >= 2
        assert len(u["decisions_needed"]) >= 1
        dc = u["decisions_needed"][0]
        assert set(dc) >= {
            "rec_id", "target_id", "unit_id", "use_case_id", "status", "action",
            "parameter", "sp_before", "sp_after", "delta", "unit", "gate_status", "rationale"
        }

    # 2. Every core use case (UC-01..UC-11) has tag_table, chart_panels, and decisions_needed
    for uc in data["use_cases"]:
        assert len(uc["tag_table"]) >= 8, f"Use case {uc['id']} must have >= 8 rows in tag_table"
        assert len(uc["chart_panels"]) == 2
        assert len(uc["decisions_needed"]) >= 1

    # 3. Proactive 7-Agent Sentinel Fleet with English, Hinglish, and Hindi briefings
    fleet = data["agent_fleet"]
    assert len(fleet) == 7
    expected_agents = [
        "agent_supervisor",
        "agent_furnace",
        "agent_riser",
        "agent_regenerator",
        "agent_fractionator",
        "agent_condenser",
        "agent_stabiliser_instr",
    ]
    assert [a["agent_id"] for a in fleet] == expected_agents
    for ag in fleet:
        assert set(ag) >= {"agent_id", "name", "role", "unit_id", "use_case_ids", "status", "priority_rank", "proactive_alert", "briefings"}
        assert set(ag["briefings"]) == {"en", "hinglish", "hi"}
        for lang_key, text in ag["briefings"].items():
            assert len(text) > 25, f"Empty {lang_key} briefing on {ag['agent_id']}"

    # 4. Actionable POST /api/twin/decision records operator Accept/Decline in SQLite decisions & audit
    u1_rec_id = data["units"][0]["decisions_needed"][0]["rec_id"]
    dec_res = client.post(
        "/api/twin/decision",
        json={
            "rec_id": u1_rec_id,
            "decision": "accepted",
            "user": "shift_lead_ravi",
            "note": "Verified heater O2 trim and preheat duty",
            "run_id": run_id,
            "time_min": 60,
        },
    )
    assert dec_res.status_code == 200
    dec_body = dec_res.json()
    assert dec_body["ok"] is True
    assert dec_body["status"] == "ACCEPTED"
    assert dec_body["audit_id"] > 0

    # Verify subsequent GET /api/twin reflects ACCEPTED status for u1_rec_id
    res_after = client.get("/api/twin", params={"run_id": run_id, "time_min": 60})
    assert res_after.status_code == 200
    u1_status_after = res_after.json()["units"][0]["decisions_needed"][0]["status"]
    assert u1_status_after == "ACCEPTED"

    # Verify audit endpoint contains the recorded decision with control_system_write=False
    aud_res = client.get("/api/audit", params={"q": u1_rec_id})
    assert aud_res.status_code == 200
    aud_rows = aud_res.json()
    assert any(r["target"] == u1_rec_id and r["detail"].get("control_system_write") is False for r in aud_rows)

    # 5. Verify Copilot system_instruction supports English, Hinglish, and Hindi modes
    si_hinglish = system_instruction({"page": "/decision", "run_id": run_id, "lang": "hinglish"})
    assert "Respond in Hinglish" in si_hinglish
    si_hi = system_instruction({"page": "/decision", "run_id": run_id, "lang": "hi"})
    assert "Respond in Hindi (Devanagari script)" in si_hi

