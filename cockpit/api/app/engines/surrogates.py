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
import os
from functools import lru_cache

import joblib
import numpy as np
import pandas as pd

from app.regimes import REGIME_IDS
from app.state import get_state

logger = logging.getLogger(__name__)

SURROGATE_VERSION = 7          # 7: valid range (simulator breakdown cut), explicit lever hold-out range

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

# ---- gap-window lever fit (opt-in: env FCC_SURROGATE_GAP_FIT=1 or config training.surrogate_gap_fit: true) ----
# scenario.m 'lever' spaces consecutive moves only ramp + 30 min apart, so the strict 15 / 30-60 min windows above reject
# almost every lever move. The gap fit measures each lever move inside the gap it actually has: a 10-15 min pre
# window that starts >= GAP_PRE_SETTLE min after the previous move / auto trim, a post window that runs to the next
# move (or auto trim / regime change / end of valid data) minus GAP_MARGIN_MIN (>= GAP_POST_MIN min after the ramp), and a
# first-order step-response fit (unit ramp through a first-order lag, tau from a grid) whose gain is the steady-state
# gain. When the fitted tau is longer than the post window the extrapolation is not trusted and the late-window delta
# (a lower bound on |gain|) is used instead. Artifacts go to <artifacts>/engines_v7_candidate, never to engines/.
GAP_EVENT_CODES = (7, 8, 9, 10, 11, 12)
GAP_PRE_MIN, GAP_PRE_MAX, GAP_PRE_SETTLE = 10, 15, 10
GAP_MARGIN_MIN, GAP_POST_MIN, GAP_POST_MAX = 3, 20, 120
GAP_LATE_MIN = 10
GAP_COVERAGE = 0.8
GAP_TAU_GRID = (1.0, 2.0, 3.0, 5.0, 8.0, 12.0, 18.0, 25.0, 35.0, 50.0, 75.0, 110.0)
GAP_MIN_STEP = {"SP_T_preheat_F": 1.0, "Fair": 0.003, "MV_PA2": 2.0, "MV_reflux_ratio": 0.01, "MV_cw_flow": 3.0,
                "SP_T_overhead": 0.5}
GAP_ARTIFACT_DIR = "engines_v7_candidate"


def gap_fit_enabled(st=None) -> bool:
    import os
    env = os.environ.get("FCC_SURROGATE_GAP_FIT")
    if env is not None:
        return env not in ("", "0", "false", "no")
    try:
        st = st or get_state()
        return bool(st.s["training"].get("surrogate_gap_fit", False))
    except Exception:  # noqa: BLE001 — no settings available -> default (off)
        return False


def _out_dir(st):
    return st.s.artifacts / (GAP_ARTIFACT_DIR if gap_fit_enabled(st) else "engines")


def gap_step_response(t: np.ndarray, x: np.ndarray, Y: np.ndarray, ramp_start: float, ramp_end: float,
                      pre_start: float, post_end: float) -> dict | None:
    """First-order step-response estimate of one ramped lever move inside an arbitrary gap.

    t (n,) minutes, x (n,) lever, Y (n, k) outputs; the window is [pre_start, post_end] with the ramp in
    [ramp_start, ramp_end]. Non-finite cells are treated as missing. Returns None when the windows are too short or too
    sparse. Otherwise per output: `sens` (steady-state gain per lever unit; first-order fit when settled, else the
    late-window delta), `sens_fo`, `sens_late`, `tau` (min), `settled` (tau <= post window), plus `dx`, `post_len`.
    """
    t = np.asarray(t, float)
    x = np.asarray(x, float)
    Y = np.asarray(Y, float)
    if Y.ndim == 1:
        Y = Y[:, None]
    pre = (t >= pre_start) & (t < ramp_start)
    post = (t > ramp_end) & (t <= post_end)
    pre_len, post_len = ramp_start - pre_start, post_end - ramp_end
    if pre_len < GAP_PRE_MIN or post_len < GAP_POST_MIN:
        return None
    if np.isfinite(x[pre]).sum() < GAP_COVERAGE * pre_len or np.isfinite(x[post]).sum() < GAP_COVERAGE * post_len:
        return None
    late_len = max(GAP_LATE_MIN, post_len / 2)
    late = post & (t > post_end - late_len)
    dx = float(np.nanmean(x[late]) - np.nanmean(x[pre]))
    if not np.isfinite(dx) or dx == 0:
        return None
    win = (t >= pre_start) & (t <= post_end)
    tw = t[win]
    u = np.clip((tw - ramp_start) / max(ramp_end - ramp_start, 1.0), 0.0, 1.0)   # commanded unit ramp
    k = Y.shape[1]
    y0 = np.nanmean(Y[pre], axis=0)
    dY = Y[win] - y0
    sens_fo, sens_late, tau_best = np.full(k, np.nan), np.full(k, np.nan), np.full(k, np.nan)
    sse_best = np.full(k, np.inf)
    dt = np.r_[1.0, np.diff(tw)]
    for tau in GAP_TAU_GRID:
        a = 1.0 - np.exp(-dt / tau)
        uf = np.zeros_like(u)
        for i in range(1, len(u)):
            uf[i] = uf[i - 1] + a[i] * (u[i] - uf[i - 1])
        for j in range(k):
            m = np.isfinite(dY[:, j])
            den = float((uf[m] ** 2).sum())
            if m.sum() < GAP_COVERAGE * (pre_len + post_len) or den <= 0:
                continue
            g = float((uf[m] * dY[m, j]).sum() / den)
            sse = float(((dY[m, j] - g * uf[m]) ** 2).sum())
            if sse < sse_best[j]:
                sse_best[j], sens_fo[j], tau_best[j] = sse, g / dx, tau
    for j in range(k):
        yl = Y[late, j]
        if np.isfinite(yl).sum() >= GAP_COVERAGE * min(late_len, post_len) * 0.5:
            sens_late[j] = (np.nanmean(yl) - y0[j]) / dx
    settled = np.isfinite(tau_best) & (tau_best <= post_len + (ramp_end - ramp_start))
    sens = np.where(settled, sens_fo, sens_late)
    return {"dx": dx, "sens": sens, "sens_fo": sens_fo, "sens_late": sens_late, "tau": tau_best, "settled": settled,
            "post_len": float(post_len), "pre_len": float(pre_len)}


