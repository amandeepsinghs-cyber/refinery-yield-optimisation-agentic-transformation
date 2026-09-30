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
    con.commit()
    return con


def audit_write(con, ts, actor, action, target, detail) -> int:
    with _DB_LOCK:
        cur = con.execute("INSERT INTO audit(ts, actor, action, target, detail) VALUES (?,?,?,?,?)",
                          (ts, actor, action, target, json.dumps(detail) if not isinstance(detail, str) else detail))
        con.commit()
        return int(cur.lastrowid)
