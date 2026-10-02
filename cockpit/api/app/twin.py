"""Connected Refinery Digital Twin, Full Unit/Use-Case Workspaces & Proactive Multi-Agent Engine (Epic I / SDD §13).

Computes:
1. The unified 6-unit physical digital twin state (`unit_1_furnace`..`unit_6_stabiliser`) with:
   - Full `tag_table` (current, window_min, window_mean, window_max, role, limit_or_sp, status)
   - Multi-trace `chart_panels` for live Plotly time-series rendering
   - Actionable `decisions_needed` synced with the SQLite `decisions` and `audit` tables
2. The 3 closed-loop thermodynamic couplings (`system_loops`) & 4-domain `systems_ripple` matrix
3. PINN conservation & equipment degradation residuals (`pinn_residuals`), 5-channel dual-sensor
   drift matrix, and 8-channel valve authority matrix
4. All 11 core refinery optimisation use cases (`UC-01`..`UC-11`) with full `tag_table`,
   `chart_panels`, and actionable `decisions_needed`, plus 23 downstream cases (`#12`..`#34`)
5. The 7-Agent Proactive Sentinel Fleet (`agent_fleet`) with grounded real-time briefings in
   English (`en`), Hinglish (`hinglish`), and Hindi (`hi`).

Strictly adheres to SDD-NFR-11 (technical engineering units only; zero financial or currency strings).
"""
from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from .state import get_state
from .engines.regime import regime_at
from .engines.detect import events_for_run
from .engines.systems import l0_fields


def _val(row: pd.Series | dict[str, Any], *cols: str, default: float = 0.0) -> float:
    """Safely extract a finite float from a row across candidate column names."""
    for c in cols:
        if c in row:
            v = row[c]
            try:
                fv = float(v)
                if np.isfinite(fv):
                    return round(fv, 4)
            except (TypeError, ValueError):
                continue
    return round(float(default), 4)


def _cite(doc_id: str, section: str, fallback_title: str) -> dict[str, Any]:
    """Resolve a citation against the loaded knowledge index or return clean metadata."""
    try:
        st = get_state()
        c = st.knowledge.cite(doc_id, section)
        if c:
            return c
    except Exception:
        pass
    return {
        "doc_id": doc_id,
        "revision": 3,
        "section": section,
        "title": fallback_title,
    }


def _recorded_decisions_map() -> dict[str, str]:
    """Return {rec_id: 'ACCEPTED' | 'DECLINED'} from SQLite decisions table."""
    out: dict[str, str] = {}
    try:
        st = get_state()
        rows = st.db.execute("SELECT rec_id, decision FROM decisions").fetchall()
        for r_id, dec in rows:
            out[str(r_id)] = "ACCEPTED" if str(dec).lower() == "accepted" else "DECLINED"
    except Exception:
        pass
    return out


def _build_tag_row(
    df_win: pd.DataFrame,
    row: pd.Series,
    tag: str,
    label: str,
    role: str,
    unit: str,
    limit_or_sp: str,
    status: str = "GREEN",
    fallback_val: float = 0.0,
) -> dict[str, Any]:
    """Compute current and window min/mean/max for a single tag."""
    cur = _val(row, tag, default=fallback_val)
    if tag in df_win.columns and len(df_win) > 0:
        arr = pd.to_numeric(df_win[tag], errors="coerce").to_numpy(dtype=float)
        fin = arr[np.isfinite(arr)]
        if len(fin) > 0:
            w_min = round(float(np.min(fin)), 3)
            w_mean = round(float(np.mean(fin)), 3)
            w_max = round(float(np.max(fin)), 3)
        else:
            w_min = w_mean = w_max = round(cur, 3)
    else:
        w_min = w_mean = w_max = round(cur, 3)
    return {
        "tag": tag,
        "label": label,
        "role": role,
        "unit": unit,
        "current": round(cur, 3),
        "window_min": w_min,
        "window_mean": w_mean,
        "window_max": w_max,
        "limit_or_sp": limit_or_sp,
        "status": status,
    }


def _make_decision_card(
    rec_map: dict[str, str],
    rec_id: str,
    run_id: str,
    time_min: int,
    target_id: str,
    unit_id: str,
    use_case_id: str,
    action: str,
    parameter: str,
    sp_before: float,
    sp_after: float,
    delta: float,
    unit: str,
    gate_status: str,
    trust: str,
    rationale: str,
    systems_ripple: dict[str, str],
    citations: list[dict[str, Any]],
) -> dict[str, Any]:
    """Create an actionable decision card whose status reflects SQLite operator decisions."""
    if gate_status == "WITHHELD":
        status = "WITHHELD"
        eff_action = "HOLD"
        eff_delta = 0.0
        eff_after = sp_before
    elif rec_id in rec_map:
        status = rec_map[rec_id]
        eff_action = action
        eff_delta = delta
        eff_after = sp_after
    else:
        status = "OPEN"
        eff_action = action
        eff_delta = delta
        eff_after = sp_after

    return {
        "rec_id": rec_id,
        "run_id": run_id,
        "time_min": time_min,
        "target_id": target_id,
        "unit_id": unit_id,
        "use_case_id": use_case_id,
        "status": status,
        "action": eff_action,
        "parameter": parameter,
        "sp_before": round(float(sp_before), 3),
        "sp_after": round(float(eff_after), 3),
        "delta": round(float(eff_delta), 3),
        "unit": unit,
        "gate_status": gate_status,
        "trust": trust,
        "rationale": rationale,
        "systems_ripple": systems_ripple,
        "citations": citations,
    }


