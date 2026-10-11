# How to read: FCC Whole unit

> **In one line:** this is the home screen: one drawing of the whole FCC, what went wrong this shift, a pin on every section that has a decision, and a four-step card that shows, for the section you pick, the data, what we see, the move we propose and how that move was found. A person decides; nothing is written to the plant.

## 1. What this screen is for

The FCC (Fluid Catalytic Cracker) cracks heavy oil into petrol, diesel and LPG in six connected sections. This screen answers three questions, top to bottom:

1. **Is anything wrong?** The header and the "What went wrong" ribbon.
2. **Where, and what should we decide?** The drawing and its pins.
3. **Why this move, and how sure are we?** The four-step card under the drawing.

Open it from the top bar: **FCC → Whole unit** (`/twin`). Numbers come from a simulated FCC and change with the scenario; examples use the default, run `random_s144` at 10:00. New to the process? Read [the FCC from zero](/explainer/basics) first.

## 2. Header, language and scope

**FCC complex   Shift A · 10:00** — the plant name and the simulated shift clock.

Next to it, one sentence counts the decisions:

- **"4 decisions to take"** = open decisions with a proposed move. When none are open it says **"No decision to take"**.
- **"2 waiting for data"** = decisions held back as **Not yet**: the models are not sure enough, so they give no advice.
- **"1 watching"** = a drift is tracked, but no setting is advised.

On the right:

- **How to read this screen →** opens the [Explainer](/explainer) hub.
- **EN · Hinglish · हिंदी** — the language toggle. It sets the language Gemini answers in (and the unit-page briefings). The screen labels stay in English.

Below, a grey line: **"Simulated scope: the FCC complex, 6 sections. Other refinery units (CDU, VDU, hydrotreaters, reformer, alkylation) are not simulated."**

## 3. The "What went wrong" ribbon

One line, left to right:

- **WHAT WENT WRONG 6/6 units on plan** — how many of the six sections have their main number inside its normal band right now. Each section has its own band (for example ±3 °F for LCO T98).
- **08:45 New feed settled at API 23.2 (crude slate R2)** — the feed oil changed at 08:45 and the feed model now knows its quality. **API gravity** is the oil industry's lightness scale: higher means lighter oil. A **crude slate** is the mix of crude oils being run. This item shows only if the feed changed in the last 12 hours.
- **07:00 Riser · Riser conversion +2.0 % above expected** and **09:11 Regenerator · Regenerator cyclone ΔT (afterburn) −1.6 °F below expected** — the top two items from **anomaly detection**. Anomaly detection compares each section with what it should do for this feed and flags a reading that drifts and stays drifted. The time is when the drift started.

**Click an anomaly item** to open that section's card below. The feed item is not clickable.

## 4. The drawing

The FCC drawn as line art, in the order the oil flows, left to right:

| Section | What it does (text under it) | Number under it at 10:00 |
|---|---|---|
| **Feed furnace** | Preheats the heavy gas oil feed | **preheat 615.6 −0.4** (°F) |
| **Riser reactor** | Feed and hot catalyst crack into lighter products in seconds | **conversion 93.89 +0.1 ?** (%) |
| **Regenerator** | Burns coke off the catalyst; that heat drives the cracking | **afterburn ΔT 5.20 +0.2** (°F) |
| **Main fractionator** | Separates the cracked vapour by boiling range | **LCO T98 750.9 −1.8** (°F) |
| **Gas plant** | Cools and condenses the overhead; a compressor recovers light gases | **CW flow 296.9 −1.7** (cooling water) |
| **Stabiliser** | Splits LPG from light naphtha (petrol) | **C5 recovery 19.81 −0.1 ?** |

How to read it:

- **Solid lines with arrows** carry oil and vapour. Labels name products leaving: **HN** (heavy naphtha), **LCO** (light cycle oil, diesel range), **LPG**, **Light naphtha**.
- The **dotted curve** between riser and regenerator is the **catalyst loop**. Catalyst is a fine powder that speeds up cracking. It goes round and round: it cracks oil in the riser, gets coated in coke, is burned clean in the regenerator, and returns hot.
- **Under each section**: its main measure, then the gap from expected (grey = fine, amber = drifting, red = act).
- **Glow.** A section glows **amber** when it drifts, **red** when it needs action, and gets a **blue halo** when it carries an open decision. The section you picked has a blue name and a slowly pulsing halo. At 10:00 in the default run nothing glows: all six are in band.
- **?** after a number means "simulator value under review": the simulator's number is outside what a real FCC shows. Hover it for the reason.

