# How to read: Riser reactor

> **In one line:** The riser is where the oil actually gets cracked, and this page shows how hard it is being cracked, whether the riser temperature suits the feed now arriving, and what will go wrong downstream if a drift is left alone.

## 1. What this unit is and why it matters

The **riser reactor** is the heart of the FCC (fluid catalytic cracking unit). It is a tall vertical pipe. Hot oil from the [feed furnace](/twin/unit/unit_1_furnace) is sprayed in at the bottom. There it meets a stream of very hot **catalyst**: a fine powder, like sand, that speeds up the chemistry without being used up. Oil vapour and powder shoot up the pipe together in 2–3 seconds. On the way, long heavy oil molecules **crack** (snap) into shorter, lighter ones: gasoline, LPG (cooking gas), diesel.

- **Analogy:** a very fast, very hot elevator. Heavy oil gets in at the ground floor; by the top floor it has broken into lighter products. The hotter the elevator, the more it breaks.
- **What goes in:** hot feed (165 lb/s, API 23.3 at 10:00) and **regenerated catalyst** from the regenerator.
- **What comes out:** **cracked vapour → fractionator** (the column that sorts products by boiling range) and **spent catalyst → regenerator**. "Spent" means the powder is now coated in **coke**, a black carbon crust left by cracking.
- **Before and after:** furnace before; [main fractionator](/twin/unit/unit_4_fractionator) after for the vapour; [regenerator](/twin/unit/unit_3_regenerator) after for the powder, which burns the coke off and sends the powder back hot. That loop is the **catalyst loop**.

The single most important setting in the whole FCC is the **riser outlet temperature** (often called ROT): how hot the mix is at the top of the pipe. Operators call it **severity**. Higher means more cracking, more gasoline and LPG, but also more coke and more load on the regenerator and gas compressor.

The shared page layout is explained in [how a unit page works](/explainer/unit-page). This guide covers what is special about the riser.

## 2. The key numbers on this page

| Number on screen | What it means | Normal | Worrying |
|---|---|---|---|
| **Riser conversion** (header) | The share of the feed turned into lighter products, in %. | Close to **expected**, the value the response model predicts for this feed: 93.89 % vs 93.81 % at 10:00. | A gap of more than about 1 % that persists. |
| **lever: riser outlet T set point** | The riser temperature target, in °F. The knob. | 969 °F, inside the allowed window 955–985 °F. | Near either end of the window. |
| **Hot feed** | Oil flow and API (lightness; higher = lighter). | 165 lb/s, API 23.3. | An API jump: a new feed. |
| **Regenerated catalyst** | How much hot powder flows in. Simulator scale, so no unit is shown. | Steady. | Marked **under review**. |
| **Reactor–fractionator ΔP** | The pressure difference between reactor and column (ΔP = "delta P", pressure drop). Simulator scale. | Steady at −6.4. | Rising: risk of flooding the column. |
| **Catalyst-to-oil (result)** | Kilos of powder per kilo of oil. A *result*, never a lever. | Steady. | Shown as 302.4 in simulator units; see section 7. |

Conversion carries an **under review** tag: a real FCC rarely goes above about 85 %, so the simulator's 93–94 % is flagged rather than hidden. Numbers change with the scenario and clock.

## 3. The decisions and the lever

The riser has one lever, the **Riser outlet temperature** set point, and two kinds of decision.

**D3 — Recipe for this feed.** Tab label **Coordinated recipe for the new feed**.

