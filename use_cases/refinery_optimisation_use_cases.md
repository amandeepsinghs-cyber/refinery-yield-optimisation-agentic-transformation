# Refinery Analytics Use Cases (IOCL list) — with FCC Build Status

> **Read this first.** The use-case wording, value areas and **benefit figures in this file are IOCL's own**, reproduced from the list IOCL gave us. They are *IOCL's* indicative figures, **not our estimates and not our commitments**. Our columns are **Status**, **Built vs remaining** and **Where to see it**.
>
> **Status chips** (same words as the cockpit): 🟢 **Interactive** (real models) · 🟠 **Scripted outcome** (real inputs, move size scripted, labelled) · 🟡 **Partly** · 👁 **Watch only** · *FCC equivalent* (IOCL named a unit we don't have; same problem shown on the FCC) · ⚪ **Not claimed**.
>
> Presenting? See [PRESENTER_PACK.md](./PRESENTER_PACK.md). Per-row detail: [INDEX.md](./INDEX.md).

---

## 1. High-value use cases by value area (IOCL rows #1–#11)

| # | Unit / process | Analytics use case | Value area | IOCL-reported benefit (indicative) | Our status | Built vs remaining | Where to see it |
| :-: | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | FCC / RFCC / INDMAX | Product-quality inferential (e.g. HGO sulphur soft sensor) to run closer to plan and avoid over- and under-treating | Yield & quality | ~$0.4–0.5M/yr per unit | [🟢 Interactive](./UC-01_fcc_product_quality_inferential.md) | **Built:** LCO and heavy-naphtha cut-point (T98) estimate every minute from a 4-model committee (Bayesian ridge, GPR, hybrid physics delta, PINN ensemble), chance on spec, smallest safe move (advised only if P(on spec after move) ≥ 95 %). Cut point stands in for sulphur (simulator has none).<br>**Remaining:** sulphur / HGO property models; training on IOCL lab history; live LIMS feed. | U4 · Fractionator, step ③ D1 (`random_s107` 10:00; `random_s144` 10:00) |
| 2 | Catalytic reformer | Stabiliser-tower overhead optimisation to maximise C5 recovery | Yield & quality | ~$2–3M/yr gross-margin uplift | [🟠 Scripted outcome · FCC equivalent](./UC-02_stabiliser_overhead_c5_recovery.md) | **Built:** same problem on the FCC gas plant / stabiliser: overhead-temperature advice (D7) against C5 lost to LPG, on real simulator inputs; move size scripted.<br>**Remaining:** reformer stabiliser itself; measured overhead-temperature gain; LPG C5 analyser link. | U5 · Gas plant / U6 · Stabiliser, step ③ D7 |
| 3 | LPG / LSR naphtha system | LPG balance and distillation-split optimisation (C4/C5 split); improved forecasting | Yield & quality | ~$2–2.5M/yr | [🟠 Scripted outcome · FCC equivalent](./UC-03_lpg_balance_distillation_split.md) | **Built:** FCC stabiliser split held through the overhead set point / reflux (D7), expected result shown before acting; scripted size.<br>**Remaining:** refinery LPG header balance, LSR naphtha system, forecasting. | U6 · Stabiliser / U5 · Gas plant |
| 4 | Reactor regeneration (CCR / hydroprocessing) | Regeneration-cycle tracking, optimisation and event-based root-cause analysis | Yield & quality | ~1% reduction in cycle-time/yield losses (~$0.7M/yr+) | [🟠 Scripted outcome · FCC equivalent](./UC-04_reactor_regeneration_tracking.md) | **Built:** FCC regenerator: cyclone afterburn ΔT tracked vs expected, each drift event logged with likely cause, regenerator-air move (D5) with time to breach. Event real; move size scripted.<br>**Remaining:** CCR / hydroprocessing regeneration cycles; measured air gain. | U3 · Regenerator, step ②–③ D5 |
| 5 | Fired heaters / furnaces | CO and O₂ combustion modelling; automatic flagging of poor-combustion episodes | Energy | Fuel savings + CO₂/SOₓ/NOₓ reduction; ~$0.4–1M/yr per site | [🟠 Scripted outcome · gain measured](./UC-05_fired_heaters_combustion_modelling.md) | **Built:** flue-gas CO pattern flagged; feed-preheat move (D6) for the new crude with its effect on the riser. Preheat gain **measured** (52 step tests, 1.007 °F/°F); chance band scripted.<br>**Remaining:** excess-O₂ / burner trim (not a lever in the simulator), draft, tube-metal temperature. | U1 · Furnace, step ③–④ D6 |
| 6 | Multi-unit / multi-refinery utilities | Energy-management dashboards (boilers, furnaces, steam balance, O₂ control) | Energy | >$10M/yr at multi-refinery scale | [🟡 Partly](./UC-06_multi_unit_energy_management.md) | **Built:** whole-FCC view; coordinated multi-set-point recipe (D3) scoring yield minus fuel, power and coke, withheld when the soft sensor isn't trusted; D8 traces knock-on effects across units (19 systems rules).<br>**Remaining:** steam / boiler / site utilities; energy dashboard; multi-refinery scale. | FCC Complex `/twin`; U4 step ③–④ D3 |
| 7 | Crude preheat trains / heat exchangers | UA-based fouling health signal with degradation tracking and cleaning/shutdown optimisation | Energy & reliability | Sustained heat recovery; condition-based cleaning | [🟡 Partly · FCC equivalent](./UC-07_exchanger_fouling_health_signal.md) | **Built:** FCC overhead condenser: cooling-water demand above expected for the load flagged as the fouling signal; overhead-temperature move (D7) keeps the condenser inside fixed duty.<br>**Remaining:** crude preheat train network; UA trend forecast; cleaning planner. | U5 · Gas plant, step ①–③ D7 |
| 8 | Filtration systems (alkylation, amine, hydroprocessing) | Filter/coalescer breakthrough prediction to avoid fouling and unplanned changeouts | Reliability | Avoided changeouts and outages (~$2M/yr+) | [👁 Watch only · FCC equivalent](./UC-08_filtration_systems_breakthrough.md) | **Built:** riser / hydraulic drift flagged with its downstream consequence and timing (D8). No breakthrough model.<br>**Remaining:** filter / coalescer ΔP models on alkylation, amine, hydroprocessing. | U2 · Riser, step ③ D8 |
| 9 | Rotating equipment across sites (compressors, pumps) | Asset-health monitoring and predictive maintenance scaled across refineries | Reliability | Avoided downtime + planning gains (order $1–9M) | [👁 Watch only](./UC-09_rotating_equipment_asset_health.md) | **Built:** wet-gas compressor and air-blower load shown as consequences of upstream drift (D8), with the upstream cause named.<br>**Remaining:** vibration, bearing, seal, lube-oil analytics; multi-site fleet. | U2 · Riser D8; FCC Complex |
| 10 | Crude-unit furnaces | Coke-buildup and hydraulic-constraint prediction; anomaly detection; turnaround vs mid-run planning | Reliability | ~1% margin / ~3% production uplift + lower maintenance | [🟡 Partly · FCC equivalent](./UC-10_furnace_coke_hydraulic_constraints.md) | **Built:** FCC feed furnace outlet watched against expected for this crude; lasting drift flagged (±3σ / CUSUM); feed-nozzle limit binds the preheat advice.<br>**Remaining:** coke model; CDU/VDU furnaces; de-coke / turnaround planning. | U1 · Furnace, step ② |
| 11 | Product soft sensors | Online property prediction between lab samples (e.g. ATF freezing point, bitumen viscosity, VR penetration) | Yield & quality | Earlier off-spec detection; reduced reprocessing | [🟢 Interactive](./UC-11_product_soft_sensors_online_prediction.md) | **Built:** minute-by-minute estimate between 8-h labs from the same 4-model committee; **"Not yet"** when spread > 14 °F or bimodal (D2); extra-sample request (D9); suspect labs screened.<br>**Remaining:** ATF freeze point, bitumen viscosity, VR penetration (other units, same method). | U4 · Fractionator D2 / D9 (`random_s144` 12:00) |

---

## 2. Documented downstream case examples (IOCL list)

| Use case / unit | What the analytics did | Value area | IOCL-indicated value | Our status | Built vs remaining |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Coker outage / readiness modelling | Predicts when a coker reaches its target outage window so operators neither finish early nor late | Throughput / reliability | *(figure not in this copy — check IOCL original)* | ⚪ Not claimed | Outside FCC battery limits (delayed coker). |
| Coker heater de-coke prediction | Forecasts the next de-coke date to time cleaning and maintenance preparation | Reliability | ~$0.5M/yr | ⚪ Not claimed | Delayed-coker furnace. FCC furnace drift watch (UC-10) is the nearest pattern. |
| Delayed-coker heater spalling (TMT) projection | Forecasts tube-metal temperatures to coordinate spalling across multiple heaters | Reliability | Proactive planning | ⚪ Not claimed | Coker furnace. |
| Furnace tube creep-life (TMT) prediction | Creep-life what-if workflow to improve tube-life and change-out decisions | Reliability | up to ~$20M/yr modelled | ⚪ Not claimed | Metallurgical creep models; no TMT in the simulator. |
| Coker recycle → FCC yield optimisation | Links coker recycle rate to downstream FCC yields for integrated unit decisions | Yield & quality | ~$12M/yr | 🟡 Partly | **Built:** FCC side only — crude-family detection and models that re-weight for the feed now running ([UC-FEED](./UC-FEED_feedstock_evaluation_crude_tracking.md)).<br>**Remaining:** coker unit and the recycle-rate link. |
| Crude-unit overhead cooler shutdown avoidance | Fouling/salt monitoring identifies an online operating response that avoids a shutdown | Reliability | ~$4.0M | ⚪ Not claimed | CDU overhead. FCC condenser fouling signal (UC-07) is the nearest pattern. |
| CDU preheat-train exchanger U-value monitoring | Trends heat-exchanger U-value and forecasts when performance becomes a concern | Energy / reliability | Earlier maintenance & energy decisions | 🟡 FCC equivalent | FCC overhead condenser fouling signal ([UC-07](./UC-07_exchanger_fouling_health_signal.md)); no CDU train, no forecast. |
| Fractionator / crude-column flooding identification | Profile search detects flooding patterns and guides operating adjustments | Throughput | ~2,500 bbl/d (~2.8%) | 👁 Watch only | FCC main-fractionator hydraulic drift watched (D8); no flooding pattern model. |
| Gasoline RON / octane value optimisation | Forecasts RON and streamlines monitoring for earlier octane-focused moves | Yield & quality | ~0.1–0.5 RON | 🟡 Partly | Heavy-naphtha cut point estimated every minute ([UC-01](./UC-01_fcc_product_quality_inferential.md)); **no RON model**. |
| LPG recovery improvement | Compares recovery across operating modes to find improvement opportunities | Yield & quality | ~$2.0M | 🟠 Scripted outcome · FCC equivalent | Stabiliser overhead advice (D7) ([UC-03](./UC-03_lpg_balance_distillation_split.md)); no multi-mode benchmarking. |
| LPG balance & mogas blending | Yield forecasting, distillation-split analysis and blend optimisation | Yield & quality | ~$2.5M | 🟡 Partly | FCC split via D7; no blending optimisation. |
| Alkylation feed-water / coalescer monitoring | Calculates water solubility and coalescer effectiveness to protect throughput | Reliability / yield | ~$5.0M | ⚪ Not claimed | Alkylation unit. |
| Alkylation effluent filter breakthrough prediction | Predicts filter/coalescer breakthrough for earlier intervention | Reliability | ~$2.4M | ⚪ Not claimed | Alkylation unit. |
| Gas-turbine compressor wash timing | Condition-based water-wash decisions from calculated performance indicators | Reliability / energy | ~$1.0M | ⚪ Not claimed | Utilities / co-gen. |
| Gas-turbine inlet-air filter failure prediction | Tracks differential pressure and projects the integrity-limit date | Reliability | ~£4.3M | ⚪ Not claimed | Utilities. *(Check this figure is IOCL's — it is in £.)* |
| Furnace excess-O₂ combustion optimisation | Historical O₂ analysis surfaces lower-excess-oxygen opportunities | Energy | Combustion-efficiency gain | 🟡 Partly | Flue-gas CO pattern flagged on the FCC furnace ([UC-05](./UC-05_fired_heaters_combustion_modelling.md)); excess O₂ is not a lever in the simulator, so it is never advised. |
| Excess-O₂ analyser soft sensor | Detects analyser drift, recalibration needs and combustion anomalies | Reliability / quality | Earlier warnings | ⚪ Not claimed | Analyser drift not modelled. |
| Cooling-tower pump anomaly monitoring | Early-warning conditions for utility-pump behaviour | Reliability | ~$1.0M exposure protected | ⚪ Not claimed | Utilities. |
| Nitrogen & fuel-gas usage optimisation | Quantifies regeneration-cycle gas usage and closed-loop benefit | Energy | ~$0.86M/yr | ⚪ Not claimed | Hydroprocessing regeneration gas; FCC regenerator air (D5) is related but is not this use case. |
| Real-time flare emissions monitoring | Projects hourly flare emissions against permit limits during transients | Sustainability / compliance | Permit-risk reduction | ⚪ Not claimed | Flare system. |
| Flare compliance reporting | Auto-calculates net-heating-value, tip-velocity and flame-presence KPIs | Sustainability / compliance | Repeatable reporting | ⚪ Not claimed | Flare system. |
| LP / HP flare & compressor tracking | Quantifies flaring (nitrogen-corrected) with compressor uptime context | Sustainability / energy | Flaring made measurable | ⚪ Not claimed | Flare system. |
| Flare-reduction root-cause analysis | Combines process data with engineering review to target flaring reductions | Sustainability | ~$8.7M NPV (≈310k t CO₂e) | ⚪ Not claimed | Flare system. *(Check this figure is IOCL's — it is an NPV.)* |

---

## 3. Downstream refinery use-case catalogue (IOCL list)

| Functional category | Use case item | Our status | Built vs remaining |
| :--- | :--- | :--- | :--- |
| **Separation** | Salt-deposition monitoring in crude and overhead systems | ⚪ Not claimed | CDU overhead. |
| **Separation** | Vapour-cut / product-cut optimisation | [🟢 Interactive](./UC-01_fcc_product_quality_inferential.md) | **Built:** FCC LCO and heavy-naphtha cut points.<br>**Remaining:** CDU kerosene / diesel cuts. |
| **Separation** | Heat-exchanger maintenance prediction | [🟡 Partly · FCC equivalent](./UC-07_exchanger_fouling_health_signal.md) | **Built:** condenser fouling signal.<br>**Remaining:** cleaning scheduler. |
| **Separation** | Furnace de-coke monitoring and prediction | [🟡 Partly · FCC equivalent](./UC-10_furnace_coke_hydraulic_constraints.md) | **Built:** FCC furnace outlet drift watch.<br>**Remaining:** coke model, de-coke date forecast. |
| **Reaction & conversion** | Hydrogen and fuel-gas balances | ⚪ Not claimed | Refinery hydrogen network. |
| **Reaction & conversion** | Fixed-bed catalyst life prediction | ⚪ Not claimed | Hydrocracker / hydrotreater. |
| **Reaction & conversion** | Asset-based calculations for conversion assets | 👁 Watch only | **Built:** riser conversion tracked against expected for the crude (D8).<br>**Remaining:** full conversion-asset calculations; coker drums. |
| **Reaction & conversion** | Compressor health monitoring | [👁 Watch only](./UC-09_rotating_equipment_asset_health.md) | **Built:** wet-gas compressor load as a consequence.<br>**Remaining:** vibration / seal / bearing diagnostics. |
| **Treating** | Predict product quality from upstream operating conditions | [🟢 Interactive · FCC equivalent](./UC-11_product_soft_sensors_online_prediction.md) | **Built:** the FCC soft sensor is exactly this pattern.<br>**Remaining:** hydrotreater sulphur / nitrogen models. |
| **Treating** | Filter / drier cycle optimisation | [👁 Watch only](./UC-08_filtration_systems_breakthrough.md) | **Built:** hydraulic ΔP watch.<br>**Remaining:** mol-sieve / caustic filter cycles. |
| **Treating** | Amine (DEA) system monitoring | ⚪ Not claimed | Amine unit. |
| **Treating** | Chemical-additive optimisation | ⚪ Not claimed | Injection-rate control. |
| **Scheduling & planning** | Blend-giveaway optimisation | 🟡 Partly | **Built:** cut-point giveaway at the column (run closer to spec, D1).<br>**Remaining:** product blending. |
| **Scheduling & planning** | Inventory monitoring and prediction | ⚪ Not claimed | Tankage. |
| **Scheduling & planning** | Material-balance monitoring | 🟡 Partly | **Built:** FCC feed vs product flows on the twin.<br>**Remaining:** reconciled refinery-wide balance. |
| **Scheduling & planning** | Feedstock evaluation | [🟠 Scripted outcome](./UC-FEED_feedstock_evaluation_crude_tracking.md) | **Built:** crude-switch detection (follows assay, labelled); models re-weight for the crude.<br>**Remaining:** LP assay import; crude purchase evaluation. |
| **Workforce empowerment** | Process-engineering / morning shift reporting | 🟢 Interactive | **Built:** Gemini shift-handover draft, decision cards, decision record.<br>**Remaining:** report export. |
| **Workforce empowerment** | Start-up procedure monitoring | ⚪ Not claimed | DCS start-up sequences. |
| **Workforce empowerment** | Loss tracking and categorisation | 🟡 Partly | **Built:** margin to spec (°F), off-spec risk, withheld-advice log — in plant terms, no money.<br>**Remaining:** loss categorisation database. |
| **Workforce empowerment** | Control-loop performance monitoring | ⚪ Not claimed | No PID / stiction engine in the demo path. |
| **Sustainability & compliance** | Automated regulatory reporting | ⚪ Not claimed | — |
| **Sustainability & compliance** | Flare and release calculations | ⚪ Not claimed | — |
| **Sustainability & compliance** | Furnace NOₓ emissions prediction | ⚪ Not claimed | — |
| **Sustainability & compliance** | Emissions during analyser exceedances | ⚪ Not claimed | — |
| **Pipeline & movement** | Leak detection and monitoring | ⚪ Not claimed | — |
| **Pipeline & movement** | Pigging-schedule prediction | ⚪ Not claimed | — |
| **Pipeline & movement** | Drag-reducing-agent (DRA) optimisation | ⚪ Not claimed | — |
| **Pipeline & movement** | Pump and valve performance | ⚪ Not claimed | — |
| **Pipeline & movement** | Custody / meter monitoring at scale | ⚪ Not claimed | — |
| **Pipeline & movement** | Line-pressure optimisation | ⚪ Not claimed | — |

**Every ⚪ row** is the same pattern on a different unit: the same models, trained on that unit's data, on the same lakehouse, the same decision desk, the same person in the loop. See [UC-OUT_OF_SCOPE](./UC-OUT_OF_SCOPE_non_fcc_refinery_assets.md).
