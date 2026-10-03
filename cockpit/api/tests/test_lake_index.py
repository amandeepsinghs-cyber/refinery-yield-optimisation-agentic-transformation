"""Lake-only serving (Cloud Run): run discovery from fcc_silver.run_registry, no local files (FCC_RUN_INDEX=bigquery)."""
from __future__ import annotations

import pandas as pd
import pytest

from app.data import catalog as cat
from app.data.catalog import META_COLS, Catalog


class FakeBQ:
    def __init__(self, reg):
        self.reg, self.fetched_runs, self.last_error = reg, [], None
        self.project, self.silver, self.fetched = "p", "fcc_silver", {}

    def registry(self):
        return self.reg

    @staticmethod
    def key(e):
        return f"{e.get('csv_sha256_16')}_{e.get('rows_loaded')}"

    def prefetch(self, entries):
        return 0

    def fetch_run(self, run_id, entry):
        self.fetched_runs.append(run_id)
        n = int(entry["rows_loaded"])
        return pd.DataFrame({"time_min": range(n), "LCO_T98_F": 750.0, "HN_T98_F": 530.0,
                             **{c: 0 for c in META_COLS}})


def _reg(n_train=4, n_test=1, rows=1600):
    reg = {f"random_s{100 + i}": {"run_id": f"random_s{100 + i}", "batch_id": "full_v1", "rows_loaded": rows,
                                  "csv_sha256_16": f"h{i}", "loaded_at": None} for i in range(n_train)}
    reg.update({f"random_s{140 + i}": {"run_id": f"random_s{140 + i}", "batch_id": "full_v1", "rows_loaded": rows,
                                       "csv_sha256_16": f"t{i}", "loaded_at": None} for i in range(n_test)})
    reg["lever_s200"] = {"run_id": "lever_s200", "batch_id": "lever_v1", "rows_loaded": 900, "csv_sha256_16": "l",
                         "loaded_at": None}
    reg["empty_s1"] = {"run_id": "empty_s1", "batch_id": "full_v1", "rows_loaded": 0, "csv_sha256_16": "e",
                       "loaded_at": None}
    return reg


@pytest.fixture
def lake(monkeypatch, tmp_path):
    monkeypatch.setenv("FCC_DATA_SOURCE", "bigquery")
    monkeypatch.setenv("FCC_RUN_INDEX", "bigquery")
    fake = FakeBQ(_reg())
    monkeypatch.setattr(cat, "get_bq", lambda s: fake)
    return fake


def test_runs_come_from_registry_not_files(lake):
    c = Catalog()
    assert set(c.runs) == {"random_s100", "random_s101", "random_s102", "random_s103", "random_s140"}
    assert "lever_s200" in c.all_runs and "empty_s1" not in c.all_runs
    assert all(i.lake for i in c.all_runs.values())          # lever runs are lake runs too
    assert c.store["lake_runs"] == 5 and c.data_mode["source"] == "primary"


def test_columns_filled_from_first_fetch(lake):
    c = Catalog()
    info = c.runs["random_s140"]
    assert "LCO_T98_F" in info.columns and info.schema == "v2"
    assert c.all_runs["lever_s200"].columns == info.columns


def test_rows_read_from_lake(lake):
    c = Catalog()
    df = c.load_true("random_s101")
    assert len(df) == 1600 and "random_s101" in lake.fetched_runs


def test_registry_down_gives_no_runs_and_error(monkeypatch):
    monkeypatch.setenv("FCC_DATA_SOURCE", "bigquery")
    monkeypatch.setenv("FCC_RUN_INDEX", "bigquery")

    class Down(FakeBQ):
        def registry(self):
            raise RuntimeError("bq down")
    monkeypatch.setattr(cat, "get_bq", lambda s: Down({}))
    c = Catalog()
    assert c.all_runs == {} and "bq down" in (c.store.get("error") or "")


def test_default_still_scans_files(monkeypatch):
    monkeypatch.delenv("FCC_RUN_INDEX", raising=False)
    monkeypatch.setenv("FCC_DATA_SOURCE", "csv")
    c = Catalog()
    assert c.all_runs and all(i.size > 0 for i in c.all_runs.values())
