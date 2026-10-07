"""Feed model (DECISIONS S-8, SDD-FEED-01..08, R-1c): what the FCC feed is doing, from the unit's own response.

The FCC is fed heavy gas oil, not crude, so the question is not "which crude" but:
  ① is the feed changing, and how far through is it      (change detection on the estimate below)
  ② what are its properties                              (soft sensor: feed API gravity from the response fingerprint)
  ③ is it outside what the models were trained on        (novelty, from the regime engine — uncapped)
  ④ a feed-quality class derived from the API estimate   (bands from config ``regimes``)

The crude family is context only. The simulator records feed API but not Conradson carbon, K-factor, nitrogen or
metals, so only API is estimated here; on site the same slot is trained on the refinery's feed lab history.

Model: quadratic ridge regression of ``dist_feed_API`` on the EWMA fingerprint of ``regime.extract_features`` (coke
per feed, riser ΔT, fuel per feed, regenerator T, conversion, tray ΔT), fitted on train runs (seed < 140), scored on
held-out runs (seed ≥ 140). Change detection: the estimate is smoothed over ``smooth_min``; a change is flagged when
the smoothed estimate leaves a slow baseline by more than ``threshold_api``, and it is settled once the smoothed
estimate has moved less than ``settle_api`` per ``smooth_min`` for ``dwell_min`` minutes. Its catch rate, false alarms
and timing on the held-out runs are computed at fit time and reported with every payload.
"""
from __future__ import annotations

import json
import logging
import math
from functools import lru_cache

import numpy as np
import pandas as pd

from app.data.bq_source import staged_table
from app.state import get_state

logger = logging.getLogger(__name__)

FEED_FIT_VERSION = 1
FEATURES = ["coke_per_feed", "riser_dT_F", "fuel_per_feed", "Treg_F", "conversion_pct", "tray_dT_F"]
DEFAULTS = {"smooth_min": 20, "threshold_api": 0.7, "baseline_tau_min": 480, "settle_api": 0.3, "dwell_min": 15,
            "warmup_min": 60, "novel_at": 0.5, "ridge": 1.0, "familiar_margin_api": 1.0}
CLASS_TEXT = {"heavy": "heavy, high-carbon", "medium": "intermediate", "light": "light, easy-cracking"}


def _cfg() -> dict:
    return {**DEFAULTS, **(get_state().s.get("feed_model", {}) or {})}


def _seed(run_id: str) -> int | None:
    try:
        return int(run_id.split("random_s")[-1]) if "random_s" in run_id else None
    except ValueError:
        return None


def _design(Z: np.ndarray) -> np.ndarray:
    return np.c_[np.ones(len(Z)), Z, Z ** 2]


# ------------------------------------------------------------------------------------------------ change detection
def detect(t: np.ndarray, est: np.ndarray, cfg: dict) -> dict:
    """Per-minute feed state from the API estimate. Returns arrays and the list of change episodes."""
    sm_n, th, tau = int(cfg["smooth_min"]), float(cfg["threshold_api"]), float(cfg["baseline_tau_min"])
    settle, dwell, warm = float(cfg["settle_api"]), int(cfg["dwell_min"]), int(cfg["warmup_min"])
    sm = pd.Series(est).rolling(sm_n, min_periods=1).mean().to_numpy()
    lag = np.r_[np.full(sm_n, sm[0]), sm[:-sm_n]] if len(sm) > sm_n else np.full(len(sm), sm[0])
    d = sm - lag
    n = len(t)
    state = np.zeros(n, dtype=bool)          # True = changing
    base_arr = np.zeros(n)
    eps: list[dict] = []
    changing, quiet, base, cur = False, 0, float(sm[0]) if n else 0.0, None
    for i in range(n):
        if not changing:
            if t[i] < warm:
                base = float(sm[i])
            elif abs(sm[i] - base) > th:
                changing, quiet = True, 0
                cur = {"flagged_at_min": int(t[i]), "from_api": round(base, 2), "settled_at_min": None}
            else:
                base += (sm[i] - base) / tau
        else:
            quiet = quiet + 1 if abs(d[i]) <= settle else 0
            if quiet >= dwell:
                changing = False
                cur["settled_at_min"], cur["to_api"] = int(t[i]), round(float(sm[i]), 2)
                eps.append(cur)
                cur, base = None, float(sm[i])
        state[i], base_arr[i] = changing, base
    if cur:
        eps.append(cur)
    return {"smooth": sm, "changing": state, "baseline": base_arr, "episodes": eps}


