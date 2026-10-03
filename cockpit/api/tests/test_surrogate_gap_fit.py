"""Gap-window lever fit (surrogates.gap_step_response / gap_windows): synthetic first-order moves with known gains."""
import numpy as np
import pytest

from app.engines import surrogates as S


def _move(gain=2.0, tau=6.0, dx=5.0, t0=100, ramp=30, n=200, noise=0.0, seed=0):
    rng = np.random.default_rng(seed)
    t = np.arange(n, dtype=float)
    u = np.clip((t - t0) / ramp, 0, 1)
    uf = np.zeros(n)
    for i in range(1, n):
        uf[i] = uf[i - 1] + (1 - np.exp(-1 / tau)) * (u[i] - uf[i - 1])
    x = 10.0 + dx * u
    y = np.c_[50.0 + gain * dx * uf, 7.0 - 0.5 * dx * uf] + noise * rng.standard_normal((n, 2))
    return t, x, y


def test_gap_fit_recovers_first_order_gain_in_short_gap():
    t, x, y = _move(gain=2.0, tau=6.0)
    # ramp 100..129, post window only 27 min (next move at 160 minus 3 min margin) -- the strict fit would reject it
    r = S.gap_step_response(t, x, y, 100, 129, 85, 156)
    assert r is not None
    assert r["dx"] == pytest.approx(5.0, abs=1e-6)
    assert r["sens"][0] == pytest.approx(2.0, rel=0.05)
    assert r["sens"][1] == pytest.approx(-0.5, rel=0.05)
    assert r["settled"].all()


def test_gap_fit_slow_response_falls_back_to_late_window():
    t, x, y = _move(gain=2.0, tau=200.0, ramp=10)
    r = S.gap_step_response(t, x, y, 100, 109, 85, 135)
    assert r is not None
    assert not r["settled"][0]                       # tau far beyond the window: no extrapolation
    assert np.isfinite(r["sens_late"][0]) and 0 < r["sens"][0] < 2.0   # late delta = lower bound on |gain|
    assert r["sens"][0] == pytest.approx(r["sens_late"][0])


def test_gap_fit_noise_and_missing_cells():
    t, x, y = _move(gain=-1.5, tau=4.0, noise=0.05)
    y[110:113, 0] = np.nan                           # non-real / complex cells read as missing
    x[120] = np.nan
    r = S.gap_step_response(t, x, y, 100, 129, 85, 156)
    assert r is not None and r["sens"][0] == pytest.approx(-1.5, rel=0.1)


def test_gap_fit_rejects_too_short_windows():
    t, x, y = _move()
    assert S.gap_step_response(t, x, y, 100, 129, 95, 156) is None    # pre 5 min < 10
    assert S.gap_step_response(t, x, y, 100, 129, 85, 140) is None    # post 11 min < 20


def test_gap_windows_bounded_by_neighbouring_moves_and_auto_trim():
    t = np.arange(1, 401, dtype=float)
    codes = np.zeros(400, int)
    codes[(t >= 100) & (t < 130)] = 7                # preheat move
    codes[(t >= 160) & (t < 190)] = 8                # next move 30 min after the ramp
    codes[(t >= 230) & (t < 250)] = 12               # overhead T move right before an auto trim
    auto = np.zeros(400, int)
    auto[(t >= 260) & (t < 320)] = 1
    regime = np.full(400, "R3", dtype=object)
    w = {x["code"]: x for x in S.gap_windows(t, codes, auto, regime)}
    assert w[7]["ok"] and w[7]["pre_start"] == 85 and w[7]["post_end"] == 157
    assert w[8]["ok"] and w[8]["pre_start"] == 145
    assert not w[12]["ok"] and w[12]["reason"] == "post window short"   # 249 -> 257 before the auto trim


def test_gap_windows_reject_regime_transition():
    t = np.arange(1, 301, dtype=float)
    codes = np.zeros(300, int)
    codes[(t >= 100) & (t < 130)] = 9
    regime = np.full(300, "R2", dtype=object)
    regime[(t >= 140) & (t < 200)] = ""
    w = S.gap_windows(t, codes, np.zeros(300, int), regime)
    assert len(w) == 1 and not w[0]["ok"] and w[0]["reason"] == "post window short"


def test_gap_fit_is_off_by_default(monkeypatch):
    monkeypatch.delenv("FCC_SURROGATE_GAP_FIT", raising=False)
    assert S.gap_fit_enabled() is False
    monkeypatch.setenv("FCC_SURROGATE_GAP_FIT", "1")
    assert S.gap_fit_enabled() is True
