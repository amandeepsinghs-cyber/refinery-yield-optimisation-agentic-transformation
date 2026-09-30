---
doc_id: REF-SIM-02
title: "Simulator and dataset description (provenance)"
doc_type: REF
revision: 1
effective_date: 2026-06-01
owner_role: "APC / soft-sensor engineer"
unit: FCC-21
status: SIMULATED
related_tags: ["LCO_T98_F", "HN_T98_F", "T_tray13_F", "T_tray06_F", "P5_frac_psia", "dist_feed_API", "feed_flow_lb_s", "Tr_riser_F", "event_code"]
related_events: []
related_docs: ["REF-STD-01", "SOP-APC-007"]
summary: "Technical description of the FCC-21 dynamic simulator, mathematical model origin, disturbance scenarios, tag definitions, and dataset provenance."
---

> **SIMULATED DOCUMENT** — generated for a technical demo. Not an approved procedure or record.
## 1 Purpose

This document describes the simulation environment, physics equations, dataset structures, and operating scenarios generating time-series data for the FCC-21 unit.

## 2 Entries

Technical documentation covering model architecture and dataset files.

### 2.1 Mathematical model formulation and origin

The dynamic simulation is based on the open FCC-Fractionator benchmark model developed by Santander et al. (2022) per [REF-STD-01 r1 §2.8]. The reactor incorporates a 10-lump cracking kinetic mechanism coupled with catalyst deactivation, riser hydrodynamics, and a dual-zone coke combustion regenerator. The main fractionator models a 20-tray distillation column with 4 pumparound circuits, vapor side-strippers, and condenser equilibrium flash thermodynamics.

### 2.2 Dynamic simulation engine and Octave implementation

The model is executed in GNU Octave using stiff differential-algebraic equation solvers (lsode with backward differentiation formulas). Integration uses a 10-second internal step, recording physical plant state variables every simulated minute. Initial conditions and steady-state baselines are validated against industrial operating points.

### 2.3 Disturbance scenarios, set-point moves, and event codes

Operating scenarios implement realistic refinery perturbations:
- Event Code 1: Crude changeover (dist_feed_API ramp between 20.0 and 29.0 API over 60 min).
- Event Code 2: Feed rate throughput shift (feed_flow_lb_s change ±5% of 165 lb/s over 30 min).
- Event Code 3: Riser outlet temperature shift (SP_T_riser_ROT_F change 969 ±5 °F over 10 min).
- Event Code 4: Feed preheat temperature disturbance (dist_T_feed_in_F change -20 °F to +10 °F over 30 min).
- Event Code 5: LCO T98 cut-point adjustment (SP_LCO_T98 move 755.3 ±10 °F over 20 min).
- Event Code 6: HN T98 cut-point adjustment (SP_HN_T98 move 530.3 ±5 °F over 20 min).
- Scheduled lab draws occur at 06:00, 14:00, and 22:00, triggering 60-minute automated cut-point trim cycles.

### 2.4 Dataset structure and repository organization

Data artifacts are stored across standardized directories:
- sim_octave/data/sample_v1/: Individual 180-minute scenario test runs.
- sim_octave/data/frontend_sample_1h/: Benchmarked 60-minute representative operational samples.
- sim_octave/data/full_v1/: Multi-day campaign runs (random_s100 through random_s109) combining multi-event sequences.

## 3 Notes

Simulator data is strictly synthetic and generated for software and AI model demonstration purposes.
