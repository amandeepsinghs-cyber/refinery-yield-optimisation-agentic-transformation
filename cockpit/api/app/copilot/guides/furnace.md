# How to read: Feed furnace

> **In one line:** The furnace warms the oil before it meets the hot catalyst, and this page tells you whether that warm-up is on target and, if it has slipped, by how many degrees to nudge the preheat setting.

## 1. What this unit is and why it matters

The **feed furnace** is the first stop in the FCC. FCC stands for *fluid catalytic cracking*: a plant that breaks heavy oil into lighter, more useful products such as gasoline, LPG (cooking gas) and diesel.

The oil arriving at the FCC is **heavy gas oil**, a thick, waxy liquid. Before it can be cracked it must be warmed. The furnace does that job.

- **Analogy:** think of a kettle on a gas hob. Cold water goes in, burners heat the pipe, hot water comes out. Here the "water" is oil running through a coil of tubes, and the hob is a box of gas burners called the **firebox**.
- **What goes in:** cold-ish gas oil (about 458 °F at 10:00 on the default run) and fuel gas for the burners.
- **What comes out:** hot feed (about 616 °F) that flows straight into the riser, plus **flue gas** (the exhaust from the burners) up the stack.
- **Before and after:** nothing comes before it inside the FCC. After it comes the [riser reactor](/twin/unit/unit_2_riser), where the hot feed meets hot catalyst.

Why the temperature matters: the riser has to reach a fixed cracking temperature. If the feed arrives cooler, the plant automatically sends *more* hot catalyst to make up the heat. More catalyst per kilo of oil (called **catalyst-to-oil**) means more cracking and a cooler regenerator. So a few degrees of preheat quietly changes the whole heat balance downstream.

For the parts every unit page shares (the four steps, the check list, the buttons), see [how a unit page works](/explainer/unit-page). This guide covers only what is specific to the furnace.

## 2. The key numbers on this page

| Number on screen | What it means | Normal | Worrying |
|---|---|---|---|
| **Feed preheat outlet** (header) | How hot the oil is as it leaves the furnace, in °F. | Within about ±1 °F of the **set point** (the target the operator dialled in), 616.0 °F here. | A steady gap of 1.5 °F or more that does not go away. |
| **lever: set point** | The target temperature the operator has asked for. This is the knob. | 616.0 °F, inside the allowed window 590–640 °F. | Near either end of the window. |
| **Gas-oil feed** | Oil flow (lb/s, pounds per second), its inlet temperature and its **API**. API is an industry scale of how light the oil is: higher API = lighter, easier to crack. | 165 lb/s, 458 °F, API 23.3 on the default run. | A sudden API jump means a new feed is arriving. |
| **Fuel gas**, **Fuel valve V1** | How much fuel the burners use and how open the fuel valve is (%). | Steady. | Rising fuel for the same outlet temperature. |
| **Flue gas O₂**, **CO** | Oxygen and carbon monoxide in the exhaust. Little oxygen plus lots of CO means the burners are not burning cleanly. | A real heater runs at about 2–3 % O₂ and under 100 ppm CO. | The simulator shows 0.01 % and 31,335 ppm. Both carry an **under review** tag (see section 6). |

Numbers change with the scenario and the clock; the ones above are run random_s144 at 10:00.

## 3. The decision and the lever: D6 Furnace preheat

- **The question on screen:** **Trim the feed preheat to set catalyst-to-oil for the new crude?**
- **The lever:** **Feed preheat** set point, in °F. It is the only thing this page will ever advise moving.
- **How the move is sized:** a **response model** says how much the outlet temperature moves per degree of set point. For the furnace this gain is *measured*: in 52 step tests on the simulated FCC, the outlet followed the set point one-for-one within 15 minutes, and lower preheat raised catalyst circulation in every test. The rule is simple: **move = drift ÷ gain**, rounded to 0.5 °F, and never more than 5 °F in one step (the operating procedure, **SOP-FURN-002**, also asks for 20 minutes between steps).
- **What "chance" means:** the screen draws a band around the target and shows the chance that the outlet sits inside it, now and after the move. The goal is at least 95 %.
- **"Not yet":** the cockpit sees something odd but will not advise a move, and says why.
- **Never advised here:** the burner air or fuel trim (not in the simulator), catalyst circulation (it is a *result* of preheat, riser temperature and air), and feed rate (set by planning).

Two real examples:

