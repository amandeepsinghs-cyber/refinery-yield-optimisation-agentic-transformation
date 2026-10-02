"""Valid range of a simulated run (simulator breakdown cut, app/data/validity.py)."""
import numpy as np
import pandas as pd

from app.data.validity import trim, valid_until


def _run(n=200):
    t = np.arange(1, n + 1)
    rng = np.random.default_rng(0)
    df = pd.DataFrame({"time_min": t, "LCO_T98_F": 750 + rng.normal(0, 1, n), "HN_T98_F": 520 + rng.normal(0, 1, n),
                       "Treg_F": 1250 + rng.normal(0, 1, n)})
    return df


def test_clean_run_is_whole():
    assert valid_until(_run()) is None


def test_failed_minutes_cut_at_first_copy_run():
    df = _run()
    df.loc[100:120, ["LCO_T98_F", "HN_T98_F", "Treg_F"]] = df.loc[99, ["LCO_T98_F", "HN_T98_F", "Treg_F"]].to_numpy()
    cut = valid_until(df)
    assert cut == 101          # rows 100.. repeat row 99 (time 100); five in a row first completes at index 100 → time 101
    assert trim(df, cut)["time_min"].max() == 100


def test_impossible_value_cuts():
    df = _run()
    df.loc[150, "LCO_T98_F"] = -30927.0
    assert valid_until(df) == 151


def test_short_copy_and_controlled_flat_lco_are_kept():
    df = _run()
    df.loc[50:52, ["LCO_T98_F", "HN_T98_F", "Treg_F"]] = df.loc[49, ["LCO_T98_F", "HN_T98_F", "Treg_F"]].to_numpy()
    df.loc[60:120, "LCO_T98_F"] = 763.5      # cut-point controller holding LCO T98 exactly (other tags still move)
    assert valid_until(df) is None
