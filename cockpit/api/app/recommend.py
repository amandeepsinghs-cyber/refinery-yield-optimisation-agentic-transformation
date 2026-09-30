"""Cut-point recommendation engine (SDD §5.11, SDD-REC-01..06). Technical effect only; no monetary values.

Advisory only: nothing here writes to any control system."""
from __future__ import annotations

import numpy as np

from .config import PROP_SHORT
from .dist import mix_cdf


def estimate_gain_and_yield(frames: list, prop: str, s) -> dict:
    """Estimate response gain g = dT98/dSP and yield_sens = d prod / d T98 from set-point-move windows
    (event_code 5 for LCO, 6 for HN, window extended by 60 min after the ramp). Falls back to documented defaults."""
    code = 5 if prop == "LCO_T98_F" else 6
    sp_col = "SP_LCO_T98" if prop == "LCO_T98_F" else "SP_HN_T98"
    prod_col = "prod_LCO" if prop == "LCO_T98_F" else "prod_HN"
    rows_sp, rows_y, rows_p = [], [], []
    for df, codes in frames:
        if sp_col not in df.columns:
            continue
        idx = np.where(codes == code)[0]
        if len(idx) == 0:
            continue
        mask = np.zeros(len(df), bool)
        starts = idx[np.r_[True, np.diff(idx) > 1]]
        ends = idx[np.r_[np.diff(idx) > 1, True]]
        for a, b in zip(starts, ends):
            mask[max(0, a - 5): min(len(df), b + 60)] = True
        rows_sp.append(df[sp_col].to_numpy()[mask])
        rows_y.append(df[prop].to_numpy()[mask])
        rows_p.append(df[prod_col].to_numpy()[mask])
    rc = s["recommend"]
    res = {"gain": float(rc["gain_default"]), "gain_source": "default (no set-point-move windows)",
           "yield_sens": float(rc["yield_sens_default"]), "yield_source": "default (no set-point-move windows)",
           "n_window_minutes": 0}
    if rows_sp:
        sp, y, p = np.concatenate(rows_sp), np.concatenate(rows_y), np.concatenate(rows_p)
        ok = np.isfinite(sp) & np.isfinite(y) & np.isfinite(p)
        sp, y, p = sp[ok], y[ok], p[ok]
        res["n_window_minutes"] = int(len(sp))
        if len(sp) >= 20 and np.std(sp) > 0.5:
            g = float(np.polyfit(sp, y, 1)[0])
            if 0.1 < g < 3.0:
                res["gain"], res["gain_source"] = round(g, 4), f"OLS over {len(sp)} event-{code} window minutes"
        if len(y) >= 20 and np.std(y) > 0.5:
            ys = float(np.polyfit(y, p, 1)[0])
            res["yield_sens"], res["yield_source"] = round(ys, 4), f"OLS {prod_col} vs {prop} over event-{code} windows"
    return res


def search_move(m, s_, w, spec_max, margin, gain, max_move, step, p_min):
    """SDD-REC-03: largest delta with P(y + g*delta <= spec - margin) >= p_min. m,s_,w are (J,) for one minute."""
    deltas = np.round(np.arange(-max_move, max_move + 1e-9, step), 3)
    thr = spec_max - margin
    x = thr - gain * deltas                          # P(y' <= thr) = F(thr - g*delta)
    M = np.repeat(m[None, :], len(deltas), 0)
    S = np.repeat(s_[None, :], len(deltas), 0)
    W = np.repeat(w[None, :], len(deltas), 0)
    p = mix_cdf(x, M, S, W)
    feas = np.where(p >= p_min)[0]
    if len(feas):
        k = feas[-1]
        return float(deltas[k]), float(p[k]), True
    return float(deltas[0]), float(p[0]), False


