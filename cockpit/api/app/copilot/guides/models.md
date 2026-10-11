# The models, from zero

> **In one line:** Four models each guess the lab result every minute, a committee blends their guesses into one bell curve, the app checks it can trust that curve, and only then a small search picks a safe move; Gemini explains the result but never computes it.

## 1. What a "model" is

A **model** is a recipe. It takes measurements (temperatures, flows, pressures) and turns them into an estimate of something you cannot measure right now.

Think of a weather forecaster: today's pressure and clouds in, "70 % chance of rain" out.

Every model has two phases:

- **Training** = learning the recipe. We show the model many past situations together with the right answer, and it adjusts itself until its guesses match.
- **Using** = applying the recipe. The model sees new measurements and gives an estimate, with no right answer in sight.

**Held-out runs.** The app learned from **40 simulated runs** of the FCC (runs s100 to s139). It was then tested on **14 runs it never saw** (s140 to s153). The default demo run, random_s144, is one of those 14. A model can "memorise" its training data, like a student who memorises last year's exam; unseen runs are the honest exam. "Held-out" on screen means "scored on runs the model never saw".

All data comes from a simulated FCC, not a real plant.

## 2. Uncertainty and the bell curve

No estimate is exact. So every model gives two numbers, not one:

- the **mean**: its best guess (say 753.1 °F);
- the **spread**, also called the **standard deviation** or **sigma (σ)**: how unsure it is (say ± 3.2 °F).

Draw them as a **bell curve**: the peak sits on the best guess; narrow and tall means "fairly sure", wide and flat means "not sure".

**The 90 % band (W90).** Take the middle of the bell that holds 90 % of the area. Its width, in °F, is **W90**. If W90 is 10 °F, the app is saying "I am 90 % sure the true value is inside this 10 °F window".

**How to read the curves on screen.** On a unit page (for example the Main fractionator), the lever card shows bell curves next to a dashed red line marked **spec ≤ 540.0** (heavy naphtha) or 765 °F (LCO). The **spec** is the product limit: the lab value must stay below it.

**Chance on spec** is the share of the bell's area that sits on the safe side of the red line. If the whole bell is well left of the line, the chance is high. If the line cuts through the bell, the chance falls.

**Why never 100 %?** A bell curve has thin tails that go on forever. There is always a tiny sliver past the line. The app therefore shows **> 99 %** instead of 100 %, and **< 1 %** instead of 0 %. That is honesty, not a bug.

## 3. The model estimate

The key quality numbers are **LCO T98** and **HN T98**: the temperature at which 98 % of the product (light cycle oil, diesel range; heavy naphtha, petrol range) has boiled off. Only the lab measures them, every 8 hours, about an hour after the sample is drawn.

A **model estimate** is the output of a machine-learning model that estimates that lab number **every minute** from the instruments the plant already has: tray temperatures, flows and pressures (the industry calls such a model a soft sensor). Like judging how done a cake is from the oven temperature and the time, without cutting it open. It always comes with its band (± σ or a 90 % band).

Two words keep this honest on screen: **Measured** is what the plant records (sensor readings every minute, lab results every 8 h); **Estimate** is what a model computes. Every T98 number between lab results is an estimate, marked **est.**

**Lags.** A change at the bottom of the column takes minutes to show up in the product. So the model also reads some inputs "as they were a few minutes ago". That delay is a **lag**. The app found each lag on the training runs (searching 0 to 60 minutes). On screen, in **Full explanation** → **Columns the models read**, you see names like "Tray 13 temperature, 12 min ago" or "…, mean of the last 12 min" (numbers vary).

## 4. The four models

Four different kinds of model run side by side. Different kinds fail in different ways: agreement builds trust, disagreement is a warning.

On screen they appear in the chart **WHAT THE 4 MODELS BELIEVE NOW** (section 2 of a unit page) and in **Full explanation** → **Models: what each one computed**, with short letters **L**, **G**, **H**, **N**.

### L: Bayesian ridge regression ("Linear model (Bayesian ridge)")

- **What it is:** a straight-line fit. "Each extra degree on tray 13 adds so much to T98." The **ridge** part is a brake: it stops the model from over-reacting to any single input. **Bayesian** means it also reports how sure it is.
- **Analogy:** a rule of thumb an experienced operator uses.
- **In this app:** a baseline. Its band is wide (it cannot bend), so it is shown for comparison only. Screen: **ref.** next to its row, and "**the linear model is shown for reference only**".

### G: Gaussian process ("Gaussian process")

