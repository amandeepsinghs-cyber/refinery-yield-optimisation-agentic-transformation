"""Decision layer — the spine of the decision-first cockpit (DECISION_FIRST_REDESIGN §2, §7).

The screen enables a decision; evidence backs it; data backs the evidence. This module turns what the engines already
produce into first-class ``Decision`` objects:

* soft-sensor estimate + spread gate + recommendation (``state.recommendations``)  → D1 cut point now or wait, D2 trust,
  D9 extra lab sample
* crude-regime posterior (``regime_at``)                                           → D4 has the FCC feed changed after the crude switch
* multi-lever recipe search (``recipe_for``)                                       → D3 coordinated recipe
* sentinels + consequence rules (``events_for_run`` / ``needs_attention``)        → D5 regenerator air, D6 furnace,
  D7 overhead / stabiliser, D8 cross-unit watch items

Every decision names the plant problem it addresses (P1–P4) and the IOCL use case it serves
(``refinery_optimisation_use_cases.md``). A decision the models cannot support is still returned, with
``status="withheld"`` and the reason — saying "not yet" is part of the product (P4).

Advisory only: acting on a decision writes the SQLite audit log, never a control system. No financial wording.
"""
from __future__ import annotations

import json
import math
import re
from typing import Any

import numpy as np

from app.engines.detect import TAG_LABEL, events_for_run, next_lab_min
from app.engines.recipe import _label_unit, _row_at, plausibility_issue, recipe_for, whatif
from app.engines import scripted
from app.engines.regime import regime_at
from app.engines.systems import UNIT_SHORT, clock, needs_attention
from app.state import get_state, now_iso

# ------------------------------------------------------------------------------------------------ vocabulary
PROBLEMS = {
    "P1": "Product quality is known only every 8 h from the lab, so the unit runs blind in between.",
    "P2": "Crude changes every 12–48 h; yesterday's models drift and the right set points for the new crude are unknown.",
    "P3": "A move in one unit shows up hours later in another; section-by-section optimisation misses the consequence.",
    "P4": "An AI that always answers is dangerous; it must say when it does not know and wait for the sample.",
}
# platform id -> (row in refinery_optimisation_use_cases.md, IOCL wording shortened, not paraphrased into marketing)
USE_CASES = {
    "UC-01": ("High-value #1", "FCC / RFCC / INDMAX product-quality inferential"),
    "UC-02": ("High-value #2", "Stabiliser overhead optimisation for C5 recovery"),
    "UC-03": ("High-value #3", "LPG / naphtha C4/C5 split optimisation"),
    "UC-04": ("High-value #4", "Regeneration tracking and event-based root cause"),
    "UC-05": ("High-value #5", "Fired-heater CO and O₂ combustion modelling"),
    "UC-06": ("High-value #6", "Multi-unit energy management"),
    "UC-07": ("High-value #7", "Heat-exchanger UA fouling health"),
    "UC-08": ("High-value #8", "Filter / hydraulic breakthrough prediction"),
    "UC-09": ("High-value #9", "Rotating-equipment health"),
    "UC-10": ("High-value #10", "Furnace coke build-up and hydraulic-constraint prediction"),
    "UC-11": ("High-value #11", "Product soft sensor between lab samples"),
}
# type -> question template, problems, use cases (first = primary), what changes versus today
TYPES: dict[str, dict[str, Any]] = {
    "D1": {"name": "Cut point: move now or wait for the lab", "problem": ["P1"], "uc": ["UC-01", "UC-11"],
           "today": "Lab every 8 h → estimate every minute with a probability of staying on spec"},
    "D2": {"name": "Can the estimate be trusted now?", "problem": ["P4"], "uc": ["UC-11", "UC-01"],
           "today": "A number is always shown → the cockpit says when it does not know and why"},
    "D9": {"name": "Pull an extra lab sample", "problem": ["P1", "P4"], "uc": ["UC-11"],
           "today": "Fixed 8-h sampling → sample when the estimate is least certain"},
    "D4": {"name": "Has the FCC feed changed after the crude switch; is the change finished?", "problem": ["P2"], "uc": ["UC-11", "UC-01"],
           "today": "Declared crude from the schedule → detected crude from unit behaviour, with a probability"},
    "D3": {"name": "Coordinated recipe for the new crude", "problem": ["P2", "P3"], "uc": ["UC-01", "UC-06"],
           "today": "One loop at a time by experience → several set points searched together inside limits"},
    "D5": {"name": "Regenerator air versus severity", "problem": ["P3"], "uc": ["UC-04"],
           "today": "Afterburn noticed on the board → drift flagged against expected with the downstream effect"},
    "D6": {"name": "Furnace preheat", "problem": ["P2", "P3"], "uc": ["UC-05", "UC-10"],
           "today": "Fired duty set by habit → drift against expected flagged with its effect on the riser"},
    "D7": {"name": "Overhead condenser and stabiliser", "problem": ["P3"], "uc": ["UC-02", "UC-03", "UC-07"],
           "today": "C5 loss found in the next lab → drift flagged as it starts"},
    "D8": {"name": "What first; what breaks downstream if nothing is done", "problem": ["P3"],
           "uc": ["UC-06", "UC-08", "UC-09"],
           "today": "Each console sees its own unit → one ranked list with the downstream consequence and time"},
}
STATUSES = ("open", "watch", "withheld", "accepted", "held", "declined", "expired")
UC_BY_UNIT = {"unit_5_condenser": "UC-07", "unit_6_stabiliser": "UC-02", "unit_1_furnace": "UC-05",
              "unit_3_regenerator": "UC-04"}
UNIT_DECISION = {"unit_3_regenerator": "D5", "unit_1_furnace": "D6", "unit_5_condenser": "D7", "unit_6_stabiliser": "D7"}
PROPS = {"LCO_T98_F": ("LCO", "LCO cut point", "SP_LCO_T98", "unit_4_fractionator"),
         "HN_T98_F": ("HN", "heavy-naphtha cut point", "SP_HN_T98", "unit_4_fractionator")}
GATE_TEXT = {"wide": "the estimate is too uncertain (spread W90 above the 14 °F limit)",
             "bimodal": "the models disagree — the estimate has two competing answers",
             "spread_gate": "the estimate is too uncertain (spread above the limit)",
             "novelty": "the unit is operating outside anything the models were trained on",
             "insufficient_data": "the training data has no designed moves of these set points",
             "infeasible": "no move inside the limits keeps both cut points on spec",
             "no_gain": "no move improves on holding",
             "implausible": "the model extrapolates beyond physical range",
             "transition": "the crude transition is not finished",
             "trust_red": "redundant sensors or the lab disagree with the estimate"}
# Trust signals S1–S7 (app/pipeline.py SIGNAL_WORDS), phrased as the check that passes; op = direction of the limit.
SIGNAL_NAMES = {"S1": ("models agree", "≤"), "S2": ("inputs inside training range", "≤"),
                "S3": ("HN–LCO gap", "≥"), "S4": ("lab track record", "≤"), "S5": ("sensor health", "≤"),
                "S6": ("labels for this crude", "≥"), "S7": ("spread ratio", "≤")}
HOLD_MIN = 30          # "Hold 30 min" re-opens the decision afterwards
RECENT_SWITCH_MIN = 720  # a coordinated recipe (D3) is only asked for within 12 h of a crude switch
# Plausibility envelope for a multi-lever recipe prediction (engineering judgement, simulator scale). A recipe whose
# predicted effect sits outside it is withheld rather than shown: the surrogate is extrapolating.


