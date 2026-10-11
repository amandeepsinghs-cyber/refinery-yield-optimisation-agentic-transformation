# How to read: Main fractionator

> **In one line:** The fractionator splits the cracked vapour into products by boiling point, and this page tells the operator whether to nudge two product "cut points" now, wait for the lab, or pull an extra lab sample because the models are not sure.

## 1. What the main fractionator is, from zero

Picture a tall steel tower. Hot cracked vapour from the riser enters near the bottom. Inside are stacked horizontal plates called **trays**: 20 in this simulated column, numbered from the top (**Tray 1**) down (**Tray 20**).

As the vapour rises it cools. Each part turns back into liquid within its own **boiling range** (the temperature band where it boils or condenses). Heavy parts condense low down, where it is hot; light parts climb higher. Think of a stack of sieves sorted by temperature instead of size.

The products leave at different heights:

| Where | Product | Used for |
|---|---|---|
| Top (**Overhead → gas plant**) | Gases, LPG and light naphtha | Sent on to the gas plant |
| Side draw near tray 6 | **Heavy naphtha (HN)** | Petrol pool or reformer feed |
| Side draw near tray 13 | **LCO** (light cycle oil, diesel-range) | Diesel pool, after treatment |
| Bottom | **Slurry** (decant oil) | Fuel oil or carbon-black feed |

A **side draw** is a pipe that pulls liquid off one tray. **Pumparounds** (**PA1**–**PA4**) take liquid out, cool it and pump it back higher up. They remove heat so each tray stays at the right temperature, like air-conditioning on each floor.

### Cut points and T98

A **cut point** is the temperature where one product ends and the next begins. **T98** is the temperature at which 98 % of a product has boiled off, so it describes the product's heavy end. Raising a cut point lets heavier molecules into that product. Lowering it pushes them down into the next, heavier stream.

Each product has a **spec**, a quality limit it must not exceed. In this demo **LCO T98 must stay at or below 765 °F** and **HN T98 at or below 540 °F**. These are placeholder values; each refinery sets its own. The operator does not set T98 directly. They set a **set point** (the value the controller holds, like a thermostat), and the column follows it.

The catch: T98 is only measured by a **lab sample every 8 hours** (06:00, 14:00, 22:00 in this run). In between, operators are half-blind. That gap is what this page fills: every T98 number on this page is a **model estimate** with its ± spread (marked **est.** or **Estimate**), except the lab results themselves, which are **Measured**. All the other readings (tray temperatures, flows, pressures) are measured every minute.

## 2. The four models on this page, in plain words

You will see the words **Bayesian ridge**, **Gaussian process**, **hybrid** and **PINN** on this page (in **What the 4 models believe now** and in **How the move is found**). You do not need the maths. Here is all you need.

**What to say in one breath:**
> "These are four standard machine-learning and statistical models, each trained on the unit's historical data to estimate product quality every minute, between lab results. We use four different kinds on purpose, combine them, and only advise when they agree. Two of them are also held to the column's physics."

| What the screen calls it | What it is, in plain words | Everyday picture | Its job here |
|---|---|---|---|
| **Linear model (Bayesian ridge)** | A straight-line fit from the tray temperatures to the quality number, with a brake that stops it over-reacting | A ruler laid through the points | The yardstick: shown as **ref.**, not used in the blend |
| **Gaussian process** | Estimates by looking for past moments that looked like now and blending their answers; says "not sure" when nothing similar has been seen | An estate agent pricing a house from similar houses on the same street | One of the three blended estimates; also an early warning when inputs look unfamiliar |
| **Physics + correction (hybrid)** | A simple physics rule (hotter draw tray, heavier cut) plus a learned correction for what the rule misses | A sat-nav's time from distance, plus a learned traffic correction | One of the three blended estimates; stays sensible when things drift |
| **Physics-informed models (5)** (PINN) | Five flexible machine-learning models, trained so they also respect the column's physics; five copies so their disagreement shows how sure they are | Five students who learned the same rules sitting the exam separately | One of the three blended estimates |

