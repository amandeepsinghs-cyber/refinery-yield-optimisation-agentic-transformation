"""E4 — prescriptive multi-parameter recipe (SDD-RCP-02..06, API_CONTRACT_v3 §4).

Advisory only. For a unit at (run, time) the engine:

1. takes the active regime (E1) and the regime surrogate (E2);
2. searches only the operator set points that (a) belong to the unit, (b) carry information in the training batch
   (`surrogates.supported_inputs()`), inside IOW limits ∩ per-move step limits ∩ the regime's training envelope —
   so it never recommends a move the data cannot support;
3. scores candidates on priority yields (% of feed) minus normalised energy / coke penalties, subject to
   P(T98 <= spec) >= 0.95 for LCO and HN, and to every predicted output staying inside its training envelope;
4. issues >= 2 coordinated moves, or WITHHELDs with a reason in {spread_gate, novelty, insufficient_data,
   infeasible, no_gain}.

Effects are predicted as *deltas* from the surrogate applied to the measured current state (same philosophy as the
hybrid-delta committee member), so surrogate bias does not leak into the recipe. The search is a deterministic grid
(one vectorised predict call) followed by a local refinement, so the same (run, time, unit) always yields the same
recipe; results are cached in memory.
"""
from __future__ import annotations

import itertools
import logging
from functools import lru_cache

import numpy as np
from scipy.stats import norm

from app.data.catalog import tag_meta
from app.engines.regime import regime_at
from app.engines.surrogates import ACTIONABLE, CUTPOINT_SP, OUTPUTS, get_surrogate_card, predict_delta, supported_inputs
from app.state import get_state

logger = logging.getLogger(__name__)

GATE_REASONS = ("spread_gate", "novelty", "insufficient_data", "infeasible", "no_gain", "implausible")

# Physical plausibility of a recipe's predicted effects. A surrogate fitted on few designed moves can extrapolate to
# effects no FCC delivers from a few-degree trim; such a recipe is withheld here, at the source, so the decision list,
# the unit page, the older views and Gemini all report the same thing.
PLAUSIBLE = {"d_power_MW": 3.0, "d_fuel_lb_s": 50.0, "d_yield_pct_feed": 1.5}


def plausibility_issue(r: dict) -> str | None:
    """Plain-words reason if the predicted effects are physically implausible, else None."""
    if abs(r.get("d_power_MW") or 0) > PLAUSIBLE["d_power_MW"]:
        return f"predicted compressor power {r['d_power_MW']:+.1f} MW"
    if abs(r.get("d_fuel_lb_s") or 0) > PLAUSIBLE["d_fuel_lb_s"]:
        return f"predicted furnace fuel {r['d_fuel_lb_s']:+.1f} lb/s"
    big = {k: v for k, v in (r.get("d_yield_pct_feed") or {}).items() if abs(v or 0) > PLAUSIBLE["d_yield_pct_feed"]}
    if big:
        k, v = next(iter(big.items()))
        return f"predicted {k} yield {v:+.1f} % feed"
    return None

# Set points each unit may move (the unit's own, plus the coordinated upstream move the contract example shows).
DEFAULT_UNIT_INPUTS = {
    "unit_1_furnace": ["SP_T_preheat_F"],
    "unit_2_riser": ["SP_T_riser_ROT_F", "SP_LCO_T98"],
    "unit_3_regenerator": ["Fair", "SP_T_riser_ROT_F"],
    "unit_4_fractionator": ["SP_LCO_T98", "SP_HN_T98", "SP_T_riser_ROT_F"],
    "unit_5_condenser": ["MV_reflux_ratio", "SP_T_overhead", "MV_cw_flow"],
    "unit_6_stabiliser": ["MV_reflux_ratio", "SP_T_overhead"],
}
DEFAULT_STEP_LIMITS = {"SP_T_riser_ROT_F": 5.0, "SP_T_preheat_F": 5.0, "SP_LCO_T98": 10.0, "SP_HN_T98": 10.0,
                       "SP_T_overhead": 5.0, "Fair": {"rel": 0.05}, "MV_reflux_ratio": 0.1, "MV_cw_flow": {"rel": 0.05}}
