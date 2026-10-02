"""E2 — regime-conditioned sensitivities from the simulator's designed set-point moves (SDD-RCP-01).

`scenario.m` ramps one set point at a time (event codes 3 = riser outlet temperature, 5 = LCO T98 set point,
6 = HN T98 set point), spaced >= 30 min apart. Each such window is a clean one-factor-at-a-time experiment, so the
surrogate is a **step-response sensitivity table** per crude regime:

    B[input, output] = median over events of  (ȳ_after − ȳ_before) / (x_after − x_before)

with `before` = the 15 min preceding the ramp and `after` = 30–60 min after it ends. Minutes under the automatic
cut-point trim (`cutpoint_auto == 1`, which *reacts* to lab results) are never used for step responses — that reverse
causality is what made the regression-based v1/v2 fits report dT98/dSP anywhere between −0.1 and +4.4 °F/°F.

**Cut-point set points are structural, not regressed.** In the fractionator model (`Fractionator*.m`,
`if ~cutpoint_auto(), eTC5 = 0`) the T98 set points only drive the trays inside the 120-min auto-trim window after a
lab, so the designed SP ramps (codes 5/6) have *no* effect and no regression can recover dT98/dSP. The surrogate
therefore uses the controller gain (dT98/dSP = 1 for the own product) and fits the **yield response to T98** from the
excursions inside the auto windows (both T98s jointly, within-window demeaned OLS, hold-out checked on test seeds).

The card records, per regime: supported inputs (constant or never-moved tags are listed as `unsupported_inputs` and
are never searched by E4), the B matrix, the dispersion of the estimates (`sens_mad`), hold-out skill, the source of
every row, and the training envelope per input / output.

Fits lazily once, cached to `<artifacts>/engines/surrogates.pkl` + `surrogate_card.json`; refits when SURROGATE_VERSION changes.
"""
from __future__ import annotations

import json
import logging
from functools import lru_cache

import joblib
import numpy as np
import pandas as pd

from app.regimes import REGIME_IDS
from app.state import get_state

logger = logging.getLogger(__name__)

SURROGATE_VERSION = 5

CANDIDATE_INPUTS = [
    "SP_T_preheat_F", "SP_T_riser_ROT_F", "Fair", "MV_PA1", "MV_PA2", "MV_PA3", "MV_PA4", "MV_reflux_ratio",
    "SP_LCO_T98", "SP_HN_T98", "SP_T_overhead", "MV_cw_flow",
    "dist_feed_API", "feed_flow_lb_s", "dist_T_feed_in_F", "dist_T_ambient_F",
]
ACTIONABLE = ["SP_T_preheat_F", "SP_T_riser_ROT_F", "Fair", "MV_PA1", "MV_PA2", "MV_PA3", "MV_PA4", "MV_reflux_ratio",
              "SP_LCO_T98", "SP_HN_T98", "SP_T_overhead", "MV_cw_flow"]
OUTPUTS = [
    "prod_LCO", "prod_HN", "prod_LN", "prod_LPG", "F_coke", "F5_fuel", "power_CAB", "power_WGC",
    "LCO_T98_F", "HN_T98_F", "conversion_pct", "dT_cyc_reg_F", "T2_preheat_F", "eff_C5", "MV_cw_flow",
]
INPUTS = CANDIDATE_INPUTS  # legacy name

# designed-move event codes in scenario.m -> the set point they ramp
EVENT_INPUT = {3: "SP_T_riser_ROT_F", 5: "SP_LCO_T98", 6: "SP_HN_T98",
               # lever_v1 batch (scenario 'lever'): 8 ramps the regenerator T set point; the air controller moves Fair,
               # so the learned lever is the measured regenerator air
               7: "SP_T_preheat_F", 8: "Fair", 9: "MV_PA2", 10: "MV_reflux_ratio", 11: "MV_cw_flow", 12: "SP_T_overhead"}
