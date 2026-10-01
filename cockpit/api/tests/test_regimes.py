"""BDD-24 (data): regime bands, segment extraction and staged file shape (SDD-DATA-11/12)."""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from app.regimes import REGIME_IDS, REGIMES, lab_rows, regime_for_api, regime_segments

ROOT = Path(__file__).resolve().parents[3]
STAGED = ROOT / "sim_octave" / "data" / "full_v1" / "_staged"
FIN = re.compile(r"[$€£₹]\s?\d|USD|EUR|NPV|ROI|payback|cost|budget|price|revenue|profit|savings?|monetary", re.I)


def test_bands_are_contiguous_and_cover_20_to_29():
    assert REGIME_IDS == ("R1", "R2", "R3", "R4")
    assert REGIMES[0].api_lo == 20.0 and REGIMES[-1].api_hi == 29.0
    for a, b in zip(REGIMES, REGIMES[1:]):
        assert a.api_hi == b.api_lo
    assert regime_for_api(25.0).regime_id == "R3"          # simulator start value
    assert regime_for_api(22.5).regime_id == "R2"          # lower edge inclusive
    assert regime_for_api(29.0).regime_id == "R4"          # top edge inclusive
    assert regime_for_api(19.0).regime_id == "R1" and regime_for_api(30.0).regime_id == "R4"
    with pytest.raises(ValueError):
        regime_for_api(float("nan"))


def _synthetic_run(switch_at=400, ramp=60, api_to=21.3, n=900):
    t = np.arange(1, n + 1)
    api = np.where(t <= switch_at, 25.0, np.minimum(1.0, (t - switch_at) / ramp) * (api_to - 25.0) + 25.0)
    return pd.DataFrame({
        "time_min": t, "dist_feed_API": api,
        "crude_id": np.where(t < switch_at, 1, 2),   # increments at the ramp start (scenario.m)
        "event_code": np.where((t >= switch_at) & (t < switch_at + ramp), 1, 0),   # scenario.m convention
        "lab_sample": np.where((t - 360) % 480 == 0, 1, 0) * (t >= 360),
        "LCO_T98_F": 755.0 + 0.01 * t, "HN_T98_F": 530.0 + 0.005 * t,
    })


def test_regime_segments_and_transition_window():
    seg = regime_segments(_synthetic_run(), run_id="synthetic", batch_id="unit")
    assert list(seg["crude_id"]) == [1, 2]
    assert list(seg["regime_id"]) == ["R3", "R1"]
    r2 = seg.iloc[1]
    assert r2["transition_start_min"] == 400 and r2["transition_end_min"] == 460 and r2["ramp_min"] == 60
    assert np.isnan(seg.iloc[0]["transition_start_min"])
    assert r2["n_labs"] == 1 and seg.iloc[0]["n_labs"] == 1
    labs = lab_rows(_synthetic_run(), run_id="synthetic")
    assert list(labs.columns) == ["run_id", "time_min", "crude_id", "regime_id", "LCO_T98_F", "HN_T98_F"]
    assert list(labs["time_min"]) == [360, 840] and list(labs["regime_id"]) == ["R3", "R1"]


def test_regime_segments_rejects_missing_columns():
    with pytest.raises(ValueError):
        regime_segments(pd.DataFrame({"time_min": [1, 2]}))


@pytest.mark.skipif(not (ROOT / "sim_octave" / "data" / "full_v1").exists(), reason="full_v1 not present")
def test_staging_script_writes_bq_shaped_files(tmp_path):
    script = ROOT / "sim_octave" / "stage_regimes.py"
    out = subprocess.run([sys.executable, str(script), "--batch", "full_v1"], capture_output=True, text=True,
                         cwd=str(ROOT), timeout=600)
    assert out.returncode == 0, out.stderr
    reg = pd.read_csv(STAGED / "regimes.csv")
    labs = pd.read_csv(STAGED / "lab_results.csv")
    assert list(reg.columns) == ["run_id", "batch_id", "crude_id", "regime_id", "regime_label", "api_target",
                                 "t_start_min", "t_end_min", "transition_start_min", "transition_end_min",
                                 "ramp_min", "transition_complete", "n_minutes", "n_labs"]
    assert set(reg["regime_id"]) <= set(REGIME_IDS)
    sw = reg[reg["crude_id"] > 1]
    assert len(sw) >= 40, "full_v1 should expose >= 40 labelled crude switches"
    done = sw[sw["transition_complete"]]
    assert len(done) >= 40
    # 3 early runs were resumed across a scenario change and show longer ramps; the canonical 60-min ramp dominates
    assert (done["ramp_min"] == 60).sum() >= 36
    assert list(labs.columns) == ["run_id", "time_min", "crude_id", "regime_id", "LCO_T98_F", "HN_T98_F"]
    assert labs["LCO_T98_F"].notna().all()
    assert not FIN.search(" ".join(reg["regime_label"].unique()))
