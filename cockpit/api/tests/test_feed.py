"""Feed model (DECISIONS S-8, SDD-FEED-01..08, BDD-39): feed change, feed-API estimate, novelty, holds, catalyst flow.

Runs on the real simulated runs. Scripted outcomes are switched on per test where the demo behaviour is checked.
"""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.engines import feed as feed_engine
from app.main import app

client = TestClient(app)


def _decisions(run: str, t: int) -> dict:
    r = client.get("/api/decisions", params={"run_id": run, "time_min": t})
    assert r.status_code == 200, r.text
    return r.json()


def test_feed_api_estimate_has_a_reported_heldout_error():
    fit = feed_engine.load_fit()
    ho = fit["heldout"]
    assert ho["runs"].startswith("seed ≥") and ho["rows"] > 1000
    assert ho["mae_api"] < 0.5 and ho["r2"] > 0.9          # a real soft sensor, scored on runs it never saw
    dh = fit["detector_heldout"]
    assert dh["switches"] > 5 and dh["caught"] >= dh["switches"] - 1


def test_feed_settled_on_holdout_s144_at_10():
    reg = client.get("/api/regime", params={"run_id": "random_s144", "time_min": 600}).json()
    f = reg["feed"]
    assert f["state"] == "settled" and f["hold"] is False
    assert abs(f["api_est"] - f["api_declared"]) <= 0.5      # near the declared 23.3
    assert f["feed_class"] == "medium" and f["crude_family_context"]
    assert f["model"]["heldout"]["mae_api"] is not None


def test_feed_changing_mid_switch_s107_holds_downstream_advice():
    reg = client.get("/api/regime", params={"run_id": "random_s107", "time_min": 440}).json()
    f = reg["feed"]
    assert f["state"] == "changing" and 0 < f["pct_through"] < 100 and f["hold_reason"] == "feed_changing"
    b = _decisions("random_s107", 440)
    d4 = [d for d in b["decisions"] if d["type"] == "D4"]
    assert d4 and "Feed change detected" in d4[0]["headline"] and "crude" not in d4[0]["headline"].lower()
    for d in b["decisions"]:
        if d["type"] in ("D1", "D3", "D5", "D6", "D7") and not d.get("action"):
            assert d["status"] != "open", d["headline"]
            if d["status"] == "withheld" and d["withheld_reason"] == "feed_changing":
                assert d["proposed"]["moves"] == [] and d["headline"].startswith("Not yet")


def test_every_downstream_decision_says_which_feed_it_used():
    b = _decisions("random_s107", 600)
    downstream = [d for d in b["decisions"] if d["type"] in ("D1", "D3", "D5", "D6", "D7")]
    assert downstream
    for d in downstream:
        assert d["feed_used"]["line"].startswith("For this feed (API ≈ ")


def test_novelty_is_not_capped(monkeypatch):
    monkeypatch.setenv("FCC_SCRIPTED", "1")
    seen = [client.get("/api/regime", params={"run_id": "random_s107", "time_min": t}).json()["novelty"]
            for t in range(700, 851, 10)]
    assert max(seen) > 0.4


def test_scripted_family_uses_detected_timing_not_a_fixed_lag(monkeypatch):
    monkeypatch.setenv("FCC_SCRIPTED", "1")
    reg = client.get("/api/regime", params={"run_id": "random_s107", "time_min": 600}).json()
    assert reg["crude_family_is_context"] is True
    assert reg["detected_at_min"] == reg["feed"]["settled_at_min"]
    assert reg["detection_delay_min"] != 12


def test_catalyst_flow_is_never_advised():
    b = _decisions("random_s107", 600)
    assert any("catalyst" in n["setting"].lower() and "circulation" in n["setting"].lower()
               for n in b["never_recommended"])
    for d in b["decisions"]:
        for m in (d.get("proposed") or {}).get("moves") or []:
            assert m.get("tag") not in ("F_regen_cat", "F_spent_cat", "C_regen_cat"), d["headline"]
        for lv in d.get("levers") or []:
            assert "cat" not in lv["tag"].lower(), lv


def test_feed_novelty_is_about_the_feed_not_the_unit(monkeypatch):
    # 7 Oct owner review: s107 after 11:00 drifts toward breakdown (unit pattern), but the feed itself is familiar,
    # so no feed hold; the operating-pattern score is still reported for engineers.
    monkeypatch.setenv("FCC_SCRIPTED", "1")
    for t in range(660, 851, 30):
        f = client.get("/api/regime", params={"run_id": "random_s107", "time_min": t}).json()["feed"]
        assert f["novel"] is False and f["novelty"] < 0.5
        assert f["hold_reason"] in (None, "feed_changing")
        assert "unit_pattern_novelty" in f


def test_class_probabilities_from_the_estimate(monkeypatch):
    monkeypatch.setenv("FCC_SCRIPTED", "1")
    f = client.get("/api/regime", params={"run_id": "random_s144", "time_min": 600}).json()["feed"]
    cp = f["class_probs"]
    assert [c["class"] for c in cp] == ["heavy", "medium", "light"]
    assert abs(sum(c["p"] for c in cp) - 1) < 0.01
    assert max(cp, key=lambda c: c["p"])["class"] == f["feed_class"]
