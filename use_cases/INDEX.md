# IOCL Refinery Use Cases → FCC Agentic Digital Twin: Index

> **Bottom line:** of the IOCL list, **2 rows run end-to-end on real models** (#1, #11), **9 are shown end-to-end with real inputs and labelled scripted outcomes, partial coverage, or watch-only** (#2–#10 plus feedstock evaluation), and the **non-FCC rows are not claimed**. Everything runs on one agentic digital twin of the six-unit FCC complex, on simulated data, advisory only.

**Presenting?** Start with **[PRESENTER_PACK.md](./PRESENTER_PACK.md)**. The presentation does **not** go use case by use case: it tells the story of a refinery, then follows the oil through the FCC's six units (feed → furnace → riser → regenerator → fractionator → gas plant & stabiliser → whole unit), meeting each IOCL row at the stop where it happens. This index and the `UC-*.md` files are the reference behind each stop.

**Source list:** [refinery_optimisation_use_cases.md](./refinery_optimisation_use_cases.md) (IOCL's list with IOCL's value figures, attributed, plus our status for every row).

---

## 1. Coverage map, in IOCL order

Value figures are **IOCL's own** (from their list) and are shown so the audience sees we have ranked their priorities. They are not our estimates or commitments.

| IOCL # | Use case | IOCL-reported benefit | Status | Cockpit unit (nav) | Decision · lever | Detail |
|:-:|---|---|---|---|---|---|
| #1 | FCC product-quality inferential | ~$0.4–0.5M/yr per unit | 🟢 **Live** | U4 · Fractionator | D1 · `SP_LCO_T98`, `SP_HN_T98` | [UC-01](./UC-01_fcc_product_quality_inferential.md) |
| #2 | Stabiliser overhead, C5 recovery *(reformer)* | ~$2–3M/yr | 🟠 Scripted outcome · FCC equivalent | U5 · Gas plant / U6 · Stabiliser | D7 · `SP_T_overhead` | [UC-02](./UC-02_stabiliser_overhead_c5_recovery.md) |
| #3 | LPG / LSR naphtha C4/C5 split | ~$2–2.5M/yr | 🟠 Scripted outcome · FCC equivalent | U5 / U6 | D7 · `SP_T_overhead`, `MV_reflux_ratio` | [UC-03](./UC-03_lpg_balance_distillation_split.md) |
| #4 | Regeneration-cycle tracking & RCA *(CCR / hydroprocessing)* | ~$0.7M/yr+ | 🟠 Scripted outcome · FCC equivalent | U3 · Regenerator | D5 · `Fair` | [UC-04](./UC-04_reactor_regeneration_tracking.md) |
| #5 | Fired-heater CO/O₂ combustion | ~$0.4–1M/yr per site | 🟠 Scripted outcome · gain measured | U1 · Furnace | D6 · `SP_T_preheat_F` | [UC-05](./UC-05_fired_heaters_combustion_modelling.md) |
| #6 | Multi-unit energy management | >$10M/yr (multi-refinery) | 🟡 Partly | FCC Complex · U4 | D3 recipe · D8 trace | [UC-06](./UC-06_multi_unit_energy_management.md) |
| #7 | Exchanger UA fouling health *(crude preheat)* | Sustained heat recovery | 🟡 Partly · FCC equivalent | U5 · Gas plant | D7 · `SP_T_overhead` | [UC-07](./UC-07_exchanger_fouling_health_signal.md) |
| #8 | Filter / coalescer breakthrough | ~$2M/yr+ | 👁 Watch only · FCC equivalent | U2 · Riser | D8 (watch) | [UC-08](./UC-08_filtration_systems_breakthrough.md) |
| #9 | Rotating-equipment asset health | order $1–9M | 👁 Watch only | U2 · Riser (consequence) | D8 (watch) | [UC-09](./UC-09_rotating_equipment_asset_health.md) |
| #10 | Crude-furnace coke & hydraulics | ~1% margin / ~3% production | 🟡 Partly · FCC equivalent | U1 · Furnace | D6 (drift watch) | [UC-10](./UC-10_furnace_coke_hydraulic_constraints.md) |
| #11 | Product soft sensors between labs | Earlier off-spec detection | 🟢 **Live** | U4 · Fractionator | D2 trust · D9 extra sample | [UC-11](./UC-11_product_soft_sensors_online_prediction.md) |
| Cat. | Feedstock evaluation (crude switch) | — | 🟠 Scripted outcome | U4 step ② (all units) | D4 crude regime | [UC-FEED](./UC-FEED_feedstock_evaluation_crude_tracking.md) |
| — | Coker, CDU/VDU, alkylation, utilities & flare, pipelines | (various) | ⚪ Not claimed | — | — | [Out of scope](./UC-OUT_OF_SCOPE_non_fcc_refinery_assets.md) |

### Status definitions (same words as the on-screen chips)

| Chip | Meaning | What we say |
|---|---|---|
| 🟢 **Live** | Real models trained on simulator data, running minute by minute with uncertainty and trust checks. | "Shown." |
| 🟠 **Scripted outcome** | Real simulator inputs and a real drift / event; the *size* of the move is scripted and labelled on screen. | "Real input, scripted outcome, labelled." |
| 🟡 **Partly** | Part of the use case is shown (e.g. a drift flag); the rest (e.g. a coke model, a cleaning planner) is not built. | "Partly — here's the part." |
| 👁 **Watch only** | The signal is flagged with its downstream consequence; no move is advised. | "We flag it; we don't advise." |
| *FCC equivalent* | IOCL named a unit we don't have; we show the same engineering problem on the matching FCC unit. | "Same problem, on the FCC." |
| ⚪ **Not claimed** | Outside the FCC battery limits. | "Same pattern, new agent, not built." |

---

## 2. The four problems behind the list

| Problem | Decisions | IOCL rows |
|---|---|---|
| **P1** Product quality known only every 8 h | D1, D9 | #1, #11 |
| **P2** Crude changes every 12–48 h | D4, D3, D6 | Feed, #5, #6 |
| **P3** A move in one unit shows up hours later in another | D3, D5, D7, D8 | #2, #3, #4, #6, #7, #8, #9, #10 |
| **P4** An AI that always answers is dangerous | D2 | #11 (and all) |

## 3. Decision inventory (what the cards on screen are)

| ID | Question on the card | Unit | Status |
|:-:|---|---|---|
| D1 | Move the cut point now, or wait for the lab? | U4 Fractionator | 🟢 Live |
| D2 | Can the estimate be trusted right now? ("Not yet") | U4 Fractionator | 🟢 Live |
| D3 | Which set points, together, for the new crude? | U4 + U2 | 🟠 Scripted; withheld when D2 fails |
| D4 | Which crude is running, and is the switch done? | All (step ②) | 🟠 Scripted (follows assay) |
| D5 | Rebalance regenerator air against afterburn? | U3 Regenerator | 🟠 Scripted |
| D6 | Trim feed preheat for the new crude? | U1 Furnace | 🟠 Gain measured · chance scripted |
| D7 | Move the overhead temperature target (condenser duty / C5 / split)? | U5 Gas plant, U6 Stabiliser | 🟠 Scripted |
| D8 | Act on the riser now, before it reaches the regenerator? | U2 Riser + downstream | 👁 Watch |
| D9 | Pull an extra lab sample now? | U4 Fractionator | 🟢 Live |

## 4. Screen map

| Nav label | Route | Used for |
|---|---|---|
| **Overview** | `/platform` | Today: six layers · use-case cards · person in the loop · MeitY · predict-decide-measure-learn. **Planned (SDD §14.6E):** on top, FP-1 the refinery with IOCL use cases pinned and status dots; then FP-2 decisions (expandable, "how it works"); existing sections stay below |
| **FCC Complex** | `/twin` | Whole-refinery view: six units, "What went wrong", decision pins, use-case band |
| **U1 · Furnace** … **U6 · Stabiliser** | `/twin/unit/<unit_id>` | Unit page: ① Data · ② Observe · ③ Decision · ④ Optimise · footer actions |
| **Decision record** | `/audit` | Every Accept / Hold / Decline and every time checks held advice back |
| Top-right **Scenario** | — | Pick run (`random_s107`, `random_s144`) and minute |
| **Ask Gemini** | every page | Read-only copilot; EN / Hinglish / हिंदी |

Unit ids: `unit_1_furnace`, `unit_2_riser`, `unit_3_regenerator`, `unit_4_fractionator`, `unit_5_condenser` (Gas plant), `unit_6_stabiliser`.