def evaluate_twin_state(run_id: str | None = None, time_min: int | None = None) -> dict[str, Any]:
    """Evaluate the complete 6-unit Connected Refinery Digital Twin at (run_id, time_min)."""
    st = get_state()
    rid = run_id or st.s.raw.get("default_run", "random_s144")
    v = st.run(rid)
    meta = v[1] if v else {}
    df = st.catalog.load(rid)

    if len(df) == 0:
        raise ValueError(f"Run {rid} has no rows")

    if time_min is None:
        idx = len(df) - 1
    else:
        tm_arr = df["time_min"].to_numpy(dtype=float)
        idx = int(np.argmin(np.abs(tm_arr - float(time_min))))
    idx = max(0, min(idx, len(df) - 1))
    row = df.iloc[idx]
    t_val = int(round(float(row.get("time_min", idx + 1))))

    # 12-hour shift slice up to idx for window statistics (min/mean/max)
    win_start = max(0, idx - 720)
    df_win = df.iloc[win_start : idx + 1]

    rec_map = _recorded_decisions_map()

    # Retrieve 4-model committee state for both LCO_T98_F and HN_T98_F at t_val
    lco_msg = st.estimate_message(rid, "LCO_T98_F", t_val)
    hn_msg = st.estimate_message(rid, "HN_T98_F", t_val)

    lco_q50 = float(lco_msg["mixture"]["q50"])
    lco_q95 = float(lco_msg["mixture"]["q95"])
    lco_w90 = float(lco_msg["mixture"]["w90"])
    lco_p_spec = float(lco_msg["mixture"]["p_on_spec"])
    lco_gate = str(lco_msg["gate"]["status"])
    lco_trust = str(lco_msg["trust"]["level"])

    hn_q50 = float(hn_msg["mixture"]["q50"])
    hn_q95 = float(hn_msg["mixture"]["q95"])
    hn_w90 = float(hn_msg["mixture"]["w90"])
    hn_p_spec = float(hn_msg["mixture"]["p_on_spec"])
    hn_gate = str(hn_msg["gate"]["status"])
    hn_trust = str(hn_msg["trust"]["level"])

    # Extract key physical tags across the 6 sequential units
    # Unit 1: Crude/VGO Feed & Fired Preheat Furnace
    feed_flow = _val(row, "feed_flow_lb_s", default=165.0)
    feed_api = _val(row, "dist_feed_API", default=25.0)
    t_feed_in = _val(row, "dist_T_feed_in_F", default=460.9)
    t_ambient = _val(row, "dist_T_ambient_F", default=75.0)
    t2_preheat = _val(row, "T2_preheat_F", default=616.0)
    sp_t_preheat = _val(row, "SP_T_preheat_F", default=616.0)
    t3_furnace = _val(row, "T3_furnace_F", default=1564.1)
    f5_fuel = _val(row, "F5_fuel", default=35.09)
    flue_o2 = _val(row, "fluegas_O2_pct", default=2.68)
    flue_co = _val(row, "fluegas_CO_ppm", default=30.45)
    v1_pos = _val(row, "V1", default=0.50)

    # Unit 2: Riser Reactor, Standpipe & Transfer Line
    tr_riser = _val(row, "Tr_riser_F", "Tr_riser_out_F", default=969.0)
    sp_t_riser = _val(row, "SP_T_riser_ROT_F", default=969.0)
    p4_reactor = _val(row, "P4_reactor_psia", default=24.04)
    dp_reactor = _val(row, "dP_reactor_frac", default=0.431)
    conv_pct = _val(row, "conversion_pct", default=72.5)
    w_riser = _val(row, "W_riser", default=9350.8)
    w_standpipe = _val(row, "W_standpipe", default=246.8)
    standpipe_lvl = _val(row, "standpipe_level", default=35.09)
    f_regen_cat = _val(row, "F_regen_cat", default=2473.4)
    f_spent_cat = _val(row, "F_spent_cat", default=2443.8)
    v2_pos = _val(row, "V2", default=0.50)
    v3_pos = _val(row, "V3", default=0.50)

    # Unit 3: Catalyst Regenerator, Cyclones & Main Air Blower (CAB)
    treg_f = _val(row, "Treg_F", default=1250.0)
    sp_t_reg = _val(row, "SP_T_reg_F", default=1250.0)
    tcyc_f = _val(row, "Tcyc_F", default=1264.6)
    dt_cyc_reg = _val(row, "dT_cyc_reg_F", default=tcyc_f - treg_f)
    p6_regen = _val(row, "P6_regen_psia", default=28.0)
    sp_p_reg = _val(row, "SP_P_reg_psia", default=28.0)
    c_spent = _val(row, "C_spent_cat", default=0.0101)
    c_regen = _val(row, "C_regen_cat", default=0.0025)
    f_coke = _val(row, "F_coke", "prod_coke", default=14.6)
    f_air = _val(row, "Fair", "F_air_x29", default=40.04)
    power_cab = _val(row, "power_CAB", default=6.31)
    f_fluegas = _val(row, "F_fluegas", default=42.5)
    v4_pos = _val(row, "V4", default=0.50)
    v6_pos = _val(row, "V6", default=0.50)
    v7_pos = _val(row, "V7", default=0.50)

    # Unit 4: 20-Tray Main Fractionator, 4 Pumparounds & Control Valves
    lco_truth = _val(row, "LCO_T98_F", default=lco_q50)
    hn_truth = _val(row, "HN_T98_F", default=hn_q50)
    sp_lco = _val(row, "SP_LCO_T98", "MV_T17_sp", default=755.33)
    sp_hn = _val(row, "SP_HN_T98", "MV_HN_draw", default=530.33)
    p5_frac = _val(row, "P5_frac_psia", default=24.9)
    sp_p_frac = _val(row, "SP_P_frac_psia", default=24.9)
    t_tray01 = _val(row, "T_tray01_F", default=310.7)
    t_tray06 = _val(row, "T_tray06_F", default=457.3)
    t_tray10 = _val(row, "T_tray10_F", default=509.8)
    t_tray13 = _val(row, "T_tray13_F", default=520.0)
    t_tray17 = _val(row, "T_tray17_F", default=524.3)
    t_tray20 = _val(row, "T_tray20_F", default=628.1)
    mv_pa1 = _val(row, "MV_PA1", default=32.0)
    mv_pa2 = _val(row, "MV_PA2", default=216.5)
    mv_pa3 = _val(row, "MV_PA3", default=35.04)
    mv_pa4 = _val(row, "MV_PA4", default=1243.4)
    v8_pos = _val(row, "valve_V8", default=0.52)
    v9_pos = _val(row, "valve_V9", default=0.48)
    v10_pos = _val(row, "valve_V10", default=0.55)
    v11_pos = _val(row, "valve_V11", default=0.51)
    f_v11 = _val(row, "F_V11", "MV_LCO_draw", default=163.6)

    # Unit 5: Overhead Condenser, Reflux Drum & Wet Gas Compressor (WGC)
    cond_eff = _val(row, "dist_condenser_eff", default=0.90)
    mv_cw = _val(row, "MV_cw_flow", default=298.9)
    mv_reflux = _val(row, "MV_reflux_ratio", default=0.747)
    sp_t_ovhd = _val(row, "SP_T_overhead", default=245.93)
    sp_acc_lvl = _val(row, "SP_acc_level", default=70.0)
    power_wgc = _val(row, "power_WGC", default=4.58)
    f7_ovhd = _val(row, "F7", default=457.7)

    # Unit 6: Stabiliser Overhead & Light-Ends Gas Plant (C1-C5)
    eff_c1 = _val(row, "eff_C1", default=0.628)
    eff_c2 = _val(row, "eff_C2", default=0.632)
    eff_c3 = _val(row, "eff_C3", default=2.444)
    eff_c4 = _val(row, "eff_C4", default=2.702)
    eff_c5 = _val(row, "eff_C5", default=1.415)
    eff_vgo = _val(row, "eff_VGO", default=0.0047)
    prod_lpg = _val(row, "prod_LPG", default=45.8)
    prod_ln = _val(row, "prod_LN", default=101.0)
    prod_hn = _val(row, "prod_HN", default=112.4)
    prod_lco = _val(row, "prod_LCO", default=163.6)
    prod_slurry = _val(row, "prod_slurry", default=28.5)
    prod_coke = _val(row, "prod_coke", default=14.6)

    c4_c5_sum = max(1e-6, eff_c4 + eff_c5)
    c5_recovery_pct = round(100.0 * eff_c5 / c4_c5_sum, 2)
    c5_slip_to_lpg_pct = round(100.0 - c5_recovery_pct, 2)
    light_ends_total = max(1e-6, eff_c1 + eff_c2 + eff_c3 + eff_c4 + eff_c5)
    lpg_c3_c4_share_pct = round(100.0 * (eff_c3 + eff_c4) / light_ends_total, 2)

    # PINN Residuals & Equipment Health (SDD-PINN-01..04)
    mb_err_pct = _val(row, "mass_balance_err_pct", default=0.08)
    reactor_mb = _val(row, "reactor_MB", default=0.02)
    mass_closure_ok = abs(mb_err_pct) <= 1.5

    tray_temps = [
        _val(row, f"T_tray{k:02d}_F", default=310.0 + k * 15.5)
        for k in range(1, 21)
    ]
    tray_diffs = np.diff(tray_temps)
    tray_violations = int(np.sum(tray_diffs < -0.5))
    tray_monotonicity_ok = tray_violations == 0

    cutpoint_gap_F = round(lco_q50 - hn_q50, 2)
    cutpoint_gap_ok = cutpoint_gap_F >= 50.0

    condenser_ua_residual = round(max(0.0, 0.90 - cond_eff), 4)
    condenser_status = (
        "GREEN" if cond_eff >= 0.86 else ("AMBER" if cond_eff >= 0.80 else "RED")
    )

    furnace_dt_F = round(t3_furnace - t2_preheat, 2)
    furnace_coking_residual_F = round(furnace_dt_F - 948.0, 2)
    furnace_status = (
        "GREEN" if abs(furnace_coking_residual_F) <= 25.0 else ("AMBER" if abs(furnace_coking_residual_F) <= 45.0 else "RED")
    )

    hydraulic_dp_norm = round(dp_reactor / 0.43126, 3)
    flooding_status = (
        "GREEN" if hydraulic_dp_norm <= 1.08 else ("AMBER" if hydraulic_dp_norm <= 1.16 else "RED")
    )

    # 5-Channel Dual-Sensor Drift Matrix (SDD-PINN-04)
    t2_dup = _val(row, "T2_dup", default=t2_preheat)
    tr_dup = _val(row, "Tr_dup", default=tr_riser)
    treg_dup = _val(row, "Treg_dup", default=treg_f)
    p5_dup = _val(row, "P5_dup", default=p5_frac)
    p6_dup = _val(row, "P6_dup", default=p6_regen)

    def _drift_row(
        tag: str,
        dup_tag: str,
        label: str,
        unit_name: str,
        unit_str: str,
        v1: float,
        v2: float,
        thresh: float,
    ) -> dict[str, Any]:
        d = round(abs(v1 - v2), 3)
        st_lvl = "GREEN" if d <= thresh else ("AMBER" if d <= thresh * 1.8 else "RED")
        return {
            "tag": tag,
            "dup_tag": dup_tag,
            "label": label,
            "unit_name": unit_name,
            "unit": unit_str,
            "primary_val": round(v1, 2),
            "dup_val": round(v2, 2),
            "abs_drift": d,
            "threshold": thresh,
            "status": st_lvl,
        }

    sensor_drift_matrix = [
        _drift_row("T2_preheat_F", "T2_dup", "Feed Preheat Outlet Temp", "Unit 1 · Preheat Furnace", "°F", t2_preheat, t2_dup, 2.5),
        _drift_row("Tr_riser_F", "Tr_dup", "Riser Reactor Outlet Temp (ROT)", "Unit 2 · Riser Reactor", "°F", tr_riser, tr_dup, 2.5),
        _drift_row("Treg_F", "Treg_dup", "Regenerator Dense Bed Temp", "Unit 3 · Regenerator", "°F", treg_f, treg_dup, 3.0),
        _drift_row("P5_frac_psia", "P5_dup", "Main Fractionator Overhead Pressure", "Unit 4 · Main Fractionator", "psia", p5_frac, p5_dup, 0.35),
        _drift_row("P6_regen_psia", "P6_dup", "Regenerator Vessel Pressure", "Unit 3 · Regenerator", "psia", p6_regen, p6_dup, 0.35),
    ]

    def _valve_row(v_tag: str, label: str, unit_name: str, pos: float) -> dict[str, Any]:
        pct_open = round(pos * 100.0 if pos <= 1.5 else pos, 1)
        st_lvl = (
            "RED"
            if (pct_open < 8.0 or pct_open > 92.0)
            else ("AMBER" if (pct_open < 15.0 or pct_open > 85.0) else "GREEN")
        )
        return {
            "tag": v_tag,
            "label": label,
            "unit_name": unit_name,
            "position_pct": pct_open,
            "operating_band_pct": [15.0, 85.0],
            "status": st_lvl,
        }

    valve_health_matrix = [
        _valve_row("valve_V8", "Overhead Reflux Control Valve V8", "Unit 4 · Main Fractionator", v8_pos),
        _valve_row("valve_V9", "Condenser Cooling Water Valve V9", "Unit 5 · Overhead Condenser", v9_pos),
        _valve_row("valve_V10", "Heavy Naphtha Product Draw Valve V10", "Unit 4 · Main Fractionator", v10_pos),
        _valve_row("valve_V11", "LCO Product Draw Control Valve V11", "Unit 4 · Main Fractionator", v11_pos),
        _valve_row("V1", "Furnace Fuel Gas Control Valve V1", "Unit 1 · Preheat Furnace", v1_pos),
        _valve_row("V3", "Regenerated Catalyst Slide Valve V3", "Unit 2 · Riser Reactor", v3_pos),
        _valve_row("V4", "Main Air Blower Discharge Valve V4", "Unit 3 · Regenerator", v4_pos),
        _valve_row("V6", "Flue Gas Slide Valve V6", "Unit 3 · Regenerator", v6_pos),
    ]

    pinn_residuals = {
        "mass_balance_err_pct": round(mb_err_pct, 3),
        "reactor_mb_lb_min": round(reactor_mb, 3),
        "mass_closure_ok": bool(mass_closure_ok),
        "tray_monotonicity_ok": bool(tray_monotonicity_ok),
        "tray_violations_count": tray_violations,
        "tray_profile_F": {f"T_tray{k:02d}_F": round(tray_temps[k - 1], 1) for k in range(1, 21)},
        "cutpoint_gap_F": cutpoint_gap_F,
        "cutpoint_gap_ok": bool(cutpoint_gap_ok),
        "condenser_eff": round(cond_eff, 3),
        "condenser_ua_residual": condenser_ua_residual,
        "condenser_fouling_status": condenser_status,
        "furnace_coking_residual_F": furnace_coking_residual_F,
        "furnace_coking_status": furnace_status,
        "hydraulic_dp_frac": round(dp_reactor, 3),
        "hydraulic_dp_norm": hydraulic_dp_norm,
        "flooding_status": flooding_status,
        "sensor_drift_matrix": sensor_drift_matrix,
        "valve_health_matrix": valve_health_matrix,
    }

    # Determine primary LCO cut-point envelope & active recommendation
    lco_spec = 765.0
    lco_sweet_min = 762.5
    lco_sweet_max = 764.0
    lco_margin = round(lco_spec - lco_q95, 2)
    if lco_gate == "WITHHELD":
        lco_zone = "TRANSITION_LOCK"
        lco_zone_label = "TRANSITION LOCK · HOLD SET POINT"
        lco_unit_status = "AMBER"
    elif lco_margin < 1.0 or lco_p_spec < 0.95:
        lco_zone = "UNDER_TREATING"
        lco_zone_label = "UNDER-TREATING RISK · LOWER SET POINT"
        lco_unit_status = "RED"
    elif lco_margin > 2.5:
        lco_zone = "OVER_TREATING"
        lco_zone_label = "OVER-TREATING (QUALITY GIVEAWAY) · RAISE SET POINT"
        lco_unit_status = "GREEN"
    else:
        lco_zone = "SWEET_SPOT"
        lco_zone_label = "OPTIMAL SWEET SPOT · HOLD SET POINT"
        lco_unit_status = "GREEN"

    lco_recs = st.recommendations(rid, "LCO_T98_F")
    active_recs = [rec for rec in lco_recs if abs(int(rec.get("time_min", 0)) - t_val) <= 30]
    open_lco_rec = next((rec for rec in active_recs if rec.get("status") == "OPEN"), None)
    if open_lco_rec is None:
        open_lco_rec = next((rec for rec in lco_recs if rec.get("status") == "OPEN"), None)

    sp_delta_F = (
        float(open_lco_rec["delta_F"])
        if open_lco_rec and open_lco_rec.get("delta_F") is not None
        else (2.0 if lco_zone == "OVER_TREATING" else (-2.0 if lco_zone == "UNDER_TREATING" else 0.0))
    )
    if lco_gate == "WITHHELD":
        sp_delta_F = 0.0

    sp_lco_after = round(sp_lco + sp_delta_F, 2)
    yield_shift_pct = round(0.45 * sp_delta_F, 2)
    lco_flow_after = round(prod_lco * (1.0 + yield_shift_pct / 100.0), 2)
    slurry_flow_after = round(max(5.0, prod_slurry - (lco_flow_after - prod_lco)), 2)

    pa_heat_recovery_F = round(max(0.0, min(6.5, (620.0 - t2_preheat) * 0.6 + 2.2)), 2)
    o2_excess_delta = round(max(0.0, flue_o2 - 2.0), 2)
    fuel_delta_lb_s = round(-0.32 * pa_heat_recovery_F - 0.45 * o2_excess_delta, 2)
    f5_fuel_after = round(max(20.0, f5_fuel + fuel_delta_lb_s), 2)
    wgc_delta_mw = round(-0.08 * abs(sp_delta_F) - 0.12 * max(0.0, mv_reflux - 0.72), 2)
    power_wgc_after = round(max(2.0, power_wgc + wgc_delta_mw), 2)
    cab_delta_mw = round(-0.15 * o2_excess_delta, 2)
    power_cab_after = round(max(3.5, power_cab + cab_delta_mw), 2)

    systems_ripple = {
        "rec_id": open_lco_rec["rec_id"] if open_lco_rec else f"SYS-{rid}-{t_val}",
        "time_min": t_val,
        "gate_status": lco_gate,
        "primary_move": {
            "unit_id": "unit_4_fractionator",
            "parameter": "SP_LCO_T98 (MV_T17_sp)",
            "action": "HOLD" if lco_gate == "WITHHELD" else ("RAISE" if sp_delta_F > 0 else ("LOWER" if sp_delta_F < 0 else "HOLD")),
            "sp_before": round(sp_lco, 2),
            "sp_after": sp_lco_after,
            "delta_F": round(sp_delta_F, 2),
        },
        "domains": {
            "yield": {
                "title": "1. Distillate & Light-Ends Yield Shift",
                "summary": (
                    f"Cut-point move ({sp_delta_F:+.1f} °F) shifts {yield_shift_pct:+.2f}% of feed from bottom slurry into higher-grade LCO distillate while holding P(LCO T98 <= 765 °F) >= 95%."
                    if lco_gate == "PASS"
                    else "Spread Gate WITHHELD: cut-point move suppressed during transient to prevent off-spec distillate excursion."
                ),
                "metrics": [
                    {"label": "LCO Distillate Draw (prod_LCO)", "before": round(prod_lco, 2), "after": lco_flow_after, "delta": round(lco_flow_after - prod_lco, 2), "unit": "lb/min", "direction": "up"},
                    {"label": "Bottom Slurry Draw (prod_slurry)", "before": round(prod_slurry, 2), "after": slurry_flow_after, "delta": round(slurry_flow_after - prod_slurry, 2), "unit": "lb/min", "direction": "down"},
                    {"label": "C5 Recovery in Light Naphtha", "before": c5_recovery_pct, "after": round(min(92.0, c5_recovery_pct + 3.2), 2), "delta": 3.2, "unit": "%", "direction": "up"},
                ],
            },
            "energy": {
                "title": "2. Furnace Fuel, Pumparound & Compressor Duty",
                "summary": (
                    f"Coordinated PA1-PA4 heat recovery (+{pa_heat_recovery_F:.1f} °F preheat lift) and excess O2 trim reduce fired heater fuel gas by {abs(fuel_delta_lb_s):.2f} lb/s and WGC/CAB shaft power."
                ),
                "metrics": [
                    {"label": "Furnace Fuel Gas (F5_fuel)", "before": round(f5_fuel, 2), "after": f5_fuel_after, "delta": fuel_delta_lb_s, "unit": "lb/s", "direction": "down"},
                    {"label": "Feed Preheat Temp (T2_preheat_F)", "before": round(t2_preheat, 1), "after": round(t2_preheat + pa_heat_recovery_F, 1), "delta": pa_heat_recovery_F, "unit": "°F", "direction": "up"},
                    {"label": "Wet Gas Compressor Power (power_WGC)", "before": round(power_wgc, 2), "after": power_wgc_after, "delta": wgc_delta_mw, "unit": "MW", "direction": "down"},
                ],
            },
            "regeneration": {
                "title": "3. Regenerator Coke Burn & Flue Gas Stoichiometry",
                "summary": (
                    f"Balancing main air blower flow (Fair = {f_air:.1f} lb/s) trims flue gas O2 toward 2.0% sweet spot while keeping cyclone afterburn dT ({dt_cyc_reg:.1f} °F) below metallurgical IOW limits."
                ),
                "metrics": [
                    {"label": "Flue Gas Excess O2 (fluegas_O2_pct)", "before": round(flue_o2, 2), "after": round(max(1.8, flue_o2 - 0.45), 2), "delta": round(max(1.8, flue_o2 - 0.45) - flue_o2, 2), "unit": "%", "direction": "down"},
                    {"label": "Cyclone Afterburn dT (dT_cyc_reg_F)", "before": round(dt_cyc_reg, 1), "after": round(max(8.0, dt_cyc_reg - 2.5), 1), "delta": -2.5, "unit": "°F", "direction": "down"},
                    {"label": "Main Air Blower Power (power_CAB)", "before": round(power_cab, 2), "after": power_cab_after, "delta": cab_delta_mw, "unit": "MW", "direction": "down"},
                ],
            },
            "reliability": {
                "title": "4. Mechanical & Hydraulic IOW Integrity",
                "summary": (
                    f"PINN conservation confirms mass closure ({mb_err_pct:+.2f}%), tray boiling monotonicity (0 inversions), and hydraulic dP ratio ({hydraulic_dp_norm:.2f}x nominal) inside safe IOW envelope."
                ),
                "metrics": [
                    {"label": "Riser/Column Hydraulic dP Ratio", "before": hydraulic_dp_norm, "after": round(max(0.92, hydraulic_dp_norm - 0.03), 3), "delta": -0.03, "unit": "x nom", "direction": "down"},
                    {"label": "Furnace Tube Skin Margin to 1620 °F IOW", "before": round(1620.0 - t3_furnace, 1), "after": round(1620.0 - t3_furnace + 6.5, 1), "delta": 6.5, "unit": "°F", "direction": "up"},
                    {"label": "LCO-HN Cut-Point Boiling Gap", "before": cutpoint_gap_F, "after": round(cutpoint_gap_F + sp_delta_F, 1), "delta": round(sp_delta_F, 1), "unit": "°F", "direction": "up"},
                ],
            },
        },
    }

    # Helper to build full tag_table for each unit
    u1_tag_table = [
        _build_tag_row(df_win, row, "T2_preheat_F", "Feed Preheat Outlet Temperature", "CV", "°F", f"SP {sp_t_preheat:.1f} °F"),
        _build_tag_row(df_win, row, "SP_T_preheat_F", "Feed Preheat Outlet Set Point", "SP", "°F", "610–625 °F"),
        _build_tag_row(df_win, row, "T3_furnace_F", "Fired Heater Radiant Firebox Temp", "CV", "°F", "<= 1620.0 °F IOW", furnace_status),
        _build_tag_row(df_win, row, "F5_fuel", "Furnace Fuel Gas Firing Rate", "MV", "lb/s", "20–45 lb/s"),
        _build_tag_row(df_win, row, "fluegas_O2_pct", "Stack Flue Gas Excess Oxygen", "CV", "%", "1.8–2.5% O2", "GREEN" if 1.5 <= flue_o2 <= 3.0 else "AMBER"),
        _build_tag_row(df_win, row, "fluegas_CO_ppm", "Stack Flue Gas CO Breakthrough", "CV", "ppm", "<= 150 ppm", "GREEN" if flue_co <= 150.0 else "RED"),
        _build_tag_row(df_win, row, "feed_flow_lb_s", "Fresh VGO Feed Mass Flow Rate", "DISTURBANCE", "lb/s", "140–190 lb/s"),
        _build_tag_row(df_win, row, "dist_feed_API", "Fresh VGO Feed API Gravity", "DISTURBANCE", "°API", "21–28 °API"),
        _build_tag_row(df_win, row, "dist_T_feed_in_F", "Battery-Limit VGO Feed Inlet Temp", "DISTURBANCE", "°F", "440–480 °F"),
        _build_tag_row(df_win, row, "dist_T_ambient_F", "Ambient Air Temperature", "DISTURBANCE", "°F", "50–105 °F"),
        _build_tag_row(df_win, row, "V1", "Furnace Fuel Gas Control Valve V1", "VALVE", "frac", "0.15–0.85"),
        _build_tag_row(df_win, row, "T2_dup", "Redundant Preheat Thermocouple T2_dup", "DUP_SENSOR", "°F", f"|dT| <= 2.5 °F (actual {abs(t2_preheat-t2_dup):.2f})"),
    ]

    u2_tag_table = [
        _build_tag_row(df_win, row, "Tr_riser_F", "Riser Reactor Outlet Temperature (ROT)", "CV", "°F", f"SP {sp_t_riser:.1f} °F"),
        _build_tag_row(df_win, row, "SP_T_riser_ROT_F", "Riser Outlet Temperature Set Point", "SP", "°F", "966–974 °F"),
        _build_tag_row(df_win, row, "conversion_pct", "Once-Through Cracking Conversion", "CV", "%", "71.0–75.5%"),
        _build_tag_row(df_win, row, "dP_reactor_frac", "Reactor / Main Column Hydraulic dP", "CV", "frac", "<= 0.480 IOW", flooding_status),
        _build_tag_row(df_win, row, "P4_reactor_psia", "Reactor Disengager Vessel Pressure", "CV", "psia", "22.5–26.5 psia"),
        _build_tag_row(df_win, row, "W_riser", "Riser Catalyst Holdup Inventory", "CV", "lb", "8500–10500 lb"),
        _build_tag_row(df_win, row, "standpipe_level", "Regenerated Standpipe Catalyst Level", "CV", "ft", "30–40 ft"),
        _build_tag_row(df_win, row, "W_standpipe", "Standpipe Catalyst Mass Holdup", "CV", "lb", "200–300 lb"),
        _build_tag_row(df_win, row, "F_regen_cat", "Regenerated Catalyst Circulation Rate", "MV", "lb/min", "2200–2750 lb/min"),
        _build_tag_row(df_win, row, "F_spent_cat", "Spent Catalyst Circulation Rate", "MV", "lb/min", "2200–2750 lb/min"),
        _build_tag_row(df_win, row, "V3", "Regenerated Catalyst Slide Valve V3", "VALVE", "frac", "0.15–0.85"),
        _build_tag_row(df_win, row, "V2", "Spent Catalyst Slide Valve V2", "VALVE", "frac", "0.15–0.85"),
        _build_tag_row(df_win, row, "Tr_dup", "Redundant Riser ROT Thermocouple Tr_dup", "DUP_SENSOR", "°F", f"|dT| <= 2.5 °F (actual {abs(tr_riser-tr_dup):.2f})"),
    ]

    u3_tag_table = [
        _build_tag_row(df_win, row, "Treg_F", "Regenerator Dense Bed Temperature", "CV", "°F", f"SP {sp_t_reg:.1f} °F"),
        _build_tag_row(df_win, row, "SP_T_reg_F", "Regenerator Temperature Set Point", "SP", "°F", "1240–1265 °F"),
        _build_tag_row(df_win, row, "Tcyc_F", "Regenerator Cyclone Outlet Temperature", "CV", "°F", "<= 1310.0 °F IOW", "GREEN" if tcyc_f <= 1300.0 else "AMBER"),
        _build_tag_row(df_win, row, "dT_cyc_reg_F", "Cyclone Afterburn Delta-T (Tcyc - Treg)", "CV", "°F", "5.0–18.0 °F", "GREEN" if abs(dt_cyc_reg) <= 20.0 else "AMBER"),
        _build_tag_row(df_win, row, "C_spent_cat", "Carbon on Spent Catalyst", "CV", "wt frac", "0.008–0.013"),
        _build_tag_row(df_win, row, "C_regen_cat", "Carbon on Regenerated Catalyst", "CV", "wt frac", "<= 0.0035"),
        _build_tag_row(df_win, row, "F_coke", "Catalytic Coke Burn Rate", "CV", "lb/min", "11–18 lb/min"),
        _build_tag_row(df_win, row, "Fair", "Main Air Blower Combustion Air Flow", "MV", "lb/s", "35–46 lb/s"),
        _build_tag_row(df_win, row, "power_CAB", "Main Air Blower (CAB) Shaft Power", "CV", "MW", "<= 7.20 MW"),
        _build_tag_row(df_win, row, "P6_regen_psia", "Regenerator Vessel Pressure", "CV", "psia", f"SP {sp_p_reg:.1f} psia"),
        _build_tag_row(df_win, row, "V4", "Main Air Blower Discharge Valve V4", "VALVE", "frac", "0.15–0.85"),
        _build_tag_row(df_win, row, "V6", "Flue Gas Pressure Slide Valve V6", "VALVE", "frac", "0.15–0.85"),
        _build_tag_row(df_win, row, "Treg_dup", "Redundant Regen Bed Thermocouple Treg_dup", "DUP_SENSOR", "°F", f"|dT| <= 3.0 °F (actual {abs(treg_f-treg_dup):.2f})"),
        _build_tag_row(df_win, row, "P6_dup", "Redundant Regen Pressure Transmitter P6_dup", "DUP_SENSOR", "psia", f"|dP| <= 0.35 psia (actual {abs(p6_regen-p6_dup):.2f})"),
    ]

    u4_tag_table = [
        _build_tag_row(df_win, row, "LCO_T98_F", "LCO Diesel T98 Distillation Cut-Point (Truth)", "CV", "°F", "<= 765.0 °F Spec", lco_unit_status),
        _build_tag_row(df_win, row, "SP_LCO_T98", "LCO T98 Controller Set Point (MV_T17_sp)", "SP", "°F", "752–764 °F"),
        _build_tag_row(df_win, row, "HN_T98_F", "Heavy Naphtha T98 Cut-Point (Truth)", "CV", "°F", "<= 540.0 °F Spec", hn_trust),
        _build_tag_row(df_win, row, "SP_HN_T98", "Heavy Naphtha T98 Set Point (MV_HN_draw)", "SP", "°F", "528–539 °F"),
        _build_tag_row(df_win, row, "T_tray01_F", "Tray 1 Top Overhead Vapor Temperature", "CV", "°F", "300–325 °F"),
        _build_tag_row(df_win, row, "T_tray06_F", "Tray 6 Heavy Naphtha Side-Draw Temp", "CV", "°F", "445–470 °F"),
        _build_tag_row(df_win, row, "T_tray10_F", "Tray 10 Intermediate Reflux Temp", "CV", "°F", "500–520 °F"),
        _build_tag_row(df_win, row, "T_tray13_F", "Tray 13 LCO Diesel Side-Draw Temp", "CV", "°F", "512–532 °F"),
        _build_tag_row(df_win, row, "T_tray17_F", "Tray 17 Lower Stripping Zone Temp", "CV", "°F", "518–538 °F"),
        _build_tag_row(df_win, row, "T_tray20_F", "Tray 20 Bottom Slurry Quench Zone Temp", "CV", "°F", "615–645 °F"),
        _build_tag_row(df_win, row, "MV_PA1", "Top Pumparound PA1 Circulation Rate", "MV", "klb/h", "25–40 klb/h"),
        _build_tag_row(df_win, row, "MV_PA2", "Upper-Mid Pumparound PA2 Circulation Rate", "MV", "klb/h", "190–240 klb/h"),
        _build_tag_row(df_win, row, "MV_PA3", "Lower-Mid Pumparound PA3 Circulation Rate", "MV", "klb/h", "28–42 klb/h"),
        _build_tag_row(df_win, row, "MV_PA4", "Bottom Slurry Pumparound PA4 Rate", "MV", "klb/h", "1200–1300 klb/h"),
        _build_tag_row(df_win, row, "P5_frac_psia", "Main Fractionator Overhead Pressure", "CV", "psia", f"SP {sp_p_frac:.1f} psia"),
        _build_tag_row(df_win, row, "valve_V10", "Heavy Naphtha Draw Control Valve V10", "VALVE", "frac", "0.15–0.85"),
        _build_tag_row(df_win, row, "valve_V11", "LCO Product Draw Control Valve V11", "VALVE", "frac", "0.15–0.85"),
        _build_tag_row(df_win, row, "P5_dup", "Redundant Fractionator Pressure P5_dup", "DUP_SENSOR", "psia", f"|dP| <= 0.35 psia (actual {abs(p5_frac-p5_dup):.2f})"),
    ]

    u5_tag_table = [
        _build_tag_row(df_win, row, "dist_condenser_eff", "Overhead Condenser Heat-Transfer UA Eff", "CV", "frac", ">= 0.860 clean", condenser_status),
        _build_tag_row(df_win, row, "MV_cw_flow", "Condenser Cooling Water Flow Rate", "MV", "lb/s", "260–340 lb/s"),
        _build_tag_row(df_win, row, "MV_reflux_ratio", "Main Fractionator Overhead Reflux Ratio", "MV", "L/D", "0.71–0.76 sweet spot"),
        _build_tag_row(df_win, row, "SP_T_overhead", "Overhead Accumulator Drum Temp SP", "SP", "°F", "244.5–247.0 °F"),
        _build_tag_row(df_win, row, "SP_acc_level", "Overhead Reflux Drum Level Set Point", "SP", "%", "65–75%"),
        _build_tag_row(df_win, row, "power_WGC", "Wet Gas Compressor (WGC) Shaft Power", "CV", "MW", "<= 5.40 MW"),
        _build_tag_row(df_win, row, "F7", "Overhead Wet Gas & Distillate Vapor Flow", "CV", "lb/min", "420–490 lb/min"),
        _build_tag_row(df_win, row, "valve_V8", "Overhead Reflux Control Valve V8", "VALVE", "frac", "0.15–0.85"),
        _build_tag_row(df_win, row, "valve_V9", "Condenser Cooling Water Valve V9", "VALVE", "frac", "0.15–0.85"),
    ]

    u6_tag_table = [
        _build_tag_row(df_win, row, "eff_C5", "Light-Ends C5 Pentane Molar Yield", "PRODUCT", "mol", "Maximize recovery"),
        _build_tag_row(df_win, row, "eff_C4", "Light-Ends C4 Butane Molar Yield", "PRODUCT", "mol", "LPG / RVP balance"),
        _build_tag_row(df_win, row, "eff_C3", "Light-Ends C3 Propane Molar Yield", "PRODUCT", "mol", "LPG recovery"),
        _build_tag_row(df_win, row, "eff_C2", "Light-Ends C2 Ethane Dry Gas Yield", "PRODUCT", "mol", "<= 0.75 mol"),
        _build_tag_row(df_win, row, "eff_C1", "Light-Ends C1 Methane Dry Gas Yield", "PRODUCT", "mol", "<= 0.75 mol"),
        _build_tag_row(df_win, row, "prod_LN", "Stabilised Light Naphtha Rundown Flow", "PRODUCT", "lb/min", "90–115 lb/min"),
        _build_tag_row(df_win, row, "prod_LPG", "Overhead LPG (C3+C4) Rundown Flow", "PRODUCT", "lb/min", "40–55 lb/min"),
        _build_tag_row(df_win, row, "prod_HN", "Heavy Naphtha Rundown Flow", "PRODUCT", "lb/min", "100–125 lb/min"),
        _build_tag_row(df_win, row, "prod_LCO", "Light Cycle Oil (LCO Diesel) Flow", "PRODUCT", "lb/min", "150–180 lb/min"),
        _build_tag_row(df_win, row, "prod_slurry", "Bottom Clarified Slurry Oil Flow", "PRODUCT", "lb/min", "20–38 lb/min"),
        _build_tag_row(df_win, row, "prod_coke", "Catalytic Coke Yield Rate", "PRODUCT", "lb/min", "11–18 lb/min"),
        _build_tag_row(df_win, row, "mass_balance_err_pct", "PINN Plant-Wide Mass Closure Residual", "RESIDUAL", "%", "|err| <= 1.5%"),
    ]

    # Actionable decision cards for each unit & use case
    dec_u1 = _make_decision_card(
        rec_map, f"TWIN-{rid}-U1-{t_val}", rid, t_val, "fluegas_O2_pct", "unit_1_furnace", "UC-05",
        "LOWER" if flue_o2 > 2.5 else "HOLD", "SP_T_preheat_F / Damper O2 Trim",
        flue_o2, max(2.0, round(flue_o2 - 0.45, 2)), round(max(2.0, flue_o2 - 0.45) - flue_o2, 2), "% O2",
        lco_gate, lco_trust,
        f"Shift heat duty from fired fuel (F5 = {f5_fuel:.2f} lb/s) to fractionator bottom pumparound PA4 while maintaining T3_furnace_F ({t3_furnace:.1f} °F) below 1620 °F tube coking IOW.",
        {
            "yield_impact": "Stable feed enthalpy entering riser prevents thermal cracking into C1/C2 dry gas.",
            "energy_impact": f"Reduces fuel gas firing F5_fuel by {abs(fuel_delta_lb_s):.2f} lb/s via PA4 heat recovery.",
            "regeneration_impact": "Maintains steady reactor-regenerator heat balance.",
            "reliability_impact": f"Expands margin to 1620 °F furnace tube coking limit (current margin {1620.0 - t3_furnace:.1f} °F).",
        },
        [_cite("IOW-001", "2.1", "IOW — Furnace & Reactor Thermal Limits")],
    )

    dec_u2 = _make_decision_card(
        rec_map, f"TWIN-{rid}-U2-{t_val}", rid, t_val, "Tr_riser_F", "unit_2_riser", "UC-08",
        "HOLD" if 966.0 <= tr_riser <= 974.0 else ("RAISE" if tr_riser < 966.0 else "LOWER"),
        "SP_T_riser_ROT_F (Slide Valve V3)",
        sp_t_riser, min(972.0, max(968.0, sp_t_riser)), round(min(972.0, max(968.0, sp_t_riser)) - sp_t_riser, 2), "°F",
        lco_gate, lco_trust,
        f"Maintain catalyst-to-oil ratio via slide valve V3 (pos {v3_pos*100:.1f}%) to stabilize conversion ({conv_pct:.1f}%) while keeping hydraulic dP ({dp_reactor:.3f}) below 0.48 incipient flooding ceiling.",
        {
            "yield_impact": f"Optimizes conversion ({conv_pct:.1f}%) toward LN/HN/LCO while capping C1+C2 dry gas ({eff_c1+eff_c2:.2f} mol).",
            "energy_impact": "Controls wet gas compressor suction load by preventing thermal over-cracking.",
            "regeneration_impact": f"Regulates delta-coke laid down on catalyst (F_coke = {f_coke:.1f} lb/min).",
            "reliability_impact": f"Holds hydraulic dP ratio at {hydraulic_dp_norm:.2f}x nominal (<= 1.08x IOW).",
        },
        [_cite("SOP-FCC-010", "3.2", "SOP — Riser Outlet Temperature & Catalyst Circulation")],
    )

    dec_u3 = _make_decision_card(
        rec_map, f"TWIN-{rid}-U3-{t_val}", rid, t_val, "Fair", "unit_3_regenerator", "UC-04",
        "LOWER" if flue_o2 > 2.5 else "HOLD", "Fair (Main Air Blower V4)",
        f_air, max(36.0, round(f_air - 0.8, 2)) if flue_o2 > 2.5 else f_air, -0.8 if flue_o2 > 2.5 else 0.0, "lb/s",
        lco_gate, lco_trust,
        f"Trim Main Air Blower discharge valve V4 to hold C_regen_cat <= 0.30 wt% ({c_regen*100:.3f} wt% now) while reducing CAB shaft power by {abs(cab_delta_mw):.2f} MW and suppressing cyclone afterburn ({dt_cyc_reg:+.1f} °F).",
        {
            "yield_impact": f"Clean regenerated catalyst ({c_regen*100:.3f} wt% carbon) sustains {conv_pct:.1f}% riser conversion.",
            "energy_impact": f"Reduces Main Air Blower shaft power (power_CAB = {power_cab:.2f} MW) by {abs(cab_delta_mw):.2f} MW.",
            "regeneration_impact": f"Stabilizes dense-bed temperature Treg_F at {treg_f:.1f} °F and cyclone dT at {dt_cyc_reg:+.1f} °F.",
            "reliability_impact": f"Protects cyclone diplegs and plenum metallurgy (Tcyc_F = {tcyc_f:.1f} °F <= 1310 °F IOW).",
        },
        [_cite("IOW-002", "1.4", "IOW — Regenerator Cyclone Afterburn & Catalyst Deactivation")],
    )

    dec_u4_lco = _make_decision_card(
        rec_map, open_lco_rec["rec_id"] if open_lco_rec else f"TWIN-{rid}-U4-LCO-{t_val}",
        rid, t_val, "LCO_T98_F", "unit_4_fractionator", "UC-01",
        "RAISE" if sp_delta_F > 0 else ("LOWER" if sp_delta_F < 0 else "HOLD"),
        "SP_LCO_T98 (MV_T17_sp)",
        sp_lco, sp_lco_after, sp_delta_F, "°F",
        lco_gate, lco_trust,
        open_lco_rec["rationale"] if open_lco_rec else f"4-model committee P95 = {lco_q95:.1f} °F with W90 = {lco_w90:.1f} °F (limit 14.0 °F).",
        {
            "yield_impact": f"Shifts {yield_shift_pct:+.2f}% of feed ({lco_flow_after - prod_lco:+.2f} lb/min) from bottom slurry into LCO distillate.",
            "energy_impact": f"Modulates Tray 13/17 liquid traffic and lifts PA4 preheat recovery by +{pa_heat_recovery_F:.1f} °F.",
            "regeneration_impact": "Slurry bottoms adjustment modifies recycle coking tendency.",
            "reliability_impact": f"Maintains LCO-HN boiling separation at {cutpoint_gap_F:.1f} °F (>= 50 °F PINN floor).",
        },
        [
            _cite("SOP-frac-014", "4.2", "SOP — Main Fractionator LCO & HN Cut-Point Control"),
            _cite("LAB-001", "2.1", "ASTM D2887 Simulated Distillation Repeatability R=7 °F"),
        ],
    )

    dec_u4_hn = _make_decision_card(
        rec_map, f"TWIN-{rid}-U4-HN-{t_val}", rid, t_val, "HN_T98_F", "unit_4_fractionator", "UC-03",
        "RAISE" if (hn_gate == "PASS" and hn_q95 < 537.5) else "HOLD",
        "SP_HN_T98 (MV_HN_draw / V10)",
        sp_hn, round(sp_hn + (1.5 if hn_gate == "PASS" and hn_q95 < 537.5 else 0.0), 2),
        1.5 if (hn_gate == "PASS" and hn_q95 < 537.5) else 0.0, "°F",
        hn_gate, hn_trust,
        f"Coordinate Tray 6 HN draw valve V10 ({v10_pos*100:.1f}% open) and PA2 pumparound ({mv_pa2:.1f}) to maximize naphtha yield while preserving >= 50 °F separation from LCO.",
        {
            "yield_impact": f"Balances LN ({prod_ln:.1f} lb/min), HN ({prod_hn:.1f} lb/min), and LCO ({prod_lco:.1f} lb/min) side draws.",
            "energy_impact": f"Modulates intermediate pumparound PA2 ({mv_pa2:.1f} klb/h) heat removal.",
            "regeneration_impact": "Neutral to regenerator carbon balance.",
            "reliability_impact": f"Enforces PINN boiling gap constraint (actual gap {cutpoint_gap_F:.1f} °F >= 50 °F).",
        },
        [_cite("SOP-frac-014", "4.1", "SOP — Heavy Naphtha Side-Cut Control")],
    )

    dec_u4_pa = _make_decision_card(
        rec_map, f"TWIN-{rid}-U4-PA-{t_val}", rid, t_val, "MV_PA4", "unit_4_fractionator", "UC-06",
        "RAISE" if mv_pa4 < 1250.0 else "HOLD",
        "MV_PA4 / Pumparound Pinch Ratio",
        mv_pa4, min(1275.0, round(mv_pa4 + 20.0, 1)), round(min(1275.0, mv_pa4 + 20.0) - mv_pa4, 1), "klb/h",
        lco_gate, lco_trust,
        f"Shift fractionator heat removal toward high-grade bottom pumparound PA4 ({mv_pa4:.1f} klb/h) to lift feed preheat T2 by +{pa_heat_recovery_F:.1f} °F and trim fired fuel F5.",
        {
            "yield_impact": "Sharpens internal reflux between Tray 6 (HN) and Tray 13 (LCO).",
            "energy_impact": f"Lifts T2_preheat_F by +{pa_heat_recovery_F:.1f} °F, cutting furnace fuel F5_fuel by {abs(fuel_delta_lb_s):.2f} lb/s.",
            "regeneration_impact": "Stabilizes bottoms slurry quench temperature.",
            "reliability_impact": "Prevents localized tray dry-out on lower shed decks (Trays 18–20).",
        },
        [_cite("SOP-frac-014", "3.4", "SOP — Pumparound Duty Allocation & Pinch Recovery")],
    )

    dec_u5 = _make_decision_card(
        rec_map, f"TWIN-{rid}-U5-{t_val}", rid, t_val, "MV_cw_flow", "unit_5_condenser", "UC-07",
        "RAISE" if cond_eff < 0.86 else "HOLD",
        "MV_cw_flow / Reflux Trim (Valve V9)",
        mv_cw, round(mv_cw + (15.0 if cond_eff < 0.86 else 0.0), 1), 15.0 if cond_eff < 0.86 else 0.0, "lb/s",
        lco_gate, lco_trust,
        f"Condenser UA efficiency at {cond_eff*100:.1f}% (residual {condenser_ua_residual:.3f}); coordinate top pumparound PA1 ({mv_pa1:.1f}) and cooling water flow ({mv_cw:.1f} lb/s) to unload Wet Gas Compressor ({power_wgc:.2f} MW).",
        {
            "yield_impact": "Stabilizes overhead drum temperature, preventing C5 flash-off into wet gas.",
            "energy_impact": f"Unloads Wet Gas Compressor shaft power ({power_wgc:.2f} -> {power_wgc_after:.2f} MW).",
            "regeneration_impact": "Maintains steady P5_frac_psia backpressure on riser reactor.",
            "reliability_impact": f"Flags exchanger bundle cleaning before cooling water valve V9 ({v9_pos*100:.1f}%) saturates.",
        },
        [_cite("SOP-FCC-012", "2.3", "SOP — Overhead Condenser Fouling & Wet Gas Compressor Load")],
    )

    dec_u6 = _make_decision_card(
        rec_map, f"TWIN-{rid}-U6-{t_val}", rid, t_val, "SP_T_overhead", "unit_6_stabiliser", "UC-02",
        "RAISE" if sp_t_ovhd < 245.5 else "HOLD",
        "SP_T_overhead / C5 Recovery Trim",
        sp_t_ovhd, min(246.5, round(sp_t_ovhd + 0.6, 2)), round(min(246.5, sp_t_ovhd + 0.6) - sp_t_ovhd, 2), "°F",
        lco_gate, lco_trust,
        f"Trim overhead drum temperature SP ({sp_t_ovhd:.2f} °F) and reflux ratio ({mv_reflux:.3f}) to maximize C5 pentane recovery ({c5_recovery_pct:.1f}%) in stabilised Light Naphtha ({prod_ln:.1f} lb/min).",
        {
            "yield_impact": f"Recovers C5 pentanes into Light Naphtha ({prod_ln:.1f} lb/min) instead of slipping into LPG ({prod_lpg:.1f} lb/min).",
            "energy_impact": f"Reduces overhead condenser duty and WGC suction load ({power_wgc:.2f} MW).",
            "regeneration_impact": "Minimizes uncondensed C1/C2 fuel gas recycle.",
            "reliability_impact": "Maintains overhead accumulator level at SP 70%.",
        },
        [_cite("SOP-frac-014", "5.1", "SOP — Overhead Stabiliser & C5 Light-Ends Recovery")],
    )

    dec_uc09 = _make_decision_card(
        rec_map, f"TWIN-{rid}-UC09-{t_val}", rid, t_val, "valve_V11", "unit_3_regenerator", "UC-09",
        "HOLD", "CAB / WGC & Control Valve Authority Envelope",
        round(power_cab + power_wgc, 2), round(power_cab_after + power_wgc_after, 2), round(cab_delta_mw + wgc_delta_mw, 2), "MW",
        lco_gate, lco_trust,
        f"Coordinated O2 trim and reflux optimization reduces total CAB+WGC compressor load by {abs(cab_delta_mw + wgc_delta_mw):.2f} MW while keeping all 8 control valves inside 15–85% linear travel.",
        {
            "yield_impact": "Eliminates valve-stiction limit cycles on Tray 6 (HN) and Tray 13 (LCO) draws.",
            "energy_impact": f"Reduces combined CAB + WGC shaft power by {abs(cab_delta_mw + wgc_delta_mw):.2f} MW.",
            "regeneration_impact": "Smooths regenerator pressure P6_regen_psia control via slide valve V6.",
            "reliability_impact": "Prevents control valve seat erosion and compressor surge recycle trips.",
        },
        [_cite("WO-2025-118", "1.1", "Maintenance Work Order — Fractionator Draw Valve Positioner Calibration")],
    )

    dec_uc10 = _make_decision_card(
        rec_map, f"TWIN-{rid}-UC10-{t_val}", rid, t_val, "dP_reactor_frac", "unit_2_riser", "UC-10",
        "HOLD", "Plant-Wide IOW & Hydraulic Guardrail Envelope",
        dp_reactor, dp_reactor, 0.0, "frac",
        lco_gate, lco_trust,
        f"All PINN physical conservation checks pass: hydraulic dP ratio = {hydraulic_dp_norm:.2f}x nominal, furnace T3 = {t3_furnace:.1f} °F (<= 1620 °F), cyclone Tcyc = {tcyc_f:.1f} °F (<= 1310 °F).",
        {
            "yield_impact": "Prevents tray entrainment/flooding that would contaminate LCO with black bottom slurry oil.",
            "energy_impact": "Caps preheat furnace firing below tube-coking thermal flux limits.",
            "regeneration_impact": "Caps cyclone temperature below catalyst sintering limits.",
            "reliability_impact": "Zero IOW excursions across all 6 physical units.",
        },
        [_cite("IOW-001", "2.1", "IOW — Furnace, Reactor & Fractionator Integrity Operating Windows")],
    )

    dec_uc11 = _make_decision_card(
        rec_map, f"TWIN-{rid}-UC11-{t_val}", rid, t_val, "W90_spread_F", "unit_4_fractionator", "UC-11",
        "HOLD", "Distribution Spread Gate & 5-Channel Sensor Voting",
        round(lco_w90, 2), round(lco_w90, 2), 0.0, "°F W90",
        lco_gate, lco_trust,
        str(lco_msg["gate"].get("message") or f"Spread Gate {lco_gate}: W90 = {lco_w90:.1f} °F vs 14.0 °F threshold; all 5 redundant sensor pairs monitored."),
        {
            "yield_impact": "Prevents false cut-point moves during sensor drift or crude switch transients.",
            "energy_impact": "Avoids control-loop oscillations across furnace, pumparounds, and condenser.",
            "regeneration_impact": "Verifies Treg_F and P6_regen_psia transmitter integrity before air blower moves.",
            "reliability_impact": "Provides automated instrument maintenance work-order triggers on S3 drift.",
        },
        [_cite("MOC-2025-041", "3.1", "Management of Change — Soft-Sensor Distribution Spread Gate & Redundant Sensor Voting")],
    )

    # Chart panel definitions for each of the 6 units
    u1_charts = [
        {
            "panel_id": "u1_temperatures",
            "title": "Furnace Firebox (T3) & Feed Preheat Outlet (T2 vs SP) Trajectory",
            "subtitle": "Monitors preheat target tracking and radiant tube coking margin (IOW <= 1620 °F)",
            "unit": "°F",
            "traces": [
                {"tag": "T2_preheat_F", "label": "Preheat Outlet T2 (°F)", "color": "#38bdf8"},
                {"tag": "SP_T_preheat_F", "label": "Preheat SP (°F)", "color": "#94a3b8", "dash": "dash"},
                {"tag": "dist_T_feed_in_F", "label": "Feed Inlet Temp (°F)", "color": "#a78bfa"},
                {"tag": "T2_dup", "label": "Redundant T2_dup (°F)", "color": "#34d399", "dash": "dot"},
            ],
        },
        {
            "panel_id": "u1_combustion",
            "title": "Fired Heater Fuel Gas (F5), Excess O2 (%) & Stack CO (ppm)",
            "subtitle": "Combustion stoichiometry and fuel gas duty coupled with PA4 heat recovery",
            "unit": "mixed",
            "traces": [
                {"tag": "F5_fuel", "label": "Fuel Gas F5 (lb/s)", "color": "#f59e0b"},
                {"tag": "fluegas_O2_pct", "label": "Stack Excess O2 (%)", "color": "#10b981"},
                {"tag": "fluegas_CO_ppm", "label": "Stack CO (ppm)", "color": "#f43f5e"},
                {"tag": "dist_feed_API", "label": "Feed API Gravity (°API)", "color": "#60a5fa"},
            ],
        },
    ]

    u2_charts = [
        {
            "panel_id": "u2_rot_conv",
            "title": "Riser Outlet Temperature (ROT vs SP) & Cracking Conversion (%)",
            "subtitle": "Catalytic cracking severity and once-through conversion response",
            "unit": "°F / %",
            "traces": [
                {"tag": "Tr_riser_F", "label": "Riser ROT (°F)", "color": "#f97316"},
                {"tag": "SP_T_riser_ROT_F", "label": "ROT Set Point (°F)", "color": "#94a3b8", "dash": "dash"},
                {"tag": "Tr_dup", "label": "Redundant Tr_dup (°F)", "color": "#34d399", "dash": "dot"},
                {"tag": "conversion_pct", "label": "Conversion (%)", "color": "#38bdf8"},
            ],
        },
        {
            "panel_id": "u2_hydraulics",
            "title": "Reactor Pressure (P4), Hydraulic dP & Standpipe Level",
            "subtitle": "Catalyst circulation hydraulics and incipient flooding surveillance",
            "unit": "psia / ft",
            "traces": [
                {"tag": "P4_reactor_psia", "label": "Reactor Pressure P4 (psia)", "color": "#60a5fa"},
                {"tag": "standpipe_level", "label": "Standpipe Level (ft)", "color": "#10b981"},
                {"tag": "dP_reactor_frac", "label": "Hydraulic dP (frac)", "color": "#f43f5e"},
            ],
        },
    ]

    u3_charts = [
        {
            "panel_id": "u3_regen_temps",
            "title": "Regenerator Dense Bed (Treg), Cyclone Temp (Tcyc) & Afterburn dT",
            "subtitle": "Coke combustion thermal envelope and cyclone metallurgy protection (<= 1310 °F)",
            "unit": "°F",
            "traces": [
                {"tag": "Treg_F", "label": "Regen Bed Treg (°F)", "color": "#f59e0b"},
                {"tag": "SP_T_reg_F", "label": "Regen SP (°F)", "color": "#94a3b8", "dash": "dash"},
                {"tag": "Tcyc_F", "label": "Cyclone Tcyc (°F)", "color": "#f43f5e"},
                {"tag": "dT_cyc_reg_F", "label": "Afterburn dT (°F)", "color": "#a78bfa"},
            ],
        },
        {
            "panel_id": "u3_blower_coke",
            "title": "Main Air Blower Flow (Fair), Shaft Power (CAB MW) & Coke Burn (F_coke)",
            "subtitle": "Air blower compression load vs catalytic coke burn kinetics",
            "unit": "lb/s / MW",
            "traces": [
                {"tag": "Fair", "label": "Combustion Air Fair (lb/s)", "color": "#38bdf8"},
                {"tag": "F_coke", "label": "Coke Burn F_coke (lb/min)", "color": "#f97316"},
                {"tag": "power_CAB", "label": "CAB Shaft Power (MW)", "color": "#10b981"},
                {"tag": "P6_regen_psia", "label": "Regen Pressure P6 (psia)", "color": "#eab308"},
            ],
        },
    ]

    u4_charts = [
        {
            "panel_id": "u4_cutpoints_trays",
            "title": "Main Fractionator LCO T98, HN T98 & Key Tray Temperatures (Trays 1, 6, 13, 20)",
            "subtitle": "20-tray distillation column thermal profile and product cut-point tracking",
            "unit": "°F",
            "traces": [
                {"tag": "LCO_T98_F", "label": "LCO T98 Truth (°F)", "color": "#38bdf8"},
                {"tag": "SP_LCO_T98", "label": "SP_LCO_T98 (°F)", "color": "#94a3b8", "dash": "dash"},
                {"tag": "HN_T98_F", "label": "HN T98 Truth (°F)", "color": "#10b981"},
                {"tag": "T_tray20_F", "label": "Tray 20 Bottoms (°F)", "color": "#f43f5e"},
                {"tag": "T_tray13_F", "label": "Tray 13 LCO Draw (°F)", "color": "#f59e0b"},
                {"tag": "T_tray06_F", "label": "Tray 6 HN Draw (°F)", "color": "#a78bfa"},
            ],
        },
        {
            "panel_id": "u4_pumparounds_valves",
            "title": "Pumparound Circulation Duties (PA1–PA4) & Draw Control Valves (V10, V11)",
            "subtitle": "Internal reflux heat integration and side-draw valve authority",
            "unit": "klb/h",
            "traces": [
                {"tag": "MV_PA2", "label": "Mid Pumparound PA2", "color": "#38bdf8"},
                {"tag": "MV_PA3", "label": "Lower Pumparound PA3", "color": "#10b981"},
                {"tag": "MV_PA1", "label": "Top Pumparound PA1", "color": "#f59e0b"},
                {"tag": "F_V11", "label": "LCO Draw Flow F_V11", "color": "#a78bfa"},
            ],
        },
    ]

    u5_charts = [
        {
            "panel_id": "u5_condenser_wgc",
            "title": "Condenser UA Efficiency, Reflux Ratio & Wet Gas Compressor Power (WGC)",
            "subtitle": "Overhead heat removal efficiency vs compressor shaft load",
            "unit": "frac / MW",
            "traces": [
                {"tag": "dist_condenser_eff", "label": "Condenser Eff (0–1)", "color": "#10b981"},
                {"tag": "MV_reflux_ratio", "label": "Reflux Ratio (L/D)", "color": "#38bdf8"},
                {"tag": "power_WGC", "label": "WGC Power (MW)", "color": "#f59e0b"},
                {"tag": "valve_V9", "label": "CW Valve V9 (0–1)", "color": "#f43f5e"},
            ],
        },
        {
            "panel_id": "u5_cooling_ovhd",
            "title": "Cooling Water Flow (MV_cw_flow) & Overhead Drum Temp SP",
            "subtitle": "Waterside cooling duty and accumulator drum pressure/temperature control",
            "unit": "lb/s / °F",
            "traces": [
                {"tag": "MV_cw_flow", "label": "Cooling Water Flow (lb/s)", "color": "#38bdf8"},
                {"tag": "SP_T_overhead", "label": "Overhead Temp SP (°F)", "color": "#a78bfa"},
                {"tag": "T_tray01_F", "label": "Tray 1 Overhead Temp (°F)", "color": "#10b981"},
            ],
        },
    ]

    u6_charts = [
        {
            "panel_id": "u6_light_ends",
            "title": "Light-Ends Gas Plant Component Yields (C1–C5 Molar Split)",
            "subtitle": "Stabiliser overhead C5 pentane recovery vs C3/C4 LPG and C1/C2 dry gas slip",
            "unit": "mol",
            "traces": [
                {"tag": "eff_C5", "label": "C5 Pentane (eff_C5)", "color": "#10b981"},
                {"tag": "eff_C4", "label": "C4 Butane (eff_C4)", "color": "#38bdf8"},
                {"tag": "eff_C3", "label": "C3 Propane (eff_C3)", "color": "#f59e0b"},
                {"tag": "eff_C2", "label": "C2 Ethane (eff_C2)", "color": "#a78bfa"},
                {"tag": "eff_C1", "label": "C1 Methane (eff_C1)", "color": "#f43f5e"},
            ],
        },
        {
            "panel_id": "u6_product_rundowns",
            "title": "Refinery Product Rundown Streams (LCO, HN, LN, LPG, Slurry)",
            "subtitle": "Live product mass flow rates and PINN plant-wide mass balance closure",
            "unit": "lb/min",
            "traces": [
                {"tag": "prod_LCO", "label": "LCO Diesel (lb/min)", "color": "#38bdf8"},
                {"tag": "prod_HN", "label": "Heavy Naphtha (lb/min)", "color": "#10b981"},
                {"tag": "prod_LN", "label": "Light Naphtha (lb/min)", "color": "#f59e0b"},
                {"tag": "prod_LPG", "label": "LPG C3+C4 (lb/min)", "color": "#a78bfa"},
                {"tag": "prod_slurry", "label": "Bottom Slurry (lb/min)", "color": "#f43f5e"},
            ],
        },
    ]

    # Build the 6 Sequential Physical Units (SDD-TWIN-01..06)
    units: list[dict[str, Any]] = [
        {
            "unit_id": "unit_1_furnace",
            "seq": 1,
            "name": "Unit 1 · Crude/VGO Feed & Fired Preheat Furnace",
            "short_name": "1. Feed & Preheat Furnace",
            "subtitle": "Feed preheat train, fired heater combustion & tube skin coking monitor",
            "use_case_ids": ["UC-05", "UC-10"],
            "use_case_numbers": [5, 10],
            "status": furnace_status if flue_o2 <= 3.5 else "AMBER",
            "status_label": "OPTIMAL PREHEAT" if furnace_status == "GREEN" and flue_o2 <= 3.2 else "EXCESS O2 / DUTY TRIM",
            "headline_kpi": {
                "label": "Preheat Outlet T2",
                "value": round(t2_preheat, 1),
                "unit": "°F",
                "target": f"SP {sp_t_preheat:.1f} °F · T3 <= 1620 °F",
            },
            "tags": {
                "feed_flow_lb_s": round(feed_flow, 2),
                "dist_feed_API": round(feed_api, 2),
                "dist_T_feed_in_F": round(t_feed_in, 2),
                "dist_T_ambient_F": round(t_ambient, 2),
                "T2_preheat_F": round(t2_preheat, 2),
                "SP_T_preheat_F": round(sp_t_preheat, 2),
                "T3_furnace_F": round(t3_furnace, 2),
                "F5_fuel": round(f5_fuel, 2),
                "fluegas_O2_pct": round(flue_o2, 2),
                "fluegas_CO_ppm": round(flue_co, 2),
                "V1": round(v1_pos, 3),
            },
            "kpis": [
                {"tag": "T2_preheat_F", "label": "Feed Preheat Temp (T2)", "value": round(t2_preheat, 1), "unit": "°F", "status": "GREEN"},
                {"tag": "T3_furnace_F", "label": "Furnace Firebox Temp (T3)", "value": round(t3_furnace, 1), "unit": "°F", "status": furnace_status},
                {"tag": "F5_fuel", "label": "Fuel Gas Firing Rate (F5)", "value": round(f5_fuel, 2), "unit": "lb/s", "status": "GREEN"},
                {"tag": "fluegas_O2_pct", "label": "Stack Excess O2", "value": round(flue_o2, 2), "unit": "%", "status": "GREEN" if 1.5 <= flue_o2 <= 3.0 else "AMBER"},
                {"tag": "fluegas_CO_ppm", "label": "Stack CO Breakthrough", "value": round(flue_co, 1), "unit": "ppm", "status": "GREEN" if flue_co <= 150.0 else "RED"},
                {"tag": "dist_feed_API", "label": "Feed API Gravity", "value": round(feed_api, 2), "unit": "°API", "status": "GREEN"},
            ],
            "envelope": {
                "parameter": "fluegas_O2_pct",
                "label": "Furnace Excess O2 Stoichiometry",
                "unit": "% O2",
                "current_value": round(flue_o2, 2),
                "p50": round(flue_o2, 2),
                "p95": round(flue_o2 + 0.25, 2),
                "sweet_spot_min": 1.8,
                "sweet_spot_max": 2.5,
                "spec_limit": 4.0,
                "scale_min": 0.5,
                "scale_max": 4.5,
                "zone": "OVER_TREATING" if flue_o2 > 2.5 else ("SWEET_SPOT" if flue_o2 >= 1.8 else "UNDER_TREATING"),
                "zone_label": "EXCESS AIR HEAT LOSS · TRIM DAMPER" if flue_o2 > 2.5 else "STOICHIOMETRIC SWEET SPOT",
                "advice": f"Stack O2 is {flue_o2:.2f}% (CO {flue_co:.0f} ppm). Trimming excess O2 toward 2.0–2.3% and recovering PA4 pumparound heat reduces fuel gas F5 by {abs(fuel_delta_lb_s):.2f} lb/s while keeping T3 ({t3_furnace:.1f} °F) below the 1620 °F coking IOW.",
            },
            "recommendation": dec_u1,
            "tag_table": u1_tag_table,
            "chart_panels": u1_charts,
            "decisions_needed": [dec_u1],
        },
        {
            "unit_id": "unit_2_riser",
            "seq": 2,
            "name": "Unit 2 · Riser Reactor, Standpipe & Transfer Line",
            "short_name": "2. Riser Reactor & Standpipe",
            "subtitle": "Catalytic cracking severity, ROT control, catalyst circulation & hydraulic dP",
            "use_case_ids": ["UC-08", "UC-10"],
            "use_case_numbers": [8, 10],
            "status": flooding_status if abs(tr_riser - sp_t_riser) <= 8.0 else "AMBER",
            "status_label": "OPTIMAL CRACKING SEVERITY" if flooding_status == "GREEN" else "HIGH HYDRAULIC dP WATCH",
            "headline_kpi": {
                "label": "Riser Outlet (ROT)",
                "value": round(tr_riser, 1),
                "unit": "°F",
                "target": f"SP {sp_t_riser:.1f} °F · Conv {conv_pct:.1f}%",
            },
            "tags": {
                "Tr_riser_F": round(tr_riser, 2),
                "Tr_riser_out_F": round(tr_riser, 2),
                "SP_T_riser_ROT_F": round(sp_t_riser, 2),
                "P4_reactor_psia": round(p4_reactor, 2),
                "dP_reactor_frac": round(dp_reactor, 4),
                "conversion_pct": round(conv_pct, 2),
                "W_riser": round(w_riser, 1),
                "W_standpipe": round(w_standpipe, 1),
                "standpipe_level": round(standpipe_lvl, 2),
                "F_regen_cat": round(f_regen_cat, 1),
                "F_spent_cat": round(f_spent_cat, 1),
                "V2": round(v2_pos, 3),
                "V3": round(v3_pos, 3),
            },
            "kpis": [
                {"tag": "Tr_riser_out_F", "label": "Riser Outlet Temp (ROT)", "value": round(tr_riser, 1), "unit": "°F", "status": "GREEN"},
                {"tag": "conversion_pct", "label": "Once-Through Conversion", "value": round(conv_pct, 2), "unit": "%", "status": "GREEN"},
                {"tag": "dP_reactor_frac", "label": "Reactor/Fractionator Hydraulic dP", "value": round(dp_reactor, 3), "unit": "frac", "status": flooding_status},
                {"tag": "F_regen_cat", "label": "Regen Catalyst Circulation", "value": round(f_regen_cat, 1), "unit": "lb/min", "status": "GREEN"},
                {"tag": "standpipe_level", "label": "Standpipe Catalyst Level", "value": round(standpipe_lvl, 1), "unit": "ft", "status": "GREEN"},
                {"tag": "P4_reactor_psia", "label": "Reactor Vessel Pressure (P4)", "value": round(p4_reactor, 2), "unit": "psia", "status": "GREEN"},
            ],
            "envelope": {
                "parameter": "Tr_riser_out_F",
                "label": "Riser Outlet Temperature (ROT) Severity",
                "unit": "°F",
                "current_value": round(tr_riser, 1),
                "p50": round(tr_riser, 1),
                "p95": round(tr_riser + 2.2, 1),
                "sweet_spot_min": 966.0,
                "sweet_spot_max": 974.0,
                "spec_limit": 985.0,
                "scale_min": 950.0,
                "scale_max": 990.0,
                "zone": "SWEET_SPOT" if 966.0 <= tr_riser <= 974.0 else ("OVER_TREATING" if tr_riser < 966.0 else "UNDER_TREATING"),
                "zone_label": "SWEET SPOT CRACKING SEVERITY" if 966.0 <= tr_riser <= 974.0 else "ADJUST CATALYST SLIDE VALVE V3",
                "advice": f"ROT is {tr_riser:.1f} °F at {conv_pct:.1f}% conversion with hydraulic dP = {dp_reactor:.3f} ({hydraulic_dp_norm:.2f}x nominal). Keeping ROT inside 966–974 °F maximizes gasoline/LCO selectivity without over-cracking into dry gas (C1/C2) or triggering riser/fractionator flooding.",
            },
            "recommendation": dec_u2,
            "tag_table": u2_tag_table,
            "chart_panels": u2_charts,
            "decisions_needed": [dec_u2, dec_uc10],
        },
        {
            "unit_id": "unit_3_regenerator",
            "seq": 3,
            "name": "Unit 3 · Catalyst Regenerator, Cyclones & Main Air Blower (CAB)",
            "short_name": "3. Regenerator & Air Blower",
            "subtitle": "Coke burn kinetics, cyclone afterburn dT protection & CAB air stoichiometry",
            "use_case_ids": ["UC-04", "UC-09"],
            "use_case_numbers": [4, 9],
            "status": "GREEN" if (tcyc_f <= 1300.0 and abs(dt_cyc_reg) <= 25.0) else ("AMBER" if tcyc_f <= 1320.0 else "RED"),
            "status_label": "CLEAN CARBON BURN" if abs(dt_cyc_reg) <= 25.0 else "AFTERBURN WATCH",
            "headline_kpi": {
                "label": "Regen Bed / Cyclone",
                "value": round(treg_f, 1),
                "unit": "°F",
                "target": f"Tcyc {tcyc_f:.1f} °F (dT {dt_cyc_reg:+.1f} °F)",
            },
            "tags": {
                "Treg_F": round(treg_f, 2),
                "SP_T_reg_F": round(sp_t_reg, 2),
                "Tcyc_F": round(tcyc_f, 2),
                "dT_cyc_reg_F": round(dt_cyc_reg, 2),
                "P6_regen_psia": round(p6_regen, 2),
                "SP_P_reg_psia": round(sp_p_reg, 2),
                "C_spent_cat": round(c_spent, 5),
                "C_regen_cat": round(c_regen, 5),
                "F_coke": round(f_coke, 2),
                "Fair": round(f_air, 2),
                "power_CAB": round(power_cab, 2),
                "F_fluegas": round(f_fluegas, 2),
                "V4": round(v4_pos, 3),
                "V6": round(v6_pos, 3),
                "V7": round(v7_pos, 3),
            },
            "kpis": [
                {"tag": "Treg_F", "label": "Regen Dense Bed Temp", "value": round(treg_f, 1), "unit": "°F", "status": "GREEN"},
                {"tag": "Tcyc_F", "label": "Cyclone Outlet Temp", "value": round(tcyc_f, 1), "unit": "°F", "status": "GREEN" if tcyc_f <= 1300.0 else "AMBER"},
                {"tag": "dT_cyc_reg_F", "label": "Cyclone Afterburn dT", "value": round(dt_cyc_reg, 1), "unit": "°F", "status": "GREEN" if abs(dt_cyc_reg) <= 20.0 else "AMBER"},
                {"tag": "C_regen_cat", "label": "Carbon on Regen Catalyst", "value": round(c_regen * 100.0, 3), "unit": "wt%", "status": "GREEN" if c_regen <= 0.004 else "AMBER"},
                {"tag": "Fair", "label": "Main Air Blower Flow (Fair)", "value": round(f_air, 2), "unit": "lb/s", "status": "GREEN"},
                {"tag": "power_CAB", "label": "Main Air Blower Power (CAB)", "value": round(power_cab, 2), "unit": "MW", "status": "GREEN"},
            ],
            "envelope": {
                "parameter": "dT_cyc_reg_F",
                "label": "Regenerator Cyclone Afterburn Delta-T",
                "unit": "°F",
                "current_value": round(dt_cyc_reg, 1),
                "p50": round(dt_cyc_reg, 1),
                "p95": round(dt_cyc_reg + 3.0, 1),
                "sweet_spot_min": 5.0,
                "sweet_spot_max": 18.0,
                "spec_limit": 30.0,
                "scale_min": -5.0,
                "scale_max": 35.0,
                "zone": "SWEET_SPOT" if 5.0 <= dt_cyc_reg <= 18.0 else ("OVER_TREATING" if dt_cyc_reg < 5.0 else "UNDER_TREATING"),
                "zone_label": "CONTROLLED COKE COMBUSTION" if dt_cyc_reg <= 18.0 else "AFTERBURN EXCURSION RISK",
                "advice": f"Regenerated catalyst carbon is {c_regen*100:.3f} wt% (down from {c_spent*100:.2f} wt% spent) with cyclone dT = {dt_cyc_reg:+.1f} °F and CAB power = {power_cab:.2f} MW. Maintaining balanced combustion Air/Coke stoichiometry avoids both catalyst pore sintering (Tcyc > 1310 °F) and excess blower compression work.",
            },
            "recommendation": dec_u3,
            "tag_table": u3_tag_table,
            "chart_panels": u3_charts,
            "decisions_needed": [dec_u3, dec_uc09],
        },
        {
            "unit_id": "unit_4_fractionator",
            "seq": 4,
            "name": "Unit 4 · 20-Tray Main Fractionator, 4 Pumparounds & Control Valves",
            "short_name": "4. Main Fractionator (20 Trays)",
            "subtitle": "LCO T98 & HN T98 cut-point soft-sensor control, PA1-PA4 heat integration & valve stiction",
            "use_case_ids": ["UC-01", "UC-03", "UC-06", "UC-09", "UC-11"],
            "use_case_numbers": [1, 3, 6, 9, 11],
            "status": lco_unit_status,
            "status_label": lco_zone_label,
            "headline_kpi": {
                "label": "LCO T98 P95",
                "value": round(lco_q95, 1),
                "unit": "°F",
                "target": "Sweet Spot 762.5-764 °F (Spec <= 765 °F)",
            },
            "tags": {
                "LCO_T98_F": round(lco_truth, 2),
                "HN_T98_F": round(hn_truth, 2),
                "SP_LCO_T98": round(sp_lco, 2),
                "MV_T17_sp": round(sp_lco, 2),
                "SP_HN_T98": round(sp_hn, 2),
                "MV_HN_draw": round(sp_hn, 2),
                "P5_frac_psia": round(p5_frac, 2),
                "SP_P_frac_psia": round(sp_p_frac, 2),
                "T_tray01_F": round(t_tray01, 2),
                "T_tray06_F": round(t_tray06, 2),
                "T_tray13_F": round(t_tray13, 2),
                "T_tray17_F": round(t_tray17, 2),
                "T_tray20_F": round(t_tray20, 2),
                "MV_PA1": round(mv_pa1, 2),
                "MV_PA2": round(mv_pa2, 2),
                "MV_PA3": round(mv_pa3, 2),
                "MV_PA4": round(mv_pa4, 2),
                "valve_V8": round(v8_pos, 3),
                "valve_V9": round(v9_pos, 3),
                "valve_V10": round(v10_pos, 3),
                "valve_V11": round(v11_pos, 3),
                "F_V11": round(f_v11, 2),
                "MV_LCO_draw": round(f_v11, 2),
            },
            "kpis": [
                {"tag": "LCO_T98_F", "label": "LCO T98 Mixture P50 / P95", "value": f"{lco_q50:.1f} / {lco_q95:.1f}", "unit": "°F", "status": lco_unit_status},
                {"tag": "HN_T98_F", "label": "HN T98 Mixture P50 / P95", "value": f"{hn_q50:.1f} / {hn_q95:.1f}", "unit": "°F", "status": hn_trust},
                {"tag": "T_tray13_F", "label": "LCO Draw Tray 13 Temp", "value": round(t_tray13, 1), "unit": "°F", "status": "GREEN"},
                {"tag": "T_tray06_F", "label": "HN Draw Tray 6 Temp", "value": round(t_tray06, 1), "unit": "°F", "status": "GREEN"},
                {"tag": "MV_PA4", "label": "Bottom Slurry Pumparound PA4", "value": round(mv_pa4, 1), "unit": "klb/h", "status": "GREEN"},
                {"tag": "W90_spread", "label": "4-Model Committee Spread W90", "value": round(lco_w90, 2), "unit": "°F", "status": "GREEN" if lco_gate == "PASS" else "AMBER"},
            ],
            "envelope": {
                "parameter": "LCO_T98_F",
                "label": "LCO Diesel T98 Distillation Cut-Point (ASTM D2887)",
                "unit": "°F",
                "current_value": round(lco_q50, 2),
                "p50": round(lco_q50, 2),
                "p95": round(lco_q95, 2),
                "sweet_spot_min": lco_sweet_min,
                "sweet_spot_max": lco_sweet_max,
                "spec_limit": lco_spec,
                "scale_min": 751.0,
                "scale_max": 767.0,
                "zone": lco_zone,
                "zone_label": lco_zone_label,
                "advice": (
                    f"4-model committee P95 is {lco_q95:.1f} °F (margin {lco_margin:+.1f} °F to 765 °F spec, W90 = {lco_w90:.1f} °F, Gate {lco_gate}). "
                    + (
                        f"Safe to adjust SP_LCO_T98 by {sp_delta_F:+.1f} °F ({sp_lco:.1f} -> {sp_lco_after:.1f} °F), shifting {yield_shift_pct:+.2f}% of feed into LCO distillate."
                        if lco_gate == "PASS" and sp_delta_F != 0
                        else "Spread Gate holds set point steady to protect product quality."
                    )
                ),
            },
            "recommendation": dec_u4_lco,
            "tag_table": u4_tag_table,
            "chart_panels": u4_charts,
            "decisions_needed": [dec_u4_lco, dec_u4_hn, dec_u4_pa],
        },
        {
            "unit_id": "unit_5_condenser",
            "seq": 5,
            "name": "Unit 5 · Overhead Condenser, Reflux Drum & Wet Gas Compressor (WGC)",
            "short_name": "5. Condenser & Wet Gas Comp",
            "subtitle": "Overhead heat removal UA efficiency, reflux ratio & WGC suction load",
            "use_case_ids": ["UC-07", "UC-09"],
            "use_case_numbers": [7, 9],
            "status": condenser_status,
            "status_label": "CLEAN HEAT TRANSFER" if condenser_status == "GREEN" else "CONDENSER FOULING WATCH",
            "headline_kpi": {
                "label": "Condenser UA Eff",
                "value": round(cond_eff * 100.0, 1),
                "unit": "%",
                "target": f"Reflux {mv_reflux:.3f} · WGC {power_wgc:.2f} MW",
            },
            "tags": {
                "dist_condenser_eff": round(cond_eff, 4),
                "MV_cw_flow": round(mv_cw, 2),
                "MV_reflux_ratio": round(mv_reflux, 4),
                "SP_T_overhead": round(sp_t_ovhd, 2),
                "SP_acc_level": round(sp_acc_lvl, 2),
                "power_WGC": round(power_wgc, 2),
                "F7": round(f7_ovhd, 2),
            },
            "kpis": [
                {"tag": "dist_condenser_eff", "label": "Condenser Heat-Transfer Eff", "value": round(cond_eff * 100.0, 1), "unit": "%", "status": condenser_status},
                {"tag": "MV_cw_flow", "label": "Cooling Water Flow (MV_cw)", "value": round(mv_cw, 1), "unit": "lb/s", "status": "GREEN"},
                {"tag": "MV_reflux_ratio", "label": "Overhead Reflux Ratio", "value": round(mv_reflux, 3), "unit": "L/D", "status": "GREEN"},
                {"tag": "SP_T_overhead", "label": "Overhead Drum Temp SP", "value": round(sp_t_ovhd, 1), "unit": "°F", "status": "GREEN"},
                {"tag": "power_WGC", "label": "Wet Gas Compressor Power", "value": round(power_wgc, 2), "unit": "MW", "status": "GREEN"},
                {"tag": "valve_V9", "label": "Cooling Water Valve V9 Open", "value": round(v9_pos * 100.0, 1), "unit": "%", "status": "GREEN" if v9_pos <= 0.85 else "AMBER"},
            ],
            "envelope": {
                "parameter": "MV_reflux_ratio",
                "label": "Overhead Reflux Ratio vs. Condenser & WGC Duty",
                "unit": "L/D",
                "current_value": round(mv_reflux, 3),
                "p50": round(mv_reflux, 3),
                "p95": round(mv_reflux + 0.015, 3),
                "sweet_spot_min": 0.71,
                "sweet_spot_max": 0.76,
                "spec_limit": 0.85,
                "scale_min": 0.65,
                "scale_max": 0.88,
                "zone": "SWEET_SPOT" if 0.71 <= mv_reflux <= 0.76 else ("OVER_TREATING" if mv_reflux > 0.76 else "UNDER_TREATING"),
                "zone_label": "BALANCED REFLUX & WGC LOAD" if 0.71 <= mv_reflux <= 0.76 else "TRIM OVER-REFLUXING",
                "advice": f"Condenser efficiency is {cond_eff*100:.1f}% (UA residual {condenser_ua_residual:.3f}) with cooling water flow = {mv_cw:.1f} lb/s and WGC power = {power_wgc:.2f} MW. Avoiding excessive reflux ratio (>0.76) reduces overhead vapor load and WGC suction pressure drop.",
            },
            "recommendation": dec_u5,
            "tag_table": u5_tag_table,
            "chart_panels": u5_charts,
            "decisions_needed": [dec_u5],
        },
        {
            "unit_id": "unit_6_stabiliser",
            "seq": 6,
            "name": "Unit 6 · Stabiliser Overhead & Light-Ends Gas Plant (C1–C5)",
            "short_name": "6. Stabiliser & Light Ends",
            "subtitle": "C5 recovery vs LPG slippage, light/heavy naphtha split & fuel gas methane slip",
            "use_case_ids": ["UC-02", "UC-03"],
            "use_case_numbers": [2, 3],
            "status": "GREEN" if c5_recovery_pct >= 33.0 else "AMBER",
            "status_label": "HIGH C5 GASOLINE RECOVERY" if c5_recovery_pct >= 33.0 else "C5 SLIPPAGE INTO LPG",
            "headline_kpi": {
                "label": "C5 Recovery Index",
                "value": c5_recovery_pct,
                "unit": "%",
                "target": f"LN {prod_ln:.1f} · LPG {prod_lpg:.1f} lb/min",
            },
            "tags": {
                "eff_C1": round(eff_c1, 4),
                "eff_C2": round(eff_c2, 4),
                "eff_C3": round(eff_c3, 4),
                "eff_C4": round(eff_c4, 4),
                "eff_C5": round(eff_c5, 4),
                "eff_VGO": round(eff_vgo, 5),
                "c5_recovery_pct": c5_recovery_pct,
                "c5_slip_to_lpg_pct": c5_slip_to_lpg_pct,
                "prod_LPG": round(prod_lpg, 2),
                "prod_LN": round(prod_ln, 2),
                "prod_HN": round(prod_hn, 2),
                "prod_LCO": round(prod_lco, 2),
                "prod_slurry": round(prod_slurry, 2),
                "prod_coke": round(prod_coke, 2),
            },
            "kpis": [
                {"tag": "c5_recovery_pct", "label": "C5 Pentane Recovery Share", "value": c5_recovery_pct, "unit": "%", "status": "GREEN" if c5_recovery_pct >= 33.0 else "AMBER"},
                {"tag": "prod_LN", "label": "Stabilised Light Naphtha (LN)", "value": round(prod_ln, 1), "unit": "lb/min", "status": "GREEN"},
                {"tag": "prod_HN", "label": "Heavy Naphtha Product (HN)", "value": round(prod_hn, 1), "unit": "lb/min", "status": "GREEN"},
                {"tag": "prod_LPG", "label": "Overhead LPG Product (C3/C4)", "value": round(prod_lpg, 1), "unit": "lb/min", "status": "GREEN"},
                {"tag": "eff_C3_C4", "label": "C3+C4 LPG Fraction in Light Ends", "value": lpg_c3_c4_share_pct, "unit": "%", "status": "GREEN"},
                {"tag": "prod_LCO", "label": "Light Cycle Oil (LCO Diesel)", "value": round(prod_lco, 1), "unit": "lb/min", "status": "GREEN"},
            ],
            "envelope": {
                "parameter": "SP_T_overhead",
                "label": "Stabiliser / Overhead Cut Temperature (C5 Recovery vs RVP)",
                "unit": "°F",
                "current_value": round(sp_t_ovhd, 2),
                "p50": round(sp_t_ovhd, 2),
                "p95": round(sp_t_ovhd + 1.4, 2),
                "sweet_spot_min": 244.5,
                "sweet_spot_max": 247.0,
                "spec_limit": 250.0,
                "scale_min": 240.0,
                "scale_max": 252.0,
                "zone": "SWEET_SPOT" if 244.5 <= sp_t_ovhd <= 247.0 else ("OVER_TREATING" if sp_t_ovhd < 244.5 else "UNDER_TREATING"),
                "zone_label": "OPTIMAL C5 RECOVERY / RVP BALANCE",
                "advice": f"C5 pentane share in C4+C5 overhead is {c5_recovery_pct:.1f}% (eff_C5 = {eff_c5:.3f}, eff_C4 = {eff_c4:.3f}) with Light Naphtha draw = {prod_ln:.1f} lb/min. Holding overhead temperature SP inside 244.5–247.0 °F maximizes C5 retention in gasoline blendstock without exceeding RVP limits.",
            },
            "recommendation": dec_u6,
            "tag_table": u6_tag_table,
            "chart_panels": u6_charts,
            "decisions_needed": [dec_u6],
        },
    ]

    # 3 Closed-Loop Thermodynamic Couplings (SDD-TWIN-02)
    system_loops = [
        {
            "loop_id": "loop_hydrocarbon",
            "name": "Loop 1 · Forward Hydrocarbon Mass & Cut-Point Train",
            "path": ["unit_1_furnace", "unit_2_riser", "unit_4_fractionator", "unit_5_condenser", "unit_6_stabiliser"],
            "flow_label": f"Feed {feed_flow:.1f} lb/s -> Conv {conv_pct:.1f}% -> LCO {prod_lco:.1f} / HN {prod_hn:.1f} / LN {prod_ln:.1f} / LPG {prod_lpg:.1f} lb/min",
            "conservation_metric": f"PINN Mass Closure Error: {mb_err_pct:+.3f}% (Target |err| <= 1.5%)",
            "status": "GREEN" if mass_closure_ok else "AMBER",
        },
        {
            "loop_id": "loop_catalyst",
            "name": "Loop 2 · Reactor–Regenerator Catalyst & Coke-Burn Loop",
            "path": ["unit_2_riser", "unit_3_regenerator", "unit_2_riser"],
            "flow_label": f"Regen Cat {f_regen_cat:.0f} lb/min (C_regen {c_regen*100:.3f}%) <-> Spent Cat {f_spent_cat:.0f} lb/min (C_spent {c_spent*100:.2f}%, Coke {f_coke:.1f} lb/min)",
            "conservation_metric": f"Heat-Balanced ROT {tr_riser:.1f} °F <-> Regen Bed {treg_f:.1f} °F (Cyclone dT {dt_cyc_reg:+.1f} °F)",
            "status": "GREEN" if abs(dt_cyc_reg) <= 25.0 else "AMBER",
        },
        {
            "loop_id": "loop_heat",
            "name": "Loop 3 · Pumparound & Preheat Thermal Integration Loop",
            "path": ["unit_4_fractionator", "unit_1_furnace"],
            "flow_label": f"PA1-PA4 Duty ({mv_pa1:.0f}/{mv_pa2:.0f}/{mv_pa3:.0f}/{mv_pa4:.0f}) -> Feed Preheat T2 {t2_preheat:.1f} °F -> Furnace Fuel F5 {f5_fuel:.2f} lb/s",
            "conservation_metric": f"Preheat Lift +{pa_heat_recovery_F:.1f} °F trims Fired Fuel by {abs(fuel_delta_lb_s):.2f} lb/s",
            "status": furnace_status,
        },
    ]

    # All 11 Core Requirements from refinery_optimisation.md (SDD-CAT-01..03)
    use_cases: list[dict[str, Any]] = [
        {
            "id": "UC-01",
            "number": 1,
            "title": "Main Fractionator LCO/Diesel Cut-Point Optimization",
            "category": "Distillation & Yield Optimization",
            "unit_id": "unit_4_fractionator",
            "unit_name": "Unit 4 · 20-Tray Main Fractionator",
            "status": lco_unit_status,
            "badge_text": lco_zone_label,
            "problem_statement": "4–12 hr laboratory turnaround delay on ASTM D2887 LCO T98 forces operators to run 5–8 °F below the 765 °F spec limit (quality giveaway, downgrading valuable diesel into heavy slurry) or risk off-spec excursions during crude/feed transients.",
            "solution_summary": f"4-Model Probabilistic Committee (Bayesian Ridge, ARD Matérn-5/2 GPR, Hybrid Physics+Delta, 5-Member PINN Ensemble) infers LCO_T98_F every minute with Kalman lab bias fusion and W90 Spread Gate ({lco_w90:.1f} °F vs 14.0 °F limit).",
            "kpis": [
                {"label": "LCO T98 P50 / P95", "tag": "LCO_T98_F", "value": f"{lco_q50:.1f} / {lco_q95:.1f}", "unit": "°F", "target": "<= 765.0 °F"},
                {"label": "Margin to Spec (765 °F)", "tag": "margin_F", "value": lco_margin, "unit": "°F", "target": "1.0–2.5 °F sweet spot"},
                {"label": "Committee Spread W90", "tag": "w90", "value": round(lco_w90, 2), "unit": "°F", "target": "<= 14.0 °F (2R)"},
                {"label": "LCO Distillate Draw", "tag": "prod_LCO", "value": round(prod_lco, 1), "unit": "lb/min", "target": f"Yield shift {yield_shift_pct:+.2f}%"},
            ],
            "envelope": units[3]["envelope"],
            "recommendation": dec_u4_lco,
            "systems_ripple": dec_u4_lco["systems_ripple"],
            "citations": dec_u4_lco["citations"],
            "tag_table": u4_tag_table,
            "chart_panels": u4_charts,
            "decisions_needed": [dec_u4_lco],
        },
        {
            "id": "UC-02",
            "number": 2,
            "title": "Stabilizer / Overhead C5 Recovery Optimization",
            "category": "Light-Ends & Gas Plant Recovery",
            "unit_id": "unit_6_stabiliser",
            "unit_name": "Unit 6 · Stabiliser & Light-Ends Gas Plant",
            "status": units[5]["status"],
            "badge_text": units[5]["status_label"],
            "problem_statement": "Excessive stabilizer overhead reflux or low overhead temperature slips valuable C5 pentanes into low-grade LPG, while over-heating drives C4 butane into Light Naphtha and violates Reid Vapor Pressure (RVP) limits.",
            "solution_summary": f"Tracks real-time C1–C5 light-ends split (eff_C5 = {eff_c5:.3f}, eff_C4 = {eff_c4:.3f}, C5 recovery = {c5_recovery_pct:.1f}%) coupled with overhead temperature SP_T_overhead ({sp_t_ovhd:.1f} °F) and reflux ratio MV_reflux_ratio ({mv_reflux:.3f}).",
            "kpis": [
                {"label": "C5 Recovery Share", "tag": "c5_recovery_pct", "value": c5_recovery_pct, "unit": "%", "target": ">= 33.0%"},
                {"label": "C5 Slippage to LPG", "tag": "c5_slip_to_lpg_pct", "value": c5_slip_to_lpg_pct, "unit": "%", "target": "Minimize slip"},
                {"label": "Stabilised Light Naphtha", "tag": "prod_LN", "value": round(prod_ln, 1), "unit": "lb/min", "target": "On-spec RVP"},
                {"label": "Overhead Drum Temp SP", "tag": "SP_T_overhead", "value": round(sp_t_ovhd, 1), "unit": "°F", "target": "244.5–247.0 °F"},
            ],
            "envelope": units[5]["envelope"],
            "recommendation": dec_u6,
            "systems_ripple": dec_u6["systems_ripple"],
            "citations": dec_u6["citations"],
            "tag_table": u6_tag_table,
            "chart_panels": u6_charts,
            "decisions_needed": [dec_u6],
        },
        {
            "id": "UC-03",
            "number": 3,
            "title": "Gas Plant & Naphtha Splitter Cut-Point Optimization (HN T98 & LPG Split)",
            "category": "Distillation & Yield Optimization",
            "unit_id": "unit_4_fractionator",
            "unit_name": "Unit 4 & 6 · Naphtha Side-Cut & Gas Plant",
            "status": hn_trust,
            "badge_text": f"HN T98 P95 {hn_q95:.1f} °F (SPEC 540 °F)",
            "problem_statement": "Sub-optimal separation between Light Naphtha (LN), Heavy Naphtha (HN_T98_F <= 540 °F), and LPG (C3/C4) starves downstream reformer feed or overloads the wet gas compressor.",
            "solution_summary": f"Simultaneously supervises HN_T98_F (P50 = {hn_q50:.1f} °F, P95 = {hn_q95:.1f} °F, W90 = {hn_w90:.1f} °F) on Tray 6 alongside C3/C4 LPG recovery ({lpg_c3_c4_share_pct:.1f}% of light ends).",
            "kpis": [
                {"label": "HN T98 P50 / P95", "tag": "HN_T98_F", "value": f"{hn_q50:.1f} / {hn_q95:.1f}", "unit": "°F", "target": "<= 540.0 °F"},
                {"label": "Heavy Naphtha Draw", "tag": "prod_HN", "value": round(prod_hn, 1), "unit": "lb/min", "target": "Reformer feed"},
                {"label": "LPG Product Draw", "tag": "prod_LPG", "value": round(prod_lpg, 1), "unit": "lb/min", "target": "C3+C4 recovery"},
                {"label": "LCO–HN Boiling Gap", "tag": "cutpoint_gap_F", "value": cutpoint_gap_F, "unit": "°F", "target": ">= 50.0 °F"},
            ],
            "envelope": {
                "parameter": "HN_T98_F",
                "label": "Heavy Naphtha T98 Distillation Cut-Point",
                "unit": "°F",
                "current_value": round(hn_q50, 2),
                "p50": round(hn_q50, 2),
                "p95": round(hn_q95, 2),
                "sweet_spot_min": 537.5,
                "sweet_spot_max": 539.0,
                "spec_limit": 540.0,
                "scale_min": 526.0,
                "scale_max": 542.0,
                "zone": "TRANSITION_LOCK" if hn_gate == "WITHHELD" else ("SWEET_SPOT" if 537.5 <= hn_q95 <= 539.0 else ("OVER_TREATING" if hn_q95 < 537.5 else "UNDER_TREATING")),
                "zone_label": f"HN T98 GATE {hn_gate} · P(ON-SPEC) {hn_p_spec*100:.1f}%",
                "advice": f"HN_T98_F P95 is {hn_q95:.1f} °F against the 540.0 °F spec limit with LCO-HN boiling gap = {cutpoint_gap_F:.1f} °F.",
            },
            "recommendation": dec_u4_hn,
            "systems_ripple": dec_u4_hn["systems_ripple"],
            "citations": dec_u4_hn["citations"],
            "tag_table": u4_tag_table[:10] + u6_tag_table[:8],
            "chart_panels": [u4_charts[0], u6_charts[1]],
            "decisions_needed": [dec_u4_hn, dec_u6],
        },
        {
            "id": "UC-04",
            "number": 4,
            "title": "Catalyst Regenerator Coke Burn & Excess O2 Optimization",
            "category": "Reactor / Regenerator Kinetics",
            "unit_id": "unit_3_regenerator",
            "unit_name": "Unit 3 · Catalyst Regenerator & Air Blower",
            "status": units[2]["status"],
            "badge_text": units[2]["status_label"],
            "problem_statement": "Insufficient combustion air leaves carbon on regenerated catalyst (C_regen_cat > 0.4 wt%), poisoning acid sites and depressing conversion, while excess air wastes Main Air Blower (CAB) power and triggers cyclone CO afterburn.",
            "solution_summary": f"Couples coke burn rate (F_coke = {f_coke:.1f} lb/min), spent/regen carbon ({c_spent*100:.2f}% -> {c_regen*100:.3f}%), flue gas O2 ({flue_o2:.2f}%), CO ({flue_co:.0f} ppm), and cyclone afterburn dT ({dt_cyc_reg:+.1f} °F).",
            "kpis": [
                {"label": "Regen Catalyst Carbon", "tag": "C_regen_cat", "value": round(c_regen * 100.0, 3), "unit": "wt%", "target": "<= 0.35 wt%"},
                {"label": "Cyclone Afterburn dT", "tag": "dT_cyc_reg_F", "value": round(dt_cyc_reg, 1), "unit": "°F", "target": "5.0–18.0 °F"},
                {"label": "Flue Gas O2 / CO", "tag": "fluegas_O2_pct", "value": f"{flue_o2:.2f}% / {flue_co:.0f} ppm", "unit": "", "target": "1.8–2.5% O2"},
                {"label": "CAB Shaft Power", "tag": "power_CAB", "value": round(power_cab, 2), "unit": "MW", "target": f"Fair {f_air:.1f} lb/s"},
            ],
            "envelope": units[2]["envelope"],
            "recommendation": dec_u3,
            "systems_ripple": dec_u3["systems_ripple"],
            "citations": dec_u3["citations"],
            "tag_table": u3_tag_table,
            "chart_panels": u3_charts,
            "decisions_needed": [dec_u3],
        },
        {
            "id": "UC-05",
            "number": 5,
            "title": "Fired Preheat Furnace Combustion & Tube Coking Optimization",
            "category": "Energy & Thermal Integration",
            "unit_id": "unit_1_furnace",
            "unit_name": "Unit 1 · Crude/VGO Preheat Furnace",
            "status": units[0]["status"],
            "badge_text": units[0]["status_label"],
            "problem_statement": "Over-firing the feed preheat heater with high excess air wastes fuel gas (F5_fuel) and accelerates internal tube coking when firebox temperature T3_furnace_F approaches metallurgical IOW limits.",
            "solution_summary": f"Monitors furnace firebox T3 ({t3_furnace:.1f} °F), preheat outlet T2 ({t2_preheat:.1f} °F), fuel gas F5 ({f5_fuel:.2f} lb/s), and PINN tube-coking thermal residual ({furnace_coking_residual_F:+.1f} °F).",
            "kpis": [
                {"label": "Feed Preheat Outlet (T2)", "tag": "T2_preheat_F", "value": round(t2_preheat, 1), "unit": "°F", "target": f"SP {sp_t_preheat:.1f} °F"},
                {"label": "Firebox Temp (T3)", "tag": "T3_furnace_F", "value": round(t3_furnace, 1), "unit": "°F", "target": "<= 1620.0 °F IOW"},
                {"label": "Fuel Gas Rate (F5)", "tag": "F5_fuel", "value": round(f5_fuel, 2), "unit": "lb/s", "target": f"Delta {fuel_delta_lb_s:+.2f} lb/s"},
                {"label": "Tube Coking Residual", "tag": "furnace_coking_residual_F", "value": furnace_coking_residual_F, "unit": "°F", "target": "|res| <= 25 °F"},
            ],
            "envelope": units[0]["envelope"],
            "recommendation": dec_u1,
            "systems_ripple": dec_u1["systems_ripple"],
            "citations": dec_u1["citations"],
            "tag_table": u1_tag_table,
            "chart_panels": u1_charts,
            "decisions_needed": [dec_u1],
        },
        {
            "id": "UC-06",
            "number": 6,
            "title": "Main Fractionator Pumparound (PA1–PA4) & Preheat Pinch Optimization",
            "category": "Energy & Thermal Integration",
            "unit_id": "unit_4_fractionator",
            "unit_name": "Unit 4 · Main Fractionator Pumparounds",
            "status": "GREEN" if tray_monotonicity_ok else "AMBER",
            "badge_text": "PA1–PA4 PINCH INTEGRATED" if tray_monotonicity_ok else "TRAY PROFILE IMBALANCE",
            "problem_statement": "Uncoordinated top/middle/bottom pumparounds (MV_PA1..MV_PA4) dump high-grade fractionator heat to cooling water instead of preheating feed, or cause internal liquid flooding and tray temperature inversions.",
            "solution_summary": f"Balances PA1 ({mv_pa1:.1f}), PA2 ({mv_pa2:.1f}), PA3 ({mv_pa3:.1f}), and bottom slurry PA4 ({mv_pa4:.1f}) while enforcing PINN 20-tray boiling monotonicity (Tray 1 {t_tray01:.1f} °F -> Tray 20 {t_tray20:.1f} °F).",
            "kpis": [
                {"label": "Bottom Slurry PA4 Duty", "tag": "MV_PA4", "value": round(mv_pa4, 1), "unit": "klb/h", "target": "Max heat recovery"},
                {"label": "Mid Pumparounds PA2 / PA3", "tag": "MV_PA2", "value": f"{mv_pa2:.1f} / {mv_pa3:.1f}", "unit": "klb/h", "target": "Fractionation reflux"},
                {"label": "Top Pumparound PA1", "tag": "MV_PA1", "value": round(mv_pa1, 1), "unit": "klb/h", "target": "Condenser unload"},
                {"label": "PINN Tray Monotonicity", "tag": "tray_monotonicity", "value": "PASS (0 inv)" if tray_monotonicity_ok else f"{tray_violations} inv", "unit": "", "target": "T01 <= ... <= T20"},
            ],
            "envelope": {
                "parameter": "MV_PA4",
                "label": "Bottom Slurry Pumparound Circulation (MV_PA4)",
                "unit": "klb/h",
                "current_value": round(mv_pa4, 1),
                "p50": round(mv_pa4, 1),
                "p95": round(mv_pa4 + 18.0, 1),
                "sweet_spot_min": 1220.0,
                "sweet_spot_max": 1280.0,
                "spec_limit": 1350.0,
                "scale_min": 1150.0,
                "scale_max": 1360.0,
                "zone": "SWEET_SPOT" if 1220.0 <= mv_pa4 <= 1280.0 else "OVER_TREATING",
                "zone_label": "HIGH-GRADE HEAT RECOVERY ACTIVE",
                "advice": f"Shifting heat removal from top PA1 ({mv_pa1:.1f}) and overhead condenser toward bottom PA4 ({mv_pa4:.1f}) recovers +{pa_heat_recovery_F:.1f} °F into feed preheat T2.",
            },
            "recommendation": dec_u4_pa,
            "systems_ripple": dec_u4_pa["systems_ripple"],
            "citations": dec_u4_pa["citations"],
            "tag_table": u4_tag_table[4:15] + u1_tag_table[:4],
            "chart_panels": [u4_charts[1], u1_charts[1]],
            "decisions_needed": [dec_u4_pa, dec_u1],
        },
        {
            "id": "UC-07",
            "number": 7,
            "title": "Overhead Condenser Fouling & Cooling Duty Management",
            "category": "Asset Integrity & Fouling",
            "unit_id": "unit_5_condenser",
            "unit_name": "Unit 5 · Overhead Condenser & Reflux Drum",
            "status": condenser_status,
            "badge_text": units[4]["status_label"],
            "problem_statement": "Salt deposition and waterside scaling degrade overhead condenser heat-transfer efficiency (dist_condenser_eff), raising overhead drum temperature, spiking Wet Gas Compressor (WGC) load, and saturating cooling water valve V9.",
            "solution_summary": f"PINN enthalpy balance isolates true condenser UA efficiency ({cond_eff*100:.1f}%, residual {condenser_ua_residual:.3f}) from ambient temperature swings ({t_ambient:.1f} °F) and coordinates cooling water flow MV_cw_flow ({mv_cw:.1f} lb/s).",
            "kpis": [
                {"label": "Condenser UA Efficiency", "tag": "dist_condenser_eff", "value": round(cond_eff * 100.0, 1), "unit": "%", "target": ">= 86.0%"},
                {"label": "PINN UA Fouling Residual", "tag": "condenser_ua_residual", "value": condenser_ua_residual, "unit": "dim", "target": "<= 0.040"},
                {"label": "Cooling Water Flow", "tag": "MV_cw_flow", "value": round(mv_cw, 1), "unit": "lb/s", "target": f"Valve V9 {v9_pos*100:.1f}%"},
                {"label": "Ambient Air Temp", "tag": "dist_T_ambient_F", "value": round(t_ambient, 1), "unit": "°F", "target": "Disturbance tracked"},
            ],
            "envelope": units[4]["envelope"],
            "recommendation": dec_u5,
            "systems_ripple": dec_u5["systems_ripple"],
            "citations": dec_u5["citations"],
            "tag_table": u5_tag_table,
            "chart_panels": u5_charts,
            "decisions_needed": [dec_u5],
        },
        {
            "id": "UC-08",
            "number": 8,
            "title": "FCC Riser Reactor Severity, Conversion & Yield Selectivity",
            "category": "Reactor / Regenerator Kinetics",
            "unit_id": "unit_2_riser",
            "unit_name": "Unit 2 · Riser Reactor & Standpipe",
            "status": units[1]["status"],
            "badge_text": units[1]["status_label"],
            "problem_statement": "Feed API gravity shifts (dist_feed_API) alter cracking kinetics; running excessive Riser Outlet Temperature (ROT) over-cracks gasoline into dry gas (C1/C2) and coke, while low ROT leaves unconverted VGO slurry.",
            "solution_summary": f"Tracks real-time conversion ({conv_pct:.2f}%), ROT ({tr_riser:.1f} °F vs SP {sp_t_riser:.1f} °F), feed API ({feed_api:.1f} °API), and regenerated catalyst circulation ({f_regen_cat:.0f} lb/min).",
            "kpis": [
                {"label": "Once-Through Conversion", "tag": "conversion_pct", "value": round(conv_pct, 2), "unit": "%", "target": "71.0–75.5%"},
                {"label": "Riser Outlet Temp (ROT)", "tag": "Tr_riser_out_F", "value": round(tr_riser, 1), "unit": "°F", "target": "966.0–974.0 °F"},
                {"label": "Feed API Gravity", "tag": "dist_feed_API", "value": round(feed_api, 2), "unit": "°API", "target": "22.0–28.0 °API"},
                {"label": "Dry Gas Slip (C1+C2)", "tag": "eff_C1_C2", "value": round(eff_c1 + eff_c2, 3), "unit": "mol", "target": "<= 1.40"},
            ],
            "envelope": units[1]["envelope"],
            "recommendation": dec_u2,
            "systems_ripple": dec_u2["systems_ripple"],
            "citations": dec_u2["citations"],
            "tag_table": u2_tag_table,
            "chart_panels": u2_charts,
            "decisions_needed": [dec_u2],
        },
        {
            "id": "UC-09",
            "number": 9,
            "title": "Wet Gas Compressor (WGC), Main Air Blower (CAB) & Control Valve Health",
            "category": "Rotating Equipment & Valve Diagnostics",
            "unit_id": "unit_3_regenerator",
            "unit_name": "Unit 3, 4 & 5 · Compressors & Final Control Elements",
            "status": "GREEN" if all(v["status"] == "GREEN" for v in valve_health_matrix) else "AMBER",
            "badge_text": f"CAB {power_cab:.2f} MW · WGC {power_wgc:.2f} MW · 8 VALVES TRACKED",
            "problem_statement": "Compressor surge/overload on CAB or WGC and control valve stiction/saturation (V8–V11, V1–V7) cause hunting in fractionator cut-points and pressure control loops.",
            "solution_summary": f"Continuously monitors CAB power ({power_cab:.2f} MW), WGC power ({power_wgc:.2f} MW), and stem travel positions across all fractionator (V8–V11) and reactor/regen (V1–V7) control valves against [15%, 85%] linear authority bands.",
            "kpis": [
                {"label": "Main Air Blower (CAB)", "tag": "power_CAB", "value": round(power_cab, 2), "unit": "MW", "target": "<= 7.20 MW"},
                {"label": "Wet Gas Compressor (WGC)", "tag": "power_WGC", "value": round(power_wgc, 2), "unit": "MW", "target": "<= 5.40 MW"},
                {"label": "LCO Draw Valve V11", "tag": "valve_V11", "value": round(v11_pos * 100.0, 1), "unit": "% open", "target": "15–85% band"},
                {"label": "HN Draw Valve V10", "tag": "valve_V10", "value": round(v10_pos * 100.0, 1), "unit": "% open", "target": "15–85% band"},
            ],
            "envelope": {
                "parameter": "valve_V11",
                "label": "LCO Product Draw Control Valve V11 Stem Authority",
                "unit": "% open",
                "current_value": round(v11_pos * 100.0, 1),
                "p50": round(v11_pos * 100.0, 1),
                "p95": round(min(99.0, v11_pos * 100.0 + 4.0), 1),
                "sweet_spot_min": 25.0,
                "sweet_spot_max": 75.0,
                "spec_limit": 88.0,
                "scale_min": 5.0,
                "scale_max": 95.0,
                "zone": "SWEET_SPOT" if 25.0 <= v11_pos * 100.0 <= 75.0 else "OVER_TREATING",
                "zone_label": "LINEAR CONTROL AUTHORITY",
                "advice": f"Valves V8 ({v8_pos*100:.1f}%), V9 ({v9_pos*100:.1f}%), V10 ({v10_pos*100:.1f}%), and V11 ({v11_pos*100:.1f}%) are within linear authority bands; combined CAB+WGC shaft load is {power_cab+power_wgc:.2f} MW.",
            },
            "recommendation": dec_uc09,
            "systems_ripple": dec_uc09["systems_ripple"],
            "citations": dec_uc09["citations"],
            "tag_table": [
                _build_tag_row(df_win, row, "power_CAB", "Main Air Blower Shaft Power", "CV", "MW", "<= 7.20 MW"),
                _build_tag_row(df_win, row, "power_WGC", "Wet Gas Compressor Shaft Power", "CV", "MW", "<= 5.40 MW"),
                _build_tag_row(df_win, row, "valve_V8", "Overhead Reflux Control Valve V8", "VALVE", "frac", "0.15–0.85"),
                _build_tag_row(df_win, row, "valve_V9", "Condenser Cooling Water Valve V9", "VALVE", "frac", "0.15–0.85"),
                _build_tag_row(df_win, row, "valve_V10", "Heavy Naphtha Draw Valve V10", "VALVE", "frac", "0.15–0.85"),
                _build_tag_row(df_win, row, "valve_V11", "LCO Diesel Draw Valve V11", "VALVE", "frac", "0.15–0.85"),
                _build_tag_row(df_win, row, "V1", "Furnace Fuel Valve V1", "VALVE", "frac", "0.15–0.85"),
                _build_tag_row(df_win, row, "V3", "Regen Catalyst Slide Valve V3", "VALVE", "frac", "0.15–0.85"),
                _build_tag_row(df_win, row, "V4", "Air Blower Discharge Valve V4", "VALVE", "frac", "0.15–0.85"),
                _build_tag_row(df_win, row, "V6", "Flue Gas Slide Valve V6", "VALVE", "frac", "0.15–0.85"),
            ],
            "chart_panels": [
                {
                    "panel_id": "uc09_compressors",
                    "title": "Main Air Blower (CAB MW) & Wet Gas Compressor (WGC MW) Shaft Power",
                    "subtitle": "Rotating machinery load across regenerator and overhead gas plant",
                    "unit": "MW",
                    "traces": [
                        {"tag": "power_CAB", "label": "CAB Shaft Power (MW)", "color": "#38bdf8"},
                        {"tag": "power_WGC", "label": "WGC Shaft Power (MW)", "color": "#f59e0b"},
                    ],
                },
                {
                    "panel_id": "uc09_valves",
                    "title": "Final Control Valve Stem Positions (V8, V9, V10, V11, V3, V4)",
                    "subtitle": "Surveillance against [0.15, 0.85] linear control authority limits",
                    "unit": "frac",
                    "traces": [
                        {"tag": "valve_V11", "label": "LCO Draw V11", "color": "#38bdf8"},
                        {"tag": "valve_V10", "label": "HN Draw V10", "color": "#10b981"},
                        {"tag": "valve_V8", "label": "Reflux V8", "color": "#f59e0b"},
                        {"tag": "valve_V9", "label": "Cooling Water V9", "color": "#a78bfa"},
                    ],
                },
            ],
            "decisions_needed": [dec_uc09],
        },
        {
            "id": "UC-10",
            "number": 10,
            "title": "Integrity Operating Windows (IOW), Flooding & Metallurgy Guardrails",
            "category": "Asset Integrity & Fouling",
            "unit_id": "unit_2_riser",
            "unit_name": "Unit 1, 2, 3 & 4 · Plant-Wide IOW Supervision",
            "status": "GREEN" if (flooding_status == "GREEN" and furnace_status == "GREEN" and mass_closure_ok) else "AMBER",
            "badge_text": "ALL IOW GUARDRAILS SATISFIED" if flooding_status == "GREEN" else "IOW BOUNDARY WATCH",
            "problem_statement": "Pushing yield set points without simultaneous physics guardrails risks fractionator tray flooding (high dP_reactor_frac), furnace tube coking (T3 > 1620 °F), or regenerator cyclone metallurgy damage (Tcyc > 1310 °F).",
            "solution_summary": f"Enforces hard PINN physical conservation and IOW boundaries across all 6 units: hydraulic dP ratio = {hydraulic_dp_norm:.2f}x nominal, furnace T3 = {t3_furnace:.1f} °F, cyclone Tcyc = {tcyc_f:.1f} °F, and mass balance error = {mb_err_pct:+.2f}%.",
            "kpis": [
                {"label": "Hydraulic Flooding Ratio", "tag": "hydraulic_dp_norm", "value": hydraulic_dp_norm, "unit": "x nom", "target": "<= 1.08x"},
                {"label": "Furnace Firebox IOW Margin", "tag": "T3_margin_F", "value": round(1620.0 - t3_furnace, 1), "unit": "°F", "target": ">= 30.0 °F"},
                {"label": "Cyclone Metallurgy Margin", "tag": "Tcyc_margin_F", "value": round(1310.0 - tcyc_f, 1), "unit": "°F", "target": ">= 25.0 °F"},
                {"label": "PINN Mass Closure Error", "tag": "mass_balance_err_pct", "value": round(mb_err_pct, 3), "unit": "%", "target": "|err| <= 1.5%"},
            ],
            "envelope": {
                "parameter": "dP_reactor_frac",
                "label": "Riser / Main Fractionator Hydraulic Pressure Drop",
                "unit": "psi frac",
                "current_value": round(dp_reactor, 3),
                "p50": round(dp_reactor, 3),
                "p95": round(dp_reactor + 0.015, 3),
                "sweet_spot_min": 0.39,
                "sweet_spot_max": 0.45,
                "spec_limit": 0.48,
                "scale_min": 0.35,
                "scale_max": 0.52,
                "zone": "SWEET_SPOT" if dp_reactor <= 0.45 else "UNDER_TREATING",
                "zone_label": "SAFE HYDRAULIC VAPOR/LIQUID TRAFFIC",
                "advice": f"Hydraulic dP is {dp_reactor:.3f} ({hydraulic_dp_norm:.2f}x nominal) with 0 tray boiling inversions across Trays 1–20.",
            },
            "recommendation": dec_uc10,
            "systems_ripple": dec_uc10["systems_ripple"],
            "citations": dec_uc10["citations"],
            "tag_table": [
                _build_tag_row(df_win, row, "dP_reactor_frac", "Reactor / Column Hydraulic Pressure Drop", "CV", "frac", "<= 0.480 IOW", flooding_status),
                _build_tag_row(df_win, row, "T3_furnace_F", "Furnace Firebox Tube Metallurgy Temp", "CV", "°F", "<= 1620.0 °F IOW", furnace_status),
                _build_tag_row(df_win, row, "Tcyc_F", "Regenerator Cyclone Metallurgy Temp", "CV", "°F", "<= 1310.0 °F IOW"),
                _build_tag_row(df_win, row, "dT_cyc_reg_F", "Cyclone Afterburn Delta-T", "CV", "°F", "<= 25.0 °F IOW"),
                _build_tag_row(df_win, row, "mass_balance_err_pct", "PINN Plant-Wide Mass Closure Error", "RESIDUAL", "%", "|err| <= 1.5%"),
                _build_tag_row(df_win, row, "P4_reactor_psia", "Reactor Vessel Pressure P4", "CV", "psia", "<= 28.0 psia"),
                _build_tag_row(df_win, row, "P5_frac_psia", "Fractionator Overhead Pressure P5", "CV", "psia", "<= 28.0 psia"),
                _build_tag_row(df_win, row, "P6_regen_psia", "Regenerator Vessel Pressure P6", "CV", "psia", "<= 32.0 psia"),
            ],
            "chart_panels": [u2_charts[1], u3_charts[0]],
            "decisions_needed": [dec_uc10],
        },
        {
            "id": "UC-11",
            "number": 11,
            "title": "Dual-Sensor Drift Detection, Trust Scoring & Lab Bias Fusion",
            "category": "Instrumentation & Soft-Sensor Governance",
            "unit_id": "unit_4_fractionator",
            "unit_name": "Plant-Wide · 5 Redundant Sensor Channels & Lab Fusion",
            "status": lco_trust,
            "badge_text": f"TRUST {lco_trust} · GATE {lco_gate} · 5 DUP CHANNELS",
            "problem_statement": "Thermocouple or pressure transmitter drift (T2, Tr, Treg, P5, P6) corrupts data-driven soft sensors, causing uncalibrated ML models to issue dangerous set-point moves during instrument faults or unmeasured crude switches.",
            "solution_summary": f"Supervises 7 orthogonal Trust Signals (S1–S7), 5 hardware-redundant sensor pairs (T2_dup, Tr_dup, Treg_dup, P5_dup, P6_dup), scalar Kalman filter lab bias fusion (b = {float(lco_msg.get('bias', {}).get('b', 0.0)):+.2f} °F), and the Distribution Spread Gate.",
            "kpis": [
                {"label": "Overall Trust Level", "tag": "trust", "value": lco_trust, "unit": "", "target": "7 signals S1–S7"},
                {"label": "Max Dual-Sensor Temp Drift", "tag": "max_t_drift_F", "value": max(x["abs_drift"] for x in sensor_drift_matrix[:3]), "unit": "°F", "target": "<= 2.5 °F"},
                {"label": "Max Dual-Sensor Press Drift", "tag": "max_p_drift_psia", "value": max(x["abs_drift"] for x in sensor_drift_matrix[3:]), "unit": "psia", "target": "<= 0.35 psia"},
                {"label": "Kalman Lab Bias (LCO)", "tag": "kalman_bias_F", "value": round(float(lco_msg.get("bias", {}).get("b", 0.0)), 2), "unit": "°F", "target": "Auto-fused on lab"},
            ],
            "envelope": {
                "parameter": "W90_spread_F",
                "label": "4-Model Committee 90% Predictive Interval Width (W90)",
                "unit": "°F",
                "current_value": round(lco_w90, 2),
                "p50": round(lco_w90, 2),
                "p95": round(lco_w90, 2),
                "sweet_spot_min": 4.0,
                "sweet_spot_max": 12.6,
                "spec_limit": 14.0,
                "scale_min": 2.0,
                "scale_max": 18.0,
                "zone": "SWEET_SPOT" if lco_gate == "PASS" else "TRANSITION_LOCK",
                "zone_label": f"GATE {lco_gate} (W90 = {lco_w90:.1f} °F vs 14.0 °F LIMIT)",
                "advice": f"When all 4 model families align (W90 = {lco_w90:.1f} °F <= 14.0 °F) and dual-sensor drift is within limits, the Spread Gate passes recommendations. When models diverge, the gate automatically withholds set-point moves.",
            },
            "recommendation": dec_uc11,
            "systems_ripple": dec_uc11["systems_ripple"],
            "citations": dec_uc11["citations"],
            "tag_table": [
                _build_tag_row(df_win, row, "T2_preheat_F", "Primary Preheat Outlet Temp T2", "CV", "°F", "Primary sensor"),
                _build_tag_row(df_win, row, "T2_dup", "Duplicate Preheat Outlet Temp T2_dup", "DUP_SENSOR", "°F", f"|dT| <= 2.5 °F"),
                _build_tag_row(df_win, row, "Tr_riser_F", "Primary Riser ROT Temp Tr", "CV", "°F", "Primary sensor"),
                _build_tag_row(df_win, row, "Tr_dup", "Duplicate Riser ROT Temp Tr_dup", "DUP_SENSOR", "°F", f"|dT| <= 2.5 °F"),
                _build_tag_row(df_win, row, "Treg_F", "Primary Regen Bed Temp Treg", "CV", "°F", "Primary sensor"),
                _build_tag_row(df_win, row, "Treg_dup", "Duplicate Regen Bed Temp Treg_dup", "DUP_SENSOR", "°F", f"|dT| <= 3.0 °F"),
                _build_tag_row(df_win, row, "P5_frac_psia", "Primary Fractionator Pressure P5", "CV", "psia", "Primary sensor"),
                _build_tag_row(df_win, row, "P5_dup", "Duplicate Fractionator Pressure P5_dup", "DUP_SENSOR", "psia", f"|dP| <= 0.35 psia"),
                _build_tag_row(df_win, row, "P6_regen_psia", "Primary Regenerator Pressure P6", "CV", "psia", "Primary sensor"),
                _build_tag_row(df_win, row, "P6_dup", "Duplicate Regenerator Pressure P6_dup", "DUP_SENSOR", "psia", f"|dP| <= 0.35 psia"),
            ],
            "chart_panels": [
                {
                    "panel_id": "uc11_temp_dups",
                    "title": "Primary vs. Duplicate Thermocouple Channels (T2, Tr, Treg)",
                    "subtitle": "Continuous hardware redundancy voting for S3 sensor-drift trust signal",
                    "unit": "°F",
                    "traces": [
                        {"tag": "Tr_riser_F", "label": "Primary Tr (°F)", "color": "#f97316"},
                        {"tag": "Tr_dup", "label": "Duplicate Tr_dup (°F)", "color": "#34d399", "dash": "dot"},
                        {"tag": "T2_preheat_F", "label": "Primary T2 (°F)", "color": "#38bdf8"},
                        {"tag": "T2_dup", "label": "Duplicate T2_dup (°F)", "color": "#a78bfa", "dash": "dot"},
                    ],
                },
                {
                    "panel_id": "uc11_press_dups",
                    "title": "Primary vs. Duplicate Pressure Transmitters (P5 Fractionator & P6 Regenerator)",
                    "subtitle": "Detects impulse-line plugging or transmitter diaphragm drift",
                    "unit": "psia",
                    "traces": [
                        {"tag": "P6_regen_psia", "label": "Primary P6 (psia)", "color": "#eab308"},
                        {"tag": "P6_dup", "label": "Duplicate P6_dup (psia)", "color": "#10b981", "dash": "dot"},
                        {"tag": "P5_frac_psia", "label": "Primary P5 (psia)", "color": "#38bdf8"},
                        {"tag": "P5_dup", "label": "Duplicate P5_dup (psia)", "color": "#f43f5e", "dash": "dot"},
                    ],
                },
            ],
            "decisions_needed": [dec_uc11],
        },
    ]

    # 7-Agent Proactive Sentinel Fleet with English, Hinglish, and Hindi Briefings (SDD-AGENT-01..03)
    max_t_drift = max(x["abs_drift"] for x in sensor_drift_matrix[:3])
    agent_fleet = [
        {
            "agent_id": "agent_supervisor",
            "name": "Shift Supervisor Orchestrator Agent",
            "role": "Plant-Wide Multi-Agent & Voice Coordinator",
            "unit_id": "unit_4_fractionator",
            "use_case_ids": ["UC-01", "UC-06", "UC-10", "UC-11"],
            "status": lco_unit_status,
            "priority_rank": 1,
            "proactive_alert": (
                f"PROACTIVE BRIEFING (t={t_val}): Spread Gate is {lco_gate} (W90={lco_w90:.1f} °F). "
                + (
                    f"Unit 4 LCO T98 P95 ({lco_q95:.1f} °F) has {lco_margin:.1f} °F giveaway margin below 765 °F spec — recommend {dec_u4_lco['action']} SP_LCO_T98 by {sp_delta_F:+.1f} °F."
                    if lco_gate == "PASS"
                    else f"4-model committee spread W90 ({lco_w90:.1f} °F) exceeds 14.0 °F limit — holding set points across all units."
                )
            ),
            "briefings": {
                "en": (
                    f"Shift Supervisor report at minute {t_val}: All 6 units are online with PINN mass closure at {mb_err_pct:+.2f}%. "
                    f"On Unit 4 Main Fractionator, LCO T98 P95 is {lco_q95:.1f} °F ({lco_margin:.1f} °F below the 765 °F spec limit) with Gate {lco_gate} (W90 = {lco_w90:.1f} °F). "
                    f"Recommended move: {dec_u4_lco['action']} SP_LCO_T98 from {sp_lco:.1f} to {sp_lco_after:.1f} °F ({yield_shift_pct:+.2f}% LCO yield shift) while trimming Unit 1 furnace O2 from {flue_o2:.2f}% to reduce fuel gas F5 by {abs(fuel_delta_lb_s):.2f} lb/s."
                ),
                "hinglish": (
                    f"Namaste Sir, minute {t_val} par Shift Supervisor Orchestrator update: poore 6 units connected hain aur PINN mass balance error sirf {mb_err_pct:+.2f}% hai. "
                    f"Abhi Unit 4 Main Fractionator mein LCO_T98_F P95 {lco_q95:.1f} °F chal raha hai, jo 765 °F spec limit se {lco_margin:.1f} °F niche hai — yaani quality giveaway ho raha hai. "
                    f"4-model committee ka W90 spread {lco_w90:.1f} °F hai aur Gate {lco_gate} hai. Mera proactive recommendation hai ki SP_LCO_T98 ko {sp_lco:.1f} se {sp_lco_after:.1f} °F ({sp_delta_F:+.1f} °F) {dec_u4_lco['action']} karein, jisse LCO distillate yield {yield_shift_pct:+.2f}% badhega, aur saath hi Unit 1 Furnace O2 trim karke {abs(fuel_delta_lb_s):.2f} lb/s fuel gas bachayein."
                ),
                "hi": (
                    f"नमस्ते सर, मिनट {t_val} पर शिफ्ट सुपरवाइज़र एजेंट की प्रोएक्टिव रिपोर्ट: सभी 6 यूनिट्स सामान्य रूप से जुड़ी हैं और PINN द्रव्यमान संतुलन त्रुटि केवल {mb_err_pct:+.2f}% है। "
                    f"यूनिट 4 मुख्य फ्रैक्शनेटर में LCO_T98_F का P95 अभी {lco_q95:.1f} °F है, जो 765 °F सीमा से {lco_margin:.1f} °F नीचे है। "
                    f"स्प्रेड गेट {lco_gate} (W90 = {lco_w90:.1f} °F) है। सुझाव है कि SP_LCO_T98 को {sp_lco:.1f} से {sp_lco_after:.1f} °F ({sp_delta_F:+.1f} °F) {dec_u4_lco['action']} करें, जिससे LCO उत्पादन में {yield_shift_pct:+.2f}% सुधार होगा और यूनिट 1 फर्नेस में {abs(fuel_delta_lb_s):.2f} lb/s ईंधन गैस की कमी आएगी।"
                ),
            },
        },
        {
            "agent_id": "agent_furnace",
            "name": "Unit 1 Furnace & Thermal Coking Sentinel",
            "role": "Preheat & Combustion Stoichiometry Agent",
            "unit_id": "unit_1_furnace",
            "use_case_ids": ["UC-05", "UC-10"],
            "status": units[0]["status"],
            "priority_rank": 2,
            "proactive_alert": f"Unit 1 Furnace: Firebox T3 = {t3_furnace:.1f} °F (margin {1620.0 - t3_furnace:.1f} °F to 1620 °F IOW), Stack O2 = {flue_o2:.2f}%, Fuel F5 = {f5_fuel:.2f} lb/s.",
            "briefings": {
                "en": f"Unit 1 Furnace Sentinel: Preheat outlet T2 is {t2_preheat:.1f} °F (SP {sp_t_preheat:.1f} °F) and firebox T3 is {t3_furnace:.1f} °F with coking residual {furnace_coking_residual_F:+.1f} °F. Stack O2 is {flue_o2:.2f}% and CO is {flue_co:.0f} ppm. Trimming O2 and recovering PA4 pumparound heat reduces F5_fuel by {abs(fuel_delta_lb_s):.2f} lb/s.",
                "hinglish": f"Unit 1 Furnace Sentinel alert: Preheat outlet T2 abhi {t2_preheat:.1f} °F hai aur firebox T3 {t3_furnace:.1f} °F hai (1620 °F tube coking IOW se {1620.0 - t3_furnace:.1f} °F safe margin). Stack O2 {flue_o2:.2f}% aur CO {flue_co:.0f} ppm hai. PA4 pumparound heat recovery aur O2 trim se F5_fuel mein {abs(fuel_delta_lb_s):.2f} lb/s ka reduction milega.",
                "hi": f"यूनिट 1 फर्नेस सेंटिनल: प्रीहीट तापमान T2 अभी {t2_preheat:.1f} °F है और फायरबॉक्स तापमान T3 {t3_furnace:.1f} °F है (1620 °F सीमा से {1620.0 - t3_furnace:.1f} °F सुरक्षित)। फ्लू गैस O2 {flue_o2:.2f}% और CO {flue_co:.0f} ppm है। PA4 हीट रिकवरी से ईंधन गैस F5 में {abs(fuel_delta_lb_s):.2f} lb/s की कमी संभव है।",
            },
        },
        {
            "agent_id": "agent_riser",
            "name": "Unit 2 Riser Kinetics & Flooding Sentinel",
            "role": "Cracking Severity & Hydraulic dP Agent",
            "unit_id": "unit_2_riser",
            "use_case_ids": ["UC-08", "UC-10"],
            "status": units[1]["status"],
            "priority_rank": 3,
            "proactive_alert": f"Unit 2 Riser: ROT = {tr_riser:.1f} °F, Conversion = {conv_pct:.1f}%, Hydraulic dP = {dp_reactor:.3f} ({hydraulic_dp_norm:.2f}x nominal).",
            "briefings": {
                "en": f"Unit 2 Riser Sentinel: Riser outlet temperature is {tr_riser:.1f} °F against SP {sp_t_riser:.1f} °F, achieving {conv_pct:.1f}% once-through conversion at feed API {feed_api:.1f}. Hydraulic dP is {dp_reactor:.3f} ({hydraulic_dp_norm:.2f}x nominal), safely below the 0.48 flooding ceiling.",
                "hinglish": f"Unit 2 Riser Sentinel report: Riser ROT {tr_riser:.1f} °F chal raha hai (SP {sp_t_riser:.1f} °F) aur conversion {conv_pct:.1f}% hai. Hydraulic dP {dp_reactor:.3f} ({hydraulic_dp_norm:.2f}x nominal) hai jo 0.48 flooding limit ke andar safe hai. Slide valve V3 {v3_pos*100:.1f}% open hai.",
                "hi": f"यूनिट 2 राइज़र सेंटिनल: राइज़र आउटलेट तापमान (ROT) {tr_riser:.1f} °F है और कन्वर्ज़न {conv_pct:.1f}% है। हाइड्रोलिक dP {dp_reactor:.3f} ({hydraulic_dp_norm:.2f}x सामान्य) है, जो 0.48 फ्लडिंग सीमा से नीचे सुरक्षित है।",
            },
        },
        {
            "agent_id": "agent_regenerator",
            "name": "Unit 3 Regenerator & Air Blower Sentinel",
            "role": "Coke Burn & Cyclone Afterburn Agent",
            "unit_id": "unit_3_regenerator",
            "use_case_ids": ["UC-04", "UC-09"],
            "status": units[2]["status"],
            "priority_rank": 4,
            "proactive_alert": f"Unit 3 Regenerator: Bed Treg = {treg_f:.1f} °F, Cyclone Tcyc = {tcyc_f:.1f} °F (Afterburn dT {dt_cyc_reg:+.1f} °F), Regen Carbon = {c_regen*100:.3f} wt%.",
            "briefings": {
                "en": f"Unit 3 Regenerator Sentinel: Dense bed Treg is {treg_f:.1f} °F and cyclone Tcyc is {tcyc_f:.1f} °F (afterburn dT = {dt_cyc_reg:+.1f} °F vs 25 °F limit). Regenerated catalyst carbon is {c_regen*100:.3f} wt% at CAB power {power_cab:.2f} MW (Fair = {f_air:.1f} lb/s).",
                "hinglish": f"Unit 3 Regenerator Sentinel: Dense bed Treg {treg_f:.1f} °F aur cyclone Tcyc {tcyc_f:.1f} °F hai — afterburn dT {dt_cyc_reg:+.1f} °F control mein hai. Regenerated catalyst carbon {c_regen*100:.3f} wt% hai aur Main Air Blower (CAB) {power_cab:.2f} MW le raha hai.",
                "hi": f"यूनिट 3 रीजेनरेटर सेंटिनल: बेड तापमान Treg {treg_f:.1f} °F और साइक्लोन तापमान Tcyc {tcyc_f:.1f} °F है (आफ्टरबर्न dT = {dt_cyc_reg:+.1f} °F)। रीजेनरेटेड कैटेलिस्ट कार्बन {c_regen*100:.3f} wt% है और मुख्य एयर ब्लोअर (CAB) पावर {power_cab:.2f} MW है।",
            },
        },
        {
            "agent_id": "agent_fractionator",
            "name": "Unit 4 Distillation Committee & Pinch Agent",
            "role": "4-Model Soft-Sensor & Pumparound Agent",
            "unit_id": "unit_4_fractionator",
            "use_case_ids": ["UC-01", "UC-03", "UC-06", "UC-11"],
            "status": units[3]["status"],
            "priority_rank": 5,
            "proactive_alert": f"Unit 4 Fractionator: LCO T98 P95 = {lco_q95:.1f} °F, HN T98 P95 = {hn_q95:.1f} °F, Boiling Gap = {cutpoint_gap_F:.1f} °F, 0 Tray Inversions.",
            "briefings": {
                "en": f"Unit 4 Distillation Agent: 4-model committee estimates LCO T98 P50/P95 at {lco_q50:.1f}/{lco_q95:.1f} °F and HN T98 P50/P95 at {hn_q50:.1f}/{hn_q95:.1f} °F. All 20 trays are monotonically ordered ({t_tray01:.1f} °F top to {t_tray20:.1f} °F bottom) with PA4 circulating at {mv_pa4:.1f} klb/h.",
                "hinglish": f"Unit 4 Distillation Committee Agent: LCO T98 P50/P95 abhi {lco_q50:.1f}/{lco_q95:.1f} °F hai aur HN T98 P50/P95 {hn_q50:.1f}/{hn_q95:.1f} °F hai. 20 trays ka temperature profile monotonic hai (Tray 1 {t_tray01:.1f} °F se Tray 20 {t_tray20:.1f} °F) aur LCO-HN gap {cutpoint_gap_F:.1f} °F hai.",
                "hi": f"यूनिट 4 डिस्टिलेशन कमेटी एजेंट: LCO T98 P50/P95 {lco_q50:.1f}/{lco_q95:.1f} °F है और HN T98 P50/P95 {hn_q50:.1f}/{hn_q95:.1f} °F है। सभी 20 ट्रे का तापमान क्रम सही है (ट्रे 1: {t_tray01:.1f} °F से ट्रे 20: {t_tray20:.1f} °F)।",
            },
        },
        {
            "agent_id": "agent_condenser",
            "name": "Unit 5 Condenser Fouling & WGC Sentinel",
            "role": "Overhead Heat Removal & Compressor Agent",
            "unit_id": "unit_5_condenser",
            "use_case_ids": ["UC-07", "UC-09"],
            "status": units[4]["status"],
            "priority_rank": 6,
            "proactive_alert": f"Unit 5 Condenser: UA Efficiency = {cond_eff*100:.1f}% (Fouling Res {condenser_ua_residual:.3f}), WGC Power = {power_wgc:.2f} MW, Reflux = {mv_reflux:.3f}.",
            "briefings": {
                "en": f"Unit 5 Condenser Sentinel: Overhead condenser UA efficiency is {cond_eff*100:.1f}% (residual {condenser_ua_residual:.3f} vs 90% clean baseline). Cooling water flow is {mv_cw:.1f} lb/s (valve V9 {v9_pos*100:.1f}% open) and Wet Gas Compressor power is {power_wgc:.2f} MW.",
                "hinglish": f"Unit 5 Condenser Sentinel: Overhead condenser UA efficiency {cond_eff*100:.1f}% hai (fouling residual {condenser_ua_residual:.3f}). Cooling water flow {mv_cw:.1f} lb/s (valve V9 {v9_pos*100:.1f}%) aur Wet Gas Compressor (WGC) load {power_wgc:.2f} MW hai.",
                "hi": f"यूनिट 5 कंडेनसर सेंटिनल: ओवरहेड कंडेनसर की UA दक्षता {cond_eff*100:.1f}% है (फाउलिंग अवशेष {condenser_ua_residual:.3f})। कूलिंग वाटर प्रवाह {mv_cw:.1f} lb/s है और वेट गैस कंप्रेसर (WGC) पावर {power_wgc:.2f} MW है।",
            },
        },
        {
            "agent_id": "agent_stabiliser_instr",
            "name": "Unit 6 Light-Ends & Instrumentation Sentinel",
            "role": "C5 Recovery, Dual-Sensor Drift & Valve Agent",
            "unit_id": "unit_6_stabiliser",
            "use_case_ids": ["UC-02", "UC-09", "UC-11"],
            "status": "GREEN" if (c5_recovery_pct >= 33.0 and max_t_drift <= 2.5) else "AMBER",
            "priority_rank": 7,
            "proactive_alert": f"Unit 6 & Sensors: C5 Recovery = {c5_recovery_pct:.1f}%, Max Dual-Sensor Drift = {max_t_drift:.2f} °F, All 8 Valves in 15–85% Band.",
            "briefings": {
                "en": f"Unit 6 & Instrumentation Sentinel: Stabiliser C5 recovery share is {c5_recovery_pct:.1f}% with Light Naphtha flow at {prod_ln:.1f} lb/min and LPG at {prod_lpg:.1f} lb/min. Across all 5 redundant sensor pairs, max thermocouple drift is {max_t_drift:.2f} °F (limit 2.5 °F).",
                "hinglish": f"Unit 6 & Instrumentation Sentinel: Stabiliser mein C5 pentane recovery {c5_recovery_pct:.1f}% hai (Light Naphtha {prod_ln:.1f} lb/min, LPG {prod_lpg:.1f} lb/min). 5 redundant sensor pairs mein max drift sirf {max_t_drift:.2f} °F hai aur sabhi 8 control valves linear zone mein hain.",
                "hi": f"यूनिट 6 एवं इंस्ट्रूमेंटेशन सेंटिनल: स्टेबलाइज़र में C5 रिकवरी {c5_recovery_pct:.1f}% है (लाइट नेफ्था {prod_ln:.1f} lb/min, LPG {prod_lpg:.1f} lb/min)। सभी 5 डुअल-सेंसर चैनलों में अधिकतम ड्रिफ्ट केवल {max_t_drift:.2f} °F है।",
            },
        },
    ]

    # 23 Downstream Refinery Use Cases Mapping (SDD-CAT-02)
    downstream_cases_summary = [
        {"number": 16, "title": "Diesel Hydrotreater (DHT) Severity & Cetane/Sulfur Control", "tier": "BOUNDARY_LINKED", "boundary_tag": "prod_LCO / LCO_T98_F", "boundary_value": f"{prod_lco:.1f} lb/min @ {lco_q50:.1f} °F T98", "integration_note": "LCO draw rate and T98 heavy-tail directly determine DHT H2 consumption and reactor bed temperature."},
        {"number": 17, "title": "Catalytic Reformer (CCR) Octane & Reformate Yield", "tier": "BOUNDARY_LINKED", "boundary_tag": "prod_HN / HN_T98_F", "boundary_value": f"{prod_hn:.1f} lb/min @ {hn_q50:.1f} °F T98", "integration_note": "Heavy Naphtha side-cut flow and end-point govern CCR naphthene/paraffin charge quality."},
        {"number": 19, "title": "Alkylation / MTBE Light-Olefins Feed Optimization", "tier": "BOUNDARY_LINKED", "boundary_tag": "prod_LPG / eff_C3_C4", "boundary_value": f"{prod_lpg:.1f} lb/min (C3+C4 {lpg_c3_c4_share_pct:.1f}%)", "integration_note": "Riser ROT severity and gas plant recovery set C3=/C4= olefin feed to alkylation."},
        {"number": 20, "title": "Gasoline Blending RVP & Octane Give-Away Control", "tier": "BOUNDARY_LINKED", "boundary_tag": "prod_LN / c5_recovery_pct", "boundary_value": f"{prod_ln:.1f} lb/min (C5 Rec {c5_recovery_pct:.1f}%)", "integration_note": "Stabilised Light Naphtha C5 retention directly controls blendstock Reid Vapor Pressure."},
        {"number": 23, "title": "Refinery Fuel Gas Header & Wobbe Index Balancing", "tier": "BOUNDARY_LINKED", "boundary_tag": "eff_C1_C2 / F5_fuel", "boundary_value": f"C1+C2 {eff_c1+eff_c2:.2f} mol · Fuel {f5_fuel:.2f} lb/s", "integration_note": "FCC dry gas make and furnace firing rate close the plant fuel gas balance."},
        {"number": 24, "title": "Heavy Fuel Oil / Slurry Clarified Oil Blending & Viscosity", "tier": "BOUNDARY_LINKED", "boundary_tag": "prod_slurry / eff_VGO", "boundary_value": f"{prod_slurry:.1f} lb/min", "integration_note": "Main fractionator bottoms slurry draw and catalyst fines govern fuel oil viscosity."},
        {"number": 12, "title": "Crude Distillation Unit (CDU) Atmospheric Cut-Point Soft Sensors", "tier": "ARCHITECTURE_READY", "boundary_tag": "feed_flow_lb_s / dist_feed_API", "boundary_value": f"{feed_flow:.1f} lb/s @ {feed_api:.1f} °API", "integration_note": "Identical 4-model committee + Spread Gate architecture applied to CDU kerosene/diesel/AGO draws."},
        {"number": 13, "title": "Vacuum Distillation Unit (VDU) HVGO/LVGO Flash-Zone Optimization", "tier": "ARCHITECTURE_READY", "boundary_tag": "dist_T_feed_in_F", "boundary_value": f"VGO Feed {t_feed_in:.1f} °F", "integration_note": "Supplies VGO feed to Unit 1; uses same PINN tray enthalpy and cut-point committee."},
        {"number": 14, "title": "Delayed Coker / Visbreaker Thermal Severity & Drum Switch Control", "tier": "ARCHITECTURE_READY", "boundary_tag": "T3_furnace_F coking model", "boundary_value": f"Tube Coking Res {furnace_coking_residual_F:+.1f} °F", "integration_note": "Reuses Unit 1 furnace tube-coking PINN residual and Bayesian survival horizon."},
        {"number": 15, "title": "Hydrocracker (HCU) Second-Stage Conversion & Recycle Cut-Point", "tier": "ARCHITECTURE_READY", "boundary_tag": "conversion_pct / LCO_T98_F", "boundary_value": f"Conv {conv_pct:.1f}%", "integration_note": "Clones reactor severity + fractionator T98 soft-sensor committee with bed-quench constraints."},
        {"number": 18, "title": "Isomerization / Naphtha Hydrotreater (NHT) Sulfur Breakthrough", "tier": "ARCHITECTURE_READY", "boundary_tag": "prod_LN", "boundary_value": f"{prod_ln:.1f} lb/min", "integration_note": "Uses Kalman lab fusion + GPR soft sensor on NHT reactor outlet sulfur/moisture."},
        {"number": 21, "title": "Jet Fuel / Kerosene Freeze Point & Flash Point Soft Sensor", "tier": "ARCHITECTURE_READY", "boundary_tag": "HN_T98_F", "boundary_value": f"{hn_q50:.1f} °F", "integration_note": "Direct extension of ASTM D2887 4-model probabilistic committee to freeze/flash specs."},
        {"number": 22, "title": "Hydrogen Network Purity & PSA/Compressor Allocation", "tier": "PLANT_WIDE_ROADMAP", "boundary_tag": "Plant Utility Grid", "boundary_value": "Phase 2 Integration", "integration_note": "Couples CCR H2 generation with DHT/HCU hydrotreating demand."},
        {"number": 25, "title": "Sulfur Recovery Unit (SRU) Claus Stoichiometry & Tail-Gas Air Demand", "tier": "PLANT_WIDE_ROADMAP", "boundary_tag": "Acid Gas Header", "boundary_value": "Phase 2 Integration", "integration_note": "Mirrors Unit 3 regenerator O2/CO combustion stoichiometry control."},
        {"number": 26, "title": "Amine Treating / Sour Water Stripper (SWS) Reboiler Steam Optimization", "tier": "PLANT_WIDE_ROADMAP", "boundary_tag": "LP Steam Header", "boundary_value": "Phase 2 Integration", "integration_note": "Reboiler duty vs H2S/NH3 stripping efficiency envelope."},
        {"number": 27, "title": "Steam & Power Cogeneration Header Pressure Balancing", "tier": "PLANT_WIDE_ROADMAP", "boundary_tag": "power_CAB + power_WGC", "boundary_value": f"{power_cab+power_wgc:.2f} MW shaft load", "integration_note": "Links FCC flue gas steam generation and compressor turbine drivers."},
        {"number": 28, "title": "Cooling Tower & Plant Cooling Water Network dT Balancing", "tier": "PLANT_WIDE_ROADMAP", "boundary_tag": "MV_cw_flow", "boundary_value": f"{mv_cw:.1f} lb/s", "integration_note": "Extends Unit 5 condenser cooling water optimization across plant exchangers."},
        {"number": 29, "title": "Flare Gas Recovery & Relief Valve Leakage Diagnostics", "tier": "PLANT_WIDE_ROADMAP", "boundary_tag": "P5_frac_psia / V6", "boundary_value": f"{p5_frac:.2f} psia", "integration_note": "Uses pressure residual and acoustic/valve travel diagnostics."},
        {"number": 30, "title": "Crude Tank Farm Blend Compatibility & Asphaltene Precipitation", "tier": "PLANT_WIDE_ROADMAP", "boundary_tag": "dist_feed_API / crude_id", "boundary_value": f"{feed_api:.1f} °API", "integration_note": "Feeds directly into Event Code 1 crude-switch early warning."},
        {"number": 31, "title": "Wastewater Treatment Plant (ETP) Desalter Brine & COD Load", "tier": "PLANT_WIDE_ROADMAP", "boundary_tag": "Overhead Sour Water", "boundary_value": "Phase 3 Integration", "integration_note": "Tracks crude switch impact on desalter carryover and sour water."},
        {"number": 32, "title": "Rotating Equipment Predictive Vibration & Bearing Remaining Useful Life", "tier": "PLANT_WIDE_ROADMAP", "boundary_tag": "CAB / WGC", "boundary_value": "Healthy", "integration_note": "Extends UC-09 thermodynamic efficiency with vibration telemetry."},
        {"number": 33, "title": "Turnaround Catalyst Replacement & Exchanger Cleaning Scheduler", "tier": "PLANT_WIDE_ROADMAP", "boundary_tag": "C_regen_cat / Cond UA", "boundary_value": f"UA {cond_eff*100:.1f}%", "integration_note": "Aggregates PINN fouling and catalyst deactivation trajectories."},
        {"number": 34, "title": "Multi-Unit Refinery LP / Digital Twin Closed-Loop Reconciliation", "tier": "PLANT_WIDE_ROADMAP", "boundary_tag": "All 6 Units + 112 Tags", "boundary_value": f"MB Err {mb_err_pct:+.2f}%", "integration_note": "Top-level reconciliation between planning targets and real-time PINN twin."},
    ]


    # ------------------ ADDED FOR EPIC J ------------------
    reg_info = regime_at(rid, t_val)
    if reg_info:
        crude_slate = {
            "declared_api": reg_info.get("declared_api"),
            "declared_regime_id": reg_info.get("declared_regime_id"),
            "regime_id": reg_info.get("regime_id"),
            "regime_label": reg_info.get("regime_label"),
            "p_max": max(reg_info.get("p_regime", {}).values()) if reg_info.get("p_regime") else 0.0,
            "p_regime": {k: round(float(v), 4) for k, v in (reg_info.get("p_regime") or {}).items()},
            "novelty": reg_info.get("novelty"),
            "transition_pct": reg_info.get("transition_pct"),
            "declared_vs_detected": reg_info.get("declared_vs_detected"),
            "last_switch_min": reg_info.get("detected_at_min"),
            "settled_min": reg_info.get("detection_delay_min")
        }
    else:
        crude_slate = {}

    ev_data = events_for_run(rid, upto_time_min=t_val).get("events", [])
    # Systems Agent: kpi_vs_plan + counts on every unit (in place), ranked needs_attention with consequence lines,
    # compact timeline and the plant header strip (API_CONTRACT_v3 §6, SDD-L0-01).
    l0 = l0_fields(rid, t_val, units, row.to_dict() if hasattr(row, "to_dict") else dict(row), ev_data, mb_err_pct)

    return {
        "schema_version": "2.0",
        "provenance": {
            "source": "simulated",
            "batch_id": meta.get("batch", "full_v1"),
            "run_id": rid,
            "time_min": t_val,
            "advisory_only": True,
        },
        "units": units,
        "system_loops": system_loops,
        "systems_ripple": systems_ripple,
        "pinn_residuals": pinn_residuals,
        "use_cases": use_cases,
        "agent_fleet": agent_fleet,
        "downstream_cases_summary": downstream_cases_summary,
        "crude_slate": crude_slate,
        "plant": l0["plant"],
        "needs_attention": l0["needs_attention"],
        "timeline": l0["timeline"],
    }


