"""Soft-sensor pipeline (SDD §6.3 replay loop, vectorised where possible).

FoldBundle = the four members per property + DQ + novelty + regime label counts, fitted on one set of runs.
assemble_run() = per-minute weights → Kalman bias → mixture → trust S1–S7 → gate → recommendations.
"""
from __future__ import annotations

import math

import numpy as np
import pandas as pd

from .config import MODEL_IDS
from .data.catalog import regime_of
from .data.features import add_features, candidate_columns
from .data.lags import apply_lags, is_lag_col, lag_columns, lags_path, load_lags
from .data.health import DQModel, NoveltyModel
from .dist import bimodality, components, crps_mixture, mix_cdf, mix_moments, mix_quantiles
from .gate import SpreadGate, gate_action, gate_cause
from .models.classic import BayesRidgeModel, GPRModel
from .models.hybrid_pinn import HybridDeltaModel, PinnEnsembleModel
from .recommend import build_recommendation

QS = [0.01, 0.05, 0.10, 0.25, 0.50, 0.75, 0.90, 0.95, 0.99]
QKEY = {0.01: "q01", 0.05: "q05", 0.10: "q10", 0.25: "q25", 0.50: "q50", 0.75: "q75", 0.90: "q90", 0.95: "q95", 0.99: "q99"}


def prepare(df: pd.DataFrame, s, lags="artifact") -> pd.DataFrame:
    """EWMA + A6 lagged features. lags: "artifact" (default) = the lag table persisted by the last training
    (artifacts/models/lags.json; none -> no lagged features), a table dict, or None/{} for no lagged features.
    Never re-identifies lags."""
    if isinstance(lags, str) and lags == "artifact":
        lags = load_lags(lags_path(s))
    return add_features(df, s, lags or None)


class FoldBundle:
    def __init__(self, s, cv: bool = False, seed: int = 0, lags: dict | None = None):
        self.s, self.cv, self.seed = s, cv, seed
        self.lags = lags                     # A6 lag table identified on the training runs (persisted with the bundle)
        self.models: dict[str, dict] = {}
        self.regime_counts: dict[str, dict] = {}

    def lagged(self, df: pd.DataFrame) -> pd.DataFrame:
        """Apply this bundle's persisted lag table (deterministic; recomputes the lag columns, no re-identification)."""
        lags = getattr(self, "lags", None)
        return apply_lags(df, lags) if lags else df

    def fit(self, frames: dict[str, pd.DataFrame], labels: dict[str, pd.DataFrame], log=print) -> "FoldBundle":
        """frames: run_id -> prepared frame (all minutes). labels: prop -> DataFrame of labelled rows
        (feature columns + 'y')."""
        s = self.s
        allf = pd.concat(list(frames.values()), ignore_index=True)
        cands = candidate_columns(allf, s)
        self.candidates = cands
        self.dq = DQModel(s).fit(list(frames.values()))
        self.novelty = NoveltyModel(cands).fit(allf)
        g = s["gpr"]
        mt = int(g["max_train_cv"] if self.cv else g["max_train"])
        F = s["features"]
        for prop, L in labels.items():
            y = L["y"].to_numpy(dtype=float)
            X = L
            own = set(lag_columns(getattr(self, "lags", None), prop))     # a target only sees its own lagged inputs
            pc = [c for c in cands if not is_lag_col(c) or c in own]
            reg = regime_of(X["dist_feed_API"].to_numpy(dtype=float), s) if "dist_feed_API" in X else np.array(["medium"] * len(X))
            self.regime_counts[prop] = {r: int((reg == r).sum()) for r in ("heavy", "medium", "light")}
            ms = {}
            log(f"    [{prop}] bayes_ridge (n={len(y)})")
            ms["bayes_ridge_v1"] = BayesRidgeModel(prop, s, int(F["max_ridge"])).fit(X, y, pc)
            log(f"    [{prop}] gpr")
            ms["gpr_v1"] = GPRModel(prop, s, int(F["max_gpr"]), mt, int(g["restarts"]), self.seed).fit(X, y, pc)
            log(f"    [{prop}] hybrid_delta")
            ms["hybrid_delta_v1"] = HybridDeltaModel(prop, s, int(F["max_gpr"]), mt, int(g["restarts"]), self.seed).fit(X, y, pc)
            log(f"    [{prop}] pinn_ens")
            ms["pinn_ens_v1"] = PinnEnsembleModel(prop, s, int(F["max_pinn"]), self.seed).fit(X, y, pc, X_unlabelled=allf)
            self.models[prop] = ms
        return self

    def predict_run(self, df: pd.DataFrame) -> dict:
        """Member predictions + input health for one prepared run frame (lagged features from this bundle's table)."""
        df = self.lagged(df)
        out = {"props": {}}
        t2, spe = self.novelty.evaluate(df)
        out["t2_ratio"], out["spe_ratio"] = t2, spe
        out["dq_fail"], out["dq_severe"], out["dq_tag"] = self.dq.evaluate(df)
        for prop, ms in self.models.items():
            mu = np.zeros((len(df), len(MODEL_IDS)))
            sd = np.zeros_like(mu)
            for j, mid in enumerate(MODEL_IDS):
                mu[:, j], sd[:, j] = ms[mid].predict_dist(df)
            phys, delta, _ = ms["hybrid_delta_v1"].decompose(df)
            gpr_sd = sd[:, MODEL_IDS.index("gpr_v1")]
            out["props"][prop] = {"mu": mu, "sigma": sd, "phys": phys, "delta": delta,
                                  "pinn_members": ms["pinn_ens_v1"].member_means(df),
                                  "gpr_sigma_ratio": gpr_sd / max(ms["gpr_v1"].median_train_sigma, 1e-6),
                                  "regime_counts": self.regime_counts[prop]}
        return out


