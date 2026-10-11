# Glossary: every term in plain words

> **In one line:** every process, data, model and screen word used in this app, explained in plain language, with where it appears on screen, grouped by topic.

---

## 1. How to use this glossary

Each table has three columns: the **term** as it appears on screen, its **plain meaning**, and **where you see it in the app**. Words in a meaning that have their own entry are in *italics*.

Page names follow the top bar: **Overview** (/platform), **Architecture**, **Whole unit** (/twin), the six unit tabs (**Furnace**, **Riser**, **Regenerator**, **Fractionator**, **Gas plant**, **Stabiliser**), **Explainer** and **Decision record**. Every unit page has four numbered steps: **1 Data**, **2 Observe**, **3 Decide**, **4 Optimise**. See [how a unit page works](/explainer/unit-page).

For the full story, read [Start here: the FCC from zero](/explainer/basics) and [the models, from zero](/explainer/models).

---

## 2. The refinery and the FCC

| Term | Plain meaning | Where you see it in the app |
|---|---|---|
| **Afterburn** | Coke and gas burning *above* the regenerator's catalyst bed instead of in it. It overheats the top of the vessel. A warning sign | Regenerator number on the Whole-unit drawing (**afterburn ΔT**); ribbon item "Regenerator cyclone ΔT (afterburn)"; decision D5 |
| **API gravity** | The oil industry's scale for how light an oil is. Higher API = lighter. Water is 10. FCC feeds here are about 20 to 29 | Ribbon "New feed settled at API 23.2"; **FEED** block in step 2; "For this feed (API ≈ 23.2)" in step 3 |
| **Catalyst** | A material that speeds up a reaction without being used up. Here a fine powder that flows like a liquid when gas is blown through it. Analogy: a matchmaker who introduces couples and moves on unchanged | Riser and regenerator pages; the dotted **catalyst loop** on the drawing |
| **Catalyst loop** | The powder's endless round trip: riser (cracks oil, gets coked) → regenerator (coke burned off, reheated) → back to the riser | Curved dotted line labelled **catalyst loop** on the Whole-unit drawing |
| **Catalyst-to-oil** | How much catalyst circulates for each unit of feed. It follows from the *heat balance*, so the app shows it as a result and never advises it | Furnace page (D6 text: "catalyst-to-oil follows"); step 2 "What changes for this feed" |
| **CDU / VDU** | Crude distillation unit / vacuum distillation unit: the first units in a refinery. They boil crude and split it by boiling range. Not simulated here | Overview refinery map; scope note under the Whole-unit header |
| **Coke** | A black carbon solid left behind by cracking, like burnt crust in a pan. It sticks to the catalyst | Riser and regenerator pages ("coke / feed") |
| **Conversion** | The share of the feed cracked into lighter products, in %. Higher means harder cracking | Riser number on the drawing (**conversion 93.89** in the default scenario); ribbon "Riser conversion +2.0 % above expected" |
| **Cracking** | Breaking big, heavy molecules into smaller, lighter ones. Analogy: cutting a long baguette into sandwich-sized pieces | Riser page; product table on the Fractionator page |
| **Crude slate** | The mix of crude oils the refinery is running. It changes every 1 to 2 days. Shown as context only, because the FCC sees the gas oil, not the crude | Ribbon "(crude slate R2)"; step 2 "Context: crude slate R2 …" |
| **Cyclone** | A spinning separator at the top of the regenerator that catches catalyst dust out of the flue gas. **Cyclone ΔT** is how much hotter the cyclones are than the bed: the afterburn signal | Regenerator page; ribbon item |
| **Feed** | Whatever goes into a unit. For the FCC: heavy gas oil (*VGO*) | Step 2 **FEED** block and "Feed arriving" panel on every unit page |
| **Feed class** | The app's three-way sort of the feed by API: **heavy** (below 22), **intermediate** (22–26), **light** (26 and above) | Step 2 "Which class is it?" bars; "intermediate" next to API in step 3 |
| **Feed preheat** | How hot the furnace heats the feed before it meets the catalyst. A *lever* | Furnace number on the drawing (**preheat 615.6** by default); decision D6 |
| **FCC** | Fluid Catalytic Cracker: the unit that cracks heavy gas oil into petrol, diesel and LPG on a hot flowing powder | Everywhere; the **FCC** tab group in the top bar |
| **Flue gas** | The exhaust from burning, in the furnace or regenerator. Its CO and O₂ show how well the burning goes | Furnace and regenerator tag lists |
| **Heat balance** | The FCC's self-heating loop: burning coke in the regenerator heats the catalyst, and that heat drives the cracking in the riser | Riser, regenerator and step 2 text ("catalyst circulation follows from the heat balance") |
| **Regenerator** | The vessel where air burns coke off the spent catalyst, reheating it to about 1250 °F | Section 3 on the drawing; **Regenerator** tab |
| **Regenerator air** | The air flow blown into the regenerator. A *lever* (decision D5) | Regenerator page, step 3 |
| **Riser** | A tall pipe where hot catalyst and feed shoot upward together and crack in a few seconds | Section 2 on the drawing; **Riser** tab |
| **ROT / riser outlet temperature** | The temperature at the top of the riser. It sets how hard the unit cracks (*severity*). A *lever* (decision D3). About 969 °F by default | Riser page; decision D3 |
| **Severity** | How hard the unit cracks. Raised mainly by riser outlet temperature | Riser page; D5 text "riser severity" |
| **Slide valve** | The automatic valve that lets just enough hot catalyst into the riser to hold the riser outlet temperature | Explainer text on catalyst flow |
| **Spent catalyst** | Catalyst coated with coke after cracking, on its way to the regenerator | Riser and regenerator pages |
| **VGO (heavy gas oil)** | Vacuum gas oil: the heavy oil left after the crude unit. Too heavy to sell as fuel; it is the FCC's feed | Overview refinery map arrow "heavy gas oil"; step 2 "Feed now: intermediate gas oil" |

