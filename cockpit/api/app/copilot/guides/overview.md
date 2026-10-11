# How to read: Overview

> **In one line:** The Overview is the cockpit's front door: it shows a whole refinery, pins each of the client's 11 use cases where they named it, says honestly how much of each we built on the simulated FCC, and explains how models, agents, Gemini and a person work together.

## 1. What this page is for

Click **Overview** in the top bar. This page is the "map on the wall" before you walk into the plant. It answers three questions:

1. **Where do my use cases sit in my refinery?**
2. **What did you actually build for each one, and how far does it go?**
3. **How does the AI work, and who is in charge?**

A few words used throughout:

- **Refinery**: a plant that turns crude oil into petrol, diesel, LPG and other products.
- **FCC (fluid catalytic cracker)**: one unit inside the refinery. It breaks long, heavy oil molecules into shorter, more useful ones, using hot powder called **catalyst**. Our demo runs on a **simulated FCC**: a computer model of the unit, not a real plant.
- **Use case**: one business problem the client wants solved. The client (IOCL) gave a list of 11, numbered **#1** to **#11**.
- **Agent**: a piece of software that watches one part of the plant, checks the numbers, and recommends a move or raises a flag. Think of a specialist assistant for one desk.
- **Model**: a maths formula learned from data that turns sensor readings into a number.
- **Move**: a change to a **set point**, the target a controller holds (like the dial on a thermostat).

## 2. What you see, top to bottom

### Part 1: The title block

- **HOW IT WORKS**, then the headline **One screen to steer the agentic transformation of refinery operations**. "Agentic" means software agents do the watching and recommending; people still decide.
- The paragraph: one AI agent per use case, all sharing the same refinery data; each recommendation reaches the right engineer, who accepts, holds or declines it.
- **See the architecture →**: opens the Architecture page.

### Part 2: The refinery map

Heading: **THE REFINERY — AND WHERE YOUR USE CASES FIT**. The FCC is fed **heavy gas oil** from the crude unit, so every crude change (every 1–2 days) becomes a feed change for the FCC. Read the map left to right, like the oil flows:

| Column | Boxes on screen | In plain words |
|---|---|---|
| Left | **Crude & tankage** ↓ **Crude unit (CDU / VDU)** | Crude arrives; the crude unit splits it by boiling point, like a still. |
| Middle (fed by arrows labelled **naphtha**, **kerosene · diesel**, **heavy gas oil**, **residue**, **LPG · light naphtha**) | **Reformer**, **Hydrotreaters**, **FCC →**, **Coker**, **LPG & alkylation** | The units that upgrade each stream. |
| Right (arrow **all products →**) | **Blending & dispatch** | Final products are mixed to spec and shipped. |
| Bottom strip | **Utilities & flare** | Steam, power, cooling water, fuel gas and the flare, shared by every unit. |

The **FCC** box is outlined in blue and tagged **WHERE WE BUILT**; it lists its "six units: furnace, riser, regenerator, fractionator, gas plant, stabiliser". Click **FCC →** to open the whole-unit page.

**Pins** such as **IOCL #2 shown on FCC · U6** sit where the client named each use case. The dot is the status (Part 3). "shown on FCC · U6" means the client named it on another unit (here the Reformer) and we show the same problem on FCC unit 6. **U1** to **U6** are Furnace, Riser, Regenerator, Fractionator, Gas plant, Stabiliser. **Click a pin** to open a card: the client's wording, **What we built**, the status, an **FCC equivalent** tag if it applies, and **Open U6 →**. Hollow pins such as **Coker · not claimed** mark what we do not cover.

Under the map: the **legend** and a bold summary, **Use cases: 2 interactive · 4 demonstrated · 3 partly · 2 watch only · rest not claimed**.

### Part 3: What each status word means

Every use case and decision carries one status word. The word always sits next to the dot, so colour is never the only signal.

