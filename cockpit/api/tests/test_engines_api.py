"""Contract tests for the v3 twin routers (API_CONTRACT_v3 §1–§6): shapes, defaults, errors, SSE, decision → event.

Uses the held-out run `random_s144` (seed >= training.test_seed_min) so engines are exercised on unseen data."""
from __future__ import annotations

import json
import re

import pytest
from fastapi.testclient import TestClient

from app.engines.recipe import GATE_REASONS as RECIPE_GATE_REASONS
from app.main import app

client = TestClient(app)
RUN, T, U4 = "random_s144", 600, "unit_4_fractionator"
UNITS = ["unit_1_furnace", "unit_2_riser", "unit_3_regenerator", "unit_4_fractionator", "unit_5_condenser",
         "unit_6_stabiliser"]
FINANCIAL = re.compile(r"[$€£₹]\s?\d|\b(USD|EUR|NPV|ROI|payback|cost|budget|price|revenue|profit|savings?|monetary)\b",
                       re.I)


def _get(path: str, **params):
    r = client.get(path, params=params)
    assert r.status_code == 200, (path, r.status_code, r.text[:300])
    body = r.json()
    assert not FINANCIAL.search(json.dumps(body)), f"financial wording leaked from {path}"
    return body


# --- §1 regime -------------------------------------------------------------------------------------------------------
def test_regime_payload_shape():
    d = _get("/api/regime", run_id=RUN, time_min=T)
    for k in ("run_id", "time_min", "regime_id", "regime_label", "p_regime", "novelty", "transition_pct",
              "declared_api", "declared_regime_id", "declared_vs_detected", "fingerprint", "segments"):
        assert k in d, k
    assert d["regime_id"] in {"R1", "R2", "R3", "R4"}
    assert abs(sum(d["p_regime"].values()) - 1) < 1e-6
    assert 0 <= d["novelty"] <= 1
    assert d["declared_vs_detected"] in {"match", "lagging", "mismatch"}


def test_regime_timeseries_is_columnar():
    d = _get("/api/regime/timeseries", run_id=RUN, step=30)
    n = len(d["time_min"])
    assert n > 10
    assert len(d["regime_id"]) == len(d["novelty"]) == len(d["declared_api"]) == n
    assert all(len(v) == n for v in d["p_regime"].values())


def test_regime_defaults_to_default_run():
    assert _get("/api/regime")["run_id"]


# --- §2 adaptation -----------------------------------------------------------------------------------------------------
def test_adaptation_payload_shape():
    d = _get("/api/adaptation", run_id=RUN, time_min=T, property="LCO_T98_F")
    for k in ("property", "regime_id", "novelty", "physics_weight", "weights", "bias_reset_at_min", "reason"):
        assert k in d, k
    assert d["property"] == "LCO_T98_F"
    assert abs(sum(w["weight"] for w in d["weights"]) - 1) < 1e-3
    assert {"member", "label", "weight", "by_regime"} <= set(d["weights"][0])


def test_adaptation_rejects_unknown_property():
    assert client.get("/api/adaptation", params={"run_id": RUN, "time_min": T, "property": "nope"}).status_code == 400


# --- §3 agents -----------------------------------------------------------------------------------------------------------
def test_agent_events_schema_and_filters():
    evs = _get("/api/agents/events", run_id=RUN)["events"]
    assert evs, "sentinels produced no events for the held-out run"
    kinds = {"breach", "cusum", "drift", "combustion", "flooding_pattern", "regime_change", "recipe_ready",
             "accepted", "declined"}
    for e in evs:
        assert {"event_id", "run_id", "time_min", "kind", "severity", "status", "ts"} <= set(e)
        assert e["kind"] in kinds and e["severity"] in {"info", "warn", "alarm"}
    capped = _get("/api/agents/events", run_id=RUN, upto_time_min=300)["events"]
    assert all(e["time_min"] <= 300 for e in capped)
    u4 = _get("/api/agents/events", run_id=RUN, unit_id=U4)["events"]
    assert all(e["unit_id"] == U4 for e in u4)


def test_agent_stream_replays_events():
    with client.stream("GET", "/api/agents/stream", params={"run_id": RUN, "follow": "false"}) as r:
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("text/event-stream")
        lines = [ln for ln in r.iter_lines() if ln]
    events = [ln for ln in lines if ln.startswith("event:")]
    datas = [ln for ln in lines if ln.startswith("data:")]
    assert events and all(ln == "event: agent_event" for ln in events)
    first = json.loads(datas[0][len("data:"):])
    assert first["run_id"] == RUN and "kind" in first


# --- §4 recipe -------------------------------------------------------------------------------------------------------------
GATE_REASONS = set(RECIPE_GATE_REASONS)  # includes "implausible" (plausibility check)


def _check_recipe_shape(d: dict) -> None:
    for k in ("recipe_id", "run_id", "time_min", "unit_id", "regime_id", "gate", "moves", "d_yield_pct_feed",
              "p_on_spec", "data_support", "explanation"):
        assert k in d, k
    if d["gate"] == "ISSUED":
        assert d["gate_reason"] is None and len(d["moves"]) >= 2
        for m in d["moves"]:
            assert {"sp_tag", "label", "current", "recommended", "delta", "unit", "limit_lo", "limit_hi",
                    "binding"} <= set(m)
            assert m["limit_lo"] - 1e-6 <= m["recommended"] <= m["limit_hi"] + 1e-6
            assert m["binding"] in {"iow", "step_limit", "envelope", "interior"}
            assert m["sp_tag"] in d["data_support"]["searched"]
        assert all(0.0 <= v <= 1.0 for v in d["p_on_spec"].values())
        assert d["objective_after"] > d["objective_before"]
    else:
        assert d["gate"] == "WITHHELD" and d["moves"] == []
        assert d["gate_reason"] in GATE_REASONS and d["explanation"]


