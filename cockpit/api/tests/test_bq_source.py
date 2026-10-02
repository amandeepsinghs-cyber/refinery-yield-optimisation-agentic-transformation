"""BigQuery data source: the catalog reads lake runs through BQSource and falls back to the local CSV on failure.
Offline: BigQuery is faked, so this checks the wiring, not the network (a live parity check is in docs/PROGRESS_LOG)."""
import os

import pandas as pd
import pytest

from app.config import get_settings
from app.data import bq_source
from app.data.catalog import Catalog, _read_csv


@pytest.fixture
def bq_env(monkeypatch, tmp_path):
    monkeypatch.setenv("FCC_DATA_SOURCE", "bigquery")
    monkeypatch.setenv("FCC_ARTIFACTS_DIR", str(tmp_path))
    monkeypatch.setattr(bq_source, "_SRC", None)
    yield
    bq_source._SRC = None


def _first_run(cat):
    return next(iter(cat.runs.values()))


def test_reads_lake_rows_when_bigquery(bq_env, monkeypatch):
    s = get_settings()
    calls = {}

    def fake_registry(self, max_age_s=120.0):
        os.environ["FCC_DATA_SOURCE"] = "csv"
        runs = Catalog(s).runs
        os.environ["FCC_DATA_SOURCE"] = "bigquery"
        return {r: {"run_id": r, "batch_id": i.batch, "rows_loaded": 10, "csv_sha256_16": "abc", "loaded_at": "x"} for r, i in runs.items()}

    def fake_fetch(self, run_id, entry):
        calls[run_id] = entry
        info = cat.runs[run_id]
        return _read_csv(info.path, 1600).head(10)

    monkeypatch.setattr(bq_source.BQSource, "registry", fake_registry)
    monkeypatch.setattr(bq_source.BQSource, "prefetch", lambda self, e, workers=8: 0)
    monkeypatch.setattr(bq_source.BQSource, "fetch_run", fake_fetch)
    cat = Catalog(s)
    if not cat.runs:
        pytest.skip("no simulator runs on this machine")
    info = _first_run(cat)
    assert info.lake and info.n_minutes == 10
    df = cat.load_true(info.run_id)
    assert len(df) == 10 and info.run_id in calls
    st = cat.store_info()
    assert st["source"] == "bigquery" and st["label"].startswith("BigQuery") and st["lake_runs"] == len(cat.runs)


def test_falls_back_to_csv_when_bigquery_fails(bq_env, monkeypatch):
    s = get_settings()

    def boom(self, *a, **k):
        raise RuntimeError("no network")

    monkeypatch.setattr(bq_source.BQSource, "registry", boom)
    cat = Catalog(s)
    if not cat.runs:
        pytest.skip("no simulator runs on this machine")
    info = _first_run(cat)
    assert info.lake is None
    assert len(cat.load_true(info.run_id)) > 0              # local CSV
    st = cat.store_info()
    assert st["error"] and "unreachable" in st["label"]


def test_staged_table_falls_back(bq_env, monkeypatch):
    s = get_settings()
    monkeypatch.setattr(bq_source.BQSource, "staged", lambda self, n, b: (_ for _ in ()).throw(RuntimeError("down")))
    df = bq_source.staged_table(s, "lab_results")
    assert isinstance(df, pd.DataFrame)
