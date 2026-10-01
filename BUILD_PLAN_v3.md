# BUILD PLAN v3 — Crude-Adaptive, Unit-by-Unit Refinery Optimisation Twin

> **Date:** 2026-10-01 · **Supersedes** the UI-first plans in `BUILD_AND_FEATURE_UPGRADE.md` / `UI_UPGRADE.md` where they conflict.
> **Companions:** [`refinery_optimisation.md`](refinery_optimisation.md) · [`verbatim.md`](verbatim.md) · [`SDD.md`](SDD.md) · [`BDD.md`](BDD.md) · [`checklist.md`](checklist.md)

---

## 0. The problem we are solving (re-anchored)

Refineries change crude slate / tank blend every 12–48 h. Models trained on historical averages and lab feedback that lags 4–12 h leave every unit running on sub-optimal parameters through and after each switch — losing high-value yield (LCO, naphtha, LPG/C5) and wasting energy, coke and quality giveaway.

**The system must, unit by unit:** (1) recognise the active crude regime from what the unit actually sees, (2) adapt the physics/ML model to it, (3) detect the moment a unit goes off its expected behaviour, (4) prescribe the coordinated multi-parameter set-point recipe that restores plan, and (5) keep the operator in the loop — with a plant-wide agent showing where the change hits first and what breaks downstream if ignored.

> [!IMPORTANT]
> Objective and all displayed metrics stay in **engineering units** (yield % feed, °F margin, P(on-spec), lb/s fuel, MW, wt % coke). No currency, no "cost" wording (DECISIONS S2 / SDD-NFR-11).

---

## 1. Data inputs we actually have (simulator truth)

| Group | Tags (per simulated minute) |
|---|---|
| Crude / disturbances | `dist_feed_API`, `crude_id`, `dist_T_feed_in_F`, `dist_T_ambient_F`, `dist_condenser_eff`, `feed_flow_lb_s`, `event_code` |
| Furnace (U1) | `T2_preheat_F`, `SP_T_preheat_F`, `T3_furnace_F`, `F5_fuel`, `fluegas_O2_pct`, `fluegas_CO_ppm`, `F_fluegas`, `V1`, `T2_dup` |
| Riser (U2) | `Tr_riser_F`, `SP_T_riser_ROT_F`, `P4_reactor_psia`, `dP_reactor_frac`, `conversion_pct`, `W_riser`, `W_standpipe`, `standpipe_level`, `F_regen_cat`, `F_spent_cat`, `V2`, `V3`, `Tr_dup` |
| Regenerator (U3) | `Treg_F`, `SP_T_reg_F`, `Tcyc_F`, `dT_cyc_reg_F`, `P6_regen_psia`, `SP_P_reg_psia`, `C_spent_cat`, `C_regen_cat`, `F_coke`, `Fair`, `F_air_x29`, `W_regen`, `power_CAB`, `V4`, `V6`, `V7`, `Treg_dup`, `P6_dup` |
| Fractionator (U4) | `T_tray01_F…T_tray20_F`, `P5_frac_psia`, `SP_P_frac_psia`, `MV_PA1…MV_PA4`, `SP_LCO_T98`, `SP_HN_T98`, `valve_V8…valve_V11`, `F_V11`, `LCO_T98_F`, `HN_T98_F` (truth), `lab_sample`, `P5_dup` |
| Overhead (U5) | `SP_T_overhead`, `SP_acc_level`, `MV_reflux_ratio`, `MV_cw_flow`, `power_WGC`, `valve_V9` |
| Stabiliser / products (U6) | `eff_C1…eff_C5`, `eff_p1…eff_p4`, `eff_VGO`, `prod_LPG`, `prod_LN`, `prod_HN`, `prod_LCO`, `prod_slurry`, `prod_coke` |
| Balances | `reactor_MB`, `mass_balance_err_pct` |

**Not available (do not promise):** sulphur / nitrogen / metals chemistry, RON, flare, filters/coalescers, gas turbines, tank inventories. Crude is characterised by **API only** in the simulator; "crude families" are therefore API-band regimes with distinct unit-response signatures (coke make, heat of cracking, tray ΔT), labelled with illustrative names.

---

## 2. Use cases from `refinery_optimisation.md` — what we solve, with which data

