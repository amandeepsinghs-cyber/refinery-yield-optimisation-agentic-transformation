# FCC Soft-Sensor Decision Cockpit (technical demo)

This project demonstrates agent-managed inferential soft sensors for Fluid Catalytic Cracking (FCC) Light Cycle Oil (LCO) and Heavy Naphtha (HN) cut points using simulated data generated from the peer-reviewed Santander et al. 2022 FCC-Fractionator simulator. The system operates strictly in an advisory capacity, providing real-time cut-point predictions, quality gate validation, and operational recommendations without closed-loop actuation. All telemetry and metrics are technical and process-engineering focused; no financial figures or commercial valuations are included.

## Read first

1. **[DECISIONS.md](file:///usr/local/google/home/amandeepsinghs/o&g%20agentic%20transformation/Oil%20&%20Gas%20Agent%20Portfolio/agent_ideas/Refinery%20Agentic%20Optimisation/DECISIONS.md)** - Canonical facts, project ground rules, and technical decisions.
2. **[demoflow.md](file:///usr/local/google/home/amandeepsinghs/o&g%20agentic%20transformation/Oil%20&%20Gas%20Agent%20Portfolio/agent_ideas/Refinery%20Agentic%20Optimisation/demoflow.md)** - The end-to-end demo script and presentation walkthrough.
3. **[features.md](file:///usr/local/google/home/amandeepsinghs/o&g%20agentic%20transformation/Oil%20&%20Gas%20Agent%20Portfolio/agent_ideas/Refinery%20Agentic%20Optimisation/features.md)** - Cockpit functional capabilities and user-facing features.
4. **[SDD.md](file:///usr/local/google/home/amandeepsinghs/o&g%20agentic%20transformation/Oil%20&%20Gas%20Agent%20Portfolio/agent_ideas/Refinery%20Agentic%20Optimisation/SDD.md)** - System design document, architecture, and API contracts.
5. **[BDD.md](file:///usr/local/google/home/amandeepsinghs/o&g%20agentic%20transformation/Oil%20&%20Gas%20Agent%20Portfolio/agent_ideas/Refinery%20Agentic%20Optimisation/BDD.md)** - Behavior-driven development specifications and acceptance criteria.
6. **[build.md](file:///usr/local/google/home/amandeepsinghs/o&g%20agentic%20transformation/Oil%20&%20Gas%20Agent%20Portfolio/agent_ideas/Refinery%20Agentic%20Optimisation/build.md)** - Environment setup, build instructions, and dependency management.
7. **[checklist.md](file:///usr/local/google/home/amandeepsinghs/o&g%20agentic%20transformation/Oil%20&%20Gas%20Agent%20Portfolio/agent_ideas/Refinery%20Agentic%20Optimisation/checklist.md)** - Implementation checklist and delivery verification status.
8. **[delegation.md](file:///usr/local/google/home/amandeepsinghs/o&g%20agentic%20transformation/Oil%20&%20Gas%20Agent%20Portfolio/agent_ideas/Refinery%20Agentic%20Optimisation/delegation.md)** - Subagent task allocation and task card execution protocols.
9. **[BCC.md](file:///usr/local/google/home/amandeepsinghs/o&g%20agentic%20transformation/Oil%20&%20Gas%20Agent%20Portfolio/agent_ideas/Refinery%20Agentic%20Optimisation/BCC.md)** - Business context, operational constraints, and unit boundary definitions.
10. **[fcc_soft_sensor_problem_statement.md](file:///usr/local/google/home/amandeepsinghs/o&g%20agentic%20transformation/Oil%20&%20Gas%20Agent%20Portfolio/agent_ideas/Refinery%20Agentic%20Optimisation/fcc_soft_sensor_problem_statement.md)** - Process background and distillation cut-point estimation challenges.
11. **[fcc_ai_driven_soft_sensor_solutions.md](file:///usr/local/google/home/amandeepsinghs/o&g%20agentic%20transformation/Oil%20&%20Gas%20Agent%20Portfolio/agent_ideas/Refinery%20Agentic%20Optimisation/fcc_ai_driven_soft_sensor_solutions.md)** - AI/ML architecture options, feature engineering, and soft-sensor techniques.

## Repo layout

```
├── sim_octave/       # Octave simulator port, batch scripts, regime staging, BigQuery loader, VALIDATION.md
├── cockpit/api/      # FastAPI: soft-sensor pipeline + v3 crude-adaptive engines (E1–E4), twin, Copilot, knowledge index
├── cockpit/web/      # Next.js cockpit: L0 /twin + L1 /twin/unit/[unit_id] (v3) and the v2 dashboards
├── knowledge/        # 46 SIMULATED documents + tools
├── design/           # L0 / L1 twin mockups that bind Epic J screens
├── docs/             # Documentation map (docs/README.md), UI mockups (ui/), superseded plans (archive/)
├── tasks/            # Task cards and reports
└── FCC-Fractionator/ # Original simulator, MIT, provenance
```

## Quick start

See all available commands:
```bash
make help
```

## Data

- **Batch `full_v1`**: 54 runs `random_s100`..`s153` x 1600 min.
- **BigQuery**: `fcc-soft-sensor.fcc_soft_sensor.fcc_sim_minute` (`us-central1`).
- **Held-out validation**: Runs `random_s140`..`s153`.
- **Licence note**: Simulator MIT (Santander et al. 2022).
