"""Refinery Systems Agent + Level-0 assembly (BUILD_PLAN_v3 §3 agents, API_CONTRACT_v3 §6, SDD-L0-01).

Two responsibilities, both advisory and in engineering units only (SDD-NFR-11):

1. **Consequence rules** — a small, explicit table over the three plant loops (catalyst, heat, hydrocarbon) that turns an
   E3 event on one unit into the downstream consequence line the plant head sees in "Needs attention"
   (``"PA3 saturates in ~90 min; LCO yield −0.4 % feed if unadjusted"``). Rules are keyed on
   ``(unit_id, tag, direction)`` where direction is the sign of the residual; the horizon scales with how far the
   residual sits outside σ so a 5σ breach reads sooner than a 3σ one.

2. **L0 fields** — ``kpi_vs_plan`` per unit (primary tag vs set point or expected, tolerance from
   ``config.yaml → plan_tolerances``), unit counts (``events_open``, ``flags``, ``decisions_open``), the ranked
   ``needs_attention`` list, a compact ``timeline`` and the ``plant`` header strip (shift, clock, mass closure, counts).

Everything here is derived from the event store and detection series; nothing is typed in.
"""
from __future__ import annotations

import math
from datetime import datetime
from typing import Any

import numpy as np

from app.engines.detect import E3_KINDS, TAG_LABEL, _unit_of, detection_series, open_breach
from app.engines.surrogates import UNIT_PRIMARY_TAGS
from app.state import get_state

# ----------------------------------------------------------------------------------------------- vocabulary
UNIT_SHORT = {"unit_1_furnace": "Furnace", "unit_2_riser": "Riser", "unit_3_regenerator": "Regenerator",
              "unit_4_fractionator": "Fractionator", "unit_5_condenser": "Overhead condenser",
              "unit_6_stabiliser": "Stabiliser"}
PLAN_SP = {"LCO_T98_F": "SP_LCO_T98", "HN_T98_F": "SP_HN_T98", "T2_preheat_F": "SP_T_preheat_F", "Treg_F": "SP_T_reg_F"}
# Engineering tolerance around plan for the OK / WATCH / ACT pill when config.yaml has no `plan_tolerances` entry.
DEFAULT_TOL = {"T2_preheat_F": 5.0, "conversion_pct": 1.0, "dT_cyc_reg_F": 10.0, "Treg_F": 10.0, "LCO_T98_F": 3.0,
               "HN_T98_F": 3.0, "MV_cw_flow": 15.0, "eff_C5": 1.5}
UNIT_FALLBACK = {"MV_cw_flow": "lb/s"}  # tag metadata reports "-" for this one
SEV_RANK = {"alarm": 0, "warn": 1, "info": 2}
SPARK_WINDOW_MIN, SPARK_STEP = 240, 2   # L0 tile sparkline: last 4 h at 2-min step (SDD-L0-02 amended)
MAX_ATTENTION = 5
MAX_LABEL = 60