def build_recommendation(run_id, t, prop, est, sp_before, feed_lb_min, gainfo, s, citations) -> dict | None:
    """est: dict with m,s,w (J,), q95, w90, gate (status, reason, message), trust level. Returns card or None."""
    rc = s["recommend"]
    rec_id = f"r-{run_id}-{PROP_SHORT[prop]}-{t:04d}"
    spec, margin = s.spec_max(prop), s.spec_margin(prop)
    gate = {"status": est["gate_status"], "reason": est["gate_reason"], "message": est["gate_message"],
            "w90": round(float(est["w90"]), 2)}
    base = {"rec_id": rec_id, "run_id": run_id, "time_min": int(t), "property": prop,
            "sp_before": None if sp_before is None else round(float(sp_before), 2),
            "margin_before_F": round(spec - float(est["q95"]), 2), "trust": est["trust"], "gate": gate,
            "citations": citations, "valid_until_min": int(t + rc["valid_min"])}
    if est["gate_status"] == "WITHHELD":        # SDD-REC-06
        return {**base, "status": "WITHHELD", "action": "HOLD", "delta_F": 0.0, "sp_after": base["sp_before"],
                "p_on_spec_after": round(float(est["p_on_spec"]), 4), "margin_after_F": base["margin_before_F"],
                "yield_shift_pct": 0.0, "conservative": False,
                "rationale": est["gate_message"] + " Advisory only."}
    if est["trust"] == "RED":                   # SDD-REC-02 / DECISIONS T5: no recommendation on RED
        return None
    conservative = est["trust"] == "AMBER"
    step = float(rc["step_F"])
    p_min = float(rc["p_on_spec_min"])
    max_move = float(rc["max_move_F"])
    g = gainfo["gain"]
    short = PROP_SHORT[prop]
    # GREEN full move: the largest feasible delta within ±max_move_F on the step_F grid
    delta_full, p_full, feasible = search_move(est["m"], est["s"], est["w"], spec, margin, g, max_move, step, p_min)
    parts = [f"Mixture q95 {est['q95']:.1f} °F vs {short} T98 spec {spec:.0f} °F (margin {base['margin_before_F']:.1f} °F).",
             f"W90 {est['w90']:.1f} °F within the {s.w90_max:.1f} °F limit; trust {est['trust']}."]
    if not feasible:
        # No candidate move reaches P(on-spec) >= p_min: HOLD, not actionable (never an OPEN card below p_min).
        parts.append(f"No set-point move within ±{max_move:.1f} °F reaches P(on-spec) ≥ {p_min:.2f} "
                     f"(best {p_full:.3f}); hold and request a lab sample. Advisory only; operator decides.")
        return {**base, "status": "HOLD", "action": "HOLD", "delta_F": 0.0, "sp_after": base["sp_before"],
                "p_on_spec_after": round(float(est["p_on_spec"]), 4), "margin_after_F": base["margin_before_F"],
                "yield_shift_pct": 0.0, "conservative": conservative, "rationale": " ".join(parts)}
    delta, p_after = delta_full, p_full
    halved = False
    if conservative and delta_full > 0:
        # AMBER half move, rounded to step_F toward zero. A smaller raise only increases P(on-spec).
        # Lowering moves are not halved: they are the smallest move that restores P(on-spec) >= p_min.
        delta = float(np.floor(delta_full / 2.0 / step + 1e-9) * step)
        p_after = float(mix_cdf(np.array([spec - margin - g * delta]), est["m"][None, :], est["s"][None, :],
                                est["w"][None, :])[0])
        halved = True
    action = "RAISE" if delta >= step - 1e-9 else ("LOWER" if delta <= -step + 1e-9 else "HOLD")
    if action == "HOLD":
        delta = 0.0
    margin_after = base["margin_before_F"] - g * delta
    ys = gainfo["yield_sens"]
    yield_pct = 100.0 * delta * g * ys / feed_lb_min if feed_lb_min else 0.0
    sp_after = None if sp_before is None else round(float(sp_before) + delta, 2)
    if action == "HOLD":
        parts.append(f"No set-point move improves the margin while keeping P(on-spec) ≥ {p_min:.2f}; hold.")
    else:
        parts.append(f"{action.title()} the {short} T98 set point by {abs(delta):.1f} °F (gain {g:.2f} °F/°F): "
                     f"P(on-spec) after {p_after:.3f}, margin after {margin_after:.1f} °F.")
    if conservative:
        parts.append(f"Conservative: trust AMBER, half move ({delta_full:+.1f} → {delta:+.1f} °F)." if halved else
                     "Trust AMBER: lowering move not halved (needed to keep P(on-spec) ≥ "
                     f"{p_min:.2f})." if delta_full < 0 else "Trust AMBER.")
    parts.append("Advisory only; operator decides.")
    return {**base, "status": "OPEN", "action": action, "delta_F": round(delta, 2), "sp_after": sp_after,
            "p_on_spec_after": round(p_after, 4), "margin_after_F": round(margin_after, 2),
            "yield_shift_pct": round(yield_pct, 3), "conservative": conservative, "rationale": " ".join(parts)}