def _blocks(mask: np.ndarray, t: np.ndarray, codes: np.ndarray | None = None) -> list[tuple[int, float, float]]:
    """(code, t_start, t_end) of contiguous non-zero blocks (code -1 when `codes` is None)."""
    out = []
    vals = codes if codes is not None else mask.astype(int)
    i, n = 0, len(t)
    while i < n:
        if mask[i]:
            j = i
            while j + 1 < n and mask[j + 1] and vals[j + 1] == vals[i]:
                j += 1
            out.append((int(codes[i]) if codes is not None else -1, float(t[i]), float(t[j])))
            i = j + 1
        else:
            i += 1
    return out


def gap_windows(t: np.ndarray, codes: np.ndarray, auto: np.ndarray, regime: np.ndarray,
                code_set=GAP_EVENT_CODES) -> list[dict]:
    """Windows for every designed lever move: pre / post bounded by the neighbouring moves, auto trims and regime
    changes. Each item: code, ramp_start, ramp_end, pre_start, post_end, regime, ok, reason."""
    t = np.asarray(t, float)
    codes = np.asarray(codes, int)
    auto = np.asarray(auto, int)
    regime = np.asarray(regime, dtype=object)
    events = _blocks(codes != 0, t, codes)
    autos = _blocks(auto != 0, t)
    blockers = sorted([(a, b) for _, a, b in events] + [(a, b) for _, a, b in autos])
    t_last = float(t[-1]) if len(t) else 0.0
    out = []
    for code, rs, re_ in events:
        if code not in code_set:
            continue
        i0 = int(np.searchsorted(t, rs))
        reg = str(regime[i0]) if i0 < len(regime) else ""
        prev_end = max([b for a, b in blockers if b < rs], default=-np.inf)
        next_start = min([a for a, b in blockers if a > re_], default=t_last + 1 + GAP_MARGIN_MIN)
        # regime run around the move (labelled, constant)
        same = regime == reg
        lo = i0
        while lo > 0 and same[lo - 1]:
            lo -= 1
        hi = i0
        while hi + 1 < len(t) and same[hi + 1]:
            hi += 1
        pre_start = max(rs - GAP_PRE_MAX, prev_end + GAP_PRE_SETTLE, float(t[lo]))
        post_end = min(next_start - GAP_MARGIN_MIN, re_ + GAP_POST_MAX, float(t[hi]), t_last)
        reason = None
        if reg == "":
            reason = "regime transition"
        elif (auto[(t >= pre_start) & (t <= post_end)] != 0).any():
            reason = "auto trim"
        elif rs - pre_start < GAP_PRE_MIN:
            reason = "pre window short"
        elif post_end - re_ < GAP_POST_MIN:
            reason = "post window short"
        out.append({"code": code, "ramp_start": rs, "ramp_end": re_, "pre_start": float(pre_start),
                    "post_end": float(post_end), "regime": reg, "ok": reason is None, "reason": reason})
    return out


