"""Unit tests for the C1 backend fixes: train-only lab count, T5 recommendation sizing / HOLD, pooled committee
weights, C4 fallback chain, process-measurement noise (L6), A5 steady-state flag, partial-row rule."""
import copy

import numpy as np
import pandas as pd
import pytest

from app.config import Settings, get_settings


def _settings(**over):
    raw = copy.deepcopy(get_settings().raw)
    for k, v in over.items():
        raw[k] = v
    return Settings(raw)


# ------------------------------------------------------------------ 1. label source counts TRAIN labs only
def test_label_source_counts_train_runs_only():
    from app.train import choose_label_source, count_clean_train_labs
    lab = lambda err="none": {"injected_error": err}  # noqa: E731
    raw = {"random_s100": [lab()] * 6 + [lab("gross")], "random_s101": [lab()] * 6,
           "random_s140": [lab()] * 600}                                       # held-out labs must not count
    n = count_clean_train_labs(raw, ["random_s100", "random_s101"], ["LCO_T98_F", "HN_T98_F"])
    assert n == 6                                                              # 12 clean / 2 properties
    assert choose_label_source("auto", n, 100) == "truth"
    assert choose_label_source("auto", 120, 100) == "lab"
    assert choose_label_source("lab", 0, 100) == "lab"


def test_build_labels_excludes_transient_labs():
    from app.train import build_labels
    s = get_settings()
    df = pd.DataFrame({"time_min": np.arange(1, 101), "LCO_T98_F": 750.0, "HN_T98_F": 530.0, "x": 1.0})
    raw = {"r": [{"property": p, "injected_error": "none", "time_min": t, "value": 751.0} for p in s.targets
                 for t in (10, 50, 90)]}
    tr = np.zeros(100, bool)
    tr[45:55] = True                                                           # minute 50 is transient
    stats = {}
    L = build_labels({"r": df}, raw, ["r"], s, "lab", {"r": tr}, stats)
    assert sorted(L["LCO_T98_F"]["time_min"]) == [10, 90]
    assert stats["LCO_T98_F"] == {"clean": 3, "transient_excluded": 1, "used": 2}


# ------------------------------------------------------------------ 2. recommendation (DECISIONS T5)
def _est(mu, sd=2.0, trust="GREEN", gate="PASS"):
    from app.dist import mix_cdf
    m, s_, w = np.array([mu]), np.array([sd]), np.array([1.0])
    p = float(mix_cdf(np.array([765.0]), m[None], s_[None], w[None])[0])
    return {"m": m, "s": s_, "w": w, "q95": mu + 1.645 * sd, "w90": 2 * 1.645 * sd, "p_on_spec": p,
            "gate_status": gate, "gate_reason": None if gate == "PASS" else "wide",
            "gate_message": None if gate == "PASS" else "Distribution spread too wide — test.", "trust": trust}


def _legacy_settings():
    """The pre-6-Oct objective (largest move that keeps P(on-spec) >= 0.95), i.e. no recommend.target_F."""
    raw = copy.deepcopy(get_settings().raw)
    raw["recommend"].pop("target_F", None)
    return Settings(raw)


def _rec(est, s=None):
    from app.recommend import build_recommendation
    return build_recommendation("random_s140", 100, "LCO_T98_F", est, 755.0, 1000.0,
                                {"gain": 1.0, "yield_sens": 0.0}, s or _legacy_settings(), [])


def test_target_aim_lands_on_target_and_holds_there():
    s = get_settings()
    tgt = s["recommend"]["target_F"]["LCO_T98_F"]
    r = _rec(_est(tgt - 2.5), s)                       # 2.5 °F below target -> raise 2.5, mean after on target
    assert r["action"] == "RAISE" and r["delta_F"] == 2.5 and r["target_F"] == tgt
    assert _rec(_est(tgt + 0.5), s)["action"] == "HOLD"   # inside the 1 °F deadband -> no move
    r = _rec(_est(tgt + 3.0), s)
    assert r["action"] == "LOWER" and r["delta_F"] == -3.0 and r["p_on_spec_after"] >= 0.95