LABELS = {
    "SP_LCO_T98": "LCO T98 set point", "SP_HN_T98": "HN T98 set point", "SP_T_riser_ROT_F": "Riser outlet temperature",
    "SP_T_preheat_F": "Feed preheat set point", "Fair": "Regenerator air", "MV_reflux_ratio": "Overhead reflux ratio",
    "SP_T_overhead": "Overhead temperature set point", "MV_cw_flow": "Condenser cooling-water flow",
    "MV_PA1": "Pumparound 1 duty", "MV_PA2": "Pumparound 2 duty", "MV_PA3": "Pumparound 3 duty",
    "MV_PA4": "Pumparound 4 duty",
}
YIELD_TAGS = {"LCO": "prod_LCO", "HN": "prod_HN", "LN": "prod_LN", "LPG": "prod_LPG"}
SPEC_PROPS = {"LCO": "LCO_T98_F", "HN": "HN_T98_F"}
GRID_POINTS = 7
REFINE_POINTS = 5
RESOLUTION = {"Fair": 0.01, "MV_reflux_ratio": 0.01}


def _cfg():
    st = get_state()
    r = dict(st.s.get("recipe", {}) or {})
    r.setdefault("weights", {"LCO": r.get("w_LCO", 1.0), "HN": r.get("w_HN", 0.8), "LPG": r.get("w_LPG", 0.4)})
    r.setdefault("penalties", {"F5_fuel": r.get("p_F5_fuel", 0.1), "power": r.get("p_power", 0.1),
                               "F_coke": r.get("p_coke", 0.1)})
    r.setdefault("p_on_spec_min", 0.95)
    r.setdefault("novelty_max", 0.7)
    r.setdefault("min_gain_pct_feed", 0.02)
    r.setdefault("unit_inputs", DEFAULT_UNIT_INPUTS)
    r.setdefault("step_limits", DEFAULT_STEP_LIMITS)
    return r


def _label_unit(tag: str) -> tuple[str, str]:
    meta = tag_meta(tag) or {}
    unit = meta.get("unit") or "-"
    if tag == "Fair":
        unit = "lb/s"
    return LABELS.get(tag, meta.get("label", tag)), unit


def _row_at(df, time_min: int) -> tuple[dict, int]:
    t = df["time_min"].to_numpy()
    i = int(np.clip(np.searchsorted(t, time_min, side="right") - 1, 0, len(t) - 1))
    return df.iloc[i].to_dict(), int(t[i])


def _committee_at(st, run_id: str, time_min: int) -> dict:
    """Committee mean / sd / gate per T98 property at time_min (None when the run has no estimate)."""
    v = st.run(run_id)
    out = {}
    if not v:
        return out
    arrs, _ = v
    j = st.index_of(arrs, time_min)
    for prop in SPEC_PROPS.values():
        if f"{prop}|mean" in arrs:
            gate = str(arrs[f"{prop}|gate"][j]) if f"{prop}|gate" in arrs else "PASS"
            out[prop] = {"mean": float(arrs[f"{prop}|mean"][j]), "sd": float(arrs[f"{prop}|sd"][j]), "gate": gate}
    return out


def _bounds(tag: str, cur: float, envelope: dict, cfg: dict) -> tuple[float, float, str, str] | None:
    """IOW ∩ step limit ∩ training envelope around the current value, with the name of the constraint that sets each
    side ("iow" | "step_limit" | "envelope"); None when the box is empty."""
    st = get_state()
    iow = (st.s.get("iow", {}) or {}).get(tag)
    if isinstance(iow, dict) and "rel" in iow:
        lo, hi = cur * (1 - iow["rel"]), cur * (1 + iow["rel"])
    elif isinstance(iow, (list, tuple)) and len(iow) == 2:
        lo, hi = float(iow[0]), float(iow[1])
    else:
        lo, hi = -np.inf, np.inf
    src_lo = src_hi = "iow"
    step = cfg["step_limits"].get(tag, 5.0)
    step = cur * step["rel"] if isinstance(step, dict) else float(step)
    if cur - step > lo:
        lo, src_lo = cur - step, "step_limit"
    if cur + step < hi:
        hi, src_hi = cur + step, "step_limit"
    env = envelope.get(tag)
    if env:
        pad = 0.25 * env["sd"]
        if env["q01"] - pad > lo:
            lo, src_lo = env["q01"] - pad, "envelope"
        if env["q99"] + pad < hi:
            hi, src_hi = env["q99"] + pad, "envelope"
    if hi - lo <= 1e-9:
        return None
    return lo, hi, src_lo, src_hi


