"""E3 — unit sentinels: residual / change-point detection, root cause, trilingual briefings (SDD-DET-01..05, contract §3).

For every unit's primary tag(s) (contract §0) the sentinel computes, on the run's minute grid:

* `expected` — committee mean for the fractionator (`q05–q95` band), regime surrogate elsewhere (`surrogates.expected_series`);
* `residual = measured − expected`, a robust trailing σ (240-min MAD, floored by the surrogate's residual sd);
* a two-sided CUSUM (k = 0.5 σ, h = 5 σ) and a ±3 σ breach mask.

Events are written once per (run, detector version) into the SQLite `agent_events` table (`store.event_write`) so
the SSE tail (`/api/agents/stream`) and the twin can replay them; a `detect_meta` row records the version that produced
them and stale rows are replaced when the engines change. Operator decisions (`accepted` / `declined`) are never touched.

Every breach / cusum event carries the numbers (residual, σ, CUSUM, expected, measured), the top drivers from the
regime sensitivity table × input deltas over the last 60 min, the next lab draw (from `lab_results.csv`), the E4
recipe id when a recipe is ISSUED at that minute, and a briefing in en / hinglish / hi with the same numbers and tag
ids. Advisory only — no financial wording anywhere.
"""
from __future__ import annotations

import logging
from functools import lru_cache
from typing import Optional

import numpy as np
import pandas as pd

from app.data.catalog import tag_meta
from app.engines.regime import get_run_regimes
from app.engines.surrogates import (OUTPUTS, SURROGATE_VERSION, UNIT_PRIMARY_TAGS, expected_series, get_surrogate_card,
                                    sensitivity, supported_inputs)
from app.state import get_state
from app.store import event_write, events_read

logger = logging.getLogger(__name__)

DETECT_VERSION = 3  # v3: briefing numbers rounded identically to payload fields
E3_KINDS = ("breach", "cusum", "drift", "combustion", "flooding_pattern", "regime_change", "recipe_ready")

SIGMA_WINDOW_MIN, SIGMA_MIN_PERIODS = 240, 30
CUSUM_K, CUSUM_H, BREACH_SIGMAS, ALARM_SIGMAS = 0.5, 5.0, 3.0, 4.5
REFRACTORY_MIN = 60          # one event per (tag, kind) per hour at most
ROOT_CAUSE_LOOKBACK_MIN = 60
UNIT_USE_CASE = {"unit_1_furnace": "UC-05", "unit_2_riser": "UC-08", "unit_3_regenerator": "UC-04",
                 "unit_4_fractionator": "UC-01", "unit_5_condenser": "UC-07", "unit_6_stabiliser": "UC-02"}
TAG_USE_CASE = {"HN_T98_F": "UC-03"}
TAG_LABEL = {"T2_preheat_F": "Feed preheat outlet", "conversion_pct": "Riser conversion",
             "dT_cyc_reg_F": "Regenerator cyclone ΔT (afterburn)", "Treg_F": "Regenerator dense-bed temperature",
             "LCO_T98_F": "LCO T98", "HN_T98_F": "HN T98", "MV_cw_flow": "Condenser cooling-water flow",
             "eff_C5": "Stabiliser C5 recovery", "fluegas_CO_ppm": "Flue-gas CO", "fluegas_O2_pct": "Flue-gas O2",
             "dP_reactor_frac": "Fractionator ΔP"}
INPUT_LABEL = {"SP_T_riser_ROT_F": "riser outlet temperature set point", "SP_LCO_T98": "LCO T98 set point",
               "SP_HN_T98": "HN T98 set point", "feed_flow_lb_s": "feed rate", "dist_T_feed_in_F": "feed temperature",
               "dist_feed_API": "feed API"}