def _use_case(uc: str) -> dict:
    row, title = USE_CASES[uc]
    return {"platform_id": uc, "iocl_row": row, "iocl_title": title}


def _f(x, nd: int = 2):
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    return round(v, nd) if math.isfinite(v) else None


def _base(dtype: str, unit_id: str, key: str, run_id: str, t: int, onset: int) -> dict:
    meta = TYPES[dtype]
    return {
        "id": f"{dtype}-{key}-{run_id}-{onset:04d}", "type": dtype, "type_name": meta["name"], "run_id": run_id,
        "time_min": t, "created_min": onset, "created_label": clock(onset), "unit_id": unit_id,
        "unit_label": UNIT_SHORT.get(unit_id, "Plant"), "question": "", "headline": "", "status": "open",
        "urgency": {"rank": None, "time_to_consequence_min": None, "consequence": None},
        "observed": None, "diagnosed": None, "proposed": {"moves": [], "alternative": None}, "predicted": None,
        "gates": [], "evidence": {"tags": [], "labs": [], "docs": [], "lakehouse": None}, "withheld_reason": None,
        "withheld_text": None, "outcome": None, "action": None,
        "problem": list(meta["problem"]), "problem_text": [PROBLEMS[p] for p in meta["problem"]],
        "use_case": _use_case(meta["uc"][0]), "use_cases": [_use_case(u) for u in meta["uc"]],
        "why_this_exists": meta["today"], "advisory_only": True,
    }


# ------------------------------------------------------------------------------------------------ estimator view
def _est(arrs: dict, prop: str, j: int) -> dict:
    P = lambda k: arrs.get(f"{prop}|{k}")  # noqa: E731

    def g(k):
        x = P(k)
        if x is None:
            return None
        if np.ndim(x) == 0:
            return x.item() if hasattr(x, "item") else x
        return x[j] if j < len(x) else None
    gates = []
    for s in ("S1", "S2", "S3", "S4", "S5", "S6", "S7"):
        ok = g(f"sig|{s}|pass")
        if ok is None:
            continue
        name, op = SIGNAL_NAMES[s]
        val, lim = _f(g(f"sig|{s}|value")), _f(g(f"sig|{s}|limit"))
        if s == "S2" and not ok and val is not None and lim is not None and val <= lim:
            # inputs are inside the envelope, but the GPR member's own spread says it is outside its range
            name = "inputs inside training range (GPR model outside its range)"
        gates.append({"id": s, "name": name, "op": op, "pass": bool(ok), "value": val, "limit": lim})
    return {"mu": _f(g("mean")), "sigma": _f(g("sd")),  # mixture moments (mu/sigma are per committee member)
            "q05": _f(g("q05")), "q95": _f(g("q95")), "w90": _f(g("w90")), "p_on_spec": _f(g("p_on_spec"), 3),
            "trust": str(g("trust")) if g("trust") is not None else None,
            "trust_reason": str(g("trust_reason")) if g("trust_reason") is not None else None,
            "gate": str(g("gate")) if g("gate") is not None else None,
            "gate_reason": str(g("gate_reason")) if g("gate_reason") not in (None, "", "None", "nan") else None,
            "signals": gates}


def _labs(meta: dict, prop: str, t: int) -> tuple[dict | None, list[str]]:
    seen = [l for l in meta.get("labs", []) if l.get("property") == prop and (l.get("lims_time_min") or 1e9) <= t]
    last = seen[-1] if seen else None
    if not last:
        return None, []
    return ({"sample_id": last["sample_id"], "value": _f(last.get("value")), "status": last.get("status"),
             "drawn_label": clock(int(last["draw_time_min"])), "reported_label": clock(int(last["lims_time_min"])),
             "status_reason": last.get("status_reason")}, [last["sample_id"]])


MEMBER_INFO = {   # MODEL_IDS order (app/config.py); wording checked against app/models/*.py
    "bayes_ridge_v1": ("Linear model (Bayesian ridge)", "Straight-line fit on the selected inputs; kept as a baseline"),
    "gpr_v1": ("Gaussian process", "Smooth non-linear fit; its band widens when the inputs move away from the "
                                   "training data"),
    "hybrid_delta_v1": ("Physics + correction (hybrid)", "Physics line from the draw-tray temperature corrected for column "
                                                       "pressure, plus a Gaussian-process correction"),
    "pinn_ens_v1": ("Physics-informed neural nets (5)", "Five small neural nets trained to stay close to the physics line "
                                                         "and to rise with draw-tray temperature; their disagreement "
                                                         "widens the band"),
}
INPUT_LABEL = {"T_tray06_F": "Tray 6 temperature", "T_tray13_F": "Tray 13 temperature",
               "P5_frac_psia": "Fractionator pressure", "Tr_riser_F": "Riser outlet temperature",
               "feed_flow_lb_s": "Feed flow", "MV_PA2": "Pump-around 2 controller output",
                "MV_PA3": "Pump-around 3 controller output"}
# Columns the models picked that have no label in the twin tag table. The two *_MB / mass_balance columns are simulator
# diagnostics (mass-closure residuals), not plant instruments — flagged so nobody presents them as plant data.
EXTRA_COL = {"T_tray02_F": ("Tray 2 temperature", "°F"), "T_tray03_F": ("Tray 3 temperature", "°F"),
             "T_tray04_F": ("Tray 4 temperature", "°F"), "T_tray05_F": ("Tray 5 temperature", "°F"),
             "T_tray08_F": ("Tray 8 temperature", "°F"), "T_tray09_F": ("Tray 9 temperature", "°F"),
             "T_tray12_F": ("Tray 12 temperature", "°F"), "T_tray14_F": ("Tray 14 temperature", "°F"),
             "T_tray19_F": ("Tray 19 temperature", "°F"),
             "reactor_MB": ("Reactor mass-balance residual — simulator diagnostic, not a plant instrument", ""),
             "mass_balance_err_pct": ("Plant-wide mass-closure residual — simulator diagnostic, not a plant instrument", "%")}
SHORT_ID = {"bayes_ridge_v1": "L", "gpr_v1": "G", "hybrid_delta_v1": "H", "pinn_ens_v1": "N"}


def _col_label(col: str) -> tuple[str, str]:
    """(plain name, unit) for a model input column, incl. lag columns '<tag>__lag<L>' / '<tag>__lagmean<L>'."""
    base, _, suf = col.partition("__")
    name, unit = EXTRA_COL.get(base) or (None, None)
    if name is None:
        name, unit = _TWIN_LABELS().get(base, (INPUT_LABEL.get(base) or TAG_LABEL.get(base, base), ""))
    if suf.startswith("lagmean"):
        name = f"{name}, mean of the last {suf[7:]} min"
    elif suf.startswith("lag"):
        name = f"{name}, {suf[3:]} min ago"
    return name, unit


_TWIN_LABEL_CACHE: dict = {}


def _TWIN_LABELS() -> dict:  # noqa: N802
    """tag -> (label, unit) parsed once from the twin tag table (app/twin.py _build_tag_row / _valve_row calls)."""
    if not _TWIN_LABEL_CACHE:
        import inspect
        import app.twin as tw
        src = inspect.getsource(tw)
        for m_ in re.finditer(r'_build_tag_row\(df_win, row, "([^"]+)", "([^"]+)", "[^"]+", "([^"]*)"', src):
            _TWIN_LABEL_CACHE.setdefault(m_.group(1), (m_.group(2), m_.group(3)))
        for m_ in re.finditer(r'_valve_row\("([^"]+)", "([^"]+)"', src):
            _TWIN_LABEL_CACHE.setdefault(m_.group(1), (m_.group(2), "frac"))
        _TWIN_LABEL_CACHE.setdefault("_", ("", ""))
    return _TWIN_LABEL_CACHE


