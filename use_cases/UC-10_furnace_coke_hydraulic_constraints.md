# UC-10: Furnace Coke Build-up and Hydraulic Constraints

> **Status:** 🟡 **Partly · FCC equivalent** — drift watch and hydraulic limit; no coke model
> - **IOCL row #10:** Crude-unit furnaces — *Coke-buildup and hydraulic-constraint prediction; anomaly detection; turnaround vs mid-run planning* · Reliability
> - **IOCL-reported benefit:** ~1% margin / ~3% production uplift + lower maintenance *(IOCL's figure, not ours)*
> - **Cockpit:** **U1 · Furnace** · answered by: *Anomaly detection · response model · optimiser*
> - **Decision:** none of its own — a drift flag in step ②; the feed-nozzle limit binds **D6**
> - **Note on scope:** IOCL named **crude-unit (CDU/VDU) furnaces**. We show the same pattern on the **FCC feed furnace**.

## 1. The problem in plant terms
Coke builds up slowly inside furnace tubes. It shows as outlet temperature drifting against fired duty, and nobody tracks that against what is expected for the crude now running — so cleaning is forced, not planned.

## 2. What we built
| Piece | What it does |
|---|---|
| Inputs | Preheat outlet temperature against fired duty; the value expected for this crude |
| Anomaly detection | Flags only when the gap is beyond ±3σ or keeps building (CUSUM) |
| Hydraulic constraint | Feed-nozzle velocity / coil limits actively bound the D6 preheat recommendation |
| Output | A lasting-drift flag on the furnace; no move proposed from this alone |

## 3. What remains
- A coke-deposition model and de-coke / turnaround date forecast.
- CDU / VDU furnaces (multi-pass, pass-flow balancing, TMT).
- Mid-run vs turnaround planning workflow.

## 4. How it solves IOCL's problem
Anomaly detection is shown for real: a slow drift is caught as a trend (CUSUM) before any single reading looks bad, and the hydraulic limit is respected in every furnace move. The prediction and planning half is not built — we say so.

## 5. Show it in the demo
| Step | Do | Point at | Say |
|---|---|---|---|
| 1 | **Scenario** → `random_s107`, 10:00 → **U1 · Furnace** → step ② | Top chart: measured vs expected; second chart: gap with dashed ±3σ and orange **CUSUM** | "A CUSUM that keeps climbing is a slow, lasting drift — how coke shows up." |
| 2 | Step ③ → **Levers and their allowed range** | Feed-nozzle limit on the preheat move | "Every move respects the hydraulic limit." |

## 6. If asked
- *"Do you predict the de-coke date?"* — "Not in this build. We flag the drift; the forecast is a pilot extension on your furnace data."
- *"Is this a CDU furnace?"* — "No — the FCC feed furnace. Same drift pattern, different unit."

## 7. Pilot on IOCL's plant
Furnace outlet, duty, pass flows, coil ΔP and TMT history across at least one run cycle; fit a coke-rate model against de-coke events; forecast the next de-coke window.