LABEL_HI = {"T2_preheat_F": "फ़ीड प्रीहीट आउटलेट", "conversion_pct": "राइज़र कन्वर्ज़न", "dT_cyc_reg_F": "रीजनरेटर साइक्लोन ΔT",
            "Treg_F": "रीजनरेटर बेड तापमान", "LCO_T98_F": "LCO T98", "HN_T98_F": "HN T98",
            "MV_cw_flow": "कंडेंसर कूलिंग-वाटर प्रवाह", "eff_C5": "स्टेबिलाइज़र C5 रिकवरी", "fluegas_CO_ppm": "फ़्लू-गैस CO",
            "dP_reactor_frac": "फ्रैक्शनेटर ΔP"}
INPUT_LABEL_HI = {"SP_T_riser_ROT_F": "राइज़र आउटलेट तापमान सेट पॉइंट", "SP_LCO_T98": "LCO T98 सेट पॉइंट",
                  "SP_HN_T98": "HN T98 सेट पॉइंट", "feed_flow_lb_s": "फ़ीड दर", "dist_T_feed_in_F": "फ़ीड तापमान",
                  "dist_feed_API": "फ़ीड API"}


# ----------------------------------------------------------------------------------------------- helpers
def _unit_of(tag: str) -> str:
    if tag.startswith("eff_") or tag == "conversion_pct":
        return "%"
    u = (tag_meta(tag) or {}).get("unit", "")
    return "" if u == "-" else u


def _label(tag: str) -> str:
    return TAG_LABEL.get(tag) or (tag_meta(tag) or {}).get("label", tag)


@lru_cache(maxsize=1)
def _lab_table() -> pd.DataFrame:
    st = get_state()
    p = st.s.data_root / st.s["data"]["primary_batch"] / "_staged" / "lab_results.csv"
    if not p.exists():
        return pd.DataFrame(columns=["run_id", "time_min"])
    df = pd.read_csv(p)
    df["time_min"] = pd.to_numeric(df["time_min"], errors="coerce")
    return df.dropna(subset=["time_min"])


def next_lab_min(run_id: str, time_min: int) -> int | None:
    """Next scheduled lab draw after `time_min` (from the simulator's lab schedule); None after the last one."""
    labs = _lab_table()
    t = labs.loc[labs["run_id"] == run_id, "time_min"].to_numpy()
    later = t[t > time_min]
    return int(later.min()) if len(later) else None


def _trailing_mad_sigma(res: np.ndarray, floor: float) -> np.ndarray:
    s = pd.Series(res)
    mad = s.rolling(SIGMA_WINDOW_MIN, min_periods=SIGMA_MIN_PERIODS).apply(
        lambda w: np.nanmedian(np.abs(w - np.nanmedian(w))), raw=True)
    sigma = (mad * 1.4826).bfill().to_numpy()
    sigma = np.where(np.isfinite(sigma), sigma, floor)
    return np.maximum(sigma, floor)


def _cusum(res: np.ndarray, sigma: np.ndarray) -> np.ndarray:
    """Two-sided tabular CUSUM (k = CUSUM_K σ, h = CUSUM_H σ), reset after it signals. Returns the signed dominant
    side (positive = running high); |value| > h·σ marks the minute the shift is declared."""
    pos = neg = 0.0
    out = np.zeros(len(res))
    for i, (r, s) in enumerate(zip(res, sigma)):
        if not np.isfinite(r):
            out[i] = out[i - 1] if i else 0.0
            continue
        k, h = CUSUM_K * s, CUSUM_H * s
        pos = max(0.0, pos + r - k)
        neg = max(0.0, neg - r - k)
        out[i] = pos if pos >= neg else -neg
        if pos > h or neg > h:
            pos = neg = 0.0
    return out


