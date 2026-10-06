"""Pinned simulator truth (T98 calculation ceiling) masking: app/data/pinned.py + train.build_labels."""
import numpy as np
import pandas as pd

from app.data.pinned import (DEFAULTS, active_targets, detect_ceiling, mask_truth, pinned_config, pinned_mask,
                             target_pinned)

ON = {**DEFAULTS, "enabled": True, "targets": ["LCO_T98_F"]}


class _S(dict):
    """Minimal settings stand-in (dict access + .targets) for build_labels."""

    @property
    def targets(self):
        return ["LCO_T98_F", "HN_T98_F"]


def _frame(n=120):
    rng = np.random.default_rng(1)
    lco = 755 + rng.normal(0, 2, n)
    lco[40:70] = 770.364                      # 30 pinned minutes
    hn = 530 + rng.normal(0, 2, n)
    return pd.DataFrame({"time_min": np.arange(1, n + 1), "LCO_T98_F": lco, "HN_T98_F": hn,
                         "T_tray13_F": 600 + rng.normal(0, 1, n)})


def test_pinned_mask_exact_and_tolerance():
    v = np.array([770.364, 770.3643, 770.3635, 770.366, 755.0, np.nan, np.inf])
    assert pinned_mask(v, 770.364, 1e-3).tolist() == [True, True, True, False, False, False, False]


def test_mask_truth_sets_nan_only_for_active_target():
    y = np.array([750.0, 770.364, 760.0])
    out = mask_truth(y, "LCO_T98_F", ON)
    assert np.isnan(out[1]) and out[0] == 750.0 and out[2] == 760.0
    assert y[1] == 770.364                                              # input not modified
    assert np.array_equal(mask_truth(y, "HN_T98_F", ON), y)            # HN not in targets -> unchanged
    assert np.array_equal(mask_truth(y, "LCO_T98_F", DEFAULTS), y)     # default config is OFF -> unchanged


def test_default_off_and_env_override():
    assert pinned_config(None, env={})["enabled"] is False
    assert active_targets(pinned_config(None, env={})) == []
    c = pinned_config(None, env={"FCC_MASK_PINNED_TRUTH": "1"})
    assert c["enabled"] and active_targets(c) == ["LCO_T98_F"]
    c = pinned_config(None, env={"FCC_MASK_PINNED_TRUTH": "LCO_T98_F,HN_T98_F"})
    assert active_targets(c) == ["LCO_T98_F", "HN_T98_F"]
    assert pinned_config({"training": {"pinned_truth": {"enabled": True}}},
                         env={"FCC_MASK_PINNED_TRUTH": "0"})["enabled"] is False


def test_config_from_settings_and_unknown_target_ignored():
    c = pinned_config({"training": {"pinned_truth": {"enabled": True, "targets": ["LCO_T98_F", "XYZ"]}}}, env={})
    assert active_targets(c) == ["LCO_T98_F"]                          # no ceiling known for XYZ


def test_live_config_yaml_masks_lco_only(monkeypatch):
    # 6 Oct 2026 retrain: pinned LCO minutes (simulator T98 ceiling) are missing labels / truth in the live config
    monkeypatch.delenv("FCC_MASK_PINNED_TRUTH", raising=False)
    from app.config import get_settings
    assert active_targets(pinned_config(get_settings())) == ["LCO_T98_F"]


def test_target_pinned_on_frame():
    df = _frame()
    m = target_pinned(df, "LCO_T98_F", ON)
    assert m.sum() == 30 and m[40:70].all()
    assert not target_pinned(df, "HN_T98_F", ON).any()


def test_detect_ceiling():
    df = _frame()
    assert detect_ceiling(df["LCO_T98_F"], min_count=20) == 770.364
    assert detect_ceiling(df["LCO_T98_F"], min_count=31) is None
    assert detect_ceiling(df["HN_T98_F"], min_count=5) is None


