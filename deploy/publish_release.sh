#!/bin/bash
# Publish the cockpit's serving inputs to the lake's model zone (run from the repo root, after a model change).
#   deploy/publish_release.sh v0.5
# Writes gs://$BUCKET/models/serving/<release>/ (bundle, committee members, response-gain engines, held-out evaluation,
# scored runs, decision-record seed, RELEASE.json) and refreshes knowledge/manifest.json. Archive, never delete: an
# existing release folder is copied to _archive/ first. Cloud Run pulls this at start-up (deploy/hydrate.py).
set -euo pipefail
REL="${1:?release tag, e.g. v0.5}"
BUCKET="${FCC_LAKE_BUCKET:-fcc-soft-sensor-sim-data}"
A=cockpit/api/artifacts
DST="gs://$BUCKET/models/serving/$REL"
export CLOUDSDK_METRICS_ENVIRONMENT=datacloud.antigravity
if gcloud storage ls "$DST/RELEASE.json" >/dev/null 2>&1; then
  gcloud storage cp -r "$DST" "gs://$BUCKET/_archive/serving_${REL}_$(date -u +%Y%m%d_%H%M)" --quiet
fi
STAGE=$(mktemp -d)
cp "$A/bundle.json" "$A"/eval_*.npz "$STAGE/"
cp -r "$A/models" "$A/engines" "$A/runs" "$STAGE/"
sqlite3 "$A/audit.db" ".backup '$STAGE/audit_seed.db'" 2>/dev/null || cp "$A/audit.db" "$STAGE/audit_seed.db"
python3 - "$STAGE" "$REL" <<'PY'
import hashlib, json, pathlib, subprocess, sys, datetime
root, rel = pathlib.Path(sys.argv[1]), sys.argv[2]
files = {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest()[:16] for p in sorted(root.rglob("*")) if p.is_file()}
commit = subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True).stdout.strip()
(root / "RELEASE.json").write_text(json.dumps({"release": rel, "published_at": datetime.datetime.utcnow().isoformat() + "Z",
    "git_commit": commit, "n_files": len(files), "files": files}, indent=1))
PY
gcloud storage rsync -r --delete-unmatched-destination-objects "$STAGE" "$DST" --quiet
gcloud storage cp knowledge/corpus/manifest.json "gs://$BUCKET/knowledge/manifest.json" --quiet
rm -rf "$STAGE"
echo "published $DST"
