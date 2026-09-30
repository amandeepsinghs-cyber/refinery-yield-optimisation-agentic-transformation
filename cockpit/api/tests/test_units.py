"""Unit tests: spread gate messages & hysteresis, mixture math, LTTB, SQL guard, knowledge chunking."""
import numpy as np
import pytest

from app.dist import bimodality, components, mix_moments, mix_quantiles
from app.gate import SpreadGate, gate_action, gate_cause
from app.lttb import lttb_indices

CAUSE, ACTION = "high predictive uncertainty", "request a lab sample; hold current set point"


# ------------------------------------------------------------------ gate (SDD-GATE-01..05)
def test_gate_wide_message_exact():
    g = SpreadGate(14.0).step(15.24, False, 0.5, CAUSE, ACTION)
    assert g.status == "WITHHELD" and g.reason == "wide"
    assert g.message == ("Distribution spread too wide — W90 = 15.2 °F exceeds limit 14.0 °F. No recommendation issued. "
                         "Likely cause: high predictive uncertainty. Suggested action: request a lab sample; hold current set point.")


def test_gate_bimodal_message_exact():
    g = SpreadGate(14.0).step(10.0, True, 2.37, "models disagree", ACTION)
    assert g.status == "WITHHELD" and g.reason == "bimodal"
    assert g.message == ("Distribution spread too wide — models disagree (bimodal, D = 2.4). No recommendation issued. "
                         "Likely cause: models disagree. Suggested action: request a lab sample; hold current set point.")


def test_gate_hysteresis_requires_10_minutes_below_clear():
    gate = SpreadGate(14.0, 0.9, 10)
    assert gate.step(16.0, False, 0, CAUSE, ACTION).status == "WITHHELD"
    # within limit but above 0.9*limit = 12.6 -> held, counter does not advance
    r = gate.step(13.0, False, 0, CAUSE, ACTION)
    assert r.status == "WITHHELD" and r.reason == "hysteresis"
    assert r.message == ("Distribution spread too wide — W90 = 13.0 °F has not yet stayed below 12.6 °F for 10 minutes. "
                         "No recommendation issued. Likely cause: high predictive uncertainty. Suggested action: "
                         "request a lab sample; hold current set point.")
    for _ in range(9):
        assert gate.step(10.0, False, 0, CAUSE, ACTION).status == "WITHHELD"
    assert gate.step(10.0, False, 0, CAUSE, ACTION).status == "PASS"     # 10th consecutive minute below 12.6


def test_gate_hysteresis_counter_resets():
    gate = SpreadGate(14.0, 0.9, 10)
    gate.step(20.0, False, 0, CAUSE, ACTION)
    for _ in range(5):
        gate.step(10.0, False, 0, CAUSE, ACTION)
    gate.step(13.0, False, 0, CAUSE, ACTION)             # above clear -> reset
    for _ in range(9):
        assert gate.step(10.0, False, 0, CAUSE, ACTION).status == "WITHHELD"
    assert gate.step(10.0, False, 0, CAUSE, ACTION).status == "PASS"


def test_gate_pass_initially():
    g = SpreadGate(14.0).step(8.0, False, 0.3, CAUSE, ACTION)
    assert (g.status, g.reason, g.message) == ("PASS", None, None)


def test_gate_cause_priority_and_action():
    sl = 7 / 2.77
    assert gate_cause(True, True, 99, sl) == "models disagree"
    assert gate_cause(False, True, 99, sl) == "inputs outside the training envelope"
    assert gate_cause(False, False, 2.1 * sl ** 2, sl) == "bias uncertain, no recent accepted lab"
    assert gate_cause(False, False, 0.5, sl) == "high predictive uncertainty"
    assert gate_action("T_tray13_F") == "check sensor T_tray13_F; hold current set point"
    assert gate_action(None) == "request a lab sample; hold current set point"


# ------------------------------------------------------------------ mixture (SDD-DIST-01..03)
def test_single_gaussian_quantiles_and_w90():
    mu = np.array([[760.0]]); sg = np.array([[3.0]]); w = np.array([[1.0]])
    m, s = components(mu, sg, np.zeros(1), np.zeros(1))
    q = mix_quantiles([0.05, 0.5, 0.95], m, s, w)
    assert abs(q[0.5][0] - 760.0) < 0.01
    assert abs((q[0.95][0] - q[0.05][0]) - 2 * 1.6448536 * 3.0) < 0.02


