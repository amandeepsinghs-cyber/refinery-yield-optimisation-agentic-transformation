# How to read: Gas plant

> **In one line:** The gas plant cools the hot vapour from the top of the main column back into liquid and gas, and this page tells you whether the condenser is struggling and, if it is, how far to raise the overhead temperature target so it can keep up without more cooling water.

## 1. What this unit is and why it matters

After the [main fractionator](/twin/unit/unit_4_fractionator) has sorted the cracked oil, the lightest part leaves its top as a hot vapour: future gasoline, LPG (cooking gas) and fuel gas, all still mixed. The **gas plant** turns that vapour into things that can be handled.

- **Analogy:** a bathroom mirror after a hot shower. Hot steam hits a cold surface and turns back into droplets. Here the cold surface is a **condenser**: a bundle of tubes with **cooling water** running through them.
- **What goes in:** **overhead vapour from fractionator**.
- **What happens:** the condenser cools the vapour; the liquid and the gas separate in a **reflux drum** (a horizontal tank).
- **What comes out:** three streams. **Wet gas → compressor**: the light gas, pushed on by the **wet-gas compressor**. **Reflux → fractionator**: part of the liquid goes back to the column top to keep the separation sharp. **Unstabilised naphtha → stabiliser**: the rest of the liquid, raw gasoline still carrying dissolved LPG.
- **Before and after:** fractionator before; [stabiliser](/twin/unit/unit_6_stabiliser) after. This is the **heat loop** end of the FCC.

The key idea is **fixed duty**. The condenser gets a fixed supply of cooling water; operators do not turn it up and down. If the tubes foul (get dirty, like limescale in a kettle), the condenser needs *more* water to do the same job. So cooling-water demand creeping above expected is the warning sign, and the fix is not more water but a small change to the **overhead temperature target**: the temperature the top of the column is held at. A slightly warmer target means less vapour has to be condensed.

For the layout every unit page shares, see [how a unit page works](/explainer/unit-page).

## 2. The key numbers on this page

| Number on screen | What it means | Normal | Worrying |
|---|---|---|---|
| **Condenser cooling-water flow** (header) | Cooling water the condenser is drawing, in lb/s. Stands in for how hard the condenser is working. | Close to **expected** for this load: 296.9 vs 298.6 lb/s at 10:00 (default run). | Staying several lb/s **above** expected: fouling. Staying **below**: the condenser is running cold. |
| **lever: overhead T set point** / **Overhead temperature target** | The column-top temperature target, °F. The lever. | 245.9 °F, inside the window 230–260 °F. | Near either end. |
| **Ambient** | Outside air temperature, °F. Warm afternoons make every condenser work harder. | About 80 °F. | Hot days. |
| **Reflux ratio** | Liquid sent back to the column per unit taken off (L/D). | 0.75. | Shown as a lever on the drawing, but never advised (see section 7). |
| **Wet-gas compressor Power** | How hard the compressor works. Simulator scale, **under review**. | Steady. | Rising: more gas to push. |

The page shows the overhead temperature **target** but not a separate measured overhead temperature, and it shows condenser load through cooling-water flow rather than a duty figure. Numbers change with scenario and clock.

## 3. The decision and the lever: D7 Overhead temperature target

- **The question on screen:** **Move the overhead temperature target to keep the condenser inside its cooling duty?**
- **The lever:** **Overhead temperature target**, °F.
- **How the move is sized:** the condenser **response model** says *each 1 °F on the overhead temperature target takes 2.6 lb/s off the condenser's cooling-water demand*. The rule is **move = excess demand ÷ 2.6**, rounded to 0.5 °F, capped at 3 °F per step. The SOP (**SOP-GAS-006**) adds: watch receiver pressure and the gasoline end point; **cooling water stays at its fixed duty**.
- **It only advises in one direction.** The trigger is demand *above* expected (fouling). If the condenser is using *less* water than expected, it is running cold, and the cockpit will not tell it to run colder still. It watches instead.
- **"Not yet":** a drift is seen but no move is proposed, with the reason on screen.
- **Never advised:** cooling-water flow itself, feed rate, catalyst settings.

Two real examples:

