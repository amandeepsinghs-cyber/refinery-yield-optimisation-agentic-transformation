# How a unit page works

> **In one line:** Every unit page tells the same four-step story, top to bottom: what the sensors read, what looks unusual, what to move and by how much, and how that advice was found and checked.

## 1. What this page is for

The FCC has six sections, each with its own page: Furnace, Riser, Regenerator, Fractionator, Gas plant and Stabiliser (top menu). All six share one layout. Learn it once and you can read any of them.

The layout follows four steps, like a doctor's visit:

| Step | Doctor's visit | On screen |
|---|---|---|
| 1 | Take the readings | **Data in and out** |
| 2 | Spot what is off | **What we observe** |
| 3 | Suggest a treatment | **Decision and lever** |
| 4 | Explain why, and how sure we are | **How the move is found** |

A **lever** is a setting an operator may change, such as a temperature target. The page is **advisory only**: it suggests, a person decides, nothing is sent to the plant. The data comes from a simulated FCC. Numbers below are from the default scenario (run random_s144 at 10:00) and change with the scenario and minute.

## 2. What you see, top to bottom

### Part A: the header

- **Breadcrumb** **FCC complex › Main fractionator**: click **FCC complex** to go back to the whole-unit page.
- **Headline number**: the unit's most important reading. On the fractionator: **LCO T98 est. 753.1 ± 3.2 °F +0.4 vs set point 752.8 · target 755.3**. T98 is measured only by the lab every 8 h, so the headline is the **model estimate** (**est.**) with its ± spread; it is 0.4 above the **set point** (the value the controller holds, like a thermostat setting). The **target** is where the advice wants it. Other units say **vs expected**: versus what the model expects right now.
- **under review**: a tag next to a simulated value that looks unrealistic for a real plant. Hover it for the reason.
- **10:00 · next lab 14:00**: the minute you are viewing, and when the next lab sample is due.
- **EN / Hinglish / हिंदी**: the language of the text.
- **Role line**: what the unit does, then **Operators move:** and its levers.
- **Step bar** **1 Data · 2 Observe · 3 Decide · 4 Optimise · ? What it solves**: jumps down the page. A number on **Decide** counts decisions waiting for a person.
- **Engineer view (all panels)**: the older, denser screen. Not needed in a demo. On the fractionator its target-distribution card shows **Last lab** (value and time) for T98, and its model card reads **labels: reference values from the simulator (on site: lab results)**.

Each step title carries chips saying who does the work (for example **HISTORIAN · EVERY MINUTE**), an italic question, and **How this step works ▾**, which opens **Answered by**, **In → out** and **How to read it**.

### Part B: step 1, **Data in and out**