Legend: ✅ solvable end-to-end with simulator data · 🟡 solvable as a faithful proxy (same method, adjacent variable) · ⚪ boundary-linked / architecture-ready only · ❌ out of demo scope (no data)

### 2.1 High-value use cases (the 11)

| # | Use case (source) | Status | Data inputs | Engine(s) | Where it lives |
|---|---|---|---|---|---|
| 1 | FCC/RFCC product-quality inferential (HGO-sulphur pattern) — run closer to plan, avoid over/under-treating | ✅ (on LCO/HN T98; sulphur = site phase) | tray profile, `SP_LCO/HN_T98`, PA duties, `P5`, labs, `crude_id` | E2 committee + E3 residual + E4 recipe | **U4 Fractionator workbench** (first to build) |
| 2 | Stabiliser overhead optimisation — maximise C5 recovery | ✅ (FCC gas-plant stabiliser proxy for reformer stabiliser) | `eff_C5`, `prod_LN`, `prod_LPG`, `MV_reflux_ratio`, `SP_T_overhead`, `MV_cw_flow` | E4 operating curve (C5 vs reflux) | U6 Stabiliser |
| 3 | LPG balance & C4/C5 split optimisation + forecasting | ✅ | `eff_C3/C4/C5`, `prod_LPG`, `prod_LN`, `SP_T_overhead` | E4 + TSA forecast | U6 Stabiliser |
| 4 | Regeneration-cycle tracking, optimisation, event RCA | 🟡 (continuous FCC regen as proxy for CCR cycles) | `Treg`, `Tcyc`, `dT_cyc_reg`, `C_spent/C_regen`, `F_coke`, `Fair`, `power_CAB` | E3 detection + RCA, E4 (air vs afterburn) | U3 Regenerator |
| 5 | Fired-heater CO & O₂ combustion modelling; auto-flag poor combustion | ✅ | `fluegas_O2_pct`, `fluegas_CO_ppm`, `F5_fuel`, `T3_furnace_F`, `V1` | E3 (CO slope / O₂ flat) + E4 (O₂ trim) + PINN combustion curve | U1 Furnace |
| 6 | Multi-unit energy management (furnaces, air blower, compressor, heat recovery) | ✅ | `F5_fuel`, `power_CAB`, `power_WGC`, `MV_PA1–4`, `MV_cw_flow` | E4 plant-level energy term; Systems Agent | L0 banner + every workbench "energy ripple" |
| 7 | Preheat-train / exchanger UA fouling health & cleaning timing | 🟡 (condenser UA ✅ full; preheat UA proxy from `T2`, `F5`, feed) | `dist_condenser_eff`, `MV_cw_flow`, `SP_T_overhead`; `T2_preheat_F`, `F5_fuel`, `feed_flow` | E3 slow-drift detector + degradation projection | U5 Condenser (+ U1 note) |
| 8 | Filter / coalescer breakthrough prediction | 🟡 (hydraulic ΔP/F² proxy) | `dP_reactor_frac`, `feed_flow_lb_s`, `P4`, `P5` | E3 ΔP-normalised trend + projection | U2 Riser |
| 9 | Rotating-equipment health (compressors, blowers) & valve stiction | 🟡 | `power_CAB`, `power_WGC`, `Fair`, `valve_V8–V11`, `V1–V7` | E3 power-vs-load residual; valve authority band | U3 / U5 + instrumentation panel |
| 10 | Furnace coke build-up & hydraulic constraint prediction; turnaround vs mid-run | 🟡 | `T3_furnace_F`, `T2_preheat_F`, `F5_fuel`, `dP_reactor_frac` | PINN coking residual + survival horizon | U1 Furnace |
| 11 | Product soft sensors between lab samples; earlier off-spec detection | ✅ | same as #1 + `lab_sample` cadence | E2 + E3 | U4 (and every quality tag) |

### 2.2 Documented downstream cases (the 23) — only those with data