def test_green_full_move_capped():
    r = _rec(_est(750.0))
    assert r["status"] == "OPEN" and r["action"] == "RAISE" and r["delta_F"] == 5.0 and r["p_on_spec_after"] >= 0.95


def test_amber_half_move_rounded_to_step():
    r = _rec(_est(750.0, trust="AMBER"))
    assert r["status"] == "OPEN" and r["delta_F"] == 2.5 and r["conservative"]
    mu = 765 - 1.6448536 * 2 - 3.7                                             # full move 3.5 -> half 1.75 -> 1.5
    assert _rec(_est(mu))["delta_F"] == 3.5
    r2 = _rec(_est(mu, trust="AMBER"))
    assert r2["delta_F"] == 1.5 and r2["p_on_spec_after"] >= 0.95


def test_amber_lowering_not_halved_and_on_spec():
    r = _rec(_est(764.0, trust="AMBER"))
    assert r["status"] == "OPEN" and r["action"] == "LOWER" and r["delta_F"] == -2.5 and r["p_on_spec_after"] >= 0.95


def test_infeasible_move_is_hold_not_open():
    r = _rec(_est(775.0))
    assert r["status"] == "HOLD" and r["action"] == "HOLD" and r["delta_F"] == 0.0
    assert r["sp_after"] == r["sp_before"] == 755.0


def test_red_and_withheld_no_move():
    assert _rec(_est(750.0, trust="RED")) is None
    w = _rec(_est(750.0, gate="WITHHELD"))
    assert w["status"] == "WITHHELD" and w["delta_F"] == 0.0


@pytest.mark.parametrize("mu", np.linspace(740, 780, 41))
@pytest.mark.parametrize("trust", ["GREEN", "AMBER"])
def test_never_open_below_p_min(mu, trust):
    r = _rec(_est(float(mu), trust=trust))
    if r["status"] == "OPEN":
        assert r["p_on_spec_after"] >= 0.95 and abs(r["delta_F"]) <= 5.0 and (r["delta_F"] / 0.5).is_integer()


# ------------------------------------------------------------------ 3. committee weights pooled over scored history
def test_committee_weights_fallback_and_recent():
    from app.pipeline import committee_weights
    adm = np.array([True, True, True, False])
    w_oof = np.array([0.25, 0.25, 0.5, 0.0])
    pool = [(np.array([750.0, 755.0, 751.0, 700.0]), 750.0)] * 2
    w, src = committee_weights(pool, adm, w_oof, 3, 0.1)
    assert src == "out_of_fold" and np.allclose(w, w_oof)
    w, src = committee_weights(pool * 2, adm, w_oof, 3, 0.1)
    assert src == "recent_labs" and w[0] > w[2] > w[1] and w[3] == 0 and abs(w.sum() - 1) < 1e-9


def _toy_run(n=200):
    s = get_settings()
    t = np.arange(1, n + 1)
    df = pd.DataFrame({"time_min": t, "LCO_T98_F": 750.0, "HN_T98_F": 530.0, "dist_feed_API": 25.0,
                       "SP_LCO_T98": 755.0, "feed_flow_lb_s": 100.0})
    J = 4
    mu = np.tile([750.0, 753.0, 750.5, 749.0], (n, 1))
    sg = np.full((n, J), 2.0)
    preds = {"props": {"LCO_T98_F": {"mu": mu, "sigma": sg, "phys": np.full(n, 750.0), "delta": np.zeros(n),
                                     "pinn_members": np.tile(750.0, (5, n)), "gpr_sigma_ratio": np.ones(n),
                                     "regime_counts": {"heavy": 10, "medium": 10, "light": 10}}},
             "t2_ratio": np.zeros(n), "spe_ratio": np.zeros(n), "dq_fail": np.zeros(n, bool),
             "dq_severe": np.zeros(n, bool), "dq_tag": np.array([None] * n, dtype=object)}
    labs = [{"sample_id": f"x{d}", "run_id": "toy", "property": "LCO_T98_F", "time_min": d, "draw_time_min": d,
             "lims_time_min": d + 50, "recorded_draw_time_min": d, "value": 750.0, "true_value": 750.0,
             "injected_error": "none"} for d in (20, 60, 100)]
    meta = {"LCO_T98_F": {"admitted": [True] * J, "val_mse": [1.0] * J}}
    gains = {"LCO_T98_F": {"gain": 1.0, "yield_sens": 0.0}}
    return s, df, preds, labs, meta, gains, mu


