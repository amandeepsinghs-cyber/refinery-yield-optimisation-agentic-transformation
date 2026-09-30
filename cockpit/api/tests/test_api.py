"""Contract shape tests for every endpoint (cockpit/API_CONTRACT.md) using TestClient on the trained artifacts,
plus a no-financial-terms scan of every response. Gemini calls are not made here (see test_gemini.py)."""
import json
import os
import re

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("FCC_NO_PROBE", "1")
from app.main import app  # noqa: E402
from app.state import get_state  # noqa: E402

get_state().s.raw["gemini"]["probe_on_startup"] = False
client = TestClient(app)
FIN = re.compile(r"[$€£₹]\s?\d|\bUSD\b|\bEUR\b|\bNPV\b|\bROI\b|payback|\bcost\b|\bbudget\b|\bprice\b|\brevenue\b|"
                 r"\bprofit\b|\bsavings?\b|\bmonetary\b", re.I)
RESPONSES = []


def get(path, **params):
    r = client.get(path, params=params)
    assert r.status_code == 200, (path, r.status_code, r.text[:300])
    RESPONSES.append(r.text)
    return r.json()


@pytest.fixture(scope="module")
def run_id():
    st = get_state()
    if not st.trained:
        pytest.skip("not trained; run python -m app.train")
    return get("/api/config")["default_run"]


def test_health():
    h = get("/api/health")
    assert h["status"] == "ok"
    assert set(h["data"]) >= {"runs", "batches", "trained", "trained_at"}
    assert set(h["gemini"]) >= {"project", "location", "text_model", "live_model", "ok", "note"}
    assert h["knowledge"]["mode"] in ("embedding", "bm25", "empty")
    assert set(h["knowledge"]) >= {"docs", "chunks", "mode"}


def test_runs_tags_config(run_id):
    runs = get("/api/runs")
    assert runs and set(runs[0]) >= {"run_id", "batch", "scenario", "n_minutes", "split", "has_events"}
    assert all(r["split"] in ("train", "test") for r in runs)
    tags = get("/api/tags")
    groups = {t["group"] for t in tags}
    assert groups <= {"input", "mv", "tray", "target", "reactor", "signal"}
    assert {"T_tray13_F", "LCO_T98_F"} <= {t["tag"] for t in tags}
    assert not any(t["tag"].endswith("_dup") or t["tag"].startswith("eff_") for t in tags)
    c = get("/api/config")
    assert c["spec"] == {"LCO_T98_F": 765.0, "HN_T98_F": 540.0} and c["R"] == 7.0 and c["w90_limit"] == 14.0
    assert c["hysteresis_ratio"] == 0.9 and c["hysteresis_min"] == 10
    assert [m["model_id"] for m in c["models"]] == ["bayes_ridge_v1", "gpr_v1", "hybrid_delta_v1", "pinn_ens_v1"]


def test_run_timeseries(run_id):
    ts = get(f"/api/runs/{run_id}/timeseries", cols="T_tray13_F,LCO_T98_F", max_points=20)
    assert set(ts) >= {"run_id", "time_min", "series", "events", "labs", "downsampled", "note"}
    assert len(ts["series"]["T_tray13_F"]) == len(ts["time_min"]) <= 20
    if ts["events"]:
        assert set(ts["events"][0]) >= {"time_min", "code", "label", "duration"}
    r = client.get("/api/runs/nope/timeseries")
    assert r.status_code == 404 and set(r.json()) == {"error", "detail"}


def test_estimates_timeseries(run_id):
    e = get("/api/estimates/timeseries", run_id=run_id, property="LCO_T98_F", max_points=50)
    for k in ("run_id", "property", "time_min", "truth", "members", "mixture", "w90", "bimodality_d", "gate",
              "gate_reason", "trust", "labs", "events", "spec_max", "w90_limit"):
        assert k in e
    n = len(e["time_min"])
    assert 0 < n <= 50
    assert set(e["members"]) == {"bayes_ridge_v1", "gpr_v1", "hybrid_delta_v1", "pinn_ens_v1"}
    assert set(e["members"]["gpr_v1"]) >= {"mu", "sigma", "weight"}
    assert set(e["mixture"]) == {"mean", "q05", "q25", "q50", "q75", "q95"}
    assert all(len(v) == n for v in e["mixture"].values())
    assert set(e["gate"]) <= {"PASS", "WITHHELD"} and set(e["trust"]) <= {"GREEN", "AMBER", "RED"}
    assert set(e["gate_reason"]) <= {None, "wide", "bimodal", "hysteresis"}
    assert e["spec_max"] == 765.0 and e["w90_limit"] == 14.0
    for i in range(n):
        q = [e["mixture"][k][i] for k in ("q05", "q25", "q50", "q75", "q95")]
        assert q == sorted(q)
        assert abs((e["mixture"]["q95"][i] - e["mixture"]["q05"][i]) - e["w90"][i]) < 0.05


