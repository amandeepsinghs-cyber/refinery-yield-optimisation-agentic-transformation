"""Process-wide service state used by the routers: catalog, trained artifacts, knowledge index, audit log,
Gemini probe status. Also scores runs that appeared after training (with the final model)."""
from __future__ import annotations

import json
import threading
import time
from datetime import datetime, timedelta, timezone
from functools import lru_cache

import joblib
import numpy as np

from .config import MODEL_IDS, get_settings
from .data.catalog import Catalog
from .knowledge.index import KnowledgeIndex
from .store import audit_db, audit_write, load_run, save_run


class State:
    def __init__(self):
        self.s = get_settings()
        self.catalog = Catalog(self.s)
        self.bundle: dict | None = None
        self._final = None
        self.knowledge = KnowledgeIndex(self.s)
        self._db_local = threading.local()
        audit_db(self.s.artifacts).close()  # create tables once
        g = self.s["gemini"]
        self.gemini = {"project": g["project"], "location": g["location"], "text_model": g["text_model"],
                       "live_model": g["live_model"], "ok": False, "note": "not probed yet"}
        self._run_cache: dict[str, tuple[float, tuple]] = {}
        self._cite_cache: dict = {}
        self.scoring = {"running": False, "last": None}
        self._lock = threading.Lock()
        self.load_bundle()

    @property
    def db(self):
        """SQLite connection for the calling thread (a shared connection mixes cursors under concurrent requests)."""
        con = getattr(self._db_local, "con", None)
        if con is None:
            con = audit_db(self.s.artifacts)
            con.execute("PRAGMA busy_timeout = 5000")
            self._db_local.con = con
        return con

    # ------------------------------------------------------------------ artifacts
    def load_bundle(self):
        f = self.s.artifacts / "bundle.json"
        self.bundle = json.loads(f.read_text()) if f.exists() else None
        self._final = None
        self._run_cache.clear()

    @property
    def trained(self) -> bool:
        return self.bundle is not None

    @property
    def final(self):
        if self._final is None and self.trained:
            p = self.s.artifacts / "models" / "final_bundle.pkl"
            if p.exists():
                self._final = joblib.load(p)
        return self._final

    def run(self, run_id: str):
        """(arrays, meta) for a scored run, or None."""
        p = self.s.artifacts / "runs" / f"{run_id}.npz"
        if not p.exists():
            return None
        mt = p.stat().st_mtime
        hit = self._run_cache.get(run_id)
        if hit and hit[0] == mt:
            return hit[1]
        v = load_run(self.s.artifacts, run_id)
        if len(self._run_cache) > 64:
            self._run_cache.clear()
        self._run_cache[run_id] = (mt, v)
        return v

    def score_run(self, run_id: str) -> bool:
        """Score a run with the final model (runs added or grown after training)."""
        from .pipeline import assemble_run, prepare
        if not self.trained or self.final is None:
            return False
        df = prepare(self.catalog.load(run_id), self.s)
        if len(df) < 5:
            return False
        preds = self.final.predict_run(df)
        meta = {p: {k: v for k, v in m.items()} for p, m in self.bundle["meta"].items()}
        res = assemble_run(run_id, df, preds, self.catalog.raw_labs(run_id), meta, self.s, self.bundle["gains"])
        info = self.catalog.get(run_id)
        in_train = run_id in self.bundle.get("train_runs", []) and not self.bundle.get("loro")
        save_run(self.s.artifacts, res, {"split": "train" if in_train else "test",
                                         "scored_by": "final model (in-sample)" if in_train else "final model (scored after training)",
                                         "batch": info.batch, "scenario": info.scenario, "group": run_id})
        self._run_cache.pop(run_id, None)
        return True

    def stale_runs(self) -> list[str]:
        fp = (self.bundle or {}).get("run_fingerprints", {})
        out = []
        for r, info in self.catalog.runs.items():
            p = self.s.artifacts / "runs" / f"{r}.json"
            if not p.exists():
                out.append(r)
                continue
            if r in fp and [info.mtime, info.size] != fp[r] and p.stat().st_mtime < info.mtime:
                out.append(r)
        return out

    def rescore_stale_async(self) -> list[str]:
        stale = self.stale_runs() if self.trained else []
        if not stale or self.scoring["running"]:
            return stale

        def work():
            self.scoring["running"] = True
            done = []
            for r in stale:
                try:
                    if self.score_run(r):
                        done.append(r)
                except Exception as e:  # noqa: BLE001
                    print("score failed", r, e)
            self.scoring = {"running": False, "last": {"ts": now_iso(), "scored": done}}
        threading.Thread(target=work, daemon=True).start()
        return stale

    def reload(self) -> dict:
        self.catalog.scan()
        self.load_bundle()
        self.knowledge.load()
        self._cite_cache.clear()
        stale = self.rescore_stale_async()
        return {"runs": len(self.catalog.runs), "batches": self.catalog.batches, "trained": self.trained,
                "rescoring": stale, "knowledge": self.knowledge.info()}

    # ------------------------------------------------------------------ helpers
    def ts(self, time_min: int) -> str:
        base = datetime.fromisoformat(self.s["data"]["ts_base"].replace("Z", "+00:00"))
        return (base + timedelta(minutes=int(time_min))).strftime("%Y-%m-%dT%H:%M:%SZ")

    def citations_for(self, prop: str, action: str) -> list[dict]:
        key = (prop, action, self.knowledge.mode, len(self.knowledge.chunks))
        if key not in self._cite_cache:
            short = "LCO" if prop == "LCO_T98_F" else "heavy naphtha HN"
            verb = {"RAISE": "raise", "LOWER": "lower", "HOLD": "hold"}.get(action, "adjust")
            q = f"{short} T98 cut point set point {verb} adjustment procedure"
            if action == "WITHHELD":
                q = f"{short} T98 soft sensor estimate uncertain no recommendation request lab sample"
            try:
                # a decision card cites the operating procedure (SOP) for the move; incidents / work orders are for the
                # copilot. Same rule for both search backends (local embeddings, BigQuery VECTOR_SEARCH).
                self._cite_cache[key] = self.knowledge.citations(q, k=2, doc_type="SOP")
            except Exception:  # noqa: BLE001
                self._cite_cache[key] = []
        return self._cite_cache[key]

    def decisions(self) -> dict:
        cur = self.db.execute("SELECT rec_id, decision, user, note, ts, audit_id FROM decisions")
        return {r[0]: {"decision": r[1], "user": r[2], "note": r[3], "ts": r[4], "audit_id": r[5]} for r in cur.fetchall()}

    def recommendations(self, run_id: str, prop: str | None = None, time_min: int | None = None) -> list[dict]:
        v = self.run(run_id)
        if not v:
            return []
        arrs, meta = v
        tmax = int(arrs["time_min"][-1]) if len(arrs["time_min"]) else 0
        t_ref = int(time_min) if time_min is not None else tmax
        dec = self.decisions()
        last_block: dict[str, int] = {}
        for r in meta["recs"]:
            rt = int(r["time_min"])
            if rt <= t_ref and r["status"] in ("WITHHELD", "HOLD"):
                p = r["property"]
                if rt > last_block.get(p, -1):
                    last_block[p] = rt
        out = []
        for r in meta["recs"]:
            if prop and r["property"] != prop:
                continue
            if time_min is not None and int(r["time_min"]) > t_ref:
                continue
            r = dict(r)
            if r.get("rationale"):
                from .recommend import clean_rationale
                gsrc = str(((self.bundle or {}).get("gains") or {}).get(r["property"], {}).get("gain_source", "default"))
                r["rationale"] = clean_rationale(r["rationale"], gsrc.startswith("default"))
            if r["status"] == "OPEN":
                if r["rec_id"] in dec:
                    r["status"] = "ACCEPTED" if dec[r["rec_id"]]["decision"] == "accepted" else "DECLINED"
                    r["decision"] = dec[r["rec_id"]]
                elif r["valid_until_min"] <= t_ref or int(r["time_min"]) < last_block.get(r["property"], -1):
                    r["status"] = "EXPIRED"
            r["citations"] = self.citations_for(r["property"], "WITHHELD" if r["status"] == "WITHHELD" else r["action"])
            out.append(r)
        return out

    def audit(self, actor, action, target, detail) -> int:
        return audit_write(self.db, now_iso(), actor, action, target, detail)

    # ------------------------------------------------------------------ estimate message (SDD §6.2)
    def index_of(self, arrs, time_min: int | None) -> int:
        t = arrs["time_min"]
        if time_min is None:
            return len(t) - 1
        i = int(np.searchsorted(t, int(time_min)))
        return min(max(i, 0), len(t) - 1)

    def estimate_message(self, run_id: str, prop: str, time_min: int | None) -> dict | None:
        v = self.run(run_id)
        if not v:
            return None
        arrs, meta = v
        i = self.index_of(arrs, time_min)
        P = lambda k: arrs[f"{prop}|{k}"]  # noqa: E731
        adm = P("admitted")
        members = {mid: {"mu": r2(P("mu")[i, j]), "sigma": r2(P("sigma")[i, j]), "weight": r3(P("weight")[i, j]),
                         "admitted": bool(adm[j]), "shadow": not bool(adm[j])} for j, mid in enumerate(MODEL_IDS)}
        signals = {}
        for k in ("S1", "S2", "S3", "S4", "S5", "S6", "S7"):
            val = float(P(f"sig|{k}|value")[i])
            signals[k] = {"value": None if not np.isfinite(val) else round(val, 3), "limit": float(np.ravel(P(f"sig|{k}|limit"))[0]),
                          "pass": bool(P(f"sig|{k}|pass")[i]), "severe": bool(P(f"sig|{k}|severe")[i])}
        t = int(arrs["time_min"][i])
        gs, gr, gm = str(P("gate")[i]), str(P("gate_reason")[i]) or None, str(P("gate_message")[i]) or None
        truth = float(P("truth")[i])
        return {
            "schema_version": "2.0",
            "provenance": {"source": "simulated", "batch_id": meta.get("batch"), "run_id": run_id, "time_min": t,
                           "scored_by": meta.get("scored_by")},
            "ts": self.ts(t), "property": prop, "members": members,
            "mixture": {"mean": r2(P("mean")[i]), "sd": r2(P("sd")[i]), "q05": r2(P("q05")[i]), "q10": r2(P("q10")[i]),
                        "q25": r2(P("q25")[i]), "q50": r2(P("q50")[i]), "q75": r2(P("q75")[i]), "q90": r2(P("q90")[i]),
                        "q95": r2(P("q95")[i]), "w90": r2(P("w90")[i]), "bimodality_d": r2(P("bimodality_d")[i]),
                        "p_on_spec": r3(P("p_on_spec")[i])},
            "bias": {"b": r3(P("bias")[i]), "var": r3(P("bias_var")[i])},
            "gate": {"status": gs, "reason": gr, "message": gm},
            "trust": {"level": str(P("trust")[i]), "reason": str(P("trust_reason")[i]), "signals": signals},
            **self._source(P, i),
            "truth": None if not np.isfinite(truth) else round(truth, 2),
            "truth_label": "simulator truth",
            "spec_max": self.s.spec_max(prop), "w90_limit": self.s.w90_max,
        }

    @staticmethod
    def _source(P, i) -> dict:
        """C4 fallback chain value for this minute. Artifacts written before the chain existed -> 'consensus'."""
        try:
            src = str(P("source")[i]) or "consensus"
            val = float(P("source_value")[i])
        except KeyError:
            return {"source": "consensus", "source_value": r2(P("mean")[i])}
        return {"source": src, "source_value": r2(val)}


def r2(x):
    x = float(x)
    return round(x, 2) if np.isfinite(x) else None


def r3(x):
    x = float(x)
    return round(x, 4) if np.isfinite(x) else None


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@lru_cache
def get_state() -> State:
    return State()
