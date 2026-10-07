"""L1 unit workbench aggregate (SDD-L1-01..07, API_CONTRACT_v3 §5) and the Gemini scope snapshot (§7).

One call returns the four zones for a unit at (run, time):

* **Data** — `series` (≤ 400 points per key over the window) for the unit's primary tag(s) with expected / band /
  residual / ±3σ / CUSUM, plus its MVs, disturbances and yields (contract §0), and `panels` describing how to draw them
  (roles + palette from §8; no grey data traces).
* **Analysis** — residual state now, breach episode, next lab, root cause, events in the window, trilingual summary.
* **Models** — committee adaptation (fractionator), the regime surrogate card, PINN sanity checks, the committee gate.
* **Decisions** — the twin's open decision cards for the unit, each linked to the E4 recipe id when one is ISSUED.
"""
from __future__ import annotations

import logging
import math

import numpy as np
import pandas as pd

from app.data.catalog import tag_meta
from app.engines.adapt import adaptation_at
from app.engines.detect import (TAG_LABEL, briefing, detection_series, events_for_run, next_lab_min, open_breach,
                                root_cause)
from app.engines.recipe import recipe_for
from app.engines.regime import holdout_score, regime_at
from app.engines import scripted
from app.engines.surrogates import UNIT_PRIMARY_TAGS, get_surrogate_card
from app.lttb import lttb_indices
from app.state import get_state
from app.twin import evaluate_twin_state

logger = logging.getLogger(__name__)

MAX_POINTS = 400
PALETTE = {"measured": "#1d4ed8", "expected": "#047857", "band": "#047857", "plan": "#6d28d9", "spec": "#b91c1c",
           "residual": "#0e7490", "sigma3": "#be185d", "cusum": "#c2410c",
           "mv": ["#ea580c", "#0f766e", "#7c2d12", "#4338ca", "#b45309", "#0369a1"],
           "disturbance": ["#be185d", "#9333ea", "#0369a1"],
           "yield": {"prod_LCO": "#1d4ed8", "prod_HN": "#047857", "prod_LN": "#ca8a04", "prod_LPG": "#9333ea",
                     "prod_slurry": "#7c2d12", "F5_fuel": "#ea580c", "conversion_pct": "#1d4ed8",
                     "dP_reactor_frac": "#9333ea", "F_coke": "#7c2d12", "C_regen_cat": "#0f766e", "power_CAB": "#4338ca",
                     "power_WGC": "#4338ca", "eff_C3": "#ca8a04", "eff_C4": "#9333ea", "eff_C5": "#047857"}}

