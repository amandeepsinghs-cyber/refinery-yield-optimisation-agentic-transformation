"""Read-only copilot tools (SDD-COP-02 + search_documents / get_document / find_similar_events).

Every tool is read-only. There is deliberately no tool that writes to recommendations, labs, audit or any control
system (SDD-SAF-02, SDD-COP-05). `query_sim_data` runs SELECT-only SQL with DuckDB over the local simulated-run
catalog (table `fcc_sim_minute`, alias `fcc_sim_minute_v2`) instead of BigQuery in this demo."""
from __future__ import annotations

import json
import re
import threading

import numpy as np
import pandas as pd

from ..config import MODEL_IDS, MODEL_META
from ..lttb import lttb_indices
from ..state import get_state

FORBIDDEN = re.compile(r"\b(insert|update|delete|create|drop|alter|attach|detach|copy|pragma|install|load|export|import|"
                       r"call|set|reset|read_csv\w*|read_parquet|read_json\w*|parquet_scan|glob|http\w*|s3|checkpoint|"
                       r"vacuum|truncate|grant|revoke|replace|merge|upsert)\b", re.I)
_DUCK = {"key": None, "con": None}
_DUCK_LOCK = threading.Lock()


def _duck():
    import duckdb
    st = get_state()
    key = tuple(sorted((r, i.mtime, i.size) for r, i in st.catalog.runs.items()))
    with _DUCK_LOCK:
        if _DUCK["key"] != key:
            frames = []
            for r, info in st.catalog.runs.items():
                df = st.catalog.load(r).copy()
                df.insert(0, "batch_id", info.batch)
                df.insert(0, "run_id", r)
                frames.append(df)
            big = pd.concat(frames, ignore_index=True) if frames else pd.DataFrame({"run_id": []})
            con = duckdb.connect(":memory:")
            con.register("fcc_sim_minute", big)
            con.execute("CREATE VIEW fcc_sim_minute_v2 AS SELECT * FROM fcc_sim_minute")
            con.execute("SET enable_external_access = false")
            con.execute("SET lock_configuration = true")
            _DUCK.update(key=key, con=con)
        return _DUCK["con"]


_STRING_LIT = re.compile(r"'(?:[^']|'')*'")
_QUOTED_ID = re.compile(r'"(?:[^"]|"")*"')


def validate_sql(sql: str) -> str:
    """Single read-only SELECT/WITH statement. Keywords are checked outside string literals and quoted identifiers,
    so e.g. WHERE note = 'set point' is allowed; the scalar function REPLACE(...) is allowed; DDL/DML/COPY/ATTACH/
    PRAGMA/SET statements and file/network readers stay blocked."""
    s = re.sub(r"--[^\n]*|/\*.*?\*/", " ", sql, flags=re.S).strip().rstrip(";").strip()
    bare = _QUOTED_ID.sub('""', _STRING_LIT.sub("''", s))      # strip literal contents before keyword checks
    if ";" in bare:
        raise ValueError("only a single statement is allowed")
    if not re.match(r"^(select|with)\b", bare, re.I):
        raise ValueError("only SELECT queries are allowed")
    probe = re.sub(r"\breplace\s*\(", "fn(", bare, flags=re.I)   # REPLACE(str, a, b) is a scalar function
    m = FORBIDDEN.search(probe)
    if m:
        raise ValueError(f"forbidden keyword: {m.group(0)}")
    return s


