"""Read simulator runs from the BigQuery lakehouse (project fcc-soft-sensor) instead of the local CSVs.

Data path shown on the home page: Simulation -> BigQuery -> Lakehouse -> Models -> Decision.
  * Run telemetry  <- fcc_silver.telemetry_minute (wide record: all simulator columns as a JSON payload, one row per minute)
  * Which runs, how complete <- fcc_silver.run_registry (rows_loaded, csv_sha256_16, loaded_at)
  * Lab schedule / crude segments <- fcc_bronze.lab_results_raw / crude_regimes_raw (same columns as the staged CSVs)

Each run is fetched once and kept as Parquet under artifacts/bq_cache/, keyed on the lake's own load key
(csv_sha256_16 + rows_loaded), so screens stay fast and a reload of the run in the lake refreshes the copy.
If BigQuery cannot be reached the caller falls back to the local CSV and says so in data_mode.

Switch with config `data.source: bigquery | csv` or env FCC_DATA_SOURCE.
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import threading
import time
from pathlib import Path

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

LABEL = {"datacloud": "jetski", "app": "fcc-cockpit"}


def data_source(s) -> str:
    return (os.environ.get("FCC_DATA_SOURCE") or s["data"].get("source") or "csv").lower()


class BQSource:
    def __init__(self, s):
        B = s["data"].get("bigquery") or {}
        self.project = os.environ.get("FCC_GCP_PROJECT", B.get("project", "fcc-soft-sensor"))
        self.location = B.get("location", "us-central1")
        self.silver = B.get("silver", "fcc_silver")
        self.bronze = B.get("bronze", "fcc_bronze")
        self.cache = s.artifacts / B.get("cache_dir", "bq_cache")
        self.cache.mkdir(parents=True, exist_ok=True)
        self._client = None
        self._lock = threading.Lock()
        self._reg: tuple[float, dict] | None = None
        self.last_error: str | None = None
        self.fetched: dict[str, str] = {}          # run_id -> "bigquery" | "bq_cache"

    # ------------------------------------------------------------------ client
    def client(self):
        if self._client is None:
            from google.cloud import bigquery
            self._client = bigquery.Client(project=self.project, location=self.location)
        return self._client

    def _query(self, sql: str, params: list | None = None) -> list[dict]:
        from google.cloud import bigquery
        cfg = bigquery.QueryJobConfig(labels=LABEL, query_parameters=params or [])
        rows = self.client().query(sql, job_config=cfg).result(timeout=120)
        return [dict(r.items()) for r in rows]

    # ------------------------------------------------------------------ registry
    def registry(self, max_age_s: float = 120.0) -> dict[str, dict]:
        """run_id -> {batch_id, run_status, rows_loaded, t_last_min, csv_sha256_16, loaded_at} from the lake."""
        with self._lock:
            if self._reg and time.time() - self._reg[0] < max_age_s:
                return self._reg[1]
        rows = self._query(f"SELECT run_id, batch_id, run_status, rows_loaded, t_last_min, csv_sha256_16, loaded_at "
                           f"FROM `{self.project}.{self.silver}.run_registry`")
        reg = {r["run_id"]: {**r, "loaded_at": r["loaded_at"].isoformat() if r.get("loaded_at") else None} for r in rows}
        with self._lock:
            self._reg = (time.time(), reg)
        self.last_error = None
        return reg

    @staticmethod
    def key(entry: dict) -> str:
        return f"{entry.get('csv_sha256_16') or 'na'}_{int(entry.get('rows_loaded') or 0)}"

    # ------------------------------------------------------------------ telemetry
    def fetch_run(self, run_id: str, entry: dict) -> pd.DataFrame:
        """Wide minute frame for one run (same columns as the simulator CSV), from Parquet cache or BigQuery."""
        k = self.key(entry)
        p = self.cache / f"{run_id}__{k}.parquet"
        if p.exists():
            self.fetched[run_id] = "bq_cache"
            return pd.read_parquet(p)
        from google.cloud import bigquery
        rows = self._query(
            f"SELECT time_min, payload FROM `{self.project}.{self.silver}.telemetry_minute` "
            f"WHERE run_id = @run ORDER BY time_min",
            [bigquery.ScalarQueryParameter("run", "STRING", run_id)])
        recs = [json.loads(r["payload"]) for r in rows]
        df = pd.DataFrame.from_records(recs)
        if "time_min" not in df.columns and rows:
            df.insert(0, "time_min", [r["time_min"] for r in rows])
        df = df.apply(pd.to_numeric, errors="coerce").replace([np.inf, -np.inf], np.nan)
        df = df.dropna(subset=["time_min"])
        df["time_min"] = df["time_min"].astype(int)
        df = df.drop_duplicates("time_min").sort_values("time_min").reset_index(drop=True)
        for old in self.cache.glob(f"{run_id}__*.parquet"):      # drop copies of earlier lake loads of this run
            old.unlink(missing_ok=True)
        tmp = p.with_suffix(f".{threading.get_ident()}.tmp")
        df.to_parquet(tmp, index=False)
        tmp.replace(p)
        self.fetched[run_id] = "bigquery"
        logger.info("bq_source: %s fetched from %s.telemetry_minute (%d minutes)", run_id, self.silver, len(df))
        return df

    def prefetch(self, entries: dict[str, dict], workers: int = 8) -> int:
        """Fetch every run not yet in the Parquet cache, in parallel (cold start ~1 min for 54 runs instead of ~6)."""
        todo = {r: e for r, e in entries.items() if not (self.cache / f"{r}__{self.key(e)}.parquet").exists()}
        if not todo:
            return 0
        from concurrent.futures import ThreadPoolExecutor
        t0 = time.time()
        with ThreadPoolExecutor(max_workers=workers) as ex:
            list(ex.map(lambda kv: self.fetch_run(*kv), todo.items()))
        logger.info("bq_source: prefetched %d runs from BigQuery in %.0f s", len(todo), time.time() - t0)
        return len(todo)

    # ------------------------------------------------------------------ staged side tables
    def staged(self, name: str, batch: str) -> pd.DataFrame:
        """'lab_results' | 'regimes' as staged for `batch` (bronze external tables over the same Parquet)."""
        table = {"lab_results": "lab_results_raw", "regimes": "crude_regimes_raw"}[name]
        reg = self.registry()
        stamp = max((v.get("loaded_at") or "" for v in reg.values()), default="")
        p = self.cache / f"_{name}__{batch}__{hashlib.sha256(stamp.encode()).hexdigest()[:12]}.parquet"
        if p.exists():
            return pd.read_parquet(p)
        from google.cloud import bigquery
        rows = self._query(f"SELECT * EXCEPT(source, site, batch) FROM `{self.project}.{self.bronze}.{table}` WHERE batch = @b",
                           [bigquery.ScalarQueryParameter("b", "STRING", batch)])
        df = pd.DataFrame.from_records(rows)
        for old in self.cache.glob(f"_{name}__{batch}__*.parquet"):
            old.unlink(missing_ok=True)
        df.to_parquet(p, index=False)
        return df


_SRC: BQSource | None = None


def get_bq(s) -> BQSource:
    global _SRC
    if _SRC is None:
        _SRC = BQSource(s)
    return _SRC


def staged_table(s, name: str) -> pd.DataFrame:
    """Staged lab schedule / crude segments: BigQuery when data.source = bigquery, else (or on error) the local CSV."""
    batch = s["data"]["primary_batch"]
    if data_source(s) == "bigquery":
        try:
            return get_bq(s).staged(name, batch)
        except Exception as e:  # noqa: BLE001 — any client/network failure falls back to the local copy
            get_bq(s).last_error = f"{type(e).__name__}: {e}"[:300]
            logger.warning("bq_source: staged %s from BigQuery failed (%s); using local CSV", name, e)
    p: Path = s.data_root / batch / "_staged" / f"{name}.csv"
    return pd.read_csv(p) if p.exists() else pd.DataFrame()