# contract §0: MVs / disturbances / yields per unit (only tags present in the run are emitted)
UNIT_TAGS = {
    "unit_1_furnace": {"mv": ["F5_fuel", "V1", "SP_T_preheat_F"], "dist": ["feed_flow_lb_s", "dist_T_feed_in_F", "dist_feed_API"],
                       "yield": ["F5_fuel"], "extra": {"combustion": ["fluegas_O2_pct", "fluegas_CO_ppm"]}},
    "unit_2_riser": {"mv": ["SP_T_riser_ROT_F", "F_regen_cat"], "dist": ["dist_feed_API", "feed_flow_lb_s"],
                     "yield": ["conversion_pct", "dP_reactor_frac"], "extra": {}},
    "unit_3_regenerator": {"mv": ["Fair", "V6", "V7", "SP_T_reg_F"], "dist": ["dist_feed_API", "feed_flow_lb_s"],
                           "yield": ["F_coke", "C_regen_cat", "power_CAB"], "extra": {}},
    "unit_4_fractionator": {"mv": ["MV_PA1", "MV_PA2", "MV_PA3", "MV_PA4", "SP_LCO_T98", "SP_HN_T98"],
                            "dist": ["dist_feed_API", "feed_flow_lb_s", "dist_T_feed_in_F"],
                            "yield": ["prod_LCO", "prod_HN", "prod_LN", "prod_LPG", "prod_slurry"],
                            "extra": {"tray_profile": ["T_tray01_F", "T_tray06_F", "T_tray13_F", "T_tray17_F", "T_tray20_F"]}},
    "unit_5_condenser": {"mv": ["MV_reflux_ratio", "MV_cw_flow", "SP_T_overhead"], "dist": ["dist_T_ambient_F", "feed_flow_lb_s"],
                         "yield": ["power_WGC"], "extra": {}},
    "unit_6_stabiliser": {"mv": ["MV_reflux_ratio", "SP_T_overhead"], "dist": ["dist_feed_API", "feed_flow_lb_s"],
                          "yield": ["prod_LPG", "prod_LN", "eff_C3", "eff_C4", "eff_C5"], "extra": {}},
}
PLAN_SP = {"LCO_T98_F": "SP_LCO_T98", "HN_T98_F": "SP_HN_T98", "T2_preheat_F": "SP_T_preheat_F", "Treg_F": "SP_T_reg_F"}
PANEL_USE_CASES = {"unit_1_furnace": ["UC-05"], "unit_2_riser": ["UC-08", "UC-10"], "unit_3_regenerator": ["UC-04", "UC-09"],
                   "unit_4_fractionator": ["UC-01", "UC-03", "UC-11"], "unit_5_condenser": ["UC-07"], "unit_6_stabiliser": ["UC-02"]}
LABELS = {"F5_fuel": "Furnace fuel", "V1": "Fuel valve V1", "SP_T_preheat_F": "Preheat SP", "feed_flow_lb_s": "Feed rate",
          "dist_T_feed_in_F": "Feed inlet T", "dist_feed_API": "Feed API", "SP_T_riser_ROT_F": "Riser outlet T SP",
          "F_regen_cat": "Regenerated catalyst", "conversion_pct": "Conversion", "dP_reactor_frac": "Reactor–fractionator ΔP",
          "Fair": "Regenerator air", "V6": "Air valve V6", "V7": "Air valve V7", "SP_T_reg_F": "Regenerator T SP",
          "F_coke": "Coke burn", "C_regen_cat": "Carbon on regenerated catalyst", "power_CAB": "Air blower power",
          "MV_PA1": "Pumparound 1", "MV_PA2": "Pumparound 2", "MV_PA3": "Pumparound 3", "MV_PA4": "Pumparound 4",
          "SP_LCO_T98": "LCO T98 SP", "SP_HN_T98": "HN T98 SP", "prod_LCO": "LCO", "prod_HN": "HN", "prod_LN": "LN",
          "prod_LPG": "LPG", "prod_slurry": "Slurry", "MV_reflux_ratio": "Reflux ratio", "MV_cw_flow": "Cooling water",
          "SP_T_overhead": "Overhead T SP", "dist_T_ambient_F": "Ambient T", "power_WGC": "Wet-gas compressor power",
          "eff_C3": "C3 recovery", "eff_C4": "C4 recovery", "eff_C5": "C5 recovery", "fluegas_O2_pct": "Flue-gas O2",
          "fluegas_CO_ppm": "Flue-gas CO", "T_tray01_F": "Tray 1", "T_tray06_F": "Tray 6", "T_tray13_F": "Tray 13",
          "T_tray17_F": "Tray 17", "T_tray20_F": "Tray 20", "LCO_T98_F": "LCO T98", "HN_T98_F": "HN T98",
          "T2_preheat_F": "Preheat outlet", "dT_cyc_reg_F": "Cyclone ΔT", "Treg_F": "Regenerator bed T"}


def _label(tag: str) -> str:
    return LABELS.get(tag) or TAG_LABEL.get(tag) or (tag_meta(tag) or {}).get("label", tag)


def _unit(tag: str) -> str:
    if tag.startswith("eff_") or tag.endswith("_pct"):
        return "%"
    u = (tag_meta(tag) or {}).get("unit", "")
    return "" if u == "-" else u


