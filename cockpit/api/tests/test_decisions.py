"""Decision layer (DECISION_FIRST_REDESIGN §2, §7) — API tests per decision type on real simulated runs.

Every decision must: carry a verb question and headline, name its problem (P1–P4) and IOCL use case, rank open
decisions first, keep withheld decisions visible with a reason, and write only to the audit log when acted on."""
from __future__ import annotations

import re

from fastapi.testclient import TestClient

from app.engines.decisions import PROBLEMS, TYPES, USE_CASES
from app.main import app
from app.state import get_state

client = TestClient(app)
RUN = "random_s107"
# T_NOVEL was 1500 until the valid-range cut (2 Oct): s107 breaks down at minute 851, so the novel-crude
# check uses minute 800 (D2 "Not yet" and D4 novelty both live there).
T_MOVE, T_HOLD, T_NOVEL = 600, 300, 800
# Since the 2 Oct retrain, s107 t600 leads with an HN move; the LCO cut-point D1 is checked on hold-out s144 t600.
RUN_D1, T_D1 = "random_s144", 600
FINANCIAL = re.compile(r"[$€£₹]\s?[0-9]|\b(USD|EUR|NPV|ROI|payback|cost|price|revenue|profit|savings?)\b", re.I)


def _get(t: int, run: str = RUN) -> dict:
    r = client.get("/api/decisions", params={"run_id": run, "time_min": t})
    assert r.status_code == 200, r.text
    return r.json()


def test_every_decision_names_problem_and_iocl_use_case():
    for t in (T_HOLD, T_MOVE, T_NOVEL):
        for d in _get(t)["decisions"]:
            assert d["type"] in TYPES
            assert d["problem"] and set(d["problem"]) <= set(PROBLEMS)
            assert d["use_case"]["platform_id"] in USE_CASES and d["use_case"]["iocl_title"]
            assert d["question"].endswith("?") and d["headline"]
            assert d["advisory_only"] is True
            assert "owner_role" not in d
            assert not FINANCIAL.search(d["headline"] + d["question"] + (d.get("withheld_text") or ""))


def test_d1_cut_point_move_is_ranked_first_with_prediction():
    b = _get(T_D1, RUN_D1)
    d = b["decisions"][0]
    assert d["type"] == "D1" and d["status"] == "open" and d["urgency"]["rank"] == 1
    mv = d["proposed"]["moves"][0]
    assert mv["tag"] == "SP_LCO_T98" and mv["delta"] != 0
    p = d["predicted"]
    assert p["p_on_spec_after"] >= 0.95  # a raise may trade a little on-spec chance for yield, never below 95 %
    assert (p["mu_after"] - p["mu_before"]) * mv["delta"] > 0 and p["sigma"] > 0  # estimate moves with the lever
    assert d["observed"]["spec_max"] == 765.0
    assert "wait for the lab" in d["proposed"]["alternative"].lower()
    assert d["problem"] == ["P1"] and d["use_case"]["platform_id"] == "UC-01"
    # s107 at the same minute still proposes a cut-point move (heavy naphtha since the retrain)
    d107 = _get(T_MOVE)["decisions"][0]
    assert d107["type"] == "D1" and d107["proposed"]["moves"][0]["tag"] in ("SP_LCO_T98", "SP_HN_T98")


def test_withheld_decisions_stay_visible_with_reason():
    b = _get(T_MOVE)
    withheld = [d for d in b["decisions"] if d["status"] == "withheld"]
    assert withheld, "D3/D5–D7 must appear as withheld, not disappear"
    for d in withheld:
        assert d["withheld_reason"] and d["withheld_text"]
        assert d["proposed"]["moves"] == []
    d3 = next(d for d in b["decisions"] if d["type"] == "D3")
    assert d3["status"] == "withheld"  # surrogate extrapolates; honest until the lever batch lands


def test_d2_trust_and_d4_novel_crude():
    b = _get(T_NOVEL)
    types = {d["type"]: d for d in b["decisions"]}
    assert types["D2"]["status"] == "withheld" and "uncertain" in types["D2"]["withheld_text"]
    assert types["D4"]["withheld_reason"] == "novelty" and types["D4"]["use_case"]["platform_id"] == "FEED"


def test_d9_merged_single_sample_decision():
    d9 = [d for d in _get(T_MOVE)["decisions"] if d["type"] == "D9"]
    assert len(d9) == 1 and d9[0]["status"] == "open"
    assert d9[0]["observed"]["next_lab_in_min"] >= 120


def test_open_before_withheld_before_watch():
    order = {"open": 0, "held": 1, "withheld": 2, "watch": 3}
    st = [order.get(d["status"], 9) for d in _get(T_MOVE)["decisions"]]
    assert st == sorted(st)


def test_act_hold_then_reopen_and_refuse_accept_on_withheld():
    try:
        _act_checks()
    finally:  # keep the demo audit db clean: remove this test's action rows (audit trail rows stay, as in production)
        db = get_state().db
        db.execute("DELETE FROM decision_actions WHERE note='pytest'")
        db.commit()


def _act_checks():
    b = _get(T_MOVE)
    d1 = b["decisions"][0]
    r = client.post(f"/api/decisions/{d1['id']}/act", json={"action": "hold", "run_id": RUN, "time_min": T_MOVE,
                                                           "note": "pytest"})
    assert r.status_code == 200 and r.json()["audit_id"] > 0
    assert "control system" in r.json()["note"]
    after = client.get(f"/api/decisions/{d1['id']}", params={"run_id": RUN, "time_min": T_MOVE}).json()
    assert after["status"] == "held"
    later = client.get(f"/api/decisions/{d1['id']}", params={"run_id": RUN, "time_min": T_MOVE + 35})
    if later.status_code == 200:  # still live 35 min later → hold has lapsed
        assert later.json()["status"] == "open" and later.json()["action"]["reopened"]
    w = next(d for d in b["decisions"] if d["status"] == "withheld")
    r = client.post(f"/api/decisions/{w['id']}/act", json={"action": "accept", "run_id": RUN, "time_min": T_MOVE})
    assert r.status_code == 409
    assert client.post(f"/api/decisions/{d1['id']}/act", json={"action": "approve", "run_id": RUN,
                                                              "time_min": T_MOVE}).status_code == 400
    assert client.get("/api/decisions/nope", params={"run_id": RUN, "time_min": T_MOVE}).status_code == 404


def test_coverage_lens_is_honest():
    rows = client.get("/api/decisions-coverage", params={"run_id": RUN, "time_min": T_MOVE}).json()["rows"]
    assert any(r["state"] == "not claimed" for r in rows)
    uc01 = next(r for r in rows if r["platform_id"] == "UC-01")
    assert uc01["state"] == "active"
