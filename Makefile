.DEFAULT_GOAL := help

.PHONY: help sim-status load-full api-test api-train api-run web-dev web-test web-build corpus-check

help: ## Show this help message
	@grep -E '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "%-15s %s\n", $$1, $$2}'

sim-status: ## Check Octave simulation process count and latest log progress
	ps -eo args | grep "[o]ctave-cli" | grep -c random; for f in sim_octave/data/full_v1/logs/*.log; do tail -1 "$$f"; done | tail -5

load-full: ## Ingest full_v1 simulation batch into BigQuery
	cd sim_octave && python3 load_to_bq.py --in-dir data/full_v1 --batch-id full_v1 --expected-minutes 1600

api-test: ## Run FastAPI test suite
	cd cockpit/api && .venv/bin/python -m pytest -q

api-train: ## Train soft-sensor models on local simulator CSVs (sim_octave/data)
	cd cockpit/api && OMP_NUM_THREADS=4 .venv/bin/python -m app.train

api-run: ## Run FastAPI backend service
	cd cockpit/api && .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000

web-dev: ## Run Next.js frontend in development mode
	cd cockpit/web && npm run dev

web-test: ## Run Next.js frontend vitest test suite
	cd cockpit/web && npx vitest run

web-build: ## Build Next.js production frontend bundle
	cd cockpit/web && npm run build

corpus-check: ## Validate knowledge corpus formatting and integrity
	python3 knowledge/tools/check_corpus.py knowledge/corpus
