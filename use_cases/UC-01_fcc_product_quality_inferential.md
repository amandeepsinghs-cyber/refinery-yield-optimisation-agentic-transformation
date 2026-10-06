# UC-01: FCC Product-Quality Inferential

> **Status:** 🟢 **Live — real models on simulated data**
> - **IOCL row #1:** FCC / RFCC / INDMAX — *Product-quality inferential (e.g. HGO sulphur soft sensor) to run closer to plan and avoid over- and under-treating* · Yield & quality
> - **IOCL-reported benefit:** ~$0.4–0.5M/yr per unit *(IOCL's figure, not ours)*
> - **Cockpit:** **U4 · Fractionator** (`/twin/unit/unit_4_fractionator`) · agent: *Soft-sensor agent*
> - **Decisions:** **D1** move the cut point now or wait for the lab (also D2, D9; D3 uses it)
> - **Levers:** `SP_LCO_T98` (LCO cut-point set point), `SP_HN_T98` (heavy-naphtha cut-point set point)
> - **Problem it answers:** P1 — quality known only every 8 h

## 1. The problem in plant terms
The main fractionator splits cracked vapour into heavy naphtha (petrol), LCO (diesel) and slurry. Where the boundary (the **cut point**, measured as T98) sits decides how much product lands in each stream. Today it is known only from the lab, every 8 h, about 1 h late. After a crude change the column runs blind for hours, so operators either **give away** product (cut too light, to stay safe) or go **off spec**.

## 2. What we built
| Piece | What it does |
|---|---|
| Inputs | Tray temperatures, LCO / HN draw temperatures, pumparound duties PA1–PA4, pressures, feed rate — every minute; the crude now running; lab T98 every 8 h |
| Soft sensor | 4-model committee: **Bayesian ridge**, **GPR**, **hybrid physics delta**, **PINN ensemble**; weighted for the crude; Kalman bias update on each lab; mixture distribution |
| Output | LCO T98 and HN T98 **every minute ± spread**, and **chance on spec** (specs: LCO ≤ 765 °F, HN ≤ 540 °F) |
| Optimiser | Smallest cut-point move (≤ 5 °F per step, 0.5 °F steps) that lifts P(on spec after the move) to ≥ 95 %; names the limit that set the size |
| Trust checks | 7–8 checks (spread, model agreement, inputs inside training range, lever window, SOP step). Fail → "Not yet" ([UC-11](./UC-11_product_soft_sensors_online_prediction.md)) |
| Person in the loop | **Accept / Hold 30 min / Decline** → decision record only; nothing written to the DCS |

**Honest numbers:** trained on 40 runs, checked on 14 held-out runs. Held-out MAE (unpinned truth): LCO 7.5 °F, HN 13.2 °F; 90 % interval coverage 79 % / 59 %. Training labels are simulator values sampled every 30 min (the simulated lab record is too thin); on site the models train on IOCL lab history. Modest accuracy is exactly why the trust gate exists.

## 3. What remains
- Sulphur / HGO property models — the simulator has no sulphur; the cut point stands in.
- Training and backtesting on IOCL historian + LIMS (Phase 1 of the pilot).
- Live LIMS feed and historian streaming (demo loads simulator batches).

## 4. How it solves IOCL's problem
"Run closer to plan" = run the cut point close to its spec instead of with a safety margin. The cockpit gives the quality **every minute instead of every 8 h**, advises the move **hours before the lab** would show the drift, and sizes it so the chance on spec stays ≥ 95 %. Result in plant terms: more product kept in the right stream, fewer off-spec hours after a crude change, fewer re-runs.

## 5. Show it in the demo
| Step | Do | Point at | Say |
|---|---|---|---|
| 1 | **Scenario** → `random_s107`, 10:00 → **U4 · Fractionator** → step **②** | Four bell curves (one per model) and their weights; lab points on the chart | "Four different kinds of model. Where they agree, we trust the estimate." |
| 2 | Step **③**, D1 tab | Estimate **535.1 ± 3.8 °F** vs **540 °F** spec; **Lower HN cut point −1.0 °F (530.3 → 529.3)**; chance on spec **91 % → 95 %**; **7 of 8** checks pass; **If nothing is done:** line; next lab 14:00 | "The lab is four hours away. The cut point moves now." |
| 3 | Drag **Try another move**, then put it back | Chance on spec updates live | "You can test any move before you make it." |
| 4 | Click **Accept** | Toast *"recorded in audit, nothing sent to the plant"*; footer **Actions taken on this unit** | "A person decides. Nothing goes to the control system." |
| 5 | **Scenario** → `random_s144`, 10:00 (held-out run) → step ④ **What sets the size of the move** | **Raise LCO cut point +2.5 °F (752.8 → 755.2)**; estimate **751.5 ± 4.0 °F** vs 765 °F; "Trained on 40 runs, checked on 14 held-out runs" | "A run it never saw. Smallest move that keeps more diesel while staying above 95 % on spec." |

**Pass check:** D1 card shows a from → to move, chance before → after, and the named binding limit. *(Numbers from DEMO_SCRIPT, 3 Oct; read the card on the day.)*

## 6. If asked
- *"Where's sulphur?"* — "The simulator has no sulphur, so the cut point stands in. Same method, different property, on your data."
- *"How accurate?"* — "On held-out simulated runs, about 7.5 °F on LCO. Site accuracy comes from a backtest on your history, and the gate stops advice when it's unsure."
- *"Why 95 %?"* — "It's a placeholder threshold for the chance on spec after the move; you set it."

## 7. Pilot on IOCL's plant
Read-only historian tags for the FCC fractionator, LIMS results (D86 / T90 / T95 and sulphur), crude assays. Train on 2–3 years, test on unseen months, shadow mode against every live lab, then advise D1 on the cut point first.