---

## 3. Columns, products and quality

| Term | Plain meaning | Where you see it in the app |
|---|---|---|
| **C5 recovery** | How much of the pentane (5-carbon, petrol-range) material ends up in the petrol rather than lost into the LPG | Stabiliser number on the drawing (**C5 recovery**); decision D7 |
| **Condenser** | A heat exchanger that cools vapour until it turns liquid, like steam on a cold window | Gas plant page; decision D7 |
| **Cooling water (CW)** | Water pumped through the condenser to carry heat away. Kept at a fixed duty; the app watches it but never advises it. More cooling water needed for the same load is a fouling signal | Gas plant number **CW flow**; "Cooling-water flow (watched; not advised)" |
| **Cut point** | The boiling temperature where one product ends and the next begins. Moving it shifts material between neighbouring products | Fractionator page header and step 3; decision D1 |
| **Draw** | A side outlet on the column where a product is taken off. Opening it more changes the cut point | Fractionator drawing ("lever: set point …" next to the HN and LCO draws); "LCO cut-point target (via LCO draw)" |
| **Fractionator (main fractionator)** | A tall column that separates the cracked vapour by boiling point: lightest at the top, heaviest at the bottom | Section 4 on the drawing; **Fractionator** tab |
| **Gas plant** | The section that cools and condenses the fractionator's overhead vapour and recovers light gases with a compressor. Its page address says "condenser" | Section 5; **Gas plant** tab (/twin/unit/unit_5_condenser) |
| **HN (heavy naphtha)** | The heavier petrol-range product, drawn from the column above the LCO | Fractionator drawing; HN T98 charts; "target 530.3" |
| **LCO (light cycle oil)** | The diesel-range product of the FCC, drawn from the side of the column | Fractionator number **LCO T98** on the drawing; fractionator page |
| **Light naphtha** | The lightest petrol-range liquid (gasoline), from the bottom of the stabiliser | Stabiliser outlet label "Light naphtha" |
| **LPG** | Liquefied petroleum gas: propane and butane, as in cooking-gas cylinders. Leaves the top of the stabiliser | Stabiliser outlet label **LPG** |
| **Off spec** | A product that fails one of its specification limits; it must be reprocessed or downgraded | Step 2 bell curves (**Spec max** line); decision text |
| **Overhead** | Whatever leaves the top of a column | "Overhead → gas plant" on the fractionator drawing; **Overhead temperature target** lever (D7) |
| **Pumparound (PA)** | A loop that pulls liquid out of the column, cools it and returns it, to remove heat at that height. Four of them, PA1 to PA4 | Fractionator drawing boxes **PA1 … PA4**; "Pumparound 2 duty" |
| **Reflux** | Condensed liquid sent back into the top of a column to sharpen the split | Gas plant step 3 "Levers here: … Reflux ratio" |
| **Slurry** | The heaviest bottom product, with catalyst dust in it. Used as fuel oil | Fractionator drawing (**Slurry … lb/min**) |
| **Spec** | Specification: the written limits a product must meet. Here LCO T98 ≤ 765 °F and HN T98 ≤ 540 °F | Dashed red **Spec max** line on bell curves and charts |
| **Stabiliser** | A smaller column that splits LPG from light naphtha | Section 6; **Stabiliser** tab |
| **T98** | The temperature at which 98 % of a product has boiled off: the temperature of its "last drops". Too high means too much heavy material: off spec. The app uses it as the quality number | **LCO T98** on the drawing; every fractionator chart |
| **Tray** | One of about 20 horizontal plates inside the fractionator where vapour and liquid meet. Tray temperatures are the soft sensor's main clues | Fractionator drawing ("Tray 6 358 °F"); tag list |
| **Wet-gas compressor (WGC)** | A large machine that squeezes the gas left after condensing so it can be recovered. Its load rises when the riser over-cracks | Gas plant "OUT: Wet gas → compressor"; "Compressor power"; D8 consequences |