def _score_detector(runs: list[tuple[str, np.ndarray, np.ndarray]], seg_df: pd.DataFrame, cfg: dict) -> dict:
    """Catch rate, false alarms and timing of the detector on the given runs against the labelled switches."""
    caught = total = false_alarms = 0
    flag_after_start, settle_after_end = [], []
    for run_id, t, est in runs:
        res = detect(t, est, cfg)
        sg = seg_df[(seg_df["run_id"] == run_id) & seg_df["transition_start_min"].notna()]
        used = set()
        for _, s in sg.iterrows():
            a, b = int(s["transition_start_min"]), int(s["transition_end_min"])
            if b > t.max():
                continue                         # switch after the run's valid data
            total += 1
            m = [k for k, e in enumerate(res["episodes"]) if a - 60 <= e["flagged_at_min"] <= b + 60]
            if not m:
                continue
            caught += 1
            used.add(m[0])
            e = res["episodes"][m[0]]
            flag_after_start.append(e["flagged_at_min"] - a)
            if e["settled_at_min"] is not None:
                settle_after_end.append(e["settled_at_min"] - b)
        false_alarms += sum(1 for k in range(len(res["episodes"])) if k not in used)
    med = lambda x: int(round(float(np.median(x)))) if x else None  # noqa: E731
    return {"switches": total, "caught": caught, "false_alarms": false_alarms, "runs": len(runs),
            "median_flag_after_ramp_start_min": med(flag_after_start),
            "median_settled_after_ramp_end_min": med(settle_after_end)}


# ------------------------------------------------------------------------------------------------ fit
def _fit() -> dict:
    from app.engines.regime import extract_features  # local: regime imports scripted, which imports this lazily
    st = get_state()
    cfg = _cfg()
    test_min = int(st.s["training"].get("test_seed_min", 140))
    warm = int(cfg["warmup_min"])
    tr_X, tr_y, te_X, te_y, te_runs = [], [], [], [], []
    for run_id, info in st.catalog.runs.items():
        if info.batch != st.s["data"]["primary_batch"]:
            continue
        seed = _seed(run_id)
        if seed is None:
            continue
        df = st.catalog.load_valid(run_id)
        if df.empty or "dist_feed_API" not in df:
            continue
        f = extract_features(df)[FEATURES]
        ok = (f.notna().all(axis=1) & df["dist_feed_API"].notna() & (df["time_min"] >= warm)).to_numpy()
        X, y = f.to_numpy(), df["dist_feed_API"].to_numpy()
        if seed < test_min:
            tr_X.append(X[ok]); tr_y.append(y[ok])
        else:
            te_X.append(X[ok]); te_y.append(y[ok])
            te_runs.append((run_id, df["time_min"].to_numpy(), X))
    if not tr_X:
        return {}
    Xtr, ytr = np.concatenate(tr_X), np.concatenate(tr_y)
    mu, sd = Xtr.mean(axis=0), Xtr.std(axis=0)
    sd[sd == 0] = 1.0
    A = _design((Xtr - mu) / sd)
    w = np.linalg.solve(A.T @ A + float(cfg["ridge"]) * np.eye(A.shape[1]), A.T @ ytr)
    fit = {"version": FEED_FIT_VERSION, "features": FEATURES, "mu": mu.tolist(), "sd": sd.tolist(), "w": w.tolist(),
           "train": {"rows": int(len(ytr)), "runs": f"seed < {test_min}",
                     "api_range": [round(float(ytr.min()), 1), round(float(ytr.max()), 1)]}}
    if te_X:
        Xte, yte = np.concatenate(te_X), np.concatenate(te_y)
        e = _design((Xte - mu) / sd) @ w - yte
        fit["heldout"] = {"rows": int(len(yte)), "runs": f"seed ≥ {test_min}", "mae_api": round(float(np.abs(e).mean()), 2),
                          "p90_abs_err_api": round(float(np.quantile(np.abs(e), 0.9)), 2),
                          "r2": round(float(1 - (e ** 2).mean() / yte.var()), 3)}
        seg_df = staged_table(st.s, "regimes")
        runs = []
        for run_id, t, X in te_runs:
            Xf = np.where(np.isfinite(X), X, mu)
            runs.append((run_id, t, _design((Xf - mu) / sd) @ w))
        fit["detector_heldout"] = _score_detector(runs, seg_df, cfg) if not seg_df.empty else None
    return fit