def _formula(mid: str, card: dict, arrs: dict, prop: str, j: int) -> str:
    """The fitted model in one line, with its real numbers (from the model card written at training)."""
    pr = card.get("params") or {}
    lab = lambda c: _col_label(c)[0]  # noqa: E731
    if mid == "bayes_ridge_v1":
        top = list((pr.get("top_coefficients") or {}).items())[:4]
        return (f"T98 = {pr.get('intercept')} °F + Σ coefficient × input (inputs standardised). Largest coefficients: "
                + "; ".join(f"{lab(k)} {v:+.1f} °F per standard deviation" for k, v in top))
    if mid == "gpr_v1":
        rel = card.get("_relevance") or []
        lean = [f"{lab(r['feature'])} ({r['relevance']:.2f})" for r in rel[:3]]
        ign = [lab(r["feature"]) for r in rel if r.get("lengthscale", 0) >= 99]
        return ("Matérn 5/2 kernel over the inputs, trained on " + str(pr.get("n_train", "?")) + " points. Leans most on: "
                + ", ".join(lean) + (f". Effectively ignores: {', '.join(ign)}" if ign else ""))
    if mid == "hybrid_delta_v1":
        ph, de = arrs.get(f"{prop}|phys"), arrs.get(f"{prop}|delta")
        now = (f" Now: physics {float(ph[j]):.1f} °F + correction {float(de[j]):+.1f} °F."
               if ph is not None and de is not None and j < len(ph) else "")
        return (f"Physics part: T98 = {pr.get('a', 0):.1f} + ({pr.get('b', 0):.3f}) × T_corr, where T_corr = "
                f"{pr.get('draw_tray')} + ({pr.get('c', 0):.1f}) × ln({pr.get('p_ref_psia')} / P5_frac_psia). The physics part "
                f"explains {float(pr.get('physics_share_var') or 0) * 100:.0f} % of the variation in training; a Gaussian "
                f"process fits the rest.{now}")
    if mid == "pinn_ens_v1":
        return (f"{pr.get('architecture')}. Loss = fit to labels + {pr.get('lambda_phys')} × distance from the physics "
                f"line + {pr.get('lambda_mono')} × penalty when T98 falls as the draw-tray temperature rises. "
                f"{pr.get('monotonicity_violations')} training minutes still break that rule.")
    return ""


def _explain_models(arrs: dict, prop: str, j: int, run_id: str | None = None, t: int | None = None) -> dict:
    """Everything behind the estimate at minute j, concretely: each trained model, the exact columns it reads, their
    values now, its fitted formula, its output and weight; plus training-data counts."""
    from app.config import MODEL_IDS
    st = get_state()
    P = lambda k: arrs.get(f"{prop}|{k}")  # noqa: E731
    mu, sg, w, adm = P("mu"), P("sigma"), P("weight"), P("admitted")
    b = st.bundle or {}
    cards = (b.get("cards") or {}).get(prop) or {}
    rel = cards.get("gpr_relevance") or []
    row: dict = {}
    if run_id is not None and t is not None:
        try:
            from app.data.lags import apply_lags
            df = st.catalog.load(run_id)
            if not df.empty:
                df = apply_lags(df, b.get("lags"))
                row = _row_at(df, t)[0]
        except Exception:  # noqa: BLE001 — explanation must never break the decision list
            row = {}
    members, used_by = [], {}
    if mu is not None and j < len(mu):
        for i, mid in enumerate(MODEL_IDS[: mu.shape[1]]):
            name, how = MEMBER_INFO.get(mid, (mid, ""))
            card = dict(cards.get(mid) or {})
            card["_relevance"] = rel
            feats = list(card.get("features") or [])
            for c in feats:
                used_by.setdefault(c, []).append(SHORT_ID.get(mid, mid))
            in_mix = bool(adm[i]) if adm is not None and i < len(adm) else True
            wi = float(w[j][i]) if w is not None else 0.0
            members.append({"id": mid, "short": SHORT_ID.get(mid, mid), "name": name, "how": how,
                            "estimate": _f(mu[j][i], 1), "band90": _f(1.645 * sg[j][i], 1), "weight": _f(wi, 3),
                            "role": "blended" if in_mix and wi > 0 else "reference",
                            "n_inputs": len(feats), "formula": _formula(mid, card, arrs, prop, j),
                            "trained_on_runs": len(card.get("training_runs") or [])})
    inputs = []
    for c, who in used_by.items():
        nm, un = _col_label(c)
        v = row.get(c) if row else None
        if c.split("__")[0] in ("V2", "V4", "V6") or (v is not None and un == "frac" and abs(float(v)) > 1.5):
            un = "% open"
        if c.split("__")[0] in ("F5_fuel", "power_CAB", "power_WGC", "dP_reactor_frac", "F_regen_cat", "F_coke"):
            un = "sim. units"   # simulator scale; no plant unit matches the magnitude
        inputs.append({"tag": c, "label": nm, "unit": un, "value": _f(v, 3), "used_by": who})
    inputs.sort(key=lambda x: (-len(x["used_by"]), x["tag"]))
    bias, wsrc = P("bias"), P("weight_source")
    src = str(wsrc[j]) if wsrc is not None and j < len(wsrc) else None
    meta = (b.get("meta") or {}).get(prop) or {}
    ls = (b.get("label_stats") or {}).get(prop) or {}
    return {"members": members,
            "bias": _f(bias[j], 2) if bias is not None and j < len(bias) else None,
            "weight_source": {"out_of_fold": "accuracy on training runs held out from each fit (too few lab results in "
                                             "this run yet to re-weight)",
                              "recent_labs": "accuracy against the most recent accepted lab results"}.get(src, src),
            "sigma_scale": _f(meta.get("sigma_scale"), 2),
            "inputs": inputs, "n_train_labels": ls.get("used"), "n_pinned_excluded": ls.get("pinned_excluded"),
            "n_train_runs": len(b.get("groups") or {}) or None}


def _streak_start(recs: list[dict], t: int, pred) -> int:
    """First time of the unbroken run of recommendations satisfying `pred`, ending at the latest one ≤ t."""
    rs = [r for r in recs if int(r["time_min"]) <= t]
    start = None
    for r in reversed(rs):
        if not pred(r):
            break
        start = int(r["time_min"])
    return start if start is not None else t


def _cites(rec: dict | None) -> list[str]:
    return [f"{c.get('doc_id')} r{c.get('revision')} §{c.get('section')}" for c in (rec or {}).get("citations", [])]


def _gain(rec: dict) -> float:
    m = re.search(r"gain ([\d.]+)", rec.get("rationale") or "")
    return float(m.group(1)) if m else 1.0


# A cut-point move must move its own product's yield in the same direction (lower LCO end point → less LCO).
_OWN_PRODUCT = {"SP_LCO_T98": "LCO", "SP_HN_T98": "HN"}


