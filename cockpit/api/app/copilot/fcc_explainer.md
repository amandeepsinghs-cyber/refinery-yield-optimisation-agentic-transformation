# FCC explainer: what you are looking at

> **In one line:** the FCC turns a heavy oil nobody can sell into petrol, diesel and LPG. Its six sections form one connected loop, and product quality comes back from the lab only every 8 hours. This cockpit watches every section each minute, estimates quality between lab results, and proposes one decision at a time. **A person decides; nothing is written to the control system.** All data here is simulated.

---

## 1. Where the FCC sits in the refinery

Crude oil arrives and goes to the **crude unit (CDU / VDU)**, which boils it and splits it by boiling range: gas, naphtha, kerosene, diesel. A **heavy gas oil (VGO)** is left over. It is too heavy to sell as it is, so it becomes the **feed of the FCC** (Fluid Catalytic Cracker).

**Why this matters:** when the refinery switches crude (every 1–2 days), the FCC's *feed* changes. The settings that were right for yesterday's feed are wrong for today's. Feed quality drives every decision in the FCC.

---

## 2. Follow the oil: the six sections, left to right on the screen

The drawing on **FCC → Whole unit** is the process, left to right. Solid lines carry oil and vapour; the curved dotted line is the **catalyst loop**.

| # | Section | What goes in | What happens | What comes out | Number shown under it |
|---|---|---|---|---|---|
| 1 | **Feed furnace** | Heavy gas oil (the feed) | Heated before it meets the catalyst | Hot feed to the riser | **preheat** (°F) |
| 2 | **Riser reactor** | Hot feed + hot catalyst from the regenerator | Feed vaporises and **cracks into lighter molecules in a few seconds**; coke builds up on the catalyst | Cracked vapour → fractionator; coked ("spent") catalyst → regenerator | **conversion** (% of feed cracked) |
| 3 | **Regenerator** | Spent catalyst + air | Air **burns the coke off**; this reheats the catalyst, and that heat drives the cracking in the riser | Hot, clean catalyst back to the riser | **afterburn ΔT** (°F): burning above the bed, a warning sign |
| 4 | **Main fractionator** | Cracked vapour from the riser | A tall column **separates the vapour by boiling range** | Overhead gas + light naphtha → gas plant · **heavy naphtha (HN)** · **light cycle oil (LCO, diesel range)** · slurry at the bottom | **LCO T98** (°F): the product-quality number |
| 5 | **Gas plant** | Fractionator overhead | Cooled and condensed; a compressor recovers the light gases | Liquids and gas → stabiliser | **CW flow** (cooling water) |
| 6 | **Stabiliser** | Liquids from the gas plant | Splits LPG from light naphtha (gasoline) | **LPG** · **light naphtha** | **C5 recovery** |

**The catalyst loop (riser ⇄ regenerator) is the heart of the unit.** Catalyst circulates continuously: it cracks oil in the riser, gets coked, is burned clean and reheated in the regenerator, and goes back. The heat balance between the two sets how hard the unit cracks. Catalyst flow is a **result** of that balance (a slide valve moves catalyst to hold the riser outlet temperature). The cockpit never advises catalyst flow; the levers are **riser outlet temperature, feed preheat and regenerator air**.

**A move travels.** Change the furnace or the riser now, and the fractionator and gas plant feel it 1–3 hours later. That delay is why the operator needs one view of the whole loop.

---

## 3. The three gaps operators live with

1. **The quality gap.** Tray temperatures arrive every second, but product quality (the cut points) comes from the lab only every 8 hours (06:00, 14:00, 22:00), about an hour late. Between lab results the operator is half-blind.
2. **The feed gap.** The feed changes every 12–48 hours. Yesterday's settings are wrong for today's feed.
3. **The time-lag gap.** A move at the reaction side shows up hours later at the separation side. Each console sees only its own unit.

The cockpit answers each gap: a **model estimate** (machine-learning models; the industry calls this a soft sensor) gives quality every minute, with its band; a **feed model** detects the feed change and estimates the new feed's quality; **one ranked list** of decisions shows the consequence across units.

---

## 4. How to read the Whole-unit screen, top to bottom

**Header: "FCC complex · Shift A · 10:00 · 4 decisions to take · 2 waiting for data · 1 watching".** The simulated clock, and how many decisions are open, held back for lack of data ("Not yet"), or only watched.

