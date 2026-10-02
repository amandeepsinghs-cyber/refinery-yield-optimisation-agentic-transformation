"""L0 contract tests — `GET /api/twin` additions for the Refinery Twin home (API_CONTRACT_v3 §6, SDD-L0-01, BDD-28).

Guards against the façade failure mode: every L0 field must be derived (numeric plan/tol, real consequence lines,
compact timeline labels) — never a placeholder string. Uses the held-out run `random_s144`."""
from __future__ import annotations

import json
import re

from fastapi.testclient import TestClient

from app.engines.systems import CONSEQUENCE_RULES, _horizon_min, consequence_for, short_line
from app.main import app

client = TestClient(app)
RUN, T = "random_s144", 600
UNITS = ["unit_1_furnace", "unit_2_riser", "unit_3_regenerator", "unit_4_fractionator", "unit_5_condenser",
         "unit_6_stabiliser"]
FINANCIAL = re.compile(r"[$€£₹]\s?\d|\b(USD|EUR|NPV|ROI|payback|cost|budget|price|revenue|profit|savings?|monetary)\b",
                       re.I)
PLACEHOLDERS = re.compile(r"\b(Action required|TODO|TBD|lorem|placeholder)\b", re.I)


def _twin():
    r = client.get("/api/twin", params={"run_id": RUN, "time_min": T})
    assert r.status_code == 200, r.text[:300]
    body = r.json()
    blob = json.dumps(body)
    assert not FINANCIAL.search(blob), "financial wording leaked from /api/twin"
    assert not PLACEHOLDERS.search(blob), "placeholder text leaked from /api/twin"
    return body


def test_every_unit_carries_numeric_kpi_vs_plan_and_counts():
    body = _twin()
    assert [u["unit_id"] for u in body["units"]] == UNITS
    for u in body["units"]:
        k = u["kpi_vs_plan"]
        assert k is not None, u["unit_id"]
        for key in ("tag", "label", "value", "plan", "tol", "deviation", "unit", "state", "plan_source"):
            assert key in k, (u["unit_id"], key)
        assert isinstance(k["value"], (int, float)) and isinstance(k["plan"], (int, float)) and k["tol"] > 0
        assert k["state"] in {"OK", "WATCH", "ACT"}
        assert abs(k["deviation"] - (k["value"] - k["plan"])) < 0.02
        expected_state = "OK" if abs(k["deviation"]) <= k["tol"] else "WATCH" if abs(k["deviation"]) <= 2 * k["tol"] else "ACT"
        assert k["state"] == expected_state, (u["unit_id"], k)
        assert k["plan_source"] in {"set point", "committee", "regime surrogate"}
        for key in ("events_open", "flags", "decisions_open"):
            assert isinstance(u[key], int) and u[key] >= 0
        assert u["flags"] <= u["events_open"]
    assert body["units"][3]["kpi_vs_plan"]["tag"] == "LCO_T98_F"
    assert body["units"][3]["kpi_vs_plan"]["plan_source"] == "set point"


def test_needs_attention_is_ranked_deduplicated_and_has_consequences():
    body = _twin()
    na = body["needs_attention"]
    assert 1 <= len(na) <= 5
    ranks = {"alarm": 0, "warn": 1, "info": 2}
    assert [ranks[n["severity"]] for n in na] == sorted(ranks[n["severity"]] for n in na), "alarm before warn before info"
    assert len({(n["unit_id"], n["tag"]) for n in na}) == len(na), "one line per (unit, tag)"
    for n in na:
        for key in ("unit_id", "unit_label", "severity", "kind", "tag", "time_min", "time_label", "line", "consequence",
                    "event_id"):
            assert key in n, key
        assert n["unit_id"] in UNITS
        assert re.fullmatch(r"\d{2}:\d{2}", n["time_label"])
        assert n["tag"] in n["line"] or n["kind"] == "regime_change" or len(n["line"]) > 10
        assert "since" in n["line"]
    with_rule = [n for n in na if n["kind"] in ("breach", "cusum")]
    assert with_rule and all(n["consequence"] and len(n["consequence"]) > 30 for n in with_rule)
    assert all(n["loop"] in {"Catalyst loop", "Heat loop", "Hydrocarbon loop"} for n in with_rule)
    assert all(45 <= n["horizon_min"] <= 180 for n in with_rule)


