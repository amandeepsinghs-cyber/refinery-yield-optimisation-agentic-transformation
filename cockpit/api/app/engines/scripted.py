"""Scripted outcomes for the demo (owner, 2 Oct 13:50: "keep the input, mock the output").

1.5 months of simulated data with crude changes cannot honestly train a crude classifier plus per-crude lever
regressions. For the pitch, the inputs stay real (live simulator tags); the outcomes of the decisions that need lever
data — D3 (recipe for the new crude), D5 (regenerator air), D6 (furnace preheat), D7 (condenser) — are scripted from
those live values with fixed, plant-plausible gains. Every scripted decision carries `scripted: True` and the screen
says "scripted outcomes". D1 / D2 / D9 (cut point, trust, lab sample) stay on the real soft-sensor engine.

Rule per decision: the drift-watch agent reports the target `dev` away from expected. Goal: target back within
±0.8·|dev| of expected, with a spread σ = 0.4·|dev|. Move = −dev / gain, rounded to the lever step, clipped to the SOP
step and the lever's operating window. Chance before ≈ 31 %, after ≈ 98 % — consistent on every screen.
"""
from __future__ import annotations

import math
import os
import re

from app.engines.recipe import _label_unit
from app.state import get_state

# lever, target, gain (target units per lever unit), lever step, SOP max step, SOP text, model text
SPEC = {
    # Real-world check (3 Oct, owner): only recommend settings operators actually move day to day. Feed preheat is
    # moved to set catalyst-to-oil and regenerator temperature for the crude — not to chase its own outlet reading.
    "D6": dict(lever="SP_T_preheat_F", target="T2_preheat_F", gain=1.0, step=0.5, step_max=5.0, sigma_min=0.4,
               sop="SOP-FURN-002: preheat set point at most 5 °F per step, 20 min between steps; stay inside the "
                   "feed-nozzle (licensor) temperature limit.",
               model="Feed-preheat response model for this crude: lower preheat raises catalyst circulation (higher "
                     "catalyst-to-oil); the furnace outlet reaches the new set point within 15 min. In a real unit "
                     "this also lifts conversion and cools the regenerator — the simulator's regenerator controller "
                     "holds its temperature, so that part is plant practice, not a model result",
               goal="Chance the preheat sits at this crude's target (catalyst-to-oil and regenerator temperature)"),
    "D5": dict(lever="Fair", target="dT_cyc_reg_F", gain=40.0, step=0.01, step_max=0.08, sigma_min=0.3,
               sop="SOP-REG-004: air rate at most 3 % per step, 15 min between steps; flue-gas O₂ stays in its window.",
               model="Regenerator response model for this crude: cyclone ΔT (afterburn) moves 0.4 °F per 0.01 air "
                     "step; excess O₂ follows the air rate"),
    # Cooling-water flow is the symptom (a fouled condenser needs more water for the same load) and a limit — the
    # condenser runs at fixed cooling duty, so the cockpit never recommends changing it. The lever is the overhead
    # temperature target, which operators do move.
    "D7": dict(lever="SP_T_overhead", target="MV_cw_flow", gain=-2.6, step=0.5, step_max=3.0, sigma_min=1.0,
               sop="SOP-GAS-006: overhead temperature set point at most 3 °F per step; watch receiver pressure and "
                   "the gasoline end point. Cooling water stays at its fixed duty.",
               model="Condenser response model: each 1 °F on the overhead temperature target takes 2.6 lb/s off the "
                     "condenser's cooling-water demand. Cooling water itself is not adjusted (fixed duty)",
               goal="Chance the condenser is back inside its fixed cooling duty"),
    "D3": dict(lever="SP_T_riser_ROT_F", target="conversion_pct", gain=0.12, step=0.5, step_max=5.0, sigma_min=0.1,
               sop="SOP-RX-001: riser outlet T at most 5 °F per step, 30 min between steps; cut points follow 1 : 1.",
               model="Crude-specific response model: conversion +0.12 % per °F of riser outlet T",
               dev=-0.4, extra=(("SP_LCO_T98", -1.0), ("SP_HN_T98", 1.0))),
}
_UNIT = {"MV_cw_flow": "lb/s", "conversion_pct": "%"}
_SHORT = {"T2_preheat_F": "preheat outlet", "dT_cyc_reg_F": "cyclone ΔT", "MV_cw_flow": "condenser cooling demand",
          "conversion_pct": "conversion"}
_DEV = re.compile(r"([-+−]?\d+(?:\.\d+)?)\s*\S*\s*(above|below) expected")


def enabled() -> bool:
    env = os.environ.get("FCC_SCRIPTED")
    if env is not None:
        return env not in ("0", "false", "no")
    return bool((get_state().s.get("demo", {}) or {}).get("scripted_outcomes", True))


def _phi(z: float) -> float:
    return 0.5 * (1 + math.erf(z / math.sqrt(2)))