**"What went wrong" ribbon.** *"6/6 units on plan"* counts sections whose main number is within its expected band. Then the shift's notable events, each with its time:
- *New feed settled at API 23.2 (crude slate R2)*: the feed changed and the feed model now knows its quality (API gravity; higher = lighter).
- *Riser · conversion +2.0 % above expected*, *Regenerator · afterburn ΔT −1.6 °F below expected*: anomaly detection compares each section with what it should be doing for this feed and flags sustained shifts. Click an item to open that section.

**The drawing.** Each section shows its main number and the deviation from expected (e.g. *LCO T98 est. 753.1 +0.4*: T98 is measured only by the lab every 8 h, so between lab results it is the model estimate, compared with its set point). A section **glows amber** when it drifts and **red** when it needs action, and gets a **blue halo** when it carries an open decision. A **?** next to a number means the reading is under review.

**Pins above the sections.**
| Pin | Meaning |
|---|---|
| **Decide** (blue) | An open decision: a move is proposed and you can Accept, Hold or Decline |
| **Decide · act first** | The most urgent open decision: its consequence arrives soonest |
| **Not yet** (faded, dashed) | The models disagree or lack data, so no advice is given. "Not yet" is a deliberate answer, not a failure |
| **Watch** (amber) | A drift is seen and its downstream consequence is tracked, but no lever is advised |

Pins sit on the section where the lever is. **Click a pin or a section** to open its card below.

**The section card: four steps, left to right.**
1. **Data in and out:** the streams and the live tags (1-minute historian data), plus the lab value every 8 h (e.g. *LCO T98, last lab 749.5 °F*).
2. **What we observe:** the **model estimate** (big number, *Estimate now 753.1 ± 3.2 °F*) against its set point and target, with the anomaly events (for T98 they run on the estimate, e.g. *LCO T98 est. +1.3 °F above expected (sustained shift) since 09:06*). The **bell curve** is the estimate's uncertainty; the dashed red line is the spec limit. The further the curve sits from the line, the safer.
3. **Decision and lever:** the question (e.g. *"Raise the LCO cut point now, or wait for the lab?"*), the feed it assumes (*"For this feed (API ≈ 23.2)"*), the proposed set-point move (*752.8 → 754.8 °F*), and the alternative (*wait for the lab at 14:00*). Buttons: **Accept**, **Hold 30 min**, **Ask Gemini**. Accept and Hold are written only to the **Decision record**, never to the plant.
4. **How the move is found:** the **goal** (bring T98 to target, never below 95 % chance on spec), the **limits** (SOP step ≤ 5 °F, 30 min between moves, set-point range), the **model** (*Estimation models (4, 3 blended)*), the **checks** that must pass before advising (e.g. 8 of 8), and the **result**: chance on spec before (solid curve) and after (dashed).

**Below the card.** *What this screen solves* and *IOCL use cases this shift* tie each decision to the client's own list. *Data path* shows where the numbers come from. The **timeline** at the bottom marks every event in the shift: drag to scrub through time, ▶ to replay.

**Changing the scenario.** Top right **Scenario** picks the simulated run and minute. The unit tabs (Furnace … Stabiliser) open one section in full detail; **Decision record** lists every Accept, Hold and Decline.

---

## 5. The nine decisions, in the order the oil meets them

| Where | Decision | Question for the operator | Lever | How it is worked out |
|---|---|---|---|---|
| Feed arriving | **D4** Feed | Is the feed changing, how far through is it, and what is its quality? | none (it sets the context for every other decision) | Feed-change detector + feed-API model |
| Furnace | **D6** Preheat | Trim the feed preheat for the new feed? | Feed preheat set point | Response model, gain measured from step tests |
| Riser | **D3** Recipe for this feed | Which riser outlet temperature for this feed? | Riser outlet temperature | Response model for this feed |
| Riser | **D8** What first | Act on the riser drift now, before it reaches the regenerator? | none (watch) | Drift watch with the downstream consequence |
| Regenerator | **D5** Regenerator air | Rebalance air against riser severity (afterburn)? | Regenerator air | Response model |
| Fractionator | **D1** Cut point | Move the LCO / heavy-naphtha cut point now, or wait for the lab? | LCO / HN T98 set point | Estimation models (4, 3 blended) + optimiser |
| Fractionator | **D2** Trust | Can the estimate be trusted right now? If not: **Not yet** | none | Spread gate across the four models |
| Fractionator | **D9** Extra lab sample | Pull an extra sample now instead of waiting for the next scheduled one? | Lab request | Uncertainty vs time to the next lab |
| Gas plant & stabiliser | **D7** Overhead | Move the overhead temperature target to stay inside the condenser's cooling duty? | Overhead temperature set point | Response model |