- **The drawing**: a sketch of the unit with live values where they are measured. Blue **lever:** text marks a setting operators can change. A dotted underline with **?** or **under review** flags a doubtful simulated value.
- **How fresh the data is**: **Sensors** (readings per minute), **Lab** (last result, or **none on this unit**), **Next lab**, and either **Model estimate fills the gap: an estimate every minute** or **Response model**. A **model estimate** is the output of machine-learning models that estimate a lab value every minute from ordinary readings (the industry calls such a model a soft sensor). A **response model** gives the value a reading *should* have right now.
- **Levers on this unit** and **What comes in**: current settings and main inputs.
- **All N tags on this unit**: a table of every reading (a **tag** is one sensor's name) with **Now**, **Shift min** and **Shift max**. On the fractionator the T98 row is labelled **LCO T98 model estimate (lab every 8 h)**: it is not a sensor.
- Fractionator only: **What the FCC makes — by molecule size and boiling range**.

### Part C: step 2, **What we observe**

**The fact row**:

| Card | Plain meaning |
|---|---|
| **Estimate now** (or **… now** with a **plan**) | Best value now, its ± spread, and the **chance on spec** (chance the product meets its quality limit) |
| **Away from expected** | Measured minus expected (for T98: estimate minus expected), in **σ** (sigma: the normal size of the wobble). Under 1 σ is noise |
| **Sustained drift (CUSUM)** | A running total of small misses, so a slow creep is caught early. **no breach open** = no alarm |
| **Likely driver** | The input contributing most to the miss, or **nothing unusual** |
| **Feed** | Feed quality as **API** (a density scale: higher = lighter oil) |

**Feed arriving — what the FCC is being fed**: green when the feed is steady and familiar (**✓ advice for this feed is active**), amber while it changes (advice paused), red when it is unlike anything the models were trained on. **Which class is it?** gives the chance of heavy, intermediate or light. **Familiar to the model?** is a gauge from **familiar** to **unfamiliar**. Past the **pause advice** mark, advice stops. **How it knows** gives the feed estimate's accuracy on test runs.

**How a feed change plays out on this run**: five columns telling the last feed change with clock times (07:07 schedule change, 07:49 detected, 08:45 settled).

**The charts** share one time axis:

- The **horizontal axis** is clock time over the shift (up to 12 hours), ending at the current minute. Clicking a chart moves the page back to that minute.
- **Measured vs expected**: the measured line, the models' expected line, and a shaded **band** for the normal range (5–95 %, or ±2σ). Inside the band means "as expected". On the fractionator the T98 chart is **LCO T98 — model estimate (90 % band) vs expected · lab every 8 h** (legend: **Model estimate**, **90 % band of the estimate**, **Expected (set point + recent offset)**, **Lab result (measured)**): there is no minute-by-minute T98 measurement, so the estimate takes the place of the measured line, and **expected** is the set point plus the estimate's recent offset from it (a slow 45-minute average).
- Dashed **Plan (…)** = the set point. Red dotted **Spec max** = the quality limit.
- Dotted vertical lines with **◆** are events: **Change-point** (red, a sudden step), **Crude switch detected** (purple).
- **Residual** chart: measured minus expected (on the fractionator: **LCO T98 estimate − expected with ±3σ and CUSUM**), dashed **±3σ** alarm lines, and an orange **CUSUM** line on the right-hand scale.

**The bell curves**: **What the 4 models believe now** (fractionator) or **What the response model expects now**. A **bell curve** shows a best guess (the peak) and how unsure it is (the width). Narrow means confident. Bars below show each model's weight. See [the models guide](/explainer/models).

Fractionator only: **LCO T98 — model estimate between lab results**, the estimate line with its 90 % band, the red spec line, and the lab points labelled **Lab result (measured)**.

**Show levers, feed and products over the shift** opens three more charts.

### Part D: step 3, **Decision and lever**

**Decision tabs**: one per decision on this unit, each led by a status word:

| Status | Meaning |
|---|---|
| **Decide** | Advice is ready for a person |
| **Watch** | Something is moving; no move needed yet |
| **Not yet** | Withheld on purpose: the models are not sure enough |
| **Held** | Someone pressed Hold; it returns after 30 minutes |
| **Accepted** / **Declined** | Someone already responded |

**The left side** reads like a memo: the question (**Raise the LCO cut point now, or wait for the lab?**), the headline (**Raise LCO cut point +2.0 °F (752.8 → 754.8)**), the feed it was sized for (**For this feed (API ≈ 23.2, intermediate)**), **If nothing is done:** with a **decide by** time, and three bullets with the numbers. **Engineer's note** opens the technical wording. A withheld decision says **Not advised yet, on purpose:** and why.

**The buttons**: **Accept** (or **Pull sample** for a lab request), **Hold 30 min**, **Decline**, **Ask Gemini** (the AI assistant explains in words). After a click: **accept at 10:00 · recorded in audit, nothing sent to the plant**. The click goes to the [Decision record](/explainer/decision-record). Neither the plant nor the simulation changes. Below: the client use case it solves, and **Earlier on this decision**.

**The lever panel**: **LEVER** and its name, then a big **from → to**. **Try another move** is a what-if slider, with **now** and **advised** values under it. The slider starts on the advised move, so it first reads **752.8 → 754.8 +2.0**, the same as the headline. Drag it and:

- the solid curve (**product now**, then **product after your move**) slides toward the dotted green **target** curve. Lined up, it says **On target**.
- the red shaded zone beyond **spec** is off-quality. Stay clear of it.
- **Chance on spec A → B** updates live.
- a move bigger than one **SOP** step (SOP: the written operating procedure; here at most 5 °F) prompts a note to split it into two moves 30 minutes apart.

Without a target you see **now** (solid) and **after** (dashed). **Levers and their allowed range** shows each lever's window and the settings the cockpit never recommends.

### Part E: step 4, **How the move is found**

- **The chain**: six cards with chips **Rule-based** (fixed rules such as anomaly detection), **ML** (learned models), **Check**, **Optimiser** (the search for the best move) and **Gemini**. A relay from "something moved" to "here is the move".
- **Full explanation: which data goes in, what each model does with it, and how the decision is taken**: opens five sections, **Data in**, **Columns the models read**, **Models: what each one computed**, **Checks before advising**, **Decision**. The full audit trail of one decision.
- **Checks before advising — 8 of 8 pass**: one bar per safety check; the tick is the limit; **PASS**, **FAIL** or **skipped**. A failed stop-rule turns advice into **Not yet**.
- **The search, in plain words**: **Goal**, **Limits**, **Model**, **Trained on**, **Result**.
- **What sets the size of the move**: **Sets the move**, the SOP step **Limiting** or **Not limiting**, **Room** to the limit, and the **Closest check** if one is near failing.
- For a **Not yet**: **What is missing before this becomes advice**.

### Part F: **How do we know the move works?**

Four boxes, **Predict → Decide → Measure → Learn**, each with a chip:

| Chip | Meaning |
|---|---|
| **Built** | Working in this demo |
| **Shown, not run in the replay** | Described; the replay does not apply accepted moves, so no result is measured here |
| **Pilot on site** | Needs a real plant |
| **Response model** / **Measured gain** | How the predicted effect was sized |

Below: **Evidence so far (simulated data)**, a simulator test with a status such as **PARTLY CONFIRMED**, and **On your plant:**, how a pilot would prove each lever. Shown only when there is a move or sample to prove.

### Part G: the bottom

- **What this screen solves** (**Open ▾**): the client use cases this page answers.
- **This shift on the unit**: the last six events, newest first. T98 events are about the estimate, e.g. **LCO T98 est. drifting (sustained)**.
- **Actions taken on this unit**: earlier clicks, with **Full decision record →**.
- **Simulated data · run random_s144 · advisory only — nothing here writes to a control system**.

## 3. What to click

1. **How this step works ▾**: plain-words help for any step.
2. A **decision tab**: switches steps 3 and 4 to that decision.
3. **Try another move**: the live what-if.
4. **Full explanation**: proves nothing is hidden.
5. **Ask Gemini**: a plain-language explanation.
6. To move the clock forward, use the shift timeline on the [Whole unit page](/explainer/whole-unit) (drag it or press ▶), then come back.

## 4. What to say in the demo

- "Every unit page tells one story in four steps: readings, what's off, what to move, and why."
- "Between lab samples the models give a number every minute, and say how sure they are."
- "This slider is a what-if. Watch the chance of staying on spec as I move it."
- "If the checks fail, the page says Not yet, on purpose. It doesn't guess."
- "A person decides. Every click is recorded; nothing goes to the plant."

## 5. Questions people ask

**Why does the slider start where it does?** It starts on the advised move (**advised 754.8**), the same as the headline. Drag it to see what a smaller or larger move would do to the chance on spec.

**Why does every T98 number say est.?** A real plant measures T98 only in the lab, every 8 hours. Between lab results the header, the drawing and **Estimate now** all show the same model estimate (753.1 ± 3.2 °F at 10:00), with its ± spread. The measured T98 values are the lab results (the last one: 749.5 °F at 06:00).

**Why do the tabs already say Accepted?** Someone pressed Accept for this run and minute before. The decision record keeps every click.

**Does Accept change anything?** It writes one line to the decision record. Nothing writes to a control system.

More terms: [glossary](/explainer/glossary). The richest example: [the main fractionator](/explainer/fractionator).