def _base_payload(run_id, time_min, unit_id, regime_id) -> dict:
    return {"recipe_id": f"rcp_{run_id}_{unit_id}_{int(time_min):06d}", "run_id": run_id, "time_min": int(time_min),
            "unit_id": unit_id, "regime_id": regime_id, "gate": "WITHHELD", "gate_reason": None, "moves": [],
            "d_yield_pct_feed": {k: 0.0 for k in YIELD_TAGS}, "d_fuel_lb_s": 0.0, "d_power_MW": 0.0, "d_coke_pct": 0.0,
            "p_on_spec": {}, "objective_before": None, "objective_after": None, "predicted": {}, "citations": [],
            "explanation": "", "data_support": {}}


def _withheld(p: dict, reason: str, why: str) -> dict:
    assert reason in GATE_REASONS
    p.update({"gate": "WITHHELD", "gate_reason": reason, "moves": [], "explanation": why})
    return p


class _Evaluator:
    """Vectorised candidate scoring for one (run, time, unit): deltas from the surrogate on top of measured state."""

    def __init__(self, st, run_id, time_min, unit_id, row, regime_id):
        self.st, self.row, self.regime_id, self.cfg = st, row, regime_id, _cfg()
        self.sup = supported_inputs()
        self.card = get_surrogate_card(regime_id)
        self.x0 = np.array([float(row.get(c, 0.0) or 0.0) for c in self.sup])
        self.feed_lb_min = max(float(row.get("feed_flow_lb_s", 0.0) or 0.0), 1e-3) * 60.0
        self.committee = _committee_at(st, run_id, time_min)
        self.out_env = self.card.get("envelope", {}).get("outputs", {})
        self.resid_sd = self.card.get("resid_sd", {})
        self.specs = st.s["specs"]
        self.measured = {o: float(row.get(o, np.nan)) for o in OUTPUTS}

    def _yield_pct(self, lb_min: np.ndarray) -> np.ndarray:
        return lb_min / self.feed_lb_min * 100.0

    def level(self, prop: str) -> tuple[float, float]:
        """Current level and sd for a T98 property: committee if available, else measured + surrogate resid sd."""
        c = self.committee.get(prop)
        if c:
            return c["mean"], max(c["sd"], 0.1)
        return self.measured.get(prop, np.nan), max(self.resid_sd.get(prop, 2.0), 0.1)

    def score(self, X: np.ndarray) -> dict:
        """X: (n, len(sup)) candidate inputs -> arrays of objective, feasibility and effects (deltas vs current)."""
        D = predict_delta(self.regime_id, np.asarray(X, float) - self.x0[None, :])  # surrogate delta per output
        o = {k: OUTPUTS.index(v) for k, v in YIELD_TAGS.items()}
        d_yield = {k: self._yield_pct(D[:, i]) for k, i in o.items()}
        w, pen = self.cfg["weights"], self.cfg["penalties"]
        env = self.card.get("envelope", {}).get("outputs", {})
        sd = lambda t: max(env.get(t, {}).get("sd", 1.0), 1e-6)  # noqa: E731
        d_fuel = D[:, OUTPUTS.index("F5_fuel")]
        d_power = D[:, OUTPUTS.index("power_CAB")] + D[:, OUTPUTS.index("power_WGC")]
        d_coke = self._yield_pct(D[:, OUTPUTS.index("F_coke")])
        gain = sum(w.get(k, 0.0) * d_yield[k] for k in ("LCO", "HN", "LPG"))
        penalty = (pen.get("F5_fuel", 0.1) * d_fuel / sd("F5_fuel")
                   + pen.get("power", 0.1) * d_power / (sd("power_CAB") + sd("power_WGC"))
                   + pen.get("F_coke", 0.1) * d_coke / max(self._yield_pct(np.array([sd("F_coke")]))[0], 1e-6))
        objective = gain - penalty
        # constraints: P(T98 <= spec) on committee level + surrogate delta; outputs inside training envelope
        p_on_spec, feasible = {}, np.ones(len(X), bool)
        for short, prop in SPEC_PROPS.items():
            mu0, sd0 = self.level(prop)
            mu = mu0 + D[:, OUTPUTS.index(prop)]
            spec = float(self.specs.get(prop, {}).get("max", np.inf))
            p = norm.cdf((spec - mu) / sd0)
            p_on_spec[short] = p
            feasible &= p >= self.cfg["p_on_spec_min"]
        for j, out in enumerate(OUTPUTS):
            e = env.get(out)
            if e and np.isfinite(self.measured.get(out, np.nan)):
                pred_level = self.measured[out] + D[:, j]
                pad = 3.0 * max(self.resid_sd.get(out, 0.0), 0.0)
                feasible &= (pred_level >= e["q01"] - pad) & (pred_level <= e["q99"] + pad)
        return {"objective": objective, "feasible": feasible, "d_yield": d_yield, "d_fuel": d_fuel, "d_power": d_power,
                "d_coke": d_coke, "p_on_spec": p_on_spec, "D": D}

    def predicted(self, D_row: np.ndarray) -> dict:
        out = {}
        for prop in SPEC_PROPS.values():
            out[prop] = round(self.level(prop)[0] + float(D_row[OUTPUTS.index(prop)]), 1)
        for tag in ("prod_LCO", "prod_HN", "prod_LPG", "F5_fuel", "conversion_pct"):
            m = self.measured.get(tag)
            if m is not None and np.isfinite(m):
                out[tag] = round(m + float(D_row[OUTPUTS.index(tag)]), 1)
        return out