**Which decision first?** Open decisions are ranked by **time to consequence**: the one whose effect arrives soonest is marked *act first*. That is why the order on the drawing (left to right, the oil's path) is not the order of urgency.

**Every decision states the feed it assumed** ("For this feed, API ≈ x") and is **held while the feed is still changing or is unlike anything the models were trained on**.

---

## 6. How the model estimate decides: "move now" or "Not yet"

1. **Four models estimate the cut point every minute** from tray temperatures, flows and pressures: a Bayesian ridge regression (reference), a Gaussian process, a hybrid (physics plus a learned correction) and a physics-informed machine-learning (PINN) ensemble. They are blended by their accuracy.
2. **Each lab result corrects the estimate's bias** (a Kalman update), so the estimate stays anchored to the lab.
3. **The spread gate:** if the models disagree too much (90 % band wider than 14 °F), the answer is **Not yet**: no move, and the reason is shown.
4. **The move:** the smallest set-point step (≤ 5 °F, at most every 30 min) that brings the cut point to target with **at least 95 % chance on spec**. Less confident: half a move. Not confident: none.
5. **Advisory only:** Accept / Hold / Decline are recorded; nothing reaches the control system.

**What to say about the models, in one breath:** "These are four standard machine-learning and statistical models, trained on historical data to estimate quality every minute. We combine them and only advise when they agree." Plain-English detail: [the fractionator guide](/explainer/fractionator) (section 2) and [the models guide](/explainer/models).

---

## 7. Glossary

| Term | Plain meaning |
|---|---|
| **API gravity** | How light an oil is; higher API = lighter, easier to crack |
| **Cut point / T98** | The temperature at which 98 % of a product has boiled off. It decides how much heavy material goes into a product: too high and the product is off spec |
| **LCO** | Light cycle oil: a diesel-range product of the FCC |
| **HN** | Heavy naphtha: a petrol-range product drawn above the LCO |
| **Set point** | The target the control system holds; the operator moves it |
| **Riser outlet temperature** | How hot the cracking runs (severity): hotter cracks more |
| **Catalyst-to-oil** | How much catalyst circulates per unit of feed; a result of the heat balance, never advised |
| **Afterburn** | Coke burning above the regenerator bed instead of in it; a warning sign |
| **Conversion** | The share of the feed cracked into lighter products |
| **C5 recovery** | How much of the pentane (C5) ends up in the right product at the stabiliser |
| **Measured** | A value the plant records: sensor readings every minute, lab results every 8 h. T98 is measured only by the lab |
| **Estimate (model estimate, est.)** | The output of a machine-learning model that estimates a lab value every minute from live plant data, always with its band (± σ or 90 % band) |
| **Chance on spec** | The model's probability that the product is within its specification |
| **Not yet** | The cockpit withholds advice because the models disagree or lack data |
| **Anomaly / sustained shift** | A section behaving differently from what it should for this feed, for long enough to matter |

---

## 8. What this demo is, and is not

- **The data comes from a simulated FCC:** a published FCC and fractionator simulator, run many times with feed changes and disturbances, so every number on screen behaves like a real unit. It shows the art of the possible; on your plant the same models are trained and backtested on your historian and lab data.
- **The simulator models feed API only:** sulphur, Conradson carbon, nitrogen and metals need the site's own lab data.
- **No financial figures** on any screen.
- **Advisory only:** nothing is written to any control system.

---

## 9. Presenter quick path (5 minutes)

1. **Architecture → ② How your data comes in:** data leaves the plant one way, real time through the edge and batch on a schedule, into one data engine.
2. **FCC → Whole unit:** read the header and the "What went wrong" ribbon; follow the oil left to right on the drawing.
3. **Click the "act first" pin:** walk the four steps of the card: data → observe → decide → how the move is found.
4. **Show a "Not yet":** the cockpit holding back is the safety feature.
5. **Accept, then open the Decision record:** recorded, not written to the plant.