def test_estimate_message(run_id):
    m = get("/api/estimate", run_id=run_id, property="HN_T98_F", time_min=30)
    assert m["schema_version"] == "2.0" and m["provenance"]["source"] == "simulated"
    assert m["trust"]["level"] in ("GREEN", "AMBER", "RED") and m["gate"]["status"] in ("PASS", "WITHHELD")
    assert set(m["trust"]["signals"]) == {f"S{i}" for i in range(1, 8)}
    assert set(m["mixture"]) >= {"mean", "sd", "q05", "q10", "q50", "q90", "q95", "w90", "bimodality_d", "p_on_spec"}
    assert set(m["bias"]) == {"b", "var"} and "truth" in m
    assert m["source"] in ("consensus", "best_single", "hold_last", "BAD") and "source_value" in m
    if m["gate"]["status"] == "WITHHELD":
        assert m["gate"]["message"].startswith("Distribution spread too wide — ")


def test_distribution(run_id):
    d = get("/api/distribution", run_id=run_id, property="LCO_T98_F", time_min=20)
    assert len(d["grid"]) == 200
    assert set(d["members"]) == {"bayes_ridge_v1", "gpr_v1", "hybrid_delta_v1", "pinn_ens_v1"}
    for v in d["members"].values():
        assert set(v) >= {"pdf", "mu", "sigma", "weight", "admitted", "shadow"} and len(v["pdf"]) == 200
        assert v["admitted"] != v["shadow"]
    assert set(d["mixture"]) >= {"pdf", "mean", "q05", "q50", "q95", "p_on_spec"}
    assert set(d) >= {"w90", "bimodality_d", "bimodal", "gate", "trust", "spec_max", "w90_limit", "truth"}
    assert set(d["gate"]) == {"status", "reason", "message"} and set(d["trust"]) >= {"level", "reason"}
    assert abs(sum(w["weight"] for w in d["members"].values()) - 1) < 1e-3


def test_models_and_calibration(run_id):
    for p in ("LCO_T98_F", "HN_T98_F"):
        m = get("/api/models", property=p)
        assert m["property"] == p and set(m["eval"]) >= {"runs", "n_minutes", "note"}
        assert [x["model_id"] for x in m["models"]] == ["bayes_ridge_v1", "gpr_v1", "hybrid_delta_v1", "pinn_ens_v1"]
        for x in m["models"]:
            assert set(x) >= {"model_id", "family", "label", "status", "weight", "rmse", "mae", "bias", "coverage90",
                              "crps", "mean_sigma", "params", "per_regime", "features"}
            assert x["status"] in ("admitted", "shadow")
        assert m["models"][0]["status"] == "admitted"            # ridge always admitted
        assert set(m["mixture"]) >= {"rmse", "coverage90", "crps"}
        hy = m["models"][2]["params"]
        assert {"physics", "a", "b", "c", "residual"} <= set(hy)
        c = get("/api/calibration", property=p)
        for k in ("parity", "residuals", "pit", "reliability", "coverage_over_time", "gpr_relevance",
                  "hybrid_decomposition", "pinn_members", "cusum"):
            assert k in c
        assert len(c["pit"]["bins"]) == 11 and len(c["pit"]["gpr_v1"]) == 10
        assert c["reliability"]["nominal"] == [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]
        assert len(c["pinn_members"]["members"]) == 5
        assert c["gpr_relevance"] and max(r["relevance"] for r in c["gpr_relevance"]) == 1.0
        assert set(c["cusum"]) >= {"time_idx", "value", "h"}


