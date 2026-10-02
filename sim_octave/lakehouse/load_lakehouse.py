#!/usr/bin/env python3
"""FCC Decision Cockpit — medallion lakehouse loader (GCS + BigLake/BigQuery, project fcc-soft-sensor).

What a *lakehouse* means here (vs the plain warehouse table `fcc_soft_sensor.fcc_sim_minute_sample`):
  * GCS is the system of record — bronze is immutable Parquet (+ the original CSV), silver is **BigLake Iceberg**
    (BigQuery-managed, files stay in `gs://…/silver/`), gold is served by BigQuery.
  * One catalog (Dataplex lake `fcc-refinery`) over bucket and datasets; BigQuery column descriptions carry the contract.
  * Unstructured context (SOPs, incidents, MOC, IOW, lab methods, shift logs, work orders, references, reports) lives in
    the `knowledge/` zone → object table + embedded chunks (`fcc_gold.knowledge_chunks`) for VECTOR_SEARCH.
  * Decisions / audit from the cockpit's SQLite `audit.db` → `bronze/audit/*.jsonl` → `fcc_gold.decisions_audit`.

Layout (ISA-95 keys so a real site/unit/source slots in without schema changes):
  gs://<bucket>/bronze/historian/source=simulator/site=demo-refinery/area=fcc-complex/batch=<batch>/run=<run>/minute.parquet
  gs://<bucket>/bronze/{lims,assay,events}/… · bronze/audit/ · bronze/_manifests/<batch>.json
  gs://<bucket>/knowledge/<doc_type>/<DOC-ID>.md · models/<batch>/… · _schemas/*.json · silver/ · gold/

Idempotent: every run is loaded as DELETE … WHERE run_id THEN INSERT (silver) — rerun as the Octave batch finishes.
Partial runs load with run_status='partial' and are replaced when complete.

Usage (from repo root, API venv has pyarrow + pandas):
  cockpit/api/.venv/bin/python sim_octave/lakehouse/load_lakehouse.py --batch full_v1 [--runs random_s107,…] [--dry-run]
      [--skip-bronze] [--skip-silver] [--skip-gold] [--skip-knowledge] [--skip-audit] [--skip-models] [--status]
Shells out to `gcloud storage` and `bq` (labels datacloud:jetski on every job/resource).
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import pathlib
import re
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import time

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parents[1]
API_DIR = REPO / "cockpit" / "api"
sys.path.insert(0, str(API_DIR))

PROJECT = os.environ.get("FCC_GCP_PROJECT", "fcc-soft-sensor")
LOCATION = os.environ.get("FCC_GCP_LOCATION", "us-central1")
BUCKET = os.environ.get("FCC_GCS_BUCKET", "fcc-soft-sensor-sim-data")
CONNECTION = f"{PROJECT}.{LOCATION}.fcc-lake"
LABEL = "datacloud:jetski"
SITE, AREA, SOURCE = "demo-refinery", "fcc-complex", "simulator"
START_TS = dt.datetime(2026, 9, 1, 0, 0, 0, tzinfo=dt.timezone.utc)   # synthetic clock: minute 0 of every run
EXPECTED_MIN = 1600
BRONZE, SILVER, GOLD = "fcc_bronze", "fcc_silver", "fcc_gold"
UNITS = ["unit_1_furnace", "unit_2_riser", "unit_3_regenerator", "unit_4_fractionator", "unit_5_condenser", "unit_6_stabiliser"]
META_COLS = {"time_min", "lab_sample", "crude_id", "event_code", "cutpoint_auto"}


# ----------------------------------------------------------------------------------------------------- shell helpers
def sh(cmd: list[str], dry: bool, capture: bool = False, check: bool = True) -> str:
    print("  $", " ".join(c if " " not in c else repr(c) for c in cmd)[:400], flush=True)
    if dry:
        return ""
    env = {**os.environ, "CLOUDSDK_METRICS_ENVIRONMENT": (os.environ.get("CLOUDSDK_METRICS_ENVIRONMENT", "") + " datacloud.jetski").strip()}
    r = subprocess.run(cmd, text=True, capture_output=True, env=env)
    if r.returncode and check:
        print(r.stdout[-2000:], r.stderr[-2000:], file=sys.stderr)
        raise SystemExit(f"command failed ({r.returncode}): {cmd[0]} {cmd[1] if len(cmd) > 1 else ''}")
    return (r.stdout or "") if capture else ""


def bq_query(sql: str, dry: bool, label_extra: str | None = None) -> str:
    cmd = ["bq", "--location=" + LOCATION, "--project_id=" + PROJECT, "query", "--use_legacy_sql=false", "--quiet", "--format=json",
           "--label", LABEL]
    if label_extra:
        cmd += ["--label", label_extra]
    cmd.append(sql)
    return sh(cmd, dry, capture=True)


def gcs_cp(src: pathlib.Path, dst: str, dry: bool, recursive: bool = False) -> None:
    cmd = ["gcloud", "storage", "cp", "--quiet"] + (["-r"] if recursive else []) + [str(src), dst]
    sh(cmd, dry)


def gcs_write_text(text: str, dst: str, dry: bool) -> None:
    with tempfile.NamedTemporaryFile("w", suffix=pathlib.Path(dst).suffix, delete=False) as f:
        f.write(text)
    gcs_cp(pathlib.Path(f.name), dst, dry)
    os.unlink(f.name)


# ------------------------------------------------------------------------------------------------- tag registry (meta)
def tag_registry(columns: list[str]) -> pd.DataFrame:
    """tag_id → unit_id, label, engineering unit, group. Uses the API's catalog + workbench maps so the lakehouse and
    the cockpit agree; tags no unit claims fall to the complex level (unit_id='fcc-complex')."""
    from app.data.catalog import tag_meta                       # noqa: E402
    from app.engines.workbench import UNIT_TAGS                  # noqa: E402
    owner: dict[str, str] = {}
    for u, cfg in UNIT_TAGS.items():
        for grp in ("mv", "dist", "yield"):
            for t in cfg.get(grp, []):
                owner.setdefault(t, u)
        for tags in cfg.get("extra", {}).values():
            for t in tags:
                owner.setdefault(t, u)
    rules = [("T2_preheat_F", "unit_1_furnace"), ("T3_furnace_F", "unit_1_furnace"), ("F5_fuel", "unit_1_furnace"), ("F7", "unit_1_furnace"),
             ("Tr_riser_F", "unit_2_riser"), ("P4_reactor_psia", "unit_2_riser"), ("W_riser", "unit_2_riser"), ("conversion_pct", "unit_2_riser"),
             ("Treg_F", "unit_3_regenerator"), ("Tcyc_F", "unit_3_regenerator"), ("dT_cyc_reg_F", "unit_3_regenerator"), ("fluegas_", "unit_3_regenerator"),
             ("C_spent_cat", "unit_3_regenerator"), ("C_regen_cat", "unit_3_regenerator"), ("Fair", "unit_3_regenerator"), ("F_air", "unit_3_regenerator"),
             ("W_regen", "unit_3_regenerator"), ("P6_regen", "unit_3_regenerator"), ("F_coke", "unit_3_regenerator"), ("F_fluegas", "unit_3_regenerator"),
             ("T_tray", "unit_4_fractionator"), ("prod_", "unit_4_fractionator"), ("LCO_T98_F", "unit_4_fractionator"), ("HN_T98_F", "unit_4_fractionator"),
             ("SP_LCO_T98", "unit_4_fractionator"), ("SP_HN_T98", "unit_4_fractionator"), ("MV_PA", "unit_4_fractionator"), ("P5_frac", "unit_4_fractionator"),
             ("SP_P_frac", "unit_4_fractionator"), ("dP_reactor_frac", "unit_4_fractionator"),
             ("MV_cw_flow", "unit_5_condenser"), ("SP_T_overhead", "unit_5_condenser"), ("power_WGC", "unit_5_condenser"), ("SP_acc_level", "unit_5_condenser"),
             ("eff_C", "unit_6_stabiliser"), ("MV_reflux_ratio", "unit_6_stabiliser")]
    rows = []
    for c in columns:
        if c in META_COLS:
            continue
        m = tag_meta(c) or {"tag": c, "label": c.replace("_", " "), "unit": "-", "group": "reactor"}
        u = owner.get(c)
        if not u:
            for pre, uu in rules:
                if c.startswith(pre):
                    u = uu
                    break
        rows.append({"tag_id": c, "unit_id": u or "fcc-complex", "label": m["label"], "eng_unit": m["unit"], "tag_group": m["group"],
                     "is_setpoint": c.startswith("SP_"), "is_truth": c in ("LCO_T98_F", "HN_T98_F") or c.endswith("_dup") or c == "dist_condenser_eff",
                     "source_system": SOURCE})
    return pd.DataFrame(rows)


# -------------------------------------------------------------------------------------------------------- bronze
def _complex_to_real(df: pd.DataFrame) -> tuple[pd.DataFrame, int | None, int]:
    """Octave writes `a+bi` tokens once the fractionator tray model goes numerically invalid, which makes pandas read the
    whole CSV as text. Keep the real part where the imaginary part is exactly 0 (Octave prints every cell of a complex
    row in complex form), NULL any cell with a non-zero imaginary part, and report the first diverged minute."""
    from pandas.api.types import is_numeric_dtype
    text_cols = [c for c in df.columns if not is_numeric_dtype(df[c])]
    if not text_cols:
        return df, None, 0
    def parse(tok: str) -> complex:
        try:
            return complex(tok.replace("i", "j")) if tok.endswith("i") else complex(float(tok), 0.0)
        except (ValueError, TypeError):
            return complex(float("nan"), 0.0)
    out = df.copy()
    imag_any = pd.Series(False, index=df.index)
    for c in text_cols:
        z = df[c].astype(str).map(parse)
        real = z.map(lambda v: v.real).astype(float)
        imag = z.map(lambda v: v.imag).astype(float)
        bad = imag != 0
        real[bad] = float("nan")
        out[c] = real
        imag_any |= bad
    tmin = pd.to_numeric(out["time_min"], errors="coerce")
    first = int(tmin[imag_any].min()) if imag_any.any() else None
    return out, first, int(imag_any.sum())


def read_run(path: pathlib.Path) -> tuple[pd.DataFrame, dict]:
    df = pd.read_csv(path, low_memory=False)
    df, diverged_from, n_diverged = _complex_to_real(df)
    df = df.replace([float("inf"), float("-inf")], pd.NA)
    df["time_min"] = pd.to_numeric(df["time_min"], errors="coerce").astype("Int64")
    df = df.dropna(subset=["time_min"])
    return df, {"diverged_from_min": diverged_from, "diverged_rows": n_diverged}


def run_frame(df: pd.DataFrame, run_id: str, batch: str) -> pd.DataFrame:
    out = df.copy()
    out.insert(0, "ts", [START_TS + dt.timedelta(minutes=int(m)) for m in out["time_min"]])
    out.insert(0, "run_id", run_id)
    out.insert(1, "batch_id", batch)
    out.insert(2, "site_id", SITE)
    out.insert(3, "area_id", AREA)
    out.insert(4, "source_system", SOURCE)
    out["ts"] = pd.to_datetime(out["ts"], utc=True)
    return out


def stage_bronze(batch: str, runs: list[pathlib.Path], staged: pathlib.Path, work: pathlib.Path, dry: bool) -> dict:
    manifest = {"batch_id": batch, "site_id": SITE, "area_id": AREA, "source_system": SOURCE, "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
                "clock": {"minute_0": START_TS.isoformat(), "cadence_min": 1, "expected_minutes": EXPECTED_MIN}, "runs": []}
    base = f"gs://{BUCKET}/bronze/historian/source={SOURCE}/site={SITE}/area={AREA}/batch={batch}"
    columns: list[str] | None = None
    for p in runs:
        run_id = p.stem
        df, quality = read_run(p)
        columns = columns or [c for c in df.columns]
        # one Parquet schema for every run: time_min INT64, all other simulator columns FLOAT64
        for c in df.columns:
            if c != "time_min":
                df[c] = pd.to_numeric(df[c], errors="coerce").astype("float64")
        n = int(len(df))
        status = "complete" if n >= EXPECTED_MIN else "partial"
        if quality["diverged_from_min"] is not None:
            print(f"  ! {run_id}: Octave output complex-valued from minute {quality['diverged_from_min']} "
                  f"({quality['diverged_rows']} rows) — non-real cells loaded as NULL/MISSING", flush=True)
        frame = run_frame(df, run_id, batch)
        out_dir = work / "historian" / f"run={run_id}"
        out_dir.mkdir(parents=True, exist_ok=True)
        pq.write_table(pa.Table.from_pandas(frame, preserve_index=False), out_dir / "minute.parquet", compression="snappy")
        sha = hashlib.sha256(p.read_bytes()).hexdigest()[:16]
        manifest["runs"].append({"run_id": run_id, "rows": n, "run_status": status, "t_last_min": int(df["time_min"].max()),
                                 "diverged_from_min": quality["diverged_from_min"], "diverged_rows": quality["diverged_rows"],
                                 "csv_sha256_16": sha, "csv_bytes": p.stat().st_size,
                                 "parquet_uri": f"{base}/run={run_id}/minute.parquet", "csv_uri": f"{base}/run={run_id}/{p.name}"})
        gcs_cp(out_dir / "minute.parquet", f"{base}/run={run_id}/minute.parquet", dry)
        gcs_cp(p, f"{base}/run={run_id}/{p.name}", dry)
    # LIMS / assay side files (already staged by stage_regimes.py)
    for name, zone in (("lab_results.csv", "lims"), ("regimes.csv", "assay")):
        src = staged / name
        if src.exists():
            df = pd.read_csv(src)
            tbl = pa.Table.from_pandas(df, preserve_index=False)
            dst = work / zone / f"{name[:-4]}.parquet"
            dst.parent.mkdir(parents=True, exist_ok=True)
            pq.write_table(tbl, dst)
            gcs_cp(dst, f"gs://{BUCKET}/bronze/{zone}/source={SOURCE}/site={SITE}/batch={batch}/{name[:-4]}.parquet", dry)
            gcs_cp(src, f"gs://{BUCKET}/bronze/{zone}/source={SOURCE}/site={SITE}/batch={batch}/{name}", dry)
            manifest[zone] = {"rows": int(len(df)), "uri": f"gs://{BUCKET}/bronze/{zone}/source={SOURCE}/site={SITE}/batch={batch}/{name[:-4]}.parquet"}
    # events: scenario event_code transitions + crude switches, derived from the historian rows (bronze keeps the raw code)
    ev_rows = []
    for p in runs:
        df, _ = read_run(p)
        if "event_code" in df.columns:
            prev = None
            for t, code, crude in zip(df["time_min"], df["event_code"], df.get("crude_id", pd.Series([None] * len(df)))):
                code = None if pd.isna(code) else int(code)
                if code and code != prev:
                    ev_rows.append({"run_id": p.stem, "batch_id": batch, "time_min": int(t), "ts": START_TS + dt.timedelta(minutes=int(t)),
                                    "event_code": code, "crude_id": None if pd.isna(crude) else int(crude), "source_system": SOURCE})
                prev = code
    if ev_rows:
        ev = pd.DataFrame(ev_rows)
        ev["ts"] = pd.to_datetime(ev["ts"], utc=True)
        dst = work / "events" / "events.parquet"
        dst.parent.mkdir(parents=True, exist_ok=True)
        pq.write_table(pa.Table.from_pandas(ev, preserve_index=False), dst)
        gcs_cp(dst, f"gs://{BUCKET}/bronze/events/source={SOURCE}/site={SITE}/batch={batch}/events.parquet", dry)
        manifest["events"] = {"rows": int(len(ev))}
    # tag registry + schemas
    reg = tag_registry(columns or [])
    dst = work / "tag_registry.parquet"
    pq.write_table(pa.Table.from_pandas(reg, preserve_index=False), dst)
    gcs_cp(dst, f"gs://{BUCKET}/bronze/tag_registry/source={SOURCE}/tag_registry.parquet", dry)
    manifest["tag_registry"] = {"rows": int(len(reg)), "units": sorted(reg["unit_id"].unique().tolist())}
    manifest["columns"] = columns
    gcs_write_text(json.dumps(manifest, indent=1, default=str), f"gs://{BUCKET}/bronze/_manifests/{batch}.json", dry)
    (work / f"{batch}.manifest.json").write_text(json.dumps(manifest, indent=1, default=str))
    return manifest


# --------------------------------------------------------------------------------------------------------- bronze DDL
def bronze_tables(batch: str, dry: bool) -> None:
    hist = f"gs://{BUCKET}/bronze/historian/"
    sql = f"""