# ---------------------------------------------------------------------------------------------------------------
def _weights_from_mse(mse: np.ndarray, admitted: np.ndarray, floor: float) -> np.ndarray:
    m = np.maximum(mse, floor)
    w = np.where(admitted, 1.0 / m, 0.0)
    return w / w.sum() if w.sum() > 0 else np.where(admitted, 1.0 / max(admitted.sum(), 1), 0.0)


def committee_weights(pool: list, adm: np.ndarray, w_oof: np.ndarray, recent_n: int, floor: float) -> tuple[np.ndarray, str]:
    """SDD-COM-01 weights. pool = accepted labs available so far, oldest first, as (mu_at_draw (J,), lab value).
    Uses the most recent `recent_n` of them (1/MSE per member); with fewer, the out-of-fold (training) weights."""
    if recent_n > 0 and len(pool) >= recent_n:
        last = pool[-recent_n:]
        M = np.array([m for m, _ in last], dtype=float)
        v = np.array([x for _, x in last], dtype=float)
        mse = np.nanmean((M - v[:, None]) ** 2, axis=0)
        mse = np.where(np.isfinite(mse), mse, np.inf)
        return _weights_from_mse(mse, adm, floor), "recent_labs"
    return w_oof.copy(), "out_of_fold"


def fallback_source(mean, mu, adm, val_mse, bias, trust, t, hold_max_min: int):
    """C4 fallback chain (minimal): consensus -> best single admitted model -> hold last good (<= hold_max_min) -> BAD.

    consensus   : finite mixture, >= 2 admitted members with finite output, trust != RED
    best_single : exactly one admitted member usable (lowest out-of-fold MSE among finite admitted), trust != RED
    hold_last   : last good value (either of the above) held for at most hold_max_min minutes
    BAD         : nothing usable. Returns (source[str], value[float])."""
    n, J = mu.shape
    order = [j for j in np.argsort(val_mse) if adm[j]]
    src = np.empty(n, dtype=object)
    val = np.full(n, np.nan)
    last_t, last_v = None, np.nan
    for i in range(n):
        fin = [j for j in order if np.isfinite(mu[i, j])]
        red = str(trust[i]) == "RED"
        if not red and len(fin) >= 2 and np.isfinite(mean[i]):
            src[i], val[i] = "consensus", float(mean[i])
        elif not red and len(fin) >= 1:
            src[i], val[i] = "best_single", float(mu[i, fin[0]] + bias[i])
        elif last_t is not None and t[i] - last_t <= hold_max_min:
            src[i], val[i] = "hold_last", last_v
            continue
        else:
            src[i] = "BAD"
            continue
        last_t, last_v = t[i], val[i]
    return src, val


