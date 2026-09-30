"""A6 lag identification + lagged features: known-lag recovery, causality, determinism, artifact round-trip,
scoring reuses the persisted table (no re-identification)."""
import copy

import joblib
import numpy as np
import pandas as pd
import pytest

from app.config import Settings, get_settings
from app.data import lags as L


def _settings(**over):
    raw = copy.deepcopy(get_settings().raw)
    for k, v in over.items():
        raw[k] = v
    return Settings(raw)


def _ar1(n, phi, rng, sd=1.0):
    e = rng.normal(0, sd, n)
    x = np.zeros(n)
    for i in range(1, n):
        x[i] = phi * x[i - 1] + e[i]
    return x


def _run(n, lag, rng, noise=0.3):
    """x = slowly varying (integrated AR(1)) input + measurement noise; y = x shifted by `lag` min + noise."""
    x_true = np.cumsum(_ar1(n + lag, 0.6, rng))
    x = x_true[lag:] + rng.normal(0, noise, n)            # measured input at t
    y = x_true[:n] + rng.normal(0, noise, n)              # target at t = input at t - lag
    return x, y


@pytest.mark.parametrize("lag", [0, 5, 17, 40])
def test_known_lag_recovered(lag):
    rng = np.random.default_rng(123 + lag)
    runs = [_run(600, lag, rng) for _ in range(4)]
    r = L.identify_lag([a for a, _ in runs], [b for _, b in runs], max_lag=60, ar_order=5)
    assert abs(r["lag_min"] - lag) <= 1, r
    assert r["significant"] and abs(r["ccf"]) > r["threshold"]


def test_no_relation_gives_lag_zero():
    rng = np.random.default_rng(5)
    xs = [np.cumsum(rng.normal(size=500)) for _ in range(3)]
    ys = [np.cumsum(rng.normal(size=500)) for _ in range(3)]
    r = L.identify_lag(xs, ys, max_lag=60, ar_order=5, min_abs_ccf=0.2)
    assert r["lag_min"] == 0 and not r["significant"]


def test_constant_input_gives_lag_zero():
    r = L.identify_lag([np.ones(200)], [np.arange(200.0)], max_lag=30, ar_order=5)
    assert r["lag_min"] == 0 and not r["significant"]


def _frame(n=300, lag=17, seed=0):
    rng = np.random.default_rng(seed)
    x, y = _run(n, lag, rng)
    return pd.DataFrame({"time_min": np.arange(n), "T_tray13_F": 600 + x, "LCO_T98_F": 750 + y,
                         "HN_T98_F": 520 + 0.5 * y})


def _table(lag=17, rolling=True):
    return {"enabled": True, "rolling_mean": rolling, "max_lag_min": 60, "ar_order": 5,
            "targets": {"LCO_T98_F": {"T_tray13_F": {"lag_min": lag, "ccf": 0.5, "significant": True}},
                        "HN_T98_F": {"T_tray13_F": {"lag_min": 3, "ccf": 0.2, "significant": True}}}}


def test_identify_lags_uses_given_runs_and_key_tags():
    s = _settings(features=dict(get_settings()["features"], key_tags=["T_tray13_F"]),
                  lags={"enabled": True, "max_lag_min": 60, "ar_order": 5, "min_abs_ccf": "auto"})
    frames = {f"random_s10{i}": _frame(seed=i) for i in range(3)}
    frames["random_s140"] = _frame(seed=9, lag=2)             # held-out: must not be used when excluded
    tab = L.identify_lags(frames, s, runs=["random_s100", "random_s101", "random_s102"])
    assert tab["identified_on"] == ["random_s100", "random_s101", "random_s102"]
    assert abs(tab["targets"]["LCO_T98_F"]["T_tray13_F"]["lag_min"] - 17) <= 1
    assert set(tab["targets"]) == set(s.targets)


def test_disabled_config_gives_no_features():
    s = _settings(lags={"enabled": False})
    tab = L.identify_lags({"r": _frame()}, s)
    assert tab["targets"] == {} and L.lag_columns(tab) == []
    df = _frame()
    assert L.apply_lags(df, tab) is df