def test_overview_recommendations_decision_audit(run_id):
    o = get("/api/overview", run_id=run_id)
    assert set(o) >= {"kpis", "decisions_needed", "note"}
    assert set(o["kpis"]) >= {"rmse_vs_lab", "rmse_target", "coverage90", "trust_mix", "availability",
                              "recs_accepted", "recs_total", "withheld"}
    recs = get("/api/recommendations", run_id=run_id)
    keys = {"rec_id", "run_id", "time_min", "property", "status", "action", "delta_F", "sp_before", "sp_after",
            "p_on_spec_after", "margin_before_F", "margin_after_F", "yield_shift_pct", "trust", "conservative",
            "rationale", "gate", "citations"}
    for r in recs:
        assert set(r) >= keys
        assert r["status"] in ("OPEN", "ACCEPTED", "DECLINED", "WITHHELD", "EXPIRED", "HOLD")
        if r["status"] in ("OPEN", "ACCEPTED", "DECLINED", "EXPIRED"):     # actionable cards: DECISIONS T5
            assert r["p_on_spec_after"] >= 0.95 and abs(r["delta_F"]) <= 5.0
        if r["status"] == "HOLD":                                            # no feasible move: never actionable
            assert r["action"] == "HOLD" and r["delta_F"] == 0.0
        assert r["action"] in ("RAISE", "LOWER", "HOLD")
        assert set(r["gate"]) >= {"status", "reason", "message", "w90"}
        if r["status"] == "WITHHELD":        # SDD-GATE-02 / REC-06: never actionable
            assert r["gate"]["status"] == "WITHHELD" and r["delta_F"] == 0.0
            assert r["gate"]["message"].startswith("Distribution spread too wide — ")
        assert r["trust"] != "RED" or r["status"] == "WITHHELD"
    assert all(r["time_min"] % 5 == 0 for r in recs)
    opened = [r for r in recs if r["status"] == "OPEN"]
    if opened:
        rid = opened[0]["rec_id"]
        d = client.post(f"/api/recommendations/{rid}/decision", json={"decision": "accepted", "user": "pytest", "note": "t"})
        assert d.status_code == 200 and d.json()["ok"] is True and isinstance(d.json()["audit_id"], int)
        again = client.post(f"/api/recommendations/{rid}/decision", json={"decision": "declined", "user": "pytest"})
        assert again.status_code == 409
        st = get_state()                           # clean up the test decision
        st.db.execute("DELETE FROM decisions WHERE rec_id = ?", (rid,))
        st.db.execute("DELETE FROM audit WHERE actor = 'pytest'")
        st.db.commit()
    bad = client.post("/api/recommendations/r-nope-LCO-0005/decision", json={"decision": "accepted", "user": "x"})
    assert bad.status_code == 404
    a = get("/api/audit", q="gate")
    for row in a[:5]:
        assert set(row) >= {"audit_id", "ts", "actor", "action", "target", "detail"}
    f = [r for r in get("/api/recommendations", run_id=run_id, status="WITHHELD")]
    assert all(r["status"] == "WITHHELD" for r in f)


def test_overview_property_param(run_id):
    lco = get("/api/overview", run_id=run_id)
    assert lco["provenance"]["property"] == "LCO_T98_F"                      # default
    hn = get("/api/overview", run_id=run_id, property="HN_T98_F")
    assert hn["provenance"]["property"] == "HN_T98_F"
    assert all(r["property"] == "HN_T98_F" for r in hn["decisions_needed"])
    assert hn["kpis"]["rmse_vs_truth"] != lco["kpis"]["rmse_vs_truth"] or hn["kpis"]["w90_now"] != lco["kpis"]["w90_now"]
    assert client.get("/api/overview", params={"run_id": run_id, "property": "XX"}).status_code == 400


def test_stream_sse(run_id):
    with client.stream("GET", "/api/stream", params={"run_id": run_id, "property": "LCO_T98_F", "speed": 0, "from": 1}) as r:
        assert r.status_code == 200
        events, n = [], 0
        for line in r.iter_lines():
            if line.startswith("event: "):
                events.append(line[7:])
                n += 1
            if n > 12:
                break
    assert events[0] == "heartbeat" and "estimate" in events and "gate" in events


