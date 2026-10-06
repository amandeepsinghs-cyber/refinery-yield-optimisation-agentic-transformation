# UC-FEED: Feedstock Evaluation — Crude-Switch Tracking

> **Status:** 🟠 **Scripted outcome** — the crude name follows the lab assay (labelled); the unit's behaviour confirms it
> - **IOCL catalogue:** Scheduling & planning — *Feedstock evaluation* (also supports "Coker recycle → FCC yield optimisation", ~$12M/yr in IOCL's case examples, FCC side only)
> - **Cockpit:** step ② of every unit page, best shown on **U4 · Fractionator** · answered by: *Crude classifier*
> - **Decision:** **D4** which crude is running, and has the switch finished?
> - **Lever:** none — every other model uses the answer to pick its weights
> - **Problem it answers:** **P2** — crude changes every 12–48 h

## 1. The problem in plant terms
The schedule says which crude is coming, but not when it really reaches the unit or whether it behaves as assayed. Every model tuned on yesterday's crude is now wrong, and the right set points for the new crude are unknown.

## 2. What we built
| Piece | What it does |
|---|---|
| Inputs | Riser ΔT, conversion, coke per feed, regenerator temperature, column ΔT; the crude the schedule declares; the lab assay |
| Crude classifier | Names the crude family (R1 Heavy … R4 Light) with a confidence; confirmed only after it holds for **15 min** (hysteresis) |
| Re-weighting | Soft-sensor models re-weight for the crude (e.g. physics-based models carry 81 % after the switch); response models and recipes are per crude |
| Novel crude | Novelty check → more physics weight → wider spread → smaller moves or "Not yet" |

**Honest:** the live classifier names the right crude in **8 of 15** held-out switches, so in the demo the **name follows the assay** and is labelled **scripted**. Don't volunteer the 8/15 figure; use it only if pressed.

## 3. What remains
- A classifier trained on enough real switches to stand on its own (IOCL history).
- LP assay import, crude purchase evaluation, coker-recycle link.

## 4. How it solves IOCL's problem
Models and moves switch to the new crude **when it really arrives**, not when the schedule says, and the cockpit flags when assay and behaviour disagree. That is the practical half of feedstock evaluation at the unit.

## 5. Show it in the demo
| Step | Do | Point at | Say |
|---|---|---|---|
| 1 | **Scenario** → `random_s107`, 10:00 → **FCC Complex** | **What went wrong:** crude switched to R4 Light at 07:37 | "The crude switched. The plant tells us before the lab does." |
| 2 | **U4 · Fractionator** → step ② | Crude block (four families + confidence), **How it knows** (assay vs behaviour — "they agree"), **scripted** chip; walkthrough **06:25** arriving → **06:25–07:25** behaviour shifts → **07:37** named → models re-weight → advice changes | "The name follows your lab assay; the unit's behaviour confirms it. It must hold fifteen minutes so noise doesn't flip it." |

**Pass check:** classifier header shows **scripted**; walkthrough shows 06:25 / 06:25–07:25 / 07:37; text reads "12 min after the blend settled".

## 6. If asked
- *"Does the classifier work on its own?"* — *(only if pressed)* "On simulated data, 8 of 15 held-out switches. There aren't enough switches yet, so we don't show it as the source. On site it confirms the assay rather than replacing it."
- *"A crude you've never seen?"* — "Starts from its nearest family, leans on physics, moves smaller or says 'Not yet', and learns it within a few lab cycles."

## 7. Pilot on IOCL's plant
Crude schedule and assays, historian around past switches; train the classifier on IOCL's own switches; best operating window per crude family from history.