CREATE OR REPLACE EXTERNAL TABLE `{PROJECT}.{BRONZE}.historian_minute`
WITH PARTITION COLUMNS (source STRING, site STRING, area STRING, batch STRING, run STRING)
OPTIONS (format='PARQUET', uris=['{hist}*.parquet'], hive_partition_uri_prefix='{hist}',
         description='Bronze · as-received historian minute rows (Parquet, one file per run). Hive partitions source/site/area/batch/run. Labels: layer=bronze.');
CREATE OR REPLACE EXTERNAL TABLE `{PROJECT}.{BRONZE}.lab_results_raw`
WITH PARTITION COLUMNS (source STRING, site STRING, batch STRING)
OPTIONS (format='PARQUET', uris=['gs://{BUCKET}/bronze/lims/*.parquet'], hive_partition_uri_prefix='gs://{BUCKET}/bronze/lims/',
         description='Bronze · LIMS lab results as staged (run_id, time_min, crude_id, regime_id, LCO_T98_F, HN_T98_F).');
CREATE OR REPLACE EXTERNAL TABLE `{PROJECT}.{BRONZE}.crude_regimes_raw`
WITH PARTITION COLUMNS (source STRING, site STRING, batch STRING)
OPTIONS (format='PARQUET', uris=['gs://{BUCKET}/bronze/assay/*.parquet'], hive_partition_uri_prefix='gs://{BUCKET}/bronze/assay/',
         description='Bronze · crude regime schedule per run (R1 Heavy … R4 Light, 60-min ramps) as staged by stage_regimes.py.');