# disturbance events (2 = feed rate, 4 = feed temperature) give the same step-response estimate for disturbances
DISTURBANCE_EVENT_INPUT = {2: "feed_flow_lb_s", 4: "dist_T_feed_in_F"}
# cut-point set points: controller gain 1 to the own T98, yields via the auto-window response (see module doc)
CUTPOINT_SP = {"SP_LCO_T98": "LCO_T98_F", "SP_HN_T98": "HN_T98_F"}
CUTPOINT_T98 = list(CUTPOINT_SP.values())

UNIT_PRIMARY_TAGS = {
    "unit_1_furnace": ["T2_preheat_F"],
    "unit_2_riser": ["conversion_pct"],
    "unit_3_regenerator": ["dT_cyc_reg_F", "Treg_F"],
    "unit_4_fractionator": ["LCO_T98_F", "HN_T98_F"],
    "unit_5_condenser": ["MV_cw_flow"],
    "unit_6_stabiliser": ["eff_C5"],
}

MIN_EVENTS = 3            # designed moves needed per (regime, input) for an own estimate; else pooled across regimes
MIN_EVENTS_POOLED = 3     # below this the input is "unsupported"
BEFORE_MIN, SETTLE_MIN, AFTER_MIN = 15, 30, 60
BIAS_HALFLIFE_MIN = 45    # lagged EWMA half-life for the expected-value bias correction (expected_series)
MIN_STEP = {"SP_T_riser_ROT_F": 0.5, "SP_LCO_T98": 0.5, "SP_HN_T98": 0.5, "feed_flow_lb_s": 0.5,
            "dist_T_feed_in_F": 1.0}
AUTO_MIN_LEN, AUTO_MIN_SD, AUTO_MIN_WINDOWS, AUTO_MIN_R2 = 60, 1.0, 3, 0.3


def _seed_of(run_id: str) -> int | None:
    if "random_s" not in run_id:
        return None
    try:
        return int(run_id.split("random_s")[-1])
    except ValueError:
        return None


def _regime_at_minutes(seg_df: pd.DataFrame, run_id: str, t: np.ndarray) -> np.ndarray:
    """Labelled regime per minute (transition minutes keep the *previous* regime's label)."""
    out = np.full(len(t), "", dtype=object)
    for _, seg in seg_df[seg_df["run_id"] == run_id].iterrows():
        t0 = seg.get("transition_end_min")
        t0 = int(seg["t_start_min"] if pd.isna(t0) else t0)
        out[(t >= t0) & (t <= int(seg["t_end_min"]))] = seg["regime_id"]
    return out


def _event_windows(codes: np.ndarray) -> list[tuple[int, int, int]]:
    """(code, start_idx, end_idx) for each contiguous block of a designed-move code."""
    out = []
    for code in list(EVENT_INPUT) + list(DISTURBANCE_EVENT_INPUT):
        idx = np.where(codes == code)[0]
        if len(idx) == 0:
            continue
        starts = idx[np.r_[True, np.diff(idx) > 1]]
        ends = idx[np.r_[np.diff(idx) > 1, True]]
        out.extend((code, int(a), int(b)) for a, b in zip(starts, ends))
    return out


def _auto_windows(auto: np.ndarray, codes: np.ndarray, regime: np.ndarray) -> list[tuple[int, int]]:
    """(start_idx, end_idx) of clean auto-trim windows: >= AUTO_MIN_LEN min, no other event, one labelled regime."""
    idx = np.where(auto == 1)[0]
    if len(idx) == 0:
        return []
    starts = idx[np.r_[True, np.diff(idx) > 1]]
    ends = idx[np.r_[np.diff(idx) > 1, True]]
    out = []
    for a, b in zip(starts, ends):
        if b - a + 1 < AUTO_MIN_LEN:
            continue
        w = slice(a, b + 1)
        if (codes[w] != 0).any() or (regime[w] == "").any() or len(set(regime[w])) != 1:
            continue
        out.append((int(a), int(b)))
    return out


