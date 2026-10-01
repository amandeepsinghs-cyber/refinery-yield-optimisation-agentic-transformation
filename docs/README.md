# Documentation map

The project keeps its **binding** specifications at the repository root so they are impossible to miss; everything
else lives here. If a root document and a `docs/` document disagree, the root document wins.

## Binding (root) — read in this order

| File | Role |
|---|---|
| [`README.md`](../README.md) | How to run the simulator, API and UI |
| [`BUILD_PLAN_v3.md`](../BUILD_PLAN_v3.md) | Current plan: crude-adaptive, unit-by-unit refinery twin (Epic J) |
| [`SDD.md`](../SDD.md) | Software design — requirements `SDD-*`; §1A problem statement, §14 engines & screens |
| [`BDD.md`](../BDD.md) | Acceptance scenarios `BDD-01..28` |
| [`features.md`](../features.md) | Feature list by epic (A–J) |
| [`build.md`](../build.md) | Step-by-step build log (Steps 1–19) |
| [`checklist.md`](../checklist.md) | Phase checklist — the single source of "what is done" |
| [`demoflow.md`](../demoflow.md) | Demo script, scene by scene |
| [`DECISIONS.md`](../DECISIONS.md) | Architecture decision records |
| [`cockpit/API_CONTRACT_v3.md`](../cockpit/API_CONTRACT_v3.md) | Backend ↔ frontend contract (v3 twin); `API_CONTRACT.md` is the v1/v2 soft-sensor contract |

## Problem inputs (root) — the "why"

| File | Role |
|---|---|
| [`refinery_optimisation.md`](../refinery_optimisation.md) | Use-case catalogue from the site (11 high-value + 23 downstream) |
| [`fcc_soft_sensor_problem_statement.md`](../fcc_soft_sensor_problem_statement.md) | Original soft-sensor problem statement (v1) |
| [`fcc_ai_driven_soft_sensor_solutions.md`](../fcc_ai_driven_soft_sensor_solutions.md) | Solution landscape survey |
| [`BCC.md`](../BCC.md) | Business / context brief |
| [`verbatim.md`](../verbatim.md) | Verbatim voice-note transcripts + the engineering assessment that re-anchored v3 |
| [`delegation.md`](../delegation.md) | Working agreement for delegated build tasks (referenced by `tasks/` and the UI source previews) |

## Here

| Path | Role |
|---|---|
| `ui/v2/` | Approved v2 UI mockups; `ui/archive_v1/` the superseded set |
| `archive/` | Superseded planning material kept for traceability (`expansion_plan_recommendation.md` → Epic I, two exploratory notebooks) |
| [`../design/`](../design/) | L0 / L1 twin mockups that bind Epic J screens |
| [`../tasks/`](../tasks/) | Delegated task briefs (`inbox/`) and reports (`done/`) |