CREATE OR REPLACE EXTERNAL TABLE `{PROJECT}.{BRONZE}.events_raw`
WITH PARTITION COLUMNS (source STRING, site STRING, batch STRING)
OPTIONS (format='PARQUET', uris=['gs://{BUCKET}/bronze/events/*.parquet'], hive_partition_uri_prefix='gs://{BUCKET}/bronze/events/',
         description='Bronze · scenario events (event_code transitions, crude switches) derived from the historian rows.');
CREATE OR REPLACE EXTERNAL TABLE `{PROJECT}.{BRONZE}.tag_registry_raw`
OPTIONS (format='PARQUET', uris=['gs://{BUCKET}/bronze/tag_registry/*.parquet'],
         description='Bronze · tag registry (tag_id → unit_id, label, engineering unit, group) exported from the cockpit catalog.');
CREATE OR REPLACE EXTERNAL TABLE `{PROJECT}.{BRONZE}.knowledge_objects`
WITH CONNECTION `{CONNECTION}`
OPTIONS (object_metadata='SIMPLE', uris=['gs://{BUCKET}/knowledge/*'], metadata_cache_mode='AUTOMATIC', max_staleness=INTERVAL 1 HOUR,
         description='Bronze · object table over the knowledge zone (SOPs, incidents, MOC, IOW, lab methods, shift logs, work orders, references, reports, model cards).');
"""
    bq_query(sql, dry, "layer:bronze")


# --------------------------------------------------------------------------------------------------------- silver
def silver_tables(dry: bool) -> None:
    ice = lambda name: (f"WITH CONNECTION `{CONNECTION}` OPTIONS (file_format='PARQUET', table_format='ICEBERG', "
                        f"storage_uri='gs://{BUCKET}/silver/{name}'")
    sql = f"""