def _clean(a) -> list:
    return [None if (v is None or (isinstance(v, float) and not math.isfinite(v))) else float(v) for v in np.asarray(a, float)]


def _downsample_idx(t: np.ndarray, y: np.ndarray, step: int) -> np.ndarray:
    idx = np.arange(len(t))[::max(1, int(step))]
    if len(idx) <= MAX_POINTS:
        return idx
    yy = np.nan_to_num(y[idx], nan=float(np.nanmean(y[idx])) if np.isfinite(y[idx]).any() else 0.0)
    return idx[lttb_indices(t[idx].astype(float), yy.astype(float), MAX_POINTS)]


def _series(st, run_id, unit_id, tags, window: tuple[int, int], step: int) -> tuple[dict, dict, dict]:
    """series {time_min, keys}, per-primary-tag detection dicts, and the per-key colour/role used by panels."""
    df = st.catalog.load(run_id)
    t_all = df["time_min"].to_numpy()
    w = (t_all >= window[0]) & (t_all <= window[1])
    det = {tag: detection_series(run_id, unit_id, tag) for tag in tags}
    anchor = next((d["measured"] for d in det.values() if d is not None), None)
    anchor = anchor if anchor is not None else pd.to_numeric(df[tags[0]], errors="coerce").to_numpy(float)
    sub = np.where(w)[0]
    keep = sub[_downsample_idx(t_all[sub], anchor[sub], step)]
    keys = {}
    for tag, d in det.items():
        if d is None:
            continue
        keys[tag] = _clean(d["measured"][keep])
        keys[f"expected:{tag}"] = _clean(d["expected"][keep])
        keys[f"band_lo:{tag}"] = _clean(d["band_lo"][keep])
        keys[f"band_hi:{tag}"] = _clean(d["band_hi"][keep])
        keys[f"residual:{tag}"] = _clean(d["residual"][keep])
        keys[f"sigma3:{tag}"] = _clean(3.0 * d["sigma"][keep])
        keys[f"cusum:{tag}"] = _clean(d["cusum"][keep])
    cfg = UNIT_TAGS.get(unit_id, {"mv": [], "dist": [], "yield": [], "extra": {}})
    extra_tags = [x for lst in cfg["extra"].values() for x in lst]
    for tag in cfg["mv"] + cfg["dist"] + cfg["yield"] + extra_tags:
        if tag in df.columns and tag not in keys:
            keys[tag] = _clean(pd.to_numeric(df[tag], errors="coerce").to_numpy(float)[keep])
    return {"time_min": [int(x) for x in t_all[keep]], "keys": keys}, det, cfg


