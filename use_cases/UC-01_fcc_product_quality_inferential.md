# UC-01: FCC Product-Quality Inferential

> **Status:** 🟢 **Interactive — real models on simulated data**
> - **IOCL row #1:** FCC / RFCC / INDMAX — *Product-quality inferential (e.g. HGO sulphur soft sensor) to run closer to plan and avoid over- and under-treating* · Yield & quality
> - **IOCL-reported benefit:** ~$0.4–0.5M/yr per unit *(IOCL's figure, not ours; do not read it out)*
> - **Cockpit:** **U4 · Fractionator** (`/twin/unit/unit_4_fractionator`) · answered by: *4-model soft sensor (incl. PINN) · trust checks*
> - **Decisions:** **D1** move the cut point now or wait for the lab (also D2, D9; D3 uses it)
> - **Levers:** `SP_LCO_T98` (LCO cut-point set point), `SP_HN_T98` (heavy-naphtha cut-point set point)
> - **Problem it answers:** P1 — quality known only every 8 h

## 1. The problem in plant terms
The main fractionator splits cracked vapour into heavy naphtha (petrol), LCO (diesel) and slurry. Where the boundary (the **cut point**, measured as T98) sits decides how much product lands in each stream. Today it is known only from the lab, every 8 h, about 1 h late. After a feed change the column runs blind for hours, so operators either **give away** product (cut with a safety margin — over-treating) or go **off spec** (under-treating).

## 2. What we built
| Piece | What it does |
|---|---|
| Inputs | Tray temperatures, LCO / HN draw temperatures, pumparound duties PA1–PA4, pressures, feed rate — every minute; lab T98 every 8 h |
| Soft sensor | 4-model committee: **Bayesian ridge** (reference only, weight 0), **GPR**, **hybrid physics delta**, **PINN ensemble**; weighted by each model's accuracy on recent lab results (else held-out runs); Kalman bias update on each lab; mixture distribution |
| Output | LCO T98 and HN T98 **every minute ± spread**, and **chance on spec** (specs: LCO ≤ 765 °F, HN ≤ 540 °F) |
| Optimiser | Smallest cut-point move (≤ 5 °F per step, 0.5 °F steps) that lifts the chance on spec after the move to ≥ 95 %; names the limit that set the size |
| Trust checks | 8 checks (spread, model agreement, inputs inside training range, lever window, SOP step …). Fail → "Not yet" and, when useful, "pull an extra sample" ([UC-11](./UC-11_product_soft_sensors_online_prediction.md)) |
| Person in the loop | **Accept / Hold 30 min / Decline** → decision record only; nothing written to the DCS |

**Honest numbers:** trained on 40 runs, checked on 14 held-out runs. Held-out MAE (unpinned truth): LCO 7.5 °F, HN 13.2 °F. 90 % interval coverage: LCO 79 %, **HN 59 % — the HN band is too narrow**; to be recalibrated on IOCL lab data in the pilot. Training labels are simulator values sampled every 30 min (the simulated lab record is too thin); on site the models train on IOCL lab history. Modest accuracy is exactly why the trust checks exist.

**Assumed, not measured:** the product cut point is taken to follow its set point 1 : 1 (the simulated history has no designed set-point moves). The pilot measures it from step tests.

## 3. What remains
- Sulphur / HGO property models — the simulator has no sulphur; the cut point stands in.
- RFCC and INDMAX — same engine, trained on their own historian and lab data; not modelled in the simulator.
- Training and backtesting on IOCL historian + LIMS (Phase 1 of the pilot).
- LIMS feed and historian streaming (the demo loads simulator batches).

## 4. How it solves IOCL's problem
"Run closer to plan and avoid over- and under-treating" = run the cut point close to its target instead of with a safety margin, in both directions, and hold back when unsure. The cockpit gives the quality **every minute instead of every 8 h**, advises the move **hours before the lab** would show the drift, sizes it so the chance on spec stays ≥ 95 %, and says **"Not yet"** (and asks for a sample) when the models disagree.

## 5. Show it in the demo (about 4 min, U4 · Fractionator)
**One line for the room:** *"Your row #1 asks for quality between lab samples so you can run closer to plan without over- or under-treating. I'll show it three ways: too close to spec, too far from spec, and not sure."*

**Set-up (before clicking):** *"Today the cut point is known from the lab every 8 hours, an hour late. So operators cut with a margin and give product away — or find out after the fact. Here is an estimate every minute, with how sure it is."*

**Beat 1 — too close to spec: act before the lab** · `random_s107`, 10:00
| Do | Point at | Say |
|---|---|---|
| Step ② | Four bell curves (one per model); lab points on the chart | "Four different kinds of model, two of them physics-based. Where they agree, we trust the estimate." |
| Step ③, D1 | HN estimate **536.4 ± 2.8 °F** vs **540 °F** spec; chance on spec **90 %** | "It's drifting toward the limit. The next lab is at 14:00, four hours away." |
| Same card | **Lower heavy-naphtha cut point −5.0 °F (530.3 → 525.3)** → chance **> 99 %**; **8 of 8** checks pass | "It moves now, not after the lab — that avoids under-treating. Five degrees is the SOP step limit, so it stops there." |
| Drag **Try another move**, then put it back | Chance updates as you drag | "You can test any move before you make it." |
| **Accept** | Toast: "recorded … nothing sent to the plant" | "A person decides. Nothing is written to the control system." |

**Beat 2 — too far from spec: stop giving product away** · `random_s144`, 10:00 (a run the model never saw)
| Do | Point at | Say |
|---|---|---|
| Step ③, D1 (LCO) | Estimate **753.1 ± 3.2 °F** vs **765 °F**; already **> 99 %** on spec | "The opposite case: cutting lighter than needed, to play safe." |
| Same card | **Raise LCO cut point +2.0 °F (752.8 → 754.8)**; chance stays **> 99 %** | "Move closer to plan and keep more diesel, still above 99 % on spec — that avoids over-treating." |
| Step ④ **What sets the size of the move** | "Trained on 40 runs, checked on 14 held-out runs"; the binding limit | "This run wasn't in training, and it tells you why the move is this size." |

**Beat 3 — not sure: don't move** · `random_s144`, 12:00
| Do | Point at | Say |
|---|---|---|
| D2 | **"Not yet"** — model spread **24.5 °F**, above the 14 °F limit; **4 of 8** checks pass | "The models disagree, so it won't advise a cut-point move." |
| D9 | **Pull an extra LCO sample now** (next lab in 120 min) | "It asks for a sample instead of guessing. That's what makes running closer to plan safe." |

**Close:** *"Closer to plan in both directions, and it holds back when it isn't sure. This runs on simulated FCC data for the two cut points. On your plant the same engine is trained on your historian and lab data — including sulphur from your row #1, and RFCC and INDMAX."*

**Pass check:** each D1 card shows a from → to move, chance before → after, and the named binding limit; s144 12:00 shows D2 "Not yet" and D9. *(Numbers read from the cockpit on 7 Oct; read the cards on the day.)*

> Do not claim sulphur, RFCC or INDMAX in the demo, and do not read out the money figure.

## 6. If asked
- *"Where's sulphur?"* — "The simulator has no sulphur chemistry, so the cut point stands in. Same method, different property, trained on your lab data."
- *"How accurate?"* — "On runs it never saw, about 7.5 °F on LCO and 13 °F on heavy naphtha. That's modest — which is why the 'Not yet' checks exist. Accuracy on your plant comes from a backtest on your history."
- *"Does the product really follow the set point one-for-one?"* — "That's assumed; the simulated history has no deliberate set-point moves. In the pilot we measure it from your step tests."
- *"Why 95 %?"* — "A placeholder threshold for the chance on spec after the move; you set it."
- *"What about RFCC / INDMAX?"* — "Same engine; it needs that unit's historian and lab data. That's pilot work, not shown here."

## 7. Pilot on IOCL's plant
Read-only historian tags for the FCC / RFCC / INDMAX fractionator, LIMS results (D86 / T90 / T95 and sulphur), feed assays. Train on 2–3 years, test on unseen months, shadow mode against every lab result, then advise D1 on the cut point first.