def test_mixture_bias_and_variance_added():
    mu = np.array([[750.0, 754.0]]); sg = np.array([[2.0, 2.0]]); w = np.array([[0.5, 0.5]])
    mean, sd = mix_moments(mu, sg, w, np.array([1.0]), np.array([1.0]))
    assert abs(mean[0] - 753.0) < 1e-9
    assert abs(sd[0] ** 2 - (4 + 1 + 4)) < 1e-9          # sum w(σ²+P) + spread of means


def test_bimodality_flag():
    mu = np.array([[750.0, 760.0, 755.0, 755.0]]); sg = np.full((1, 4), 2.0)
    w = np.array([[0.4, 0.4, 0.1, 0.1]])
    m, s = components(mu, sg, np.zeros(1), np.zeros(1))
    D, bim = bimodality(m, s, w, np.array([True] * 4))
    assert D[0] == pytest.approx(np.sqrt(2) * 10 / np.sqrt(8))
    assert bool(bim[0])
    D2, bim2 = bimodality(m, s, np.array([[0.85, 0.05, 0.05, 0.05]]), np.array([True] * 4))
    assert not bool(bim2[0])          # second weight < 0.2


def test_quantiles_monotone_for_mixture():
    mu = np.array([[740.0, 770.0]]); sg = np.array([[2.0, 5.0]]); w = np.array([[0.3, 0.7]])
    m, s = components(mu, sg, np.zeros(1), np.zeros(1))
    q = mix_quantiles([0.05, 0.25, 0.5, 0.75, 0.95], m, s, w)
    vals = [q[k][0] for k in (0.05, 0.25, 0.5, 0.75, 0.95)]
    assert vals == sorted(vals)


# ------------------------------------------------------------------ LTTB
def test_lttb_keeps_endpoints_and_size():
    x = np.arange(6000); y = np.sin(x / 50.0)
    idx = lttb_indices(x, y, 2000)
    assert idx[0] == 0 and idx[-1] == 5999 and len(idx) <= 2000 and len(idx) > 1900
    assert np.all(np.diff(idx) > 0)


def test_lttb_keeps_spike():
    x = np.arange(1000); y = np.zeros(1000); y[537] = 10
    assert 537 in lttb_indices(x, y, 100)


def test_lttb_passthrough_small():
    assert len(lttb_indices(np.arange(10), np.arange(10), 2000)) == 10


# ------------------------------------------------------------------ SQL guard (query_sim_data)
@pytest.mark.parametrize("sql", ["DELETE FROM fcc_sim_minute", "select 1; drop table x", "COPY fcc_sim_minute TO 'x.csv'",
                                 "SELECT * FROM read_csv('/etc/passwd')", "ATTACH 'x.db'", "update fcc_sim_minute set a=1"])
def test_sql_guard_rejects(sql):
    from app.copilot.tools import validate_sql
    with pytest.raises(ValueError):
        validate_sql(sql)


def test_sql_guard_accepts_select():
    from app.copilot.tools import validate_sql
    assert validate_sql("SELECT run_id, avg(T_tray13_F) FROM fcc_sim_minute GROUP BY run_id;").startswith("SELECT")


@pytest.mark.parametrize("sql", ["SELECT replace(run_id, 'random_', '') AS r FROM fcc_sim_minute",
                                 "SELECT REPLACE (run_id,'_s','-') FROM fcc_sim_minute",
                                 "SELECT 'set point moved; update pending' AS note",
                                 "SELECT run_id FROM fcc_sim_minute WHERE run_id <> 'drop table x'",
                                 'SELECT 1 AS "set"'])
def test_sql_guard_allows_replace_fn_and_keywords_in_strings(sql):
    from app.copilot.tools import validate_sql
    assert validate_sql(sql)


@pytest.mark.parametrize("sql", ["SET enable_external_access = true", "SELECT 1; SET threads = 8",
                                 "CREATE OR REPLACE TABLE t AS SELECT 1", "REPLACE INTO t VALUES (1)",
                                 "WITH a AS (SELECT 1) INSERT INTO t SELECT * FROM a",
                                 "SELECT * FROM fcc_sim_minute WHERE 1=1 SET x = 1"])
