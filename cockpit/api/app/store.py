"""Artifact persistence (per-run estimate arrays, labs, recommendations) and the SQLite audit log."""
from __future__ import annotations

import json
import sqlite3
import threading
from pathlib import Path

import numpy as np

_DB_LOCK = threading.Lock()
PER_PROP_KEYS = ["mu", "sigma", "weight", "bias", "bias_var", "mean", "sd", "q01", "q05", "q10", "q25", "q50", "q75",
                 "q90", "q95", "q99", "w90", "bimodality_d", "bimodal", "p_on_spec", "truth", "crps", "spread", "admitted",
                 "phys", "delta", "pinn_members", "gpr_sigma_ratio", "trust", "source", "source_value", "weight_source"]
STR_KEYS = ["gate", "gate_reason", "gate_message", "trust_reason", "trust", "source", "weight_source"]


def save_run(art: Path, res: dict, info: dict) -> None:
    arrs = {"time_min": np.asarray(res["time_min"])}
    for prop, A in res["props"].items():
        for k in PER_PROP_KEYS:
            if k in STR_KEYS:
                continue
            arrs[f"{prop}|{k}"] = np.asarray(A[k])
        for k in STR_KEYS:
            arrs[f"{prop}|{k}"] = np.array(["" if v is None else str(v) for v in A[k]])
        for sk, sv in A["trust_signals"].items():
            arrs[f"{prop}|sig|{sk}|value"] = np.asarray(sv["value"], dtype=float)
            arrs[f"{prop}|sig|{sk}|pass"] = np.asarray(sv["pass"], dtype=bool)
            arrs[f"{prop}|sig|{sk}|severe"] = np.asarray(sv["severe"], dtype=bool)
            arrs[f"{prop}|sig|{sk}|limit"] = np.asarray(sv["limit"], dtype=float)
    d = art / "runs"
    d.mkdir(exist_ok=True)
    np.savez_compressed(d / f"{res['run_id']}.npz", **arrs)
    meta = {"run_id": res["run_id"], "labs": res["labs"], "recs": res["recs"],
            "gate_transitions": res["gate_transitions"], **info}
    (d / f"{res['run_id']}.json").write_text(json.dumps(meta, default=_d))


def load_run(art: Path, run_id: str) -> tuple[dict, dict] | None:
    p = art / "runs" / f"{run_id}.npz"
    if not p.exists():
        return None
    with np.load(p, allow_pickle=False) as z:
        arrs = {k: z[k] for k in z.files}
    meta = json.loads((art / "runs" / f"{run_id}.json").read_text())
    return arrs, meta


def _d(o):
    if isinstance(o, np.integer):
        return int(o)
    if isinstance(o, np.floating):
        return float(o)
    if isinstance(o, np.bool_):
        return bool(o)
    if isinstance(o, np.ndarray):
        return o.tolist()
    return str(o)


def audit_db(art: Path) -> sqlite3.Connection:
    con = sqlite3.connect(art / "audit.db", check_same_thread=False)
    con.execute("CREATE TABLE IF NOT EXISTS audit (audit_id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, actor TEXT,"
                " action TEXT, target TEXT, detail TEXT)")
    con.execute("CREATE TABLE IF NOT EXISTS decisions (rec_id TEXT PRIMARY KEY, decision TEXT, user TEXT, note TEXT,"
                " ts TEXT, audit_id INTEGER)")
    con.execute("CREATE TABLE IF NOT EXISTS agent_events (event_id TEXT PRIMARY KEY, run_id TEXT, time_min INTEGER, unit_id TEXT, use_case_id TEXT, tag TEXT, kind TEXT, severity TEXT, payload TEXT, status TEXT, ts TEXT)")
    con.commit()
    return con


def audit_write(con, ts, actor, action, target, detail) -> int:
    with _DB_LOCK:
        cur = con.execute("INSERT INTO audit(ts, actor, action, target, detail) VALUES (?,?,?,?,?)",
                          (ts, actor, action, target, json.dumps(detail) if not isinstance(detail, str) else detail))
        con.commit()
        return int(cur.lastrowid)


# --- agent_events (E3 detections, regime changes, recipe accept/decline) — API_CONTRACT_v3 §3 ---------------------
EVENT_COLS = ("event_id", "run_id", "time_min", "unit_id", "use_case_id", "tag", "kind", "severity", "payload",
              "status", "ts")
_EVENT_SELECT = f"SELECT {', '.join(EVENT_COLS)} FROM agent_events"


def event_write(con, ev: dict) -> bool:
    """Insert one event (idempotent on `event_id`). `payload` may be a dict; it is stored as JSON. Returns True if new."""
    row = dict(ev)
    if not isinstance(row.get("payload"), str):
        row["payload"] = json.dumps(row.get("payload") or {}, default=_d)
    with _DB_LOCK:
        cur = con.execute(f"INSERT OR IGNORE INTO agent_events ({', '.join(EVENT_COLS)}) VALUES "
                          f"({', '.join('?' for _ in EVENT_COLS)})", tuple(row.get(c) for c in EVENT_COLS))
        con.commit()
        return cur.rowcount > 0


def event_row(r) -> dict:
    """Flatten a DB row into the contract event shape: fixed columns + the JSON payload merged at top level."""
    d = dict(zip(EVENT_COLS, r))
    payload = json.loads(d.pop("payload") or "{}")
    return {**d, **payload, "status": d["status"], "ts": d["ts"]}


def events_read(con, run_id: str, *, upto_time_min: int | None = None, unit_id: str | None = None,
                since_ts: str | None = None) -> list[dict]:
    """Events for a run, oldest first. `since_ts` (exclusive) is what the SSE tail uses to fetch only new rows."""
    q, args = f"{_EVENT_SELECT} WHERE run_id=?", [run_id]
    if upto_time_min is not None:
        q, args = q + " AND time_min<=?", args + [int(upto_time_min)]
    if unit_id:
        q, args = q + " AND unit_id=?", args + [unit_id]
    if since_ts:
        q, args = q + " AND ts>?", args + [since_ts]
    with _DB_LOCK:
        rows = con.execute(q + " ORDER BY ts ASC, time_min ASC", args).fetchall()
    return [event_row(r) for r in rows]