@lru_cache(maxsize=1)
def load_fit() -> dict:
    st = get_state()
    path = st.s.artifacts / "engines" / "feed_fit.json"
    if path.exists():
        try:
            fit = json.loads(path.read_text())
            if fit.get("version") == FEED_FIT_VERSION:
                return fit
        except (OSError, ValueError):
            pass
    logger.info("Fitting feed model (feed-API soft sensor + change detector)...")
    fit = _fit()
    if fit:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(fit))
    return fit


# ------------------------------------------------------------------------------------------------ per run
_cache: dict[str, tuple] = {}


def run_feed(run_id: str) -> dict | None:
    from app.engines.regime import get_run_regimes
    res = get_run_regimes(run_id)
    fit = load_fit()
    if not res or not fit:
        return None
    st = get_state()
    info = st.catalog.get(run_id)
    key = (info.mtime, info.size)
    if run_id in _cache and _cache[run_id][0] == key:
        return _cache[run_id][1]
    mu, sd, w = np.array(fit["mu"]), np.array(fit["sd"]), np.array(fit["w"])
    X = res["features"][FEATURES].to_numpy()
    X = np.where(np.isfinite(X), X, mu)
    est = _design((X - mu) / sd) @ w
    t = np.array(res["time_min"])
    out = {"t": t, "est": est, **detect(t, est, _cfg())}
    _cache[run_id] = (key, out)
    return out


def feed_class(api: float | None) -> str | None:
    if api is None or not math.isfinite(api):
        return None
    bands = get_state().s.get("regimes", {}) or {"heavy": [0, 22], "medium": [22, 26], "light": [26, 99]}
    for name, (lo, hi) in bands.items():
        if lo <= api < hi:
            return name
    return None


def class_probs(api: float | None, band_p90: float) -> list[dict]:
    """Chance the feed is in each class: a Gaussian on the API estimate with sigma = held-out p90 error / 1.645,
    integrated over the class bands (config ``regimes``). Ordered heavy → light. The screen never shows 0 or 100 %."""
    if api is None or not math.isfinite(api):
        return []
    bands = get_state().s.get("regimes", {}) or {"heavy": [0, 22], "medium": [22, 26], "light": [26, 99]}
    sig = max(0.05, float(band_p90) / 1.645)
    cdf = lambda x: 0.5 * (1 + math.erf((x - api) / (sig * math.sqrt(2))))  # noqa: E731
    out = [{"class": n, "label": CLASS_TEXT.get(n, n), "api_lo": float(lo), "api_hi": float(hi),
            "p": round(cdf(float(hi)) - cdf(float(lo)), 4)} for n, (lo, hi) in bands.items()]
    return sorted(out, key=lambda c: c["api_lo"])


