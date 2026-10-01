"""L1 workbench aggregate (SDD-L1-01..07, contract §5) — every unit renders four real zones."""
from __future__ import annotations

import json
import re

from app.engines.workbench import scope_snapshot, workbench

RUN, T = "random_s144", 600
UNITS = ["unit_1_furnace", "unit_2_riser", "unit_3_regenerator", "unit_4_fractionator", "unit_5_condenser", "unit_6_stabiliser"]
GREY = re.compile(r"#808080|#999|#9ca3af|#6b7280|#64748b|#94a3b8|#cbd5e1|\bgr[ae]y\b", re.I)
FIN = re.compile(r"[$€£₹]\s?[0-9]|\b(USD|EUR|NPV|ROI|payback|cost|budget|price|revenue|profit|savings?|monetary)\b", re.I)
PALETTE = {"#1d4ed8", "#047857", "#6d28d9", "#b91c1c", "#0e7490", "#be185d", "#c2410c", "#ea580c", "#0f766e", "#7c2d12",
           "#4338ca", "#9333ea", "#0369a1", "#ca8a04", "#b45309"}


def test_workbench_four_zones_every_unit():
    for unit_id in UNITS:
        w = workbench(unit_id, RUN, T)
        assert w, unit_id
        for zone in ("unit", "time", "series", "panels", "analysis", "models", "regime", "recipe", "decisions", "citations"):
            assert zone in w, (unit_id, zone)
        # Data: every panel has traces whose keys exist in series, ≤ 400 points, palette colours only
        n = len(w["series"]["time_min"])
        assert 0 < n <= 400
        for p in w["panels"]:
            assert p["traces"], (unit_id, p["panel_id"])
            for tr in p["traces"]:
                assert tr["key"] in w["series"]["keys"], (unit_id, p["panel_id"], tr["key"])
                assert len(w["series"]["keys"][tr["key"]]) == n
                assert tr["color"] in PALETTE and tr["role"]
            for h in p.get("hlines", []):
                assert h["color"] in PALETTE
        kinds = {p["kind"] for p in w["panels"]}
        assert {"measured_vs_expected", "residual", "mv", "disturbance", "yield"} <= kinds, (unit_id, kinds)
        prim = w["analysis"]["primary_tag"]
        for k in (prim, f"expected:{prim}", f"band_lo:{prim}", f"band_hi:{prim}", f"residual:{prim}", f"sigma3:{prim}", f"cusum:{prim}"):
            assert k in w["series"]["keys"], (unit_id, k)
        assert not GREY.search(json.dumps(w["panels"]))
        # Analysis
        a = w["analysis"]
        assert a["expected_source"] in ("committee", "regime surrogate")
        assert a["residual_now"] is not None and a["sigma_now"] > 0
        assert isinstance(a["breach_open"], bool) and a["minutes_before_next_lab"] == 240
        assert a["summary"]["en"] and a["summary"]["hinglish"] and a["summary"]["hi"] and prim in a["summary"]["en"]
        # Models
        m = w["models"]
        assert m["surrogate"]["regime_id"] == w["regime"]["regime_id"] and m["surrogate"]["sensitivity"]
        assert m["pinn_checks"] and all({"name", "value", "limit", "pass", "unit"} <= set(c) for c in m["pinn_checks"])
        assert m["gate"]["status"] in ("ISSUED", "WITHHELD")
        assert (m["committee"] is not None) == (unit_id == "unit_4_fractionator")
        # Decisions + unit io
        assert w["unit"]["io"]["inputs"] and w["unit"]["io"]["outputs"]
        assert w["unit"]["use_cases"] and all("id" in uc for uc in w["unit"]["use_cases"])
        for d in w["decisions"]:
            assert "recipe_id" in d
        assert not FIN.search(json.dumps(w))


def test_workbench_fractionator_specifics():
    w = workbench("unit_4_fractionator", RUN, 200)
    assert w["analysis"]["expected_source"] == "committee"
    q = next(p for p in w["panels"] if p["panel_id"] == "quality")
    assert any(h["role"] == "spec" and h["value"] == 765.0 for h in q["hlines"])
    assert any(h["role"] == "plan" for h in q["hlines"])
    assert w["models"]["gate"]["w90"] is not None and w["models"]["gate"]["w90_limit"] == 14.0
    assert w["recipe"]["gate"] == "ISSUED"
    assert all(d["recipe_id"] == w["recipe"]["recipe_id"] for d in w["decisions"])
    assert "tray_profile" in {p["panel_id"] for p in w["panels"]}


def test_workbench_window_and_step():
    w = workbench("unit_2_riser", RUN, T, window_min=240, step=1)
    t = w["series"]["time_min"]
    assert t[0] >= T - 240 and t[-1] <= T and len(t) <= 400
    assert w["time"]["window_start"] == T - 240 and w["time"]["window_end"] == T


def test_scope_snapshot_is_small():
    for unit_id in UNITS + [None]:
        s = scope_snapshot(RUN, T, unit_id)
        assert len(json.dumps(s)) <= 2048, unit_id
        assert "regime" in s


def test_workbench_route_time_min_optional_defaults_to_last_minute():
    """A fresh browser (empty store) opens L1 without time_min; the route picks the default run's last minute and echoes run_id."""
    from fastapi.testclient import TestClient
    from app.main import app
    from app.state import get_state
    from app.routers.common import default_run

    client = TestClient(app)
    r = client.get("/api/unit/unit_4_fractionator/workbench")
    assert r.status_code == 200, r.text
    body = r.json()
    rid = default_run()
    assert body["run_id"] == rid
    last = int(round(float(get_state().catalog.load(rid)["time_min"].iloc[-1])))
    assert body["time"]["time_min"] == last
    # explicit time_min still honoured
    r2 = client.get("/api/unit/unit_4_fractionator/workbench", params={"time_min": 300, "run_id": RUN})
    assert r2.status_code == 200 and r2.json()["time"]["time_min"] == 300 and r2.json()["run_id"] == RUN


def test_use_case_signature_panels_point_at_real_panels():
    """BDD-28: /twin/unit/unit_1_furnace?uc=UC-05 must land on the combustion panel; every panel_id must exist."""
    from app.engines.workbench import workbench
    from app.routers.common import default_run
    rid = default_run()
    u1 = workbench("unit_1_furnace", rid, 600)
    ids = {p["panel_id"] for p in u1["panels"]}
    uc5 = next(u for u in u1["unit"]["use_cases"] if u["id"] == "UC-05")
    assert uc5["panel_id"] == "combustion" and "combustion" in ids
    u4 = workbench("unit_4_fractionator", rid, 600)
    ids4 = {p["panel_id"] for p in u4["panels"]}
    for uc in u4["unit"]["use_cases"]:
        assert uc["panel_id"] in ids4
    assert next(u for u in u4["unit"]["use_cases"] if u["id"] == "UC-03")["panel_id"] == "quality_2"