def test_sql_guard_blocks_statements(sql):
    from app.copilot.tools import validate_sql
    with pytest.raises(ValueError):
        validate_sql(sql)


# ------------------------------------------------------------------ knowledge chunking
def test_chunking_per_subsection_and_empty(tmp_path):
    from app.knowledge.index import KnowledgeIndex, chunk_doc, parse_front
    doc = ("---\ndoc_id: SOP-TEST-001\ntitle: Test procedure\ndoc_type: SOP\nrevision: 2\n---\n> SIMULATED DOCUMENT\n\n"
           "## 1 Scope\nintro\n### 1.1 Purpose\nalpha\n### 1.2 Limits\nbeta\n## 2 Steps\n### 2.1 Raise\ngamma\n")
    meta, body = parse_front(doc)
    ch = chunk_doc(meta, body)
    assert [c["section"] for c in ch] == ["1", "1.1", "1.2", "2.1"]
    assert ch[1]["doc_id"] == "SOP-TEST-001" and ch[1]["revision"] == 2
    meta2, body2 = parse_front(doc.replace("### ", "## "))
    assert [c["section"] for c in chunk_doc(meta2, body2)] == ["1", "1.1", "1.2", "2", "2.1"]

    class S:  # minimal settings stub pointing at an empty corpus
        raw = {}
        knowledge_dir = tmp_path / "none"
        def __getitem__(self, k):
            return {"knowledge": {"min_score_embedding": 0.35, "min_score_bm25": 0.35}}[k]
    kn = KnowledgeIndex(S())
    kn.load(embed=False)
    assert kn.info() == {"docs": 0, "chunks": 0, "mode": "empty"} and kn.search("anything") == []


# ------------------------------------------------------------------ job records on the run axis (DECISIONS D6)
SHIFT_DOC = ("---\r\ndoc_id: SHIFT-S105\r\ntitle: \"Shift log run random_s105\"\r\ndoc_type: SHIFT\r\nrevision: 1\r\n"
             "effective_date: 2026-09-01\r\nsim_run: random_s105\r\nsim_window: [360, 840]\r\n---\r\n"
             "## 3 Events and actions\r\n"
             "- **2026-09-01 06:40 (time_min 400)**: Event 5 LCO T98 set-point change. SP moved.\r\n"
             "- **2026-09-01 08:20**: Event 1 Crude change initiated.\r\n"
             "## 4 Lab results\r\n- **2026-09-01 06:00 (time_min 360)**: Routine shift sample collected.\r\n")


def _kn_with(tmp_path, docs: dict):
    from app.knowledge.index import KnowledgeIndex
    for name, text in docs.items():
        (tmp_path / name).write_text(text, encoding="utf-8")

    class S:
        raw = {}
        knowledge_dir = tmp_path
        def __getitem__(self, k):
            return {"knowledge": {"min_score_embedding": 0.35, "min_score_bm25": 0.35},
                    "data": {"ts_base": "2026-09-01T00:00:00Z"}}[k]
    kn = KnowledgeIndex(S())
    kn.load(embed=False)
    return kn


def test_records_time_min_on_run_axis(tmp_path):
    from app.knowledge.index import run_clock_start
    assert run_clock_start("random_s105").isoformat() == "2026-09-01T00:00:00"      # D6: every run starts here
    assert run_clock_start("random_s140") == run_clock_start("random_s100")
    wo = "---\ndoc_id: WO-99999\ntitle: Pump seal\ndoc_type: WO\neffective_date: 2026-09-01T12:00\n---\n## 1 Scope\nx\n"
    nowin = ("---\ndoc_id: SHIFT-S106\ntitle: No window\ndoc_type: SHIFT\neffective_date: 2026-09-01\n"
             "sim_run: random_s106\nsim_batch: pilot_v0\n---\n## 1 Log\n- **2026-09-01 01:00 (time_min 60)**: note\n")
    kn = _kn_with(tmp_path, {"SHIFT-S105.md": SHIFT_DOC, "WO-99999.md": wo, "SHIFT-S106.md": nowin})

    recs = {r["doc_id"]: r for r in kn.records("random_s105", run_minutes=1600)}
    sh = recs["SHIFT-S105"]
    assert sh["time_min"] == 360 and sh["window"] == [360, 840] and sh["run_id"] == "random_s105"
    assert sh["sim_batch"] == "full_v1"                                          # default when absent
    assert [e["time_min"] for e in sh["entries"]] == [400, 500, 360]             # 08:20 = 500 min after 00:00 (D6)
    assert sh["entries"][0]["event_code"] == 5 and sh["entries"][1]["event_code"] == 1
    assert recs["WO-99999"]["time_min"] is None and recs["WO-99999"]["date"] == "2026-09-01T12:00"   # date only
    assert "SHIFT-S106" not in recs

    s106 = {r["doc_id"]: r for r in kn.records("random_s106")}["SHIFT-S106"]
    assert s106["time_min"] is None and s106["sim_batch"] == "pilot_v0"          # no sim_window -> not placed
    assert all(r["doc_id"] != "SHIFT-S106" for r in kn.records("random_s106", batch="full_v1"))
    other = {r["doc_id"]: r for r in kn.records("random_s140")}
    assert "SHIFT-S105" not in other and other["WO-99999"]["time_min"] is None
    allr = {r["doc_id"]: r for r in kn.records(None)}
    assert allr["SHIFT-S105"]["time_min"] == 360 and allr["SHIFT-S105"]["run_id"] == "random_s105"