## 5. The pins

Small labels sit above the sections. Each is one decision, placed on the section whose setting it would move.

| Pin | Looks like | Meaning |
|---|---|---|
| **Decide** | Solid blue | Open decision: a move is proposed; you can accept or hold it. |
| **Decide · act first** | Solid blue, bold ending | The most urgent open decision. Only one pin carries it. |
| **Not yet** | Faded, dashed | The models are not sure enough, or lack data, so no move is given. This is a deliberate answer, not a failure. |
| **Watch** | Amber outline | A drift is tracked with its knock-on effect, but no setting is advised. |
| **accepted** / **held** | Green / amber outline | Someone already acted on it. |

**How "act first" is chosen.** The system ranks every decision. Open decisions come first; then held, Not yet, watched and already-handled ones. Inside each group, the decision whose consequence arrives soonest ranks higher (for example "within ~45 min" beats "within ~180 min"). The top open decision gets **act first**. The left-to-right order of the drawing is the oil's path, not urgency.

Hover a pin for its question. **Click a pin or a section** to open it in the card.

At 10:00 in the default run: **Not yet** on the furnace and the gas plant, **Watch** on the riser, and **Decide** pins on the riser (recipe for this feed), regenerator (air) and fractionator (two cut points). Accepting turns them into **accepted** pins.

## 6. The section card: four steps

Under the drawing, a card for one section. The title is the section name, then "click another unit on the drawing to follow its flow". If you have not clicked anything, the card shows the section of the most urgent decision.

If the section has more than one decision, small **picker chips** sit next to the title (for example **Decide · Cut point**). Click one to switch.

Four steps run left to right. Each has a coloured tag naming the piece of AI doing the work.

### Step 1 · Data in and out — HISTORIAN · 1-MIN

- **In** and **Out**: the streams entering and leaving (regenerator: in **Spent catalyst**, **Combustion air**; out **Regenerated catalyst → riser**, **Flue gas**).
- A short table of live readings (regenerator: **Bed temperature 1249.8 °F**, **Afterburn ΔT 5.21 °F**, **Carbon on catalyst 0.30 wt %**). The **historian** is the plant's database of sensor readings, here one value per minute. **sim. units · under review** means the simulator's scale does not match a real plant unit.
- **All 14 tags and curves →** opens the full [unit page](/explainer/unit-page).

### Step 2 · What we observe — ANOMALY DETECTION, plus SOFT SENSOR or RESPONSE MODEL

- **MEASURED NOW** and a big number, its unit and its gap: regenerator **5.20 °F +0.2**, "**Regenerator cyclone ΔT (afterburn) · expected 4.99**".
- Anomaly lines with start time: **09:11 Regenerator cyclone ΔT (afterburn) −1.6 °F below expected (sustained shift)**, or "Tracking expected — nothing unusual."
- A **bell curve**: the model's estimate drawn as a hill. The peak is the best guess; the width is the uncertainty. "5.2 ± 0.6 °F" means "about 5.2, give or take 0.6".
- A note: **Response model: measured 5.2 ± 0.6 °F, chance in band 31%**. On the fractionator it reads **Soft-sensor estimate (the lab comes every 8 h)** with a **chance on spec**. A **soft sensor** estimates a lab result every minute from live readings. A **response model** predicts how a reading answers a change in a setting. See [the models guide](/explainer/models).

### Step 3 · Decision and lever

- The **question**: "**Rebalance regenerator air against riser severity?**"
- The feed it assumed: "**For this feed (API ≈ 23.2, intermediate)**". Every decision states this.
- The **lever** (the setting to move) as **from → to** and the change. Regenerator: **Regenerator air 2.7 → 2.8 lb/s** (the screen rounds to one decimal; the actual move is 2.71 → 2.75, +0.04 lb/s). Other forms: "**Lever: an extra lab sample** — now, not at 14:00", or "**Levers here** … no move proposed yet" for Not yet.
- **Or:** the alternative and its consequence: "Hold — Under-burn: carbon on regenerated catalyst rises … within ~180 min".
- Buttons: **Accept** (or **Pull sample**) and **Hold 30 min**, only while the decision is open and has a move. **Ask Gemini** always: Gemini explains the decision step by step. After acting, a grey note reads "accept 10:00 · audit only". Decline is offered on the unit page.
- Bottom line: **IOCL use case · Regeneration tracking and event-based root cause**.