def test_pipeline_weights_update_after_recent_n_labs_and_with_history():
    from app.pipeline import assemble_run
    s, df, preds, labs, meta, gains, mu = _toy_run()
    res = assemble_run("toy", df, preds, labs, meta, s, gains)
    A = res["props"]["LCO_T98_F"]
    ws = A["weight_source"]
    assert list(ws[:150]) == ["out_of_fold"] * 150 and ws[150] == "recent_labs"       # 3rd lab arrives at min 150
    assert np.allclose(A["weight"][0], 0.25) and A["weight"][-1][0] > A["weight"][-1][1]
    hist = {"LCO_T98_F": [(mu[0].copy(), 750.0)] * 3}
    A2 = assemble_run("toy", df, preds, labs, meta, s, gains, history=hist)["props"]["LCO_T98_F"]
    assert A2["weight_source"][0] == "recent_labs" and A2["weight"][0][0] > A2["weight"][0][1]


# ------------------------------------------------------------------ 7. C4 fallback chain
def test_fallback_chain_sources():
    from app.pipeline import fallback_source
    n = 100
    t = np.arange(n)
    mu = np.tile([750.0, 752.0], (n, 1))
    mean = np.full(n, 751.0)
    trust = np.array(["GREEN"] * n, dtype=object)
    mu[10:20, 1] = np.nan                     # one member missing -> best single
    trust[30:] = "RED"                        # RED -> hold last good up to 60 min, then BAD
    src, val = fallback_source(mean, mu, np.array([True, True]), np.array([2.0, 1.0]), np.zeros(n), trust, t, 60)
    assert src[0] == "consensus" and val[0] == 751.0
    assert src[15] == "best_single" and val[15] == 750.0
    assert src[29] == "consensus"
    assert src[30] == "hold_last" and src[89] == "hold_last" and val[89] == 751.0
    assert src[90] == "BAD" and np.isnan(val[90])
    src2, _ = fallback_source(mean, mu, np.array([True, False]), np.array([2.0, 1.0]), np.zeros(n),
                              np.array(["GREEN"] * n, dtype=object), t, 60)
    assert set(src2) == {"best_single"}       # only one admitted member


def test_estimate_message_source_field():
    from app.state import State
    arrs = {"LCO_T98_F|mean": np.array([751.0]), "LCO_T98_F|source": np.array(["hold_last"]),
            "LCO_T98_F|source_value": np.array([749.5])}
    P = lambda k: arrs[f"LCO_T98_F|{k}"]  # noqa: E731
    assert State._source(P, 0) == {"source": "hold_last", "source_value": 749.5}
    del arrs["LCO_T98_F|source"]
    assert State._source(P, 0) == {"source": "consensus", "source_value": 751.0}      # old artifacts


# ------------------------------------------------------------------ 6. process-measurement noise (DECISIONS L6)
def _plant(n=2000):
    return pd.DataFrame({"time_min": np.arange(1, n + 1), "T_tray13_F": 600.0, "LCO_T98_F": 750.0, "HN_T98_F": 530.0,
                         "SP_LCO_T98": 755.0, "SP_P_frac_psia": 25.0, "P5_frac_psia": 24.9, "feed_flow_lb_s": 100.0,
                         "MV_PA2": 2.0, "prod_LCO": 50.0, "F_coke": 3.0, "dist_feed_API": 25.0, "event_code": 0,
                         "T2_dup": 600.0})