def _ripple(run_id: str, t: int, unit_id: str, sp_tag: str, sp_after: float, delta: float) -> list[dict]:
    """Downstream effect of a single set-point move from the regime surrogates (E2). Empty if unsupported.

    Physics check: the simulator's fitted yield response to a cut-point set point is negative (documented in
    tests/test_recipe.py) — the opposite of plant practice. Rather than show a number an IOCL engineer would rightly
    question, that entry is withheld with the reason."""
    try:
        w = whatif(run_id, t, unit_id, {sp_tag: sp_after})
    except Exception:  # surrogate missing for this regime: say nothing rather than guess
        return []
    out = []
    own = _OWN_PRODUCT.get(sp_tag)
    for k, v in (w.get("d_yield_pct_feed") or {}).items():
        if k == own and v and delta and np.sign(v) != np.sign(delta):
            out.append({"what": f"{k} yield", "delta": None, "unit": "% feed", "source": "regime surrogate",
                        "note": "not shown: this simulator's yield response has the opposite sign to plant practice "
                                "for a cut-point move (see test_recipe); verify on plant data before quoting"})
            continue
        if v and abs(v) >= 0.01:
            out.append({"what": f"{k} yield", "delta": _f(v, 3), "unit": "% feed", "source": "regime surrogate"})
    for k, lab in (("d_fuel_lb_s", "furnace fuel"), ("d_power_MW", "compressor power")):
        v = w.get(k)
        if v and abs(v) >= 0.01:
            out.append({"what": lab, "delta": _f(v, 3), "unit": "sim. units",
                        "source": "regime surrogate"})
    return out


# ------------------------------------------------------------------------------------------------ builders
def _cut_point(run_id: str, t: int, prop: str, arrs: dict, meta: dict, j: int, attention: list[dict]) -> list[dict]:
    st = get_state()
    short, lbl, sp_tag, unit_id = PROPS[prop]
    recs = st.recommendations(run_id, prop, time_min=t)
    rec = next((r for r in reversed(recs) if int(r["time_min"]) <= t and int(r.get("valid_until_min", t)) >= t), None)
    if rec is None:
        return []
    e = _est(arrs, prop, j)
    lab, lab_ids = _labs(meta, prop, t)
    nl = next_lab_min(run_id, t)
    nl_txt = f"next lab {clock(nl)} (in {nl - t} min)" if nl is not None else "no lab scheduled"
    att = next((a for a in attention if a.get("tag") == prop), None)
    observed = {"tag": prop, "label": TAG_LABEL.get(prop, prop), "estimate": e["mu"], "sigma": e["sigma"],
                "plan": _f(rec.get("sp_before")), "delta_vs_plan": _f((e["mu"] or 0) - (rec.get("sp_before") or 0)),
                "q95": e["q95"], "spec_max": _f((e["q95"] or 0) + (rec.get("margin_before_F") or 0)), "unit": "°F",
                "since_label": att.get("time_label") if att else None, "line": att.get("line") if att else None,
                "since_min": att.get("time_min") if att else None,
                "last_lab": lab, "next_lab_label": clock(nl) if nl is not None else None,
                "next_lab_in_min": (nl - t) if nl is not None else None}
    evidence = {"tags": [prop, sp_tag], "labs": lab_ids, "docs": _cites(rec),
                "lakehouse": f"fcc_gold.lab_alignment · run {run_id}"}
    gates = [{"id": "spread", "name": "spread W90", "op": "≤", "pass": (rec.get("gate") or {}).get("status") == "PASS",
              "value": _f((rec.get("gate") or {}).get("w90")), "limit": 14.0, "unit": "°F"}] + e["signals"]
    out: list[dict] = []
    status = rec.get("status")
    if status == "OPEN" and rec.get("action") in ("LOWER", "RAISE"):
        onset = _streak_start(recs, t, lambda r: r.get("status") == "OPEN" and r.get("action") == rec["action"])
        d = _base("D1", unit_id, f"u4-{short.lower()}", run_id, t, onset)
        verb = "Lower" if rec["action"] == "LOWER" else "Raise"
        sp0, sp1, dl = _f(rec["sp_before"]), _f(rec["sp_after"]), _f(rec["delta_F"])
        d["question"] = f"{verb} the {lbl} now, or wait for the lab?"
        d["headline"] = f"{verb} {lbl} {dl:+.1f} °F ({sp0 + 1e-9:.1f} → {sp1 + 1e-9:.1f})"   # half-up, as the screen
        mu_after = _f((e["mu"] or 0) + _gain(rec) * (dl or 0))
        d["observed"], d["evidence"], d["gates"] = observed, evidence, gates
        d["diagnosed"] = {"text": rec.get("rationale"), "trust": rec.get("trust"), "conservative": rec.get("conservative")}
        d["proposed"] = {"moves": [{"tag": sp_tag, "label": f"{short} T98 set point", "from": sp0, "to": sp1,
                                    "delta": dl, "unit": "°F"}],
                         "alternative": f"Wait for the lab — {nl_txt}; chance on spec stays at "
                                        f"{_pp(e['p_on_spec'])} meanwhile"}
        d["predicted"] = {"mu_before": e["mu"], "mu_after": mu_after, "sigma": e["sigma"],
                          "p_on_spec_before": e["p_on_spec"], "p_on_spec_after": _f(rec.get("p_on_spec_after"), 3),
                          "w90": e["w90"], "spec_max": observed["spec_max"], "margin_after": _f(rec.get("margin_after_F")),
                          "target": _f(rec.get("target_F")),
                          "ripple": _ripple(run_id, t, unit_id, sp_tag, sp1, dl or 0.0)}
        horizon = att.get("horizon_min") if att else int(rec.get("valid_until_min", t + 30)) - t
        d["urgency"] = {"rank": None, "time_to_consequence_min": horizon,
                        "consequence": ((att or {}).get("consequence") if rec["action"] == "LOWER"
                                        and "lighter than expected" not in ((att or {}).get("consequence") or "") else None)
                        or (f"{short} T98 could go over spec: the upper end of the estimate is above the limit" if rec["action"] == "LOWER" else
                            (f"{short} T98 is running {abs((rec.get('target_F') or 0) - (e['mu'] or 0)):.1f} °F below its "
                             f"{rec.get('target_F'):.1f} °F target: the cut stays lighter than planned until it is raised"
                             if rec.get("target_F") is not None else
                             f"{short} cut lighter than it needs to be ({_f(rec.get('margin_before_F'), 1)} °F inside spec): "
                             f"product goes to the heavier stream every hour the cut point is not raised")),
                        "decide_by_label": clock(int(rec.get("valid_until_min", t + 30)))}
        out.append(d)
    elif status == "WITHHELD" or e["trust"] == "RED":
        onset = _streak_start(recs, t, lambda r: r.get("status") == "WITHHELD")
        d = _base("D2", unit_id, f"u4-{short.lower()}", run_id, t, onset)
        reason = (rec.get("gate") or {}).get("reason") or ("trust_red" if e["trust"] == "RED" else "spread_gate")
        d["status"], d["withheld_reason"] = "withheld", reason
        d["withheld_text"] = GATE_TEXT.get(reason) or (rec.get("gate") or {}).get("message") or reason
        d["question"] = f"Can the {short} estimate be trusted right now?"
        d["headline"] = f"Not yet — hold the {lbl}; {GATE_TEXT.get(reason, reason)}"
        d["observed"], d["evidence"], d["gates"] = observed, evidence, gates
        d["diagnosed"] = {"text": rec.get("rationale"), "trust": e["trust"], "trust_reason": e["trust_reason"]}
        d["proposed"] = {"moves": [], "alternative": f"Hold the set point; {nl_txt}"}
        d["predicted"] = {"mu_before": e["mu"], "sigma": e["sigma"], "p_on_spec_before": e["p_on_spec"], "w90": e["w90"],
                          "spec_max": observed["spec_max"]}
        d["urgency"] = {"rank": None, "time_to_consequence_min": (nl - t) if nl is not None else None,
                        "consequence": "Moving on an untrusted estimate risks over- or under-treating", "decide_by_label": None}
        out.append(d)
    # D9 — the estimate is least certain and the next lab is far away: a sample now is worth more than at the schedule.
    w90_lim = 14.0
    uncertain = (e["w90"] or 0) >= 0.9 * w90_lim or e["trust"] in ("AMBER", "RED") or status == "WITHHELD"
    if uncertain and nl is not None and nl - t >= 120:
        onset = _streak_start(recs, t, lambda r: (r.get("gate") or {}).get("w90", 0) >= 0.9 * w90_lim
                              or r.get("trust") in ("AMBER", "RED") or r.get("status") == "WITHHELD")
        d = _base("D9", "unit_4_fractionator", f"lab-{short.lower()}", run_id, t, onset)
        d["question"] = f"Pull an extra {short} sample now instead of waiting for {clock(nl)}?"
        d["headline"] = f"Pull an extra {short} T98 sample now — spread {e['w90'] or 0:.1f} °F, next lab in {nl - t} min"
        d["observed"], d["evidence"], d["gates"] = observed, evidence, gates
        d["diagnosed"] = {"text": f"Spread W90 {e['w90'] or 0:.1f} °F against a {w90_lim:.0f} °F limit; trust "
                                  f"{e['trust']}. A lab result now would re-anchor the estimate {nl - t} min earlier."}
        d["proposed"] = {"moves": [], "sample": {"property": prop, "when": "now"},
                         "alternative": f"Keep the schedule — {nl_txt}"}
        d["predicted"] = {"mu_before": e["mu"], "sigma": e["sigma"], "p_on_spec_before": e["p_on_spec"], "w90": e["w90"]}
        d["urgency"] = {"rank": None, "time_to_consequence_min": nl - t,
                        "consequence": f"Unit runs {nl - t} min on an uncertain {short} estimate", "decide_by_label": None}
        out.append(d)
    if out:
        ex = _explain_models(arrs, prop, j, run_id, t)
        for d in out:
            d["models"] = ex
    return out