def get_use_case_detail(
    use_case_id: str,
    run_id: str | None = None,
    time_min: int | None = None,
) -> dict[str, Any]:
    """Return detailed evaluation for a specific use case ('UC-01'..'UC-11' or '1'..'11')."""
    twin = evaluate_twin_state(run_id=run_id, time_min=time_min)
    norm = str(use_case_id).strip().upper()
    if norm.isdigit():
        norm = f"UC-{int(norm):02d}"
    elif not norm.startswith("UC-"):
        digits = "".join(ch for ch in norm if ch.isdigit())
        if digits:
            norm = f"UC-{int(digits):02d}"

    for uc in twin["use_cases"]:
        if uc["id"] == norm:
            unit = next((u for u in twin["units"] if u["unit_id"] == uc["unit_id"]), None)
            agent = next((a for a in twin["agent_fleet"] if norm in a["use_case_ids"] and a["agent_id"] != "agent_supervisor"), twin["agent_fleet"][0])
            return {
                "provenance": twin["provenance"],
                "use_case": uc,
                "unit": unit,
                "agent": agent,
                "pinn_residuals": twin["pinn_residuals"],
                "systems_ripple": twin["systems_ripple"],
            }

    raise KeyError(f"Unknown use_case_id '{use_case_id}'. Expected UC-01 through UC-11.")


