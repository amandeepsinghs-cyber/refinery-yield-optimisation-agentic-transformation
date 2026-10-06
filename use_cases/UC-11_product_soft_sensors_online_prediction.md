# UC-11: Product Soft Sensors — Online Prediction Between Lab Samples

> **Status:** 🟢 **Live — real models on simulated data**
> - **IOCL row #11:** Product soft sensors — *Online property prediction between lab samples (e.g. ATF freezing point, bitumen viscosity, VR penetration)* · Yield & quality
> - **IOCL-reported benefit:** Earlier off-spec detection; reduced reprocessing *(IOCL's wording)*
> - **Cockpit:** **U4 · Fractionator** · answered by: *4-model soft sensor (incl. PINN) · trust checks*
> - **Decisions:** **D2** can the estimate be trusted right now? · **D9** pull an extra lab sample now? (feeds D1)
> - **Lever:** none for D2 (it decides whether advice is shown at all); lab sampling for D9
> - **Problems it answers:** P1 (quality every 8 h) and **P4 (an AI that always answers is dangerous)**

## 1. The problem in plant terms
Between labs there is no number at all. A single soft sensor gives one value and never says when it shouldn't be trusted — so operators either ignore it or trust it when they shouldn't.

## 2. What we built
| Piece | What it does |
|---|---|
| Estimate | Same 4-model committee as [UC-01](./UC-01_fcc_product_quality_inferential.md): a value **every minute** between labs, with its spread |
| Trust gate (D2) | Spread **W90 > 14 °F**, or the models split into two answers (bimodal), → **"Not yet"**: no advice, with the failed checks and "what data is missing" |
| Extra sample (D9) | When the estimate is least certain: **"Pull an extra LCO and HN T98 sample now"**, with time to the next scheduled lab |
| Lab screening | Suspect lab results (gross / timestamp errors) are screened before they touch the model; the screen says why |
| Re-anchoring | Each accepted lab result updates the bias (Kalman) — the "learn" step of predict → decide → measure → learn |
| Decision record | Every time advice was held back is logged as a `system:*` row in `/audit` |

## 3. What remains
- Other properties IOCL named (ATF freeze point, bitumen viscosity, VR penetration) — other units, same method.
- Coverage of the 90 % interval is below target on simulated data (79 % LCO, 59 % HN) — calibrated on IOCL data in the pilot.
- Live LIMS integration.

## 4. How it solves IOCL's problem
"Earlier off-spec detection" — the estimate shows drift **hours before** the lab reports it. "Reduced reprocessing" — and, critically, the system **refuses rather than guesses**: when the models disagree it asks for a sample instead of averaging four guesses. That is what makes a soft sensor usable in front of an operator.

## 5. Show it in the demo — *the "Not yet" moment*
| Step | Do | Point at | Say |
|---|---|---|---|
| 1 | **Scenario** → `random_s144`, **12:00** → **U4 · Fractionator** | Spread **17.3 °F** > **14 °F** | "Two hours later, the models disagree." |
| 2 | Step ③, **D2** tab | **"Not yet — hold the LCO cut point"** (and HN); **no Accept button**; D3 recipe withheld | "A system that always answers would still give you a set point. This one says 'Not yet'." |
| 3 | Step ④ | Each check with value, limit, pass / fail; "what data is missing" | "You can see exactly why." |
| 4 | **D9** → click **Pull sample** | Recorded in the decision record | "It asks for the lab sample that will settle it." |
| 5 | **Ask Gemini**: *"Why is the recipe withheld right now?"* | Gemini quotes the check and refuses to give a set point | "Even the copilot can't talk its way past the checks." |
| 6 | **Decision record** (`/audit`) | `system:*` "withheld by checks" rows | "Every time it held back is on record." |

**Pass check:** two D2 "Not yet" cards, no Accept on D2, D3 withheld, D9 **Pull sample** present. *(Verify on the day — see PRESENTER_PACK pre-flight.)*

## 6. If asked
- *"What if the model is wrong?"* — "Three brakes: trust checks before any advice, 'Not yet' beyond a 14 °F spread, and a person decides every time."
- *"What about a bad lab result?"* — "Suspect labs are screened before they touch the model, and the screen shows why."
- *"A crude it's never seen?"* — "Physics models get more weight, the spread widens, and past the limit it says 'Not yet'."

## 7. Pilot on IOCL's plant
Same as UC-01, plus agreeing the spread limit and chance-on-spec threshold with IOCL operations, and shadow-mode comparison of every live lab against the estimate for 4 weeks before any advice is shown.