def _panels(unit_id, tags, det, cfg, keys, hl: dict, markers: list[dict]) -> list[dict]:
    panels = []
    ucs = PANEL_USE_CASES.get(unit_id, [])
    for n, tag in enumerate(tags):
        if det.get(tag) is None:
            continue
        src = det[tag]["expected_source"]
        band_label = "5–95 % band" if src == "committee" else "±2σ band"
        panels.append({
            "panel_id": "quality" if n == 0 else f"quality_{n + 1}", "kind": "measured_vs_expected",
            "title": f"{_label(tag)} — measured vs expected ({src})", "unit": _unit(tag),
            "traces": [{"key": tag, "label": "Measured (simulator truth)", "role": "measured", "color": PALETTE["measured"]},
                       {"key": f"expected:{tag}", "label": f"Expected ({src})", "role": "expected", "color": PALETTE["expected"]},
                       {"key": f"band_lo:{tag}", "label": band_label, "role": "band_lo", "color": PALETTE["band"]},
                       {"key": f"band_hi:{tag}", "label": band_label, "role": "band_hi", "color": PALETTE["band"]}],
            "hlines": hl.get(tag, []), "markers": [m for m in markers if m.get("tag") in (tag, None)],
            "use_case_ids": ucs})
        panels.append({
            "panel_id": "residual" if n == 0 else f"residual_{n + 1}", "kind": "residual",
            "title": f"{_label(tag)} residual (measured − expected) with ±3σ and CUSUM", "unit": _unit(tag),
            "traces": [{"key": f"residual:{tag}", "label": "Residual", "role": "residual", "color": PALETTE["residual"]},
                       {"key": f"sigma3:{tag}", "label": "±3σ (trailing MAD)", "role": "sigma3", "color": PALETTE["sigma3"]},
                       {"key": f"cusum:{tag}", "label": "CUSUM (k=0.5σ, h=5σ)", "role": "cusum", "color": PALETTE["cusum"]}],
            "hlines": [{"value": 0.0, "label": "0", "role": "plan", "color": PALETTE["plan"]}],
            "markers": [m for m in markers if m.get("tag") == tag], "use_case_ids": ucs})

    def group(panel_id, kind, title, tag_list, colours):
        traces = []
        for i, tag in enumerate(tag_list):
            if tag in keys:
                c = colours.get(tag, PALETTE["mv"][i % 6]) if isinstance(colours, dict) else colours[i % len(colours)]
                traces.append({"key": tag, "label": _label(tag), "role": kind, "color": c, "unit": _unit(tag)})
        if traces:
            panels.append({"panel_id": panel_id, "kind": kind, "title": title, "traces": traces, "hlines": [],
                           "markers": [], "use_case_ids": ucs})

    group("mv", "mv", "Manipulated variables", cfg["mv"], PALETTE["mv"])
    group("disturbance", "disturbance", "Disturbances", cfg["dist"], PALETTE["disturbance"])
    group("yield", "yield", "Yields / products", cfg["yield"], PALETTE["yield"])
    for pid, tag_list in cfg["extra"].items():
        group(pid, pid, {"combustion": "Combustion (flue-gas O2 / CO)", "tray_profile": "Tray temperature profile"}.get(pid, pid),
              tag_list, PALETTE["mv"])
    return panels


def _hlines(st, unit_id, tags, row: dict) -> dict:
    out = {}
    specs = st.s.get("specs", {}) or {}
    for tag in tags:
        hl = []
        sp = PLAN_SP.get(tag)
        if sp and sp in row and np.isfinite(float(row[sp] or np.nan)):
            hl.append({"value": round(float(row[sp]), 2), "label": f"Plan ({sp})", "role": "plan", "color": PALETTE["plan"]})
        spec = specs.get(tag, {})
        if isinstance(spec, dict) and spec.get("max") is not None:
            hl.append({"value": float(spec["max"]), "label": "Spec max", "role": "spec", "color": PALETTE["spec"]})
        if isinstance(spec, dict) and spec.get("min") is not None:
            hl.append({"value": float(spec["min"]), "label": "Spec min", "role": "spec", "color": PALETTE["spec"]})
        out[tag] = hl
    return out


def _pinn_checks(twin: dict) -> list[dict]:
    pr = twin.get("pinn_residuals", {}) or {}
    out = []
    if "mass_balance_err_pct" in pr:
        v = float(pr["mass_balance_err_pct"])
        out.append({"name": "Mass balance closure", "value": round(v, 3), "limit": 1.0, "pass": abs(v) <= 1.0, "unit": "%"})
    if "tray_violations_count" in pr:
        v = int(pr["tray_violations_count"])
        out.append({"name": "Tray temperature monotonicity", "value": v, "limit": 0, "pass": v == 0, "unit": "violations"})
    if "reactor_mb_lb_min" in pr:
        v = float(pr["reactor_mb_lb_min"])
        out.append({"name": "Reactor mass balance", "value": round(v, 2), "limit": 50.0, "pass": abs(v) <= 50.0, "unit": "lb/min"})
    return out