CREATE TABLE IF NOT EXISTS `{PROJECT}.{SILVER}.tag_minute` (
  ts TIMESTAMP OPTIONS(description='Synthetic UTC clock: minute 0 of every run = 2026-09-01T00:00Z (production: historian timestamp)'),
  dt DATE OPTIONS(description='DATE(ts) — clustering key (BigLake Iceberg tables cluster; native gold tables partition by dt)'),
  run_id STRING, batch_id STRING, site_id STRING, area_id STRING, unit_id STRING OPTIONS(description='ISA-95 unit owning the tag (unit_1_furnace … unit_6_stabiliser, or fcc-complex)'),
  tag_id STRING, time_min INT64, value FLOAT64, value_true FLOAT64 OPTIONS(description='Noise-free simulator truth where the simulator exposes it (*_dup twins, T98 truth); NULL in production'),
  eng_unit STRING, quality_flag STRING OPTIONS(description='GOOD | MISSING | TRUTH_ONLY — production adds OPC quality codes'),
  sample_count INT64 OPTIONS(description='Sub-minute samples aggregated into this minute (1 in the simulator; 60–600 from a real historian)'),
  source_system STRING)
CLUSTER BY run_id, unit_id, tag_id, dt
{ice('tag_minute')}, description='Silver · long/narrow validated minute telemetry (one row per tag per minute). BigLake Iceberg — files live in GCS.');
CREATE TABLE IF NOT EXISTS `{PROJECT}.{SILVER}.telemetry_minute` (
  ts TIMESTAMP, dt DATE, run_id STRING, batch_id STRING, site_id STRING, area_id STRING, time_min INT64, payload STRING OPTIONS(description='All 112 simulator columns for the minute as a JSON-encoded string (Iceberg has no JSON type; use JSON_VALUE(payload, "$.tag") or PARSE_JSON). Wide record kept for ML feature building'),
  source_system STRING)
CLUSTER BY run_id, dt
{ice('telemetry_minute')}, description='Silver · wide minute record (JSON payload) — the ML/feature path; tag_minute is the analytics path.');
CREATE TABLE IF NOT EXISTS `{PROJECT}.{SILVER}.lab_results` (
  ts TIMESTAMP, dt DATE, run_id STRING, batch_id STRING, site_id STRING, unit_id STRING, time_min INT64, sample_id STRING,
  property STRING OPTIONS(description='LCO_T98_F | HN_T98_F'), value FLOAT64, eng_unit STRING, crude_id INT64, regime_id STRING, method STRING, source_system STRING)
CLUSTER BY run_id, property, dt
{ice('lab_results')}, description='Silver · LIMS results aligned to the run clock (ASTM D86 T98 of LCO / HN; ~1 per 8 h in the simulator).');
CREATE TABLE IF NOT EXISTS `{PROJECT}.{SILVER}.crude_assay_registry` (
  run_id STRING, batch_id STRING, site_id STRING, crude_id INT64, regime_id STRING, regime_label STRING, api_target FLOAT64,
  t_start_min INT64, t_end_min INT64, transition_start_min INT64, transition_end_min INT64, ramp_min INT64, transition_complete BOOL, n_minutes INT64, n_labs INT64, source_system STRING)
CLUSTER BY run_id
{ice('crude_assay_registry')}, description='Silver · crude slate per run segment (declared regime R1 Heavy / R2 Medium-heavy / R3 Base / R4 Light with 60-min ramps).');
CREATE TABLE IF NOT EXISTS `{PROJECT}.{SILVER}.events` (
  ts TIMESTAMP, dt DATE, run_id STRING, batch_id STRING, site_id STRING, time_min INT64, event_code INT64, event_kind STRING, crude_id INT64, source_system STRING)
CLUSTER BY run_id, dt
{ice('events')}, description='Silver · process / scenario events on the run clock (crude switch, set-point moves, disturbances).');
CREATE TABLE IF NOT EXISTS `{PROJECT}.{SILVER}.tag_registry` (
  tag_id STRING, unit_id STRING, label STRING, eng_unit STRING, tag_group STRING, is_setpoint BOOL, is_truth BOOL, source_system STRING)
{ice('tag_registry')}, description='Silver · tag → unit / label / engineering unit / group (the data contract the cockpit and Gemini use).');
CREATE TABLE IF NOT EXISTS `{PROJECT}.{SILVER}.run_registry` (
  run_id STRING, batch_id STRING, site_id STRING, run_status STRING OPTIONS(description='complete | partial'), rows_loaded INT64, t_last_min INT64,
  expected_minutes INT64, csv_sha256_16 STRING, loaded_at TIMESTAMP, source_system STRING)
CLUSTER BY run_id
{ice('run_registry')}, description='Silver · which runs are in the lake, how complete they are and when they were loaded (idempotent reload key).');
ALTER TABLE `{PROJECT}.{SILVER}.run_registry` ADD COLUMN IF NOT EXISTS diverged_from_min INT64 OPTIONS(description='First minute at which the Octave fractionator model produced complex-valued (physically invalid) output; NULL = run stayed real-valued. Cells with a non-zero imaginary part are loaded as NULL / MISSING.');
ALTER TABLE `{PROJECT}.{SILVER}.run_registry` ADD COLUMN IF NOT EXISTS diverged_rows INT64 OPTIONS(description='Number of minutes with at least one complex-valued cell.');
"""
    bq_query(sql, dry, "layer:silver")


def silver_load(manifest: dict, dry: bool) -> None:
    batch = manifest["batch_id"]
    run_ids = [r["run_id"] for r in manifest["runs"]]
    cols = [c for c in manifest["columns"] if c not in META_COLS]
    in_list = ", ".join(f"'{r}'" for r in run_ids)
    # UNPIVOT the wide bronze rows into tag_minute; *_dup twins become value_true of their base tag, T98 truths flagged.
    unpivot_cols = ", ".join(f"CAST({c} AS FLOAT64) AS {c}" for c in cols)
    sql = f"""
DECLARE runs ARRAY<STRING> DEFAULT [{in_list}];
DELETE FROM `{PROJECT}.{SILVER}.tag_minute` WHERE run_id IN UNNEST(runs);
DELETE FROM `{PROJECT}.{SILVER}.telemetry_minute` WHERE run_id IN UNNEST(runs);
DELETE FROM `{PROJECT}.{SILVER}.events` WHERE run_id IN UNNEST(runs);
DELETE FROM `{PROJECT}.{SILVER}.lab_results` WHERE run_id IN UNNEST(runs);
DELETE FROM `{PROJECT}.{SILVER}.crude_assay_registry` WHERE run_id IN UNNEST(runs);
DELETE FROM `{PROJECT}.{SILVER}.run_registry` WHERE run_id IN UNNEST(runs);
DELETE FROM `{PROJECT}.{SILVER}.tag_registry` WHERE TRUE;

INSERT INTO `{PROJECT}.{SILVER}.tag_registry`
SELECT tag_id, unit_id, label, eng_unit, tag_group, is_setpoint, is_truth, source_system FROM `{PROJECT}.{BRONZE}.tag_registry_raw`;

