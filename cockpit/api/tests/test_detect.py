"""E3 sentinels (SDD-DET-01..05, BDD-26, contract §3) — unit-level tests on random_s144."""
from __future__ import annotations

import json
import re

import numpy as np

from app.engines.detect import (E3_KINDS, briefing, detection_series, events_for_run, next_lab_min, open_breach,
                                root_cause)
from app.state import get_state

RUN = "random_s144"
FIN = re.compile(r"[$€£₹]\s?[0-9]|\b(USD|EUR|NPV|ROI|payback|cost|budget|price|revenue|profit|savings?|monetary)\b", re.I)
DEVANAGARI = re.compile(r"[\u0900-\u097F]")


def test_detection_series_shapes_and_statistics():
    d = detection_series(RUN, "unit_4_fractionator", "LCO_T98_F")
    assert d is not None and d["expected_source"] == "committee"
    n = len(d["time_min"])
    for k in ("measured", "expected", "band_lo", "band_hi", "residual", "sigma", "cusum", "breach", "cusum_mask"):
        assert len(d[k]) == n, k
    assert np.all(d["sigma"] > 0)
    assert np.allclose(d["residual"], d["measured"] - d["expected"], equal_nan=True)
    finite = np.isfinite(d["band_lo"]) & np.isfinite(d["band_hi"])  # tail is NaN while the run is still being simulated
    assert finite.sum() > 0.5 * n and np.all(d["band_lo"][finite] <= d["band_hi"][finite])
    # CUSUM resets after it signals, so it never grows without bound
    assert np.nanmax(np.abs(d["cusum"])) < 20 * np.nanmax(d["sigma"])
    d2 = detection_series(RUN, "unit_2_riser", "conversion_pct")
    assert d2 is not None and d2["expected_source"] == "regime surrogate"


def test_events_cover_units_with_numbers_and_trilingual_briefings():
    ev = events_for_run(RUN)["events"]
    kinds = {e["kind"] for e in ev}
    assert kinds & {"breach", "cusum"}
    assert "regime_change" in kinds, "the real R3→R2 switch on random_s144 must be detected"
    assert all(e["kind"] in E3_KINDS + ("accepted", "declined") for e in ev)
    assert all(e["severity"] in {"info", "warn", "alarm"} for e in ev)
    units = {e["unit_id"] for e in ev if e["kind"] in ("breach", "cusum")}
    assert len(units) >= 4, units
    for e in ev:
        if e["kind"] in ("breach", "cusum"):
            for k in ("residual", "sigma", "cusum", "expected", "measured", "root_cause", "next_lab_min", "briefing", "tag"):
                assert k in e, k
            b = e["briefing"]
            assert b["en"] and b["hinglish"] and b["hi"] and DEVANAGARI.search(b["hi"])
            for lang in ("en", "hinglish", "hi"):
                assert e["tag"] in b[lang], "briefings must quote the tag id"
                assert f"{e['residual']:+.1f}" in b[lang], "briefings must carry the residual value"
                assert f"t={e['time_min']}" in b[lang]
            assert not FIN.search(json.dumps(e))
    # regime_change events are rare after the dwell/hysteresis settler (one real switch on this run)
    assert sum(1 for e in ev if e["kind"] == "regime_change") <= 3


def test_events_are_stable_and_filterable():
    a = events_for_run(RUN, upto_time_min=600, unit_id="unit_4_fractionator")["events"]
    assert all(e["time_min"] <= 600 and e["unit_id"] == "unit_4_fractionator" for e in a)
    b = events_for_run(RUN, upto_time_min=600, unit_id="unit_4_fractionator")["events"]
    assert [e["event_id"] for e in a] == [e["event_id"] for e in b]
    assert len({e["event_id"] for e in events_for_run(RUN)["events"]}) == len(events_for_run(RUN)["events"])


def test_next_lab_from_lab_schedule():
    assert next_lab_min(RUN, 100) == 360
    assert next_lab_min(RUN, 600) == 840
    assert next_lab_min(RUN, 1150) is None


def test_open_breach_and_root_cause():
    s = open_breach(RUN, "unit_4_fractionator", "LCO_T98_F", 600)
    assert {"residual_now", "sigma_now", "cusum_now", "breach_open", "first_breach_min"} <= set(s)
    rc = root_cause(RUN, "LCO_T98_F", s["index"], "R2", s["sigma_now"])
    assert all({"tag", "label", "contrib", "direction"} <= set(r) for r in rc)
    assert all(r["direction"] in {"up", "down", "flat"} for r in rc)


def test_briefing_has_no_financial_words_and_quotes_numbers():
    b = briefing("HN_T98_F", "breach", 7.4, 2.26, 59.1, 537.5, 530.1, 429, 840,
                 [{"tag": "feed_flow_lb_s", "label": "feed rate", "contrib": 4.32, "direction": "up"}], "WITHHELD:spread_gate")
    for lang in ("en", "hinglish", "hi"):
        assert "HN_T98_F" in b[lang] and "+7.4" in b[lang] and "537.5" in b[lang] and "t=429" in b[lang]
        assert not FIN.search(b[lang])
    assert DEVANAGARI.search(b["hi"])


def test_detect_meta_marks_version():
    st = get_state()
    events_for_run(RUN)
    row = st.db.execute("SELECT fit_key FROM detect_meta WHERE run_id=?", (RUN,)).fetchone()
    assert row and row[0].startswith("detect")
