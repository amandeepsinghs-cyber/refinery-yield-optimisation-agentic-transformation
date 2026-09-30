# FCC Soft-Sensor Decision Cockpit (technical demo)

This project demonstrates agent-managed inferential soft sensors for Fluid Catalytic Cracking (FCC) Light Cycle Oil (LCO) and Heavy Naphtha (HN) cut points using simulated data generated from the peer-reviewed Santander et al. 2022 FCC-Fractionator simulator. The system operates strictly in an advisory capacity, providing real-time cut-point predictions, quality gate validation, and operational recommendations without closed-loop actuation. All telemetry and metrics are technical and process-engineering focused; no financial figures or commercial valuations are included.

## Read first

1. **[DECISIONS.md](file:///usr/local/google/home/amandeepsinghs/o&g%20agentic%20transformation/Oil%20&%20Gas%20Agent%20Portfolio/agent_ideas/FCC_RCC_Optimisation/DECISIONS.md)** - Canonical facts, project ground rules, and technical decisions.
2. **[demoflow.md](file:///usr/local/google/home/amandeepsinghs/o&g%20agentic%20transformation/Oil%20&%20Gas%20Agent%20Portfolio/agent_ideas/FCC_RCC_Optimisation/demoflow.md)** - The end-to-end demo script and presentation walkthrough.
3. **[features.md](file:///usr/local/google/home/amandeepsinghs/o&g%20agentic%20transformation/Oil%20&%20Gas%20Agent%20Portfolio/agent_ideas/FCC_RCC_Optimisation/features.md)** - Cockpit functional capabilities and user-facing features.
4. **[SDD.md](file:///usr/local/google/home/amandeepsinghs/o&g%20agentic%20transformation/Oil%20&%20Gas%20Agent%20Portfolio/agent_ideas/FCC_RCC_Optimisation/SDD.md)** - System design document, architecture, and API contracts.
5. **[BDD.md](file:///usr/local/google/home/amandeepsinghs/o&g%20agentic%20transformation/Oil%20&%20Gas%20Agent%20Portfolio/agent_ideas/FCC_RCC_Optimisation/BDD.md)** - Behavior-driven development specifications and acceptance criteria.
6. **[build.md](file:///usr/local/google/home/amandeepsinghs/o&g%20agentic%20transformation/Oil%20&%20Gas%20Agent%20Portfolio/agent_ideas/FCC_RCC_Optimisation/build.md)** - Environment setup, build instructions, and dependency management.
7. **[checklist.md](file:///usr/local/google/home/amandeepsinghs/o&g%20agentic%20transformation/Oil%20&%20Gas%20Agent%20Portfolio/agent_ideas/FCC_RCC_Optimisation/checklist.md)** - Implementation checklist and delivery verification status.
8. **[delegation.md](file:///usr/local/google/home/amandeepsinghs/o&g%20agentic%20transformation/Oil%20&%20Gas%20Agent%20Portfolio/agent_ideas/FCC_RCC_Optimisation/delegation.md)** - Subagent task allocation and task card execution protocols.
9. **[BCC.md](file:///usr/local/google/home/amandeepsinghs/o&g%20agentic%20transformation/Oil%20&%20Gas%20Agent%20Portfolio/agent_ideas/FCC_RCC_Optimisation/BCC.md)** - Business context, operational constraints, and unit boundary definitions.
10. **[fcc_soft_sensor_problem_statement.md](file:///usr/local/google/home/amandeepsinghs/o&g%20agentic%20transformation/Oil%20&%20Gas%20Agent%20Portfolio/agent_ideas/FCC_RCC_Optimisation/fcc_soft_sensor_problem_statement.md)** - Process background and distillation cut-point estimation challenges.
11. **[fcc_ai_driven_soft_sensor_solutions.md](file:///usr/local/google/home/amandeepsinghs/o&g%20agentic%20transformation/Oil%20&%20Gas%20Agent%20Portfolio/agent_ideas/FCC_RCC_Optimisation/fcc_ai_driven_soft_sensor_solutions.md)** - AI/ML architecture options, feature engineering, and soft-sensor techniques.

## Repo layout

```
├── sim_octave/       # Octave simulator port, batch scripts, BigQuery loader, VALIDATION.md
├── cockpit/api/      # FastAPI + soft-sensor pipeline: models, gate, recommendations, Copilot, knowledge index
├── cockpit/web/      # Next.js cockpit, 4 dashboards: Decision, Technical, Modelling, Knowledge
├── knowledge/        # 46 SIMULATED documents + tools
├── docs/ui/          # UI mockups
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