def test_noise_kinds_and_sigmas():
    from app.data.catalog import add_measurement_noise, noise_kind
    s = _settings(noise={"enabled": True, "temp_F": 0.5, "pressure_psi": 0.05, "flow_rel": 0.005, "seed": 7})
    assert [noise_kind(c, s) for c in ("T_tray13_F", "LCO_T98_F", "SP_LCO_T98", "P5_frac_psia", "SP_P_frac_psia",
                                       "feed_flow_lb_s", "prod_LCO", "F_coke", "MV_PA2", "dist_feed_API", "T2_dup")] == \
        ["temp", None, None, "pressure", None, "flow", "flow", "flow", "flow", None, None]
    df = _plant()
    m = add_measurement_noise(df, "random_s140", s)
    for c in ("LCO_T98_F", "HN_T98_F", "SP_LCO_T98", "SP_P_frac_psia", "dist_feed_API", "event_code", "T2_dup"):
        assert (m[c] == df[c]).all(), c                                       # truth / set points untouched
    assert abs((m["T_tray13_F"] - 600).std() - 0.5) < 0.05
    assert abs((m["P5_frac_psia"] - 24.9).std() - 0.05) < 0.005
    assert abs(((m["feed_flow_lb_s"] - 100) / 100).std() - 0.005) < 0.0005
    assert (df["T_tray13_F"] == 600.0).all()                                  # input frame not modified


def test_noise_deterministic_per_run_and_prefix_stable():
    from app.data.catalog import add_measurement_noise
    s = _settings(noise={"enabled": True, "temp_F": 0.5, "pressure_psi": 0.05, "flow_rel": 0.005, "seed": 7})
    df = _plant(500)
    a = add_measurement_noise(df, "random_s140", s)
    b = add_measurement_noise(df, "random_s140", s)
    c = add_measurement_noise(df, "random_s141", s)
    assert a.equals(b) and not np.allclose(a["T_tray13_F"], c["T_tray13_F"])
    part = add_measurement_noise(df.iloc[:300], "random_s140", s)             # file still being written
    assert np.allclose(part["T_tray13_F"], a["T_tray13_F"].iloc[:300])
    off = add_measurement_noise(df, "random_s140", _settings(noise={"enabled": False}))
    assert off.equals(df)


def test_catalog_load_measured_vs_true(tmp_path):
    from app.data.catalog import Catalog
    raw = copy.deepcopy(get_settings().raw)
    raw["data"].update({"primary_batch": None, "fallback_batches": []})
    raw["noise"] = {"enabled": True, "temp_F": 0.5, "pressure_psi": 0.05, "flow_rel": 0.005, "seed": 7}
    (tmp_path / "b").mkdir()
    _plant(50).to_csv(tmp_path / "b" / "random_s100.csv", index=False)

    class S(Settings):
        @property
        def data_root(self):
            return tmp_path
    cat = Catalog(S(raw))
    tru, meas = cat.load_true("random_s100"), cat.load("random_s100")
    assert (tru["T_tray13_F"] == 600).all() and not (meas["T_tray13_F"] == 600).all()
    assert (meas["LCO_T98_F"] == tru["LCO_T98_F"]).all()


# ------------------------------------------------------------------ 8. A5 steady-state flag
def test_transient_mask_events_and_ramps():
    from app.data.features import transient_mask
    s = get_settings()
    n = 800
    rng = np.random.default_rng(0)
    v = 600 + rng.normal(0, 0.5, n)
    v[300:320] += np.linspace(0, 10, 20)
    v[320:] += 10
    df = pd.DataFrame({"time_min": np.arange(1, n + 1), "T_tray13_F": v})
    codes = np.zeros(n, int)
    codes[600:610] = 5
    m = transient_mask(df, codes, s)
    assert not m[100:290].any()
    assert m[310:330].any() and m[600:610].all()
    assert not m[400:590].any()


# ------------------------------------------------------------------ 9. partial last row only while being written
def test_partial_last_row_rule(tmp_path):
    from app.data.catalog import _read_csv
    p = tmp_path / "r.csv"
    p.write_text("time_min,a,b\n1,1.0,2.0\n2,1.0,2.0\n3,1.0\n")
    assert len(_read_csv(p, expected_rows=1600)) == 2                          # still being written -> dropped
    assert len(_read_csv(p, expected_rows=3)) == 3                             # complete file -> kept
    assert len(_read_csv(p, expected_rows=None)) == 3