def _gap_samples(st, seg_df: pd.DataFrame, *, holdout: bool, outputs: list[str] | None = None,
                 holdout_seeds: set[int] | None = None, with_rejects: bool = False) -> list[dict]:
    """One gap-window sample per lever move of the lever batches (same sample keys as `_step_samples`, plus the
    first-order fit details). Hold-out = config lever_test_seed_min..max unless `holdout_seeds` is given."""
    outputs = outputs or OUTPUTS
    lo = int(st.s["training"].get("lever_test_seed_min", 210))
    hi = int(st.s["training"].get("lever_test_seed_max", 10 ** 9))
    staged = set(seg_df["run_id"])
    out = []
    for run_id in _lever_runs(st):
        if run_id not in staged:
            continue
        seed = _seed_of(run_id)
        if seed is None:
            continue
        is_ho = (seed in holdout_seeds) if holdout_seeds is not None else (lo <= seed <= hi)
        if is_ho != holdout:
            continue
        df = st.catalog.load_valid(run_id)
        tags = sorted({EVENT_INPUT[c] for c in GAP_EVENT_CODES})
        if df.empty or any(c not in df.columns for c in tags + outputs + ["event_code", "time_min"]):
            continue
        t = pd.to_numeric(df["time_min"], errors="coerce").to_numpy(float)
        codes = pd.to_numeric(df["event_code"], errors="coerce").fillna(0).to_numpy(int)
        auto = pd.to_numeric(df["cutpoint_auto"], errors="coerce").fillna(0).to_numpy(int) \
            if "cutpoint_auto" in df.columns else np.zeros(len(df), int)
        regime = _regime_at_minutes(seg_df, run_id, t)
        Y = df[outputs].apply(pd.to_numeric, errors="coerce").to_numpy(float)
        for w in gap_windows(t, codes, auto, regime):
            tag = EVENT_INPUT[w["code"]]
            base = {"run_id": run_id, "input": tag, "regime": w["regime"], "t_min": int(w["ramp_start"]),
                    "post_len": w["post_end"] - w["ramp_end"], "method": "gap"}
            if not w["ok"]:
                if with_rejects:
                    out.append({**base, "rejected": w["reason"]})
                continue
            x = pd.to_numeric(df[tag], errors="coerce").to_numpy(float)
            r = gap_step_response(t, x, Y, w["ramp_start"], w["ramp_end"], w["pre_start"], w["post_end"])
            if r is None or abs(r["dx"]) < GAP_MIN_STEP.get(tag, 0.5):
                if with_rejects:
                    out.append({**base, "rejected": "fit failed" if r is None else "step too small"})
                continue
            out.append({**base, "dx": r["dx"], "sens": r["sens"], "dy": r["sens"] * r["dx"], "sens_fo": r["sens_fo"],
                        "sens_late": r["sens_late"], "tau": r["tau"], "settled": r["settled"]})
    return out


def _seed_of(run_id: str) -> int | None:
    for stem in ("random_s", "lever_s"):
        if stem in run_id:
            try:
                return int(run_id.split(stem)[-1])
            except ValueError:
                return None
    return None


def _lever_runs(st) -> list[str]:
    """Complete runs of the lever batches (designed moves of the levers the random batch never moves)."""
    lever = set(st.s["training"].get("lever_batches") or [])
    min_rows = int(st.s["training"].get("lever_min_rows", st.s["data"].get("min_rows", 1500)))
    runs = getattr(st.catalog, "all_runs", {}) or {}
    return sorted(r for r, i in runs.items() if i.batch in lever and i.n_minutes >= min_rows)


def _lever_key(st, used: list[str]) -> list[str]:
    """Cache key: each lever run with its length in whole hours, so the fit is redone as running lever runs grow."""
    runs = getattr(st.catalog, "all_runs", {}) or {}
    return [f"{r}:{runs[r].n_minutes // 60}h" for r in used if r in runs]


