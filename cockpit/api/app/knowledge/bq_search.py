"""Knowledge retrieval from the gold lake: VECTOR_SEARCH over fcc_gold.knowledge_chunks (data_and_analytics_flow §8).

One BigQuery query per search: the question is embedded inside the same SQL with
ML.GENERATE_EMBEDDING(MODEL fcc_gold.text_embedding, task_type RETRIEVAL_QUERY) (the remote text-embedding-005 model
over connection fcc-lake that load_lakehouse.knowledge_zone() used for the RETRIEVAL_DOCUMENT vectors), then
VECTOR_SEARCH with distance_type COSINE returns the top-k chunks. Similarity = 1 - cosine distance.

Selected with config `knowledge.search_backend: local | bigquery` or env FCC_KNOWLEDGE_BACKEND (default local).
The caller (KnowledgeIndex) falls back to BM25 over the local documents when this raises.
"""
from __future__ import annotations

import os
import re
import threading
from collections import OrderedDict

LABEL = {"datacloud": "jetski", "app": "fcc-cockpit", "kind": "rag"}
DESCRIPTION = "bigquery · fcc_gold.knowledge_chunks · VECTOR_SEARCH"


def search_backend(s) -> str:
    try:
        cfg = (s["knowledge"] or {}).get("search_backend")
    except (KeyError, TypeError):
        cfg = None
    return (os.environ.get("FCC_KNOWLEDGE_BACKEND") or cfg or "local").strip().lower()


def _int(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return v


class BQKnowledgeSearch:
    def __init__(self, s, cache_size: int = 256, timeout_s: float = 20.0):
        try:
            B = s["data"].get("bigquery") or {}
        except (KeyError, TypeError, AttributeError):
            B = {}
        self.project = os.environ.get("FCC_GCP_PROJECT", B.get("project", "fcc-soft-sensor"))
        self.location = os.environ.get("FCC_GCP_LOCATION", B.get("location", "us-central1"))
        self.table = f"{self.project}.fcc_gold.knowledge_chunks"
        self.model = f"{self.project}.fcc_gold.text_embedding"
        self.timeout_s = timeout_s
        self._client = None
        self._cache: OrderedDict = OrderedDict()
        self._cache_size = cache_size
        self._lock = threading.Lock()
        self.last_ms: float | None = None

    def client(self):
        if self._client is None:
            from google.cloud import bigquery
            self._client = bigquery.Client(project=self.project, location=self.location)
        return self._client

    def sql(self) -> str:
        return f"""
SELECT base.chunk_id, base.doc_id, base.doc_type, base.revision, base.title, base.section, base.section_title, base.text,
       1 - distance AS score
FROM VECTOR_SEARCH(
  (SELECT * FROM `{self.table}` WHERE @doc_type = '' OR LOWER(doc_type) = LOWER(@doc_type)),
  'embedding',
  (SELECT ml_generate_embedding_result AS embedding
     FROM ML.GENERATE_EMBEDDING(MODEL `{self.model}`, (SELECT @q AS content),
                                STRUCT(TRUE AS flatten_json_output, 'RETRIEVAL_QUERY' AS task_type))),
  top_k => @k, distance_type => 'COSINE')
ORDER BY distance, base.chunk_id
"""

    def search(self, q: str, doc_type: str | None, k: int) -> list[dict]:
        """Rows {doc_id, revision, section, title, section_title, doc_type, snippet, text, score} best first. Raises on error."""
        key = (q, (doc_type or "").upper(), int(k))
        with self._lock:
            if key in self._cache:
                self._cache.move_to_end(key)
                return [dict(r) for r in self._cache[key]]
        import time

        from google.cloud import bigquery
        cfg = bigquery.QueryJobConfig(labels=LABEL, query_parameters=[
            bigquery.ScalarQueryParameter("q", "STRING", q),
            bigquery.ScalarQueryParameter("doc_type", "STRING", doc_type or ""),
            bigquery.ScalarQueryParameter("k", "INT64", int(k)),
        ])
        t0 = time.time()
        rows = self.client().query(self.sql(), job_config=cfg, timeout=self.timeout_s).result(timeout=self.timeout_s)
        out = []
        for r in rows:
            r = dict(r.items())
            did = r.get("doc_id") or ""
            text = r.get("text") or ""
            out.append({"doc_id": did, "revision": _int(r.get("revision")), "section": r.get("section") or "",
                        "title": r.get("title") or "", "section_title": r.get("section_title") or "",
                        "doc_type": str(r.get("doc_type") or did.split("-")[0]).upper(),
                        "snippet": re.sub(r"\s+", " ", text)[:280], "score": float(r.get("score") or 0.0)})
        self.last_ms = round((time.time() - t0) * 1000.0, 1)
        with self._lock:
            self._cache[key] = out
            while len(self._cache) > self._cache_size:
                self._cache.popitem(last=False)
        return [dict(r) for r in out]

    def clear(self) -> None:
        with self._lock:
            self._cache.clear()
