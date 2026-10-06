# UC-06: Multi-Unit Energy Management

> **Status:** 🟡 **Partly** — whole-FCC systems view and coordinated recipe; no utilities / energy dashboard
> - **IOCL row #6:** Multi-unit / multi-refinery utilities — *Energy-management dashboards (boilers, furnaces, steam balance, O₂ control)* · Energy
> - **IOCL-reported benefit:** >$10M/yr at multi-refinery scale *(IOCL's figure, not ours — the largest on the list)*
> - **Cockpit:** **FCC Complex** (`/twin`) and **U4 · Fractionator** (D3) · answered by: *Consequence check*
> - **Decisions:** **D3** which set points, together, for the new crude? · **D8** what one unit's drift does downstream
> - **Levers (D3):** `SP_T_riser_ROT_F` (riser outlet temperature), `SP_LCO_T98`, `SP_HN_T98` (+ `SP_T_preheat_F`, `MV_PA1..4` in the search space)
> - **Problem it answers:** **P3** — a move in one unit shows up hours later in another

## 1. The problem in plant terms
Each console optimises its own unit. A move in one shows up hours later in another — preheat changes catalyst circulation, which changes the regenerator, which changes compressor load and fuel. No one sees the whole chain, so energy and yield are traded off by accident.

## 2. What we built — this is the "whole system" lens
| Piece | What it does |
|---|---|
| Digital twin of the FCC complex | Six connected units on one screen (Feed furnace → Riser → Regenerator → Fractionator → Gas plant → Stabiliser), with "What went wrong" and decision pins per unit |
| Consequence check | **19 rules** over the catalyst, heat and hydrocarbon loops; every card carries "If nothing is done" (consequence + time) and the effect on the next units |
| Recipe search (D3) | Multi-set-point search scoring yield (LCO 1.0, HN 0.8, LPG 0.4) **minus** penalties for furnace fuel, compressor power and coke, inside step limits and integrity operating windows |
| Plausibility gate | Recipe withheld if the predicted effect exceeds ±3 MW compressor power, ±50 lb/s furnace fuel or ±1.5 % of feed on any yield; withheld whenever D2 says the soft sensor isn't trusted |
| Recipe proof | Recipe replayed through the simulator with and without: conversion **+0.44 %** vs **+0.42 %** predicted (inside band); cut-point part not proven → stays **scripted** |

## 3. What remains
- Site utilities: boilers, steam balance, fuel-gas header, O₂ control — **no energy dashboard**.
- Multi-refinery scale.
- Measured gains for the riser-temperature part of the recipe (scripted).

## 4. How it solves IOCL's problem
This is the foundation for IOCL's highest-value row: moves are chosen **for the whole FCC, not one console at a time**, with fuel, power and coke counted against yield, and the knock-on effect shown before the move. Extending to steam and utilities is the same pattern with more units on the lakehouse — not built today, and we say so.

## 5. Show it in the demo
| Step | Do | Point at | Say |
|---|---|---|---|
| 1 | **Scenario** → `random_s107`, 10:00 → **FCC Complex** | Six units in flow order; **What went wrong**; pins **Decide** (furnace, regenerator, fractionator, gas plant) and **Watch** (riser) | "One digital twin of the whole complex. Each unit gets its own move, and they see each other's consequences." |
| 2 | Any unit card → **If nothing is done:** and the **Systems ripple** line | Consequence and time in the next unit | "The knock-on effect is on the card before anyone moves." |
| 3 | *(Optional)* **Scenario** → `random_s144`, 10:00 → **U4 · Fractionator** → **D3** tab → step ④ **How do we know the move works?** | Recipe (riser outlet temperature, LCO and HN cut points), **scripted outcome** tag, proof loop, recipe-check evidence | "The conversion prediction held; the cut-point part isn't proven yet, so it stays labelled." |
| 4 | **Scenario** → 12:00 | D3 **withheld** because D2 failed | "No coordinated recipe when the base estimate isn't trusted." |

> [!WARNING]
> Check D3 on the day. On a degraded local API (BigQuery unreachable) D3 at `random_s144` showed an un-scripted "Coordinated move: LCO −7.8 °F, HN −7.2 °F". If that appears, **skip the optional D3 scene**.

## 6. If asked
- *"Where's the energy dashboard?"* — "Not built. What we show is the harder part: one optimiser that counts fuel, power and coke against yield across six units. Utilities are the next units on the same lakehouse."
- *"Why is the recipe withheld so often?"* — "Because it depends on the cut-point estimate. If that isn't trusted, a coordinated move isn't either."

## 7. Pilot on IOCL's plant
FCC-wide historian (all six units), fuel and power meters, then utilities (steam, fuel gas) as further agents. Coordinated recipes only in Phase 4, after each lever is proven individually.