| Dot | Word | What it means | Which use cases |
|---|---|---|---|
| Green | **Interactive** | Runs live on the simulated FCC with trained models. Change the scenario or the time and the numbers recompute. | #1, #11 |
| Amber | **Demonstrated** | The full flow runs end to end on the simulated FCC. The size of each effect comes from a response model set from physics and simulator test moves, not long plant history; on your plant it is refitted from your data. | #2, #3, #4, #5 |
| Yellow | **Partly** | Part of the client's ask is covered, part is not. Example: #10 flags furnace drift but has no coke model. | #6, #7, #10 |
| Blue ring | **Watch only** | Flags a problem and explains what it will do downstream. Proposes no move. | #8, #9 |
| Hollow | **Not claimed** | Not built. The same pattern would apply later. | Coker, alkylation, utilities, pipelines, CDU/VDU optimisation |

**FCC equivalent** is not a status. It is a tag: the client named the problem elsewhere in the refinery, and we show the same problem on an FCC unit.

### Part 4: What the FCC makes

Heading: **WHAT THE FCC MAKES — BY MOLECULE SIZE AND BOILING RANGE**. This is a small reference table.

Two terms first:

- **Cut point**: the boiling temperature where one product ends and the next begins.
- **T98**: the temperature at which 98 % of a product has boiled off, its "heavy end"; the specification limits it.

The columns are **Product**, **Carbon atoms**, **Typical boiling range**, **Goes to**, **What we estimate**. The rows run light to heavy: **LPG**, **Light naphtha**, **Heavy naphtha (HN)**, **Light cycle oil (LCO)**, **Slurry (decant oil)**. Two rows are highlighted. Their last column reads **HN T98 · soft sensor** and **LCO T98 · soft sensor**. A **soft sensor** is a model that estimates a lab value every minute from ordinary plant readings, so you do not wait 8 hours for the lab.

The note under the table says this simulated FCC cuts heavier than typical: LCO T98 about 755 °F, heavy naphtha T98 about 530 °F.

### Part 5: The use-case cards

Heading: **YOUR USE CASE → ITS AGENT → THE DECISION ON SCREEN**. Sub-line: "IOCL list: 'High-value use cases by value area', rows #1–#11. Click a card to open its unit."

There are 12 cards: #1 to #11, then a grey last card. Each card shows **IOCL #n** and a status chip, the client's own wording in bold, the owning agent in blue, the models in small print, and a decision line such as "D1 · Move the LCO cut point to its target now, or wait for the lab?"

| Card | Agent | Status | Decision | Opens |
|---|---|---|---|---|
| #1 Product-quality inferential | Soft-sensor agent | Interactive | D1 | Fractionator |
| #2 Stabiliser overhead, C5 recovery | Light-ends agent | Demonstrated | D7 | Stabiliser |
| #3 LPG balance, C4/C5 split | Light-ends agent | Demonstrated | D7 | Stabiliser |
| #4 Regeneration-cycle tracking | Regenerator agent | Demonstrated | D5 | Regenerator |
| #5 CO and O₂ combustion | Furnace agent | Demonstrated | D6 | Furnace |
| #6 Energy management across units | Systems agent | Partly | D3 | Whole unit |
| #7 Fouling health signal | Light-ends agent | Partly | D7 | Gas plant |
| #8 Filter / coalescer breakthrough | Systems agent | Watch only | D8 | Riser |
| #9 Asset-health monitoring | Systems agent | Watch only | D8 | Whole unit |
| #10 Coke build-up | Furnace agent | Partly | D6 | Furnace |
| #11 Online property prediction | Soft-sensor agent | Interactive | D1 | Fractionator |

The last card, **Rest of the list** / **Not claimed**, names "Coker, alkylation, gas turbines, flare, pipelines" with "Next agents, same pattern". It is not clickable.

Small-print words: **anomaly detection** flags a reading drifting from what is expected; a **response model** says "move this lever by 1, the result moves by this much"; the **optimiser** finds the smallest safe move; **PINN** is a physics-informed machine-learning model; a **consequence check** traces what a drift does to other units, and when.

### Part 6: How an agent works

Heading: **HOW AN AGENT WORKS — MODELS, AGENT, GEMINI, A PERSON**. Four numbered boxes, left to right, like a relay:

