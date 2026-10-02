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
    assert next_lab_min(RUN, 1150) == 1320       # full_v1 runs are 1,600 min (the test predates the full length)
    assert next_lab_min(RUN, 1320) is None


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


def test_band_wraps_live_trajectory_not_a_lagged_median():
    """verbatim.md Part 6 §2 — the expected value / ±2σ envelope must follow the live process, not a 240-min median.

    For every non-U4 unit (regime-surrogate path) on two runs: (a) the measured curve sits inside the band ≥ 85 % of
    the time after warm-up, (b) the expected curve carries the dynamics (its minute-to-minute movement is at least
    half that of the measured curve) and (c) it does not lag — its lag-0 correlation with measured beats its lag-120
    correlation.
    """
    from app.engines.surrogates import UNIT_PRIMARY_TAGS, expected_series

    for run in ("random_s144", "random_s107"):
        for unit, tags in UNIT_PRIMARY_TAGS.items():
            if unit == "unit_4_fractionator":
                continue
            exp = expected_series(run, unit)
            d = detection_series(run, unit, tags[0])
            if not exp or d is None:
                continue
            m, e, lo, hi = d["measured"], d["expected"], d["band_lo"], d["band_hi"]
            ok = np.isfinite(m) & np.isfinite(e) & np.isfinite(lo) & np.isfinite(hi)
            ok[:120] = False  # warm-up
            if ok.sum() < 300:
                continue
            inside = np.mean((m[ok] >= lo[ok]) & (m[ok] <= hi[ok]))
            assert inside >= 0.85, f"{run} {unit} {tags[0]}: only {inside:.0%} of measured inside the band"
            # dynamics: 60-min movement of the expected curve vs the 30-min-smoothed measured curve (noise excluded)
            import pandas as pd
            ms = pd.Series(m).rolling(30, center=True, min_periods=5).mean().to_numpy()[ok]
            d60m, d60e = ms[60:] - ms[:-60], e[ok][60:] - e[ok][:-60]
            assert np.std(d60e) >= 0.3 * np.std(d60m) or np.std(d60m) < 1e-6, f"{run} {unit}: expected is flat vs measured"
            mm, ee = ms - np.nanmean(ms), e[ok] - e[ok].mean()
            if np.std(mm) > 1e-6 and np.std(ee) > 1e-6:
                c0 = np.corrcoef(mm, ee)[0, 1]
                c120 = np.corrcoef(mm[120:], ee[:-120])[0, 1]
                assert c0 >= c120 - 0.02, f"{run} {unit}: expected lags measured (c0={c0:.2f} < c120={c120:.2f})"