def _num(row: dict, tag: str) -> float | None:
    try:
        v = float(row.get(tag))
        return v if math.isfinite(v) else None
    except (TypeError, ValueError):
        return None


def _dev(d: dict, spec: dict) -> float | None:
    if "dev" in spec:
        return float(spec["dev"])
    m = _DEV.search(((d.get("observed") or {}).get("line")) or d.get("headline") or "")
    if not m:
        return None
    v = abs(float(m.group(1).replace("−", "-")))
    return v if m.group(2) == "above" else -v


def _round(x: float, step: float) -> float:
    return round(round(x / step) * step, 6)


def _script(d: dict, row: dict) -> dict:
    spec = SPEC[d["type"]]
    lever, target = spec["lever"], spec["target"]
    cur, mu = _num(row, lever), _num(row, target)
    dev = _dev(d, spec)
    if cur is None or mu is None or not dev:
        return d
    iow = get_state().s.get("iow", {}) or {}
    w = iow.get(lever)
    lo_w, hi_w = (float(w[0]), float(w[1])) if isinstance(w, (list, tuple)) and len(w) == 2 else (-math.inf, math.inf)
    g, step, smax = spec["gain"], spec["step"], spec["step_max"]
    delta = _round(max(-smax, min(smax, -dev / g)), step) or math.copysign(step, -dev / g)
    to = max(lo_w, min(hi_w, cur + delta))
    delta = round(to - cur, 4)
    expected = mu - dev
    tol, sigma = 0.8 * abs(dev), max(0.4 * abs(dev), spec["sigma_min"])
    mu_after = mu + g * delta
    hi_side = dev > 0
    lim = expected + tol if hi_side else expected - tol
    pb = _phi(((lim - mu) if hi_side else (mu - lim)) / sigma)
    pa = _phi(((lim - mu_after) if hi_side else (mu_after - lim)) / sigma)
    t_label, t_unit = _label_unit(target)
    if t_label == target:
        t_label = ((d.get("observed") or {}).get("label")) or _SHORT.get(target, target)
    t_unit = _UNIT.get(target, t_unit)
    l_label, l_unit = _label_unit(lever)
    nd = 2 if step < 0.1 else 1
    moves = [{"tag": lever, "label": l_label, "from": round(cur, nd), "to": round(to, nd), "delta": round(delta, nd),
              "unit": l_unit}]
    for tag, dx in spec.get("extra", ()):
        c = _num(row, tag)
        if c is not None:
            lab, un = _label_unit(tag)
            moves.append({"tag": tag, "label": lab, "from": round(c, 1), "to": round(c + dx, 1), "delta": dx, "unit": un})
    sign = lambda x: f"{'+' if x >= 0 else '−'}{abs(x):.{nd}f}"  # noqa: E731
    verb = "Raise" if delta > 0 else "Lower"
    head = f"{verb} {l_label[0].lower() + l_label[1:]} {sign(delta)} {l_unit} ({cur:.{nd}f} → {to:.{nd}f})"
    if len(moves) > 1:
        head = "Recipe for this crude: " + "; ".join(f"{m['label']} {sign(m['delta'])} {m['unit']}" for m in moves)
    goal = spec.get("goal") or f"Chance {_SHORT.get(target, t_label.lower())} is back in its band"
    w90 = 2 * 1.645 * sigma
    gates = [
        {"id": "spread", "name": "spread W90", "op": "≤", "pass": True, "value": round(w90, 2),
         "limit": round(max(w90 * 1.6, 1.0), 2), "unit": t_unit},
        {"id": "S1", "name": "models agree", "op": "≤", "pass": True, "value": 0.31, "limit": 0.5},
        {"id": "S2", "name": "inputs inside training range", "op": "≤", "pass": True, "value": 0.22, "limit": 1.0},
        {"id": "iow", "name": "lever stays inside its window", "op": "≤", "pass": True,
         "value": round(abs(delta), nd), "limit": round(min(smax, (hi_w - lo_w) / 2) if math.isfinite(hi_w) else smax, nd),
         "unit": l_unit},
    ]
    d.update({
        "status": "open", "scripted": True, "withheld_reason": None, "withheld_text": None, "headline": head,
        "urgency": {**d["urgency"], "decide_by_label": d["urgency"].get("decide_by_label")},
        "observed": {**(d.get("observed") or {}), "tag": target, "label": t_label,
                     "line": (d.get("observed") or {}).get("line") or f"{t_label} {sign(dev)} {t_unit} away from the crude target"},
        "diagnosed": {"text": f"{t_label} is {sign(dev)} {t_unit} from expected for this crude. {spec['model']}. "
                              f"{l_label} {sign(delta)} {l_unit} brings it back: chance in band {pb:.0%} → {pa:.0%}. "
                              "Advisory only; operator decides.", "trust": "GREEN", "conservative": False},
        "proposed": {"moves": moves, "alternative": f"Hold — {d['urgency'].get('consequence') or 'the drift continues'}",
                     "sop": spec["sop"]},
        "predicted": {"mu_before": round(mu, 3), "mu_after": round(mu_after, 3), "sigma": round(sigma, 3),
                      "p_on_spec_before": round(pb, 3), "p_on_spec_after": round(pa, 3), "w90": round(w90, 2),
                      "spec_max": round(lim, 3) if hi_side else None, "spec_min": None if hi_side else round(lim, 3),
                      "margin_after": round(abs(lim - mu_after), 3), "ripple": [], "gain": g, "unit": t_unit,
                      "step": step, "step_max": smax, "goal_label": goal, "model": spec["model"]},
        "gates": gates,
    })
    since = (d.get("observed") or {}).get("since_label")
    steps = [{"kind": "agent", "name": "Drift-watch agent", "did": f"Flagged {t_label} moving away from expected at {since}"}] if since else []
    steps += [
        {"kind": "ml", "name": "Crude-regime model", "did": "Recognises the crude now running and picks its response model"},
        {"kind": "ml", "name": "Response model", "did": spec["model"]},
        {"kind": "check", "name": "Trust checks", "did": f"{len(gates)} of {len(gates)} pass (spread, models agree, inputs in range, lever window)"},
        {"kind": "optimiser", "name": "Set-point search", "did": f"Smallest move that lifts the chance in band from {pb:.0%} to {pa:.0%}, inside SOP step limits"},
        {"kind": "genai", "name": "Gemini", "did": "Explains the decision in English, Hinglish or Hindi with the SOP behind it; answers what happens if you hold"},
    ]
    d["enabled_by"] = steps
    return d


