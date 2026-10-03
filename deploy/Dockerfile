# One-container demo deployment (owner, 3 Oct 2026 18:22: "deploy on cloud run").
# API (FastAPI, :8010) + web (Next.js, :3000) behind nginx on $PORT (8080). "Modular by design; deployed as one service
# for this demo."
#
# Lake-only (owner, 19:06-19:12): the image holds CODE ONLY — no simulator files, no models, no documents.
#   * run rows ............ BigQuery fcc_silver.run_registry + telemetry_minute   (FCC_RUN_INDEX=bigquery)
#   * document search ..... BigQuery VECTOR_SEARCH over fcc_gold.knowledge_chunks  (FCC_KNOWLEDGE_BACKEND=bigquery)
#   * models + documents .. pulled from gs://$FCC_LAKE_BUCKET at start-up by deploy/hydrate.py
#                           (models/serving/$FCC_RELEASE/ published by deploy/publish_release.sh; knowledge/)
# Nothing is written to any plant; the decision record (SQLite) starts from the published seed and resets on redeploy.
#
#   gcloud builds submit --config deploy/cloudbuild.yaml .      (from the repo root)

FROM node:20-slim AS web
WORKDIR /web
COPY cockpit/web/package.json cockpit/web/package-lock.json ./
# The lock file's tarball URLs point at Google's internal npm mirror (Airlock), unreachable from Cloud Build, and the
# lock lags package.json (plotly): rewrite to the public registry (same tarballs, same integrity hashes) and install.
RUN sed -i "s#http://airlock-proxy.uplink.goog:999/npm/artifact-foundry-prod/ah-3p-staging-npm/#https://registry.npmjs.org/#g" package-lock.json \
 && npm install -g npm@11 --no-audit --no-fund && npm install --no-audit --no-fund --registry=https://registry.npmjs.org/ \
 && test -f node_modules/next/package.json
COPY cockpit/web/ ./
# /api/* is routed by nginx to the API; the rewrite target only matters if nginx is bypassed.
ENV API_BASE=http://127.0.0.1:8010 \
    NEXT_PUBLIC_API_WS=same-origin \
    NEXT_TELEMETRY_DISABLED=1
RUN npx next build && npm prune --omit=dev

FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends nginx && rm -rf /var/lib/apt/lists/*
COPY --from=web /usr/local/bin/node /usr/local/bin/node
WORKDIR /app
COPY cockpit/api/requirements.txt cockpit/api/requirements.txt
RUN pip install --no-cache-dir -r cockpit/api/requirements.txt
COPY cockpit/api cockpit/api
COPY --from=web /web cockpit/web
COPY deploy/hydrate.py deploy/hydrate.py
COPY deploy/nginx.conf /etc/nginx/nginx.conf
COPY deploy/start.sh /start.sh
RUN chmod +x /start.sh && mkdir -p /srv/artifacts /srv/knowledge/corpus
ENV PORT=8080 \
    FCC_GCP_PROJECT=fcc-soft-sensor \
    FCC_GCP_LOCATION=us-central1 \
    FCC_DATA_SOURCE=bigquery \
    FCC_RUN_INDEX=bigquery \
    FCC_KNOWLEDGE_BACKEND=bigquery \
    FCC_FREEZE_ENGINES=1 \
    FCC_LAKE_BUCKET=fcc-soft-sensor-sim-data \
    FCC_RELEASE=v0.5 \
    FCC_ARTIFACTS_DIR=/srv/artifacts \
    FCC_KNOWLEDGE_DIR=/srv/knowledge/corpus \
    OMP_NUM_THREADS=2 \
    NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1
EXPOSE 8080
CMD ["/start.sh"]
