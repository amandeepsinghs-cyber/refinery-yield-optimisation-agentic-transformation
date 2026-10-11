# How to read: Stabiliser

> **In one line:** The stabiliser is the last split in the FCC, separating LPG from gasoline, and this page shows whether that split is on target; on the default run it is quiet, so the honest message is "nothing to do".

## 1. What this unit is and why it matters

The liquid that leaves the [gas plant](/twin/unit/unit_5_condenser) is **unstabilised naphtha**: raw gasoline with LPG (cooking gas) still dissolved in it, like fizzy drink with the gas still in. Left like that it would bubble and lose vapour in storage. The **stabiliser** removes the dissolved gas.

- **Analogy:** opening a bottle of fizzy drink slowly and letting the gas escape, so what is left is "flat" and stable. Here the gas is captured and sold as LPG, and the "flat drink" is gasoline.
- **What it is physically:** a tall column with trays inside (the drawing shows 14). Liquid flows down, vapour rises, and the light molecules collect at the top.
- **What goes in:** **unstabilised naphtha** from the gas plant.
- **What comes out:** **LPG** off the top, and **stabilised light naphtha** (gasoline blending stock) off the bottom.
- **Before and after:** gas plant before; product tanks after. It is the last unit in the FCC chain.

A few words you will see:

- **C3, C4, C5** mean molecules with 3, 4 or 5 carbon atoms. C3 (propane) and C4 (butane) are LPG. C5 (pentane) belongs in gasoline.
- **C5 recovery** is the share of C5 that stays in the gasoline instead of escaping into the LPG. High is good for gasoline; but push too hard and the LPG "dries out".

The stabiliser has no lever of its own in this cockpit. It shares the **overhead temperature target** with the gas plant: one setting, two units affected. For the layout every unit page shares, see [how a unit page works](/explainer/unit-page).

## 2. The key numbers on this page

| Number on screen | What it means | Normal | Worrying |
|---|---|---|---|
| **Stabiliser C5 recovery** (header) | C5 kept in the gasoline, in %, compared with **expected** for this feed. | Close to expected: 19.81 % vs 19.89 % at 10:00 (default run). | A steady fall below expected (C5 slipping into LPG) or rise above (LPG drying out). |
| **LPG** | LPG made, lb/min. | 3071 lb/min. | A sudden change without a feed change. |
| **Stabilised light naphtha** | Gasoline stock made, lb/min. | 3889 lb/min. | Falling while LPG rises. |
| **C3 recovery**, **C4 recovery** | The same idea for propane and butane. | 17.7 % and 25.8 %. | (Marked **under review**.) |
| **lever: overhead T set point** | The shared temperature target, °F. | 245.9 °F. | Moves made for the gas plant show up here too. |
| **lever: reflux ratio** | Liquid sent back down the column. | 0.75. | Drawn as a lever, never advised. |

All three recovery figures carry an **under review** tag. A real stabiliser recovers well over 90 % of C5; the simulator's 19.8 % reads like a different measure carrying the same label. So read the *gap to expected*, not the absolute number. Numbers change with scenario and clock.

## 3. The decision and the lever: D7 (shared with the gas plant)

- **Lever:** **Overhead temperature target** (°F), the same set point the gas plant uses.
- **When a decision appears here:** only if C5 recovery itself drifts. The question would then read **Adjust the stabiliser overhead temperature for C5 recovery?** If C5 slips into LPG the consequence line says to adjust reflux or overhead temperature; if C5 recovery runs high it warns that the LPG stream is drying out.
- **How a move would be sized:** like every D7 move, by the **response model** and the rule *move = drift ÷ gain*, rounded to 0.5 °F and capped at the 3 °F SOP step. See the [gas plant guide](/explainer/gas-plant) for a worked example.
- **"Not yet" / "Watch"** would mean a drift is seen but no move is proposed, with the reason on screen.
- **Never advised:** cooling-water flow, reflux ratio, feed rate.

