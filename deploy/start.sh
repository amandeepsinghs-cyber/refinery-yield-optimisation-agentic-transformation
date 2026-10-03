#!/bin/bash
# Pull models + documents from the lake, then start API, web and router; if any of them exits, exit so Cloud Run
# restarts the container.
set -u
cd /app && python deploy/hydrate.py || { echo "hydrate failed; not starting" >&2; exit 1; }
cd /app/cockpit/api && uvicorn app.main:app --host 127.0.0.1 --port 8010 &
cd /app/cockpit/web && node node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3000 &
nginx -g 'daemon off;' &
wait -n
echo "a process exited; stopping container" >&2
exit 1