@lru_cache(maxsize=256)
def detection_series(run_id: str, unit_id: str, tag: str) -> dict | None:
    """Minute-aligned measured / expected / band / residual / sigma / cusum arrays + masks for one primary tag."""
    st = get_state()
    df = st.catalog.load(run_id)
    if df.empty or tag not in df.columns:
        return None
    exp = expected_series(run_id, unit_id)
    if f"expected:{tag}" not in exp:
        return None
    t = df["time_min"].to_numpy()
    meas = pd.to_numeric(df[tag], errors="coerce").to_numpy(float)
    e = np.asarray(exp[f"expected:{tag}"], float)
    res = meas - e
    source = "committee" if unit_id == "unit_4_fractionator" and st.run(run_id) is not None else "regime surrogate"
    reg = get_run_regimes(run_id)
    regime_now = reg["detected_regime"][-1] if reg else "R3"
    floor = max(0.25 * float(get_surrogate_card(regime_now).get("resid_sd", {}).get(tag, 1.0) or 1.0), 0.2)
    sigma = _trailing_mad_sigma(res, floor)
    cus = _cusum(res, sigma)
    breach = np.abs(res) > BREACH_SIGMAS * sigma
    cusum_mask = np.abs(cus) > CUSUM_H * sigma
    return {"time_min": t, "measured": meas, "expected": e,
            "band_lo": np.asarray(exp.get(f"band_lo:{tag}", e - 2 * sigma), float),
            "band_hi": np.asarray(exp.get(f"band_hi:{tag}", e + 2 * sigma), float),
            "residual": res, "sigma": sigma, "cusum": cus, "breach": breach, "cusum_mask": cusum_mask,
            "expected_source": source}


def root_cause(run_id: str, tag: str, i: int, regime_id: str, sigma_i: float) -> list[dict]:
    """Top drivers of the current residual: sensitivity × input change over the last hour (units of the tag)."""
    st = get_state()
    df = st.catalog.load(run_id)
    sup = supported_inputs()
    B = sensitivity(regime_id)
    if B is None or tag not in OUTPUTS or not sup or any(c not in df.columns for c in sup):
        return []
    j = OUTPUTS.index(tag)
    X = df[sup].apply(pd.to_numeric, errors="coerce").ffill().bfill().to_numpy(float)
    i0 = max(0, i - ROOT_CAUSE_LOOKBACK_MIN)
    dx = X[i] - X[i0]
    contrib = B[:, j] * dx
    order = np.argsort(-np.abs(contrib))
    out = []
    for k in order[:3]:
        if abs(contrib[k]) < 0.05 * max(sigma_i, 1e-6):
            continue
        direction = "up" if dx[k] > 0 else "down" if dx[k] < 0 else "flat"
        out.append({"tag": sup[k], "label": INPUT_LABEL.get(sup[k], _label(sup[k])), "contrib": round(float(contrib[k]), 3),
                    "direction": direction, "d_input": round(float(dx[k]), 3)})
    return out