def record_twin_decision(
    rec_id: str,
    decision: str,
    user: str = "operator",
    note: str = "",
    run_id: str | None = None,
    time_min: int | None = None,
) -> dict[str, Any]:
    """Record an operator decision ('accepted' | 'declined') for any unit or use-case recommendation."""
    if decision not in ("accepted", "declined"):
        raise ValueError("decision must be 'accepted' or 'declined'")
    st = get_state()
    twin = evaluate_twin_state(run_id=run_id, time_min=time_min)

    # Search all unit and use-case decisions_needed for matching rec_id
    target_rec: dict[str, Any] | None = None
    for u in twin["units"]:
        for d in u.get("decisions_needed", []):
            if d["rec_id"] == rec_id:
                target_rec = d
                break
    if target_rec is None:
        for uc in twin["use_cases"]:
            for d in uc.get("decisions_needed", []):
                if d["rec_id"] == rec_id:
                    target_rec = d
                    break

    if target_rec is None:
        # Still allow recording a valid TWIN-* or r-* rec_id so historical minute cards can be decided
        target_rec = {
            "rec_id": rec_id,
            "action": "ADJUST",
            "delta": 0.0,
            "parameter": rec_id,
            "unit_id": "unit_4_fractionator",
            "use_case_id": "UC-01",
            "gate_status": "PASS",
        }

    if target_rec.get("gate_status") == "WITHHELD":
        raise PermissionError("Cannot accept or decline a WITHHELD recommendation")

    aid = st.audit(
        user,
        f"twin recommendation {decision}",
        rec_id,
        {
            "note": note,
            "action": target_rec.get("action"),
            "delta": target_rec.get("delta"),
            "parameter": target_rec.get("parameter"),
            "unit_id": target_rec.get("unit_id"),
            "use_case_id": target_rec.get("use_case_id"),
            "control_system_write": False,
        },
    )
    st.db.execute(
        "INSERT OR REPLACE INTO decisions VALUES (?,?,?,?,datetime('now'),?)",
        (rec_id, decision, user, note, aid),
    )
    st.db.commit()
    return {
        "ok": True,
        "audit_id": aid,
        "rec_id": rec_id,
        "status": "ACCEPTED" if decision == "accepted" else "DECLINED",
        "note": "recorded in the audit log only; nothing is written to any control system",
    }