def test_recipe_issued_or_withheld_with_reason():
    _check_recipe_shape(_get("/api/recipe", run_id=RUN, time_min=T, unit_id=U4))


def test_recipe_issues_when_committee_passes():
    """At a committee-PASS minute the fractionator recipe must be a real coordinated recipe (BDD-27)."""
    # s144 is always withheld since the 2 Oct retrain; random_s147 t300 is a PASS-and-plausible hold-out minute
    d = _get("/api/recipe", run_id="random_s147", time_min=300, unit_id=U4)
    _check_recipe_shape(d)
    assert d["gate"] == "ISSUED", d.get("explanation")
    tags = {m["sp_tag"] for m in d["moves"] if m["delta"] != 0}
    assert tags & {"SP_LCO_T98", "SP_HN_T98"}, "a fractionator recipe must move a cut point"
    assert min(d["p_on_spec"].values()) >= 0.95
    assert d["d_yield_pct_feed"]["LCO"] + d["d_yield_pct_feed"]["HN"] > 0


def test_recipe_withheld_honestly_without_data():
    """Units whose set points never had designed moves get an honest WITHHELD, not a fabricated recipe."""
    for unit in ("unit_1_furnace", "unit_3_regenerator", "unit_5_condenser", "unit_6_stabiliser"):
        d = _get("/api/recipe", run_id=RUN, time_min=200, unit_id=unit)
        _check_recipe_shape(d)
        assert d["gate"] == "WITHHELD" and d["gate_reason"] == "insufficient_data", unit
        assert d["data_support"]["unsupported"]


def test_recipe_whatif():
    r = client.post("/api/recipe/whatif", json={"run_id": RUN, "time_min": T, "unit_id": U4,
                                                "moves": {"SP_LCO_T98": 752.0}})
    assert r.status_code == 200
    d = r.json()
    assert {"predicted", "d_yield_pct_feed", "p_on_spec", "within_limits"} <= set(d)
    assert isinstance(d["within_limits"], bool)


# --- §5 workbench -------------------------------------------------------------------------------------------------------------
GREYS = re.compile(r"#808080|#999|#9ca3af|#6b7280|#64748b|#94a3b8|#cbd5e1|\bgr[ae]y\b", re.I)


@pytest.mark.parametrize("unit_id", UNITS)
def test_workbench_four_zones_every_unit(unit_id):
    d = _get(f"/api/unit/{unit_id}/workbench", run_id=RUN, time_min=T)
    for k in ("unit", "time", "series", "panels", "analysis", "models", "regime", "recipe", "decisions"):
        assert k in d, k
    assert d["unit"]["unit_id"] == unit_id
    n = len(d["series"]["time_min"])
    assert 0 < n <= 400
    assert all(len(v) == n for v in d["series"]["keys"].values())
    for p in d["panels"]:
        assert {"panel_id", "kind", "traces"} <= set(p)
        for tr in p["traces"]:
            assert tr["key"] in d["series"]["keys"], (p["panel_id"], tr["key"])
            assert not GREYS.search(tr.get("color", "")), (p["panel_id"], tr)
    assert {"primary_tag", "expected_source", "residual_now", "sigma_now", "events"} <= set(d["analysis"])
    assert {"surrogate", "pinn_checks", "gate"} <= set(d["models"])


def test_workbench_unknown_run_is_404():
    assert client.get(f"/api/unit/{U4}/workbench", params={"run_id": "nope", "time_min": T}).status_code == 404


# --- §6 twin additions + decision → event ----------------------------------------------------------------------------------------
def test_twin_l0_additions():
    d = _get("/api/twin", run_id=RUN, time_min=T)
    assert {"crude_slate", "needs_attention", "timeline", "units"} <= set(d)
    assert {"regime_id", "declared_regime_id", "novelty", "transition_pct", "declared_vs_detected"} <= set(d["crude_slate"])
    for u in d["units"]:
        assert {"events_open", "flags", "decisions_open", "kpi_vs_plan"} <= set(u), u["unit_id"]


def test_twin_decision_with_recipe_writes_event():
    twin = _get("/api/twin", run_id=RUN, time_min=T)
    cards = [c for u in twin["units"] for c in u.get("decisions_needed", [])]
    if not cards:
        pytest.skip("no open decision cards at this time")
    card = cards[0]
    r = client.post("/api/twin/decision", json={"rec_id": card["rec_id"], "decision": "declined", "run_id": RUN,
                                                "time_min": T, "recipe_id": "rcp_test_contract", "user": "pytest"})
    assert r.status_code in (200, 409), r.text  # 409 = already decided in a previous run of the suite
    evs = _get("/api/agents/events", run_id=RUN)["events"]
    assert any(e.get("recipe_id") == "rcp_test_contract" for e in evs)
