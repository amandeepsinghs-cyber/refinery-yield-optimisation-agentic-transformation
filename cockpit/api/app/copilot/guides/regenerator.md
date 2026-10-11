# How to read: Regenerator

> **In one line:** The regenerator burns the coke off the used catalyst so it can go back to work hot, and this page tells you whether that burn is balanced and, if not, how much to nudge the combustion air.

## 1. What this unit is and why it matters

In the [riser](/twin/unit/unit_2_riser), the catalyst powder gets coated in **coke**, a black carbon crust left behind by cracking. Coated powder stops working. The **regenerator** is a large vessel where that powder is blown up with air into a bubbling, fluid-like **dense bed**, and the coke burns off.

- **Analogy:** a self-cleaning oven that also heats the house. Burning the dirt off the catalyst cleans it, and the heat from that fire is what drives the cracking in the riser.
- **What goes in:** **spent catalyst from riser** and **combustion air** (2.71 lb/s at 10:00 on the default run), pushed in by the **air blower**.
- **What comes out:** **regenerated catalyst → riser** (clean and about 1250 °F hot) and **flue gas** (the exhaust of the burn) through the **cyclones**, spinning separators at the top that keep the powder inside.
- **Before and after:** riser before (spent powder in), riser after (hot powder out). The two units form the **catalyst loop**.

The balance to get right is **air versus coke**:

- **Too little air (under-burn):** some coke stays on the powder, the powder works less well, and riser conversion slips.
- **Too much air, or burning in the wrong place (afterburn):** carbon monoxide (CO) escapes the bed and burns *above* it, near the cyclones. The top gets hotter than the bed. That eats into the metal temperature limits of the cyclones.

The shared page layout is explained in [how a unit page works](/explainer/unit-page). This guide covers the regenerator only.

## 2. The key numbers on this page

| Number on screen | What it means | Normal | Worrying |
|---|---|---|---|
| **Regenerator cyclone ΔT (afterburn)** (header) | How much hotter the cyclones are than the bed, in °F (ΔT = temperature difference). The tell-tale of afterburn. | Close to **expected** for this feed: 5.20 °F vs 4.99 °F at 10:00. | A steady rise above expected (afterburn) or fall below it (under-burn). |
| **Combustion air** | Air blown into the bed, in lb/s. The lever. | 2.71 lb/s, inside the window 2.49–2.93. | Near either end of the window. |
| **lever: bed T set point** | The bed temperature target the simulator's own controller holds, 1250 °F. | Steady at 1250 °F. | (Not what this page advises; see section 7.) |
| **Carbon left on catalyst** | How much coke is still on the powder after the burn, in weight %. | Low: 0.26 wt %. | Rising: the burn is not finishing. |
| **Coke burn**, **Air blower power** | How much coke burns and how hard the blower works. Simulator scale, so marked **under review**. | Steady. | Rising together with a falling ΔT. |
| **Valves V6 / V7** | Opening of the air valves, %. | 26 / 55 %. | Close to fully open. |

The regenerator's bed temperature also appears in step 2 as **Regenerator T 1250 °F** in the feed fingerprint. Flue-gas O₂ and CO are *not* shown on this page; the O₂ and CO figures in the app belong to the furnace exhaust. Numbers change with scenario and clock.

## 3. The decision and the lever: D5 Regenerator air

- **The question on screen:** **Rebalance regenerator air against riser severity?** "Severity" means how hard the riser cracks; harder cracking makes more coke, which needs more air.
- **The lever:** **Regenerator air (excess O₂ / afterburn)** in lb/s. "Excess O₂" is the leftover oxygen after the burn.
- **How the move is sized:** the regenerator **response model** for this feed says cyclone ΔT moves **0.4 °F per 0.01 lb/s** of air. The rule is **move = drift ÷ gain**, rounded to 0.01 lb/s and capped at 0.08 lb/s per step. The SOP (**SOP-REG-004**) says at most 3 % per step, 15 minutes between steps, and flue-gas O₂ stays in its window.
- **Chance:** the share of the ΔT bell curve inside its band, now and after the move. Goal: at least 95 %.
- **"Not yet"** would mean the cockpit saw a drift but held advice back, for example while a new feed is still arriving.
- **Never advised here:** catalyst circulation (a result), feed rate, catalyst addition.

Two real examples:

| Run at 10:00 | What the page shows |
|---|---|
| random_s144 (default) | **Raise regenerator air +0.04 lb/s (2.71 → 2.75)**. Cyclone ΔT ran 1.6 °F *below* expected from 09:11: an under-burn sign. **If nothing is done: Under-burn: carbon on regenerated catalyst rises, activity falls and riser conversion slips within ~180 min.** Chance in band **31 % now, 98 % after the move**. |
| random_s107 | **Lower regenerator air −0.03 lb/s (2.65 → 2.62)**. ΔT ran 1.4 °F *above* expected from 07:34: afterburn. **If nothing is done: Afterburn: cyclone metal temperature margin erodes …** Chance **31 % → 95 %**. |