def _step_samples(st, seg_df: pd.DataFrame, *, holdout: bool) -> tuple[list[dict], list[dict], dict, dict]:
    """One sample per designed move (input tag, regime, Δx, Δy per output), one sample per clean auto-trim window
    (regime, within-window demeaned T98s and outputs), and the steady-state envelope data."""
    test_min = int(st.s["training"].get("test_seed_min", 140))
    samples, autos, X_env, Y_env = [], [], [], []
    jT = [OUTPUTS.index(c) for c in CUTPOINT_T98]
    for run_id, info in st.catalog.runs.items():
        if info.batch != st.s["data"]["primary_batch"]:
            continue
        seed = _seed_of(run_id)
        if seed is None or (seed >= test_min) != holdout:
            continue
        df = st.catalog.load(run_id)
        need = CANDIDATE_INPUTS + OUTPUTS + ["event_code", "time_min"]
        if df.empty or any(c not in df.columns for c in need):
            continue
        t = df["time_min"].to_numpy()
        codes = pd.to_numeric(df["event_code"], errors="coerce").fillna(0).to_numpy(int)
        auto = pd.to_numeric(df["cutpoint_auto"], errors="coerce").fillna(0).to_numpy(int) \
            if "cutpoint_auto" in df.columns else np.zeros(len(df), int)
        regime = _regime_at_minutes(seg_df, run_id, t)
        X = df[CANDIDATE_INPUTS].apply(pd.to_numeric, errors="coerce").to_numpy(float)
        Y = df[OUTPUTS].apply(pd.to_numeric, errors="coerce").to_numpy(float)
        steady = (codes == 0) & (auto == 0) & (regime != "")
        if steady.any():
            X_env.append(X[steady])
            Y_env.append(Y[steady])
        for code, a, b in _event_windows(codes):
            tag = EVENT_INPUT.get(code) or DISTURBANCE_EVENT_INPUT[code]
            pre = slice(max(0, a - BEFORE_MIN), a)
            post = slice(min(len(df) - 1, b + SETTLE_MIN), min(len(df), b + AFTER_MIN + 1))
            if pre.stop - pre.start < 5 or post.stop - post.start < 10:
                continue
            # a clean experiment: no other event / auto trim / crude transition inside the window
            win = slice(pre.start, post.stop)
            other = (codes[win] != 0) & (codes[win] != code)
            if other.any() or auto[win].any() or (regime[win] == "").any():
                continue
            j = CANDIDATE_INPUTS.index(tag)
            dx = float(np.nanmean(X[post, j]) - np.nanmean(X[pre, j]))
            if abs(dx) < MIN_STEP.get(tag, 0.5):
                continue
            dy = np.nanmean(Y[post], axis=0) - np.nanmean(Y[pre], axis=0)
            samples.append({"run_id": run_id, "input": tag, "regime": str(regime[a]), "t_min": int(t[a]),
                            "dx": dx, "dy": dy, "sens": dy / dx})
        for a, b in _auto_windows(auto, codes, regime):
            Yw = Y[a:b + 1]
            T = Yw[:, jT]
            if np.nanstd(T, axis=0).max() < AUTO_MIN_SD:
                continue
            autos.append({"run_id": run_id, "regime": str(regime[a]), "t_min": int(t[a]), "n": int(b - a + 1),
                          "T": T - np.nanmean(T, axis=0), "Y": Yw - np.nanmean(Yw, axis=0)})
    env_x = np.vstack(X_env) if X_env else np.empty((0, len(CANDIDATE_INPUTS)))
    env_y = np.vstack(Y_env) if Y_env else np.empty((0, len(OUTPUTS)))
    return samples, autos, env_x, env_y