**How they are combined.** The three blended models vote; the more accurate a model has been, the bigger its vote. The result is one estimate with a bell curve around it (best guess plus how unsure it is). If the models disagree too much, the app says **Not yet** instead of advising.

**Why four, not one?** Each kind fails in a different way. When different kinds agree, you can trust the number; when they split, that disagreement is itself the warning.

**If someone asks for detail:** "On your plant they are trained and tested on your own historian and lab data; we are happy to go deep in a technical session." The full plain-English walk-through is in [the models guide](/explainer/models).

## 3. What you see, top to bottom

This page uses the shared layout described in [how a unit page works](/explainer/unit-page). Below are the fractionator's own contents. Numbers are from the default scenario (run random_s144 at 10:00) and change with the scenario.

### Part A: header

**Main fractionator** · **LCO T98 est. 753.1 ± 3.2 °F +0.4 vs set point 752.8 · target 755.3**. So the model estimate of LCO T98 is 753.1 °F (give or take 3.2 °F), 0.4 °F above its set point, and the advice wants it at 755.3 °F. On the right: **10:00 · next lab 14:00**. The role line ends **Operators move: LCO and heavy-naphtha cut points**.

### Part B: step 1, **Data in and out**

**The drawing** shows the column, its 20 trays and live values:

- The tag table lists T98 as **LCO Diesel T98 Cut-Point — model estimate (lab every 8 h)** 753.1.
- Left: tray temperatures. **Tray 1** has a dotted underline and **?**: the simulator's top tray reads unrealistically cold, so it is flagged for review.
- Right: **PA1**–**PA4** loops, the **Heavy naphtha** draw with **lever: set point 532.8 °F**, and the **LCO (diesel)** draw with **T98 est. 753.1 ± 3.2 °F · lever: set point 752.7 °F**.
- Top: **Overhead → gas plant · LN 3889 · LPG 3071 lb/min** (LN is light naphtha). Bottom: **Cracked vapour from riser** in, **Slurry** out.

**How fresh the data is** shows **Lab last 06:00 · 749.5 °F** and **Next lab 14:00 · in 240 min**. Below, the table **What the FCC makes — by molecule size and boiling range** marks the two qualities this page estimates: **HN T98 · model estimate** and **LCO T98 · model estimate**. The panel also says **Model estimate fills the gap: an estimate every minute**.

### Part C: step 2, **What we observe**

**The fact row** at 10:00:

- **Estimate now 753.1 ± 3.2 °F**, **chance on spec > 99 %**: the **model estimate** (machine-learning models that estimate the lab value every minute from ordinary readings; the industry calls such a model a soft sensor) puts LCO T98 far under the 765 °F spec.
- **Away from expected +1.2 °F**, **0.7 σ**: less than one normal wobble. Ordinary. (For T98 this compares the model estimate with expected.)
- **Sustained drift (CUSUM) 4.9**, **no breach open**: a small upward creep, no alarm. The decision's observed line reads **LCO T98 est. +1.3 °F above expected (sustained shift) since 09:06**; on the heavy-naphtha tab, **HN T98 est. +5.1 °F above expected (sustained shift) since 07:32**.
- **Likely driver —** **nothing unusual**.
- **Feed API 23.2**, **intermediate · settled since 08:45** (API is an oil density scale).

**How a feed change plays out on this run** tells the morning's story: at 07:07 the crude schedule changed, at 07:49 the change was detected and advice held, at 08:45 the new feed settled and advice resumed.

**Charts**: **LCO T98 — model estimate (90 % band) vs expected · lab every 8 h** (legend: **Model estimate**, **90 % band of the estimate**, **Expected (set point + recent offset)**, **Lab result (measured)**) and **LCO T98 estimate − expected with ±3σ and CUSUM**. For T98, **expected** is the set point plus the recent offset of the estimate from it (a slow 45-minute average), so anomaly detection on T98 runs on the model estimate; there is no minute-by-minute T98 measurement on a real plant. Read the first chart like this: the estimate line should stay close to the expected line. The dashed **Plan (SP_LCO_T98)** line is the set point. The red dotted **Spec max** line at 765 °F is the limit.

