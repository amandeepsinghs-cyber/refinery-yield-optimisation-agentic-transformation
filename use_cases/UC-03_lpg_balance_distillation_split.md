# UC-03: LPG Balance and Distillation-Split Optimisation (C4/C5 Split)

> **Status:** 🟠 **Scripted outcome on real inputs · FCC equivalent**
> - **IOCL row #3:** LPG / LSR naphtha system — *LPG balance and distillation-split optimisation (C4/C5 split); improved forecasting* · Yield & quality
> - **IOCL-reported benefit:** ~$2–2.5M/yr *(IOCL's figure, not ours)*
> - **Cockpit:** **U6 · Stabiliser** and **U5 · Gas plant** · agent: *Light-ends agent*
> - **Decision:** **D7** adjust the stabiliser overhead temperature for the LPG / naphtha split?
> - **Levers:** `SP_T_overhead`, `MV_reflux_ratio`
> - **Note on scope:** IOCL named the **LPG / LSR naphtha system**. We show the C4/C5 split on the **FCC stabiliser**; no refinery LPG header.

## 1. The problem in plant terms
The LPG / light-naphtha split is run by experience. C4 left in naphtha raises vapour pressure; C5 in LPG is lost value. After a crude change the right split setting moves, and the effect of a move shows up hours later.

## 2. What we built
| Piece | What it does |
|---|---|
| Inputs | Stabiliser overhead and bottoms signals, reflux, the crude now running |
| Optimiser | Overhead set point / reflux chosen so both products stay on their split targets; expected result shown before acting |
| Card | Move, chance before → after, **scripted** tag |

## 3. What remains
- Refinery-wide LPG header balance and LSR naphtha system.
- **Forecasting** of LPG yield / balance.
- Measured split gain (scripted today, as UC-02).

## 4. How it solves IOCL's problem
The split is moved through the setting operators actually use, with the expected result visible **before** acting, and re-targeted for the crude now running rather than yesterday's. Balance and forecasting at refinery scale are not built.

## 5. Show it in the demo
Shown together with [UC-02](./UC-02_stabiliser_overhead_c5_recovery.md): **U5 · Gas plant** D7 card at `random_s107` 10:00, then **U6 · Stabiliser** for the split tags and use-case strip.

**Say:** *"One overhead lever, three of your rows: condenser duty, C5 recovery, and the C4/C5 split. That's why we look at the system, not the row."*

## 6. If asked
- *"Do you forecast LPG?"* — "Not in this build. The split control is shown; forecasting comes with your historian."
- *"Is this an LPG splitter?"* — "No — the FCC stabiliser. Don't say 'LPG splitter'."

## 7. Pilot on IOCL's plant
Stabiliser and LPG product analysers, rundown flows, naphtha RVP; split step tests; LPG yield forecasting from the crude plan.
