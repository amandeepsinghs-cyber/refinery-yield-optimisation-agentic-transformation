.DEFAULT_GOAL := help

.PHONY: help sim-status load-full api-test api-lint api-train api-run web-dev web-test web-typecheck web-build web-e2e \
        check corpus-check demo-select knowledge-events copilot-eval recipe-eval

API := cd cockpit/api && .venv/bin/python
API_PORT ?= 8010

help: ## Show this help message
	@grep -E '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "%-15s %s\n", $$1, $$2}'

# --- simulator -------------------------------------------------------------------------------------------------------
sim-status: ## Check Octave simulation process count and latest log progress
	ps -eo args | grep "[o]ctave-cli" | grep -c random; for f in sim_octave/data/full_v1/logs/*.log; do tail -1 "$$f"; done | tail -5

load-full: ## (legacy) Ingest full_v1 into the flat warehouse table fcc_soft_sensor.fcc_sim_minute
	cd sim_octave && python3 load_to_bq.py --in-dir data/full_v1 --batch-id full_v1 --expected-minutes 1500

# --- lakehouse (GCS bronze/silver/gold + BigLake Iceberg + knowledge/audit/models zones) ---------------------------------
LAKE := PYTHONPATH=cockpit/api cockpit/api/.venv/bin/python sim_octave/lakehouse/load_lakehouse.py
lakehouse-load: ## Idempotent medallion load of $(BATCH) (default full_v1; RUNS=a,b to restrict; EXTRA="--skip-knowledge")
	$(LAKE) --batch $(or $(BATCH),full_v1) $(if $(RUNS),--runs $(RUNS)) $(EXTRA)
lakehouse-dry: ## Print the lakehouse commands/SQL without touching GCP
	$(LAKE) --batch $(or $(BATCH),full_v1) $(if $(RUNS),--runs $(RUNS)) --dry-run $(EXTRA)
lakehouse-status: ## Row counts per silver/gold table
	$(LAKE) --status

# --- backend (cockpit/api) ---------------------------------------------------------------------------------------------
api-test: ## Run FastAPI test suite
	$(API) -m pytest -q

api-lint: ## Ruff lint + financial-term scan over cockpit/api/app
	$(API) -m ruff check app scripts tests || true
	@! grep -rn -i -E "[$$€£₹]\s?[0-9]|USD|EUR|NPV|ROI|payback|cost|budget|price|revenue|profit|savings?|monetary" cockpit/api/app \
	    | grep -v -i "no monetary\|no financial" || (echo "financial terms found in cockpit/api/app" && exit 1)

api-train: ## Train soft-sensor models on local simulator CSVs (sim_octave/data)
	cd cockpit/api && OMP_NUM_THREADS=4 .venv/bin/python -m app.train

api-run: ## Run FastAPI backend service on $(API_PORT) (the Next.js proxy expects 8010)
	cd cockpit/api && .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port $(API_PORT)

# --- frontend (cockpit/web) --------------------------------------------------------------------------------------------
web-dev: ## Run Next.js frontend in development mode
	cd cockpit/web && npm run dev

web-test: ## Run Next.js frontend vitest test suite
	cd cockpit/web && npx vitest run

web-typecheck: ## TypeScript type-check without emitting
	cd cockpit/web && npx tsc --noEmit

web-build: ## Build Next.js production frontend bundle
	cd cockpit/web && npm run build

PW_VERSION ?= 1.53.0
web-e2e: ## Playwright end-to-end on the demo context (needs api-run + web-dev up; uses system Chrome; E2E_RUN / E2E_T override)
	cd cockpit/web && npx -y -p @playwright/test@$(PW_VERSION) sh -c 'NODE_PATH="$$(dirname "$$(dirname "$$(command -v playwright)")")" playwright test --config playwright.config.ts'

check: api-test web-typecheck web-test ## Everything that must be green before a hand-off

# --- knowledge / evaluation --------------------------------------------------------------------------------------------
corpus-check: ## Validate knowledge corpus formatting and integrity
	python3 knowledge/tools/check_corpus.py knowledge/corpus

demo-select: ## Scan held-out runs and rank candidate windows for demo moments M1-M3
	$(API) -m app.select_demo $(ARGS)

knowledge-events: ## Extract events, labs, and trim windows from a simulation run CSV (e.g. make knowledge-events CSV=path)
	python3 knowledge/tools/extract_events.py $(or $(CSV),sim_octave/data/full_v1/random_s100.csv)

copilot-eval: ## Run Gemini copilot golden evaluation against Vertex AI
	$(API) scripts/eval_copilot.py $(ARGS)

recipe-eval: ## Replay E4 recipes on held-out crude switches (recipe vs hold on priority yield)
	$(API) scripts/eval_recipe.py $(ARGS)