# ----------------------------------------------------------------------------------------------- consequence rules
# (unit_id, tag, direction) -> (loop, downstream unit, consequence template). Templates may use {h} (horizon, min)
# and {v} (|residual| with unit). Direction: "up" = measured above expected, "down" = below, "any" = either.
CONSEQUENCE_RULES: dict[tuple[str, str, str], tuple[str, str, str]] = {
    # --- heat loop ---------------------------------------------------------------------------------------------------
    ("unit_1_furnace", "T2_preheat_F", "down"): (
        "heat", "unit_2_riser", "Riser inlet enthalpy falls; ROT controller raises catalyst circulation in ~{h} min and "
                                "regenerator afterburn margin narrows"),
    ("unit_1_furnace", "T2_preheat_F", "up"): (
        "heat", "unit_1_furnace", "Fired duty above plan; fuel {v} over plan persists and tube-skin coking rate rises if "
                                  "preheat is not trimmed within ~{h} min"),
    ("unit_1_furnace", "fluegas_CO_ppm", "up"): (
        "heat", "unit_1_furnace", "CO breakthrough: incomplete combustion wastes fuel now and risks afterburner trip in "
                                  "~{h} min if O2 trim is not raised"),
    ("unit_1_furnace", "fluegas_O2_pct", "up"): (
        "heat", "unit_1_furnace", "Excess air carries heat up the stack; preheat duty lost ≈ {v} unless O2 is trimmed"),
    # --- catalyst loop -----------------------------------------------------------------------------------------------
    ("unit_2_riser", "conversion_pct", "down"): (
        "catalyst", "unit_4_fractionator", "Less cracking: slurry draw rises and LCO/HN yield falls within ~{h} min; "
                                           "fractionator bottoms level follows"),
    ("unit_2_riser", "conversion_pct", "up"): (
        "catalyst", "unit_3_regenerator", "Over-cracking: coke make rises, regenerator dense-bed T climbs and wet-gas "
                                          "compressor loads up within ~{h} min"),
    ("unit_2_riser", "dP_reactor_frac", "up"): (
        "hydrocarbon", "unit_4_fractionator", "Hydraulic ΔP trending to flooding; fractionator tray efficiency drops "
                                              "and T98 control degrades in ~{h} min"),
    ("unit_3_regenerator", "dT_cyc_reg_F", "up"): (
        "catalyst", "unit_3_regenerator", "Afterburn: cyclone metal temperature margin erodes; sustained CO burn in the "
                                          "dilute phase breaches IOW in ~{h} min unless air is rebalanced"),
    ("unit_3_regenerator", "dT_cyc_reg_F", "down"): (
        "catalyst", "unit_2_riser", "Under-burn: carbon on regenerated catalyst rises, activity falls and riser "
                                    "conversion slips within ~{h} min"),
    ("unit_3_regenerator", "Treg_F", "up"): (
        "catalyst", "unit_2_riser", "Hot regenerator: catalyst circulation is cut back by the ROT loop, lowering "
                                    "cat/oil and conversion in ~{h} min"),
    ("unit_3_regenerator", "Treg_F", "down"): (
        "catalyst", "unit_3_regenerator", "Cold regenerator: coke burn incomplete; carbon on catalyst climbs and "
                                          "afterburn follows in ~{h} min"),
    # --- hydrocarbon loop --------------------------------------------------------------------------------------------
    ("unit_4_fractionator", "LCO_T98_F", "up"): (
        "hydrocarbon", "unit_4_fractionator", "LCO heavier than spec: PA3 saturates in ~{h} min "
                                              "if the cut point is not pulled back"),
    ("unit_4_fractionator", "LCO_T98_F", "down"): (
        "hydrocarbon", "unit_4_fractionator", "LCO cut too light: {v} quality giveaway to slurry; recoverable LCO yield "
                                              "lost every hour it persists"),
    ("unit_4_fractionator", "HN_T98_F", "up"): (
        "hydrocarbon", "unit_6_stabiliser", "Heavy naphtha end point drifting up; stabiliser feed heavier and C5 "
                                            "recovery falls within ~{h} min"),
    ("unit_4_fractionator", "HN_T98_F", "down"): (
        "hydrocarbon", "unit_4_fractionator", "HN cut too light: naphtha yield given away to LCO; {v} below plan"),
    ("unit_5_condenser", "MV_cw_flow", "up"): (
        "heat", "unit_5_condenser", "Cooling-water demand above expected for this load: condenser UA degrading; "
                                    "overhead T limit reached in ~{h} min on a warm afternoon"),
    ("unit_5_condenser", "MV_cw_flow", "down"): (
        "heat", "unit_6_stabiliser", "Condenser running cold: reflux sub-cooled, stabiliser overhead and LPG split "
                                     "shift within ~{h} min"),
    ("unit_6_stabiliser", "eff_C5", "down"): (
        "hydrocarbon", "unit_6_stabiliser", "C5 slipping to LPG: light-naphtha yield {v} below plan; RVP margin "
                                            "unused — adjust reflux / overhead T"),
    ("unit_6_stabiliser", "eff_C5", "up"): (
        "hydrocarbon", "unit_6_stabiliser", "C5 recovery above plan: LPG stream drying out; check overhead T against "
                                            "the C4/C5 split target"),
}
LOOP_LABEL = {"catalyst": "Catalyst loop", "heat": "Heat loop", "hydrocarbon": "Hydrocarbon loop"}


