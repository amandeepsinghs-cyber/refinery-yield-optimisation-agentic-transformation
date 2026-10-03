"""Pull the cockpit's serving inputs from the lake before the API starts (Cloud Run; owner, 3 Oct 2026 19:08:
"what is the point of putting data in BigQuery if we are not using it … it will fetch nothing from GCS?").

The container image holds code only. At start-up this script copies, from gs://$FCC_LAKE_BUCKET:
  * models/serving/$FCC_RELEASE/   -> $FCC_ARTIFACTS_DIR   (soft-sensor bundle, committee members, response-gain
                                                             engines, held-out evaluation, scored runs, decision-record seed)
  * knowledge/                     -> $FCC_KNOWLEDGE_DIR   (SOPs, incidents, MOC, IOW, lab methods, shift logs, work orders,
                                                             references + manifest.json; repo documentation excluded)
Run rows are NOT copied: the API reads them from BigQuery (fcc_silver.run_registry + telemetry_minute), and document
search runs in BigQuery (VECTOR_SEARCH over fcc_gold.knowledge_chunks).

Uses google-auth (already installed with the BigQuery client) against the GCS JSON API, so no extra dependency.
Exit code 1 if the release is missing, so Cloud Run never starts a cockpit without its models.
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.parse
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import google.auth
from google.auth.transport.requests import AuthorizedSession

API = "https://storage.googleapis.com/storage/v1/b/{bucket}/o"


def list_objects(sess: AuthorizedSession, bucket: str, prefix: str) -> list[dict]:
    out, token = [], None
    while True:
        params = {"prefix": prefix, "fields": "items(name,size,md5Hash),nextPageToken"}
        if token:
            params["pageToken"] = token
        r = sess.get(API.format(bucket=bucket), params=params, timeout=60)
        r.raise_for_status()
        j = r.json()
        out += j.get("items", [])
        token = j.get("nextPageToken")
        if not token:
            return out


def download(sess: AuthorizedSession, bucket: str, name: str, dest: Path) -> int:
    url = API.format(bucket=bucket) + "/" + urllib.parse.quote(name, safe="") + "?alt=media"
    r = sess.get(url, timeout=300)
    r.raise_for_status()
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    tmp.write_bytes(r.content)
    tmp.replace(dest)
    return len(r.content)


def pull(sess, bucket: str, prefix: str, dest: Path, exclude: tuple[str, ...] = ()) -> tuple[int, int]:
    objs = [o for o in list_objects(sess, bucket, prefix)
            if not o["name"].endswith("/") and not any(o["name"][len(prefix):].startswith(x) for x in exclude)]
    with ThreadPoolExecutor(max_workers=16) as ex:
        sizes = list(ex.map(lambda o: download(sess, bucket, o["name"], dest / o["name"][len(prefix):]), objs))
    return len(objs), sum(sizes)


def main() -> int:
    bucket = os.environ.get("FCC_LAKE_BUCKET", "fcc-soft-sensor-sim-data")
    release = os.environ.get("FCC_RELEASE", "v0.5")
    art = Path(os.environ.get("FCC_ARTIFACTS_DIR", "/srv/artifacts"))
    kdir = Path(os.environ.get("FCC_KNOWLEDGE_DIR", "/srv/knowledge/corpus"))
    excl = tuple(x for x in os.environ.get("FCC_KNOWLEDGE_EXCLUDE", "documentation/,_README.md").split(",") if x)
    creds, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/devstorage.read_only"])
    sess = AuthorizedSession(creds)
    t0 = time.time()
    rel_prefix = f"models/serving/{release}/"
    n, b = pull(sess, bucket, rel_prefix, art)
    if not (art / "bundle.json").exists() or not (art / "models" / "final_bundle.pkl").exists():
        print(f"hydrate: release gs://{bucket}/{rel_prefix} missing bundle.json or models/ — refusing to start", file=sys.stderr)
        return 1
    seed = art / "audit_seed.db"
    if seed.exists() and not (art / "audit.db").exists():
        seed.replace(art / "audit.db")      # decision record starts from the published seed; resets on redeploy
    kn, kb = pull(sess, bucket, "knowledge/", kdir, excl)
    print(json.dumps({"hydrate": "ok", "release": f"gs://{bucket}/{rel_prefix}", "artifact_files": n,
                      "artifact_mb": round(b / 1e6, 1), "knowledge": f"gs://{bucket}/knowledge/", "knowledge_files": kn,
                      "knowledge_kb": round(kb / 1e3), "seconds": round(time.time() - t0, 1)}), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
