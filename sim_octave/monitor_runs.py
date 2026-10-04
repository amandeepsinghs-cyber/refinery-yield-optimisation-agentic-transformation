#!/usr/bin/env python3
"""Overnight monitor for the lever_v1 simulations (owner asleep 2 Oct 18:00 UTC; heal without asking).

Per run: rows written, minutes since the last write, Octave process alive, first broken minute (validity.valid_until),
share of copied (failed-solver) rows among the last 60 written.

Heal policy (--heal):
  * STUCK  — process alive, breakdown found, and >= 80 % of the last 60 rows are copied failed-solver rows: the run will
             never recover (run_sim.m repeats the failure; resume restarts from start-up), so stop it and keep its
             valid rows. Frees the core.
  * NOSTART — process gone and 0 rows: relaunch the same seed once (logged in _monitor/relaunched.txt).
  * DEAD   — process gone with rows < target: keep the data, mark finished (relaunching restarts from minute 0).
Always: append a status line per check to _monitor/status.log and write _monitor/last.json.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import pathlib
import re
import signal
import subprocess
import sys
import time

import numpy as np
import pandas as pd

ROOT = pathlib.Path(__file__).resolve().parents[1]  # repo root (Refinery Agentic Optimisation)
sys.path.insert(0, str(ROOT / "cockpit" / "api"))
from app.data.validity import STATE_TAGS, valid_until  # noqa: E402

SIM = ROOT / "sim_octave"
TARGET = 1600


def procs() -> dict[str, int]:
    out = subprocess.run(["ps", "-eo", "pid,args"], capture_output=True, text=True).stdout
    m = {}
    for line in out.splitlines():
        if "octave-cli" in line and "run_sim(" in line:
            g = re.search(r"data/([\w]+)/(\w+)\.csv", line)
            if g:
                m[f"{g.group(1)}/{g.group(2)}"] = int(line.split()[0])
    return m


def scan(batch: str, alive: dict[str, int]) -> list[dict]:
    rows = []
    now = time.time()
    for f in sorted((SIM / "data" / batch).glob("*.csv")):
        key = f"{batch}/{f.stem}"
        r = {"run": f.stem, "alive": key in alive, "pid": alive.get(key), "age_min": round((now - f.stat().st_mtime) / 60)}
        try:
            df = pd.read_csv(f, engine="python", on_bad_lines="skip")
        except Exception:
            df = pd.DataFrame()
        r["rows"] = int(len(df))
        if len(df):
            for c in df.columns:
                if not pd.api.types.is_numeric_dtype(df[c]):
                    df[c] = pd.to_numeric(df[c], errors="coerce")
            df = df[df["time_min"].notna()].reset_index(drop=True) if "time_min" in df.columns else df
            r["valid_until"] = valid_until(df) if len(df) else None
            tags = [x for x in STATE_TAGS if x in df.columns]
            tail = df[tags].tail(61)
            same = (tail.diff().abs().sum(axis=1, min_count=1) == 0).to_numpy()[1:]
            r["copied_last60"] = round(float(same.mean()), 2) if len(same) else 0.0
        else:
            r["valid_until"], r["copied_last60"] = None, 0.0
        st = "OK"
        if r["rows"] >= TARGET:
            st = "DONE"
        elif not r["alive"]:
            st = "NOSTART" if r["rows"] == 0 else "DEAD"
        elif r["valid_until"] is not None and r["copied_last60"] >= 0.8 and r["rows"] >= 60:
            st = "STUCK"
        elif r["valid_until"] is not None:
            st = "BROKEN_RUNNING"
        r["state"] = st
        rows.append(r)
    return rows


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--batch", default="lever_v1")
    ap.add_argument("--heal", action="store_true")
    a = ap.parse_args()
    mon = SIM / "data" / a.batch / "_monitor"
    mon.mkdir(exist_ok=True)
    alive = procs()
    rows = scan(a.batch, alive)
    actions = []
    if a.heal:
        relaunched = set((mon / "relaunched.txt").read_text().split()) if (mon / "relaunched.txt").exists() else set()
        for r in rows:
            if r["state"] == "STUCK" and r["pid"]:
                os.kill(r["pid"], signal.SIGTERM)
                actions.append(f"stopped {r['run']} (stuck since minute {r['valid_until']}, {r['rows']} rows kept)")
            elif r["state"] == "NOSTART" and r["run"] not in relaunched:
                seed = int(re.sub(r"\D", "", r["run"]))
                log = SIM / "data" / a.batch / "logs" / f"{r['run']}.relaunch.log"
                subprocess.Popen(["setsid", "nohup", "octave-cli", "--no-gui", "--quiet", "--eval",
                                  f"run_sim({TARGET}, 'lever', 'data/{a.batch}/{r['run']}.csv', {seed})"],
                                 cwd=SIM, stdout=open(log, "w"), stderr=subprocess.STDOUT,
                                 env={**os.environ, "OMP_NUM_THREADS": "1"}, start_new_session=True)
                with open(mon / "relaunched.txt", "a") as fh:
                    fh.write(r["run"] + "\n")
                actions.append(f"relaunched {r['run']} (never wrote a row)")
    counts: dict[str, int] = {}
    for r in rows:
        counts[r["state"]] = counts.get(r["state"], 0) + 1
    total = sum(min(r["rows"], r["valid_until"] or r["rows"]) for r in rows)
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%MZ")
    line = (f"{stamp} runs={len(rows)} alive={sum(r['alive'] for r in rows)} states={counts} "
            f"rows={sum(r['rows'] for r in rows)} valid_rows={total} actions={actions}")
    with open(mon / "status.log", "a") as fh:
        fh.write(line + "\n")
    (mon / "last.json").write_text(json.dumps({"stamp": stamp, "rows": rows, "actions": actions}, indent=1, default=str))
    print(line)
    for r in rows:
        if r["state"] != "OK":
            print(f"  {r['run']}: {r['state']} rows={r['rows']} valid_until={r['valid_until']} "
                  f"copied_last60={r['copied_last60']} age={r['age_min']}m")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
