# UC-02: Stabiliser-Tower Overhead Optimisation (C5 Recovery)

> **Status:** 🟠 **Scripted outcome on real inputs · FCC equivalent**
> - **IOCL row #2:** Catalytic reformer — *Stabiliser-tower overhead optimisation to maximise C5 recovery* · Yield & quality
> - **IOCL-reported benefit:** ~$2–3M/yr gross-margin uplift *(IOCL's figure, not ours)*
> - **Cockpit:** **U6 · Stabiliser** (`/twin/unit/unit_6_stabiliser`) and **U5 · Gas plant** · agent: *Light-ends agent*
> - **Decision:** **D7** adjust the stabiliser overhead temperature for C5 recovery?
> - **Levers:** `SP_T_overhead` (overhead temperature target), `MV_reflux_ratio` (stabiliser reflux)
> - **Note on scope:** IOCL named the **catalytic reformer** stabiliser. **The reformer is not in this build**; we show the same overhead-vs-C5 problem on the **FCC gas plant and stabiliser**.

## 1. The problem in plant terms
C5 (pentane) belongs in gasoline. If the stabiliser overhead runs too hot, C5 slips into LPG; too cold, reflux energy is wasted and LPG stays in the gasoline. Today the C5 lost to LPG is found in the next lab and corrected after the fact.

## 2. What we built
| Piece | What it does |
|---|---|
| Inputs | Stabiliser C5 recovery (`eff_C5`), overhead temperature, reflux, cooling water, the crude |
| Drift-watch agent | Flags C5-recovery drift against expected for this crude as it starts |
| Optimiser | Smallest overhead move that keeps C5 recovery in its band, inside the SOP step; expected effect shown before acting |
| Card | Move, chance before → after, **scripted** tag, effect on the gas plant (shared overhead) |

## 3. What remains
- The reformer stabiliser itself.
- A **measured** overhead gain (D7 has no clean simulator basis — cooling water is an open-loop input; it stays scripted).
- LPG C5 analyser / GC integration; gasoline RVP compliance.

## 4. How it solves IOCL's problem
The C5 slip is flagged as it starts instead of at the next lab, and the overhead move is advised with its expected effect — so C5 stays in gasoline. The engineering is identical to the reformer stabiliser; only the unit differs.

## 5. Show it in the demo
| Step | Do | Point at | Say |
|---|---|---|---|
| 1 | **Scenario** → `random_s107`, 10:00 → **U5 · Gas plant** step ③ | The D7 overhead-temperature card (**+1.5 °F, 245.9 → 247.4**, scripted) — the shared overhead lever | "The same overhead set point drives condenser duty, C5 recovery and the LPG split." |
| 2 | Open **U6 · Stabiliser** | The unit's IOCL use-case strip (#2, #3) at the top; step ① C5 recovery and tray readings; levers `SP_T_overhead`, `MV_reflux_ratio` | "This is your row #2 — on the FCC stabiliser, not the reformer." |
| 3 | If a D7 card is live on U6 at the chosen minute, open step ③ | Question **"Adjust the stabiliser overhead temperature for C5 recovery?"** | "Move sized so C5 recovery stays in its band; labelled scripted." |

> [!NOTE]
> At `random_s107` 10:00 the D7 card is on **U5 · Gas plant**. A D7 card appears on U6 only when a stabiliser drift is live — **check on the day** which minute shows it, or present it through U5 as above.

## 6. If asked
- *"Do you have a reformer?"* — "No. Same stabiliser problem on the FCC; the reformer is a new agent on the same lakehouse."
- *"How big is the C5 gain?"* — "The move size is scripted. On your plant, a short overhead step test measures it."

## 7. Pilot on IOCL's plant
Stabiliser overhead temperature, reflux, pressure, LPG C5 analyser or lab, gasoline RVP; overhead step tests to measure the C5 response.