---

## 4. Plant data and operations

| Term | Plain meaning | Where you see it in the app |
|---|---|---|
| **DCS** | Distributed control system: the computers that actually run the plant's valves. The app has no connection to write to it | Architecture page; footer "nothing here writes to a control system" |
| **Expected** | What a sensor should read for this feed and these settings, according to the models | Step 2 "expected 298.6"; charts "measured vs expected" |
| **Historian** | The plant's database of sensor readings, stored every minute | Step 1 badge **HISTORIAN · EVERY MINUTE**; Data path |
| **IOW** | Integrity operating window: a limit that protects equipment rather than product quality, for example the furnace tube-skin limit of 1620 °F | Furnace tag list ("≤ 1620.0 °F IOW"); knowledge documents |
| **Lever** | A setting an operator can move: a *set point* | Step 1 **LEVERS ON THIS UNIT**; step 3 "Levers here" |
| **LIMS** | Laboratory information management system: where lab results are stored | Architecture data-in view; decision cards ("LIMS T98 history") |
| **Lab sample** | A sample drawn at 06:00, 14:00 and 22:00, with the result about one hour later | Step 1 badge **LAB · EVERY 8 H**; green dots on the estimate chart; "How fresh the data is" |
| **Plan** | The value the unit is meant to run at | Ribbon "6/6 units on plan"; gold dashed line on bell curves |
| **Set point (SP)** | The target value the control system holds. Operators move it; the app only suggests a new one | Step 3 "752.8 → 754.8 °F"; "vs set point 752.8" |
| **SOP** | Standard operating procedure: the plant's written rules. The **SOP step** is the largest move allowed in one go (5 °F on the cut points) | Step 4 "Checks before advising"; "What sets the size of the move" |
| **Tag** | One sensor's stream of readings, with a code name | Step 1 "All 21 tags on this unit" |
| **Target** | The value the app aims for: LCO T98 755.3 °F, HN T98 530.3 °F, safely below the spec | Fractionator header; step 3 |

