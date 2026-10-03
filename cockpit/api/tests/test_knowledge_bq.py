"""Knowledge search backend `bigquery` (VECTOR_SEARCH over fcc_gold.knowledge_chunks) — offline, BigQuery is faked.

Checks: result shape equals the local backend's, cosine threshold (sim = 1 - distance), doc_type filter passed to the
query, BM25 fallback + note on any BigQuery error, LRU cache, no Vertex embedding at load, default backend unchanged."""
import pytest

from app.config import get_settings
from app.knowledge import index as kindex
from app.knowledge.bq_search import DESCRIPTION, BQKnowledgeSearch, search_backend
from app.knowledge.index import KnowledgeIndex

KEYS = {"doc_id", "revision", "section", "title", "section_title", "doc_type", "snippet", "score", "above_threshold"}

ROWS = [  # what the VECTOR_SEARCH SELECT returns (doc_type/revision as stored in the lake: lowercase / STRING)
    {"chunk_id": "SOP-FRAC-003#4.3", "doc_id": "SOP-FRAC-003", "doc_type": "sop", "revision": "4", "title": "LCO cut point SOP",
     "section": "4.3", "section_title": "Apply incremental set-point adjustment", "text": "Move SP_LCO_T98   in\n steps.", "score": 0.81},
    {"chunk_id": "INC-0507#1", "doc_id": "INC-0507", "doc_type": "inc", "revision": "1", "title": "Cut-point excursion",
     "section": "1", "section_title": "Summary", "text": "Wide spread on the LCO T98 estimate.", "score": 0.52},
    {"chunk_id": "WO-24058#2", "doc_id": "WO-24058", "doc_type": "wo", "revision": "1", "title": "Analyser work order",
     "section": "2", "section_title": "Scope", "text": "Recalibrate analyser.", "score": 0.20},
]


class _Row:
    def __init__(self, d):
        self.d = d

    def items(self):
        return self.d.items()


class FakeClient:
    def __init__(self, fail=False):
        self.fail, self.calls = fail, []

    def query(self, sql, job_config=None, timeout=None):
        params = {p.name: p.value for p in job_config.query_parameters}
        self.calls.append({"sql": sql, "params": params, "labels": dict(job_config.labels)})
        if self.fail:
            raise RuntimeError("Reauthentication is needed")
        dt = params["doc_type"].lower()
        rows = [r for r in ROWS if not dt or r["doc_type"] == dt][: params["k"]]
        return type("Job", (), {"result": lambda self_, timeout=None: [_Row(r) for r in rows]})()


@pytest.fixture
def bq_index(monkeypatch):
    monkeypatch.setenv("FCC_KNOWLEDGE_BACKEND", "bigquery")
    fake = FakeClient()
    monkeypatch.setattr(BQKnowledgeSearch, "client", lambda self: fake)
    monkeypatch.setattr(KnowledgeIndex, "_build_embeddings",
                        lambda self: (_ for _ in ()).throw(AssertionError("no Vertex embedding in bigquery mode")))
    kn = KnowledgeIndex(get_settings())
    kn.load(embed=True, background=False)
    return kn, fake


def test_default_backend_is_local(monkeypatch):
    monkeypatch.delenv("FCC_KNOWLEDGE_BACKEND", raising=False)
    s = get_settings()
    assert search_backend(s) == "local"
    kn = KnowledgeIndex(s)
    assert kn.bq is None
    kn.load(embed=False)
    assert kn.mode == "bm25" and "backend" not in kn.info()
    res = kn.search("LCO T98 cut point set point adjustment procedure", None, 3)
    assert res and set(res[0]) == KEYS


def test_result_shape_matches_local(bq_index):
    kn, fake = bq_index
    res = kn.search("LCO T98 cut point procedure", None, 3)
    assert [r["doc_id"] for r in res] == ["SOP-FRAC-003", "INC-0507", "WO-24058"]
    assert all(set(r) == KEYS for r in res)
    r0 = res[0]
    assert r0["revision"] == 4 and r0["doc_type"] == "SOP" and r0["section"] == "4.3"
    assert r0["snippet"] == "Move SP_LCO_T98 in steps."
    assert len(fake.calls) == 1 and "VECTOR_SEARCH" in fake.calls[0]["sql"] and "RETRIEVAL_QUERY" in fake.calls[0]["sql"]
    assert "ML.GENERATE_EMBEDDING" in fake.calls[0]["sql"] and "'COSINE'" in fake.calls[0]["sql"]
    assert fake.calls[0]["labels"].get("app") == "fcc-cockpit"
    info = kn.info()
    assert info["backend"] == DESCRIPTION and info["mode"] == "embedding" and info["note"] is None


def test_threshold_and_citations(bq_index):
    kn, _ = bq_index
    thr = float(get_settings()["knowledge"]["min_score_embedding"])
    res = kn.search("cut point", None, 3)
    assert [r["above_threshold"] for r in res] == [r["score"] >= thr for r in res] == [True, True, False]
    cites = kn.citations("cut point", k=3)
    assert [c["doc_id"] for c in cites] == ["SOP-FRAC-003", "INC-0507"]
    assert set(cites[0]) == {"doc_id", "revision", "section", "title", "snippet"}


def test_doc_type_filter(bq_index):
    kn, fake = bq_index
    res = kn.search("excursion", "INC", 3)
    assert fake.calls[-1]["params"] == {"q": "excursion", "doc_type": "INC", "k": 3}
    assert [r["doc_id"] for r in res] == ["INC-0507"] and res[0]["doc_type"] == "INC"


def test_lru_cache(bq_index):
    kn, fake = bq_index
    a = kn.search("cut point", None, 3)
    a[0]["doc_id"] = "mutated"
    b = kn.search("cut point", None, 3)
    assert len(fake.calls) == 1 and b[0]["doc_id"] == "SOP-FRAC-003"
    kn.search("cut point", "SOP", 3)
    assert len(fake.calls) == 2


def test_fallback_to_bm25_on_error(bq_index, monkeypatch):
    kn, _ = bq_index
    bad = FakeClient(fail=True)
    monkeypatch.setattr(BQKnowledgeSearch, "client", lambda self: bad)
    res = kn.search("LCO T98 cut point set point adjustment procedure", None, 3)
    assert res and all(set(r) == KEYS for r in res)
    assert kn.mode == "bm25" and kn.info()["note"].startswith(kindex.BQ_DOWN_NOTE)
    assert kn.info()["backend"] == DESCRIPTION
    # within the retry window BigQuery is not hit again; after it, a success restores embedding mode
    kn.search("cut point", None, 3)
    assert len(bad.calls) == 1
    good = FakeClient()
    monkeypatch.setattr(BQKnowledgeSearch, "client", lambda self: good)
    kn._bq_down_until = 0.0
    assert kn.search("cut point", None, 3)[0]["doc_id"] == "SOP-FRAC-003"
    assert kn.mode == "embedding" and kn.note is None


def test_empty_query(bq_index):
    kn, fake = bq_index
    assert kn.search("  ", None, 3) == [] and not fake.calls
