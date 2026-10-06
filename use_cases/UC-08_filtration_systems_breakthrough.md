# UC-08: Filtration Systems — Filter / Coalescer Breakthrough Prediction

> **Status:** 👁 **Watch only · FCC equivalent** — hydraulic drift flagged with consequence; no breakthrough model
> - **IOCL row #8:** Filtration systems (alkylation, amine, hydroprocessing) — *Filter/coalescer breakthrough prediction to avoid fouling and unplanned changeouts* · Reliability
> - **IOCL-reported benefit:** Avoided changeouts and outages (~$2M/yr+) *(IOCL's figure, not ours)*
> - **Cockpit:** **U2 · Riser** (`/twin/unit/unit_2_riser`) and FCC Complex · agent: *Systems agent*
> - **Decision:** **D8** act on the riser now, before it reaches the regenerator? — **watch, no move**
> - **Note on scope:** IOCL named **alkylation, amine and hydroprocessing filters**. None are in the FCC simulator. We show the same "slow hydraulic drift → limit" pattern on FCC hydraulics (reactor–fractionator ΔP).

## 1. The problem in plant terms
Hydraulic and filter problems build slowly (rising ΔP) and are noticed only when a limit is hit — forcing an unplanned change-out or rate cut.

## 2. What we built
| Piece | What it does |
|---|---|
| Inputs | Riser conversion and hydraulic signals (e.g. reactor–fractionator ΔP) against expected for this crude |
| Drift-watch agent | Flags a lasting drift (±3σ or CUSUM) |
| Output | A **watch item**: what will happen downstream, and roughly when. No move proposed |

## 3. What remains
- Any filter / coalescer breakthrough model.
- Alkylation, amine, hydroprocessing units.

## 4. How it solves IOCL's problem
Only the early-warning half: a slow hydraulic drift is flagged before a limit forces action, with its downstream consequence. Prediction of breakthrough on IOCL's filters is not claimed.

## 5. Show it in the demo
| Step | Do | Point at | Say |
|---|---|---|---|
| 1 | **Scenario** → `random_s107`, 10:00 → **U2 · Riser** → step ③ | **Watch: riser conversion +0.5 % above expected (sustained shift)**; **no Accept button** | "Sometimes the right answer is 'watch'." |
| 2 | Step ② | Drift chart and CUSUM | "We catch the slow build before the limit." |

## 6. If asked
- *"Do you predict filter breakthrough?"* — "No. We show early warning on FCC hydraulics. Breakthrough on your alkylation and amine filters is a new agent with their ΔP data."

## 7. Pilot on IOCL's plant
Filter / coalescer ΔP, flow and change-out history on the named units; ΔP-vs-throughput model; projected limit date.