---

## 5. Models and statistics

| Term | Plain meaning | Where you see it in the app |
|---|---|---|
| **Anomaly** | A reading that is behaving differently from what is expected for this feed | Step 2 badge **ANOMALY DETECTION**; ribbon **WHAT WENT WRONG** |
| **3-sigma (±3σ)** | A band three standard deviations either side of expected. A reading outside it is unusual enough to flag (a "breach") | Step 2 residual chart (dashed lines **±3σ (trailing MAD)**); "outside its normal band" |
| **Bayesian ridge** | A simple, stable statistical model that fits a weighted straight-line formula. Kept as the reference, not blended in | "Linear model (Bayesian ridge)" with **ref.** in "What the 4 models believe now" |
| **Bell curve (Gaussian, normal distribution)** | A hill-shaped picture of a belief: the peak is the most likely value, the width shows how unsure the model is | Step 2 "What the 4 models believe now"; step 3 and step 4 curves |
| **Bias correction (Kalman update)** | Each new lab result nudges the estimate so it stays anchored to the lab, like resetting a watch against a reliable clock. It resets when a new feed settles | "lab correction" in the blend line; step 2 "The bias resets when a new feed settles" |
| **Chance on spec (P(on-spec))** | The probability, from the bell curve, that the product is inside its spec. Advice needs at least 95 % after the move | Step 2 "chance on spec 61 %"; step 4 before/after curves |
| **Committee** | The four soft-sensor models working together, like a panel of judges. Where they agree, trust rises | "Expected (committee)" on charts; step 4 "Model" line |
| **CUSUM** | Cumulative sum: a running total of small gaps from expected. It catches a slow drift before any single reading looks bad, like noticing a scale creeping up a little every day | Step 2 **SUSTAINED DRIFT (CUSUM)**; orange line on the residual chart |
| **Ensemble** | Several copies of one model trained slightly differently, averaged. Their disagreement shows uncertainty | "Physics-informed models (5)": the PINN is an ensemble of five |
| **Estimate** | The model's best guess of a value nobody is measuring right now | Step 2 **ESTIMATE NOW** (e.g. "539.0 ± 3.4 °F") |
| **Feed model** | The model that estimates the feed's API every minute from how the unit behaves, detects feed changes and scores novelty | Step 2 badge **FEED MODEL**; "Feed arriving" panel; "How it knows" |
| **Gaussian process (GPR)** | A flexible model that also says how unsure it is: confident near data it has seen, less so far away | "Gaussian process" row in "What the 4 models believe now" |
| **Held-out run** | A simulated run kept aside and never used for training, so it can test the models fairly (runs from seed 140 on) | Step 2 "On held-out runs from seed 140 it was off by 0.20 API" |
| **Hybrid model** | A physics formula plus a learned correction for what the physics misses | "Physics + correction (hybrid)" row |
| **MAE** | Mean absolute error: the average size of a model's miss | Step 2 "off by 0.20 API on average" |
| **Mean** | The average; the centre of a bell curve | Centre of each bell curve |
| **Model** | A formula learned from data that turns inputs (sensor readings) into an output (an estimate) | Throughout steps 2–4 |
| **Novelty** | How unlike the training data the current feed is, from 0 (familiar) to 1. At 0.5 or more, advice pauses | Step 2 "Familiar to the model?" slider with **pause advice** mark |
| **Optimiser** | A search for the smallest set-point move that reaches the target with at least 95 % chance on spec, in 0.5 °F steps, within the SOP step | Step 4 badge **OPTIMISER**; "How the move is found" |
| **PINN** | Physics-informed machine-learning network: a learned model penalised whenever it breaks the column's boiling-point physics. Five copies form an ensemble | "Physics-informed models (5)" row; it carried 77 % weight in the screenshot scenario |
| **R²** | A 0-to-1 score of how well a model explains the data; 1 is perfect | **Engineer view (all panels)** link on a unit page: "Held-out error 0.20 API (R² …)" |
| **Residual** | Measured minus expected: the gap the anomaly detection watches | Step 2 "residual (measured − expected)" chart; **AWAY FROM EXPECTED** |
| **Response model / gain** | A model of "if I move this lever by 1, how much does the result move?" The gain is that ratio, e.g. preheat outlet moves 1.007 °F per °F of set point; the cut point is assumed to move 1 : 1 | Step 3 **Try another move** slider; step 4 "Model" line |
| **Simulator truth** | The exact value the simulator knows, which a real plant never has. Used only to check the models | Chart legend "Measured (simulator truth)" |
| **Soft sensor** | A set of models that estimates a lab measurement every minute from live sensor data. "Soft" because it is software, not a physical instrument | Step 2 badge **SOFT SENSOR**; "Soft sensor fills the gap: an estimate every minute" |
| **Standard deviation (sigma, σ)** | The usual size of random wiggle around the average. Small σ = narrow bell curve | "± 3.4 °F"; "0.8 σ" under **AWAY FROM EXPECTED** |
| **Sustained shift** | A gap from expected that lasts long enough to matter, caught by CUSUM | Timeline labels "(sustained shift)"; ribbon items |
| **Uncertainty** | How unsure an estimate is; shown as the width of the bell curve or band | "±" numbers; **90 % band** shading |
| **90 % band / W90** | The range that holds the true value 9 times out of 10. **W90** is its width. Narrow = confident | Chart legend **90 % band**; "W90 … / 14" in the **Engineer view (all panels)** |