Accept and Hold are written only to the [Decision record](/explainer/decision-record). Nothing reaches the control system.

### Step 4 · How the move is found — OPTIMISER, CHECKS

When a move is proposed:

- **Goal**: what the move aims for ("Chance cyclone ΔT is back in its band — move = drift ÷ response gain, capped at the SOP step"). On the fractionator: bring T98 to target, never below 95 % chance on spec.
- **Limits**: the rules from the operating procedure (**SOP**): "air rate at most 3 % per step, 15 min between steps".
- **Model**: which model sized the move ("cyclone ΔT moves 0.4 °F per 0.01 air step").
- **Checks**: "**2 of 2 pass before advising**". A check is a safety test the advice must pass, such as "the models agree" or "the setting stays inside its safe window".
- **Two bell curves**, now and after the move, and **Result**: chance in band **31% → 98%**.

For **Not yet**, this step says "**Not run, on purpose:**" and why (gas plant: "the training data has no designed moves of these set points").

## 7. Below the card

- **What this screen solves — 1 IOCL use case: #6** (closed; click **Open ▾**). The use case only the whole-plant view can solve: energy management across units. Inside: the problem, how the cockpit solves it, what goes in and out, and which parts do the work.
- **IOCL USE CASES THIS SHIFT** — one chip per item on IOCL's list. Blue dot = a decision exists on it; amber = watching; dashed = not in this demo. A ring marks the use cases of the decision in the card. **Click a chip** to open its explainer; **×** closes it.
- **DATA PATH** — five boxes: **Simulation** → **BigQuery** (raw tags, `fcc_bronze`) → **Lakehouse** (cleaned tables, `fcc_silver`) → **Models** → **Decision**. On the right, where the screen reads from: "**Read from: BigQuery · fcc_silver** · … · 54 of 54 runs". See [Architecture](/explainer/architecture).

## 8. Timeline, footer and scenario

**Shift timeline** (bottom). A 12-hour strip with hour labels. Each tick is an event: red = alarm, amber = warning, blue = information. Hover a tick to read it. The white triangle is the current time. **Drag** along the strip to move the whole screen to another minute. **▶** replays: the clock moves one simulated minute every 0.4 seconds. The text reads "**10:00 · 21 events in the last 12 h — drag to scrub, ▶ to replay**".

**Footer:** "Simulated data · full_v1 · random_s144 · advisory only — nothing here writes to a control system".

**Scenario** (top right). Click to open. It shows where the data comes from ("Simulated data · BigQuery · random_s144 · 10:00"), a **Simulated run** list (54 runs) and a toggle **LCO T98 / HN T98** for the product the unit pages focus on. Picking a run jumps to that run's last minute; drag the timeline to choose a time. The browser remembers your choice.

## 9. What to click, in a demo

1. The **act first** pin, if any. Point to the bell curves in Steps 2 and 4.
2. **Ask Gemini** on the card.
3. A **Not yet** pin: the system saying "I don't know yet".
4. Drag the timeline back to **08:45** to show the feed change.

## 10. What to say in the demo

1. "One picture of the whole FCC. Pins show where a decision is waiting, and which one comes first."
2. "Click a section: data, what we see, the move, and how the move was found."
3. "Every move states the feed it assumes, its limits and the checks it passed."
4. "When the models are unsure it says Not yet, and why."
5. "A person accepts or holds. It is recorded. Nothing is written to the plant."

## 11. Questions people ask

**Why is the most urgent decision not on the left?** The drawing follows the oil. Urgency follows time to consequence.

**Why "6/6 on plan" when the ribbon lists problems?** "On plan" is the band right now; the ribbon lists drifts that started earlier in the shift.

**Does Accept change the plant?** No. It writes one line to the Decision record.

**Why do some sections say Not yet?** The models lack the data to size a safe move. Giving no advice is safer than a guess.

**Are these real plant numbers?** No. They come from a simulated FCC.
