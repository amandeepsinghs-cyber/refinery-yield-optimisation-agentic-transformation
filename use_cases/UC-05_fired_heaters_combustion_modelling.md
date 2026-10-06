# UC-05: Fired Heaters — CO and O₂ Combustion Modelling

> **Status:** 🟠 **Scripted outcome on real inputs — preheat gain measured, chance band scripted**
> - **IOCL row #5:** Fired heaters / furnaces — *CO and O₂ combustion modelling; automatic flagging of poor-combustion episodes* · Energy
> - **IOCL-reported benefit:** Fuel savings + CO₂/SOₓ/NOₓ reduction; ~$0.4–1M/yr per site *(IOCL's figure, not ours)*
> - **Cockpit:** **U1 · Furnace** (`/twin/unit/unit_1_furnace`) · agent: *Furnace agent*
> - **Decision:** **D6** trim the feed preheat for the new crude?
> - **Lever:** `SP_T_preheat_F` (feed preheat set point) — sets catalyst-to-oil and regenerator temperature
> - **Problems it answers:** P2 (crude changes), P3 (knock-on to riser and regenerator)

## 1. The problem in plant terms
Combustion is judged by eye on the board. A poor-combustion episode (CO rising while O₂ looks normal) is found late. After a crude change the preheat is set by habit — and because preheat sets catalyst circulation, the riser and regenerator end up compensating hours later.

## 2. What we built
| Piece | What it does |
|---|---|
| Inputs | Flue-gas CO and O₂, fired duty, preheat outlet temperature, feed rate, the crude now running |
| Drift-watch agent | Flags a flue-gas CO pattern and furnace drifts against the value expected for this crude (±3σ or CUSUM) |
| Response model | Preheat outlet follows its set point **1.007 °F per °F**; catalyst circulation falls ~109 units per °F — **measured** on 52 simulator step tests (held-out R² 1.0 / 0.95) |
| Optimiser | Smallest preheat move that puts preheat at this crude's target (≥ 95 % chance), ≤ 5 °F per step, 20 min between steps, inside the feed-nozzle limit |
| Card | Move from → to, chance before → after, "If nothing is done" with time to consequence, proof loop (Predict · Decide · Measure · Learn) |

**Labelled on screen:** lever tag **gain measured · chance scripted**; Predict chip **Measured gain · chance scripted**.

## 3. What remains
- Excess-O₂ / burner trim and draft control — **excess O₂ is not a lever in the simulator, so it is never advised**.
- Tube-metal temperature (TMT), NOₓ / CO₂ quantification.
- The chance band (σ, gate values) is a fixed rule; on site it comes from IOCL step tests.

## 4. How it solves IOCL's problem
The poor-combustion pattern is flagged automatically instead of by eye, and the furnace move for the new crude is advised **before** the riser and regenerator have to compensate — the whole-system lens applied to a fired heater. Benefit in plant terms: steadier firing for the crude, fewer CO episodes.

## 5. Show it in the demo
| Step | Do | Point at | Say |
|---|---|---|---|
| 1 | **Scenario** → `random_s107`, 10:00 → **U1 · Furnace** | Step ② drift chart: measured vs expected, gap with ±3σ and CUSUM | "The furnace is watched against what's expected for this crude." |
| 2 | Step ③ | **Raise feed preheat set point +1.5 °F (616.0 → 617.5)**; chance at this crude's target **31 % → 96 %**; 4 of 4 checks; lever tag **gain measured · chance scripted** | "One small move, inside the feed-nozzle limit." |
| 3 | Read **If nothing is done:** | Catalyst circulation rises in ~170 min; afterburn margin narrows | "Leave it, and the regenerator pays for it in three hours." |
| 4 | Step ④ → proof loop | Predict (measured gain) · Decide (built) · Measure (shown) · Learn (pilot) | "This gain we measured in 52 step tests. On your plant, the pilot does the same with your data." |

**Pass check:** lever role line and never-recommends line present; tag reads "gain measured · chance scripted". *(Numbers from DEMO_SCRIPT, 3 Oct.)*

## 6. If asked
- *"Why not trim excess O₂ directly?"* — "In this simulator O₂ isn't a lever, so we don't advise it. We only recommend settings operators actually move. On your heaters, O₂ trim is a natural extension."
- *"Is catalyst-to-oil a set point?"* — "No — it's an effect of preheat. The card claims catalyst-to-oil only."

## 7. Pilot on IOCL's plant
Flue-gas analyser history (O₂, CO), fuel and duty, preheat outlet and set point; small preheat step tests inside the SOP to measure the gain on IOCL's furnace; then O₂ trim as a separate lever if IOCL wants it.