def _horizon_min(residual: float | None, sigma: float | None) -> int:
    """Minutes until the downstream effect bites: 180 min at 3σ shrinking to 45 min at ≥ 7σ."""
    if residual is None or not sigma:
        return 120
    n = abs(float(residual)) / max(float(sigma), 1e-6)
    return int(np.clip(round(180 - 33.75 * (n - 3.0)), 45, 180))


def consequence_for(ev: dict) -> dict | None:
    """Systems-Agent consequence line for one E3 event, or None when no rule applies."""
    unit_id, tag = ev.get("unit_id"), ev.get("tag")
    res = ev.get("residual")
    if unit_id is None or tag is None:
        return None
    direction = "up" if (res or 0) > 0 else "down"
    rule = CONSEQUENCE_RULES.get((unit_id, tag, direction)) or CONSEQUENCE_RULES.get((unit_id, tag, "any"))
    if not rule:
        return None
    loop, downstream, template = rule
    h = _horizon_min(res, ev.get("sigma"))
    v = f"{abs(float(res)):.1f} {_u(tag)}".strip() if res is not None else ""
    return {"loop": loop, "loop_label": LOOP_LABEL[loop], "downstream_unit_id": downstream, "horizon_min": h,
            "text": template.format(h=h, v=v)}


# ----------------------------------------------------------------------------------------------- formatting
def clock(time_min: int) -> str:
    """HH:MM wall clock for a simulated minute (from config ts_base)."""
    return datetime.fromisoformat(get_state().ts(int(time_min)).replace("Z", "+00:00")).strftime("%H:%M")


def shift_label(time_min: int) -> str:
    hour = datetime.fromisoformat(get_state().ts(int(time_min)).replace("Z", "+00:00")).hour
    return "Shift A" if 6 <= hour < 14 else "Shift B" if 14 <= hour < 22 else "Shift C"


def _trim(s: str, n: int = MAX_LABEL) -> str:
    return s if len(s) <= n else s[: n - 1].rstrip() + "…"


def _u(tag: str | None) -> str:
    return UNIT_FALLBACK.get(tag or "", "") or _unit_of(tag or "")


def short_line(ev: dict, with_time: bool = True) -> str:
    """One-line human form of an event: 'LCO T98 +4.8 °F above expected since 08:23'."""
    kind, tag = ev.get("kind"), ev.get("tag")
    label = TAG_LABEL.get(tag, tag or "")
    t = ev.get("time_min")
    since = f" since {clock(t)}" if (with_time and t is not None) else ""
    res = ev.get("residual")
    if kind in ("breach", "cusum") and res is not None:
        u = _u(tag)
        word = "above" if res > 0 else "below"
        how = "outside ±3σ" if kind == "breach" else "sustained shift"
        return f"{label} {res:+.1f} {u} {word} expected ({how}){since}".replace("  ", " ")
    if kind == "regime_change":
        return _trim(ev.get("label") or (ev.get("briefing") or {}).get("en") or "Crude regime changed")
    if kind == "recipe_ready":
        return f"Recipe ready for {UNIT_SHORT.get(ev.get('unit_id'), '')}{since}"
    if kind in ("drift", "combustion", "flooding_pattern"):
        return f"{label or kind.replace('_', ' ').title()} pattern detected{since}"
    if kind in ("accepted", "declined"):
        return f"Recipe {kind} by operator{since}"
    return _trim((ev.get("briefing") or {}).get("en") or kind or "Event")


# ----------------------------------------------------------------------------------------------- L0 fields
def kpi_vs_plan(run_id: str, unit_id: str, time_min: int, row: dict, tolerances: dict | None = None) -> dict | None:
    """Primary tag vs plan for the unit block: plan = set point when one exists, else the regime/committee expected."""
    tags = [t for t in UNIT_PRIMARY_TAGS.get(unit_id, []) if t in row]
    if not tags:
        return None
    tag = tags[0]
    tol = float((tolerances or {}).get(tag, DEFAULT_TOL.get(tag, 1.0)))
    value = row.get(tag)
    if value is None or not np.isfinite(float(value)):
        return None
    value = float(value)
    sp = PLAN_SP.get(tag)
    plan, plan_source = None, None
    if sp and sp in row and row[sp] is not None and np.isfinite(float(row[sp])):
        plan, plan_source = float(row[sp]), "set point"
    else:
        d = detection_series(run_id, unit_id, tag)
        if d is not None:
            t = d["time_min"]
            i = int(np.clip(np.searchsorted(t, time_min, side="right") - 1, 0, len(t) - 1))
            e = float(d["expected"][i])
            if np.isfinite(e):
                plan, plan_source = e, d["expected_source"]
    if plan is None:
        return None
    dev = value - plan
    state = "OK" if abs(dev) <= tol else "WATCH" if abs(dev) <= 2 * tol else "ACT"
    return {"tag": tag, "label": TAG_LABEL.get(tag, tag), "value": round(value, 2), "plan": round(plan, 2),
            "plan_source": plan_source, "tol": tol, "deviation": round(dev, 2), "unit": _u(tag), "state": state}