| Case | Status | Data / note |
|---|---|---|
| Fractionator / crude-column flooding identification | ✅ | `dP_reactor_frac`, tray ΔT profile, `MV_PA` — pattern search on profile (U4) |
| Furnace excess-O₂ combustion optimisation | ✅ | same as #5 |
| Excess-O₂ analyser soft sensor / drift | ✅ | dual sensors `T2_dup`, `Tr_dup`, `Treg_dup`, `P5_dup`, `P6_dup` → drift matrix; O₂ inferred from `Fair`, `F5` |
| LPG recovery improvement (modes comparison) | ✅ | `eff_C3/C4`, `prod_LPG` across regimes |
| LPG balance & split analysis | ✅ | as #3 |
| CDU preheat-train U-value monitoring | 🟡 | preheat proxy from `T2`, `F5`, feed (U1) |
| Crude-unit overhead cooler shutdown avoidance | 🟡 | condenser efficiency decay (U5) |
| Coker recycle → FCC yield | ⚪ | boundary: `feed_flow`, `dist_feed_API` as the coker-recycle input; yields from E4 |
| Coker outage / de-coke / TMT / creep | ⚪ | pattern = #10 furnace coking; no coker data |
| Gasoline RON / octane | ❌ | no RON in simulator |
| Alkylation feed-water / coalescer / effluent filter | ❌ (method = #8) | no alky data |
| Gas-turbine wash / inlet filter | ❌ (method = #9) | no GT data |
| Flare emissions / compliance / RCA | ❌ | no flare data |
| Nitrogen & fuel-gas usage | 🟡 | `F5_fuel`, `eff_C1/C2` fuel-gas make |
| Cooling-tower pump anomaly | 🟡 | method = #9 on `MV_cw_flow` / `power_WGC` |

### 2.3 Downstream catalogue (7 domains) — mapped where data exists
Separation ✅ (vapour-cut, exchanger prediction, furnace de-coke) · Reaction & conversion 🟡 (fuel-gas balance, compressor health; no fixed-bed catalyst life) · Treating ✅ (predict quality from upstream conditions = #1) · Scheduling & planning 🟡 (blend giveaway → quality giveaway; material balance ✅ via `mass_balance_err_pct`) · Workforce ✅ (shift report via Gemini; control-loop performance via valve authority) · Sustainability ❌ · Pipeline ❌.

**Net:** 7 of 11 high-value use cases are ✅, 4 are faithful 🟡 proxies; 6 downstream cases ✅/🟡. Everything ❌ is explicitly "architecture-ready, site data required" on Level 0.

---

## 3. Engines (backend)

| Engine | Purpose | Inputs | Output contract |
|---|---|---|---|
| **E1 Regime** | Fingerprint active crude from unit response | `dist_feed_API`, `F_coke/feed`, riser ΔT (`Tr − T2`), `F5_fuel/feed`, tray ΔT profile, `conversion_pct` | `regime_id`, `P(regime)`, `novelty`, `transition_pct`, `declared_vs_detected` |
| **E2 Model** | Crude-conditioned committee | E1 output + existing 4 members | per-regime weights; physics weight ↑ with novelty; online bias (exists) |
| **E3 Detection** | "How we know it's off" | measured − expected per unit, ±3σ, CUSUM / change-point, MV contribution ranking | `events[] {t, unit, tag, kind, severity, root_cause[], briefing{en,hinglish,hi}}` |
| **E4 Prescriptive** | Multi-parameter recipe | surrogates for `prod_LCO/HN/LN/LPG`, `F5_fuel`, `power_CAB`, `power_WGC`, `F_coke` vs `{SP_T_preheat, SP_T_riser_ROT, Fair, MV_PA1–4, MV_reflux_ratio, SP_LCO_T98, SP_HN_T98}` + crude; constrained search with P(on-spec) ≥ 95 % and IOW limits | `recipe {current→recommended per SP, Δyield %feed, Δfuel lb/s, ΔCAB MW, Δcoke, P(on-spec), gate}` |

Agents: **Refinery Systems Agent** (consequence rules over the 3 loops: catalyst, heat, hydrocarbon) + **6 Unit Sentinels** (emit E3 events, draft E4 recipes). Event store (SQLite `agent_events`) + SSE.

---

## 4. Screens (sober, light default + dark toggle, no grey curves)

* **L0 Refinery Twin** — whole-plant flat PFD (approved mockup); **crude-slate banner** (declared vs detected, transition %); per-block KPI vs plan, status, decisions/flags; "Needs attention" with systemic consequence lines; shift timeline. No charts.
* **L1 Unit Workbench** (per unit, FCC fractionator first) — I/O strip · aligned trends: measured vs expected (plan ± tol, spec), residual with breach marker, MVs, disturbances, **yield row** · event ribbon · right rail: **Regime & model-adaptation panel**, **Recipe card** (multi-SP), model evidence (members, physics checks, gate), decision, Gemini scoped (Hindi-first).
* Use-case entry: system tree opens the owning unit's workbench scrolled to that use case's signature chart (one chart per use case, §2.1).

---

## 5. Phases

| Phase | Build | Acceptance |
|---|---|---|
| **P0 Re-anchor** | SDD §1A problem statement; BDD-24..27 for E1–E4; purge cost/λ wording; this plan | Specs state the crude-adaptive problem |
| **P1 Scenarios & data** | `scenario.m`: `crude_campaign` with 4 named API-band regimes, 12 h and 48 h transitions, ≥ 20 runs; export unchanged schema; Parquet staging with BQ-shaped tables (`fcc_sim_minute`, `lab_results`, `regimes`) | Runs with labelled transitions available to training |
| **P2 E1 + E3** | regime classifier + novelty; per-unit residual/CUSUM/change-point + MV contribution | Regime detected within ≤ 45 min of switch; "off" event before next lab |
| **P3 E2 + E4 (critical path)** | regime-aware weights; yield/energy/coke surrogates; constrained optimiser; `/api/recipe` | Recipe computed, not typed; replaying recipe in simulator beats hold on yield at equal P(on-spec) |
| **P4 Agents** | event store + SSE; systems-agent consequence rules; sentinels | Event ribbon: breach → flag → cause → recipe → accept |
| **P5 Screens** | L0 + U4 workbench, then U1, U3, U6, U5, U2; palette; toggle | Click FCC → workbench on one cursor; zero grey curves |
| **P6 Gemini + Hindi + Director** | scope snapshot tool; context chips; Hindi prompts/voice; 7-scene crude-switch script | Hindi question on workbench → cited answer from visible data |

---

## 6. Demo storyline (what the plant head sees)
1. L0: plant green; crude banner "Declared: Arab Light · Detected: Arab Light 100 %".
2. 02:10 a tank switch starts (12 h ramp). 02:40 banner: "Detected: Basrah-type 35 % → novelty 0.4"; Systems Agent: "Riser ΔT rising; expect LCO T98 to drift above plan in ~90 min; fractionator PA3 will saturate if unadjusted."
3. Click FCC → workbench: residual breach at 03:05 (before 06:00 lab); recipe card: 5 coordinated SP moves; P(on-spec) 96 %; +0.4 % LCO yield; fuel −0.3 lb/s.
4. What-if slider; model-adaptation panel shows physics weight up, specialist weight shifting to Basrah model.
5. Accept → audit; event ribbon complete. Ask Gemini in Hindi why — cited answer.

---

## 7. Revisions log

**2026-10-01 (P0/P1 done).**
- **P1 re-scoped — no new Octave data needed for the demo.** Measured compute: ≈ 78 s per simulated minute per core; `full_v1` (54 runs) is still finishing on all 64 cores (~11 h left). `full_v1` already holds **50 labelled crude switches** (post-switch R1 21 · R2 7 · R4 22) and 98 labs — enough for E1–E4. `crude_campaign` exists in `scenario.m` with `run_campaign_batch.sh` (refuses to start while another batch runs) for a later `crude_v1` batch.
- Regimes are canonical in `cockpit/api/app/regimes.py`; staged `full_v1/_staged/regimes.csv` + `lab_results.csv` (BigQuery-shaped).
- **Section contract added (SDD-L1-07):** clicking a section shows Data · Analysis · Models · Decisions for that section only, served by `GET /api/unit/{unit_id}/workbench` (API_CONTRACT_v3 §5).
- **Screen-scoped Gemini added (SDD-GEM-01..04):** Gemini always knows which screen is open (L0 → plant snapshot, L1 → unit snapshot) and may still answer about the whole refinery.
- Binding contract for the build: [`cockpit/API_CONTRACT_v3.md`](cockpit/API_CONTRACT_v3.md). Design references: [`design/`](design/README.md).
