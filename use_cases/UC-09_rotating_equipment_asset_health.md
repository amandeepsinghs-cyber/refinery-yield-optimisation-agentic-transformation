# UC-09: Rotating Equipment Across Sites — Asset Health

> **Status:** 👁 **Watch only** — compressor and air-blower load traced to the upstream cause; no machine-health model
> - **IOCL row #9:** Rotating equipment across sites (compressors, pumps) — *Asset-health monitoring and predictive maintenance scaled across refineries* · Reliability
> - **IOCL-reported benefit:** Avoided downtime + planning gains (order $1–9M) *(IOCL's figure, not ours)*
> - **Cockpit:** **U2 · Riser** (D8 consequence) and **FCC Complex** · answered by: *Consequence check*
> - **Decision:** **D8** — watch, with the downstream consequence; no move
> - **Signals:** wet-gas compressor power (`power_WGC`), combustion air-blower power (`power_CAB`)

## 1. The problem in plant terms
Compressor and air-blower load rise as a **consequence** of upstream moves (over-cracking → more gas → more compressor load; more coke → more air). It is seen on the machine, not traced back to the cause.

## 2. What we built
| Piece | What it does |
|---|---|
| Inputs | Wet-gas compressor and air-blower load, as consequences of upstream drift |
| Consequence check | Traces the chain riser → regenerator → compressor / blower and names the upstream cause |
| Output | A watch item; no move proposed |

## 3. What remains
- Machine health itself: vibration (FFT), bearings, seals, lube oil.
- Predictive maintenance and fleet scale across refineries.

## 4. How it solves IOCL's problem
The systems half only: machine load is traced back to its process cause upstream, so an operator can act on the cause instead of the symptom. Predictive maintenance on the machines is not claimed.

## 5. Show it in the demo
| Step | Do | Point at | Say |
|---|---|---|---|
| 1 | **Scenario** → `random_s107`, 10:00 → **U2 · Riser** → step ③ | Watch card and its downstream consequence: coke → regenerator temperature → compressor / air-blower load | "Over-cracking raises coke, then regenerator temperature, then compressor load. We show the chain; we don't invent a move." |

## 6. If asked
- *"Is this predictive maintenance?"* — "No. It's the process side: why the machine is loaded. Vibration and seal health on your fleet is a new model trained on your condition-monitoring data."

## 7. Pilot on IOCL's plant
Compressor / blower power, speed, suction and discharge conditions, vibration and lube-oil data; link process-load changes to machine health.