def _fit_cutpoint(autos: list[dict], hold: list[dict]) -> dict | None:
    """Yield response to the two T98s from auto-trim windows: pooled within-window OLS, per-window dispersion,
    hold-out R² per output. Returns G (2 × len(OUTPUTS)), its MAD, R² dicts and counts; None if too few windows."""
    if len(autos) < AUTO_MIN_WINDOWS:
        return None
    T = np.vstack([w["T"] for w in autos])
    Y = np.vstack([w["Y"] for w in autos])
    ok = np.isfinite(T).all(axis=1) & np.isfinite(Y).all(axis=1)
    T, Y = T[ok], Y[ok]
    G, *_ = np.linalg.lstsq(T, Y, rcond=None)                     # (2, n_out)
    per = []
    for w in autos:
        m = np.isfinite(w["T"]).all(axis=1) & np.isfinite(w["Y"]).all(axis=1)
        if m.sum() < 20:
            continue
        g, *_ = np.linalg.lstsq(w["T"][m], w["Y"][m], rcond=None)
        per.append(g)
    MAD = np.nanmedian(np.abs(np.array(per) - G), axis=0) * 1.4826 if per else np.zeros_like(G)
    pred = T @ G
    r2_tr = 1 - ((Y - pred) ** 2).sum(0) / np.maximum((Y ** 2).sum(0), 1e-9)
    r2_ho = None
    if hold:
        Th = np.vstack([w["T"] for w in hold])
        Yh = np.vstack([w["Y"] for w in hold])
        okh = np.isfinite(Th).all(axis=1) & np.isfinite(Yh).all(axis=1)
        Th, Yh = Th[okh], Yh[okh]
        if len(Th) >= 60:
            r2_ho = 1 - ((Yh - Th @ G) ** 2).sum(0) / np.maximum((Yh ** 2).sum(0), 1e-9)
    return {"G": G, "MAD": MAD, "r2_train": r2_tr, "r2_holdout": r2_ho, "n_windows": len(autos),
            "n_minutes": int(len(T)), "n_windows_holdout": len(hold)}


def _envelope(A: np.ndarray, names: list[str]) -> dict:
    if len(A) == 0:
        return {}
    q01, q99 = np.nanpercentile(A, 1, axis=0), np.nanpercentile(A, 99, axis=0)
    sd = np.nanstd(A, axis=0)
    return {n: {"q01": float(q01[i]), "q99": float(q99[i]), "sd": float(sd[i])} for i, n in enumerate(names)}


