#!/bin/bash
# Pull models + documents from the lake, start API and web, and only then start nginx on $PORT: Cloud Run's startup
# probe (TCP on 8080) must not pass before both upstreams answer, or the first visitors get 502 while the instance's
# CPU is throttled. If any process exits, exit so Cloud Run restarts the container.
set -u
cd /app && python deploy/hydrate.py || { echo "hydrate failed; not starting" >&2; exit 1; }
cd /app/cockpit/api && uvicorn app.main:app --host 127.0.0.1 --port 8010 &
cd /app/cockpit/web && node node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3000 &
python - <<'PY' || { echo "upstreams not ready in time" >&2; exit 1; }
import time, urllib.request
t0 = time.time()
need = {"api": "http://127.0.0.1:8010/api/health", "web": "http://127.0.0.1:3000/platform"}
while need and time.time() - t0 < 220:
    for k, u in list(need.items()):
        try:
            urllib.request.urlopen(u, timeout=10)
            print(f"ready: {k} after {time.time() - t0:.0f} s", flush=True)
            need.pop(k)
        except Exception:
            pass
    time.sleep(1)
raise SystemExit(1 if need else 0)
PY
nginx -g 'daemon off;' &
echo "nginx up on :8080" >&2
wait -n
echo "a process exited; stopping container" >&2
exit 1