INSERT INTO `{PROJECT}.{SILVER}.tag_minute`
WITH wide AS (
  SELECT ts, run_id, batch_id, site_id, area_id, source_system, time_min, {unpivot_cols}
  FROM `{PROJECT}.{BRONZE}.historian_minute` WHERE batch = '{batch}' AND run_id IN UNNEST(runs)),
longf AS (
  SELECT ts, run_id, batch_id, site_id, area_id, source_system, time_min, tag_id, value
  FROM wide UNPIVOT INCLUDE NULLS (value FOR tag_id IN ({", ".join(cols)}))),
base AS (SELECT * FROM longf WHERE NOT ENDS_WITH(tag_id, '_dup')),
dups AS (SELECT run_id, time_min, REGEXP_REPLACE(tag_id, '_dup$', '') AS dup_base, value AS value_true FROM longf WHERE ENDS_WITH(tag_id, '_dup')),
twin AS (SELECT 'T2_preheat_F' AS tag_id, 'T2' AS dup_base UNION ALL SELECT 'Tr_riser_F', 'Tr' UNION ALL SELECT 'Treg_F', 'Treg'
         UNION ALL SELECT 'P5_frac_psia', 'P5' UNION ALL SELECT 'P6_regen_psia', 'P6')
SELECT b.ts, DATE(b.ts) AS dt, b.run_id, b.batch_id, b.site_id, b.area_id, COALESCE(r.unit_id, 'fcc-complex') AS unit_id, b.tag_id, b.time_min,
       CASE WHEN b.tag_id IN ('LCO_T98_F','HN_T98_F') THEN NULL ELSE b.value END AS value,
       CASE WHEN b.tag_id IN ('LCO_T98_F','HN_T98_F') THEN b.value ELSE d.value_true END AS value_true,
       r.eng_unit,
       CASE WHEN b.tag_id IN ('LCO_T98_F','HN_T98_F') THEN 'TRUTH_ONLY' WHEN b.value IS NULL THEN 'MISSING' ELSE 'GOOD' END AS quality_flag,
       1 AS sample_count, b.source_system
FROM base b LEFT JOIN `{PROJECT}.{SILVER}.tag_registry` r USING (tag_id)
LEFT JOIN twin w ON w.tag_id = b.tag_id
LEFT JOIN dups d ON d.run_id = b.run_id AND d.time_min = b.time_min AND d.dup_base = w.dup_base;

INSERT INTO `{PROJECT}.{SILVER}.telemetry_minute`
SELECT h.ts, DATE(h.ts) AS dt, h.run_id, h.batch_id, h.site_id, h.area_id, h.time_min,
       TO_JSON_STRING((SELECT AS STRUCT h.* EXCEPT(ts, run_id, batch_id, site_id, area_id, source_system, source, site, area, batch, run))) AS payload,
       h.source_system
FROM `{PROJECT}.{BRONZE}.historian_minute` h WHERE h.batch = '{batch}' AND h.run_id IN UNNEST(runs);

INSERT INTO `{PROJECT}.{SILVER}.events`
SELECT ts, DATE(ts), run_id, batch_id, '{SITE}', time_min, event_code,
       CASE event_code WHEN 1 THEN 'crude_switch' WHEN 2 THEN 'setpoint_move' WHEN 3 THEN 'disturbance' ELSE CONCAT('event_', CAST(event_code AS STRING)) END,
       crude_id, source_system
FROM `{PROJECT}.{BRONZE}.events_raw` WHERE batch = '{batch}' AND run_id IN UNNEST(runs);

INSERT INTO `{PROJECT}.{SILVER}.lab_results`
SELECT TIMESTAMP_ADD(TIMESTAMP '{START_TS.isoformat()}', INTERVAL CAST(time_min AS INT64) MINUTE) AS ts,
       DATE(TIMESTAMP_ADD(TIMESTAMP '{START_TS.isoformat()}', INTERVAL CAST(time_min AS INT64) MINUTE)) AS dt,
       run_id, '{batch}', '{SITE}', 'unit_4_fractionator', CAST(time_min AS INT64),
       CONCAT(run_id, '-', CAST(CAST(time_min AS INT64) AS STRING), '-', p.property) AS sample_id, p.property, p.value, '°F',
       SAFE_CAST(crude_id AS INT64), regime_id, 'ASTM D86 (simulated)', '{SOURCE}'
FROM `{PROJECT}.{BRONZE}.lab_results_raw`, UNNEST([STRUCT('LCO_T98_F' AS property, LCO_T98_F AS value), STRUCT('HN_T98_F', HN_T98_F)]) p
WHERE batch = '{batch}' AND run_id IN UNNEST(runs);

INSERT INTO `{PROJECT}.{SILVER}.crude_assay_registry`
SELECT run_id, batch_id, '{SITE}', SAFE_CAST(crude_id AS INT64), regime_id, regime_label, api_target, SAFE_CAST(t_start_min AS INT64), SAFE_CAST(t_end_min AS INT64),
       SAFE_CAST(transition_start_min AS INT64), SAFE_CAST(transition_end_min AS INT64), SAFE_CAST(ramp_min AS INT64), transition_complete, SAFE_CAST(n_minutes AS INT64), SAFE_CAST(n_labs AS INT64), '{SOURCE}'
FROM `{PROJECT}.{BRONZE}.crude_regimes_raw` WHERE batch = '{batch}' AND run_id IN UNNEST(runs);

INSERT INTO `{PROJECT}.{SILVER}.run_registry` (run_id, batch_id, site_id, run_status, rows_loaded, t_last_min, expected_minutes, csv_sha256_16, loaded_at, source_system, diverged_from_min, diverged_rows)
SELECT run_id, batch_id, '{SITE}', run_status, n_rows, t_last_min, {EXPECTED_MIN}, csv_sha256_16, CURRENT_TIMESTAMP(), '{SOURCE}', diverged_from_min, diverged_rows
FROM UNNEST([{", ".join(f"STRUCT('{r['run_id']}' AS run_id, '{batch}' AS batch_id, '{r['run_status']}' AS run_status, {r['rows']} AS n_rows, {r['t_last_min']} AS t_last_min, '{r['csv_sha256_16']}' AS csv_sha256_16, {('NULL' if r.get('diverged_from_min') is None else r['diverged_from_min'])} AS diverged_from_min, {r.get('diverged_rows') or 0} AS diverged_rows)" for r in manifest['runs'])}]);
"""
    bq_query(sql, dry, "layer:silver")


# ----------------------------------------------------------------------------------------------------------- gold
def gold_tables(dry: bool) -> None:
    sql = f"""