def _search(ev: _Evaluator, tags: list[str], boxes: dict[str, tuple]) -> tuple[np.ndarray, dict, int]:
    """Deterministic grid over the boxes, then a finer grid around the best point. Returns (x_best, scores_at_best)."""
    idx = [ev.sup.index(t) for t in tags]

    def grid(centre: dict[str, float], half: dict[str, float], n: int) -> np.ndarray:
        axes = []
        for t in tags:
            lo, hi = boxes[t][:2]
            a, b = max(lo, centre[t] - half[t]), min(hi, centre[t] + half[t])
            axes.append(np.linspace(a, b, n))
        X = np.repeat(ev.x0[None, :], n ** len(tags), axis=0)
        for k, combo in enumerate(itertools.product(*axes)):
            X[k, idx] = combo
        return X

    full = {t: (boxes[t][1] - boxes[t][0]) for t in tags}
    centre = {t: (boxes[t][0] + boxes[t][1]) / 2 for t in tags}
    X1 = grid(centre, {t: full[t] / 2 for t in tags}, GRID_POINTS)
    s1 = ev.score(X1)
    best = _argbest(s1)
    if best is None:
        return ev.x0, ev.score(ev.x0[None, :]), 0
    c2 = {t: float(X1[best, ev.sup.index(t)]) for t in tags}
    X2 = grid(c2, {t: full[t] / (GRID_POINTS - 1) for t in tags}, REFINE_POINTS)
    s2 = ev.score(X2)
    b2 = _argbest(s2)
    if b2 is not None and s2["objective"][b2] >= s1["objective"][best]:
        return X2[b2], {k: (v[b2] if isinstance(v, np.ndarray) else {kk: vv[b2] for kk, vv in v.items()})
                        for k, v in s2.items()}, len(X1) + len(X2)
    return X1[best], {k: (v[best] if isinstance(v, np.ndarray) else {kk: vv[best] for kk, vv in v.items()})
                      for k, v in s1.items()}, len(X1) + len(X2)


def _argbest(s: dict) -> int | None:
    obj = np.where(s["feasible"], s["objective"], -np.inf)
    if not np.isfinite(obj).any():
        return None
    return int(np.argmax(obj))