def _fit_surrogates() -> None:
    st = get_state()
    out_dir = st.s.artifacts / "engines"
    pkl_path, card_path = out_dir / "surrogates.pkl", out_dir / "surrogate_card.json"
    if pkl_path.exists() and card_path.exists():
        try:
            if json.loads(card_path.read_text()).get("_meta", {}).get("version") == SURROGATE_VERSION:
                return
        except json.JSONDecodeError:
            pass
    regimes_csv = st.s.data_root / st.s["data"]["primary_batch"] / "_staged" / "regimes.csv"
    if not regimes_csv.exists():
        logger.warning("surrogates: missing %s", regimes_csv)
        return
    seg_df = pd.read_csv(regimes_csv)
    train, autos, Xe, Ye = _step_samples(st, seg_df, holdout=False)
    if not train:
        logger.warning("surrogates: no designed-move windows in the training batch")
        return
    hold, autos_ho, _, _ = _step_samples(st, seg_df, holdout=True)
    cut = _fit_cutpoint(autos, autos_ho)

    moved = sorted({s["input"] for s in train})
    counts = {tag: sum(1 for s in train if s["input"] == tag) for tag in moved}
    step_supported = [tag for tag in CANDIDATE_INPUTS
                      if tag not in CUTPOINT_SP and counts.get(tag, 0) >= MIN_EVENTS_POOLED]
    cut_supported = list(CUTPOINT_SP) if cut is not None else []
    supported = [tag for tag in CANDIDATE_INPUTS if tag in step_supported or tag in cut_supported]
    unsupported = [tag for tag in CANDIDATE_INPUTS if tag not in supported]
    n_in, n_out = len(supported), len(OUTPUTS)

    def table(sel: list[dict]) -> tuple[np.ndarray, np.ndarray, dict]:
        B, MAD, n = np.zeros((n_in, n_out)), np.zeros((n_in, n_out)), {}
        for i, tag in enumerate(supported):
            if tag in CUTPOINT_SP:
                continue
            S = np.array([s["sens"] for s in sel if s["input"] == tag])
            n[tag] = int(len(S))
            if len(S):
                B[i] = np.nanmedian(S, axis=0)
                MAD[i] = np.nanmedian(np.abs(S - B[i]), axis=0) * 1.4826
        return B, MAD, n

    # structural rows: dT98_own/dSP = 1; yields follow the auto-window response where it has skill; else 0
    cut_rows, cut_mad, cut_src, cut_meta = {}, {}, {}, None
    if cut is not None:
        keep = cut["r2_train"] >= AUTO_MIN_R2
        for a, (sp, t98) in enumerate(CUTPOINT_SP.items()):
            row = np.where(keep, cut["G"][a], 0.0)
            row[[OUTPUTS.index(c) for c in CUTPOINT_T98]] = 0.0
            row[OUTPUTS.index(t98)] = 1.0
            mad = np.where(keep, cut["MAD"][a], 0.0)
            cut_rows[sp], cut_mad[sp] = row, mad
            cut_src[sp] = (f"structural (controller gain 1) + auto-window yield response "
                           f"({cut['n_windows']} windows, {cut['n_minutes']} min)")
        cut_meta = {"n_windows": cut["n_windows"], "n_minutes": cut["n_minutes"],
                    "n_windows_holdout": cut["n_windows_holdout"],
                    "r2_train": {o: round(float(cut["r2_train"][k]), 3) for k, o in enumerate(OUTPUTS)},
                    "r2_holdout": None if cut["r2_holdout"] is None else
                    {o: round(float(cut["r2_holdout"][k]), 3) for k, o in enumerate(OUTPUTS)},
                    "outputs_used": [o for k, o in enumerate(OUTPUTS) if keep[k] and o not in CUTPOINT_T98]}

    B_pool, MAD_pool, n_pool = table(train)
    models, card = {}, {"_meta": {"version": SURROGATE_VERSION, "kind": "step_response_sensitivity + structural cut points",
                                  "inputs": supported, "unsupported_inputs": unsupported, "outputs": OUTPUTS,
                                  "n_events_train": len(train), "n_events_holdout": len(hold),
                                  "events_per_input": counts, "window_min": [BEFORE_MIN, SETTLE_MIN, AFTER_MIN],
                                  "cutpoint_fit": cut_meta}}
    for r in REGIME_IDS:
        own = [s for s in train if s["regime"] == r]
        B_r, MAD_r, n_r = table(own)
        B, MAD, src = B_pool.copy(), MAD_pool.copy(), {}
        for i, tag in enumerate(supported):
            if tag in cut_rows:
                B[i], MAD[i], src[tag] = cut_rows[tag], cut_mad[tag], cut_src[tag]
            elif n_r.get(tag, 0) >= MIN_EVENTS:
                B[i], MAD[i], src[tag] = B_r[i], MAD_r[i], f"regime ({n_r[tag]} moves)"
            else:
                src[tag] = f"pooled ({n_pool.get(tag, 0)} moves)"
        # hold-out skill: predicted vs observed Δy on held-out designed moves of this regime (step-response rows only)
        ho = [s for s in hold if s["regime"] == r and s["input"] in step_supported]
        r2h, err = None, None
        if len(ho) >= 3:
            P = np.array([B[supported.index(s["input"])] * s["dx"] for s in ho])
            O = np.array([s["dy"] for s in ho])
            ss_res, ss_tot = np.nansum((O - P) ** 2, axis=0), np.nansum((O - O.mean(axis=0)) ** 2, axis=0)
            r2h = {o: round(float(1 - ss_res[k] / ss_tot[k]), 3) if ss_tot[k] > 0 else None
                   for k, o in enumerate(OUTPUTS)}
            err = {o: round(float(np.sqrt(np.nanmean((O[:, k] - P[:, k]) ** 2))), 3) for k, o in enumerate(OUTPUTS)}
        env_x, env_y = _envelope(Xe, CANDIDATE_INPUTS), _envelope(Ye, OUTPUTS)
        # residual sd for levels: step-response dispersion scaled by a typical move, floored by steady-state noise
        resid = {o: round(float(max(np.nanmax(MAD[:, k]) if n_in else 0.0,
                                     0.25 * env_y.get(o, {}).get("sd", 1.0), 1e-6)), 4) for k, o in enumerate(OUTPUTS)}
        models[r] = {"B": B, "x_mean": np.array([env_x.get(t, {}).get("q01", 0.0) + env_x.get(t, {}).get("q99", 0.0)
                                                  for t in supported]) / 2,
                     "y_mean": np.array([(env_y.get(o, {}).get("q01", 0.0) + env_y.get(o, {}).get("q99", 0.0)) / 2
                                         for o in OUTPUTS])}
        card[r] = {
            "name": "regime_surrogate_v4", "regime_id": r, "kind": "step-response sensitivity (designed moves)",
            "inputs": supported, "unsupported_inputs": unsupported, "outputs": OUTPUTS,
            "n_events": {t: int(n_r.get(t, 0)) for t in supported}, "source": src,
            "n_train_minutes": int(sum(1 for s in train if s["regime"] == r) * (AFTER_MIN + BEFORE_MIN)),
            "sensitivity": {o: {t: round(float(B[i, k]), 5) for i, t in enumerate(supported)} for k, o in enumerate(OUTPUTS)},
            "sens_mad": {o: {t: round(float(MAD[i, k]), 5) for i, t in enumerate(supported)} for k, o in enumerate(OUTPUTS)},
            "r2": {o: None for o in OUTPUTS}, "r2_holdout": r2h, "holdout_rmse_delta": err,
            "resid_sd": resid,
            "envelope": {"inputs": {t: env_x[t] for t in supported if t in env_x}, "outputs": env_y},
        }
    out_dir.mkdir(parents=True, exist_ok=True)
    joblib.dump(models, pkl_path)
    card_path.write_text(json.dumps(card))
    logger.info("surrogates v%d: %d designed moves, inputs=%s", SURROGATE_VERSION, len(train), supported)