def briefing(tag: str, kind: str, res: float, sigma: float, cus: float, meas: float, exp: float, t: int,
             nxt: int | None, rc: list[dict], recipe_gate: str) -> dict:
    """Same numbers and tag ids in all three languages; no financial vocabulary."""
    u = _unit_of(tag)
    lab, lab_hi = _label(tag), LABEL_HI.get(tag, _label(tag))
    n_sig = abs(res) / max(sigma, 1e-6)
    what = {"breach": "outside the ±3σ band", "cusum": "a sustained shift (CUSUM)"}.get(kind, kind)
    what_hing = {"breach": "±3σ band ke bahar", "cusum": "sustained shift (CUSUM)"}.get(kind, kind)
    what_hi = {"breach": "±3σ बैंड के बाहर", "cusum": "स्थायी बदलाव (CUSUM)"}.get(kind, kind)
    drv = rc[0] if rc else None
    drv_en = (f"; likely driver {drv['label']} ({drv['tag']} {drv['direction']}, {drv['contrib']:+.2f} {u})" if drv
              else "; no input change explains it (process drift)")
    drv_hing = (f"; sambhavit kaaran {drv['label']} ({drv['tag']} {drv['direction']}, {drv['contrib']:+.2f} {u})" if drv
                else "; koi input change isse explain nahi karta (process drift)")
    dir_hi = {"up": "ऊपर", "down": "नीचे", "flat": "स्थिर"}
    drv_hi = (f"; संभावित कारण {INPUT_LABEL_HI.get(drv['tag'], drv['label'])} ({drv['tag']} {dir_hi.get(drv['direction'], '')}, "
              f"{drv['contrib']:+.2f} {u})" if drv else "; कोई इनपुट बदलाव इसे नहीं समझाता (प्रोसेस ड्रिफ्ट)")
    lab_en = f"next lab draw at t={nxt} min (in {nxt - t} min)" if nxt else "no further lab scheduled"
    lab_hing = f"agla lab t={nxt} min par ({nxt - t} min mein)" if nxt else "aage koi lab scheduled nahi"
    lab_hi = f"अगला लैब t={nxt} मिनट पर ({nxt - t} मिनट में)" if nxt else "आगे कोई लैब निर्धारित नहीं"
    gate_en = {"ISSUED": "recipe ready for review", "WITHHELD": "recipe withheld"}.get(recipe_gate.split(":")[0], "")
    reason = recipe_gate.split(":")[1] if ":" in recipe_gate else ""
    gate_en = f"; {gate_en}" + (f" ({reason})" if reason else "") if gate_en else ""
    gate_hing = {"ISSUED": "; recipe review ke liye taiyaar", "WITHHELD": f"; recipe withheld ({reason})"}.get(
        recipe_gate.split(":")[0], "")
    gate_hi = {"ISSUED": "; रेसिपी समीक्षा के लिए तैयार", "WITHHELD": f"; रेसिपी रोकी गई ({reason})"}.get(
        recipe_gate.split(":")[0], "")
    return {
        "en": (f"{lab} ({tag}) is {what}: measured {meas:.1f} {u} vs expected {exp:.1f} {u}, residual {res:+.1f} {u} "
               f"({n_sig:.1f}σ, σ={sigma:.2f}), CUSUM {cus:+.1f} at t={t} min{drv_en}; {lab_en}{gate_en}."),
        "hinglish": (f"{lab} ({tag}) {what_hing} hai: measured {meas:.1f} {u}, expected {exp:.1f} {u}, residual "
                     f"{res:+.1f} {u} ({n_sig:.1f}σ, σ={sigma:.2f}), CUSUM {cus:+.1f}, t={t} min{drv_hing}; "
                     f"{lab_hing}{gate_hing}."),
        "hi": (f"{lab_hi} ({tag}) {what_hi} है: मापा {meas:.1f} {u}, अपेक्षित {exp:.1f} {u}, अंतर {res:+.1f} {u} "
               f"({n_sig:.1f}σ, σ={sigma:.2f}), CUSUM {cus:+.1f}, t={t} मिनट{drv_hi}; {lab_hi}{gate_hi}।"),
    }


# ----------------------------------------------------------------------------------------------- events
def _event(run_id, t, unit_id, uc, tag, kind, severity, payload, status="open") -> dict:
    st = get_state()
    short = {"unit_1_furnace": "u1", "unit_2_riser": "u2", "unit_3_regenerator": "u3", "unit_4_fractionator": "u4",
             "unit_5_condenser": "u5", "unit_6_stabiliser": "u6"}.get(unit_id, "plant")
    return {"event_id": f"ev_{run_id}_{short}_{kind}_{tag or 'regime'}_{int(t):06d}", "run_id": run_id,
            "time_min": int(t), "unit_id": unit_id, "use_case_id": uc, "tag": tag, "kind": kind,
            "severity": severity, "payload": payload, "status": status, "ts": st.ts(int(t))}


def _regime_events(run_id: str, df: pd.DataFrame) -> list[dict]:
    reg = get_run_regimes(run_id)
    if not reg:
        return []
    det, t = reg["detected_regime"], df["time_min"].to_numpy()
    out = []
    for i in range(1, len(det)):
        if det[i] != det[i - 1]:
            out.append(_event(run_id, t[i], None, None, "regime", "regime_change", "info",
                              {"label": f"Crude switch detected ({det[i - 1]}→{det[i]})", "from": det[i - 1], "to": det[i],
                               "briefing": {"en": f"Crude regime {det[i - 1]}→{det[i]} detected at t={int(t[i])} min; "
                                                  f"adaptive baselines and surrogate switched to {det[i]}.",
                                            "hinglish": f"Crude regime {det[i - 1]}→{det[i]} t={int(t[i])} min par detect hua; "
                                                        f"baselines aur surrogate ab {det[i]} par hain.",
                                            "hi": f"क्रूड रेज़ीम {det[i - 1]}→{det[i]} t={int(t[i])} मिनट पर पहचाना गया; "
                                                  f"बेसलाइन और सरोगेट अब {det[i]} पर हैं।"}}, status="closed"))
    return out