| Run at 10:00 | What the page shows |
|---|---|
| random_s144 (default) | **Not yet**. **Watch condenser cooling-water flow -3.1 lb/s below expected (sustained shift) — no move proposed yet**. **If nothing is done: Condenser running cold: reflux sub-cooled, stabiliser overhead and LPG split shift within ~180 min.** |
| random_s107 | **Decide**. **Raise overhead temperature set point +1.5 °F (245.9 → 247.4)**. Demand ran 3.9 lb/s *above* expected since 05:16. 3.9 ÷ 2.6 = 1.5 °F. **Chance the condenser is back inside its fixed cooling duty 31 % now, 98 % after the move.** |

## 4. What you see on this page, top to bottom

1. **Header.** **Gas plant**, **Condenser cooling-water flow 296.9 lb/s −1.7 vs expected 298.6**, clock **10:00**, and *Cools and condenses the fractionator overhead; the wet-gas compressor then recovers the light gases. · Operators move: Overhead temperature target.*
2. **Step 1 — Data in and out.** The drawing, left to right: **Overhead vapour from fractionator** into a round condenser marked **Cooling water (fixed duty) 297 lb/s** and **Ambient 80 °F**; down to the **reflux drum**; up and right to the **Wet-gas compressor** with **Power 207 · under review**; along the bottom, **Reflux → fractionator** with **Reflux ratio 0.75**, and **Unstabilised naphtha → stabiliser** with, in blue, **lever: overhead T set point 245.9 °F**. Side panel: 6 tags, **Lab: none on this unit**, **Levers on this unit** (Overhead temperature target 245.9 °F; Reflux ratio 0.75 L/D), **What comes in** (Ambient T, Feed rate).
3. **Step 2 — What we observe.** **Condenser cooling-water flow now 296.9 lb/s** (plan 298.6), **Away from expected −1.7 lb/s** (1.1 σ: just above normal wobble), **Sustained drift (CUSUM) −2.1**, **Likely driver —**, **Feed API 23.2**. Then the feed panel, the cooling-water chart and the bell curve.
4. **Step 3 — Decision and lever.** On s144: question, the **Watch …** headline, **For this feed**, **If nothing is done**, and **Not advised yet, on purpose:** with a reason. Right side: **Levers here**, Overhead temperature target 245.9 °F (230.0–260.0), and **No move proposed until the model can be trusted here — see step 4.** On s107 you get the move, **Accept / Hold 30 min / Decline**, and **Try another move** from 242.5 to 249.0 °F.
5. **Step 4 — How the move is found.** On s144: **Anomaly detection** (flagged at 09:09), **Consequence check**, **Set-point search — Not run**, and **What is missing before this becomes advice**. On s107: the response-model chain and **Checks before advising — 2 of 2 pass** (**spread W90 5.13 ≤ 8.21 lb/s**, **lever stays inside its window 1.50 ≤ 3.00 °F**).
6. **Footer.** **This shift on the unit**: **Cooling water outside its normal band** at 07:29, **Crude switch detected (R3→R2)** at 08:19, **Cooling water drifting (sustained)** at 09:09.

## 5. What to click

- On s107, drag **Try another move** toward 249: the curve moves further inside the band.
- **Engineer's note** and **Ask Gemini** explain the fouling logic in plain words.
- Visit the [stabiliser](/twin/unit/unit_6_stabiliser) page: it shares the same lever.

## 6. What to say in the demo

- "The gas plant is the cold mirror: it turns the hot vapour from the column back into liquid and gas."
- "Cooling water is fixed. When a condenser fouls it quietly needs more water. That creep is what the cockpit watches."
- "On the default run the condenser is running *cold*, so the cockpit refuses to push it colder and simply watches."
- "On another run demand is 3.9 lb/s high; the response model says +1.5 °F on the overhead target fixes it, inside one SOP step."

## 7. Questions people ask

**Why not just add cooling water?** In practice the condenser runs at fixed duty. The cockpit never advises cooling-water flow.

**Why "Not yet" on the default run, and why does it mention missing training data?** The real trigger is the direction: demand is *below* expected, and the rule only acts on demand above. The on-screen reason ("the training data has no designed moves of these set points") is a second, general reason from the set-point search. Both lead to the same answer: watch, do not move.

**Reflux ratio is drawn as a lever. Does the cockpit move it?** No. Only the overhead temperature target is ever advised.

**Is 2.6 lb/s per °F a plant number?** It is the condenser response model. The page says openly that the simulator has no direct basis for it, so a short pilot on your plant would measure your own figure.

**Does it write to the plant?** No. Advisory only.

See also the [glossary](/explainer/glossary) and [the models guide](/explainer/models).
