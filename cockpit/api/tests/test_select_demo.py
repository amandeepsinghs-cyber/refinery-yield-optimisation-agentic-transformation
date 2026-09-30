"""Unit tests for app.select_demo: M1/M2/M3 detection, ranking, and graceful degradation."""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from app.config import get_settings
from app.select_demo import (
    M1Candidate,
    M2Candidate,
    M3Candidate,
    build_demo_yaml,
    evaluate_scored_run,
    find_m1_candidates,
    find_m2_candidates,
    find_m3_candidates,
    generate_candidates_markdown,
    scan_and_rank_demo,
)


@pytest.fixture
def synthetic_run_data():
    """Build a deterministic synthetic run with known M1, M2, and M3 moments."""
    s = get_settings()
    n = 1000
    t = np.arange(n, dtype=int)

    # 1. Base process signals
    df = pd.DataFrame({
        "time_min": t,
        "dist_feed_API": np.full(n, 25.0),
        "feed_flow_lb_s": np.full(n, 165.0),
        "SP_T_riser_ROT_F": np.full(n, 969.0),
        "SP_LCO_T98": np.full(n, 755.0),
        "SP_HN_T98": np.full(n, 530.0),
        "event_code": np.zeros(n, dtype=int),
        "crude_id": np.ones(n, dtype=int),
        "cutpoint_auto": np.zeros(n, dtype=int),
        "lab_sample": np.zeros(n, dtype=int),
        "LCO_T98_F": np.full(n, 752.0),
        "HN_T98_F": np.full(n, 530.0),
    })

    # Labs at t=200 and t=680
    df.loc[200, "lab_sample"] = 1
    df.loc[680, "lab_sample"] = 1

    # M1: Crude switch at t=350 causes LCO truth to drift from 752 to 758 (+6.0 °F)
    df.loc[350:410, "event_code"] = 1
    df.loc[350:, "crude_id"] = 2
    drift = np.linspace(0, 6.0, 150)
    df.loc[350:499, "LCO_T98_F"] = 752.0 + drift
    df.loc[500:680, "LCO_T98_F"] = 758.0

    # Cutpoint trim window after lab at 680 (t=740..800)
    df.loc[740:800, "cutpoint_auto"] = 1

    # 2. Pipeline arrays
    lco_truth = df["LCO_T98_F"].to_numpy(dtype=float)
    lco_mean = lco_truth + np.random.default_rng(42).normal(0, 0.4, n)  # soft sensor follows closely
    hn_truth = df["HN_T98_F"].to_numpy(dtype=float)
    hn_mean = hn_truth + np.random.default_rng(43).normal(0, 0.3, n)

    # M3: HN distribution widens at t=550..600 (W90 jumps to 18.5 °F, exceeding 14 °F limit)
    hn_w90 = np.full(n, 8.0)
    hn_w90[550:600] = 18.5
    hn_gate = np.full(n, "PASS", dtype=object)
    hn_gate[550:600] = "WITHHELD"
    hn_gate_reason = np.full(n, "", dtype=object)
    hn_gate_reason[550:600] = "Distribution spread too wide (W90 > 14.0)"
    hn_trust = np.full(n, "GREEN", dtype=object)
    hn_trust[550:600] = "RED"

    # M2: Safe recommendation at t=280 (steady state, P(on-spec)=0.97, delta_sp=+3.0)
    recs = [
        {
            "rec_id": "synth-LCO-280",
            "time_min": 280,
            "property": "LCO_T98_F",
            "action": "RAISE",
            "delta_sp": 3.0,
            "current_sp": 755.0,
            "recommended_sp": 758.0,
            "p_on_spec_before": 0.99,
            "p_on_spec_after": 0.97,
            "trust": "GREEN",
            "gate_status": "PASS",
        },
        {
            "rec_id": "synth-HN-560",
            "time_min": 560,
            "property": "HN_T98_F",
            "action": "WITHHELD",
            "delta_sp": 0.0,
            "current_sp": 530.0,
            "recommended_sp": 530.0,
            "p_on_spec_before": 0.70,
            "p_on_spec_after": 0.70,
            "trust": "RED",
            "gate_status": "WITHHELD",
        },
    ]

    labs = [
        {"sample_id": "s1", "property": "LCO_T98_F", "time_min": 200, "value": 752.2},
        {"sample_id": "s2", "property": "LCO_T98_F", "time_min": 680, "value": 758.4},
        {"sample_id": "s3", "property": "HN_T98_F", "time_min": 200, "value": 530.1},
        {"sample_id": "s4", "property": "HN_T98_F", "time_min": 680, "value": 529.9},
    ]

    arrs = {
        "time_min": t,
        "LCO_T98_F|truth": lco_truth,
        "LCO_T98_F|mean": lco_mean,
        "LCO_T98_F|w90": np.full(n, 7.5),
        "LCO_T98_F|gate": np.full(n, "PASS", dtype=object),
        "LCO_T98_F|gate_reason": np.full(n, "", dtype=object),
        "LCO_T98_F|trust": np.full(n, "GREEN", dtype=object),
        "HN_T98_F|truth": hn_truth,
        "HN_T98_F|mean": hn_mean,
        "HN_T98_F|w90": hn_w90,
        "HN_T98_F|gate": hn_gate,
        "HN_T98_F|gate_reason": hn_gate_reason,
        "HN_T98_F|trust": hn_trust,
        "HN_T98_F|bimodal": np.zeros(n, dtype=bool),
        "HN_T98_F|bimodality_d": np.zeros(n, dtype=float),
        "HN_T98_F|mu": np.column_stack([hn_mean - 1.0, hn_mean + 1.0, hn_mean]),
    }
    arrs["HN_T98_F|mu"][550:600] = np.column_stack([
        hn_mean[550:600] - 8.0,
        hn_mean[550:600] + 7.0,
        hn_mean[550:600],
    ])

    meta = {
        "group": "synth_s140",
        "run_id": "synth_s140",
        "batch": "test_batch",
        "recs": recs,
        "labs": labs,
    }

    return arrs, meta, df, s