def _rule_events(run_id: str, df: pd.DataFrame) -> list[dict]:
    """Pattern sentinels that are not residual-based: furnace combustion (CO rise at flat O2), fractionator flooding."""
    out, t = [], df["time_min"].to_numpy()
    num = lambda c: pd.to_numeric(df[c], errors="coerce").to_numpy(float) if c in df.columns else None  # noqa: E731
    co, o2 = num("fluegas_CO_ppm"), num("fluegas_O2_pct")
    if co is not None and o2 is not None:
        last = -10 ** 9
        for i in range(10, len(df)):
            if co[i] - co[i - 10] > 50 and abs(o2[i] - o2[i - 10]) < 0.2 and t[i] - last >= REFRACTORY_MIN:
                last = t[i]
                nxt = next_lab_min(run_id, int(t[i]))
                out.append(_event(run_id, t[i], "unit_1_furnace", "UC-05", "fluegas_CO_ppm", "combustion", "warn", {
                    "measured": round(float(co[i]), 1), "d_10min": round(float(co[i] - co[i - 10]), 1),
                    "o2_pct": round(float(o2[i]), 2), "next_lab_min": nxt,
                    "briefing": {
                        "en": f"Flue-gas CO (fluegas_CO_ppm) rose {co[i] - co[i - 10]:+.0f} ppm in 10 min to {co[i]:.0f} ppm "
                              f"while O2 (fluegas_O2_pct) stayed at {o2[i]:.2f} % — incomplete combustion pattern at t={int(t[i])} min.",
                        "hinglish": f"Flue-gas CO (fluegas_CO_ppm) 10 min mein {co[i] - co[i - 10]:+.0f} ppm badh kar {co[i]:.0f} ppm "
                                    f"hua, O2 (fluegas_O2_pct) {o2[i]:.2f} % par flat — incomplete combustion pattern, t={int(t[i])} min.",
                        "hi": f"फ़्लू-गैस CO (fluegas_CO_ppm) 10 मिनट में {co[i] - co[i - 10]:+.0f} ppm बढ़कर {co[i]:.0f} ppm हुआ, "
                              f"O2 (fluegas_O2_pct) {o2[i]:.2f} % पर स्थिर — अपूर्ण दहन पैटर्न, t={int(t[i])} मिनट।"}}))
    dp, t13, t06 = num("dP_reactor_frac"), num("T_tray13_F"), num("T_tray06_F")
    if dp is not None and t13 is not None and t06 is not None:
        last = -10 ** 9
        for i in range(10, len(df)):
            if dp[i] - dp[i - 10] > 0.5 and (t13[i] - t06[i]) < (t13[i - 10] - t06[i - 10]) - 5 and t[i] - last >= REFRACTORY_MIN:
                last = t[i]
                out.append(_event(run_id, t[i], "unit_4_fractionator", "UC-06", "dP_reactor_frac", "flooding_pattern", "warn", {
                    "d_dp_10min": round(float(dp[i] - dp[i - 10]), 2), "tray13_minus_tray06_F": round(float(t13[i] - t06[i]), 1),
                    "next_lab_min": next_lab_min(run_id, int(t[i])),
                    "briefing": {
                        "en": f"Fractionator ΔP (dP_reactor_frac) rose {dp[i] - dp[i - 10]:+.2f} in 10 min while tray 13 − tray 6 "
                              f"temperature difference collapsed to {t13[i] - t06[i]:.1f} °F — flooding pattern at t={int(t[i])} min.",
                        "hinglish": f"Fractionator ΔP (dP_reactor_frac) 10 min mein {dp[i] - dp[i - 10]:+.2f} badha aur tray 13 − tray 6 "
                                    f"ka temperature difference {t13[i] - t06[i]:.1f} °F tak gir gaya — flooding pattern, t={int(t[i])} min.",
                        "hi": f"फ्रैक्शनेटर ΔP (dP_reactor_frac) 10 मिनट में {dp[i] - dp[i - 10]:+.2f} बढ़ा और ट्रे 13 − ट्रे 6 का तापमान अंतर "
                              f"{t13[i] - t06[i]:.1f} °F तक गिर गया — फ्लडिंग पैटर्न, t={int(t[i])} मिनट।"}}))
    return out