def _gate(st, run_id: str, time_min: int, unit_id: str, rcp: dict) -> dict:
    g = {"status": rcp.get("gate", "WITHHELD"), "reason": rcp.get("gate_reason"), "w90": None,
         "w90_limit": float((st.s.get("gate", {}) or {}).get("w90_max_F", 14.0))}
    if unit_id == "unit_4_fractionator":
        v = st.run(run_id)
        if v:
            arrs, _ = v
            j = st.index_of(arrs, time_min)
            if "LCO_T98_F|q95" in arrs:
                g["w90"] = round(float(arrs["LCO_T98_F|q95"][j] - arrs["LCO_T98_F|q05"][j]), 2)
            g["committee_gate"] = {p: str(arrs[f"{p}|gate"][j]) for p in ("LCO_T98_F", "HN_T98_F") if f"{p}|gate" in arrs}
    return g


def _summary(unit_id, tag, state: dict, det, nxt, time_min, rc, rcp, regime) -> dict:
    if det is None or state.get("residual_now") is None:
        return {"en": f"No expected-value model for {tag} on this run.", "hinglish": f"{tag} ke liye is run par koi expected model nahi.",
                "hi": f"इस रन पर {tag} के लिए कोई अपेक्षित-मान मॉडल नहीं।"}
    i = state["index"]
    kind = "breach" if det["breach"][i] else "cusum" if det["cusum_mask"][i] or state["breach_open"] else "steady"
    gate = rcp["gate"] + (f":{rcp['gate_reason']}" if rcp.get("gate_reason") else "")
    if kind == "steady":
        res, sig = state["residual_now"], state["sigma_now"]
        lab_en = f"next lab draw at t={nxt} min" if nxt else "no further lab scheduled"
        r = regime.get("regime_id", "?")
        return {"en": f"{_label(tag)} ({tag}) tracking expected within {abs(res):.1f} {_unit(tag)} ({abs(res) / max(sig, 1e-6):.1f}σ) "
                      f"at t={time_min} min, regime {r}; {lab_en}; recipe {gate}.",
                "hinglish": f"{_label(tag)} ({tag}) expected ke {abs(res):.1f} {_unit(tag)} ({abs(res) / max(sig, 1e-6):.1f}σ) ke andar "
                            f"hai, t={time_min} min, regime {r}; {'agla lab t=' + str(nxt) + ' min' if nxt else 'aage koi lab nahi'}; recipe {gate}.",
                "hi": f"{_label(tag)} ({tag}) अपेक्षित के {abs(res):.1f} {_unit(tag)} ({abs(res) / max(sig, 1e-6):.1f}σ) के भीतर है, "
                      f"t={time_min} मिनट, रेज़ीम {r}; {'अगला लैब t=' + str(nxt) + ' मिनट' if nxt else 'आगे कोई लैब नहीं'}; रेसिपी {gate}।"}
    return briefing(tag, kind, float(det["residual"][i]), float(det["sigma"][i]), float(det["cusum"][i]),
                    float(det["measured"][i]), float(det["expected"][i]), int(time_min), nxt, rc, gate)