def test_build_labels_truth_mode_drops_pinned_when_on_only():
    from app.train import build_labels
    s = _S(training={"truth_stride_min": 1})
    df = _frame()
    df["LCO_T98_F"] = np.where(df["LCO_T98_F"] == 770.364, 770.364, 750.0)   # in-range rows outside the 744-766 clip?
    df.loc[:5, "LCO_T98_F"] = 770.364                                        # 6 more pinned at the start
    frames, labs = {"r1": df}, {"r1": []}
    off = build_labels(frames, labs, ["r1"], s, "truth")
    on_stats: dict = {}
    on = build_labels(frames, labs, ["r1"], s, "truth", stats=on_stats, pin_cfg=ON)
    assert not np.isclose(on["LCO_T98_F"]["y"], 770.364, atol=1e-3).any()
    assert on_stats["LCO_T98_F"]["pinned_excluded"] == 36
    assert "pinned_excluded" not in on_stats["HN_T98_F"]
    assert len(on["HN_T98_F"]) == len(off["HN_T98_F"])                     # HN untouched


def test_build_labels_truth_mode_pinned_reach_labels_without_flag_when_clip_inactive():
    """When a run has < 10 minutes inside the 744-766 clip, the clip is skipped and pinned minutes leak into labels;
    the flag removes them."""
    from app.train import build_labels
    s = _S(training={"truth_stride_min": 1})
    n = 60
    df = pd.DataFrame({"time_min": np.arange(1, n + 1), "LCO_T98_F": np.r_[np.full(30, 770.364), np.full(30, 735.0)],
                       "HN_T98_F": np.full(n, 530.0)})
    off = build_labels({"r": df}, {"r": []}, ["r"], s, "truth")
    on = build_labels({"r": df}, {"r": []}, ["r"], s, "truth", pin_cfg=ON)
    assert np.isclose(off["LCO_T98_F"]["y"], 770.364).sum() == 30
    assert not np.isclose(on["LCO_T98_F"]["y"], 770.364).any() and len(on["LCO_T98_F"]) == 30


def test_build_labels_lab_mode_drops_labs_at_pinned_minutes():
    from app.train import build_labels
    s = _S(training={"truth_stride_min": 1})
    df = _frame()
    df.loc[~np.isclose(df["LCO_T98_F"], 770.364), "LCO_T98_F"] = 755.0
    labs = {"r1": [{"property": "LCO_T98_F", "time_min": t, "value": 756.0, "injected_error": "none"}
                   for t in (10, 45, 50, 90)]}
    st: dict = {}
    on = build_labels({"r1": df}, labs, ["r1"], s, "lab", stats=st, pin_cfg=ON)
    assert sorted(on["LCO_T98_F"]["time_min"].tolist()) == [10, 90]
    assert st["LCO_T98_F"] == {"clean": 4, "transient_excluded": 0, "used": 2, "pinned_excluded": 2}
    off = build_labels({"r1": df}, labs, ["r1"], s, "lab")
    assert len(off["LCO_T98_F"]) == 2          # the 744-766 truth clip already drops them when flag is off


def test_build_labels_transient_mask_stays_aligned():
    from app.train import build_labels
    s = _S(training={"truth_stride_min": 1})
    df = _frame()
    df.loc[~np.isclose(df["LCO_T98_F"], 770.364), "LCO_T98_F"] = 755.0
    tr = np.zeros(len(df), bool)
    tr[100:110] = True
    on = build_labels({"r1": df}, {"r1": []}, ["r1"], s, "truth", transient={"r1": tr}, pin_cfg=ON)
    t = set(on["LCO_T98_F"]["time_min"].tolist())
    assert not (t & set(range(101, 111))) and not (t & set(range(41, 71)))
    assert len(on["LCO_T98_F"]) == len(df) - 30 - 10
    assert len(on["HN_T98_F"]) == len(df) - 10                              # HN uses the unshortened transient mask