def test_real_corpus_shift_logs_have_time_min():
    from app.knowledge.index import KnowledgeIndex
    kn = KnowledgeIndex()
    kn.load(embed=False)
    shifts = [d for d, v in kn.docs.items() if v["meta"].get("sim_run")]
    if not shifts:
        pytest.skip("no SHIFT docs with sim_run in the corpus")
    for d in shifts:
        run = kn.docs[d]["meta"]["sim_run"]
        recs = [r for r in kn.records(run) if r["doc_id"] == d]
        assert recs and recs[0]["time_min"] is not None and recs[0]["entries"], d


# ------------------------------------------------------------------ catalog completeness rule
def _write_run(p, n):
    cols = ["time_min", "T_tray13_F", "LCO_T98_F", "HN_T98_F", "cutpoint_auto", "lab_sample", "crude_id", "event_code"]
    with open(p, "w") as f:
        f.write(",".join(cols) + "\n")
        for t in range(1, n + 1):
            f.write(f"{t},600.0,750.0,530.0,0,0,1,0\n")


def _catalog(tmp_path, **data):
    import copy
    from app.config import Settings, get_settings
    from app.data.catalog import Catalog
    raw = copy.deepcopy(get_settings().raw)
    raw["data"].update({"primary_batch": "full_v1", "fallback_batches": ["fb"], "min_rows": 50,
                        "min_complete_train_runs": 2, "min_complete_test_runs": 1, **data})

    class S(Settings):
        @property
        def data_root(self):
            return tmp_path
    return Catalog(S(raw))


def test_catalog_stays_on_fallback_until_primary_complete(tmp_path):
    (tmp_path / "full_v1").mkdir()
    (tmp_path / "fb").mkdir()
    _write_run(tmp_path / "fb" / "sample_1h_steady.csv", 60)
    for s in (100, 101, 140):
        _write_run(tmp_path / "full_v1" / f"random_s{s}.csv", 20)             # partial
    (tmp_path / "full_v1" / "random_s141.csv").write_text("time_min,T_tray13_F\n")   # header-only
    cat = _catalog(tmp_path)
    pp = cat.primary_progress
    assert cat.fallback and list(cat.runs) == ["sample_1h_steady"]
    assert pp["partial"] == 3 and pp["complete"] == 0 and pp["header_only"] == 1 and not pp["ready"]
    assert pp["partial_runs"]["random_s140"] == 20
    assert "still being generated" in cat.data_mode["note"]

    _write_run(tmp_path / "full_v1" / "random_s100.csv", 60)                   # 1 train + 0 test complete
    _write_run(tmp_path / "full_v1" / "random_s140.csv", 60)
    assert cat.scan() and cat.fallback                                          # needs 2 complete train runs
    _write_run(tmp_path / "full_v1" / "random_s101.csv", 55)
    cat.scan()
    assert not cat.fallback and cat.data_mode["source"] == "primary"
    assert sorted(cat.runs) == ["random_s100", "random_s101", "random_s140"]   # partial/header-only excluded
    assert cat.primary_progress["ready"] and cat.primary_progress["complete_test"] == 1