def unit_counts(unit: dict, open_events: list[dict]) -> dict:
    mine = [e for e in open_events if e.get("unit_id") == unit["unit_id"]]
    flags = {e.get("tag") for e in mine if e.get("kind") in E3_KINDS and e.get("severity") in ("warn", "alarm")}
    decisions_open = sum(1 for d in (unit.get("decisions_needed") or []) if d.get("status") == "OPEN")
    return {"events_open": len(mine), "flags": len(flags), "decisions_open": decisions_open}


def needs_attention(open_events: list[dict], limit: int = MAX_ATTENTION) -> list[dict]:
    """Ranked list: alarm > warn > info, newest first; one line per (unit, tag); consequence from the rule table."""
    seen, out = set(), []
    ranked = sorted((e for e in open_events if e.get("kind") in E3_KINDS and e.get("kind") != "recipe_ready"),
                    key=lambda e: (SEV_RANK.get(e.get("severity"), 3), -int(e.get("time_min") or 0)))
    for e in ranked:
        key = (e.get("unit_id"), e.get("tag"), e.get("kind") if e.get("kind") == "regime_change" else None)
        if key in seen:
            continue
        seen.add(key)
        c = consequence_for(e)
        out.append({"unit_id": e.get("unit_id"), "unit_label": UNIT_SHORT.get(e.get("unit_id"), "Plant"),
                    "severity": e.get("severity"), "kind": e.get("kind"), "tag": e.get("tag"),
                    "time_min": e.get("time_min"), "time_label": clock(e["time_min"]) if e.get("time_min") is not None else None,
                    "line": short_line(e), "consequence": c["text"] if c else None,
                    "loop": c["loop_label"] if c else None, "downstream_unit_id": c["downstream_unit_id"] if c else None,
                    "horizon_min": c["horizon_min"] if c else None, "event_id": e.get("event_id"),
                    "recipe_id": e.get("recipe_id")})
        if len(out) >= limit:
            break
    return out


def timeline(events: list[dict]) -> list[dict]:
    """Compact shift timeline (labels ≤ 60 chars) ordered by time."""
    out = []
    for e in sorted(events, key=lambda e: int(e.get("time_min") or 0)):
        out.append({"time_min": e.get("time_min"), "time_label": clock(e["time_min"]) if e.get("time_min") is not None else None,
                    "kind": e.get("kind"), "severity": e.get("severity"), "unit_id": e.get("unit_id"),
                    "label": _trim(short_line(e, with_time=False)), "event_id": e.get("event_id")})
    return out


def _flag_label(ev: dict) -> str:
    """'Riser conversion' rather than 'Riser Riser conversion' when the tag label already names the unit."""
    unit = UNIT_SHORT.get(ev.get("unit_id"), "")
    lbl = TAG_LABEL.get(ev.get("tag"), ev.get("tag") or "")
    return lbl if lbl.lower().startswith(unit.lower()) else f"{unit} {lbl}".strip()


