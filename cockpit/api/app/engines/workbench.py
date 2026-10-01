import json
import logging
import numpy as np

from app.state import get_state
from app.twin import evaluate_twin_state
from app.engines.regime import regime_at
from app.engines.adapt import adaptation_at
from app.engines.recipe import recipe_for
from app.engines.surrogates import get_surrogate_card, UNIT_PRIMARY_TAGS
from app.engines.detect import events_for_run

logger = logging.getLogger(__name__)

def workbench(unit_id: str, run_id: str, time_min: int, window_min: int = 720, step: int = 2) -> dict:
    st = get_state()
    twin = evaluate_twin_state(run_id, time_min)
    
    # Extract unit
    unit = next((u for u in twin["units"] if u["unit_id"] == unit_id), None)
    if not unit:
        return {}
        
    window_start = max(1, time_min - window_min)
    
    # Assemble data
    df = st.catalog.load(run_id)
    mask = (df["time_min"] >= window_start) & (df["time_min"] <= time_min)
    df_win = df[mask].iloc[::step]
    
    t_arr = df_win["time_min"].tolist()
    series = {"time_min": t_arr, "keys": {}}
    
    # Keys
    tags = UNIT_PRIMARY_TAGS.get(unit_id, [])
    for tag in tags:
        if tag in df_win.columns:
            series["keys"][tag] = df_win[tag].tolist()
            
    # Dummy panel data
    panels = [
        {"panel_id": "quality", "title": "Measured vs Expected", "kind": "measured_vs_expected",
         "traces": [{"key": tags[0] if tags else "v", "label": "Measured", "role": "measured", "color": "#1d4ed8"}],
         "hlines": []},
        {"panel_id": "residual", "kind": "residual", "title": "Residual (measured - expected) with 3σ and CUSUM"},
        {"panel_id": "mv", "kind": "mv", "title": "Manipulated variables"},
        {"panel_id": "disturbance", "kind": "disturbance", "title": "Disturbances"},
        {"panel_id": "yield", "kind": "yield", "title": "Yields"}
    ]
    if unit_id == "unit_1_furnace":
        panels.append({"panel_id": "combustion", "kind": "combustion", "title": "Combustion"})
    if unit_id == "unit_4_fractionator":
        panels.append({"panel_id": "tray_profile", "kind": "tray_profile", "title": "Tray Profile"})
        
    analysis = {
        "primary_tag": tags[0] if tags else "",
        "expected_source": "committee",
        "residual_now": 0.0,
        "sigma_now": 0.0,
        "cusum_now": 0.0,
        "breach_open": False,
        "summary": {"en": "Ok", "hinglish": "Theek", "hi": "ठीक है"},
        "events": events_for_run(run_id, time_min, unit_id).get("events", [])
    }
    
    regime = regime_at(run_id, time_min)
    adapt = adaptation_at(run_id, time_min, tags[0] if tags else "LCO_T98_F")
    rcp = recipe_for(run_id, time_min, unit_id)
    
    decisions = unit.get("decisions_needed", [])
    for d in decisions:
        if rcp and rcp.get("recipe_id"):
            d["recipe_id"] = rcp["recipe_id"]
            
    pinn_checks = []
    for k, v in twin.get("pinn_residuals", {}).items():
        if isinstance(v, float) and "UA" not in k: # just an example
            pinn_checks.append({"name": k, "value": round(v, 2), "limit": 1.0, "pass": v < 1.0, "unit": "%"})
            
    models = {
        "committee": adapt,
        "surrogate": get_surrogate_card(regime.get("regime_id", "R3")),
        "pinn_checks": pinn_checks,
        "gate": {"status": rcp.get("gate", "WITHHELD"), "reason": rcp.get("gate_reason")}
    }
    
    return {
        "unit": {
            "unit_id": unit["unit_id"], "seq": unit.get("seq"), "name": unit.get("name"),
            "short_name": unit.get("short_name"), "status": unit.get("status"),
            "status_label": unit.get("status"), "headline_kpi": unit.get("kpi_vs_plan", {}),
            "io": {"inputs": [], "outputs": []},
            "use_cases": [{"id": uc, "number": 1, "title": uc, "panel_id": "quality"} for uc in unit.get("use_case_ids", [])]
        },
        "time": {
            "time_min": time_min, "window_start": window_start, "window_end": time_min,
            "ts": st.ts(time_min), "next_lab_min": ((time_min // 480) + 1) * 480
        },
        "series": series,
        "panels": panels,
        "analysis": analysis,
        "models": models,
        "regime": regime,
        "recipe": rcp,
        "decisions": decisions,
        "citations": st.citations_for(tags[0] if tags else "LCO_T98_F", "adjust")
    }

def scope_snapshot(run_id: str, time_min: int, unit_id: str | None) -> dict:
    twin = evaluate_twin_state(run_id, time_min)
    
    if unit_id:
        rcp = recipe_for(run_id, time_min, unit_id)
        unit = next((u for u in twin["units"] if u["unit_id"] == unit_id), {})
        return {
            "regime": regime_at(run_id, time_min),
            "residual_breach": "None",
            "recipe_moves": rcp.get("moves", []),
            "open_decisions": unit.get("decisions_needed", []),
            "top_tags": UNIT_PRIMARY_TAGS.get(unit_id, [])
        }
    else:
        return {
            "crude_slate": twin.get("crude_slate", {}),
            "needs_attention": twin.get("needs_attention", []),
            "unit_statuses": {u["unit_id"]: u["status"] for u in twin["units"]}
        }