def feed_at(run_id: str, time_min: int | None, reg: dict | None = None) -> dict:
    """The ``feed`` block (SDD-FEED-06). ``reg`` is the regime payload at the same minute (novelty, declared API)."""
    rf = run_feed(run_id)
    if not rf:
        return {}
    cfg, fit = _cfg(), load_fit()
    t_arr = rf["t"]
    i = len(t_arr) - 1 if time_min is None else int(min(max(np.searchsorted(t_arr, int(time_min), side="right") - 1, 0),
                                                        len(t_arr) - 1))
    t = int(t_arr[i])
    reg = reg or {}
    api_est = float(rf["smooth"][i])
    band = float((fit.get("heldout") or {}).get("p90_abs_err_api") or 0.5)
    declared = reg.get("declared_api")
    changing = bool(rf["changing"][i])
    past = [e for e in rf["episodes"] if e["flagged_at_min"] <= t]
    last = past[-1] if past else None
    pct = finish = None
    if changing and last:
        frm = float(last["from_api"])
        if declared is not None and abs(float(declared) - frm) > 0.3:
            pct = int(round(100 * min(1.0, max(0.0, (api_est - frm) / (float(declared) - frm)))))
            j0 = max(0, i - int(cfg["smooth_min"]))
            rate = (api_est - float(rf["smooth"][j0])) / max(1, t - int(t_arr[j0]))
            gap = float(declared) - api_est
            if rate and gap * rate > 0:
                finish = int(t + min(240, abs(gap / rate)))
    # ③ Feed familiarity (7 Oct, owner review): is the estimated API inside the range the model was trained on? 0 when
    # at least `familiar_margin_api` inside the range, 0.5 at the edge, 1 that far beyond it. The regime engine's
    # operating-pattern score also rises for non-feed reasons (fouling, a run heading for breakdown), so it is reported
    # as `unit_pattern_novelty` for engineers and left to the soft sensor's own trust checks (D2), not to the feed hold.
    lo_hi = (fit.get("train") or {}).get("api_range") or [20.0, 29.0]
    m = float(cfg.get("familiar_margin_api", 1.0))
    outside = max(float(lo_hi[0]) - api_est, api_est - float(lo_hi[1]))
    novelty = float(min(1.0, max(0.0, (outside + m) / (2 * m))))
    novel = novelty >= float(cfg["novel_at"])
    cls = feed_class(api_est)
    probs = class_probs(api_est, band)
    fam = reg.get("declared_regime_id")
    try:
        from app.regimes import regime_by_id
        fam_label = regime_by_id(fam).label if fam else None
    except Exception:  # noqa: BLE001 - context line only
        fam_label = None
    settled_at = None if changing else (last or {}).get("settled_at_min")
    return {
        "time_min": t,
        "state": "changing" if changing else "settled",
        "flagged_at_min": last["flagged_at_min"] if (changing and last) else None,
        "settled_at_min": settled_at,
        "last_change": dict(last) if last else None,
        "pct_through": pct if changing else (100 if last else None),
        "expected_finish_min": finish,
        "api_est": round(api_est, 1),
        "api_band": round(band, 1),
        "api_declared": None if declared is None else round(float(declared), 1),
        "novelty": round(novelty, 2),
        "novel": novel,
        "familiar_range_api": [float(lo_hi[0]), float(lo_hi[1])],
        "unit_pattern_novelty": None if reg.get("novelty") is None else round(float(reg["novelty"]), 2),
        "feed_class": cls,
        "feed_class_label": CLASS_TEXT.get(cls or "", cls),
        "class_probs": probs,
        "crude_family_context": (f"{fam} {fam_label}".strip() if fam else None),
        "hold": changing or novel,
        "hold_reason": ("feed_changing" if changing else "feed_novel") if (changing or novel) else None,
        "model": {"what": "feed API estimated from the unit's response (coke per feed, riser ΔT, fuel per feed, "
                          "regenerator T, conversion, tray ΔT); quadratic ridge regression",
                  "train": fit.get("train"), "heldout": fit.get("heldout"), "detector_heldout": fit.get("detector_heldout"),
                  "detector": {k: cfg[k] for k in ("smooth_min", "threshold_api", "settle_api", "dwell_min")},
                  "on_site": "also Conradson carbon, K-factor, nitrogen and metals, trained on the refinery's feed lab "
                             "history; the simulator records API only"},
    }


def feed_used_line(feed: dict) -> str | None:
    if not feed or feed.get("api_est") is None:
        return None
    return f"For this feed (API ≈ {feed['api_est']:.1f}, {feed.get('feed_class_label') or 'class n/a'})"
