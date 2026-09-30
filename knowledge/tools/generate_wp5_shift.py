#!/usr/bin/env python3
"""Generate WP5: Input event tables and 10 Shift Log documents in knowledge/corpus/shift_logs"""
import pathlib, json, datetime as dt

ROOT = pathlib.Path(__file__).resolve().parent.parent
INPUTS_DIR = ROOT / "inputs"
CORPUS_DIR = ROOT / "corpus" / "shift_logs"
INPUTS_DIR.mkdir(parents=True, exist_ok=True)
CORPUS_DIR.mkdir(parents=True, exist_ok=True)

data_path = INPUTS_DIR / "events_data.json"
runs_data = json.loads(data_path.read_text(encoding="utf-8"))

CREWS = {
    "A": ("Priya Nair", "Tom Adeyemi"),
    "B": ("Karan Bhatt", "Elena Rossi"),
    "C": ("Samuel Osei", "Mei Lin"),
    "D": ("Hannah Clarke", "Arjun Rao")
}

WO_POOL = [
    "WO-24031", "WO-24058", "WO-24102", "WO-24133", "WO-25007",
    "WO-25041", "WO-25066", "WO-25090", "WO-25118", "WO-25152",
    "WO-26012", "WO-26049"
]

for idx, (run_key, rdata) in enumerate(runs_data.items()):
    seed = rdata["seed"]
    w0 = rdata["w0"]
    w1 = rdata["w1"]
    sh_name = rdata["shift_name"]
    sh_idx = rdata["shift_index"]
    
    start_run_dt = dt.datetime(2026, 6, 1) + dt.timedelta(days=5 * (seed - 100))
    shift_start_dt = start_run_dt + dt.timedelta(minutes=w0)
    shift_end_dt = start_run_dt + dt.timedelta(minutes=w1)
    
    days_since_start = (shift_start_dt.date() - dt.date(2026, 6, 1)).days
    crew_letter = ["A", "B", "C", "D"][(days_since_start * 3 + sh_idx) % 4]
    supervisor, operator = CREWS[crew_letter]
    
    eff_date = shift_start_dt.strftime("%Y-%m-%d")
    doc_id = f"SHIFT-S{seed}"
    
    # Generate inputs/events_sNNN.md
    inp_lines = [
        f"### Run `{run_key}`: events and labs",
        "",
        f"- Run start: {start_run_dt.strftime('%Y-%m-%d %H:%M')} · duration 6000 min · crude IDs",
        f"- **Shift window for the log:** {sh_name} shift {shift_start_dt.strftime('%H:%M')}-{shift_end_dt.strftime('%H:%M')}, {shift_start_dt.strftime('%Y-%m-%d %H:%M')} → {shift_end_dt.strftime('%Y-%m-%d %H:%M')} (time_min {w0}–{w1})",
        "",
        "| time_min | Timestamp | Event | From | To | Ramp (min) | crude_id after | In shift |",
        "|---|---|---|---|---|---|---|---|"
    ]
    
    in_shift_events = []
    event_codes_in_shift = set()
    for e in rdata["events"]:
        t_min = e["time_min"]
        e_ts = (start_run_dt + dt.timedelta(minutes=t_min)).strftime("%Y-%m-%d %H:%M")
        in_s = e["in_shift"]
        inp_lines.append(f"| {t_min} | {e_ts} | {e['code']} {e['name']} | {e['from_val']:.2f} | {e['to_val']:.2f} | {e['ramp']} | {e['crude_id']} | {'yes' if in_s else ''} |")
        if in_s:
            in_shift_events.append((t_min, e_ts, e))
            event_codes_in_shift.add(e["code"])
            
    inp_lines.append("")
    inp_lines.append("| time_min | Timestamp | LCO_T98_F | HN_T98_F | SP_LCO_T98 | T_tray13_F | P5_frac_psia | In shift |")
    inp_lines.append("|---|---|---|---|---|---|---|---|")
    
    in_shift_labs = []
    for l in rdata["labs"]:
        t_min = l["time_min"]
        l_ts = (start_run_dt + dt.timedelta(minutes=t_min)).strftime("%Y-%m-%d %H:%M")
        in_s = l["in_shift"]
        # nominal values with realistic variations
        lco_val = 755.3 + (seed % 5 - 2) * 1.2
        hn_val = 530.3 + (seed % 3 - 1) * 0.8
        sp_lco = 755.3
        t_tray13 = 476.4
        p5 = 24.90
        inp_lines.append(f"| {t_min} | {l_ts} | {lco_val:.1f} | {hn_val:.1f} | {sp_lco:.1f} | {t_tray13:.1f} | {p5:.2f} | {'yes' if in_s else ''} |")
        if in_s:
            in_shift_labs.append((t_min, l_ts, lco_val, hn_val))
            
    (INPUTS_DIR / f"events_s{seed}.md").write_text("\n".join(inp_lines), encoding="utf-8")
    
    # Construct SHIFT markdown document
    related_tags = ["LCO_T98_F", "HN_T98_F", "SP_LCO_T98", "SP_HN_T98", "T_tray13_F", "T_tray06_F", "dist_feed_API", "feed_flow_lb_s", "Tr_riser_F", "lab_sample", "crude_id", "event_code"]
    rel_wo = WO_POOL[idx % len(WO_POOL)]
    related_docs = ["SOP-FRAC-001", "SOP-FRAC-002", "SOP-FRAC-003", "SOP-APC-007", "SOP-LAB-008", rel_wo]
    
    # Build timeline text
    timeline_lines = []
    for t_min, e_ts, e in in_shift_events:
        c = e["code"]
        if c == 1:
            timeline_lines.append(f"- **{e_ts} (time_min {t_min})**: Event 1 Crude change initiated. API gravity ramped from {e['from_val']:.2f} to {e['to_val']:.2f} over {e['ramp']} min (crude_id -> {e['crude_id']}). Board operator {operator} implemented feed transition monitoring per [SOP-FRAC-002 r5 §4.2]. Cockpit advisory spread gate widened during initial transition; cut-point modifications held.")
        elif c == 2:
            timeline_lines.append(f"- **{e_ts} (time_min {t_min})**: Event 2 Feed rate change. Fresh feed flow adjusted from {e['from_val']:.2f} to {e['to_val']:.2f} lb/s over {e['ramp']} min per [SOP-FCC-005 r3 §4.2]. Rebalanced pumparound heat extraction per [SOP-FRAC-001 r3 §4.2].")
        elif c == 3:
            timeline_lines.append(f"- **{e_ts} (time_min {t_min})**: Event 3 ROT set-point change. Riser outlet temperature SP modified from {969.0 + e['from_val']:.1f} °F to {969.0 + e['to_val']:.1f} °F over {e['ramp']} min per [SOP-FCC-005 r3 §4.3]. Tracked regenerator bed temperature and combustion air flow.")
        elif c == 4:
            timeline_lines.append(f"- **{e_ts} (time_min {t_min})**: Event 4 Feed temperature change. Feed preheat adjusted from {e['from_val']:.2f} °F to {e['to_val']:.2f} °F over {e['ramp']} min per [SOP-FCC-006 r2 §4.1]. Compensated preheat furnace firing and catalyst slide valve position.")
        elif c == 5:
            timeline_lines.append(f"- **{e_ts} (time_min {t_min})**: Event 5 LCO T98 set-point change. SP_LCO_T98 adjusted from {e['from_val']:.2f} °F to {e['to_val']:.2f} °F over {e['ramp']} min per [SOP-FRAC-003 r4 §4.3]. Verified cockpit spread gate open with GREEN trust before manual DCS set-point trim.")
        elif c == 6:
            timeline_lines.append(f"- **{e_ts} (time_min {t_min})**: Event 6 HN T98 set-point change. SP_HN_T98 adjusted from {e['from_val']:.2f} °F to {e['to_val']:.2f} °F over {e['ramp']} min per [SOP-FRAC-004 r2 §4.3]. Monitored top tray temperature and top reflux ratio.")
            
    if not timeline_lines:
        timeline_lines.append(f"- **{shift_start_dt.strftime('%Y-%m-%d %H:%M')}**: Unit operating steadily under normal surveillance per [SOP-FRAC-001 r3 §4.1].")
        
    # Build lab section text
    lab_lines = []
    if in_shift_labs:
        for t_min, l_ts, lco_val, hn_val in in_shift_labs:
            lab_lines.append(f"- **{l_ts} (time_min {t_min})**: Routine shift sample collected per [SOP-LAB-008 r3 §4.1]. Lab distillation report confirmed LCO_T98_F at {lco_val:.1f} °F (spec limit 765.0 °F) and HN_T98_F at {hn_val:.1f} °F (spec limit 540.0 °F).")
            lab_lines.append(f"  - Reconciliation per [SOP-APC-007 r1 §4.2]: Soft-sensor estimate matched lab D86 measurement within ±2.5 °F, well within lab reproducibility R = 7.0 °F. Status: ACCEPT.")
    else:
        lab_lines.append("- Scheduled sample draw occurred outside active shift window. Unit monitored via continuous soft-sensor inferentials per [SOP-APC-007 r1 §4.1].")
        
    shift_body = [
        "---",
        f"doc_id: {doc_id}",
        f"title: \"FCC-21 Shift Operating Log — Campaign Run {run_key}\"",
        "doc_type: SHIFT",
        "revision: 1",
        f"effective_date: {eff_date}",
        f"owner_role: \"Shift supervisor ({supervisor})\"",
        "unit: FCC-21",
        "status: SIMULATED",
        f"related_tags: {json.dumps(related_tags)}",
        f"related_events: {json.dumps(sorted(list(event_codes_in_shift)))}",
        f"related_docs: {json.dumps(related_docs)}",
        f"summary: \"Operational shift handover log covering Crew {crew_letter} surveillance, event handling, and soft-sensor tracking on campaign run {run_key}.\"",
        f"sim_run: {run_key}",
        f"sim_window: [{w0}, {w1}]",
        "---",
        "",
        "> **SIMULATED DOCUMENT** — generated for a technical demo. Not an approved procedure or record.",
        "",
        "## 1 Shift summary",
        f"Shift operational summary for {sh_name} Shift ({shift_start_dt.strftime('%H:%M')} to {shift_end_dt.strftime('%H:%M')}) on {eff_date}. Crew {crew_letter} on duty: Supervisor {supervisor}, Board Operator {operator}. Unit FCC-21 operated stably with scheduled event execution and continuous AI soft-sensor advisory tracking.",
        "",
        "## 2 Unit status at handover",
        f"- Fresh feed throughput: nominal 165.0 lb/s with stable charge booster pressure.\n- Reactor riser outlet temperature: nominal 969.0 °F; regenerator bed at 1250 °F.\n- Fractionator overhead pressure: P5_frac_psia held at 24.9 psia per [SOP-FRAC-001 r3 §4.1].\n- Soft-sensor cockpit status: GREEN trust active; spread gate open with W90 within normal limits.",
        "",
        "## 3 Events and actions",
        "\n".join(timeline_lines),
        "",
        "## 4 Lab results",
        "\n".join(lab_lines),
        "",
        "## 5 Equipment and work orders",
        f"Ongoing surveillance associated with [{rel_wo} r1 §1]. Equipment operational integrity verified; all pump mechanical seals, air blower guide vanes, and control valves throttled within normal operating envelopes with no open critical safety tags.",
        "",
        "## 6 Handover notes",
        f"- Monitor post-crude transition stabilization per [SOP-FRAC-002 r5 §4.5]; verify dist_feed_API settles completely.\n- Maintain soft-sensor surveillance on LCO cut recommendations; observe spread gate.\n- Next routine laboratory distillation sample scheduled per [SOP-LAB-008 r3 §4.1].\n- Keep intermediate pumparound PA2 balanced with product draw rate."
    ]
    
    out_file = CORPUS_DIR / f"{doc_id}.md"
    out_file.write_text("\n".join(shift_body), encoding="utf-8")
    print(f"Wrote {doc_id} -> {out_file}")

print("WP5 generation complete.")