def _residual_events(run_id: str, df: pd.DataFrame) -> list[dict]:
    from app.engines.recipe import recipe_for

    reg = get_run_regimes(run_id)
    det = reg["detected_regime"] if reg else ["R3"] * len(df)
    out = []
    for unit_id, tags in UNIT_PRIMARY_TAGS.items():
        for tag in tags:
            d = detection_series(run_id, unit_id, tag)
            if d is None:
                continue
            t = d["time_min"]
            edges = {"breach": np.r_[False, d["breach"][1:] & ~d["breach"][:-1]],
                     "cusum": np.r_[False, d["cusum_mask"][1:] & ~d["cusum_mask"][:-1]]}
            last = {"breach": -10 ** 9, "cusum": -10 ** 9}
            for i in range(len(t)):
                for kind in ("breach", "cusum"):
                    if not edges[kind][i] or t[i] - last[kind] < REFRACTORY_MIN or t[i] < SIGMA_MIN_PERIODS:
                        continue
                    last[kind] = t[i]
                    res, sig, cus = float(d["residual"][i]), float(d["sigma"][i]), float(d["cusum"][i])
                    if not np.isfinite(res):
                        continue
                    rc = root_cause(run_id, tag, i, det[i], sig)
                    nxt = next_lab_min(run_id, int(t[i]))
                    rcp = recipe_for(run_id, int(t[i]), unit_id)
                    gate = rcp["gate"] + (f":{rcp['gate_reason']}" if rcp.get("gate_reason") else "")
                    sev = "alarm" if kind == "breach" and abs(res) > ALARM_SIGMAS * sig else "warn"
                    uc = TAG_USE_CASE.get(tag, UNIT_USE_CASE.get(unit_id))
                    # Round once so the numbers quoted in the briefing text match the payload fields exactly.
                    res_r, sig_r, cus_r = round(res, 2), round(sig, 2), round(cus, 2)
                    meas_r, exp_r = round(float(d["measured"][i]), 2), round(float(d["expected"][i]), 2)
                    payload = {"residual": res_r, "sigma": sig_r, "cusum": cus_r,
                               "expected": exp_r, "measured": meas_r,
                               "expected_source": d["expected_source"], "regime_id": det[i], "root_cause": rc,
                               "next_lab_min": nxt, "recipe_gate": gate,
                               "recipe_id": rcp["recipe_id"] if rcp["gate"] == "ISSUED" else None,
                               "briefing": briefing(tag, kind, res_r, sig_r, cus_r, meas_r, exp_r, int(t[i]), nxt, rc, gate)}
                    out.append(_event(run_id, t[i], unit_id, uc, tag, kind, sev, payload))
                    if rcp["gate"] == "ISSUED":
                        moves = ", ".join(f"{m['sp_tag']} {m['current']:g}→{m['recommended']:g}" for m in rcp["moves"] if m["delta"])
                        dy = rcp["d_yield_pct_feed"]
                        out.append(_event(run_id, t[i], unit_id, uc, tag, "recipe_ready", "info", {
                            "recipe_id": rcp["recipe_id"], "moves": rcp["moves"], "d_yield_pct_feed": dy,
                            "p_on_spec": rcp["p_on_spec"], "next_lab_min": nxt,
                            "briefing": {
                                "en": f"Recipe {rcp['recipe_id']} ready ({det[i]}): {moves}; expected LCO {dy.get('LCO', 0):+.2f} / "
                                      f"HN {dy.get('HN', 0):+.2f} % feed, P(on-spec) LCO {rcp['p_on_spec'].get('LCO', 0):.0%} / "
                                      f"HN {rcp['p_on_spec'].get('HN', 0):.0%}. Advisory — accept or decline in the workbench.",
                                "hinglish": f"Recipe {rcp['recipe_id']} taiyaar ({det[i]}): {moves}; expected LCO {dy.get('LCO', 0):+.2f} / "
                                            f"HN {dy.get('HN', 0):+.2f} % feed, P(on-spec) LCO {rcp['p_on_spec'].get('LCO', 0):.0%} / "
                                            f"HN {rcp['p_on_spec'].get('HN', 0):.0%}. Advisory — workbench mein accept ya decline karein.",
                                "hi": f"रेसिपी {rcp['recipe_id']} तैयार ({det[i]}): {moves}; अपेक्षित LCO {dy.get('LCO', 0):+.2f} / "
                                      f"HN {dy.get('HN', 0):+.2f} % फ़ीड, P(on-spec) LCO {rcp['p_on_spec'].get('LCO', 0):.0%} / "
                                      f"HN {rcp['p_on_spec'].get('HN', 0):.0%}। सलाह मात्र — वर्कबेंच में स्वीकार या अस्वीकार करें।"}}))
    return out