On both demo runs at 10:00 (random_s144 and random_s107) C5 recovery sits on expected, so step 3 reads **No decision on this unit right now. The agents keep watching; anything new appears here and on the refinery page.** That is the correct, honest state, not a missing feature. Any overhead-temperature advice for the moment sits on the gas plant page.

## 4. What you see on this page, top to bottom

1. **Header.** **Stabiliser**, **Stabiliser C5 recovery 19.81 % under review −0.1 vs expected 19.89**, clock **10:00 · next lab 14:00**, and *Splits LPG from light naphtha (gasoline). · Operators move: Overhead temperature target (shared with the gas plant).*
2. **Step 1 — Data in and out.** The drawing: a tray column. **Unstabilised naphtha** enters from the left (the small line under it shows the FCC feed rate and API for context). **LPG 3071 lb/min** leaves the top, with **C3 recovery** and **C4 recovery** and two blue lever labels: **lever: overhead T set point 245.9 °F** and **lever: reflux ratio 0.75**. **Stabilised light naphtha 3889 lb/min** leaves the bottom with **C5 recovery 19.8 %**. Side panel: **Sensors 9 tags**, **Lab: none on this unit**, **Response model** gives the expected value every minute, **Levers on this unit** (Overhead temperature target 245.9 °F) and **What comes in** (Feed API, Feed rate).
3. **Step 2 — What we observe.** **Stabiliser C5 recovery now 19.81 %** (plan 19.89), **Away from expected −0.1 %** (0.4 σ: σ is the normal wobble, so this is plain noise), **Sustained drift (CUSUM) 0.0** (no lasting drift), **Likely driver —**, **Feed API 23.2**. Then the feed panel, the C5 recovery chart (measured vs expected, with its band), the residual chart and the bell curve **What the response model expects now**.
4. **Step 3 — Decision and lever.** The single line **No decision on this unit right now …**.
5. **Step 4 — How the move is found.** **Checks before advising: No checks needed for this item.** and **The search: Nothing to optimise on this unit right now.**
6. **What this screen solves.** Two use cases (**#2 · #3**): stabiliser overhead optimisation for C5 recovery and the LPG / naphtha C4/C5 split. Click **Open** to read the problem each one solves.
7. **Footer.** **This shift on the unit** lists only **Crude switch detected (R3→R2)** at 08:19. **Actions taken on this unit: No actions recorded on this unit yet.**

## 5. What to click

- **Show levers, feed and products over the shift** under the charts: see LPG and gasoline make through the feed change.
- Hover the **under review** tags to read why the recovery figures are flagged.
- Jump to the [gas plant](/twin/unit/unit_5_condenser) page to see the shared lever in action.

## 6. What to say in the demo

- "The stabiliser takes the fizz out of the gasoline: LPG off the top, stable gasoline off the bottom."
- "It shares one setting with the gas plant, the overhead temperature target, so a move there is checked against both."
- "Today the split is right on expected, so the page simply says there is nothing to do. A cockpit that stays quiet when things are fine is a feature."
- "The recovery figures are flagged under review; we read the gap to expected, not the raw number."

## 7. Questions people ask

**Why is there no decision?** C5 recovery is on expected on both demo runs. A decision appears only when it drifts.

**19.8 % recovery sounds terrible. Is the unit broken?** No. That simulator figure is not on the same scale as a plant's recovery, which is why it is marked **under review**. The page judges the unit by its gap to expected, which is tiny.

**Can the stabiliser and gas plant get conflicting advice?** They share one lever and one decision type, so the cockpit gives one piece of advice per set point.

**Why is reflux ratio drawn as a lever if it is never advised?** It is a real operator setting and is shown for context; the cockpit only advises the overhead temperature target.

**Does anything here change the plant?** No. Advisory only.

See also the [glossary](/explainer/glossary) and [the models guide](/explainer/models).