CREATE OR REPLACE TABLE `{PROJECT}.{GOLD}.unit_kpi_minute`
PARTITION BY dt CLUSTER BY run_id, unit_id
OPTIONS (description='Gold · headline KPI per unit per minute (the number on each L0 tile) with the plan set point where one exists.', labels=[('datacloud','jetski'),('layer','gold')]) AS
WITH kpi AS (
  SELECT 'unit_1_furnace' AS unit_id, 'T2_preheat_F' AS tag_id, 'SP_T_preheat_F' AS plan_tag UNION ALL
  SELECT 'unit_2_riser', 'conversion_pct', NULL UNION ALL
  SELECT 'unit_3_regenerator', 'dT_cyc_reg_F', NULL UNION ALL
  SELECT 'unit_4_fractionator', 'LCO_T98_F', 'SP_LCO_T98' UNION ALL
  SELECT 'unit_5_condenser', 'MV_cw_flow', NULL UNION ALL
  SELECT 'unit_6_stabiliser', 'eff_C5', NULL)
SELECT m.ts, m.dt, m.run_id, m.batch_id, m.site_id, k.unit_id, m.time_min, k.tag_id, COALESCE(m.value, m.value_true) AS value, m.value_true, m.eng_unit,
       p.value AS plan_value, COALESCE(m.value, m.value_true) - p.value AS delta_vs_plan, m.source_system
FROM `{PROJECT}.{SILVER}.tag_minute` m JOIN kpi k ON m.tag_id = k.tag_id
LEFT JOIN `{PROJECT}.{SILVER}.tag_minute` p ON p.run_id = m.run_id AND p.time_min = m.time_min AND p.tag_id = k.plan_tag;

CREATE OR REPLACE TABLE `{PROJECT}.{GOLD}.lab_alignment`
PARTITION BY dt CLUSTER BY run_id, property
OPTIONS (description='Gold · every lab result next to the simulator truth and the plan set point at the sample minute (the lab-vs-soft-sensor panel).', labels=[('datacloud','jetski'),('layer','gold')]) AS
SELECT l.ts, l.dt, l.run_id, l.batch_id, l.unit_id, l.time_min, l.sample_id, l.property, l.value AS lab_value, t.value_true AS truth_at_sample,
       sp.value AS plan_value, l.value - sp.value AS lab_minus_plan, l.crude_id, l.regime_id, l.method
FROM `{PROJECT}.{SILVER}.lab_results` l
LEFT JOIN `{PROJECT}.{SILVER}.tag_minute` t ON t.run_id = l.run_id AND t.time_min = l.time_min AND t.tag_id = l.property
LEFT JOIN `{PROJECT}.{SILVER}.tag_minute` sp ON sp.run_id = l.run_id AND sp.time_min = l.time_min AND sp.tag_id = IF(l.property = 'LCO_T98_F', 'SP_LCO_T98', 'SP_HN_T98');

CREATE OR REPLACE VIEW `{PROJECT}.{GOLD}.v_run_coverage`
OPTIONS (description='Gold · run completeness: rows, minutes, labs, regimes, events per run (what the footer provenance line reads).') AS
SELECT r.run_id, r.batch_id, r.run_status, r.rows_loaded, r.t_last_min, r.expected_minutes, r.loaded_at, r.diverged_from_min, r.diverged_rows,
       IF(r.diverged_from_min IS NULL, r.t_last_min, r.diverged_from_min - 1) AS valid_until_min,
       (SELECT COUNT(*) FROM `{PROJECT}.{SILVER}.lab_results` l WHERE l.run_id = r.run_id) AS n_labs,
       (SELECT COUNT(*) FROM `{PROJECT}.{SILVER}.crude_assay_registry` c WHERE c.run_id = r.run_id) AS n_regime_segments,
       (SELECT COUNT(*) FROM `{PROJECT}.{SILVER}.events` e WHERE e.run_id = r.run_id) AS n_events
FROM `{PROJECT}.{SILVER}.run_registry` r;

CREATE OR REPLACE VIEW `{PROJECT}.{GOLD}.v_crude_switches`
OPTIONS (description='Gold · declared crude switches per run with the ramp window (R-from → R-to, switch minute, transition complete).') AS
SELECT run_id, batch_id, regime_id, regime_label, api_target, t_start_min, transition_start_min, transition_end_min, ramp_min, transition_complete,
       LAG(regime_id) OVER (PARTITION BY run_id ORDER BY t_start_min) AS regime_from
FROM `{PROJECT}.{SILVER}.crude_assay_registry`;

CREATE OR REPLACE VIEW `{PROJECT}.{GOLD}.v_mass_balance`
OPTIONS (description='Gold · plant mass closure per minute (mass_balance_err_pct) — the trust number in the L0 footer.') AS
SELECT run_id, time_min, ts, value AS mass_balance_err_pct FROM `{PROJECT}.{SILVER}.tag_minute` WHERE tag_id = 'mass_balance_err_pct';
"""
    bq_query(sql, dry, "layer:gold")


# ------------------------------------------------------------------------------------------------------- knowledge
def knowledge_zone(dry: bool, work: pathlib.Path, embed: bool = True) -> dict:
    from app.knowledge.index import chunk_doc, parse_front   # noqa: E402
    root = REPO / "knowledge" / "corpus"
    rows, n_docs = [], 0
    for p in sorted(root.rglob("*.md")):
        text = p.read_text(encoding="utf-8")
        meta, body = parse_front(text)
        did = meta.get("doc_id") or p.stem
        meta.setdefault("doc_id", did)
        dtype = (meta.get("doc_type") or did.split("-")[0]).lower()
        rel = p.relative_to(root)
        uri = f"gs://{BUCKET}/knowledge/{rel.parent.as_posix()}/{p.name}"
        gcs_cp(p, uri, dry)
        n_docs += 1
        for i, c in enumerate(chunk_doc(meta, body)):
            rows.append({"chunk_id": f"{did}#{c['section'] or i}", "doc_id": did, "doc_type": dtype, "revision": str(c.get("revision") or ""),
                         "title": c["title"], "section": c["section"], "section_title": c["section_title"], "text": c["text"],
                         "n_chars": len(c["text"]), "uri": uri, "effective_date": str(meta.get("effective_date") or meta.get("date") or ""),
                         "tags": ",".join(meta.get("tags", [])) if isinstance(meta.get("tags"), list) else str(meta.get("tags") or ""),
                         "source_system": "knowledge-corpus"})
    # repo documentation that explains the system (architecture, BDD/SDD, data flow) → knowledge/documentation
    for name in ("data_and_analytics_flow.md", "BDD.md", "SDD.md", "DECISIONS.md", "refinery_optimisation.md", "demoflow.md"):
        p = REPO / name
        if p.exists():
            gcs_cp(p, f"gs://{BUCKET}/knowledge/documentation/{name}", dry)
            n_docs += 1
    df = pd.DataFrame(rows)
    out = work / "knowledge_chunks.parquet"
    pq.write_table(pa.Table.from_pandas(df, preserve_index=False), out)
    gcs_cp(out, f"gs://{BUCKET}/gold/knowledge_chunks/knowledge_chunks.parquet", dry)
    sh(["bq", "--location=" + LOCATION, "--project_id=" + PROJECT, "load", "--replace", "--source_format=PARQUET", "--label", LABEL, "--label", "layer:gold",
        f"{GOLD}.knowledge_chunks_text", f"gs://{BUCKET}/gold/knowledge_chunks/knowledge_chunks.parquet"], dry)
    sql = f"""
