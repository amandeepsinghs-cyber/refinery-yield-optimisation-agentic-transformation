"""Pre-demo reset of the decision record (demoflow.md §8: "the record must be empty of test clicks").

Archives the live audit database first (archive, never delete), then removes the human test actions only:
Accept / Hold / Decline clicks (`decision_actions`, `decisions` and their `audit` rows). The trust-check entries written
by the system (actor `system:*`, e.g. "gate PASS→WITHHELD") are kept — the demo shows them as "every time the AI held
back".

Usage (from cockpit/api):  .venv/bin/python scripts/reset_decision_record.py [--dry-run]
Safe while the API runs (SQLite handles the second connection); the next page load shows the cleaned record.
"""
from __future__ import annotations

import argparse
import datetime as dt
import shutil
import sqlite3
from pathlib import Path

ART = Path(__file__).resolve().parents[1] / "artifacts"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=str(ART / "audit.db"))
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    db = Path(a.db)
    con = sqlite3.connect(db)
    tables = {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    human = con.execute("SELECT audit_id, ts, actor, action, target FROM audit WHERE actor NOT LIKE 'system%'").fetchall()
    n_act = con.execute("SELECT COUNT(*) FROM decision_actions").fetchone()[0] if "decision_actions" in tables else 0
    n_dec = con.execute("SELECT COUNT(*) FROM decisions").fetchone()[0] if "decisions" in tables else 0
    print(f"human audit rows: {len(human)} · decision_actions: {n_act} · decisions: {n_dec}")
    for r in human:
        print("  ", *r)
    if a.dry_run or not (human or n_act or n_dec):
        print("nothing changed")
        return
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%d_%H%M%S")
    arch = ART / "audit_archive"
    arch.mkdir(exist_ok=True)
    dst = arch / f"audit_{stamp}.db"
    con.execute("PRAGMA wal_checkpoint(FULL)")
    shutil.copy2(db, dst)
    print(f"archived → {dst}")
    con.execute("DELETE FROM audit WHERE actor NOT LIKE 'system%'")
    if "decision_actions" in tables:
        con.execute("DELETE FROM decision_actions")
    if "decisions" in tables:
        con.execute("DELETE FROM decisions")
    con.commit()
    print("decision record cleaned (system trust-check entries kept)")


if __name__ == "__main__":
    main()