@lru_cache(maxsize=4096)
def recipe_for(run_id: str, time_min: int, unit_id: str) -> dict:
    st = get_state()
    df = st.catalog.load(run_id)
    reg = regime_at(run_id, time_min) if not df.empty else {}
    regime_id = reg.get("regime_id", "R3")
    p = _base_payload(run_id, time_min, unit_id, regime_id)
    cfg = _cfg()
    if df.empty:
        return _withheld(p, "insufficient_data", "No simulator data for this run.")
    row, t_row = _row_at(df, time_min)
    sup = supported_inputs()
    wanted = [t for t in cfg["unit_inputs"].get(unit_id, []) if t in ACTIONABLE]
    supported = [t for t in wanted if t in sup and t in row]
    unsupported = [t for t in wanted if t not in sup]
    card_src = get_surrogate_card(regime_id).get("source", {})
    p["data_support"] = {"searched": supported, "unsupported": unsupported,
                         "model_source": {t: card_src.get(t, "") for t in supported},
                         "note": ("" if not unsupported else
                                  f"{', '.join(unsupported)}: no designed moves in the training batch (constant or only "
                                  f"drifting), so no model can quantify their effect; the crude_campaign scenario will "
                                  f"exercise them.")}
    p["citations"] = st.citations_for("LCO_T98_F", "adjust")

    novelty = float(reg.get("novelty", 0.0) or 0.0)
    if novelty > cfg["novelty_max"]:
        return _withheld(p, "novelty", f"Novelty {novelty:.2f} > {cfg['novelty_max']}: the plant is outside every "
                                       f"known crude regime, so the regime surrogate cannot be trusted for a recipe.")
    if len(supported) < 2:
        return _withheld(p, "insufficient_data",
                         f"Only {len(supported)} of the unit's set points ({', '.join(wanted) or 'none'}) carry "
                         f"information in the training data; a coordinated recipe needs at least two. "
                         + p["data_support"]["note"])
    ev = _Evaluator(st, run_id, time_min, unit_id, row, regime_id)
    if any(t in CUTPOINT_SP for t in supported):
        gates = [c["gate"] for c in ev.committee.values()]
        if gates and any(g == "WITHHELD" for g in gates):
            return _withheld(p, "spread_gate", "The soft-sensor committee is WITHHELD at this minute (distribution "
                                               "spread too wide), so P(on-spec) cannot be certified for a cut-point move.")
    env_in = ev.card.get("envelope", {}).get("inputs", {})
    boxes, dropped = {}, []
    for t in supported:
        b = _bounds(t, float(row[t]), env_in, cfg)
        (boxes.__setitem__(t, b) if b else dropped.append(t))
    tags = list(boxes)
    if len(tags) < 2:
        return _withheld(p, "infeasible", f"No admissible move box for {', '.join(dropped)} (IOW ∩ step limit ∩ "
                                          f"training envelope is empty at the current operating point).")
    x_best, s, n_eval = _search(ev, tags, boxes)
    base = ev.score(ev.x0[None, :])
    if not bool(s["feasible"]):
        return _withheld(p, "infeasible", "No candidate inside the limits keeps P(on-spec) >= "
                                          f"{cfg['p_on_spec_min']:.0%} for LCO and HN with every output inside "
                                          "its training envelope.")
    gain = float(s["objective"]) - float(base["objective"][0])
    if gain < cfg["min_gain_pct_feed"]:
        p.update({"objective_before": round(float(base["objective"][0]), 3), "objective_after": round(float(s["objective"]), 3),
                  "p_on_spec": {k: round(float(v[0]), 3) for k, v in base["p_on_spec"].items()}})
        return _withheld(p, "no_gain", f"Current set points are already within {cfg['min_gain_pct_feed']} % feed of the "
                                       f"best feasible recipe for regime {regime_id}; hold.")
    moves = []
    for t in tags:
        cur, rec = float(row[t]), float(x_best[ev.sup.index(t)])
        res = RESOLUTION.get(t, 0.1)
        lo, hi, src_lo, src_hi = boxes[t]
        rec = float(np.clip(round(rec / res) * res, lo, hi))
        label, unit = _label_unit(t)
        iow = (st.s.get("iow", {}) or {}).get(t)
        lim_lo, lim_hi = (iow if isinstance(iow, (list, tuple)) else (lo, hi))
        tol = max(res, 1e-6)
        binding = src_lo if rec <= lo + tol else src_hi if rec >= hi - tol else "interior"
        moves.append({"sp_tag": t, "label": label, "current": round(cur, 2), "recommended": round(rec, 2),
                      "delta": round(rec - cur, 2), "unit": unit, "limit_lo": round(float(lim_lo), 2),
                      "limit_hi": round(float(lim_hi), 2), "box_lo": round(lo, 2), "box_hi": round(hi, 2),
                      "binding": binding})
    moved = [m for m in moves if abs(m["delta"]) > 0]
    dy = {k: round(float(v), 3) for k, v in s["d_yield"].items()}
    top = max(dy, key=lambda k: abs(dy[k]))
    bound_note = ", ".join(f"{m['label']} at {m['binding'].replace('_', ' ')}" for m in moved if m["binding"] != "interior")
    pos = {k: round(float(v), 3) for k, v in s["p_on_spec"].items()}
    p.update({
        "gate": "ISSUED", "gate_reason": None, "moves": moves,
        "d_yield_pct_feed": dy, "d_fuel_lb_s": round(float(s["d_fuel"]), 3), "d_power_MW": round(float(s["d_power"]), 3),
        "d_coke_pct": round(float(s["d_coke"]), 3),
        "p_on_spec": pos,
        "objective_before": round(float(base["objective"][0]), 3), "objective_after": round(float(s["objective"]), 3),
        "predicted": ev.predicted(s["D"]),
        "explanation": (f"Regime {regime_id} (novelty {novelty:.2f}): move "
                        + ", ".join(f"{m['label']} {m['current']:g} → {m['recommended']:g} {m['unit']}" for m in moved)
                        + f". Expected {top} yield {dy[top]:+.2f} % feed with P(on-spec) LCO "
                        f"{pos.get('LCO', 0):.0%} / HN {pos.get('HN', 0):.0%}; "
                        f"{n_eval} candidates evaluated inside IOW, step and training-envelope limits"
                        + (f" ({bound_note})." if bound_note else ".")),
        "n_candidates": n_eval, "row_time_min": t_row,
    })
    issue = plausibility_issue(p)
    if issue:
        # drop the extrapolated effects so no reader can quote them; keep only the reason
        p.update({"d_yield_pct_feed": {k: 0.0 for k in YIELD_TAGS}, "d_fuel_lb_s": 0.0, "d_power_MW": 0.0,
                  "d_coke_pct": 0.0, "predicted": {}, "p_on_spec": {}, "implausible_detail": issue})
        return _withheld(p, "implausible", f"The best candidate's {issue} is physically implausible for a few-degree "
                                           f"trim: the model is extrapolating beyond the moves in its training data. "
                                           f"No recipe until the lever-move batch is in and the model is refit.")
    return p