- **What it is:** a model that answers by asking "which past situations look most like now?" and blending their answers, closer ones counting more. It is smooth, and it can bend.
- **Analogy:** an estate agent valuing a house from similar houses on the same street. With no similar house on record, the agent says "I really don't know" — the band widens.
- **In this app:** a main member. Its widening band is also used as an alarm that inputs are unfamiliar (trust check S2).

### H: Hybrid physics + learned correction ("Physics + correction (hybrid)")

- **What it is:** two layers. First, a simple physics line: T98 rises with the draw-tray temperature (tray 13 for LCO, tray 6 for HN), corrected for column pressure. Then a Gaussian process learns only what the physics line gets wrong.
- **Analogy:** a sat-nav's distance-based arrival time, plus a learned "traffic correction".
- **In this app:** a main member. Because the backbone is physics, it behaves sensibly when things drift.

### N: PINN ensemble (the row **Physics-informed models (5)**)

- **What it is:** **PINN** means "physics-informed" machine-learning model. It is a flexible pattern-learner, but during training it is penalised when it strays far from the physics line, or when T98 goes *down* as the draw-tray temperature goes *up* (a soft rule). **Ensemble** means five copies trained separately. Each gives a guess; the app averages them. Their **disagreement** is added to the spread.
- **Analogy:** five students who learned the same textbook rules, sitting the exam separately. If all five agree, good. If they scatter, be careful.
- **In this app:** a main member.

## 5. The committee: blending by accuracy

The app blends the models into one estimate, like a panel of judges where the more reliable judges get a bigger vote.

**Weights.** Each model's vote is set by its accuracy: the smaller its recent error, the bigger its weight (weight ∝ 1 ÷ squared error). At first the error comes from training ("**accuracy on training runs held out from each fit**"). Once the run has **3 accepted lab results**, the weights switch to "**accuracy against the most recent accepted lab results**". Screen: the weight bars and percentages in **WHAT THE 4 MODELS BELIEVE NOW**, and **Weights from** in Full explanation.

**"4 models, 3 blended" — why one is left out.** A model must first pass an entry test on runs it did not train on:

1. its error is at most **1.40 ×** the linear model's error, and
2. its 90 % band really holds the reference value (see the glossary) between **65 % and 99 %** of the time.

The linear model (L) is always kept as a yardstick but is set to **weight 0** in the blend, because its band is too wide to sharpen the estimate. So you see **Estimation models (4, 3 blended)** in section 4, **How the move is found**.

**Band check.** After training, all bands are scaled (for example **×0.85**) so that the 90 % band held the reference value about 90 % of the time on unseen runs.

**Example (run random_s144, 10:00, LCO):** G 755.2 °F × 38 %, H 755.7 × 32 %, N 753.6 × 30 %, L 749.4 (ref.). Blend ≈ 754.9 °F. Numbers change with the scenario.

## 6. Lab correction and trust checks

**Lab correction (a Kalman-style bias update).** Every time a lab result arrives, the app compares it with what the committee said at the moment the sample was drawn. It then **nudges** the estimate toward the lab, by an amount that depends on how noisy each side is. The lab has a known scatter (**R = 7 °F** reproducibility). If the estimate has been unsure for a long time, the nudge is bigger; if it was just corrected, smaller. The nudge is phased in over 30 minutes, not in one jump. Analogy: correcting a slow watch against the radio time signal, trusting the signal according to how clear it is.

Example: at 10:00 the correction is **−1.75 °F**. You see it as "**lab correction**" in Full explanation.

**Lab screening.** A lab result more than 14 °F (2R) from the estimate is put on **HOLD**; a broken timestamp is rejected.

**The mixture.** The final bell curve is not one bell but the four (three weighted) bells stacked together, shifted by the lab correction. If the bells sit far apart, the stack has two humps ("**bimodal**"): the models tell two different stories.

**Trust signals S1–S7.** Before advising, the app runs seven checks. Screen: **CHECKS BEFORE ADVISING — 8 OF 8 PASS** (the 8th is the spread W90 itself).

| Signal | Label on screen | Plain meaning | Limit |
|---|---|---|---|
| S1 | **models agree** | How far apart the blended models are, compared with the lab's scatter | ≤ 0.5 × R |
| S2 | **inputs inside training range** | Are today's inputs like the training data? | ≤ 1.0 |
| S3 | **HN–LCO gap** | Physics sanity: heavy naphtha must boil at least 50 °F lower than LCO | ≥ 50 °F |
| S4 | **lab track record** | How close the last 5 accepted labs were to the estimate | ≤ 1.5 × R |
| S5 | **sensor health** | Is any input instrument stuck, spiking or out of range? | no flag |
| S6 | **labels for this crude** | Did training include enough examples of this feed type? | ≥ 5 |
| S7 | **spread ratio** | W90 divided by the 14 °F limit, and no two-humped curve | ≤ 1.0 |