CREATE MODEL IF NOT EXISTS `{PROJECT}.{GOLD}.text_embedding`
REMOTE WITH CONNECTION `{CONNECTION}` OPTIONS (ENDPOINT = 'text-embedding-005');
"""
    if embed:
        sql += f"""
CREATE OR REPLACE TABLE `{PROJECT}.{GOLD}.knowledge_chunks`
OPTIONS (description='Gold · section-level chunks of every knowledge document with a Vertex text-embedding-005 vector; query with VECTOR_SEARCH. Cite as [doc_id rN §section].', labels=[('datacloud','jetski'),('layer','gold'),('kind','rag')]) AS
SELECT * EXCEPT(ml_generate_embedding_status, ml_generate_embedding_statistics), ml_generate_embedding_result AS embedding, 'text-embedding-005' AS embedding_model
FROM ML.GENERATE_EMBEDDING(MODEL `{PROJECT}.{GOLD}.text_embedding`,
     (SELECT *, CONCAT(title, ' — ', section_title, '\\n', text) AS content FROM `{PROJECT}.{GOLD}.knowledge_chunks_text`),
     STRUCT(TRUE AS flatten_json_output, 'RETRIEVAL_DOCUMENT' AS task_type));
"""
    bq_query(sql, dry, "layer:gold")
    return {"docs": n_docs, "chunks": int(len(df))}


# ----------------------------------------------------------------------------------------------------------- audit
def audit_zone(dry: bool, work: pathlib.Path) -> dict:
    db = API_DIR / "artifacts" / "audit.db"
    if not db.exists():
        return {"audit": 0, "decisions": 0, "agent_events": 0}
    con = sqlite3.connect(db)
    out = {}
    for table, gold_name in (("audit", "audit_events"), ("decisions", "decisions_audit"), ("agent_events", "agent_events")):
        try:
            df = pd.read_sql_query(f"SELECT * FROM {table}", con)
        except Exception:  # noqa: BLE001
            continue
        for c in df.columns:
            if df[c].dtype == object:
                df[c] = df[c].astype("string")
        df["exported_at"] = pd.Timestamp.now(tz="UTC")
        df["source_system"] = "cockpit-audit-db"
        p = work / f"{table}.jsonl"
        df.to_json(p, orient="records", lines=True, date_format="iso")
        gcs_cp(p, f"gs://{BUCKET}/bronze/audit/{table}/{dt.date.today().isoformat()}/{table}.jsonl", dry)
        sh(["bq", "--location=" + LOCATION, "--project_id=" + PROJECT, "load", "--replace", "--autodetect", "--source_format=NEWLINE_DELIMITED_JSON",
            "--label", LABEL, "--label", "layer:gold", f"{GOLD}.{gold_name}", f"gs://{BUCKET}/bronze/audit/{table}/{dt.date.today().isoformat()}/{table}.jsonl"], dry)
        out[table] = int(len(df))
    return out


# ---------------------------------------------------------------------------------------------------------- models
def models_zone(dry: bool, work: pathlib.Path, batch: str) -> dict:
    art = API_DIR / "artifacts"
    bundle = art / "bundle.json"
    if not bundle.exists():
        return {"models": 0}
    b = json.loads(bundle.read_text())
    gcs_cp(bundle, f"gs://{BUCKET}/models/{batch}/bundle.json", dry)
    if (art / "models").exists():
        gcs_cp(art / "models", f"gs://{BUCKET}/models/{batch}/", dry, recursive=True)
    rows = []
    for prop, card in (b.get("cards") or {}).items():
        members = card.get("members") or card.get("committee") or {}
        if isinstance(members, dict):
            for name, mm in members.items():
                rows.append({"property": prop, "member": name, "trained_at": b.get("trained_at"), "mode": b.get("mode"), "loro": bool(b.get("loro")),
                             "train_runs": len(b.get("train_runs") or []), "test_runs": len(b.get("test_runs") or []),
                             "card_json": json.dumps(mm, default=str)[:20000], "bundle_uri": f"gs://{BUCKET}/models/{batch}/bundle.json"})
        else:
            rows.append({"property": prop, "member": "committee", "trained_at": b.get("trained_at"), "mode": b.get("mode"), "loro": bool(b.get("loro")),
                         "train_runs": len(b.get("train_runs") or []), "test_runs": len(b.get("test_runs") or []),
                         "card_json": json.dumps(card, default=str)[:20000], "bundle_uri": f"gs://{BUCKET}/models/{batch}/bundle.json"})
    if not rows:
        rows.append({"property": "bundle", "member": "bundle", "trained_at": b.get("trained_at"), "mode": b.get("mode"), "loro": bool(b.get("loro")),
                     "train_runs": len(b.get("train_runs") or []), "test_runs": len(b.get("test_runs") or []),
                     "card_json": json.dumps({k: b[k] for k in ("evaluation", "gains", "note") if k in b}, default=str)[:20000],
                     "bundle_uri": f"gs://{BUCKET}/models/{batch}/bundle.json"})
    df = pd.DataFrame(rows)
    df["registered_at"] = pd.Timestamp.now(tz="UTC")
    p = work / "model_registry.jsonl"
    df.to_json(p, orient="records", lines=True, date_format="iso")
    gcs_cp(p, f"gs://{BUCKET}/gold/model_registry/model_registry.jsonl", dry)
    sh(["bq", "--location=" + LOCATION, "--project_id=" + PROJECT, "load", "--replace", "--autodetect", "--source_format=NEWLINE_DELIMITED_JSON",
        "--label", LABEL, "--label", "layer:gold", f"{GOLD}.model_registry", f"gs://{BUCKET}/gold/model_registry/model_registry.jsonl"], dry)
    return {"models": int(len(df))}


# --------------------------------------------------------------------------------------------------------- schemas
def schemas_zone(dry: bool, work: pathlib.Path) -> None:
    readme = {
        "bronze": "Immutable landing. As-received files (CSV + Parquet) with Hive keys source=/site=/area=/batch=/run=. Never updated in place; reloads add a new batch or run folder. Exposed as external tables fcc_bronze.* (historian_minute, lab_results_raw, crude_regimes_raw, events_raw, tag_registry_raw) and the object table knowledge_objects.",
        "knowledge": "Unstructured context: sop/ incidents/ moc/ iow/ lab/ shift_logs/ work_orders/ references/ documentation/ model_cards/ reports/. Exposed as the object table fcc_bronze.knowledge_objects and embedded into fcc_gold.knowledge_chunks.",
        "silver": "BigLake Iceberg tables managed by BigQuery (fcc_silver.*). Do not write here directly — DML through BigQuery only.",
        "gold": "Serving layer files (knowledge chunks, model registry) + BigQuery-native gold tables/views (fcc_gold.*).",
        "models": "Model bundles (bundle.json, pickled committee members, lags.json) per training batch; registered in fcc_gold.model_registry.",
        "_schemas": "JSON data contracts for the silver tables (tag_minute, lab_results, crude_assay_registry, events, run_registry, tag_registry).",
    }
    for zone, text in readme.items():
        gcs_write_text(f"# {zone}\n\n{text}\n", f"gs://{BUCKET}/{zone}/_README.md", dry)
    contracts = {
        "tag_minute": {"grain": "1 row per tag per minute", "keys": ["run_id", "tag_id", "time_min"], "partition": "dt", "cluster": ["run_id", "unit_id", "tag_id"],
                        "columns": {"ts": "TIMESTAMP", "dt": "DATE", "run_id": "STRING", "batch_id": "STRING", "site_id": "STRING", "area_id": "STRING", "unit_id": "STRING",
                                    "tag_id": "STRING", "time_min": "INT64", "value": "FLOAT64", "value_true": "FLOAT64", "eng_unit": "STRING", "quality_flag": "GOOD|MISSING|TRUTH_ONLY",
                                    "sample_count": "INT64", "source_system": "STRING"}},
        "lab_results": {"grain": "1 row per lab sample per property", "keys": ["sample_id"], "partition": "dt", "cluster": ["run_id", "property"]},
        "crude_assay_registry": {"grain": "1 row per run per crude segment", "keys": ["run_id", "t_start_min"]},
        "events": {"grain": "1 row per event", "keys": ["run_id", "time_min", "event_code"]},
        "run_registry": {"grain": "1 row per run", "keys": ["run_id"], "run_status": ["complete", "partial"]},
        "tag_registry": {"grain": "1 row per tag", "keys": ["tag_id"]},
        "knowledge_chunks": {"grain": "1 row per document section", "keys": ["chunk_id"], "embedding": "text-embedding-005 (768-d), RETRIEVAL_DOCUMENT"},
        "decisions_audit": {"grain": "1 row per Accept/Decline", "keys": ["rec_id"]},
    }
    for name, c in contracts.items():
        gcs_write_text(json.dumps({"table": name, **c}, indent=1), f"gs://{BUCKET}/_schemas/{name}.json", dry)


# ----------------------------------------------------------------------------------------------------------- status
def status() -> None:
    """Row counts per lakehouse table — tolerant of zones that have not been loaded yet."""
    wanted = {
        SILVER: ["tag_minute", "telemetry_minute", "lab_results", "crude_assay_registry", "events", "run_registry", "tag_registry"],
        GOLD: ["unit_kpi_minute", "lab_alignment", "knowledge_chunks_text", "knowledge_chunks", "audit_events", "decisions_audit", "agent_events", "model_registry"],
    }
    parts = []
    for ds, names in wanted.items():
        existing = {r["table_name"] for r in json.loads(bq_query(
            f"SELECT table_name FROM `{PROJECT}.{ds}.INFORMATION_SCHEMA.TABLES` WHERE table_type <> 'VIEW'", dry=False) or "[]")}
        for n in names:
            if n in existing:
                key = {"tag_registry": "tag_id", "knowledge_chunks_text": "doc_id", "knowledge_chunks": "doc_id"}.get(
                    n, "run_id" if ds == SILVER or n in ("unit_kpi_minute", "lab_alignment") else None)
                second = f"COUNT(DISTINCT {key})" if key else "0"
                parts.append(f"SELECT '{ds}.{n}' AS t, COUNT(*) AS n, {second} AS k FROM `{PROJECT}.{ds}.{n}`")
            else:
                parts.append(f"SELECT '{ds}.{n}' AS t, NULL AS n, NULL AS k")
    rows = json.loads(bq_query(" UNION ALL ".join(parts) + " ORDER BY t", dry=False) or "[]")
    for r in rows:
        n = r.get("n")
        print(f"{r['t']:<40} rows={(n if n is not None else '— (not loaded)'):>16}  distinct={r.get('k') or ''}")


# ------------------------------------------------------------------------------------------------------------- main
def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--batch", default="full_v1")
    ap.add_argument("--in-dir", default=None, help="defaults to sim_octave/data/<batch>")
    ap.add_argument("--runs", default=None, help="comma-separated run_ids (default: all CSVs in the batch dir)")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--status", action="store_true", help="print row counts and exit")
    ap.add_argument("--no-embed", action="store_true", help="load knowledge chunks without calling the embedding model")
    for z in ("bronze", "silver", "gold", "knowledge", "audit", "models", "schemas"):
        ap.add_argument(f"--skip-{z}", action="store_true")
    a = ap.parse_args()
    if a.status:
        status()
        return
    in_dir = pathlib.Path(a.in_dir) if a.in_dir else HERE.parent / "data" / a.batch
    runs = sorted(p for p in in_dir.glob("*.csv") if p.stem.startswith("random_") or p.stem.startswith("crude_") or p.stem.startswith("scenario_"))
    if a.runs:
        keep = set(a.runs.split(","))
        runs = [p for p in runs if p.stem in keep]
    if not runs:
        raise SystemExit(f"no run CSVs under {in_dir}")
    work = pathlib.Path(tempfile.mkdtemp(prefix="lakehouse-"))
    t0 = time.time()
    print(f"lakehouse load · batch={a.batch} · {len(runs)} runs · work={work} · dry={a.dry_run}")
    summary: dict = {"batch": a.batch, "runs": len(runs)}
    try:
        if not a.skip_schemas:
            schemas_zone(a.dry_run, work)
        manifest = None
        if not a.skip_bronze:
            manifest = stage_bronze(a.batch, runs, in_dir / "_staged", work, a.dry_run)
            bronze_tables(a.batch, a.dry_run)
            summary["bronze"] = {"complete": sum(r["run_status"] == "complete" for r in manifest["runs"]), "partial": sum(r["run_status"] == "partial" for r in manifest["runs"])}
        if not a.skip_silver:
            if manifest is None:
                mp = work / f"{a.batch}.manifest.json"
                if not mp.exists():
                    raise SystemExit("--skip-bronze needs a manifest in the work dir; run bronze first")
                manifest = json.loads(mp.read_text())
            silver_tables(a.dry_run)
            silver_load(manifest, a.dry_run)
        if not a.skip_gold:
            gold_tables(a.dry_run)
        if not a.skip_knowledge:
            summary["knowledge"] = knowledge_zone(a.dry_run, work, embed=not a.no_embed)
        if not a.skip_audit:
            summary["audit"] = audit_zone(a.dry_run, work)
        if not a.skip_models:
            summary["models"] = models_zone(a.dry_run, work, a.batch)
        summary["seconds"] = round(time.time() - t0, 1)
        print("done", json.dumps(summary))
    finally:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    main()