def _crude(run_id: str, t: int) -> list[dict]:
    reg = regime_at(run_id, t) or {}
    if not reg:
        return []
    p = reg.get("p_regime") or {}
    pmax = max(p.values()) if p else 0.0
    dvd, trans, nov = reg.get("declared_vs_detected"), reg.get("transition_pct"), reg.get("novelty") or 0.0
    if dvd == "match" and (trans is None or trans >= 100) and nov < 0.5:
        return []
    onset = int(reg.get("detected_at_min") or t)
    d = _base("D4", "unit_2_riser", "crude", run_id, t, onset)
    det, dec = reg.get("regime_id"), reg.get("declared_regime_id")
    d["question"] = f"Is the unit on {det} as detected, or {dec} as declared?" if dvd != "match" else \
        "Is the crude transition finished?"
    d["headline"] = (f"Confirm crude: detected {det} {pmax * 100:.0f} % vs declared {dec}" if dvd != "match"
                     else f"Crude transition {trans} % — hold recipe changes until settled")
    d["observed"] = {"regime_id": det, "regime_label": reg.get("regime_label"), "p_regime": p,
                     "declared_regime_id": dec, "transition_pct": trans, "novelty": nov}
    d["diagnosed"] = {"text": "Posterior from unit behaviour (coke/feed, riser ΔT, fuel/feed, regenerator T, "
                              "conversion, tray ΔT) with a 15-min dwell before a switch is declared."}
    d["proposed"] = {"moves": [], "confirm": det, "alternative": "Keep the declared crude and its models"}
    d["urgency"] = {"rank": None, "time_to_consequence_min": 60,
                    "consequence": "Models for the wrong crude bias every estimate and recipe", "decide_by_label": None}
    d["evidence"] = {"tags": ["conversion_pct", "Treg_F", "F_coke"], "labs": [], "docs": [],
                     "lakehouse": "fcc_gold.v_crude_switches"}
    if nov >= 0.5:
        d["status"], d["withheld_reason"], d["withheld_text"] = "withheld", "novelty", GATE_TEXT["novelty"]
        d["question"] = "Is this a crude the models know?"
        d["headline"] = (f"Crude unlike any trained regime (novelty {nov:.2f}; nearest {det} {pmax * 100:.0f} %, "
                         f"declared {dec}) — recipes withheld; request the crude assay")
        d["proposed"] = {"moves": [], "alternative": "Hold recipe changes; run on the declared crude's limits"}
    return [d]


def _plausible(r: dict) -> str | None:
    """Why the recipe is implausible: the recipe engine now withholds it at the source (gate_reason 'implausible');
    the check is repeated here for an ISSUED payload from an older cache."""
    if r.get("gate_reason") == "implausible":
        return r.get("implausible_detail") or "predicted effects outside physical range"
    return plausibility_issue(r) if r.get("gate") == "ISSUED" else None


def _recipe(run_id: str, t: int) -> list[dict]:
    reg = regime_at(run_id, t) or {}
    sw = reg.get("detected_at_min")
    if sw is None or t - int(sw) > RECENT_SWITCH_MIN:
        return []
    r = recipe_for(run_id, t, "unit_4_fractionator")
    d = _base("D3", "unit_4_fractionator", "recipe", run_id, t, int(sw))
    d["question"] = f"Which set points for {reg.get('regime_id')} {reg.get('regime_label') or ''}".strip() + "?"
    d["evidence"] = {"tags": [m["sp_tag"] for m in r.get("moves", [])] or (r.get("data_support") or {}).get("searched", []),
                     "labs": [], "docs": _cites(r), "lakehouse": "fcc_gold.model_registry"}
    d["urgency"] = {"rank": None, "time_to_consequence_min": None,
                    "consequence": "Running the new crude on the old crude's set points", "decide_by_label": None}
    d["diagnosed"] = {"text": r.get("explanation"), "data_support": r.get("data_support")}
    why_not = _plausible(r)
    cap = float((get_state().s["recommend"] or {}).get("max_move_F", 5.0))
    big = [m for m in r.get("moves", []) if m.get("sp_tag") in ("SP_LCO_T98", "SP_HN_T98") and abs(m.get("delta") or 0) > cap + 1e-6]
    if big and not why_not:   # 6 Oct: the same 5 °F SOP step the single cut-point advice obeys
        why_not = ", ".join(f"{m['label']} {m['delta']:+.1f} °F exceeds the {cap:.0f} °F SOP step" for m in big)
    if r.get("gate") == "ISSUED" and not why_not:
        d["headline"] = "Coordinated move: " + ", ".join(f"{m['label']} {m['delta']:+.1f} {m['unit']}" for m in r["moves"])
        d["proposed"] = {"moves": [{"tag": m["sp_tag"], "label": m["label"], "from": m["current"], "to": m["recommended"],
                                    "delta": m["delta"], "unit": m["unit"]} for m in r["moves"]],
                         "alternative": "Keep current set points"}
        d["predicted"] = {"p_on_spec": r.get("p_on_spec"), "predicted": r.get("predicted"),
                          "ripple": [{"what": f"{k} yield", "delta": v, "unit": "% feed", "source": "regime surrogate"}
                                     for k, v in (r.get("d_yield_pct_feed") or {}).items() if v]}
        d["recipe_id"] = r.get("recipe_id")
    else:
        reason = "implausible" if why_not else (r.get("gate_reason") or "insufficient_data")
        d["status"], d["withheld_reason"] = "withheld", reason
        d["withheld_text"] = (f"{GATE_TEXT['implausible']} ({why_not}); needs the lever-move batch"
                              if why_not else GATE_TEXT.get(reason, reason))
        d["headline"] = f"No coordinated recipe yet — {d['withheld_text']}"
        d["proposed"] = {"moves": [], "alternative": "Use the single cut-point decision; keep other set points"}
    return [d]