def _fit_key() -> str:
    from app.engines.regime import REGIME_FIT_VERSION
    return f"detect{DETECT_VERSION}:surrogate{SURROGATE_VERSION}:regime{REGIME_FIT_VERSION}"


def compute_detect(run_id: str) -> None:
    """Run the sentinels for a run once per engine version; replaces stale E3 rows, keeps operator decisions."""
    st = get_state()
    con = st.db
    key = _fit_key()
    with st._lock:
        con.execute("CREATE TABLE IF NOT EXISTS detect_meta (run_id TEXT PRIMARY KEY, fit_key TEXT)")
        row = con.execute("SELECT fit_key FROM detect_meta WHERE run_id=?", (run_id,)).fetchone()
    if row and row[0] == key:
        return
    df = st.catalog.load(run_id)
    if df.empty:
        return
    events = _regime_events(run_id, df) + _rule_events(run_id, df) + _residual_events(run_id, df)
    with st._lock:
        con.execute(f"DELETE FROM agent_events WHERE run_id=? AND kind IN ({','.join('?' for _ in E3_KINDS)})",
                    (run_id, *E3_KINDS))
        con.commit()
    for ev in events:
        event_write(con, ev)
    with st._lock:
        con.execute("INSERT OR REPLACE INTO detect_meta (run_id, fit_key) VALUES (?, ?)", (run_id, key))
        con.commit()
    logger.info("detect: %s → %d events (%s)", run_id, len(events), key)


def events_for_run(run_id: str, upto_time_min: Optional[int] = None, unit_id: Optional[str] = None) -> dict:
    compute_detect(run_id)
    st = get_state()
    return {"events": events_read(st.db, run_id, upto_time_min=upto_time_min, unit_id=unit_id)}


def open_breach(run_id: str, unit_id: str, tag: str, time_min: int) -> dict:
    """State of the residual at `time_min`: now-values, whether a breach/cusum episode is open and since when."""
    d = detection_series(run_id, unit_id, tag)
    if d is None:
        return {"residual_now": None, "sigma_now": None, "cusum_now": None, "breach_open": False, "first_breach_min": None}
    t = d["time_min"]
    i = int(np.clip(np.searchsorted(t, time_min, side="right") - 1, 0, len(t) - 1))
    active = d["breach"] | d["cusum_mask"]
    first = None
    if active[i]:
        j = i
        while j > 0 and active[j - 1]:
            j -= 1
        first = int(t[j])
    f = lambda x: None if not np.isfinite(x) else round(float(x), 2)  # noqa: E731
    return {"residual_now": f(d["residual"][i]), "sigma_now": f(d["sigma"][i]), "cusum_now": f(d["cusum"][i]),
            "breach_open": bool(active[i]), "first_breach_min": first, "index": i}