@lru_cache(maxsize=1)
def _load_surrogates():
    _fit_surrogates()
    st = get_state()
    out_dir = st.s.artifacts / "engines"
    pkl_path, card_path = out_dir / "surrogates.pkl", out_dir / "surrogate_card.json"
    if not pkl_path.exists() or not card_path.exists():
        return None, {}
    return joblib.load(pkl_path), json.loads(card_path.read_text())


def supported_inputs() -> list[str]:
    _, card = _load_surrogates()
    return list(card.get("_meta", {}).get("inputs", []))


def unsupported_inputs() -> list[str]:
    _, card = _load_surrogates()
    return list(card.get("_meta", {}).get("unsupported_inputs", []))


def get_surrogate_card(regime_id: str) -> dict:
    _, card = _load_surrogates()
    return card.get(regime_id, {})


def _model(regime_id: str) -> dict | None:
    models, _ = _load_surrogates()
    if not models:
        return None
    return models.get(regime_id) or next(iter(models.values()))


def sensitivity(regime_id: str) -> np.ndarray | None:
    """B (len(supported_inputs()) × len(OUTPUTS)): d output / d input in engineering units, per regime."""
    m = _model(regime_id)
    return None if m is None else m["B"]


def predict_delta(regime_id: str, dX: np.ndarray) -> np.ndarray:
    """Δ outputs (n, len(OUTPUTS)) for Δ inputs (n, len(supported_inputs())) — the only thing E4 needs."""
    m = _model(regime_id)
    if m is None:
        return np.full((len(dX), len(OUTPUTS)), np.nan)
    return np.asarray(dX, float) @ m["B"]


def predict_matrix(regime_id: str, X: np.ndarray) -> np.ndarray:
    """Levels around the regime's envelope centre — use `predict_delta` + measured state wherever possible."""
    m = _model(regime_id)
    if m is None:
        return np.full((len(X), len(OUTPUTS)), np.nan)
    return m["y_mean"] + (np.asarray(X, float) - m["x_mean"]) @ m["B"]