def _strip_since(line: str | None) -> str:
    s = re.sub(r"\s*since \d\d:\d\d$", "", line or "")
    return s[:1].lower() + s[1:] if s[:2] != s[:2].upper() else s


def _merge_samples(ds: list[dict]) -> list[dict]:
    """One 'pull an extra sample' decision for the fractionator, not one per property."""
    d9 = [d for d in ds if d["type"] == "D9"]
    if len(d9) < 2:
        return ds
    first = min(d9, key=lambda d: d["created_min"])
    props = [d["proposed"]["sample"]["property"] for d in d9]
    names = " and ".join(p.split("_")[0] for p in props)
    w = max((d["predicted"] or {}).get("w90") or 0 for d in d9)
    first["id"] = f"D9-lab-{first['run_id']}-{first['created_min']:04d}"
    first["question"] = first["question"].replace(first["proposed"]["sample"]["property"].split("_")[0], names, 1)
    first["headline"] = re.sub(r"extra \w+ T98 sample", f"extra {names} T98 samples", first["headline"])
    first["proposed"]["sample"] = {"properties": props, "when": "now"}
    first["predicted"]["w90"] = w
    first["related"] = [{"property": d["observed"]["tag"], "w90": (d["predicted"] or {}).get("w90"),
                         "p_on_spec": (d["predicted"] or {}).get("p_on_spec_before"),
                         "estimate": d["observed"].get("estimate"), "sigma": d["observed"].get("sigma")} for d in d9]
    o = first["observed"]
    first["observed"] = {"next_lab_label": o.get("next_lab_label"), "next_lab_in_min": o.get("next_lab_in_min"),
                         "last_lab": None, "line": " · ".join(
                             f"{r['property'].split('_')[0]} {r['estimate']:.1f} ± {r['sigma']:.1f} °F, P(on-spec) "
                             f"{(r['p_on_spec'] or 0) * 100:.0f} %" for r in first["related"] if r["estimate"] is not None)}
    first["predicted"] = {"w90": w, "p_on_spec_before": min((r["p_on_spec"] or 1) for r in first["related"])}
    first["urgency"]["consequence"] = f"Unit runs {o.get('next_lab_in_min')} min on uncertain {names} estimates"
    first["evidence"]["tags"] = props
    return [d for d in ds if d["type"] != "D9"] + [first]


def _watch(run_id: str, t: int, attention: list[dict], covered: set[str]) -> list[dict]:
    out = []
    for a in attention:
        if a.get("tag") in covered:
            continue
        uid = a.get("unit_id")
        dtype = UNIT_DECISION.get(uid) or ("D8" if a.get("downstream_unit_id") not in (None, uid) else None)
        if dtype is None:
            continue
        d = _base(dtype, uid, f"{uid.split('_')[1]}-{a.get('tag')}", run_id, t, int(a.get("time_min") or t))
        if dtype != "D8" and uid in UC_BY_UNIT:
            d["use_case"] = _use_case(UC_BY_UNIT[uid])
        down = UNIT_SHORT.get(a.get("downstream_unit_id"), "")
        d["question"] = {"D5": "Rebalance regenerator air against riser severity?",
                         "D6": "Trim the feed preheat to set catalyst-to-oil for the new crude?",
                         "D7": ("Move the overhead temperature target to keep the condenser inside its cooling duty?"
                                if uid == "unit_5_condenser"
                                else "Adjust the stabiliser overhead temperature for C5 recovery?"),
                         }.get(dtype, f"Act on the {UNIT_SHORT.get(uid, '').lower()} now, before it reaches the "
                                      f"{down.lower()}?")
        d["observed"] = {"tag": a.get("tag"), "label": TAG_LABEL.get(a.get("tag"), a.get("tag")), "line": a.get("line"),
                         "since_label": a.get("time_label"), "severity": a.get("severity")}
        d["urgency"] = {"rank": None, "time_to_consequence_min": a.get("horizon_min"), "consequence": a.get("consequence"),
                        "decide_by_label": None, "downstream_unit_id": a.get("downstream_unit_id"), "loop": a.get("loop")}
        d["evidence"] = {"tags": [a.get("tag")], "labs": [], "docs": [], "lakehouse": "fcc_gold.agent_events",
                         "event_id": a.get("event_id")}
        r = None
        if dtype in ("D5", "D6", "D7"):
            try:
                r = recipe_for(run_id, t, uid)
            except Exception:
                r = None
        if r is not None and r.get("gate") != "ISSUED":
            reason = r.get("gate_reason") or "insufficient_data"
            d["status"], d["withheld_reason"] = "withheld", reason
            d["withheld_text"] = GATE_TEXT.get(reason, reason)
            d["headline"] = f"Watch {_strip_since(a.get('line'))} — no move proposed yet"
            d["diagnosed"] = {"text": r.get("explanation")}
            d["proposed"] = {"moves": [], "alternative": "Watch; the board operator acts on experience"}
        else:
            d["status"] = "watch"
            d["headline"] = f"Watch {_strip_since(a.get('line'))}"
            d["diagnosed"] = {"text": a.get("consequence")}
            d["proposed"] = {"moves": [], "alternative": "Watch"}
        out.append(d)
    return out


# ------------------------------------------------------------------------------------------------ actions (audit)
def _db():
    st = get_state()
    st.db.execute("CREATE TABLE IF NOT EXISTS decision_actions (id INTEGER PRIMARY KEY AUTOINCREMENT, decision_id TEXT,"
                  " run_id TEXT, time_min INTEGER, action TEXT, user TEXT, note TEXT, ts TEXT, audit_id INTEGER,"
                  " snapshot TEXT)")
    return st.db


def _actions(run_id: str) -> dict[str, dict]:
    rows = _db().execute("SELECT decision_id, time_min, action, user, note, ts, audit_id FROM decision_actions "
                         "WHERE run_id=? ORDER BY id", (run_id,)).fetchall()
    return {r[0]: {"time_min": r[1], "action": r[2], "user": r[3], "note": r[4], "ts": r[5], "audit_id": r[6]}
            for r in rows}


def _overlay(d: dict, acts: dict[str, dict], t: int) -> dict:
    a = acts.get(d["id"])
    if not a or a["time_min"] > t:
        return d
    d["action"] = {**a, "time_label": clock(int(a["time_min"]))}
    if a["action"] == "hold" and t >= a["time_min"] + HOLD_MIN:
        d["action"]["reopened"] = True
        return d
    d["status"] = {"accept": "accepted", "hold": "held", "decline": "declined"}[a["action"]]
    return d


def act(decision_id: str, action: str, run_id: str, time_min: int, user: str = "operator", note: str = "") -> dict:
    if action not in ("accept", "hold", "decline"):
        raise ValueError("action must be accept | hold | decline")
    d = next((x for x in build(run_id, time_min)["decisions"] if x["id"] == decision_id), None)
    if d is None:
        raise KeyError(decision_id)
    if action == "accept" and d["status"] in ("withheld", "watch"):
        raise PermissionError(f"decision is {d['status']}; there is no move to accept")
    st = get_state()
    aid = st.audit(user, f"decision {action}", decision_id,
                   {"note": note, "type": d["type"], "unit_id": d["unit_id"], "moves": d["proposed"]["moves"],
                    "problem": d["problem"], "use_case": d["use_case"]["platform_id"], "control_system_write": False,
                    "scripted": bool(d.get("scripted")), "gain_source": d.get("gain_source")})
    db = _db()
    db.execute("INSERT INTO decision_actions(decision_id, run_id, time_min, action, user, note, ts, audit_id, snapshot)"
               " VALUES (?,?,?,?,?,?,?,?,?)", (decision_id, run_id, int(time_min), action, user, note, now_iso(), aid,
                                              json.dumps(d, default=str)))
    db.commit()
    return {"ok": True, "audit_id": aid, "decision_id": decision_id, "status": action,
            "note": "recorded in the audit log only; nothing is written to any control system"}


