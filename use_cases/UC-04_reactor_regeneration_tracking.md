# UC-04: Reactor Regeneration — Cycle Tracking and Root-Cause Analysis

> **Status:** 🟠 **Scripted outcome on real inputs · FCC equivalent** — afterburn event real, air-move size scripted
> - **IOCL row #4:** Reactor regeneration (CCR / hydroprocessing) — *Regeneration-cycle tracking, optimisation and event-based root-cause analysis* · Yield & quality
> - **IOCL-reported benefit:** ~1% reduction in cycle-time/yield losses (~$0.7M/yr+) *(IOCL's figure, not ours)*
> - **Cockpit:** **U3 · Regenerator** (`/twin/unit/unit_3_regenerator`) · agent: *Regenerator agent*
> - **Decision:** **D5** rebalance regenerator air against riser severity?
> - **Lever:** `Fair` (regenerator air — excess O₂ / afterburn)
> - **Note on scope:** IOCL named **CCR / hydroprocessing** regeneration. We show the same pattern on the **FCC regenerator**, which burns coke off the catalyst continuously.

## 1. The problem in plant terms
Afterburn (CO burning in the cyclones) erodes cyclone metal-temperature margin. It is noticed when the cyclone temperatures alarm. Whether the air or the riser severity caused it after a crude change is worked out after the event.

## 2. What we built
| Piece | What it does |
|---|---|
| Inputs | Cyclone ΔT (`dT_cyc_reg_F`, afterburn), regenerator temperature, regenerator air, flue-gas O₂, riser severity, the crude |
| Drift-watch agent | Tracks cyclone ΔT against expected; logs each drift event with its likely cause (event-based RCA) |
| Response model | Cyclone ΔT ≈ 0.4 °F per 0.01 lb/s air — **scripted** |
| Optimiser | Smallest air move that brings cyclone ΔT back into band (≥ 95 % chance), ≤ 3 % per step, 15 min between steps |
| Card | Move, chance before → after, **time to breach**, scripted tag, proof loop |

## 3. What remains
- CCR / hydroprocessing regeneration cycles (pin-lock, burn profiles, decoking).
- A **measured** air gain — the lever-run refit showed D5 rarely settles in the simulator, so it stays scripted.
- Cycle-time optimisation.

## 4. How it solves IOCL's problem
"Event-based root-cause analysis" — each afterburn drift is logged with its likely driver as it starts, not reconstructed afterwards. "Tracking and optimisation" — the air move is advised about 3 h before the operating window is breached, with the consequence on the card.

## 5. Show it in the demo
| Step | Do | Point at | Say |
|---|---|---|---|
| 1 | **Scenario** → `random_s107`, 10:00 → **U3 · Regenerator** → step ② | Cyclone ΔT drifting from expected; **Likely driver** | "The event is real and the likely cause is logged as it starts." |
| 2 | Step ③ | **Lower regenerator air −0.03 lb/s (2.65 → 2.62)**; chance in band **31 % → 95 %**; ~180 min to breach; **scripted** tag | "The consequence and the time to it are on the card before anyone moves." |
| 3 | Step ④ | Proof loop | "The size is scripted until a step test on your plant measures it." |

*(Numbers from DEMO_SCRIPT, 3 Oct.)*

## 6. If asked
- *"Is this a CCR?"* — "No — the FCC regenerator. Same problem: tracking a regeneration process and finding the cause of each event."
- *"Why scripted?"* — "In the simulator the air move rarely settles cleanly, so we won't show a number the data can't back."

## 7. Pilot on IOCL's plant
Regenerator temperatures, cyclone outlet temperatures, air, flue-gas O₂/CO history; small air step tests inside the SOP to measure the gain; event log for RCA.