- **Question:** **Which set points for this feed (API ≈ 23.2)?** When a new feed settles, the old riser temperature may no longer suit it.
- **Headline:** **Recipe for this feed: raise riser outlet temperature +3.5 °F (969.0 → 972.5); cut points advised separately (D1)**.
- **How it is sized:** a **response model** for this feed says conversion rises **0.12 % per °F** of riser temperature. The model sees conversion 0.4 % short of this feed's target, so **move = 0.4 ÷ 0.12 ≈ 3.3 °F**, rounded to the 0.5 °F step: **+3.5 °F**. The SOP (**SOP-RX-001**) caps one step at 5 °F with 30 minutes between steps. Chance in band: **31 % now, 98 % after the move**.
- **Checks:** **spread W90 0.53 ≤ 1.00 %** and **lever stays inside its window 3.50 ≤ 5.00 °F**, both pass.
- The cut points (the fractionator's product boundaries) are deliberately *not* in this recipe. They have their own decision (D1) on the fractionator page, so each set point gets one piece of advice.
- This recipe is held back while the feed is still changing, or if the fractionator's quality estimate is too uncertain.

**D8 — What breaks downstream.** Tab label **What first; what breaks downstream if nothing is done**.

- **Question:** **Act on the riser now, before it reaches the regenerator?**
- **Status:** **Watch**. It proposes no move. It warns. On s144: **Watch riser conversion +2.0 % above expected (outside ±3σ)**, flagged at 07:00, with **If nothing is done: Over-cracking: coke make rises, regenerator dense-bed T climbs and wet-gas compressor loads up within ~45 min**.
- **"Watch"** means: worth knowing, no move needed yet. The right side reads **Watching; no move needed yet.**

**Never advised here:** catalyst circulation or catalyst-to-oil (they follow from riser temperature, preheat and air), feed rate (set by planning), catalyst addition (not in the simulator).

## 4. What you see on this page, top to bottom

1. **Header.** **Riser reactor**, **Riser conversion 93.89 % under review +0.1 vs expected 93.81**, clock **10:00**, and *Feed and hot catalyst mix here and crack into lighter products in a few seconds. · Operators move: Riser outlet temperature (severity).*
2. **Step 1 — Data in and out.** The drawing: the riser pipe (**riser · 2–3 s contact**), the reactor vessel with **cyclones** on top (spinning separators that pull powder out of the vapour), **Hot feed** and **Regenerated catalyst** entering bottom, **Cracked vapour → fractionator** leaving top, **Spent catalyst → regenerator** leaving right. Beside the vessel: **Conversion 93.9 %**, the blue **lever: riser outlet T set point 969 °F**, and **Reactor–fractionator ΔP**. The side panel lists 6 tags, **Lab: none on this unit**, and **Levers on this unit: Riser outlet temperature 969.0 °F**.
3. **Step 2 — What we observe.** Facts: **Riser conversion now 93.89 %** (plan 93.81), **Away from expected +0.1 %** (0.3 σ, ordinary noise), **Sustained drift (CUSUM) 0.0**, **Likely driver —**, **Feed API 23.2**, and the riser-only box **Catalyst-to-oil (result)** with *follows riser outlet temperature, preheat and air · not advised*. Then the feed panel, the conversion chart and the bell curve.
4. **Step 3 — Decision and lever.** Two tabs because the riser has two items. Clean demo: **Decide · Coordinated recipe for the new feed** first, **Watch · What first; …** second. With D3 selected, the right panel shows **Lever: Riser outlet temperature 969.0 → 972.5 °F +3.5**, the slider **Try another move** (964.0 to 974.0), the before/after bell curves and **Levers and their allowed range** (955.0–985.0).
5. **Step 4 — How the move is found.** For D3: the helper chain (**Feed model**, **Response model**, **Checks**, **Move rule**, **Gemini**), the two passing checks, **What sets the size of the move**, and **How do we know the move works?** That last box reports a replay on the simulated FCC: the +3.5 °F recipe lifted conversion **+0.44 %** after an hour against **+0.42 %** predicted.
6. **Footer.** **This shift on the unit**: conversion events at 06:54, 07:00 and 09:12, and **Crude switch detected (R3→R2)** at 08:19. **Actions taken on this unit**.

> If someone has already clicked **Accept** on the recipe, its tab reads **Accepted**, the **Watch** item moves to the front, and the footer lists the action (for example **Accepted · Riser outlet temperature 969.0 → 972.5 °F · Operator**). Click the other tab to see the recipe again.

## 5. What to click

- Switch between the two tabs in step 3.
- On the recipe, drag **Try another move** and watch the chance change.
- Open **Engineer's note** and **Full explanation** for the reasoning in words.
- **Ask Gemini** to explain "what happens if we hold".

## 6. What to say in the demo

- "The riser is the heart of the FCC: oil and hot powder crack in two seconds. One knob matters most, the riser temperature."
- "A new, heavier feed has settled. The response model for this feed says +3.5 °F brings conversion back to its target, inside one SOP step."
- "Separately, it watches knock-on effects: conversion running high means more coke, a hotter regenerator and a busier compressor within about 45 minutes."
- "It never advises catalyst circulation. That follows from the heat balance."

## 7. Questions people ask

**Why does the header say +0.1 % while the watch item says +2.0 %?** The watch item was raised at 07:00 and is still on the list at 10:00. The header is the value now. Read the time in **Flagged … at 07:00**.

**Is the 0.12 % per °F real?** It is the riser response model for this feed. A replay on the simulated FCC matched it (+0.44 % seen vs +0.42 % predicted).

**Why is catalyst-to-oil "302.4"?** The simulator counts catalyst on its own scale. Treat it as a trend, not a plant number.

**Why not move the cut points in the same recipe?** They have their own decision on the fractionator page, so the operator never gets two different answers for one set point.

**Can it move the riser temperature itself?** No. Advisory only; nothing writes to a control system.

See also the [glossary](/explainer/glossary) and [the models guide](/explainer/models).