# ------------------------------------------------------------------------------------------------ how AI enables it
def _step(kind: str, name: str, did: str) -> dict:
    """kind: agent (rule-based detection or trigger; shown as "Rule-based") | ml (learned model) | check (gate) | optimiser (search) | genai (Gemini)."""
    return {"kind": kind, "name": name, "did": did}


def _pp(x) -> str:
    """Probability as the screen shows it: never 0 % or 100 % (a Gaussian has no certainty)."""
    v = (x or 0) * 100
    return "> 99 %" if v >= 99.5 else "< 1 %" if v < 0.5 else f"{v:.0f} %"


def _enabled_by(d: dict, reg: dict) -> list[dict]:
    """The chain of agents, models and checks that made this decision possible — in plain words, with numbers."""
    o, p, t = d.get("observed") or {}, d.get("predicted") or {}, d["type"]
    g_pass = sum(1 for g in d["gates"] if g["pass"])
    regime = (f"{reg.get('regime_id')} {reg.get('regime_label') or ''} at "
              f"{max((reg.get('p_regime') or {'_': 0}).values()) * 100:.0f} %").strip() if reg else "unknown"
    steps: list[dict] = []
    if o.get("since_label") and t not in ("D4",):
        lab = ""
        if o.get("tag") in PROPS and o.get("since_min") is not None:
            nl = next_lab_min(d["run_id"], int(o["since_min"]))
            if nl is not None:
                h = (nl - int(o["since_min"])) / 60
                lab = f" — {h:.1f} h before the next lab ({clock(nl)})"
        steps.append(_step("agent", "Anomaly detection", f"Flagged {o.get('label') or o.get('tag')} moving away from "
                                                         f"expected at {o['since_label']}{lab}"))
    if t in ("D1", "D2", "D9"):
        mem = (d.get("models") or {}).get("members") or []
        n_mix = sum(1 for m in mem if m.get("role") == "blended")
        name = (f"Soft-sensor committee ({len(mem)} models, {n_mix} blended)" if mem and n_mix < len(mem)
                else f"Soft-sensor committee ({len(mem) or 4} models)")
        steps.append(_step("ml", name,
                           f"Estimates the lab value every minute: {o['estimate']:.1f} ± {(o.get('sigma') or 0):.1f} °F"
                           + ("; the linear model is shown for reference only" if mem and n_mix < len(mem) else "")
                           if o.get("estimate") is not None else f"Estimates LCO and HN every minute: {o.get('line')}"))
        if reg and reg.get("scripted"):
            steps.append(_step("ml", "Crude family (scripted in the demo)",
                               f"Follows the lab assay: {reg.get('regime_id')} {reg.get('regime_label') or ''}; feeds the "
                               "'labels for this crude' check"))
        else:
            steps.append(_step("ml", "Crude-regime model", f"Recognises the crude from unit behaviour: {regime}; feeds "
                                                           "the 'labels for this crude' check"))
        names = ", ".join(g.get("name") or g.get("id") for g in d["gates"])
        steps.append(_step("check", "Trust checks", f"{g_pass} of {len(d['gates'])} pass ({names})"))
    if t == "D1":
        mv = ((d.get("proposed") or {}).get("moves") or [{}])[0]
        tgt, mu0, mu1 = p.get("target"), p.get("mu_before"), p.get("mu_after")
        dl = mv.get("delta") or 0.0
        cap = float((get_state().s["recommend"] or {}).get("max_move_F", 5.0))
        chance = f"chance on spec {_pp(p.get('p_on_spec_before'))} → {_pp(p.get('p_on_spec_after'))}"
        if tgt is not None and mu0 is not None and mu1 is not None:
            short_of = abs(mu1 - tgt) > float((get_state().s["recommend"] or {}).get("target_deadband_F", 1.0))
            capped = abs(abs(dl) - cap) < 1e-6
            tail = (f"; the {cap:.0f} °F SOP step stops it short, so a second step follows" if short_of and capped
                    else " — on target" if not short_of else "")
            txt = (f"Aims at the {tgt:.1f} °F target, never below 95 % chance on spec: {mu0:.1f} → {mu1:.1f} °F{tail}. "
                   f"{chance[0].upper() + chance[1:]}")
        else:
            txt = f"Smallest move inside the {cap:.0f} °F SOP step that keeps at least 95 % chance on spec: {chance}"
        steps.append(_step("optimiser", "Set-point search", txt))
    if t == "D2":
        steps.append(_step("check", "Spread gate", f"Withholds advice: {d.get('withheld_text')}"))
    if t == "D9":
        steps.append(_step("agent", "Sample trigger", f"Next lab {o.get('next_lab_label')}; a sample now re-anchors the "
                                                            f"estimate {o.get('next_lab_in_min')} min earlier"))
    if t == "D4":
        steps.append(_step("ml", "Crude family (scripted in the demo)" if reg and reg.get("scripted") else "Crude-regime model",
                           (f"Follows the lab assay: {regime}" if reg and reg.get("scripted")
                            else f"Posterior over four crude families: {regime}") + f"; novelty {(o.get('novelty') or 0):.2f}"))
        steps.append(_step("agent", "Feed-change check", "Compares detected with the declared schedule; 15-min dwell "
                                                          "before declaring a switch"))
    if t == "D3":
        steps.append(_step("ml", "Crude-specific response models", f"Fitted per crude regime ({regime})"))
        steps.append(_step("optimiser", "Multi-set-point search", "Searches several set points together inside IOW, "
                                                                  "step and training limits"))
    if t in ("D5", "D6", "D7", "D8"):
        steps.append(_step("agent", "Consequence check", f"Traces the consequence downstream: {d['urgency'].get('consequence')}"))
        if t != "D8":
            steps.append(_step("optimiser", "Set-point search", "Not run — " + (d.get("withheld_text") or "no move data")))
    if d["status"] == "withheld" and t in ("D3", "D4"):
        steps.append(_step("check", "Plausibility / novelty check", f"Withholds: {d.get('withheld_text')}"))
    steps.append(_step("genai", "Gemini", "Explains the decision in English, Hinglish or Hindi with the SOP and lab "
                                         "behind it; answers what happens if you hold"))
    return steps


# ------------------------------------------------------------------------------------------------ levers
# The set points / manipulated variables each decision would move (unit page ③ "each lever with its allowed range").
_LEVERS_BY_TAG = {"LCO_T98_F": ["SP_LCO_T98"], "HN_T98_F": ["SP_HN_T98"], "T2_preheat_F": ["SP_T_preheat_F"],
                  "dT_cyc_reg_F": ["Fair"], "Treg_F": ["Fair"], "conversion_pct": ["SP_T_riser_ROT_F"],
                  "MV_cw_flow": ["SP_T_overhead"], "eff_C5": ["MV_reflux_ratio"]}

# Real-world check (owner, 3 Oct): the cockpit only recommends settings that operators actually move day to day on that
# unit. Each lever carries a plain label and the reason it is one of the unit's main settings.
_PA = ("Pumparound duty", "One of the main settings on the main fractionator: removes heat and sets the internal "
       "traffic of the column. Usually moved by advanced process control.")