| Run at 10:00 | What the furnace page shows |
|---|---|
| random_s144 (default) | **Not yet**. Headline **Watch flue-gas CO pattern detected — no move proposed yet**. The outlet is on target; the odd signal is the burner exhaust, and its lever is not in the simulator. |
| random_s107 | **Decide**. Headline **Raise feed preheat set point +1.5 °F (616.0 → 617.5)**. The outlet sat 1.7 °F below expected since 08:28. Chance in band **31 % now, 96 % after the move**. |

## 4. What you see on this page, top to bottom

1. **Header.** Title **Feed furnace**, then **Feed preheat outlet 615.6 °F −0.4 vs set point 616.0**, the clock **10:00 · next lab 14:00**, and one line: *Preheats the heavy gas oil feed before it meets hot catalyst. · Operators move: Feed preheat temperature.*
2. **Step 1 — Data in and out.** A line drawing of the furnace: feed enters on the left, the tube coil runs through the **firebox · radiant coil**, three burner flames sit at the bottom, and **Hot feed → riser** leaves on the right with **Preheat outlet 616.5 °F** and, in blue, **lever: set point 616.0 °F**. Fuel and valve sit bottom left; **Flue gas** O₂ and CO sit top right. On the right side: **How fresh the data is** (9 tags, every minute; **Lab: none on this unit**; **Response model** gives the expected value every minute), **Levers on this unit** (Feed preheat 616.0 °F) and **What comes in**.
3. **Step 2 — What we observe.** Five facts: **Feed preheat outlet now** 615.6 °F (plan 616.0), **Away from expected** −0.4 °F (0.8 σ — σ is the normal wobble, so under 1 σ is ordinary noise), **Sustained drift (CUSUM)** −0.1 (a running total that grows only when the gap persists), **Likely driver** "—", and **Feed** API 23.2. Below are the feed panel, the chart **Preheat outlet — measured vs expected**, the residual chart, and the bell curve **What the response model expects now**. The furnace page also has an extra **combustion** chart in the engineer view.
4. **Step 3 — Decision and lever.** On s144: the question, the **Watch …** headline, **For this feed (API ≈ 23.2, intermediate)**, and **Not advised yet, on purpose:** with the reason. On the right, **Levers here** shows Feed preheat 616.0 °F. On s107 you instead see the move, the **Accept / Hold 30 min / Decline** buttons, and a slider **Try another move** from 611.0 to 621.0 °F.
5. **Step 4 — How the move is found.** The chain of helpers (**Anomaly detection**, **Feed model**, **Response model (gain measured)**, **Checks**, **Move rule**, **Gemini**), then **Checks before advising** (on s107: **spread W90 2.24 ≤ 3.58 °F PASS**, **lever stays inside its window 1.50 ≤ 5.00 °F PASS**), **The search, in plain words**, and **What sets the size of the move**.
6. **Footer.** **This shift on the unit** (s144: **Flue-gas CO combustion pattern** at 07:15 and 08:15) and **Actions taken on this unit**.

## 5. What to click

- On s107, drag **Try another move**: the dashed "after" curve slides and the chance updates. Drop it at 617.5 to see the advised 96 %.
- Open **Engineer's note** for the full sentence behind the advice.
- **Ask Gemini** explains the decision in English, Hinglish or Hindi.
- Click **Accept** to see it land in the [decision record](/audit). Nothing is sent to the plant.

## 6. What to say in the demo

- "The furnace is the kettle. Its one job is to hand the riser oil at the right temperature."
- "Today it is on target, so the cockpit does not invent a move. It flags a burner pattern and says plainly that it has no lever for it."
- "On another run the outlet drifts 1.7 °F low. The response model, measured in 52 step tests, says the outlet follows the set point one-for-one, so it advises +1.5 °F."
- "Advisory only. The operator accepts or declines, and every click is recorded."

## 7. Questions people ask

**Why is there a move on one run and not the other?** The move appears only when the outlet itself drifts. On the default run it is on target.

**Is the 1:1 gain real?** It comes from 52 step tests on the simulated FCC, checked on 7 tests the model never saw. On a real plant a short pilot would measure your own gain.

**Why do O₂ and CO look so strange?** Those simulator values sit far outside a real heater's range. The page marks them **under review** rather than hiding them.

**Why does it say "new crude" when the feed is gas oil?** The question text still uses the older wording. The advice follows the feed's measured API, as the **For this feed** line shows.

**Could the cockpit change the preheat itself?** No. It only advises; nothing writes to a control system.

For terms, see the [glossary](/explainer/glossary); for how the response models work, see [the models guide](/explainer/models).