def whatif(run_id: str, time_min: int, unit_id: str, moves: dict) -> dict:
    st = get_state()
    df = st.catalog.load(run_id)
    if df.empty:
        return {"predicted": {}, "d_yield_pct_feed": {}, "p_on_spec": {}, "within_limits": False, "limits": {}}
    row, _ = _row_at(df, time_min)
    reg = regime_at(run_id, time_min)
    ev = _Evaluator(st, run_id, time_min, unit_id, row, reg.get("regime_id", "R3"))
    cfg = _cfg()
    env_in = ev.card.get("envelope", {}).get("inputs", {})
    x = ev.x0.copy()
    limits, within = {}, True
    for t, v in (moves or {}).items():
        if t not in ev.sup:
            limits[t] = {"supported": False}
            within = False
            continue
        b = _bounds(t, float(row.get(t, 0.0) or 0.0), env_in, cfg)
        limits[t] = {"supported": True, "box_lo": None if not b else round(b[0], 2),
                     "box_hi": None if not b else round(b[1], 2)}
        if not b or not (b[0] - 1e-9 <= float(v) <= b[1] + 1e-9):
            within = False
        x[ev.sup.index(t)] = float(v)
    s = ev.score(x[None, :])
    return {"predicted": ev.predicted(s["D"][0]),
            "d_yield_pct_feed": {k: round(float(v[0]), 3) for k, v in s["d_yield"].items()},
            "p_on_spec": {k: round(float(v[0]), 3) for k, v in s["p_on_spec"].items()},
            "within_limits": bool(within and s["feasible"][0]), "limits": limits,
            "d_fuel_lb_s": round(float(s["d_fuel"][0]), 3), "d_power_MW": round(float(s["d_power"][0]), 3),
            "d_coke_pct": round(float(s["d_coke"][0]), 3), "objective": round(float(s["objective"][0]), 3)}