LEVER_ROLE: dict[str, tuple[str, str]] = {
    "SP_T_riser_ROT_F": ("Riser outlet temperature", "The main setting operators adjust on the riser reactor: sets "
                         "severity — conversion, gasoline, LPG and coke. Moved every shift."),
    "SP_LCO_T98": ("LCO cut-point target (via LCO draw)", "One of the main settings operators adjust on the main "
                   "fractionator: the LCO end point is held through the LCO draw rate and draw temperature."),
    "SP_HN_T98": ("Heavy-naphtha cut-point target (via HN draw)", "One of the main settings operators adjust on the main "
                  "fractionator: the heavy-naphtha end point is held through its draw rate and draw temperature."),
    "SP_T_preheat_F": ("Feed preheat", "One of the main settings operators adjust on the feed furnace: lower preheat "
                       "means more catalyst circulation (catalyst-to-oil), more conversion and a cooler regenerator. "
                       "Bounded by the feed-nozzle (licensor) limit."),
    "Fair": ("Regenerator air (excess O₂ / afterburn)", "One of the main settings operators adjust on the regenerator: "
             "sets the coke burn and excess O₂; air is trimmed when cyclone temperatures (afterburn) rise."),
    "SP_T_overhead": ("Overhead temperature target", "One of the main settings operators adjust at the column overhead: "
                      "sets the gasoline end point and the load on the condenser. Cooling water itself stays at fixed "
                      "duty."),
    "MV_reflux_ratio": ("Stabiliser reflux", "One of the main settings operators adjust on the stabiliser: sets the "
                        "LPG / gasoline split and C5 recovery."),
    "MV_PA1": _PA, "MV_PA2": _PA, "MV_PA3": _PA, "MV_PA4": _PA,
}
# Real handles the cockpit never recommends — fixed in practice, set by planning, or not in the simulator.
NEVER_RECOMMENDED = [
    {"setting": "Condenser cooling-water flow", "why": "kept at fixed duty; watched only as a limit"},
    {"setting": "Feed rate", "why": "set by the planning department; treated as a limit"},
    {"setting": "Catalyst addition", "why": "a real handle, but not in the simulator"},
]


def _lever_tags(d: dict) -> list[str]:
    tags = [m["tag"] for m in (d.get("proposed") or {}).get("moves", []) if m.get("tag")]
    if not tags and d.get("type") == "D3":
        tags = [t for t in (d.get("evidence") or {}).get("tags", []) if t.startswith(("SP_", "MV_")) or t == "Fair"]
    if not tags:
        tags = _LEVERS_BY_TAG.get(((d.get("observed") or {}).get("tag")) or "", [])
    # Never offer a setting that is static in practice as a lever.
    return [t for t in dict.fromkeys(tags) if t != "MV_cw_flow"]


def _levers(d: dict, row: dict) -> list[dict]:
    """Each lever: label, current value, its allowed range (integrity operating window from config.yaml) and why it is
    one of the unit's main operator settings."""
    iow = get_state().s.get("iow", {}) or {}
    out = []
    for tag in _lever_tags(d):
        label, unit = _label_unit(tag)
        label, role = LEVER_ROLE.get(tag, (label, None))
        cur = row.get(tag)
        cur = float(cur) if cur is not None and np.isfinite(float(cur)) else None
        w = iow.get(tag)
        lo = hi = None
        if isinstance(w, (list, tuple)) and len(w) == 2:
            lo, hi = float(w[0]), float(w[1])
        elif isinstance(w, dict) and "rel" in w and cur is not None:
            lo, hi = cur * (1 - float(w["rel"])), cur * (1 + float(w["rel"]))
        out.append({"tag": tag, "label": label, "unit": unit, "current": None if cur is None else round(cur, 2),
                    "lo": None if lo is None else round(lo, 2), "hi": None if hi is None else round(hi, 2),
                    "source": "integrity operating window" if w is not None else None, "role": role})
    return out


# ------------------------------------------------------------------------------------------------ orchestration
_ORDER = {"open": 0, "held": 1, "withheld": 2, "watch": 3, "accepted": 4, "declined": 5, "expired": 6}


def build(run_id: str, time_min: int) -> dict:
    """All decisions at (run, minute), ranked: open first, then by time to consequence."""
    st = get_state()
    v = st.run(run_id)
    t = int(time_min)
    events = events_for_run(run_id, upto_time_min=t).get("events", [])
    attention = needs_attention([e for e in events if e.get("status") == "open"], limit=12)
    decisions: list[dict] = []
    if v:
        arrs, meta = v
        j = st.index_of(arrs, t)
        for prop in PROPS:
            decisions += _cut_point(run_id, t, prop, arrs, meta, j, attention)
        decisions = _merge_samples(decisions)
    decisions += _crude(run_id, t)
    decisions += _recipe(run_id, t)
    covered = {d["observed"]["tag"] for d in decisions if d.get("observed") and d["observed"].get("tag")}
    covered |= set(PROPS) if v else set()
    decisions += _watch(run_id, t, attention, covered)
    df = st.catalog.load(run_id)
    row = _row_at(df, t)[0] if not df.empty else {}
    decisions = scripted.apply(decisions, row)
    acts = _actions(run_id)
    decisions = [_overlay(d, acts, t) for d in decisions]
    reg = regime_at(run_id, t) or {}
    for d in decisions:
        if not d.get("scripted"):
            d["enabled_by"] = _enabled_by(d, reg)
        d["levers"] = _levers(d, row)
    big = 10 ** 6
    decisions.sort(key=lambda d: (_ORDER.get(d["status"], 9), d["urgency"].get("time_to_consequence_min") or big))
    for i, d in enumerate(decisions, 1):
        d["urgency"]["rank"] = i
    counts = {s: sum(d["status"] == s for d in decisions) for s in STATUSES}
    return {"run_id": run_id, "time_min": t, "clock": clock(t), "counts": counts, "decisions": decisions,
            "problems": PROBLEMS, "advisory_only": True, "never_recommended": NEVER_RECOMMENDED,
            "provenance": {"source": "simulated", "engines": ["soft-sensor committee", "spread gate S1–S7",
                                                              "regime E1", "surrogates E2", "sentinels E3", "recipe E4"]}}


def coverage(run_id: str, time_min: int) -> list[dict]:
    """Use-case lens: which IOCL use cases are exercised by a decision at this minute (honest: 'not claimed' rows too)."""
    ds = build(run_id, time_min)["decisions"]
    rows = []
    for uc, (row, title) in USE_CASES.items():
        hits = [d for d in ds if any(u["platform_id"] == uc for u in d["use_cases"])]
        rows.append({"platform_id": uc, "iocl_row": row, "iocl_title": title,
                     "decisions": [{"id": d["id"], "type": d["type"], "status": d["status"]} for d in hits],
                     "state": "active" if any(d["status"] in ("open", "held", "accepted") for d in hits)
                     else ("watching" if hits else "quiet")})
    rows.append({"platform_id": None, "iocl_row": "—", "iocl_title": "Coker, alkylation, gas turbines, flare, pipelines",
                 "decisions": [], "state": "not claimed"})
    return rows


def get(run_id: str, time_min: int, decision_id: str) -> dict | None:
    return next((d for d in build(run_id, time_min)["decisions"] if d["id"] == decision_id), None)


__all__ = ["build", "get", "act", "coverage", "PROBLEMS", "USE_CASES", "TYPES"]