def _regime_table(st) -> pd.DataFrame | None:
    """Regime segments of the primary batch plus every lever batch that has been staged (stage_regimes.py).
    Lake-only serving (FCC_RUN_INDEX=bigquery): read from fcc_bronze.crude_regimes_raw instead of local files."""
    root = st.s.data_root
    lake = os.environ.get("FCC_RUN_INDEX", "").lower() == "bigquery"
    frames = []
    for b in [st.s["data"]["primary_batch"], *(st.s["training"].get("lever_batches") or [])]:
        if lake:
            from ..data.bq_source import get_bq
            try:
                df = get_bq(st.s).staged("regimes", b)
            except Exception as e:  # noqa: BLE001
                logger.warning("surrogates: regimes for %s not readable from BigQuery (%s)", b, e)
                df = pd.DataFrame()
            if len(df):
                frames.append(df)
                continue
            if b == st.s["data"]["primary_batch"]:
                return None
            continue
        f = root / b / "_staged" / "regimes.csv"
        if f.exists():
            frames.append(pd.read_csv(f))
        elif b == st.s["data"]["primary_batch"]:
            logger.warning("surrogates: missing %s", f)
            return None
        else:
            logger.info("surrogates: %s not staged yet (run sim_octave/stage_regimes.py --batch %s)", b, b)
    return pd.concat(frames, ignore_index=True)


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
    lever_test_min = int(st.s["training"].get("lever_test_seed_min", 210))
    lever_test_max = int(st.s["training"].get("lever_test_seed_max", 10 ** 9))
    staged = set(seg_df["run_id"])
    samples, autos, X_env, Y_env = [], [], [], []
    jT = [OUTPUTS.index(c) for c in CUTPOINT_T98]
    # (run, info, held-out seed range): full_v1 seeds >= 140 held out; lever seeds 210..211 held out, the rest train
    candidates = [(r, i, (test_min, 10 ** 9)) for r, i in st.catalog.runs.items() if i.batch == st.s["data"]["primary_batch"]]
    candidates += [(r, st.catalog.get(r), (lever_test_min, lever_test_max)) for r in _lever_runs(st) if r in staged]
    for run_id, info, (h_lo, h_hi) in candidates:
        seed = _seed_of(run_id)
        if seed is None or (h_lo <= seed <= h_hi) != holdout:
            continue
        df = st.catalog.load_valid(run_id)
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
    gap = gap_fit_enabled(st)
    out_dir = _out_dir(st)
    pkl_path, card_path = out_dir / "surrogates.pkl", out_dir / "surrogate_card.json"
    if os.environ.get("FCC_FREEZE_ENGINES") == "1" and pkl_path.exists() and card_path.exists():
        return   # serving: the published fit (pulled from the lake's model zone) is used as-is, never refit here
    seg_df = _regime_table(st)
    if seg_df is None:
        return
    # the cache is valid only for the same code version and the same set of (staged, complete) lever runs, so the
    # fit is redone automatically once the lever batch lands and is staged
    lever_used = _lever_key(st, [r for r in _lever_runs(st) if r in set(seg_df["run_id"])])
    if pkl_path.exists() and card_path.exists():
        try:
            meta = json.loads(card_path.read_text()).get("_meta", {})
            if meta.get("version") == SURROGATE_VERSION and meta.get("lever_runs", []) == lever_used \
                    and bool((meta.get("gap_fit") or {}).get("enabled", False)) == gap:
                return
        except json.JSONDecodeError:
            pass
    train, autos, Xe, Ye = _step_samples(st, seg_df, holdout=False)
    if not train:
        logger.warning("surrogates: no designed-move windows in the training batch")
        return
    hold, autos_ho, _, _ = _step_samples(st, seg_df, holdout=True)
    cut = _fit_cutpoint(autos, autos_ho)
    gap_meta = None
    if gap:
        # lever moves: replace the strict-window samples by the gap-window samples (a superset of usable moves)
        lever_tags = {EVENT_INPUT[c] for c in GAP_EVENT_CODES}
        g_train, g_hold = _gap_samples(st, seg_df, holdout=False), _gap_samples(st, seg_df, holdout=True)
        strict = {tag: sum(1 for s in train if s["input"] == tag) for tag in sorted(lever_tags)}
        train = [s for s in train if s["input"] not in lever_tags] + g_train
        hold = [s for s in hold if s["input"] not in lever_tags] + g_hold
        gap_meta = {"enabled": True, "pre_min": [GAP_PRE_MIN, GAP_PRE_MAX], "pre_settle_min": GAP_PRE_SETTLE,
                    "post_min": [GAP_POST_MIN, GAP_POST_MAX], "margin_min": GAP_MARGIN_MIN,
                    "tau_grid_min": list(GAP_TAU_GRID), "strict_moves_train": strict,
                    "gap_moves_train": {tag: sum(1 for s in g_train if s["input"] == tag) for tag in sorted(lever_tags)},
                    "gap_moves_holdout": {tag: sum(1 for s in g_hold if s["input"] == tag) for tag in sorted(lever_tags)},
                    "settled_frac": {tag: round(float(np.nanmean([np.mean(s["settled"]) for s in g_train
                                                                  if s["input"] == tag] or [np.nan])), 3)
                                     for tag in sorted(lever_tags)}}

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
    models, card = {}, {"_meta": {"version": SURROGATE_VERSION, "lever_runs": lever_used, "kind": "step_response_sensitivity + structural cut points",
                                  "inputs": supported, "unsupported_inputs": unsupported, "outputs": OUTPUTS,
                                  "n_events_train": len(train), "n_events_holdout": len(hold),
                                  "events_per_input": counts, "window_min": [BEFORE_MIN, SETTLE_MIN, AFTER_MIN],
                                  "cutpoint_fit": cut_meta, "gap_fit": gap_meta}}
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
    out_dir = _out_dir(st)
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

