#!/usr/bin/env python3
"""Print the event and lab table for one simulated run as Markdown, for pasting into a WP5 prompt.

Usage: python3 extract_events.py sim_octave/data/full_v1/random_s100.csv
Clock: run random_sNNN starts 2026-06-01 00:00 + (NNN-100)*5 days; time_min 1 = 00:01.
Shift window: the 8 h shift (06-14, 14-22, 22-06) that contains the first crude change.
"""
import csv, sys, re, datetime as dt

path = sys.argv[1]
rows = list(csv.DictReader(open(path)))
run = re.sub(r"\.csv$", "", path.split("/")[-1])
m = re.search(r"s(\d+)$", run)
start = dt.datetime(2026, 6, 1) + dt.timedelta(days=5 * (int(m.group(1)) - 100 if m else 0))
ts = lambda t: (start + dt.timedelta(minutes=t)).strftime("%Y-%m-%d %H:%M")
NAMES = {1: "Crude change", 2: "Feed rate change", 3: "ROT set-point change", 4: "Feed temperature change",
         5: "LCO T98 set-point change", 6: "HN T98 set-point change"}
COL = {1: "dist_feed_API", 2: "feed_flow_lb_s", 3: "SP_T_riser_ROT_F", 4: "dist_T_feed_in_F",
       5: "SP_LCO_T98", 6: "SP_HN_T98"}
f = lambda r, k: float(r[k])

events, prev = [], 0
for i, r in enumerate(rows):
    c = int(float(r["event_code"]))
    if c and c != prev:
        j = i
        while j + 1 < len(rows) and int(float(rows[j + 1]["event_code"])) == c: j += 1
        events.append((int(float(r["time_min"])), c, f(rows[max(i - 1, 0)], COL[c]), f(rows[j], COL[c]), j - i + 1,
                       int(float(rows[j]["crude_id"]))))
    prev = c
labs = [r for r in rows if float(r["lab_sample"]) == 1]

first_crude = next((e[0] for e in events if e[1] == 1), 360)
tod = first_crude % 1440
sh = 360 if 360 <= tod < 840 else 840 if 840 <= tod < 1320 else 1320
w0 = first_crude - ((tod - sh) % 1440); w1 = w0 + 480
names = {360: "Day shift 06:00-14:00", 840: "Evening shift 14:00-22:00", 1320: "Night shift 22:00-06:00"}

print(f"### Run `{run}`: events and labs\n")
print(f"- Run start: {ts(0)} · duration {len(rows)} min · crude IDs {rows[0]['crude_id']}–{rows[-1]['crude_id']}")
print(f"- **Shift window for the log:** {names[sh]}, {ts(w0)} → {ts(w1)} (time_min {w0}–{w1})\n")
print("| time_min | Timestamp | Event | From | To | Ramp (min) | crude_id after | In shift |")
print("|---|---|---|---|---|---|---|---|")
for t, c, a, b, rmp, cid in events:
    print(f"| {t} | {ts(t)} | {c} {NAMES[c]} | {a:.1f} | {b:.1f} | {rmp} | {cid} | {'yes' if w0 <= t < w1 else ''} |")
print("\n| time_min | Timestamp | LCO_T98_F | HN_T98_F | SP_LCO_T98 | T_tray13_F | P5_frac_psia | In shift |")
print("|---|---|---|---|---|---|---|---|")
for r in labs:
    t = int(float(r["time_min"]))
    print(f"| {t} | {ts(t)} | {f(r,'LCO_T98_F'):.1f} | {f(r,'HN_T98_F'):.1f} | {f(r,'SP_LCO_T98'):.1f} | "
          f"{f(r,'T_tray13_F'):.1f} | {f(r,'P5_frac_psia'):.2f} | {'yes' if w0 <= t < w1 else ''} |")