**Trust level:** all pass = GREEN; one fails = AMBER; two fail, or any badly = RED.

## 7. The spread gate and "Not yet"

The **spread gate** is a stop rule. If **W90 is wider than 14 °F**, or the models tell two different stories (the two-hump case), the app **withholds** the move. Trust level RED also withholds it. The decision card then says **Not yet** with the reason, for example "the estimate is too uncertain (spread W90 above the 14 °F limit)".

To reopen, W90 must stay below 12.6 °F for 10 minutes in a row, so advice does not flicker.

**Why "Not yet" is a safety feature.** A tool that always answers will sometimes answer confidently and wrongly. Here, the app says when it does not know, suggests "**request a lab sample**" and "**hold current set point**", and waits. Screen: the **NOT YET** tab in section 3, and **Spread gate** in section 4.

## 8. From estimate to a move: the optimiser for the cut point (D1)

The **cut point** is the boiling temperature where one product ends and the next begins. Operators steer it with a set point. The optimiser answers: "move it now, by how much, or wait?"

Every 5 minutes it:

1. tries every move from **−5 to +5 °F in 0.5 °F steps** (5 °F is the SOP step limit);
2. for each, shifts the bell curve by the move (it assumes T98 follows its set point 1 : 1 — a default, shown on screen as "**default; not measured in the data**");
3. keeps only moves with **at least 95 % chance on spec**;
4. picks the one that lands **closest to the target** (LCO 755.3 °F, HN 530.3 °F). Within 1 °F of target: no move.

**Full or half move.** GREEN trust: full move. AMBER trust: a raising move is **halved** (screen: "**Conservative: trust AMBER, half move**"). A lowering move is not halved, because it is the move that keeps the product on spec.

**Timing.** Each advice is valid for 30 minutes (**decide by** time). The lever card quotes the SOP as "**one step at most 5 °F, 30 min between moves**".

**Example (10:00, LCO):** estimate **753.1 ± 3.2 °F**, W90 10.5 °F, chance on spec > 99 %. Advice: **Raise LCO cut point +2.0 °F (752.8 → 754.8)**, landing at 755.1 °F, near the 755.3 °F target.

Screen: headline in section 3; the lever card with **Try another move** slider and **Chance on spec**; tile **Set-point search** in section 4; **THE SEARCH, IN PLAIN WORDS**.

## 9. Anomaly detection

This answers "is something drifting away from normal?"

- **Expected value:** what the unit *should* read now, for this feed. Elsewhere it is a response model (section 11). For T98 there is no minute-by-minute measurement, so anomaly detection runs on the model estimate: expected is the set point plus the recent offset of the estimate from it (a slow 45-minute average).
- **Residual** = measured − expected (for T98: estimate − expected). The "surprise".
- **Rolling sigma (MAD):** how big a normal surprise is, from the last 4 hours. **MAD** (median absolute deviation) is a way to measure typical wobble that ignores one-off spikes.
- **±3σ:** a surprise more than three normal wobbles is flagged "**outside ±3σ**".
- **CUSUM:** a **running tally of small surprises**. Each minute it adds how far the residual is past a small allowance (half a sigma), so tiny drifts in one direction pile up. Past 5 sigma it flags a "**sustained shift**". Like small unexplained card charges every day: none alarms you alone, but the total does.

Screen: section 2 **What we observe**, figures **AWAY FROM EXPECTED**, **SUSTAINED DRIFT (CUSUM)**, **LIKELY DRIVER**; chart "… residual (measured − expected) with ±3σ and CUSUM" (for T98: "LCO T98 estimate − expected with ±3σ and CUSUM"; example at 10:00: **Away from expected +1.2 °F (0.7 σ)**, CUSUM 4.9, and the event **LCO T98 est. +1.3 °F above expected (sustained shift) since 09:06**); tile **Anomaly detection** in section 4.

## 10. The feed model

The FCC is fed heavy gas oil; when the feed changes, everything shifts. The **feed model** watches for that.

- **Feed-API model:** estimates the feed's **API gravity** (a lightness score; higher = lighter) every minute from how the unit responds: coke per feed, riser temperature rise, fuel per feed, regenerator temperature, conversion, tray temperature difference. Held-out error is about 0.2 API.
- **Feed-change detector:** smooths that estimate over 20 minutes and flags a change when it leaves its slow baseline by more than 0.7 API. "Settled" when it stops moving for 15 minutes. While the feed changes, other advice is held.
- **Novelty:** how far the feed sits outside what the models trained on (0 = familiar, 1 = clearly beyond). At **0.5 or above**, advice is **held, not extrapolated**.
- **Feed class:** heavy (API below 22), intermediate (22–26), light (26 and up).
- **Crude family** is shown as context only. The unit sees gas oil, not crude.

