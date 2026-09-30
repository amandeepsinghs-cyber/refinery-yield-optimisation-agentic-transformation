#!/usr/bin/env python3
"""Extract events, labs, crude switches, and cut-point trim windows from a simulated run CSV.

Canonical Clock (DECISIONS D6):
  Every run starts at ts_base = 2026-09-01T00:00:00Z + time_min minutes.
  Minute 0 is 00:00 UTC.

Extracted signals from real CSV rows:
  - event_code: transitions and ramps for disturbances/set-point moves (codes 1-7).
  - lab_sample: lab draw minutes (1), values, and key fractionator tags.
  - crude_id: crude switches, transitions, and API gravities.
  - cutpoint_auto: controller mode windows (1 = operator trim, 0 = manual float).

Usage:
  python3 knowledge/tools/extract_events.py sim_octave/data/full_v1/random_s100.csv
  python3 knowledge/tools/extract_events.py <csv_path> [--json] [--out <output_path>]
"""
from __future__ import annotations

import csv
import datetime as dt
import json
import re
import sys
from pathlib import Path

D6_ORIGIN = dt.datetime(2026, 9, 1, 0, 0, tzinfo=dt.timezone.utc)

EVENT_NAMES = {
    1: "Crude change",
    2: "Feed rate change",
    3: "ROT set-point change",
    4: "Feed temperature change",
    5: "LCO T98 set-point change",
    6: "HN T98 set-point change",
    7: "Condenser fouling",
}

EVENT_COLUMNS = {
    1: "dist_feed_API",
    2: "feed_flow_lb_s",
    3: "SP_T_riser_ROT_F",
    4: "dist_T_feed_in_F",
    5: "SP_LCO_T98",
    6: "SP_HN_T98",
    7: "dist_condenser_eff",
}


def d6_timestamp(time_min: int | float) -> str:
    """Canonical D6 timestamp: 2026-09-01T00:00:00Z + time_min minutes."""
    t = int(round(float(time_min)))
    return (D6_ORIGIN + dt.timedelta(minutes=t)).strftime("%Y-%m-%d %H:%M")


def d6_iso(time_min: int | float) -> str:
    t = int(round(float(time_min)))
    return (D6_ORIGIN + dt.timedelta(minutes=t)).strftime("%Y-%m-%dT%H:%M:%SZ")


def _safe_float(val: str | None, default: float = 0.0) -> float:
    if val is None or val == "" or val.lower() == "nan":
        return default
    try:
        return float(val)
    except (ValueError, TypeError):
        return default


def _safe_int(val: str | None, default: int = 0) -> int:
    return int(round(_safe_float(val, float(default))))


def load_run_csv(path: Path) -> list[dict[str, str]]:
    """Read run CSV, skipping header-only or corrupt trailing rows."""
    with path.open(encoding="utf-8", errors="replace") as f:
        reader = csv.DictReader(f)
        rows = []
        for r in reader:
            if not r or "time_min" not in r:
                continue
            if r["time_min"] is None or r["time_min"].strip() == "" or r["time_min"].lower() == "nan":
                continue
            rows.append(r)
    return rows