1. **Models produce the numbers**: the estimate, how sure it is, and the safe move. Small print: "Deterministic and auditable" (same inputs, same answer).
2. **The agent checks and recommends** (highlighted): checks the numbers against **SOP** limits (the plant's standard operating procedure), recent history and past decisions, then gives one recommendation with evidence, or says "Not yet".
3. **Gemini orchestrates**: Google's language model calls the right agents, explains in plain words and cites the SOP. Small print: "Read-only. The numbers never come from the language model."
4. **A person decides**: Accept, hold or decline. Small print: "Nothing is written to the control system."

### Part 7: Decisions the platform enables

A closed bar: **DECISIONS THE PLATFORM ENABLES (9)** with the hint "In the order the oil meets them · open a decision to see how it works". Click it to open nine rows: **D4, D6, D8, D5, D1, D2, D9, D3, D7**.

Each row shows the code, the question, the unit and the status. D1, D2 and D9 are Interactive; D8 is Watch only; the rest are Demonstrated.

Click a row to open its card:

**Pain point**, **How we solve it**, then **How it works** in six steps (**Data in**, **Algorithms, in order**, **Checks before advising**, **What the operator gets**, **On your plant**, **What we need from you**), the **IOCL use cases**, and a link such as **See it running on U4 →**. The footer lists the data the client must supply.

### Part 8: Guard-rails, learning, and the exit

Two side-by-side bands:

- **A PERSON DECIDES — EVERY TIME**: "Advisory only." Agents propose, a person accepts, holds or declines, every action is recorded (see [the Decision record guide](/explainer/decision-record)). When the models disagree, the screen says "Not yet" and asks for a lab sample.
- **MEITY-COMPLIANT BOUNDARY**: MeitY is India's Ministry of Electronics and Information Technology. The band says data stays in India under keys the client holds, control and safety systems stay on site, and this demo uses simulated data only, no IOCL data.

Then **HOW IT LEARNS AND PROVES ITSELF — PREDICT, DECIDE, MEASURE, LEARN**, four boxes:

| Step | Plain meaning |
|---|---|
| **Predict** | Models give the expected effect of a move and how sure they are. |
| **Decide** | A person accepts, holds or declines. Recorded; nothing sent to the plant. |
| **Measure** | The next lab sample or the unit's instruments show what really happened. Inside the predicted band = confirmed. |
| **Learn** | Each lab result re-anchors the soft sensor; response models learn from real moves and small step tests. |

The note under it: in the demo, one recipe was fed back through the simulator to test its prediction. **On your plant:** a short pilot proves each lever with small step tests measured by your lab.

Last, a blue button: **Open the refinery →** (the whole-unit page). **Ask Gemini** sits at the bottom right on every page.

## 3. What to click

1. A pin, for example **IOCL #2 shown on FCC · U6**, to show "what you asked, what we built".
2. **FCC →** in the map, or any use-case card, to jump to the unit.
3. **DECISIONS THE PLATFORM ENABLES (9)**, then **D1**, to show the six-step "how it works".
4. **Open the refinery →** to start the live demo.

## 4. What to say in the demo

- "This is your refinery. Each pin is one of your 11 use cases, placed where you named it."
- "Every card tells you honestly how far we went: two interactive, four demonstrated end to end, three partly, two watch only."
- "Models make the numbers, an agent checks them, Gemini explains, and a person decides. Nothing writes to your control system."
- "We built on the FCC. The rest of the refinery is the same pattern, one agent at a time."

## 5. Questions people ask (and honest answers)

**What is the difference between Interactive and Demonstrated?** Interactive runs on models trained on the simulated data and recomputes live. Demonstrated shows the full flow, but the size of the effect comes from response models set from physics and simulator test moves; on your plant they are refitted from your data during a pilot.

**Why does a reformer use case show on the FCC?** The problem is the same (an overhead temperature against product recovery), so we show it on the FCC stabiliser. That is what **FCC equivalent** means.

**Has any prediction been tested?** Yes, on the simulator. One recipe was replayed with and without the move. The riser-temperature gain landed inside the predicted band; the cut-point part was only partly confirmed. See [the models guide](/explainer/models).

For more terms, see [the glossary](/explainer/glossary) and [how a unit page works](/explainer/unit-page).