def workbench(unit_id: str, run_id: str, time_min: int, window_min: int = 720, step: int = 2) -> dict:
    st = get_state()
    twin = evaluate_twin_state(run_id, time_min)
    unit = next((u for u in twin["units"] if u["unit_id"] == unit_id), None)
    df = st.catalog.load(run_id)
    if not unit or df.empty:
        return {}
    time_min = int(time_min)
    t_all = df["time_min"].to_numpy()
    i_now = int(np.clip(np.searchsorted(t_all, time_min, side="right") - 1, 0, len(t_all) - 1))
    row = df.iloc[i_now].to_dict()
    window = (max(int(t_all[0]), time_min - int(window_min)), time_min)
    tags = [t for t in UNIT_PRIMARY_TAGS.get(unit_id, []) if t in df.columns]
    primary = tags[0] if tags else None

    series, det, cfg = _series(st, run_id, unit_id, tags, window, step)
    regime = dict(regime_at(run_id, time_min) or {})
    try:
        regime["holdout"] = None if scripted.enabled() else holdout_score()
    except Exception:  # noqa: BLE001 - accuracy line is informative only
        regime["holdout"] = None
    rcp = recipe_for(run_id, time_min, unit_id)
    events = [{**e, "tag_label": _label(e["tag"]) if e.get("tag") else None}
              for e in events_for_run(run_id, time_min, None)["events"]
              if e.get("unit_id") in (unit_id, None) and window[0] <= int(e["time_min"]) <= window[1]]
    markers = [{"time_min": int(e["time_min"]), "kind": e["kind"], "tag": e.get("tag") if e["kind"] != "regime_change" else None,
                "label": e.get("label") or {"breach": "±3σ breach", "cusum": "Change-point", "recipe_ready": "Recipe ready",
                                           "combustion": "Combustion pattern", "flooding_pattern": "Flooding pattern",
                                           "accepted": "Accepted", "declined": "Declined"}.get(e["kind"], e["kind"]),
                "event_id": e["event_id"]} for e in events]
    hl = _hlines(st, unit_id, tags, row)
    panels = _panels(unit_id, tags, det, cfg, series["keys"], hl, markers)

    state = open_breach(run_id, unit_id, primary, time_min) if primary else {}
    nxt = next_lab_min(run_id, time_min)
    rc = (root_cause(run_id, primary, state["index"], regime.get("regime_id", "R3"), state["sigma_now"] or 1.0)
          if primary and state.get("index") is not None and det.get(primary) is not None else [])
    analysis = {
        "primary_tag": primary, "expected_source": det[primary]["expected_source"] if primary and det.get(primary) else None,
        "residual_now": state.get("residual_now"), "sigma_now": state.get("sigma_now"), "cusum_now": state.get("cusum_now"),
        "breach_open": bool(state.get("breach_open")), "first_breach_min": state.get("first_breach_min"),
        "minutes_before_next_lab": (nxt - time_min) if nxt else None, "next_lab_min": nxt,
        "root_cause": rc, "events": events,
        "summary": _summary(unit_id, primary, state, det.get(primary) if primary else None, nxt, time_min, rc, rcp, regime)
        if primary else {"en": "", "hinglish": "", "hi": ""},
    }

    card = dict(get_surrogate_card(regime.get("regime_id", "R3")))
    card.pop("envelope", None)   # bulky; the recipe already enforces it
    models = {"committee": adaptation_at(run_id, time_min, primary) if unit_id == "unit_4_fractionator" and primary else None,
              "surrogate": card, "pinn_checks": _pinn_checks(twin), "gate": _gate(st, run_id, time_min, unit_id, rcp)}

    decisions = []
    for d in unit.get("decisions_needed", []) or []:
        d = dict(d)
        d["recipe_id"] = rcp["recipe_id"] if rcp.get("gate") == "ISSUED" else None
        decisions.append(d)

    def io(tag_list):
        return [{"tag": t, "label": _label(t), "value": round(float(row[t]), 3), "unit": _unit(t)}
                for t in tag_list if t in row and isinstance(row[t], (int, float, np.floating)) and np.isfinite(float(row[t]))]

    kpi = unit.get("kpi_vs_plan") or {}
    headline = {"label": kpi.get("label") or (_label(primary) if primary else ""), "value": kpi.get("value"),
                "plan": kpi.get("plan"), "tol": kpi.get("tol"), "unit": kpi.get("unit") or (_unit(primary) if primary else ""),
                "state": kpi.get("state"), "plan_source": kpi.get("plan_source")}
    # Signature chart per use case (SDD-L1-04, BDD-28 "use-case entry opens the owning unit scrolled to its signature chart").
    SIGNATURE_PANEL = {"UC-03": "quality_2", "UC-04": "yield", "UC-05": "combustion", "UC-06": "mv", "UC-07": "mv",
                       "UC-08": "yield", "UC-09": "yield", "UC-10": "mv", "UC-02": "yield"}
    panel_ids = {p["panel_id"] for p in panels}
    use_cases = [{"id": uc["id"], "number": uc.get("number"), "title": uc.get("title"),
                  "panel_id": SIGNATURE_PANEL.get(uc["id"]) if SIGNATURE_PANEL.get(uc["id"]) in panel_ids else "quality"}
                 for uc in twin.get("use_cases", []) if uc.get("unit_id") == unit_id]
    return {
        "unit": {"unit_id": unit_id, "seq": unit.get("seq"), "name": unit.get("name"), "short_name": unit.get("short_name"),
                 "status": unit.get("status"), "status_label": unit.get("status_label") or unit.get("status"),
                 "headline_kpi": headline, "io": {"inputs": io(cfg["dist"] + cfg["mv"]), "outputs": io(cfg["yield"])},
                 "use_cases": use_cases},
        "time": {"time_min": time_min, "window_start": window[0], "window_end": window[1], "ts": st.ts(time_min),
                 "next_lab_min": nxt},
        "series": series, "panels": panels, "analysis": analysis, "models": models, "regime": regime, "recipe": rcp,
        "decisions": decisions, "citations": st.citations_for(primary or "LCO_T98_F", "adjust"),
    }