def extract_run_data(csv_path: str | Path) -> dict:
    p = Path(csv_path)
    rows = load_run_csv(p)
    run_id = p.stem
    batch = p.parent.name if p.parent.name != "" else "unknown"

    n_rows = len(rows)
    if n_rows == 0:
        return {
            "run_id": run_id,
            "batch": batch,
            "path": str(p),
            "n_minutes": 0,
            "start_time": d6_timestamp(0),
            "end_time": d6_timestamp(0),
            "events": [],
            "labs": [],
            "crude_switches": [],
            "trim_windows": [],
            "shift": {"name": "Day shift 06:00-14:00", "w0": 360, "w1": 840},
        }

    t_first = _safe_int(rows[0].get("time_min", "0"))
    t_last = _safe_int(rows[-1].get("time_min", "0"))

    # 1. Extract Events from event_code transitions
    events = []
    prev_code = 0
    i = 0
    while i < n_rows:
        c = _safe_int(rows[i].get("event_code", "0"))
        if c > 0 and c != prev_code:
            j = i
            while j + 1 < n_rows and _safe_int(rows[j + 1].get("event_code", "0")) == c:
                j += 1
            t_start = _safe_int(rows[i].get("time_min", "0"))
            t_end = _safe_int(rows[j].get("time_min", "0"))
            ramp_dur = t_end - t_start + 1
            cid = _safe_int(rows[j].get("crude_id", "0"))
            c_auto = _safe_int(rows[i].get("cutpoint_auto", "0"))

            col = EVENT_COLUMNS.get(c)
            from_val = _safe_float(rows[max(i - 1, 0)].get(col, "0")) if col else 0.0
            to_val = _safe_float(rows[j].get(col, "0")) if col else 0.0

            events.append({
                "time_min": t_start,
                "end_time_min": t_end,
                "timestamp": d6_timestamp(t_start),
                "timestamp_iso": d6_iso(t_start),
                "code": c,
                "name": EVENT_NAMES.get(c, f"Event {c}"),
                "from_val": round(from_val, 2),
                "to_val": round(to_val, 2),
                "ramp": ramp_dur,
                "crude_id": cid,
                "cutpoint_auto": c_auto,
            })
            prev_code = c
            i = j + 1
        else:
            prev_code = c
            i += 1

    # 2. Extract Labs where lab_sample == 1
    labs = []
    for r in rows:
        if _safe_int(r.get("lab_sample", "0")) == 1:
            t = _safe_int(r.get("time_min", "0"))
            labs.append({
                "time_min": t,
                "timestamp": d6_timestamp(t),
                "timestamp_iso": d6_iso(t),
                "LCO_T98_F": round(_safe_float(r.get("LCO_T98_F")), 2),
                "HN_T98_F": round(_safe_float(r.get("HN_T98_F")), 2),
                "SP_LCO_T98": round(_safe_float(r.get("SP_LCO_T98")), 2),
                "T_tray13_F": round(_safe_float(r.get("T_tray13_F")), 2),
                "T_tray06_F": round(_safe_float(r.get("T_tray06_F")), 2),
                "P5_frac_psia": round(_safe_float(r.get("P5_frac_psia")), 3),
                "crude_id": _safe_int(r.get("crude_id")),
            })

    # 3. Extract Crude Transitions
    crude_switches = []
    prev_cid = None
    for i, r in enumerate(rows):
        cid = _safe_int(r.get("crude_id", "0"))
        if cid != prev_cid:
            t = _safe_int(r.get("time_min", "0"))
            api = _safe_float(r.get("dist_feed_API", "0"))
            crude_switches.append({
                "time_min": t,
                "timestamp": d6_timestamp(t),
                "crude_id": cid,
                "api": round(api, 2),
            })
            prev_cid = cid

    # 4. Extract Cutpoint Trim Windows (cutpoint_auto == 1)
    trim_windows = []
    i = 0
    while i < n_rows:
        ca = _safe_int(rows[i].get("cutpoint_auto", "0"))
        if ca == 1:
            j = i
            while j + 1 < n_rows and _safe_int(rows[j + 1].get("cutpoint_auto", "0")) == 1:
                j += 1
            t_start = _safe_int(rows[i].get("time_min", "0"))
            t_end = _safe_int(rows[j].get("time_min", "0"))
            trim_windows.append({
                "start_min": t_start,
                "end_min": t_end,
                "start_ts": d6_timestamp(t_start),
                "end_ts": d6_timestamp(t_end),
                "duration": t_end - t_start + 1,
            })
            i = j + 1
        else:
            i += 1

    # Shift window calculation (aligned with WP5 shift logs):
    # Defaults to Day shift (06:00-14:00, minutes 360-840) or based on first crude event
    first_crude_min = next((e["time_min"] for e in events if e["code"] == 1), 360)
    tod = first_crude_min % 1440
    if 360 <= tod < 840:
        sh_base, sh_name = 360, "Day shift 06:00-14:00"
    elif 840 <= tod < 1320:
        sh_base, sh_name = 840, "Evening shift 14:00-22:00"
    else:
        sh_base, sh_name = 1320, "Night shift 22:00-06:00"

    w0 = first_crude_min - ((tod - sh_base) % 1440)
    w1 = w0 + 480

    for e in events:
        e["in_shift"] = bool(w0 <= e["time_min"] < w1)
    for l in labs:
        l["in_shift"] = bool(w0 <= l["time_min"] < w1)
    for tw in trim_windows:
        tw["in_shift"] = bool(w0 <= tw["start_min"] < w1)

    return {
        "run_id": run_id,
        "batch": batch,
        "path": str(p),
        "n_minutes": n_rows,
        "start_time_min": t_first,
        "end_time_min": t_last,
        "start_time": d6_timestamp(t_first),
        "end_time": d6_timestamp(t_last),
        "events": events,
        "labs": labs,
        "crude_switches": crude_switches,
        "trim_windows": trim_windows,
        "shift": {"name": sh_name, "w0": w0, "w1": w1, "start_ts": d6_timestamp(w0), "end_ts": d6_timestamp(w1)},
    }