def test_timeline_is_compact_and_ordered():
    body = _twin()
    tl = body["timeline"]
    assert len(tl) >= 3
    assert [x["time_min"] for x in tl] == sorted(x["time_min"] for x in tl)
    for x in tl:
        assert len(x["label"]) <= 60, x["label"]
        assert x["kind"] and x["time_label"] and x["event_id"]
        assert x["time_min"] <= T


def test_plant_strip():
    p = _twin()["plant"]
    assert p["shift_label"] in {"Shift A", "Shift B", "Shift C"}
    assert re.fullmatch(r"\d{2}:\d{2}", p["clock"]) and p["time_min"] == T
    assert isinstance(p["mass_closure_pct"], float) and abs(p["mass_closure_pct"]) < 5
    assert isinstance(p["open_decisions"], int) and isinstance(p["agent_flags"], int)
    assert p["agent_flags"] >= 1 and p["top_flag"]
    assert p["units_act"] + p["units_watch"] <= 6


def test_consequence_rules_cover_every_primary_tag_both_directions():
    from app.engines.surrogates import UNIT_PRIMARY_TAGS
    for unit_id, tags in UNIT_PRIMARY_TAGS.items():
        tag = tags[0]
        for d in ("up", "down"):
            assert (unit_id, tag, d) in CONSEQUENCE_RULES or (unit_id, tag, "any") in CONSEQUENCE_RULES, (unit_id, tag, d)
    ev = {"unit_id": "unit_4_fractionator", "tag": "LCO_T98_F", "residual": 4.8, "sigma": 1.6, "kind": "cusum", "time_min": 503}
    c = consequence_for(ev)
    assert c["loop"] == "hydrocarbon" and "PA3" in c["text"] and f"~{c['horizon_min']} min" in c["text"]
    assert _horizon_min(3 * 1.6, 1.6) == 180 and _horizon_min(7 * 1.6, 1.6) == 45 and _horizon_min(20, 1.6) == 45
    assert short_line(ev).startswith("LCO T98 +4.8 °F above expected (sustained shift) since ")
    assert "since" not in short_line(ev, with_time=False)
    assert consequence_for({"unit_id": "unit_9", "tag": "x", "residual": 1}) is None


def test_every_unit_carries_a_live_spark_with_band_and_moments():
    """Pass H: each L0 tile is a mini-L1 — 4 h window of measured + expected ± 2σ, plus N(μ,σ) for the bell."""
    body = _twin()
    for u in body["units"]:
        s = u.get("spark")
        assert s is not None, f"{u['unit_id']} has no spark"
        n = len(s["time_min"])
        assert n >= 60, (u["unit_id"], n)
        for key in ("measured", "expected", "band_lo", "band_hi"):
            assert len(s[key]) == n, (u["unit_id"], key)
        assert s["tag"] == u["kpi_vs_plan"]["tag"]
        assert s["sigma"] > 0 and s["mu"] == s["mu"]  # finite, non-degenerate
        assert all(lo <= hi for lo, hi in zip(s["band_lo"], s["band_hi"]) if lo == lo and hi == hi)
        assert s["time_min"][-1] <= T and s["time_min"][0] >= T - 240


def test_crude_slate_posterior_sums_to_one():
    """Pass I: L0 crude-adaptation card shows the regime posterior, not a label."""
    body = _twin()
    p = body["crude_slate"].get("p_regime")
    assert isinstance(p, dict) and set(p) >= {"R1", "R2", "R3", "R4"}
    assert abs(sum(p.values()) - 1.0) < 0.02, p
    assert all(0.0 <= v <= 1.0 for v in p.values())