Screen: **FEED ARRIVING — WHAT THE FCC IS BEING FED**, "**Feed now: intermediate gas oil — API 23.3**", **Which class is it?**, **Familiar to the model?** (with the **pause advice** marker), **HOW IT KNOWS**, and the **Feed model** tile.

## 11. Response models for the other levers

A **response model** answers: "if I move lever Y by one unit, how much does X move?" Analogy: knowing that one notch on the thermostat warms the room by about one degree.

They come from **step tests**: the simulator moves one set point at a time and the app compares before and after, per feed type.

- **D6 furnace preheat:** measured in **52 simulator step tests** (45 to train, 7 held out): the furnace outlet moves **1.007 °F per °F** of set point. Screen: **Response model (gain measured)**.
- **D5 regenerator air, D7 overhead temperature, D3 riser outlet temperature:** response models for this feed, with gains quoted on the card (for example conversion +0.12 % per °F of riser outlet temperature).

For these levers the move is simple: **move = drift ÷ response gain**, rounded to the lever step and capped at the SOP step. The screen labels this **Move rule** and says plainly that the chance shown comes from a fixed band, "**Not a model search**".

## 12. The recipe optimiser for a new feed

When a new feed arrives, several set points may need to change together. The **recipe optimiser** searches combinations of a unit's own set points, but only:

- inside the engineering limits (integrity operating windows),
- inside the SOP step per move,
- inside what the training data actually covered.

It scores each combination by the gain in wanted products (LCO first, then heavy naphtha, then LPG) minus penalties for extra fuel, power and coke, and demands at least 95 % chance on spec for LCO and HN. If nothing helps enough, or the effect looks implausible, it says **Not yet** with the reason. Cut points are always left to D1. Screen: the D3 decision ("**Recipe for this feed: …; cut points advised separately (D1)**") and tiles **Response models** and **Multi-set-point search**.

## 13. Gemini: explainer, not calculator

**Gemini** is the language assistant behind **Ask Gemini**. It:

- explains a decision in English, Hinglish or Hindi;
- calls the app's read-only tools to fetch numbers (estimates, labs, events, the simulated data);
- cites the SOP and lab result behind the advice.

It does **not** estimate T98, set weights, run the gate or choose moves. The models above do that. Gemini cannot write to anything; the app is advisory only and the operator decides. Screen: **Ask Gemini** button and the **Gemini** tile at the end of section 4.

## 14. Cheat sheet

| Model / method | Plain-English job | Analogy | Where on screen |
|---|---|---|---|
| Bayesian ridge (L) | Straight-line baseline, reference only | Operator's rule of thumb | **Linear model (Bayesian ridge)** · **ref.** |
| Gaussian process (G) | Learns from similar past moments; unsure when far from them | Estate agent using similar houses | **Gaussian process** |
| Hybrid (H) | Physics line + learned correction | Sat-nav time + traffic fix | **Physics + correction (hybrid)** |
| PINN ensemble (N) | Five physics-guided learners; disagreement widens the band | Five students, same rules | Row **Physics-informed models (5)** |
| Committee | Blends by accuracy | Judges with weighted votes | **Estimation models (4, 3 blended)** |
| Lab correction | Nudges estimate toward each lab | Setting a watch by the radio | **lab correction** |
| Trust checks S1–S7 | Seven sanity checks | Pre-flight checklist | **CHECKS BEFORE ADVISING** |
| Spread gate | Withholds when too unsure | "I'd rather not guess" | **Not yet** |
| Set-point search (D1) | Picks the safe move closest to target | Trying shoe sizes, keeping those that fit | **Set-point search**, **Try another move** |
| Anomaly detection | Spots drift from expected | Small daily charges adding up | **AWAY FROM EXPECTED**, **SUSTAINED DRIFT (CUSUM)** |
| Feed model | Estimates feed lightness, spots changes, flags novelty | Tasting the soup to know the stock changed | **FEED ARRIVING**, **Familiar to the model?** |
| Response models | How much X moves per unit of lever Y | Thermostat notch | **Response model (gain measured)**, **Move rule** |
| Recipe optimiser | Coordinated moves for a new feed | Adjusting a recipe for new flour | **Recipe for this feed** |
| Gemini | Explains and cites; never computes | A colleague who reads you the report | **Ask Gemini** |

See also [the glossary](/explainer/glossary) and [how a unit page works](/explainer/unit-page).