def assemble_run(run_id: str, df: pd.DataFrame, preds: dict, raw_labs: list[dict], meta: dict, s, gains: dict,
                 events_codes: np.ndarray | None = None, history: dict | None = None) -> dict:
    """meta: {prop: {"admitted": bool[J], "val_mse": float[J]}}. history: optional {prop: [(mu (J,), lab value)]} of
    accepted labs scored before this run (oldest first), pooled with the run's own accepted labs for the committee
    weights. Returns dict of per-property arrays + labs, recommendations and gate transitions for the run."""
    n = len(df)
    t = df["time_min"].to_numpy().astype(int)
    R, sig_lab = s.R, s.sigma_lab
    Rlab, Q = sig_lab ** 2, (float(s["bias"]["drift_per_day_F"]) ** 2) / 1440.0
    ramp = int(s["bias"]["ramp_min"])
    floor = (0.25 * sig_lab) ** 2
    recent_n = int(s["committee"]["recent_n"])
    res = {"run_id": run_id, "time_min": t, "props": {}, "labs": [], "recs": [], "gate_transitions": []}
    api = df["dist_feed_API"].to_numpy(dtype=float) if "dist_feed_API" in df else np.full(n, 25.0)
    regime = regime_of(api, s)
    idx_of = {int(v): i for i, v in enumerate(t)}
    tr = s["trust"]

    for prop, P_ in preds["props"].items():
        mu = P_["mu"]
        # SDD-CAL (6 Oct): member sigmas scaled by the out-of-fold calibration factor so the 90 % band covers ~90 %
        sg = P_["sigma"] * float(meta[prop].get("sigma_scale", 1.0))
        J = mu.shape[1]
        # members in the mixture: admitted, minus any kept only as a reference (meta "mix_admitted")
        adm = np.asarray(meta[prop].get("mix_admitted", meta[prop]["admitted"]), bool)
        val_mse = np.asarray(meta[prop]["val_mse"], float)
        w_val = _weights_from_mse(val_mse, adm, floor)
        W = np.zeros((n, J))
        b_app = np.zeros(n)
        Pv = np.zeros(n)
        s4 = np.full(n, np.nan)
        labs = sorted([l for l in raw_labs if l["property"] == prop], key=lambda l: l["lims_time_min"])
        arrivals: dict[int, list] = {}
        for l in labs:
            arrivals.setdefault(l["lims_time_min"], []).append(l)
        b_state, P, b_from, b_to, ramp_start = 0.0, Rlab, 0.0, 0.0, None
        accepted: list[tuple[int, float, float]] = []   # (draw_idx, value, err_vs_mix)
        pool: list = list((history or {}).get(prop, []))  # (mu at draw (J,), value): prior history + this run
        w_cur, w_src = committee_weights(pool, adm, w_val, recent_n, floor)
        wsrc = np.empty(n, dtype=object)
        mix_nb = np.zeros(n)
        for i in range(n):
            P += Q
            ti = int(t[i])
            # weights (SDD-COM-01): last recent_n accepted labs pooled over the scored history, else out-of-fold MSE
            W[i] = w_cur
            wsrc[i] = w_src
            mix_nb[i] = float(np.sum(w_cur * mu[i]))
            # bias ramp (SDD §5.8)
            if ramp_start is not None:
                frac = min(1.0, (ti - ramp_start) / ramp)
                b_now = b_from + frac * (b_to - b_from)
            else:
                b_now = 0.0
            for l in arrivals.get(ti, []):
                rec_i = idx_of.get(int(l["recorded_draw_time_min"]))
                draw_i = idx_of.get(int(l["draw_time_min"]))
                status, reason = "ACCEPT", "within R of the estimate at draw"
                if l["recorded_draw_time_min"] >= l["lims_time_min"] - 1:
                    status, reason = "REJECT", "recorded draw time equals LIMS time (timestamp error)"
                elif draw_i is None or rec_i is None:
                    status, reason = "HOLD", "draw time outside the run"
                else:
                    est_draw = mix_nb[draw_i] + b_app[draw_i]
                    if abs(l["value"] - est_draw) > 2 * R:
                        status, reason = "HOLD", f"|lab − estimate| = {abs(l['value'] - est_draw):.1f} °F > 2R"
                l2 = dict(l, status=status, status_reason=reason)
                res["labs"].append(l2)
                if status == "ACCEPT":        # SDD-KAL-03
                    innov = l["value"] - (mix_nb[rec_i] + b_state)
                    K = P / (P + Rlab)
                    b_state = b_state + K * innov
                    P = (1 - K) * P
                    b_from, b_to, ramp_start = b_now, b_state, ti
                    accepted.append((draw_i, l["value"], l["value"] - (mix_nb[draw_i] + b_app[draw_i])))
                    pool.append((mu[draw_i].copy(), float(l["value"])))
                    w_cur, w_src = committee_weights(pool, adm, w_val, recent_n, floor)   # applies from next minute
            b_app[i] = b_now
            Pv[i] = P
            if accepted:
                errs = [e for _, _, e in accepted[-5:]]
                s4[i] = math.sqrt(float(np.mean(np.square(errs)))) / R
        for l in labs:                    # labs that arrive after the end of the run
            if l["lims_time_min"] > t[-1] or l["lims_time_min"] < t[0]:
                res["labs"].append(dict(l, status="PENDING", status_reason="result not yet received within the run"))

        m, sc = components(mu, sg, b_app, Pv)
        q = mix_quantiles(QS, m, sc, W)
        mean, sd = mix_moments(mu, sg, W, b_app, Pv)
        D, bim = bimodality(m, sc, W, adm, float(s["mixture"]["bimodal_d"]), float(s["mixture"]["bimodal_min_weight"]))
        spec = s.spec_max(prop)
        p_on = mix_cdf(np.full(n, spec), m, sc, W)
        truth = df[prop].to_numpy(dtype=float) if prop in df else np.full(n, np.nan)
        crps = crps_mixture(np.nan_to_num(truth), m, sc, W)
        admu = mu[:, adm] if adm.sum() else mu[:, :1]
        spread = admu.std(axis=1) if admu.shape[1] > 1 else np.zeros(n)
        res["props"][prop] = dict(mu=mu, sigma=sg, weight=W, bias=b_app, bias_var=Pv, mean=mean, sd=sd,
                                  **{QKEY[k]: v for k, v in q.items()}, w90=q[0.95] - q[0.05], bimodality_d=D,
                                  bimodal=bim, p_on_spec=p_on, truth=truth, crps=crps, spread=spread, s4=s4,
                                  admitted=adm, val_mse=val_mse, weight_source=wsrc, phys=P_["phys"], delta=P_["delta"], pinn_members=P_["pinn_members"],
                                  gpr_sigma_ratio=P_["gpr_sigma_ratio"],
                                  regime_labels=np.array([P_["regime_counts"].get(r, 0) for r in regime]))

    # ---- trust S1–S7 (SDD-TRU-01) and gate, per property
    novelty_fail = (preds["t2_ratio"] > 1) | (preds["spe_ratio"] > 1)
    novelty_sev = (preds["t2_ratio"] > 2) | (preds["spe_ratio"] > 2)
    dq_fail, dq_sev, dq_tag = preds["dq_fail"], preds["dq_severe"], preds["dq_tag"]
    props = list(res["props"].keys())
    for prop in props:
        A = res["props"][prop]
        sig = {}
        v1 = A["spread"] / R
        sig["S1"] = (v1, v1 <= tr["s1_spread_R"], v1 > tr["s1_severe_R"], tr["s1_spread_R"])
        gpr_fail = A["gpr_sigma_ratio"] > tr["gpr_sigma_ratio"]
        v2 = np.maximum(preds["t2_ratio"], preds["spe_ratio"])
        sig["S2"] = (v2, ~(novelty_fail | gpr_fail), novelty_sev, 1.0)
        if "LCO_T98_F" in res["props"] and "HN_T98_F" in res["props"]:
            gap = res["props"]["LCO_T98_F"]["q50"] - res["props"]["HN_T98_F"]["q50"]
            viol = tr["physics_delta_F"] - gap         # >0 means HN is not at least 50 F below LCO
            sig["S3"] = (gap, viol <= 0, viol > tr["physics_severe_F"] - tr["physics_delta_F"], float(tr["physics_delta_F"]))
        else:
            sig["S3"] = (np.full(n, np.nan), np.ones(n, bool), np.zeros(n, bool), float(tr["physics_delta_F"]))
        s4 = A["s4"]
        sig["S4"] = (s4, np.isnan(s4) | (s4 <= tr["s4_rmse_R"]), np.nan_to_num(s4) > tr["s4_severe_R"], tr["s4_rmse_R"])
        sig["S5"] = (dq_fail.astype(float), ~dq_fail, dq_sev, 0.0)
        rl = A["regime_labels"].astype(float)
        sig["S6"] = (rl, rl >= tr["s6_min_labels"], rl == 0, float(tr["s6_min_labels"]))
        v7 = A["w90"] / s.w90_max
        sig["S7"] = (v7, (v7 <= 1.0) & ~A["bimodal"], (v7 > tr["s7_severe_ratio"]) | A["bimodal"], 1.0)
        fails = np.stack([~sig[k][1] for k in sig], 1)
        sev = np.stack([sig[k][2] & ~sig[k][1] for k in sig], 1)
        nfail = fails.sum(1)
        level = np.where((nfail >= 2) | sev.any(1), "RED", np.where(nfail == 1, "AMBER", "GREEN"))
        A["trust_signals"] = {k: {"value": v[0], "pass": v[1], "severe": v[2] & ~v[1], "limit": v[3]} for k, v in sig.items()}
        A["trust"] = level
        A["trust_reason"] = np.array([_trust_reason(fails[i], dq_tag[i]) for i in range(n)], dtype=object)
        A["source"], A["source_value"] = fallback_source(A["mean"], A["mu"], A["admitted"], A["val_mse"], A["bias"], level,
                                                         t, int((s.get("fallback") or {}).get("hold_max_min", 60)))

        gate = SpreadGate(s.w90_max, float(s["gate"]["hysteresis_ratio"]), int(s["gate"]["hysteresis_min"]))
        st, rs, msg = [], [], []
        prev = "PASS"
        for i in range(n):
            cause = gate_cause(bool(A["bimodal"][i]), bool(~sig["S2"][1][i]), float(A["bias_var"][i]), sig_lab)
            action = gate_action(dq_tag[i] if dq_fail[i] else None)
            g = gate.step(float(A["w90"][i]), bool(A["bimodal"][i]), float(A["bimodality_d"][i]), cause, action)
            st.append(g.status); rs.append(g.reason); msg.append(g.message)
            if g.status != prev:                  # SDD-GATE-06
                res["gate_transitions"].append({"time_min": int(t[i]), "property": prop, "from": prev, "to": g.status,
                                                "reason": g.reason, "message": g.message, "w90": round(float(A["w90"][i]), 2)})
            prev = g.status
        A["gate"], A["gate_reason"], A["gate_message"] = np.array(st, dtype=object), np.array(rs, dtype=object), np.array(msg, dtype=object)

        # ---- recommendations every N minutes (SDD-REC-01)
        every = int(s["recommend"]["every_min"])
        sp_col = "SP_LCO_T98" if prop == "LCO_T98_F" else "SP_HN_T98"
        feed = df["feed_flow_lb_s"].to_numpy(dtype=float) * 60.0 if "feed_flow_lb_s" in df else np.full(n, np.nan)
        m, sc = components(A["mu"], A["sigma"], A["bias"], A["bias_var"])
        for i in range(n):
            if t[i] % every != 0:
                continue
            est = {"m": m[i], "s": sc[i], "w": A["weight"][i], "q95": float(A["q95"][i]), "w90": float(A["w90"][i]),
                   "p_on_spec": float(A["p_on_spec"][i]), "gate_status": st[i], "gate_reason": rs[i],
                   "gate_message": msg[i], "trust": str(level[i])}
            sp = float(df[sp_col].iloc[i]) if sp_col in df else None
            rec = build_recommendation(run_id, int(t[i]), prop, est, sp, float(feed[i]), gains[prop], s, [])
            if rec is not None:
                res["recs"].append(rec)
    res["labs"].sort(key=lambda l: (l["property"], l["time_min"]))
    return res


SIGNAL_WORDS = {"S1": "models disagree (committee spread high)", "S2": "inputs outside the training envelope",
                "S3": "physics consistency violated (HN T98 not 50 °F below LCO T98)",
                "S4": "recent lab track record poor", "S5": "sensor health flag",
                "S6": "unfamiliar crude regime (few training labels)", "S7": "distribution spread too wide"}


def _trust_reason(fail_row, tag) -> str:
    keys = ["S1", "S2", "S3", "S4", "S5", "S6", "S7"]
    bad = [SIGNAL_WORDS[k] + (f" on {tag}" if k == "S5" and tag else "") for k, f in zip(keys, fail_row) if f]
    return "all signals within limits" if not bad else "; ".join(bad)