The worked arithmetic on s144: 1.6 °F ÷ 40 °F per lb/s = 0.04 lb/s.

## 4. What you see on this page, top to bottom

1. **Header.** **Regenerator**, **Regenerator cyclone ΔT (afterburn) 5.20 °F +0.2 vs expected 4.99**, clock **10:00 · next lab 14:00**, and *Burns coke off the spent catalyst; this reheats it, and that heat drives the cracking in the riser. · Operators move: Regenerator air.*
2. **Step 1 — Data in and out.** The drawing: a tall vessel with the **dense bed** at the bottom and a **cyclone** at the top. **Spent catalyst from riser** enters left; **Combustion air 2.71 lb/s** (in blue, the lever) enters at the bottom with **Valves V6 / V7** and **Air blower power**; **Flue gas** leaves at the top; **Regenerated catalyst → riser** leaves bottom right with **Carbon left on catalyst 0.26 wt %**. Beside the cyclone: **Cyclone ΔT (afterburn) 5.0 °F**, **lever: bed T set point 1250 °F** and **Coke burn**. The side panel: 10 tags, **Lab: none on this unit**, **Levers on this unit: Regenerator air (excess O₂ / afterburn) 2.71 lb/s**.
3. **Step 2 — What we observe.** **Regenerator cyclone ΔT (afterburn) now 5.20 °F** (plan 4.99), **Away from expected +0.2 °F** (0.4 σ, ordinary noise), **Sustained drift (CUSUM) 0.0**, **Likely driver —**, **Feed API 23.2**. Then the feed panel, the ΔT chart and the bell curve **What the response model expects now**.
4. **Step 3 — Decision and lever.** One decision, so no tabs. Question, headline, **For this feed (API ≈ 23.2, intermediate)**, **If nothing is done**, the chance line and **2 of 2 trust checks pass**. On the right: **Lever: Regenerator air 2.71 → 2.75 lb/s +0.04**, the slider **Try another move** (2.63 to 2.79), the bell curves, the SOP line, and **Levers and their allowed range** (2.49–2.93).
5. **Step 4 — How the move is found.** The helper chain, **Checks before advising — 2 of 2 pass** (**spread W90 2.11 ≤ 3.37 °F**, **lever stays inside its window 0.04 ≤ 0.08 lb/s**), **The search, in plain words** (result: 2.71 → 2.75 lb/s, margin 1.3 °F) and **What sets the size of the move**. Then **How do we know the move works?**: after a move, the cyclone ΔT and flue-gas O₂ would be checked over the next 30–60 minutes.
6. **Footer.** **This shift on the unit**: **Cyclone ΔT drifting (sustained)** at 09:11, **Crude switch detected (R3→R2)** at 08:19.

> In a clean demo the decision shows **Accept / Hold 30 min / Decline**. If someone has already accepted it, those buttons disappear and a grey line reads **accept at 10:00 · recorded in audit, nothing sent to the plant**; **Earlier on this decision** then lists who accepted it.

## 5. What to click

- Drag **Try another move** past 2.79 and back: watch the chance drop when the move is too small or too big.
- Open **Engineer's note** for the full sentence.
- **Ask Gemini** what happens if we hold.

## 6. What to say in the demo

- "The regenerator is a self-cleaning oven: it burns the coke off the powder, and that fire powers the riser."
- "The tell-tale is the cyclone temperature difference. Low means coke left behind; high means afterburn."
- "Here it ran 1.6 °F low for an hour. The response model says 0.04 lb/s more air closes the gap, well inside one SOP step."
- "On another run the same page says the opposite, *less* air, because the sign of the drift flipped. Same rule, same checks."

## 7. Questions people ask

**The drawing marks "bed T set point" as a lever, but the advice moves air. Which is it?** The advice only ever moves **Regenerator air**, as **Levers on this unit** says. The bed temperature target belongs to the simulator's own controller and is shown for context.

**The header says +0.2 °F, but the decision says −1.6 °F. Why?** The decision was raised when the drift was flagged (09:11) and stays open until acted on. The header is the reading at 10:00.

**Is 0.4 °F per 0.01 lb/s measured?** It is the regenerator response model. The page says openly that the simulator's air tests rarely settled, so a short pilot on your plant would confirm the gain.

**Why not show flue-gas O₂ here?** This page shows cyclone ΔT, the signal the advice is built on. O₂ is named in the SOP limit.

**Does it change the air itself?** No. It advises; nothing writes to a control system.

See also the [glossary](/explainer/glossary) and [the models guide](/explainer/models).