def _jsonable(o):
    if isinstance(o, dict):
        return {k: _jsonable(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_jsonable(v) for v in o]
    if isinstance(o, (np.floating, float)):
        return None if not np.isfinite(o) else round(float(o), 4)
    if isinstance(o, np.integer):
        return int(o)
    if isinstance(o, np.bool_):
        return bool(o)
    return o


ALLOWED_TRACES = {"scatter", "scattergl", "bar", "histogram", "box", "heatmap", "indicator"}

DECLS = [
    ("get_current_state", "Latest estimate message (SDD §6.2) for a property at the current page minute: members, mixture quantiles, W90, bias, gate, trust, simulator truth.",
     {"property": ("STRING", "LCO_T98_F or HN_T98_F")}, []),
    ("get_distribution", "Member and mixture summary at a minute: mu, sigma, weight, admitted/shadow, q05/q50/q95, W90, bimodality D, P(on-spec).",
     {"property": ("STRING", "LCO_T98_F or HN_T98_F"), "time_min": ("INTEGER", "simulated minute; default = page minute")}, []),
    ("explain_estimate", "Top feature contributions (Bayesian-ridge coefficient x standardised deviation) and hybrid physics term vs ML residual at a minute.",
     {"property": ("STRING", "LCO_T98_F or HN_T98_F"), "time_min": ("INTEGER", "simulated minute")}, []),
    ("get_gate_status", "Distribution Spread Gate status with the exact gate message (relay verbatim when WITHHELD).",
     {"property": ("STRING", "LCO_T98_F or HN_T98_F"), "time_min": ("INTEGER", "simulated minute")}, []),
    ("list_recommendations", "Recommendation cards for the current run (OPEN, ACCEPTED, DECLINED, WITHHELD, EXPIRED).",
     {"status": ("STRING", "comma-separated statuses, optional"), "property": ("STRING", "optional"), "n": ("INTEGER", "max cards, default 8")}, []),
    ("run_whatif", "What-if: re-evaluate all members with tag overrides at the current minute (read-only).",
     {"overrides_json": ("STRING", "JSON object of tag -> value, e.g. {\"MV_PA2\": 1.1}"), "property": ("STRING", "optional")}, ["overrides_json"]),
    ("get_lab_history", "Synthetic lab results (SDD §4.3) with status for the current run.",
     {"property": ("STRING", "LCO_T98_F or HN_T98_F"), "n": ("INTEGER", "max rows, default 10")}, []),
    ("query_sim_data", "SELECT-only SQL over table fcc_sim_minute (columns: run_id, batch_id, time_min and all simulator tags). Max 1000 rows.",
     {"sql": ("STRING", "a single SELECT statement")}, ["sql"]),
    ("make_chart", "Validate a Plotly figure JSON ({data:[...], layout:{...}}) and render it inline in the chat. Use only numbers returned by other tools.",
     {"figure_json": ("STRING", "Plotly figure as JSON string")}, ["figure_json"]),
    ("get_model_metrics", "Model comparison metrics and parameters (as /api/models): RMSE, coverage, CRPS, weights, admission.",
     {"property": ("STRING", "LCO_T98_F or HN_T98_F")}, []),
    ("get_timeseries", "Down-sampled simulated time series (<=200 points) for columns of a run.",
     {"run_id": ("STRING", "default = page run"), "cols": ("STRING", "comma-separated column names"),
      "from_min": ("INTEGER", "start minute"), "to_min": ("INTEGER", "end minute")}, ["cols"]),
    ("draft_handover", "Facts for a shift handover over the last N minutes up to the page minute: gate transitions, recommendations, labs, trust mix.",
     {"period_min": ("INTEGER", "window length in minutes, default 480")}, []),
    ("search_documents", "Search the simulated knowledge corpus (SOPs, IOWs, lab methods, work orders, shift logs, incidents, MOCs). Returns doc_id, revision, section, snippet, score.",
     {"query": ("STRING", "search text"), "doc_type": ("STRING", "optional: SOP, IOW, LAB, WO, SHIFT, INC, MOC, REF"), "k": ("INTEGER", "default 5")}, ["query"]),
    ("get_document", "Get a document (or one section) from the knowledge corpus.",
     {"doc_id": ("STRING", "e.g. SOP-FRAC-003"), "section": ("STRING", "optional section id, e.g. 4.2")}, ["doc_id"]),
    ("find_similar_events", "Find simulated events of the same type across runs (event_code 1 crude change, 2 feed rate, 3 ROT, 4 feed temperature, 5 LCO SP move, 6 HN SP move, 7 condenser fouling) and related incident/shift documents.",
     {"event_code": ("INTEGER", "event code"), "description": ("STRING", "free text for document search")}, []),
    ("get_systems_twin_state", "Evaluate the 6-unit Connected Refinery Digital Twin, 3 thermodynamic loops, PINN conservation residuals, and 4-domain Systems Ripple Matrix at the current or specified minute.",
     {"run_id": ("STRING", "optional run_id"), "time_min": ("INTEGER", "optional simulated minute")}, []),
    ("get_use_case_detail", "Evaluate a specific refinery optimisation use case (UC-01 through UC-11) with live KPIs, 3-zone operating envelope, recommendation, and 4-domain ripple impact.",
     {"use_case_id": ("STRING", "UC-01 through UC-11, or 1 through 11"), "run_id": ("STRING", "optional run_id"), "time_min": ("INTEGER", "optional simulated minute")}, ["use_case_id"]),
    ("get_scope_snapshot", "Compact snapshot of what is on screen: for a unit_id the unit's crude regime, residual/breach state (how we know it is off), recipe moves, open decisions and top tags; with unit_id omitted the whole-plant snapshot (crude slate declared vs detected, needs-attention lines, unit statuses).",
     {"unit_id": ("STRING", "optional: unit_1_furnace, unit_2_riser, unit_3_regenerator, unit_4_fractionator, unit_5_condenser, unit_6_stabiliser"),
      "run_id": ("STRING", "optional run_id"), "time_min": ("INTEGER", "optional simulated minute; default = page minute")}, []),
    ("get_regime", "Crude regime recognised from the unit response (E1): regime_id R1-R4 with label, p_regime, novelty, transition_pct, declared vs detected, fingerprint and switch segments.",
     {"run_id": ("STRING", "optional run_id"), "time_min": ("INTEGER", "optional simulated minute")}, []),
    ("get_recipe", "Coordinated multi-set-point recipe for a unit (E4): moves (current -> recommended with limits), predicted yield % feed, fuel lb/s, power MW, coke and P(on-spec), or gate=WITHHELD with gate_reason. Never a single-knob trim.",
     {"unit_id": ("STRING", "unit id, e.g. unit_4_fractionator"), "run_id": ("STRING", "optional run_id"), "time_min": ("INTEGER", "optional simulated minute")}, ["unit_id"]),
]


def declarations():
    from google.genai import types
    out = []
    for name, desc, props, req in DECLS:
        schema = {"type": "OBJECT", "properties": {k: {"type": t, "description": d} for k, (t, d) in props.items()}}
        if req:
            schema["required"] = req
        out.append(types.FunctionDeclaration(name=name, description=desc, parameters=schema))
    return [types.Tool(function_declarations=out)]


class ToolBox:
    def __init__(self, ctx: dict | None = None):
        ctx = ctx or {}
        st = get_state()
        from ..routers.common import default_run
        self.run_id = ctx.get("run_id") if ctx.get("run_id") in st.catalog.runs else default_run()
        self.prop = ctx.get("property") if ctx.get("property") in st.s.targets else st.s.targets[0]
        self.time_min = ctx.get("time_min")
        self.page = ctx.get("page")
        self.charts: list = []

    def _p(self, p):
        st = get_state()
        return p if p in st.s.targets else self.prop

    def call(self, name: str, args: dict) -> dict:
        fn = getattr(self, "t_" + name, None)
        if fn is None:
            return {"error": f"unknown tool {name}"}
        try:
            return _jsonable(fn(**(args or {})))
        except TypeError as e:
            return {"error": f"bad arguments: {e}"}
        except Exception as e:  # noqa: BLE001
            return {"error": str(e)[:300]}

    # ---- tools
    def t_get_current_state(self, property=None):
        m = get_state().estimate_message(self.run_id, self._p(property), self.time_min)
        return m or {"error": "run not scored"}

    def t_get_distribution(self, property=None, time_min=None):
        m = get_state().estimate_message(self.run_id, self._p(property), time_min if time_min is not None else self.time_min)
        if not m:
            return {"error": "run not scored"}
        return {k: m[k] for k in ("provenance", "property", "members", "mixture", "bias", "gate", "truth", "truth_label", "spec_max", "w90_limit")}

    def t_explain_estimate(self, property=None, time_min=None):
        st = get_state()
        from ..pipeline import prepare
        p = self._p(property)
        df = prepare(st.catalog.load(self.run_id), st.s)
        tm = time_min if time_min is not None else self.time_min
        i = int(np.searchsorted(df["time_min"].to_numpy(), tm)) if tm is not None else len(df) - 1
        i = min(max(i, 0), len(df) - 1)
        row = df.iloc[[i]]
        ms = st.final.models[p]
        phys, delta, dsd = ms["hybrid_delta_v1"].decompose(row)
        return {"run_id": self.run_id, "time_min": int(row["time_min"].iloc[0]), "property": p,
                "bayes_ridge_top_contributions_F": ms["bayes_ridge_v1"].contributions(row),
                "bayes_ridge_intercept_F": float(ms["bayes_ridge_v1"].m.intercept_),
                "hybrid": {"physics_term_F": float(phys[0]), "ml_residual_F": float(delta[0]), "residual_sigma_F": float(dsd[0]),
                           "physics": ms["hybrid_delta_v1"].phys.params()},
                "note": "final model; contributions are coefficient x standardised deviation from the training mean"}

    def t_get_gate_status(self, property=None, time_min=None):
        m = get_state().estimate_message(self.run_id, self._p(property), time_min if time_min is not None else self.time_min)
        if not m:
            return {"error": "run not scored"}
        return {"run_id": self.run_id, "time_min": m["provenance"]["time_min"], "property": m["property"], **m["gate"],
                "w90": m["mixture"]["w90"], "w90_limit": m["w90_limit"], "bimodality_d": m["mixture"]["bimodality_d"],
                "trust": m["trust"]["level"], "instruction": "If status is WITHHELD, relay `message` verbatim and do not propose a set point."}

    def t_list_recommendations(self, status=None, property=None, n=8):
        recs = get_state().recommendations(self.run_id, self._p(property) if property else None)
        if self.time_min is not None:
            recs = [r for r in recs if r["time_min"] <= int(self.time_min)]
        if status:
            want = {x.strip().upper() for x in status.split(",")}
            recs = [r for r in recs if r["status"] in want]
        return {"run_id": self.run_id, "count": len(recs), "recommendations": recs[-int(n or 8):][::-1]}

    def t_run_whatif(self, overrides_json, property=None):
        from ..routers.decision import run_whatif
        ov = json.loads(overrides_json) if isinstance(overrides_json, str) else overrides_json
        return run_whatif(self.run_id, self.time_min, {k: float(v) for k, v in ov.items()}, self._p(property) if property else None)

    def t_get_lab_history(self, property=None, n=10):
        v = get_state().run(self.run_id)
        labs = [l for l in (v[1]["labs"] if v else []) if l["property"] == self._p(property)]
        return {"run_id": self.run_id, "labs": labs[-int(n or 10):],
                "note": "synthetic labs derived from simulator truth + seeded noise (SDD §4.3)" if labs else
                        "no lab samples in this run (legacy scenario files carry no lab_sample flags)"}

    def t_query_sim_data(self, sql):
        q = validate_sql(sql)
        con = _duck()
        with _DUCK_LOCK:
            df = con.execute(f"SELECT * FROM ({q}) AS q LIMIT 1000").df()
        return {"columns": list(df.columns), "rows": df.head(200).to_dict(orient="records"), "n_rows": int(len(df)),
                "truncated_to": 200 if len(df) > 200 else None, "source": "local simulated-run catalog via DuckDB"}

    def t_make_chart(self, figure_json):
        fig = json.loads(figure_json) if isinstance(figure_json, str) else figure_json
        if not isinstance(fig, dict) or not isinstance(fig.get("data"), list) or not fig["data"]:
            raise ValueError("figure must be an object with a non-empty 'data' list")
        for tr in fig["data"]:
            if tr.get("type", "scatter") not in ALLOWED_TRACES:
                raise ValueError(f"trace type {tr.get('type')} not allowed")
            for k in ("x", "y", "z"):
                if k in tr and isinstance(tr[k], list) and len(tr[k]) > 5000:
                    raise ValueError("too many points (max 5000 per trace)")
        fig.setdefault("layout", {})
        fig["layout"].setdefault("paper_bgcolor", "rgba(0,0,0,0)")
        fig["layout"].setdefault("plot_bgcolor", "rgba(0,0,0,0)")
        self.charts.append(fig)
        return {"ok": True, "rendered": True, "n_traces": len(fig["data"])}

    def t_get_model_metrics(self, property=None):
        from ..routers.modelling import models
        m = models(self._p(property))
        for x in m.get("models", []):
            x.pop("training_runs", None)
        return m

    def t_get_timeseries(self, cols, run_id=None, from_min=None, to_min=None):
        st = get_state()
        r = run_id if run_id in st.catalog.runs else self.run_id
        df = st.catalog.load(r)
        t = df["time_min"].to_numpy()
        m = (t >= (from_min if from_min is not None else -1e9)) & (t <= (to_min if to_min is not None else 1e9))
        want = [c.strip() for c in cols.split(",") if c.strip() in df.columns][:6]
        if not want:
            return {"error": f"no known columns in {cols}"}
        idx = lttb_indices(t[m], df[want[0]].to_numpy()[m], 200)
        return {"run_id": r, "time_min": t[m][idx].tolist(), "series": {c: df[c].to_numpy()[m][idx].tolist() for c in want},
                "note": "simulated data; LCO_T98_F / HN_T98_F columns are simulator truth"}

    def t_draft_handover(self, period_min=480):
        st = get_state()
        v = st.run(self.run_id)
        if not v:
            return {"error": "run not scored"}
        arrs, meta = v
        t1 = int(self.time_min) if self.time_min is not None else int(arrs["time_min"][-1])
        t0 = t1 - int(period_min or 480)
        sel = (arrs["time_min"] >= t0) & (arrs["time_min"] <= t1)
        out = {"run_id": self.run_id, "window": [t0, t1], "properties": {}}
        for p in st.s.targets:
            tr = arrs[f"{p}|trust"][sel]
            out["properties"][p] = {
                "trust_mix": {k: round(float(np.mean(tr == k)), 3) for k in ("GREEN", "AMBER", "RED")} if len(tr) else {},
                "withheld_minutes": int(np.sum(arrs[f"{p}|gate"][sel] == "WITHHELD")),
                "mixture_q50_last": float(arrs[f"{p}|q50"][sel][-1]) if sel.any() else None,
                "w90_last": float(arrs[f"{p}|w90"][sel][-1]) if sel.any() else None}
        out["gate_transitions"] = [g for g in meta["gate_transitions"] if t0 <= g["time_min"] <= t1]
        out["recommendations"] = [{k: r[k] for k in ("rec_id", "time_min", "property", "status", "action", "delta_F")}
                                  for r in st.recommendations(self.run_id) if t0 <= r["time_min"] <= t1 and r["action"] != "HOLD"][-10:]
        out["labs"] = [l for l in meta["labs"] if t0 <= l["time_min"] <= t1]
        out["events"] = [e for e in st.catalog.events(self.run_id) if t0 <= e["time_min"] <= t1]
        return out

    def t_search_documents(self, query, doc_type=None, k=5):
        kn = get_state().knowledge
        res = kn.search(query, doc_type, int(k or 5))
        return {"results": res, "index": kn.info(),
                "instruction": "Cite only results with above_threshold=true as [DOC-ID rN §x.y]; otherwise say 'No cited source'."}

    def t_get_document(self, doc_id, section=None):
        d = get_state().knowledge.get_doc(doc_id, section)
        if not d:
            return {"error": f"unknown document {doc_id}"}
        if section and d.get("section_text"):
            return {"meta": d["meta"], "section": section, "text": d["section_text"][:6000]}
        return {"meta": d["meta"], "sections": d["sections"], "markdown": d["markdown"][:6000]}

    def t_find_similar_events(self, event_code=None, description=None):
        st = get_state()
        evs = []
        if event_code is not None:
            for r in sorted(st.catalog.runs):
                for e in st.catalog.events(r):
                    if e["code"] == int(event_code):
                        evs.append({"run_id": r, **e})
        docs = []
        q = description or (f"event code {event_code}" if event_code is not None else "")
        if q:
            for dt in ("INC", "SHIFT"):
                docs += st.knowledge.search(q, dt, 3)
        return {"events": evs[:25], "n_events": len(evs), "documents": docs}

    @staticmethod
    def _screen_decisions(run_id, time_min) -> list[dict]:
        """The decisions exactly as the screen shows them (decisions engine), compact."""
        from ..engines import decisions as dec
        out = []
        for d in dec.build(run_id, int(time_min))["decisions"]:
            out.append({"id": d["id"], "type": d["type"], "unit_id": d["unit_id"], "status": d["status"],
                        "headline": d["headline"], "scripted": bool(d.get("scripted")),
                        "gain_source": d.get("gain_source"), "withheld_text": d.get("withheld_text"),
                        "moves": [{k: m.get(k) for k in ("label", "from", "to", "delta", "unit")}
                                  for m in (d.get("proposed") or {}).get("moves") or []]})
        return out

    @staticmethod
    def _drop_legacy_cards(obj):
        """twin.py still builds its own per-unit 'recommendation' cards with invented move sizes (e.g. air −0.8,
        PA4 +20). The screen never shows them; Gemini must not quote them either. Replace with a pointer."""
        note = "see 'screen_decisions' (the decisions engine, same as the screen)"
        for u in obj.get("units") or []:
            if "recommendation" in u:
                u["recommendation"] = note
            if "decisions_needed" in u:
                u["decisions_needed"] = note
        for uc in obj.get("use_cases") or []:
            if "recommendation" in uc:
                uc["recommendation"] = note
        if isinstance(obj.get("use_case"), dict) and "recommendation" in obj["use_case"]:
            obj["use_case"]["recommendation"] = note
        if "recommendation" in obj:
            obj["recommendation"] = note
        return obj

    def t_get_systems_twin_state(self, run_id=None, time_min=None):
        import copy
        from ..twin import evaluate_twin_state
        r = run_id if run_id in get_state().catalog.runs else self.run_id
        tm = int(time_min) if time_min is not None else self.time_min
        out = self._drop_legacy_cards(copy.deepcopy(evaluate_twin_state(run_id=r, time_min=tm)))
        out["screen_decisions"] = self._screen_decisions(r, tm)
        return out

    def t_get_use_case_detail(self, use_case_id, run_id=None, time_min=None):
        import copy
        from ..twin import get_use_case_detail
        r = run_id if run_id in get_state().catalog.runs else self.run_id
        tm = int(time_min) if time_min is not None else self.time_min
        out = get_use_case_detail(use_case_id=str(use_case_id), run_id=r, time_min=tm)
        if not isinstance(out, dict):
            return out
        out = self._drop_legacy_cards(copy.deepcopy(out))
        out["screen_decisions"] = self._screen_decisions(r, tm)
        return out

    # ---- Epic J (SDD-GEM-03): screen scope, regime, recipe
    def _rt(self, run_id, time_min):
        r = run_id if run_id in get_state().catalog.runs else self.run_id
        tm = int(time_min) if time_min is not None else self.time_min
        return r, tm

    def t_get_scope_snapshot(self, unit_id=None, run_id=None, time_min=None):
        from .chat import scope_snapshot_for
        r, tm = self._rt(run_id, time_min)
        uid = unit_id if unit_id else None
        ctx = {"run_id": r, "time_min": tm, "page": f"/twin/unit/{uid}" if uid else "/twin",
               "screen": {"level": "L1" if uid else "L0", "unit_id": uid}}
        snap = scope_snapshot_for(ctx)
        if not snap:
            return {"error": "scope snapshot unavailable for this run/minute"}
        try:
            return {"screen": snap["screen"], "snapshot": json.loads(snap["snapshot_json"])}
        except ValueError:
            return {"screen": snap["screen"], "snapshot_text": snap["snapshot_json"]}

    def t_get_regime(self, run_id=None, time_min=None):
        r, tm = self._rt(run_id, time_min)
        try:
            from ..engines.regime import regime_at
        except Exception as e:  # noqa: BLE001
            return {"error": f"regime engine unavailable: {str(e)[:120]}"}
        return regime_at(r, tm)

    def t_get_recipe(self, unit_id, run_id=None, time_min=None):
        r, tm = self._rt(run_id, time_min)
        try:
            from ..engines.recipe import recipe_for
        except Exception as e:  # noqa: BLE001
            return {"error": f"recipe engine unavailable: {str(e)[:120]}"}
        out = recipe_for(r, tm, str(unit_id))
        if isinstance(out, dict) and out.get("gate") == "WITHHELD":
            out = {**out, "instruction": "Gate is WITHHELD: report gate_reason and do not propose any set-point move."}
        return out


def model_labels() -> str:
    return ", ".join(f"{m} = {MODEL_META[m]['label']}" for m in MODEL_IDS)