**What the 4 models believe now**: four bell curves, one per model. A **bell curve** shows a best guess (the peak) and how unsure it is (the width). The weights under them are **Linear model (Bayesian ridge) ref.**, **Gaussian process 38 %**, **Physics + correction (hybrid) 32 %**, and the physics-informed network ensemble **30 %**. In three lines:

- Four different kinds of model each estimate T98 from the same sensor readings.
- Three are blended by how accurate they were on test runs. The linear one is shown for reference only.
- When they agree, the estimate is narrow and trusted. When they disagree, the page says "Not yet".

The full story is in [the models guide](/explainer/models).

**LCO T98 — model estimate between lab results**: the estimate line, its **90 % band**, a red **spec 765** line and the lab points, labelled **Lab result (measured)**. The green dot at 06:00 is the accepted lab result, 749.5 °F. The caption says it plainly: **Between samples the estimate is the only reading of product quality.**

### Part D: step 3, **Decision and lever** at 10:00

There are two tabs, both named **Cut point**. The first is LCO and the second is heavy naphtha. If someone has already responded for this run and minute, the tabs say **ACCEPTED** instead of **DECIDE**.

**Decision D1, "Cut point: move now or wait for the lab"** (LCO tab):

- Question: **Raise the LCO cut point now, or wait for the lab?**
- Headline: **Raise LCO cut point +2.0 °F (752.8 → 754.8)**, sized **For this feed (API ≈ 23.2, intermediate)**.
- **If nothing is done:** LCO T98 is running 2.2 °F below its 755.3 °F target, so the cut stays lighter than planned until it is raised. **decide by 10:30**.
- Bullets: the estimate is **753.1 °F**, **11.9 °F inside the 765 °F spec**. Chance on spec is **> 99 %** now and after. **8 of 8** trust checks pass.

Why move at all if it is already safe? The cut is lighter than planned, so some diesel-range molecules drop into the heavier slurry stream below. Raising the set point by 2 °F brings the estimate to its target and keeps more product in the LCO stream, while staying well inside spec.

**The lever panel**: **LCO cut-point target (via LCO draw)**. The big number shows the advised move, **752.8 → 754.8 +2.0**, and the slider **Try another move** starts on it. The range reads **747.5 … now 752.8 · advised 754.8 … 758.0**. At the advised move the solid curve sits on the dotted green **target 755.3** curve and the text reads **On target**. Drag left or right to see what a smaller or bigger move would do. The red **spec ≤ 765.0** zone sits further right; keep the curve clear of it. The SOP note allows at most 5 °F per step, 30 minutes apart.

The **heavy-naphtha** tab works the same way: **Raise heavy-naphtha cut point +2.0 °F (532.8 → 534.8)**, estimate 528.4 °F, target 530.3 °F, spec 540 °F.

### Part E: step 4, **How the move is found**

**The chain**, left to right: **Anomaly detection**: **Flagged LCO T98 est. moving away from expected at 09:06 — 4.9 h before the next lab (14:00)**. The **Estimation models (4, 3 blended)** gave 753.1 ± 3.2 °F. The **Feed model** estimated API 23.2. **Trust checks**: 8 of 8 pass. **Set-point search** found 753.1 → 755.1 °F. **Gemini** explains it in words.

**Checks before advising — 8 of 8 pass**:

| Check (on screen) | Plain meaning | At 10:00 |
|---|---|---|
| **spread W90** | Width of the 90 % band. Must be 14 °F or less | 10.46 |
| **models agree** | How far apart the models are | 0.13 (limit 0.50) |
| **inputs inside training range** | Today's readings look like the training data | 0.18 (limit 1.00) |
| **HN–LCO gap** | Sanity check: HN T98 at least 50 °F below LCO T98 | 224.8 |
| **lab track record** | How well the estimate matched recent labs | 0.49 (limit 1.50) |
| **sensor health** | Faulty sensor flags. Must be zero | 0.00 |
| **labels for this crude** | Training examples for this kind of feed | 3815 (need 5) |
| **spread ratio** | Today's spread versus normal | 0.75 (limit 1.00) |