---

## 6. Decisions, safety and screen words

| Term | Plain meaning | Where you see it in the app |
|---|---|---|
| **Accept / Hold 30 min / Decline** | The three answers a person can give to a proposed move. They are written only to the Decision record | Step 3 buttons; pins turn **accepted** after Accept |
| **Act first** | The open decision whose effect arrives soonest | Pin label **Decide · act first** on the drawing |
| **Advisory only** | The app suggests; a person decides; nothing reaches the plant | Footer of every page |
| **Ask Gemini** | A read-only AI assistant that explains the screen in English, Hinglish or Hindi. It never invents a set point | Button bottom right, and in step 3 |
| **Checks (trust checks)** | Fixed rules that must all pass before advice is shown: spread inside its limit, models agree, inputs inside the training range, move inside the SOP step | Step 4 badge **CHECKS**; "Checks before advising" |
| **Decide / Watch / Not yet pins** | Labels above the sections: **Decide** = a move is proposed; **Watch** = a drift is tracked, no move; **Not yet** = the models are unsure, no advice | Pins above the Whole-unit drawing |
| **Decision record** | The log of every Accept, Hold and Decline | **Decision record** tab |
| **Demonstrated / Interactive / Partly / Watch only** | Status words for how far each use case is built: **Interactive** runs live on the simulated data; **Demonstrated** is shown end to end on the simulated FCC; **Partly** covers part of it; **Watch only** flags without advising | Overview page status dots |
| **"Not yet"** | The app holds back advice because the models disagree, data is missing, or the feed is changing or unfamiliar. A deliberate safety answer | Pins; header "2 waiting for data"; step 3 |
| **Spread gate** | The rule behind "Not yet" on quality: if the 90 % band is wider than 14 °F, or the models split into two camps (**bimodal**), advice is **WITHHELD** | **Engineer view (all panels)**: "Spread gate PASS / WITHHELD · W90 … / 14" |
| **Use case (UC-01 … UC-11)** | One item on the client's list of problems to solve; each unit page says which ones it covers | **What this screen solves**; **IOCL USE CASES THIS SHIFT** chips |
| **What went wrong** | The ribbon under the Whole-unit header listing the shift's notable events, each with its time | Whole-unit page, top |