def format_markdown(data: dict) -> str:
    lines = []
    rid = data["run_id"]
    dur = data["n_minutes"]
    st = data["shift"]

    cids = [s["crude_id"] for s in data["crude_switches"]]
    cid_str = f"{min(cids)}–{max(cids)}" if cids else "none"

    lines.append(f"### Run `{rid}`: events and labs\n")
    lines.append(f"- Clock: D6 canonical (ts = 2026-09-01T00:00:00Z + time_min)")
    lines.append(f"- Run start: {data['start_time']} · duration {dur} min · crude IDs {cid_str}")
    lines.append(f"- **Shift window for the log:** {st['name']}, {st['start_ts']} → {st['end_ts']} (time_min {st['w0']}–{st['w1']})\n")

    lines.append("#### 1. Events (Disturbances and Set Points)")
    lines.append("| time_min | Timestamp | Event | From | To | Ramp (min) | crude_id after | Cutpoint Mode | In shift |")
    lines.append("|---|---|---|---|---|---|---|---|---|")
    if not data["events"]:
        lines.append("| — | — | *No events in range* | — | — | — | — | — | — |")
    else:
        for e in data["events"]:
            c_mode = "Trim (1)" if e["cutpoint_auto"] == 1 else "Manual (0)"
            lines.append(
                f"| {e['time_min']} | {e['timestamp']} | {e['code']} {e['name']} | "
                f"{e['from_val']:.2f} | {e['to_val']:.2f} | {e['ramp']} | {e['crude_id']} | "
                f"{c_mode} | {'yes' if e['in_shift'] else ''} |"
            )

    lines.append("\n#### 2. Laboratory Distillation Samples (lab_sample == 1)")
    lines.append("| time_min | Timestamp | LCO_T98_F | HN_T98_F | SP_LCO_T98 | T_tray13_F | P5_frac_psia | crude_id | In shift |")
    lines.append("|---|---|---|---|---|---|---|---|---|")
    if not data["labs"]:
        lines.append("| — | — | *No lab samples in range* | — | — | — | — | — | — |")
    else:
        for l in data["labs"]:
            lines.append(
                f"| {l['time_min']} | {l['timestamp']} | {l['LCO_T98_F']:.1f} | {l['HN_T98_F']:.1f} | "
                f"{l['SP_LCO_T98']:.1f} | {l['T_tray13_F']:.1f} | {l['P5_frac_psia']:.2f} | "
                f"{l['crude_id']} | {'yes' if l['in_shift'] else ''} |"
            )

    lines.append("\n#### 3. Controller Trim Windows (cutpoint_auto == 1)")
    lines.append("| Window | Start (min) | End (min) | Timestamp Range | Duration (min) | In shift |")
    lines.append("|---|---|---|---|---|---|")
    if not data["trim_windows"]:
        lines.append("| — | — | — | *No trim windows in range* | — | — |")
    else:
        for idx, tw in enumerate(data["trim_windows"], 1):
            lines.append(
                f"| #{idx} | {tw['start_min']} | {tw['end_min']} | {tw['start_ts']} → {tw['end_ts']} | "
                f"{tw['duration']} | {'yes' if tw['in_shift'] else ''} |"
            )

    return "\n".join(lines) + "\n"


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 1

    args = sys.argv[1:]
    csv_file = None
    json_mode = False
    out_file = None

    i = 0
    while i < len(args):
        a = args[i]
        if a == "--json":
            json_mode = True
        elif a in ("--out", "-o") and i + 1 < len(args):
            out_file = Path(args[i + 1])
            i += 1
        elif not a.startswith("-") and csv_file is None:
            csv_file = Path(a)
        i += 1

    if csv_file is None:
        print("Error: CSV path required.", file=sys.stderr)
        return 1

    if not csv_file.exists():
        print(f"Error: file '{csv_file}' not found.", file=sys.stderr)
        return 1

    data = extract_run_data(csv_file)

    if json_mode:
        out_content = json.dumps(data, indent=2)
    else:
        out_content = format_markdown(data)

    if out_file:
        out_file.parent.mkdir(parents=True, exist_ok=True)
        out_file.write_text(out_content, encoding="utf-8")
        print(f"Written to {out_file}", file=sys.stderr)
    else:
        print(out_content)

    return 0


if __name__ == "__main__":
    sys.exit(main())