def test_find_m1_candidates(synthetic_run_data):
    arrs, meta, df, s = synthetic_run_data
    candidates = find_m1_candidates(arrs, meta, df, s, target_prop="LCO_T98_F")

    assert len(candidates) >= 1
    c = candidates[0]
    assert c.run_id == "synth_s140"
    assert c.property == "LCO_T98_F"
    assert c.max_abs_drift_F >= 5.0  # +6.0 °F drift
    assert c.confirmed_by_lab is True
    assert c.cutpoint_in_manual is True
    assert c.score > 20.0
    assert c.window[0] <= 350
    assert c.window[1] >= 680


def test_find_m2_candidates(synthetic_run_data):
    arrs, meta, df, s = synthetic_run_data
    candidates = find_m2_candidates(arrs, meta, df, s, target_prop="LCO_T98_F")

    assert len(candidates) >= 1
    c = candidates[0]
    assert c.run_id == "synth_s140"
    assert c.time_min == 280
    assert c.action == "RAISE"
    assert c.delta_sp_F == 3.0
    assert c.p_on_spec_after >= 0.95
    assert c.trust == "GREEN"
    assert c.hindsight_safe is True
    assert c.score > 50.0


def test_find_m3_candidates(synthetic_run_data):
    arrs, meta, df, s = synthetic_run_data
    candidates = find_m3_candidates(arrs, meta, df, s, target_prop="HN_T98_F")

    assert len(candidates) >= 1
    c = candidates[0]
    assert c.run_id == "synth_s140"
    assert c.property == "HN_T98_F"
    assert c.w90_F >= 18.0
    assert c.gate_status == "WITHHELD"
    assert c.hindsight_justified is True
    assert 550 <= c.time_min <= 600
    assert c.score > 30.0


def test_evaluate_scored_run_and_composite(synthetic_run_data):
    arrs, meta, df, s = synthetic_run_data
    ev = evaluate_scored_run("synth_s140", arrs, meta, df, s)

    assert ev.run_id == "synth_s140"
    assert ev.best_m1 is not None
    assert ev.best_m2 is not None
    assert ev.best_m3 is not None
    # All 3 moments present -> composite receives high synergy bonus
    assert ev.composite_score > 100.0


def test_build_demo_yaml(synthetic_run_data):
    arrs, meta, df, s = synthetic_run_data
    ev = evaluate_scored_run("synth_s140", arrs, meta, df, s)
    yaml_obj = build_demo_yaml([ev])

    assert "demo" in yaml_obj
    demo = yaml_obj["demo"]
    assert demo["run"] == "synth_s140"
    assert "scenes" in demo
    assert "scene1" in demo["scenes"]
    assert "scene2" in demo["scenes"]
    assert "scene3" in demo["scenes"]
    assert demo["scenes"]["scene1"]["minute"] == 280
    assert "moments" in demo
    assert demo["moments"]["m1"]["max_abs_drift_F"] >= 5.0


def test_generate_candidates_markdown(synthetic_run_data):
    arrs, meta, df, s = synthetic_run_data
    ev = evaluate_scored_run("synth_s140", arrs, meta, df, s)
    demo_yaml = build_demo_yaml([ev])

    md = generate_candidates_markdown([ev], [], demo_yaml, min_rows=1500, expected_rows=1600)
    assert "# Demo Run & Window Candidates Report" in md
    assert "synth_s140" in md
    assert "scene1" in md
    assert "scene2" in md
    assert "scene3" in md


def test_graceful_degradation_on_partial_runs(tmp_path):
    s = get_settings()
    # Create temporary partial runs (< min_rows)
    batch_dir = tmp_path / "full_v1"
    batch_dir.mkdir(parents=True)
    p1 = batch_dir / "random_s140.csv"
    p1.write_text("time_min,LCO_T98_F\n1,755.0\n2,755.1\n")

    # Call scanner with min_rows=1500
    demo_yaml, evals, skipped = scan_and_rank_demo(
        settings=s,
        min_rows=1500,
        batch="full_v1",
        specific_runs=["random_s140"],
        output_md=tmp_path / "candidates.md",
        dry_run=True,
    )

    assert len(evals) == 0
    assert len(skipped) == 1
    assert skipped[0]["run_id"] == "random_s140"
    assert demo_yaml["demo"]["status"] == "pending_simulation"
    assert (tmp_path / "candidates.md").exists()