def scope_snapshot(run_id: str, time_min: int, unit_id: str | None) -> dict:
    """≤ 2 KB of screen state for the Gemini copilot (contract §7)."""
    twin = evaluate_twin_state(run_id, time_min)
    reg = regime_at(run_id, time_min)
    reg_small = {k: reg.get(k) for k in ("regime_id", "regime_label", "novelty", "transition_pct", "declared_vs_detected")}
    reg_small["crude_family_is_context"] = True   # S-8: never present crude identification as the purpose
    reg_small["feed"] = {k: (reg.get("feed") or {}).get(k) for k in (
        "state", "pct_through", "api_est", "api_band", "api_declared", "novelty", "novel", "feed_class_label", "hold_reason")}
    if unit_id:
        rcp = recipe_for(run_id, time_min, unit_id)
        unit = next((u for u in twin["units"] if u["unit_id"] == unit_id), {})
        tags = [t for t in UNIT_PRIMARY_TAGS.get(unit_id, [])]
        st_ = open_breach(run_id, unit_id, tags[0], time_min) if tags else {}
        return {"unit_id": unit_id, "status": unit.get("status"), "regime": reg_small,
                "residual": {k: st_.get(k) for k in ("residual_now", "sigma_now", "cusum_now", "breach_open", "first_breach_min")},
                "recipe": {"gate": rcp.get("gate"), "gate_reason": rcp.get("gate_reason"),
                           "moves": [{"sp_tag": m["sp_tag"], "current": m["current"], "recommended": m["recommended"]}
                                     for m in rcp.get("moves", []) if m["delta"]][:4],
                           "d_yield_pct_feed": rcp.get("d_yield_pct_feed"), "p_on_spec": rcp.get("p_on_spec")},
                "open_decisions": [{"rec_id": d.get("rec_id"), "action": d.get("action"), "parameter": d.get("parameter")}
                                   for d in (unit.get("decisions_needed") or [])][:3],
                "next_lab_min": next_lab_min(run_id, time_min), "top_tags": tags}
    cs = twin.get("crude_slate", {}) or {}
    return {"regime": reg_small,
            "crude_slate": {k: cs.get(k) for k in ("declared_api", "declared_regime_id", "regime_id", "declared_vs_detected",
                                                   "last_switch_min", "settled_min")},
            "needs_attention": [{"unit_id": n.get("unit_id"), "severity": n.get("severity"), "line": n.get("line")}
                                for n in (twin.get("needs_attention") or [])][:4],
            "unit_statuses": {u["unit_id"]: u["status"] for u in twin["units"]},
            "events_open": int(sum(int(u.get("events_open", 0) or 0) for u in twin["units"]))}