def predict(regime_id: str, X_dict: dict) -> dict:
    sup = supported_inputs()
    if not sup:
        return {}
    x = np.array([[float(X_dict.get(c, 0.0) or 0.0) for c in sup]])
    return {o: float(v) for o, v in zip(OUTPUTS, predict_matrix(regime_id, x)[0])}


def expected_series(run_id: str, unit_id: str) -> dict:
    """`expected:` / `band_lo:` / `band_hi:` per primary tag of a unit, aligned to the run's `time_min`.

    U4 uses the committee (`mean`, `q05`, `q95`) when the run is scored. Other units get a *run-anchored* surrogate:
    level = trailing robust baseline of the measured tag + sensitivity × (inputs − their trailing baseline), i.e. the
    tag's own history explains the level and the designed-move sensitivities explain what the operator / crude changed.
    """
    from app.engines.regime import get_run_regimes

    st = get_state()
    df = st.catalog.load(run_id)
    tags = UNIT_PRIMARY_TAGS.get(unit_id, [])
    if df.empty or not tags:
        return {}
    t_df = df["time_min"].to_numpy()

    if unit_id == "unit_4_fractionator":
        v = st.run(run_id)
        if v is not None:
            arrs, _ = v
            t_est = arrs["time_min"]
            idx = np.clip(np.searchsorted(t_est, t_df), 0, len(t_est) - 1)
            valid = t_est[idx] == t_df
            out = {}
            for tag in tags:
                if f"{tag}|mean" not in arrs:
                    continue
                for key, src in (("expected", "mean"), ("band_lo", "q05"), ("band_hi", "q95")):
                    a = np.asarray(arrs[f"{tag}|{src}"], float)[idx].copy()
                    a[~valid] = np.nan
                    out[f"{key}:{tag}"] = a.tolist()
            if out:
                return out

    sup = supported_inputs()
    if not sup or any(c not in df.columns for c in sup):
        return {}
    res = get_run_regimes(run_id)
    det = np.asarray(res["detected_regime"]) if res else np.full(len(df), "R3")
    X = df[sup].astype(float).ffill().bfill().to_numpy()
    out = {}
    for tag in tags:
        if tag not in OUTPUTS or tag not in df.columns:
            continue
        j = OUTPUTS.index(tag)
        y = pd.to_numeric(df[tag], errors="coerce").to_numpy(float)
        # Dynamic prediction ŷ_t from the regime surrogate at the *current* inputs — moves with the plant, not with a
        # lagged median of the tag (verbatim Part 6 §2: the band must wrap the live trajectory).
        yhat = np.full(len(df), np.nan)
        for r in REGIME_IDS:
            m = det == r
            if m.any():
                yhat[m] = predict_matrix(r, X[m])[:, j]
        yhat = pd.Series(yhat).ffill().bfill().to_numpy()
        # Slow bias correction — one-step-lagged EWMA of past innovations (y − ŷ). Half-life 45 min: it absorbs
        # run-specific offsets and slow drift, but a fast move or a fault still shows as a residual, not as a shift of the band.
        innov = y - yhat
        bias = pd.Series(innov).ewm(halflife=BIAS_HALFLIFE_MIN, min_periods=1).mean().shift(1).bfill().fillna(0.0).to_numpy()
        exp = yhat + bias
        sd_card = np.array([float(get_surrogate_card(r).get("resid_sd", {}).get(tag, 2.0) or 2.0) for r in det])
        # σ_t: regime residual sd floor, widened by the trailing spread of the corrected innovation (lagged).
        corr = pd.Series(y - exp)
        sd_loc = corr.ewm(halflife=BIAS_HALFLIFE_MIN, min_periods=10).std().shift(1).bfill().to_numpy()
        sd = np.sqrt(np.square(sd_card) + np.square(np.nan_to_num(sd_loc, nan=0.0)) * 0.5)
        out[f"expected:{tag}"] = exp.tolist()
        out[f"band_lo:{tag}"] = (exp - 2 * sd).tolist()
        out[f"band_hi:{tag}"] = (exp + 2 * sd).tolist()
    return out

