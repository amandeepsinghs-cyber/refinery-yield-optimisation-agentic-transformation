#!/usr/bin/env python3
"""Load FCC simulator CSVs into BigQuery via GCS.

For every <scenario>.csv in --in-dir:
  1. read the simulator output (one row per simulated minute),
  2. prepend run_id / batch_id / scenario / ts (synthetic timestamp) columns,
     replace NaN/Inf with NULL, and stage the result locally,
  3. upload the staged file to gs://<bucket>/fcc_sim/<batch_id>/<run_id>.csv,
  4. append it to the BigQuery table (created on first load, clustered by
     run_id, scenario).

Safe to re-run: run_ids already present in the table are skipped, and
incomplete runs (fewer than --expected-minutes rows) are skipped unless
--allow-partial is given. The script never deletes anything.

Stdlib only; shells out to `gcloud storage` and `bq`.

Example:
  python3 load_to_bq.py --in-dir data/sample_v1 --batch-id sample_v1 \
      --expected-minutes 180 --dry-run
"""

import argparse
import csv
import datetime as dt
import json
import math
import os
import pathlib
import re
import subprocess
import sys

DEFAULT_PROJECT = "fcc-soft-sensor"
DEFAULT_BUCKET = "fcc-soft-sensor-sim-data"
DEFAULT_TABLE = "fcc_soft_sensor.fcc_sim_minute"
META_COLS = [("run_id", "STRING"), ("batch_id", "STRING"),
             ("scenario", "STRING"), ("ts", "TIMESTAMP")]


def gcloud_env():
  env = dict(os.environ)
  prev = env.get("CLOUDSDK_METRICS_ENVIRONMENT")
  env["CLOUDSDK_METRICS_ENVIRONMENT"] = (
      f"{prev} datacloud.jetski" if prev else "datacloud.jetski")
  return env


def run(cmd, dry_run, capture=False):
  print("  $ " + " ".join(cmd))
  if dry_run:
    return ""
  res = subprocess.run(cmd, env=gcloud_env(), text=True,
                       capture_output=capture, check=True)
  return res.stdout if capture else ""


def loaded_run_ids(project, table):
  """Returns run_ids already in the table (empty set if table is missing)."""
  try:
    subprocess.run(["bq", "show", f"--project_id={project}", table],
                   env=gcloud_env(), capture_output=True, check=True)
  except subprocess.CalledProcessError:
    return set()
  out = subprocess.run(
      ["bq", "query", f"--project_id={project}", "--label=datacloud:jetski",
       "--use_legacy_sql=false", "--format=json", "--max_rows=100000",
       f"SELECT DISTINCT run_id FROM `{project}.{table}`"],
      env=gcloud_env(), capture_output=True, text=True, check=True).stdout
  return {r["run_id"] for r in json.loads(out or "[]")}


def clean(value):
  """Returns '' (NULL) for NaN/Inf/blank, else the value unchanged."""
  v = value.strip()
  if not v:
    return "", False
  try:
    f = float(v)
  except ValueError:
    return v, False
  if math.isnan(f) or math.isinf(f):
    return "", True
  return v, False


def stage(src, dst, run_id, batch_id, scenario, start):
  """Writes the tagged CSV; returns (header, n_rows, n_bad_values)."""
  n_rows = n_bad = 0
  with open(src, newline="") as fin, open(dst, "w", newline="") as fout:
    reader = csv.reader(fin)
    writer = csv.writer(fout)
    header = [h.strip() for h in next(reader)]
    writer.writerow([c for c, _ in META_COLS] + header)
    t_idx = header.index("time_min")
    for row in reader:
      if not row:
        continue
      cleaned = []
      for v in row:
        c, bad = clean(v)
        cleaned.append(c)
        n_bad += bad
      ts = start + dt.timedelta(minutes=float(cleaned[t_idx]))
      writer.writerow([run_id, batch_id, scenario,
                       ts.strftime("%Y-%m-%d %H:%M:%S UTC")] + cleaned)
      n_rows += 1
  return header, n_rows, n_bad


def main():
  p = argparse.ArgumentParser(description=__doc__,
                              formatter_class=argparse.RawDescriptionHelpFormatter)
  p.add_argument("--in-dir", required=True, help="folder of <scenario>.csv")
  p.add_argument("--batch-id", required=True, help="e.g. sample_v1, full_v1")
  p.add_argument("--project", default=DEFAULT_PROJECT)
  p.add_argument("--bucket", default=DEFAULT_BUCKET)
  p.add_argument("--table", default=DEFAULT_TABLE, help="dataset.table")
  p.add_argument("--start-ts", default="2026-09-01T00:00:00",
                 help="synthetic UTC timestamp of sim minute 0")
  p.add_argument("--expected-minutes", type=int, default=0,
                 help="skip runs with fewer rows than this (0 = no check)")
  p.add_argument("--allow-partial", action="store_true")
  p.add_argument("--dry-run", action="store_true",
                 help="stage files and print commands, upload nothing")
  a = p.parse_args()

  in_dir = pathlib.Path(a.in_dir)
  staged_dir = in_dir / "_staged"
  staged_dir.mkdir(exist_ok=True)
  start = dt.datetime.fromisoformat(a.start_ts)
  done = set() if a.dry_run else loaded_run_ids(a.project, a.table)

  summary = []
  for src in sorted(in_dir.glob("*.csv")):
    scenario = re.sub(r"_s\d+$", "", src.stem)
    run_id = f"{a.batch_id}_{src.stem}"
    print(f"\n== {run_id}")
    if run_id in done:
      print("  already in BigQuery, skipping")
      summary.append((run_id, "skipped (loaded)", 0, 0))
      continue
    dst = staged_dir / f"{run_id}.csv"
    header, n_rows, n_bad = stage(src, dst, run_id, a.batch_id, scenario, start)
    print(f"  rows={n_rows}  NaN/Inf->NULL={n_bad}")
    if n_rows == 0:
      summary.append((run_id, "skipped (empty)", 0, n_bad))
      continue
    if (a.expected_minutes and n_rows < a.expected_minutes
        and not a.allow_partial):
      print(f"  incomplete ({n_rows}/{a.expected_minutes}), skipping")
      summary.append((run_id, "skipped (incomplete)", n_rows, n_bad))
      continue

    schema = ",".join([f"{c}:{t}" for c, t in META_COLS] +
                      [f"{h}:FLOAT64" for h in header])
    gcs_uri = f"gs://{a.bucket}/fcc_sim/{a.batch_id}/{run_id}.csv"
    run(["gcloud", "storage", "cp", str(dst), gcs_uri,
         f"--project={a.project}"], a.dry_run)
    run(["bq", "load", f"--project_id={a.project}",
         "--label=datacloud:jetski", "--source_format=CSV",
         "--skip_leading_rows=1", "--clustering_fields=run_id,scenario",
         "--schema_update_option=ALLOW_FIELD_ADDITION", "--allow_jagged_rows",
         a.table, gcs_uri, schema], a.dry_run)
    summary.append((run_id, "dry-run" if a.dry_run else "loaded",
                    n_rows, n_bad))

  print("\nSUMMARY")
  for run_id, status, n_rows, n_bad in summary:
    print(f"  {run_id:40s} {status:22s} rows={n_rows:<7d} nulls={n_bad}")
  return 0


if __name__ == "__main__":
  sys.exit(main())