def test_whatif(run_id):
    r = client.post("/api/whatif", json={"run_id": run_id, "time_min": 30, "overrides": {"MV_PA2": 1.0}})
    assert r.status_code == 200
    RESPONSES.append(r.text)
    assert set(r.json()["properties"]) == {"LCO_T98_F", "HN_T98_F"}


def test_knowledge_endpoints():
    s = get("/api/knowledge/search", q="LCO T98 cut point")
    assert set(s) == {"results", "index"} and set(s["index"]) == {"docs", "chunks", "mode"}
    if s["index"]["mode"] == "empty":
        assert s["results"] == []
    for x in s["results"]:
        assert set(x) >= {"doc_id", "revision", "section", "title", "section_title", "doc_type", "snippet", "score"}
    docs = get("/api/knowledge/docs")
    assert isinstance(docs, list)
    assert isinstance(get("/api/knowledge/records", run_id="random_s140"), list)
    assert client.get("/api/knowledge/docs/NOPE-000").status_code == 404


def test_knowledge_sim_fields():
    if not get_state().knowledge.docs:
        get_state().knowledge.load(embed=False)
    # Check doc list response (/api/knowledge/docs)
    docs = get("/api/knowledge/docs")
    assert isinstance(docs, list)
    sim_docs = [d for d in docs if d.get("sim_run")]
    assert len(sim_docs) > 0
    for d in sim_docs:
        assert d["sim_batch"] == "full_v1"
        assert isinstance(d["sim_run"], str)
        if "sim_window" in d:
            assert isinstance(d["sim_window"], list) and len(d["sim_window"]) == 2
            assert all(isinstance(x, int) for x in d["sim_window"])

    # Specific doc check
    s100 = next((d for d in docs if d.get("doc_id") == "SHIFT-S100"), None)
    assert s100 is not None
    assert s100["sim_run"] == "random_s100"
    assert s100["sim_batch"] == "full_v1"
    assert s100["sim_window"] == [360, 840]

    # Check record list response (/api/knowledge/records)
    recs = get("/api/knowledge/records", run_id="random_s100")
    assert isinstance(recs, list)
    sh = [r for r in recs if r.get("sim_run") == "random_s100"]
    assert len(sh) > 0
    for r in sh:
        assert r["sim_batch"] == "full_v1"
        assert r["sim_run"] == "random_s100"
        assert r["sim_window"] == [360, 840]
        assert r["window"] == [360, 840]
        assert r["run_id"] == "random_s100"


def test_records_endpoint_run_axis():
    if not get_state().knowledge.docs:
        get_state().knowledge.load(embed=False)          # TestClient without `with` skips the startup hook
    recs = get("/api/knowledge/records", run_id="random_s100")
    for r in recs:
        assert set(r) >= {"doc_id", "doc_type", "title", "date", "time_min"}
        assert r.get("run_id") in (None, "random_s100")                    # other runs' shift logs are dropped
    sh = [r for r in recs if r.get("run_id") == "random_s100"]
    if not sh:
        pytest.skip("corpus has no SHIFT doc for random_s100")
    assert all(isinstance(r["time_min"], int) and r["entries"] for r in sh)
    assert all(isinstance(e["time_min"], int) for r in sh for e in r["entries"])
    h = get("/api/health")["data"]
    assert "primary_progress" in h and "retrain_recommended" in h


def test_copilot_empty_message_sse():
    r = client.post("/api/copilot/chat", json={"messages": [], "context": {}})
    assert r.status_code == 200 and "event: error" in r.text and "event: done" in r.text


def test_no_financial_terms_in_responses():
    assert RESPONSES, "run after the other tests"
    for body in RESPONSES:
        m = FIN.search(body)
        assert m is None, f"financial term '{m.group(0)}' in response: {body[max(0, m.start() - 80): m.end() + 80]}"


def test_no_financial_terms_in_source():
    import pathlib
    root = pathlib.Path(__file__).resolve().parents[1] / "app"
    for p in root.rglob("*.py"):
        for ln, line in enumerate(p.read_text().splitlines(), 1):
            if "FIN" in line or "financial" in line.lower() or "money" in line.lower() or "monetary" in line.lower():
                continue          # guardrail text that forbids financial content
            assert FIN.search(line) is None, f"{p.name}:{ln}: {line.strip()}"