def test_lagged_features_values():
    df = _frame()
    out = L.apply_lags(df, _table())
    x = df["T_tray13_F"].to_numpy()
    assert set(L.lag_columns(_table())) <= set(out.columns)
    np.testing.assert_allclose(out["T_tray13_F__lag17"].to_numpy()[17:], x[:-17])
    np.testing.assert_allclose(out["T_tray13_F__lag17"].to_numpy()[:17], x[0])      # causal back-fill with first value
    np.testing.assert_allclose(out["T_tray13_F__lagmean17"].to_numpy()[50], x[33:51].mean())
    assert L.lag_columns(_table(), "HN_T98_F") == ["T_tray13_F__lag3", "T_tray13_F__lagmean3"]


def test_lagged_features_are_causal():
    """Feature at row t is unchanged when every future row is altered or removed."""
    df = _frame()
    full = L.apply_lags(df, _table())
    for i in (0, 10, 17, 120, len(df) - 2):
        fut = df.copy()
        fut.loc[fut.index > i, "T_tray13_F"] += 1000.0
        a = L.apply_lags(fut, _table())
        b = L.apply_lags(df.iloc[:i + 1], _table())
        for c in L.lag_columns(_table()):
            assert a[c].iloc[i] == pytest.approx(full[c].iloc[i])
            assert b[c].iloc[i] == pytest.approx(full[c].iloc[i])


def test_lagged_features_time_based_with_gaps():
    df = pd.DataFrame({"time_min": [0, 1, 2, 10, 11, 30], "T_tray13_F": [1.0, 2, 3, 4, 5, 6]})
    out = L.apply_lags(df, {"enabled": True, "rolling_mean": False,
                            "targets": {"LCO_T98_F": {"T_tray13_F": {"lag_min": 9}}}})
    # t=10 -> last row with time <= 1 is value 2; t=11 -> time <= 2 -> 3; t=30 -> time <= 21 -> 5
    assert out["T_tray13_F__lag9"].tolist() == [1.0, 1.0, 1.0, 2.0, 3.0, 5.0]


def test_deterministic():
    df = _frame()
    pd.testing.assert_frame_equal(L.apply_lags(df, _table()), L.apply_lags(df.copy(), _table()))


def test_artifact_round_trip(tmp_path):
    rng = np.random.default_rng(1)
    runs = [_run(400, 17, rng) for _ in range(3)]
    frames = {f"r{i}": pd.DataFrame({"time_min": np.arange(400), "T_tray13_F": x, "LCO_T98_F": y, "HN_T98_F": y})
              for i, (x, y) in enumerate(runs)}
    s = _settings(features=dict(get_settings()["features"], key_tags=["T_tray13_F"]),
                  lags={"enabled": True, "max_lag_min": 60, "ar_order": 5, "min_abs_ccf": "auto"})
    tab = L.identify_lags(frames, s)
    p = tmp_path / "models" / "lags.json"
    L.save_lags(tab, p)
    back = L.load_lags(p)
    assert back == tab
    pd.testing.assert_frame_equal(L.apply_lags(frames["r0"], tab), L.apply_lags(frames["r0"], back))
    assert L.load_lags(tmp_path / "missing.json") is None


def test_prepare_uses_persisted_table_and_bundle_reuses_its_own(tmp_path, monkeypatch):
    """Scoring paths never re-identify: prepare() reads lags.json; FoldBundle applies its pickled table."""
    from app import pipeline
    monkeypatch.setenv("FCC_ARTIFACTS_DIR", str(tmp_path))
    s = _settings()
    L.save_lags(_table(), L.lags_path(s))

    def boom(*a, **k):
        raise AssertionError("lags must not be re-identified at scoring")
    monkeypatch.setattr(L, "identify_lags", boom)
    df = _frame()
    prepped = pipeline.prepare(df, s)
    assert "T_tray13_F__lag17" in prepped and "T_tray13_F__lag3" in prepped
    assert "T_tray13_F__lag17" not in pipeline.prepare(df, s, lags=None)

    fb = pipeline.FoldBundle(s, lags=_table())
    fb2 = joblib.load(joblib.dump(fb, tmp_path / "fb.pkl")[0])
    assert fb2.lags == _table()
    got = fb2.lagged(pipeline.prepare(df, s, lags=None))
    pd.testing.assert_series_equal(got["T_tray13_F__lag17"], prepped["T_tray13_F__lag17"])


def test_lag_columns_pass_exclusion_guard():
    from app.data.catalog import assert_no_excluded
    assert_no_excluded(L.lag_columns(_table()), get_settings())
    assert all(L.is_lag_col(c) for c in L.lag_columns(_table()))
    assert not L.is_lag_col("T_tray13_F__ewma") and not L.is_lag_col("T_tray13_F")