**The search, in plain words**: the goal is to bring the estimate to the 755.3 °F target, never below 95 % chance on spec. The **Result** line reads **752.8 → 754.8 °F**. **What sets the size of the move** says the target set the size, the SOP step was **Not limiting** (2.0 of 5.0 °F used), and there is **Room** of 4.8 °F to the spec.

**How do we know the move works?** **Predict** (**Built**) restates the move. **Decide** (**Built**) records the click. **Measure** (**Shown, not run in the replay**) says the 14:00 lab would confirm it. **Learn** (**Built**) says each lab result re-anchors the model estimate.

### Part F: the same page at 12:00, when the models are unsure

Set the time to 12:00 and the page changes. There are now three tabs:

**Decision D9, "Pull an extra lab sample"** (**DECIDE**): **Pull an extra LCO T98 sample now — spread 24.5 °F, next lab in 120 min**. The lever panel reads **An extra lab sample · now instead of 14:00**, and **The estimate's spread is 24.5 °F against a 14 °F limit**. The main button says **Pull sample**. D9 appears when the estimate is too uncertain and the next lab is at least two hours away. A sample now is worth more than one at the scheduled time.

**Decision D1** (**DECIDE**) for heavy naphtha: still confident, **Raise heavy-naphtha cut point +2.5 °F (532.8 → 535.3)**.

**Decision D2, "Can the estimate be trusted now?"** (**NOT YET**): **Not yet — hold the LCO cut point; the estimate is too uncertain (spread W90 above the 14 °F limit)**. The estimate is 749.3 ± 7.7 °F. Step 4 shows **4 of 8 pass**: **spread W90** 24.54, **models agree** 0.81, **inputs inside training range (GPR model outside its range)** (GPR is the Gaussian process model) and **spread ratio** 1.75 all **FAIL**. The four models now say roughly 744, 748, 753 and 757 °F. A 13 °F disagreement is too wide to act on, so the page does not guess. It holds the LCO move and asks for a sample.

**What about D3?** D3, "Coordinated recipe for the new feed", now lives on the [riser page](/explainer/riser). It sets the riser outlet temperature. The cut points stay with D1, so there is exactly one piece of advice per set point.

## 4. What to click

1. The **Cut point** tab, then drag **Try another move** until it says **On target**.
2. **Full explanation** in step 4: open **Models: what each one computed** to see each model's number and weight.
3. To reach 12:00, drag the shift timeline on the [Whole unit page](/explainer/whole-unit) to 12:00, then come back here to show **Not yet** and **Pull sample**.
4. **Ask Gemini** on any decision.

## 5. What to say in the demo

- "The lab tells us product quality every 8 hours. Four models fill the gap every minute."
- "At 10:00 they agree, so the page advises a small 2 °F raise to hit the target, still well inside spec."
- "At 12:00 they disagree by 13 °F. The page says Not yet and asks for a lab sample instead of guessing."
- "The operator decides. Accept only writes to the decision record."

## 6. Questions people ask

**Why raise a cut point if the product is already on spec?** Being too far inside spec means diesel-range product slips into the heavier stream. The target is a planned operating point closer to spec, with a safe margin.

**Are 765 °F and 540 °F real limits?** They are demo placeholders. A real refinery uses its own specs.

**Does T98 really follow the set point one-for-one?** The page assumes it does and says so: **The cut point is assumed to follow its set point 1 : 1 (default; not measured in the data).**

**Why 4 models?** If they agree, you can trust the number. If they disagree, that disagreement is the warning. See [the models guide](/explainer/models) and the [glossary](/explainer/glossary).
