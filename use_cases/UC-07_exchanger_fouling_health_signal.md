# UC-07: Heat-Exchanger UA-Based Fouling Health Signal

> **Status:** 🟡 **Partly · FCC equivalent** — fouling signal real, overhead move scripted, no cleaning planner
> - **IOCL row #7:** Crude preheat trains / heat exchangers — *UA-based fouling health signal with degradation tracking and cleaning/shutdown optimisation* · Energy & reliability
> - **IOCL-reported benefit:** Sustained heat recovery; condition-based cleaning *(IOCL's wording)*
> - **Cockpit:** **U5 · Gas plant** (`/twin/unit/unit_5_condenser`) · agent: *Condenser agent*
> - **Decision:** **D7** move the overhead temperature target to keep the condenser inside its cooling duty?
> - **Lever:** `SP_T_overhead` — **cooling water stays at fixed duty and is never recommended**
> - **Note on scope:** IOCL named **crude preheat trains**. We show the same fouling-health pattern on the **FCC overhead condenser**.

## 1. The problem in plant terms
Condenser fouling shows as more cooling water needed for the same load. It is spotted only when the overhead temperature hits its limit on a warm afternoon — then the unit is constrained.

## 2. What we built
| Piece | What it does |
|---|---|
| Inputs | Condenser cooling-water flow, overhead temperature, the load on the condenser |
| Fouling signal | Cooling-water demand **above expected for this load** (a UA-degradation proxy) flagged by the drift-watch agent |
| Optimiser | Smallest overhead-temperature move that brings the condenser back inside its **fixed** cooling duty (≥ 95 % chance), ≤ 3 °F per step |
| Card | Move, chance before → after, time to limit (~180 min), never-recommends line, **scripted** tag |

## 3. What remains
- Crude preheat-train network (multi-exchanger UA, heat-recovery loss).
- UA trend forecast and **cleaning / shutdown planner**.
- A measured overhead-temperature gain (D7 gain ≈ 0 in the lever refit; cooling water is an open-loop input in the simulator).

## 4. How it solves IOCL's problem
The fouling health signal is real and tracked against the expected value for the load, so degradation is seen as a trend rather than at the limit. And it is turned into a move operators actually make (overhead target), instead of a recommendation to open cooling water that operators don't control.

## 5. Show it in the demo
| Step | Do | Point at | Say |
|---|---|---|---|
| 1 | **Scenario** → `random_s107`, 10:00 → **U5 · Gas plant** → step ① | Cooling water drawn as **fixed duty** | "Cooling water is fixed; we don't pretend operators can open it." |
| 2 | Step ② | Cooling-water demand above expected for this load | "More cooling water than expected for this load — that's the fouling signal." |
| 3 | Step ③ | **Raise overhead temperature set point +1.5 °F (245.9 → 247.4)**; chance back inside duty **31 % → 98 %**; never-recommends line (cooling-water flow, feed rate, catalyst addition) | "We only recommend settings your operators actually move." |

**Pass check:** cooling water is not in the lever list; the question reads "Move the overhead temperature target to keep the condenser inside its cooling duty?" *(Numbers from DEMO_SCRIPT, 3 Oct.)*

## 6. If asked
- *"Is this the crude preheat train?"* — "No — the FCC overhead condenser. Same UA-degradation idea; the preheat train is a pilot extension."
- *"When should we clean?"* — "Not built. The trend is there; the cleaning planner comes with your exchanger data."

## 7. Pilot on IOCL's plant
Exchanger inlet/outlet temperatures and flows on both sides (to compute UA), cleaning history; fit UA decay per exchanger; forecast the cleaning window.