def plant_strip(time_min: int, units: list[dict], open_events: list[dict], mass_balance_err_pct: float | None) -> dict:
    flags = {(e.get("unit_id"), e.get("tag")) for e in open_events
             if e.get("kind") in E3_KINDS and e.get("kind") != "recipe_ready" and e.get("severity") in ("warn", "alarm")}
    top = next((e for e in sorted(open_events, key=lambda e: (SEV_RANK.get(e.get("severity"), 3), -int(e.get("time_min") or 0)))
                if (e.get("unit_id"), e.get("tag")) in flags), None)
    mb = None if mass_balance_err_pct is None or not math.isfinite(float(mass_balance_err_pct)) else round(float(mass_balance_err_pct), 3)
    return {"shift_label": shift_label(time_min), "clock": clock(time_min), "time_min": int(time_min),
            "mass_closure_pct": mb,
            "open_decisions": int(sum(int(u.get("decisions_open", 0) or 0) for u in units)),
            "agent_flags": len(flags),
            "top_flag": _flag_label(top) if top else None,
            "units_act": sum(1 for u in units if (u.get("kpi_vs_plan") or {}).get("state") == "ACT"),
            "units_watch": sum(1 for u in units if (u.get("kpi_vs_plan") or {}).get("state") == "WATCH")}


def unit_spark(run_id: str, unit_id: str, time_min: int, kpi: dict | None, window_min: int = SPARK_WINDOW_MIN,
               step: int = SPARK_STEP) -> dict | None:
    """L0 tile data (SDD-L0-02 amended): the headline tag's last `window_min` minutes — measured, expected ŷ and the
    ±2σ band — plus the N(μ,σ) belief at the cursor, plan ± tol and the spec limit. ≈ 120 points per unit."""
    if not kpi:
        return None
    tag = kpi["tag"]
    d = detection_series(run_id, unit_id, tag)
    if d is None:
        return None
    t = np.asarray(d["time_min"], float)
    i1 = int(np.clip(np.searchsorted(t, time_min, side="right") - 1, 0, len(t) - 1))
    i0 = int(np.clip(np.searchsorted(t, time_min - window_min, side="left"), 0, i1))
    idx = np.arange(i0, i1 + 1, max(1, step))
    if idx[-1] != i1:
        idx = np.append(idx, i1)

    def _ser(a):
        v = np.asarray(a, float)[idx]
        return [None if not np.isfinite(x) else round(float(x), 3) for x in v]

    e_now, lo_now, hi_now = float(d["expected"][i1]), float(d["band_lo"][i1]), float(d["band_hi"][i1])
    sigma = (hi_now - lo_now) / 4 if np.isfinite(lo_now) and np.isfinite(hi_now) else float(d["sigma"][i1])
    specs = (get_state().s.get("specs", {}) or {}).get(tag, {}) or {}
    return {"tag": tag, "label": kpi["label"], "unit": kpi["unit"], "source": d["expected_source"],
            "time_min": [int(x) for x in t[idx]], "measured": _ser(d["measured"]), "expected": _ser(d["expected"]),
            "band_lo": _ser(d["band_lo"]), "band_hi": _ser(d["band_hi"]),
            "mu": None if not np.isfinite(e_now) else round(e_now, 3), "sigma": None if not np.isfinite(sigma) else round(max(sigma, 1e-6), 4),
            "plan": kpi["plan"], "tol": kpi["tol"],
            "spec_hi": specs.get("max") if isinstance(specs, dict) else None,
            "spec_lo": specs.get("min") if isinstance(specs, dict) else None,
            "breach_open": bool(d["breach"][i1]) if i1 < len(d["breach"]) else False}


def l0_fields(run_id: str, time_min: int, units: list[dict], row: dict, events: list[dict],
              mass_balance_err_pct: float | None) -> dict[str, Any]:
    """Mutates `units` in place (kpi_vs_plan + counts + spark) and returns the plant-level L0 fields (contract §6)."""
    st = get_state()
    tolerances = (st.s.raw.get("plan_tolerances") or {}) if hasattr(st.s, "raw") else {}
    open_events = [e for e in events if e.get("status") == "open"]
    for u in units:
        u["kpi_vs_plan"] = kpi_vs_plan(run_id, u["unit_id"], time_min, row, tolerances)
        u.update(unit_counts(u, open_events))
        try:
            u["spark"] = unit_spark(run_id, u["unit_id"], time_min, u["kpi_vs_plan"])
        except Exception:  # a tile without a curve is better than a failed /api/twin
            u["spark"] = None
    return {"needs_attention": needs_attention(open_events), "timeline": timeline(events),
            "plant": plant_strip(time_min, units, open_events, mass_balance_err_pct)}

