# FCC Soft-Sensor Decision Cockpit (technical demo)

This project demonstrates agent-managed inferential soft sensors for Fluid Catalytic Cracking (FCC) Light Cycle Oil (LCO) and Heavy Naphtha (HN) cut points using simulated data generated from the peer-reviewed Santander et al. 2022 FCC-Fractionator simulator. The system operates strictly in an advisory capacity, providing real-time cut-point predictions, quality gate validation, and operational recommendations without closed-loop actuation. All telemetry and metrics are technical and process-engineering focused; no financial figures or commercial valuations are included.

## Presenting tomorrow? Start here

1. **[use_cases/PRESENTER_PACK.md](use_cases/PRESENTER_PACK.md)**: the story-first pitch. Act 1 is the refinery story and IOCL's list. Act 2 follows the oil through stops 1–7 on `random_s107` 10:00. Act 3 is the stress test on `random_s144`. It also has the close, Q&A, honest numbers and the pre-flight checklist.
2. **[use_cases/INDEX.md](use_cases/INDEX.md)**: coverage map in IOCL's order, status vocabulary, decisions D1–D9 and the screen map.
3. **[use_cases/refinery_optimisation_use_cases.md](use_cases/refinery_optimisation_use_cases.md)**: IOCL's use cases and value figures. These are attributed to IOCL, never claimed as ours, and never shown on cockpit screens.
4. **[DEMO_SCRIPT.md](DEMO_SCRIPT.md)**: scene-by-scene clicks. The top note maps the story-first order to Scenes 0 and A–M.

> IOCL's value figures appear only in `use_cases/` docs and the pitch table, attributed to IOCL. The cockpit itself still shows no financial figures (DECISIONS S-3 / U3).

## Read first (build definition)

1. **[DECISIONS.md](DECISIONS.md)**: canonical facts, ground rules and technical decisions. §0A covers the 2026-10-06 story-first pitch (S-1…S-6).
2. **[demoflow.md](demoflow.md)**: end-to-end demo flow; the top section has the new scene order.
3. **[features.md](features.md)**: cockpit features, including F-STORY / F-TOUR / F-UCMAP / F-IOCLFIG and Epic L.
4. **[SDD.md](SDD.md)**: system design, architecture and API contracts. §14.6D is the refinery story band and the follow-the-oil tour.
5. **[BDD.md](BDD.md)**: acceptance specs; §10 has BDD-35 and BDD-36.
6. **[build.md](build.md)**: environment, build steps and dependencies. Step 21 is Epic L (L1/L2, proposed).
7. **[checklist.md](checklist.md)**: delivery checklist; Phase 23 is the story-first pitch.
8. **[PROBING_QUESTIONS.md](PROBING_QUESTIONS.md)**: likely customer questions; section F covers the story-first pitch.
9. **[delegation.md](delegation.md)**: subagent task allocation and task-card protocol.
10. **[BCC.md](BCC.md)**: business context, operational constraints and unit boundaries.
11. **[fcc_soft_sensor_problem_statement.md](fcc_soft_sensor_problem_statement.md)**: process background and the cut-point estimation challenge.
12. **[fcc_ai_driven_soft_sensor_solutions.md](fcc_ai_driven_soft_sensor_solutions.md)**: AI/ML options, feature engineering and soft-sensor techniques.

## Repo layout

```
├── sim_octave/       # Octave simulator port, batch scripts, regime staging, BigQuery loader, VALIDATION.md
├── cockpit/api/      # FastAPI: soft-sensor pipeline + v3 crude-adaptive engines (E1–E4), twin, Copilot, knowledge index
├── cockpit/web/      # Next.js cockpit: L0 /twin + L1 /twin/unit/[unit_id] (v3) and the v2 dashboards
├── knowledge/        # 46 SIMULATED documents + tools
├── design/           # L0 / L1 twin mockups that bind Epic J screens
├── docs/             # Documentation map (docs/README.md), UI mockups (ui/), superseded plans (archive/)
├── tasks/            # Task cards and reports
├── use_cases/        # IOCL pitch pack: PRESENTER_PACK, INDEX, IOCL list, UC-01..UC-11, UC-FEED, out-of-scope
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