def apply(decisions: list[dict], row: dict) -> list[dict]:
    if not enabled() or not row:
        return decisions
    # The recipe stands on the cut-point estimate: if the soft-sensor committee is too uncertain to advise the cut
    # point (D2 withheld on spread), the scripted recipe is not released either — the honesty scene (run s144) holds.
    d2_withheld = any(d.get("type") == "D2" and d.get("status") == "withheld" for d in decisions)
    out = []
    for d in decisions:
        if d.get("type") == "D3" and d2_withheld:
            out.append(d)
            continue
        if d.get("type") in SPEC and d.get("status") in ("withheld", "watch") and not d.get("action"):
            d = _script(d, row)
        out.append(d)
    return out


# ------------------------------------------------------------------------------------------------ crude classifier
DETECT_LAG_MIN = 12  # scripted: the unit's behaviour confirms the new crude 12 min after the switch completes


def regime(reg: dict) -> dict:
    """Scripted crude classification (VN10/VN11 step 1): the classifier names the crude the lab assay declares, with
    high confidence once the switch is complete, and ramps from the old crude to the new one during the transition."""
    if not enabled() or not reg or not reg.get("declared_regime_id"):
        return reg
    from app.engines.regime import REGIME_IDS, regime_by_id  # local: avoid an import cycle

    t, new = int(reg["time_min"]), reg["declared_regime_id"]
    segs = [s for s in reg.get("segments") or [] if s["t_start_min"] <= t]
    cur = segs[-1] if segs else None
    prev = segs[-2]["regime_id"] if len(segs) > 1 else None
    end = (cur or {}).get("transition_end_min") or (cur or {}).get("t_start_min")
    start = (cur or {}).get("transition_start_min")
    hi = 0.93
    if prev and prev != new and end is not None and t < end + DETECT_LAG_MIN:
        s0 = start if start is not None else end
        frac = min(1.0, max(0.0, (t - s0) / max(1, end + DETECT_LAG_MIN - s0)))
        p_new = 0.08 + (hi - 0.08) * frac
        p = {r: 0.0 for r in REGIME_IDS}
        p[new], p[prev] = p_new, (1 - p_new) * 0.9
        rest = [r for r in REGIME_IDS if r not in (new, prev)]
        for r in rest:
            p[r] = (1 - p_new) * 0.1 / max(1, len(rest))
        det = new if p_new >= p[prev] else prev
        dvd = "match" if det == new else "lagging"
        det_at, delay = None, None
    else:
        p = {r: (hi if r == new else (1 - hi) / (len(REGIME_IDS) - 1)) for r in REGIME_IDS}
        det, dvd = new, "match"
        det_at = int(end + DETECT_LAG_MIN) if prev and end is not None else None
        delay = DETECT_LAG_MIN if det_at is not None else None
    out = dict(reg)
    out.update({"regime_id": det, "regime_label": regime_by_id(det).label, "p_regime": {k: round(v, 3) for k, v in p.items()},
                "declared_vs_detected": dvd, "detected_at_min": det_at, "detection_delay_min": delay,
                "novelty": min(float(reg.get("novelty") or 0), 0.4), "scripted": True})
    return out
