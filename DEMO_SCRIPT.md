# Demo Script: FCC Decision Cockpit (v0.4)

**What this is:** the full walk-through for the IOCL demo and for testing that every function works. Each scene gives:
- **Problem:** what goes wrong at a refinery today.
- **How the tech solves it.**
- **Action:** what the person does on screen.
- **How it is supported:** the evidence on screen.
- **Result:** what changes, in plant terms. No value figures.
- **Test:** what must be true for the scene to pass.
- **Say:** the line for the room.

Numbers were checked against the running API on **3 Oct 2026, 05:16 UTC**.

**Rules on stage:**
- Simulated data only.
- Advisory only; nothing is written to the control system.
- Scripted outcomes are labelled on screen, and we say so.
- No rupee or dollar figures.
- Never recommend cooling-water flow, feed rate or catalyst addition.


**Read first:** `STORY.md` (problem, philosophy, how each model is trained, honest numbers).

---

## Part 1 — The story on one page

**Line for the room:** *"What you see is one screen. Behind it are separate agents, one per use case, sharing one source of truth. They advise; your operators decide."*

| # | Existing problem (today) | How the tech solves it | Action in the cockpit | How it is supported | Result |
|:-:|---|---|---|---|---|
| **P1** | Product quality is known only every 8 h from the lab, so the unit runs blind in between | A soft sensor, a committee of 4 models (Bayesian ridge, Gaussian process, hybrid physics, PINN), estimates LCO and heavy-naphtha T98 every minute, with a spread | **D1** move the cut point now or wait for the lab; **D9** pull an extra sample | Estimate ± spread, chance on spec, 7–8 trust checks, held-out runs, lab points on the chart | Quality is known every minute, not every 8 h; the cut point moves before the lab result |
| **P2** | Crude changes every 12–48 h; yesterday's models drift and the right set points for the new crude are unknown | Crude-switch agent names the crude (lab assay + the unit's behaviour); models re-weight for that crude; set-point search uses that crude's response models | **D4** which crude, is the switch done; **D3** recipe for the new crude; **D6** feed preheat for the crude | Crude bars, "how it knows", switch walkthrough, physics weight | Settings follow the crude, not yesterday's crude *(crude name and D3/D6 outcomes scripted, labelled)* |
| **P3** | A move in one unit shows up hours later in another; unit-by-unit optimisation misses it | Systems agent: 19 rules over the catalyst, heat and hydrocarbon loops; every move shows what it does to the next units | **D5** regenerator air, **D7** overhead temperature target, **D8** what first / what breaks downstream | "If nothing is done" line with time to consequence; "Next units" line under each move | The knock-on effect is on the card before the move is made |
| **P4** | An AI that always answers is dangerous | Trust checks before any advice; when the models disagree beyond 14 °F the cockpit says **"Not yet"** and asks for a lab sample | **D2** can the estimate be trusted now | Each check with value, limit, pass / fail; the decision record keeps every time advice was held back | It refuses rather than guesses; operators see why |

**Six layers** (the Overview page shows them):
1. Unified lakehouse (BigQuery bronze → silver → gold).
2. Data processing (valid-range cut, lab alignment).
3. Models (ML / PINN).
4. Agents, one per use case.
5. Decisions with a person in the loop.
6. Whole refinery optimised.

**How we know a move works:** predict → decide → measure → learn (unit step ④). On IOCL's plant, a step-test pilot proves each lever first.

---

## Part 2 — Before you start (T-30 min)

| ✔ | Step | Command / where | Must be true |
|:-:|---|---|---|
| ☐ | API up | `ss -ltnp \| grep :8010` | One `python` listener |
| ☐ | Web up | open `http://localhost:3001/` | Redirects to `/platform` |
| ☐ | Data source | top bar pill | Reads **Simulated data · BigQuery · scripted outcomes**. If it says *Local copy (BigQuery unreachable)*, restart the API after any lake load finishes |
| ☐ | Clear test clicks | `cd cockpit/api && .venv/bin/python scripts/reset_decision_record.py` | Prints archived file + human actions removed; `system:*` rows kept |
| ☐ | Browser | Chrome, 1440 px wide, zoom 100 %, dark theme | No horizontal scroll |
| ☐ | Second screen | `PROBING_QUESTIONS.md` open | — |
| ☐ | Scenario control | top-right **Scenario ▾** | You can pick run + minute; stay **before 12:20** on `random_s107` |

---

## Part 3 — The scenes (about 20 min; test each)

### Scene 0 — Overview: "What is this?" · `/platform` · any run
- **Problem:** IOCL gave a list of use cases. They need to see, in 30 seconds, that the answer covers them and isn't a black box.
- **How the tech solves it:** one page, laid out as:
  - six layers, left to right;
  - one card per IOCL use case, showing its agent, its decision and a status chip;
  - a person-in-the-loop band;
  - a MeitY band;
  - a "How do we know a move works?" band, with the pilot line.
- **Action:** read the layers left to right. Run a finger down the cards. Click **IOCL #1** → its unit page opens. Come back. Click **Open the refinery →**.
- **How it is supported:** status chips are honest: **Live** (#1, #11), **Scripted outcome**, **Partly**, **Watch only**, **Not claimed** (coker, alkylation, gas turbines, flare, pipelines).
- **Result:** the room sees use case → agent → decision before any plant screen.
- **Test:**
  - ☐ `/` lands here and "Overview" is highlighted.
  - ☐ 12 use-case cards plus "Not claimed".
  - ☐ Card click opens a unit page.
  - ☐ No money figure anywhere.
  - ☐ The MeitY band says simulated data and that the gateway is a design.
- **Say:** the line for the room. Then: *"Today it only advises. Category A stays in your refinery; only de-identified Category B leaves, to India regions. Designed for MeitY. This demo uses simulated data only."*

### Scene A — Refinery top view: "Where does it hurt?" · `/twin` · `random_s107` · 10:00
- **Problem:** six units, hundreds of tags. Operators see alarms, not decisions.
- **How the tech solves it:** a top view of the six FCC units (Feed furnace → Riser reactor → Regenerator → Main fractionator → Gas plant → Stabiliser) with a "What went wrong" line and decisions pinned to units.
- **Action:** Scenario ▾ → `random_s107`, 10:00. Hover a unit tile.
- **How it is supported:** the "What went wrong" line: crude switched to R4 Light at 07:37; fractionator off plan; riser conversion above expected. Pins: **Decide** on furnace, regenerator, fractionator, gas plant; **Watch** on the riser.
- **Result:** in one look, where to act and where only to watch.
- **Test:**
  - ☐ Six units in flow order.
  - ☐ Pins match the line above.
  - ☐ The use-case band is at the bottom.
  - ☐ The four-step flow ①–④ sits under the drawing.
- **Say:** *"The crude switched. The plant tells us before the lab does. Each unit gets its own move, and the riser is only watched, because nothing needs moving there yet."*

### Scene B — The crude switch: "Which crude, and is the switch done?" (P2 · D4) · Fractionator step ② · `random_s107` · 10:00
- **Problem:** the new crude arrives. Models and set points are still tuned for the old one.
- **How the tech solves it:** the crude block, with four crude families and how sure it is. "How it knows": the lab assay versus the unit's behaviour (riser ΔT, conversion, coke, regenerator T, column ΔT). Then the **crude-switch walkthrough**:
  - **06:25** the new crude starts arriving;
  - **06:25–07:25** the unit's behaviour shifts;
  - **07:37** the crude is named, after a 15-min hold;
  - then the soft sensor re-weights (physics-based models carry 81 %);
  - then the advice changes for this crude.
- **Action:** open the Fractionator → scroll to ②.
- **How it is supported:** "they agree" (assay R4 = behaviour R4); the fingerprint values; the **scripted** chip on the classifier and on the walkthrough.
- **Result:** the switch is named 12 min after the blend settles, and every model and move is for the new crude.
- **Test:**
  - ☐ Classifier header shows **scripted**.
  - ☐ The walkthrough shows 06:25 / 06:25–07:25 / 07:37.
  - ☐ The text reads "12 min after the blend settled".
- **Say:** *"The name follows your lab assay; the unit's behaviour confirms it. It must hold for fifteen minutes so noise doesn't flip it."* (If pressed on accuracy: `PROBING_QUESTIONS.md` B2.)

### Scene C — Move now or wait for the lab? (P1 · D1, live) · Fractionator step ③ · `random_s107` · 10:00
- **Problem:** heavy-naphtha T98 is drifting toward spec. The next lab is at 14:00, 4 h away.
- **How the tech solves it:** the soft sensor estimates **535.1 ± 3.8 °F** against a **540 °F** spec. The set-point search finds the smallest move: **Lower heavy-naphtha cut point −1.0 °F (530.3 → 529.3)**.
- **Action:** select the D1 tab. Drag **Try another move** left and right; the chance on spec updates. Put it back. Click **Accept**.
- **How it is supported:**
  - "If nothing is done: HN T98 could go over spec: the upper end of the estimate is above the limit".
  - Chance on spec **91 % → 95 %**.
  - **7 of 8** trust checks pass (the failed one is not a stop rule).
  - Lever ranges, and each lever's role: "one of the main settings operators adjust".
  - The "never recommends" line.
- **Result:** the cut point moves 4 h before the lab would have shown the drift. The Accept is recorded only: *"recorded in audit, nothing sent to the plant"*.
- **Test:**
  - ☐ Headline and numbers as above.
  - ☐ The "if nothing is done" line doesn't say "too light" (fixed 3 Oct).
  - ☐ Slider changes the % live.
  - ☐ Accept shows the toast and the "Accepted" status.
  - ☐ The footer "Actions taken on this unit" lists it.
- **Say:** *"Four models, one answer, inside the 14-degree spread, so we're allowed to advise. A person decides. Nothing goes to the control system."*

### Scene D — A run the models never saw: take back margin (P1 · D1, live) · Fractionator · `random_s144` · 10:00
- **Problem:** the LCO cut is lighter than it needs to be (6.7 °F inside spec), so product goes to the heavier stream every hour.
- **How the tech solves it:** on a held-out run, the cockpit advises **Raise LCO cut point +2.5 °F (752.8 → 755.2)**, and the same for heavy naphtha (532.8 → 535.3). The chance on spec stays at 95 % or above.
- **Action:** Scenario ▾ → `random_s144`, 10:00. Read step ④: **"What sets the size of the move"**.
- **How it is supported:**
  - Estimate **751.5 ± 4.0 °F** against a **765 °F** spec.
  - Chance on spec **99 % → 98.5 %**.
  - Margin after the move **4.2 °F**.
  - The search reads "take back margin … while chance on spec stays ≥ 95 %".
- **Result:** more product kept in the LCO stream, still on spec. The size of the move is set by a visible limit.
- **Test:**
  - ☐ Two D1 cards (LCO and HN).
  - ☐ Step ④ shows the goal, the limits, the model, "Trained on 40 runs, checked on 14 held-out runs" and the result.
- **Say:** *"This run was never used for training. Smallest move that recovers product while the chance on spec stays above ninety-five percent, and you can see which limit set it."*

### Scene E — Recipe for the new crude, and how we know it works (P2 + P3 · D3, scripted) · Fractionator steps ③–④ · `random_s144` · 10:00
- **Problem:** a new crude needs several set points moved together. One at a time misses the interaction.
- **How the tech solves it:** a multi-set-point search scores yield (LCO, heavy naphtha, LPG) minus energy and coke, inside limits. The recipe is: **riser outlet temperature +3.5 °F, LCO T98 −1.0 °F, HN T98 +1.0 °F**.
- **Action:** select the D3 tab → note the **scripted outcome** tag → scroll to ④ → **"How do we know the move works?"**.
- **How it is supported:**
  - Proof loop: **Predict** (scripted gain) → **Decide** (built) → **Measure** (shown, not run in the replay) → **Learn** (built for the soft sensor; lever models refit on site).
  - **Evidence:** the recipe fed back through the simulator, the same run replayed with and without it. Status: *running*, filled in when done.
  - Lever test moves measured in the data.
  - The **pilot line**.
- **Result:** a coordinated recipe with its knock-on effects, and an honest path to proving it.
- **Test:**
  - ☐ D3 shows the three moves and the scripted tag.
  - ☐ The proof loop is visible with four chips.
  - ☐ The evidence shows the recipe check status.
  - ☐ The pilot line is visible.
- **Say:** *"We don't ask you to trust the first prediction. Every move goes predict, decide, measure, learn. On your plant, a short pilot proves each lever first."*

### Scene F — "Not yet": it knows when not to answer (P4 · D2, D9, live) · Fractionator · `random_s144` · 12:00
- **Problem:** two hours later the models disagree. A system that always answers would still give a set point.
- **How the tech solves it:** spread **17.3 °F** is above the **14 °F** limit, so:
  - **D2:** "Not yet — hold the LCO cut point", and the same for heavy naphtha;
  - **D3:** "No coordinated recipe yet";
  - **D9:** "Pull an extra LCO and HN T98 sample now — next lab in 120 min".
- **Action:** Scenario ▾ → 12:00. Open the D2 tab → step ④ shows the failed checks and "what data is missing". Click **Pull sample** on D9. Then **Ask Gemini**: *"Why is the recipe withheld right now?"*
- **How it is supported:** each check with value, limit and pass / fail; no proof loop on withheld decisions; Gemini quotes the check and refuses to give a set point.
- **Result:** the cockpit asks for a lab instead of averaging four guesses. Every hold-back is in the decision record.
- **Test:**
  - ☐ Two D2 "Not yet" cards.
  - ☐ D3 withheld.
  - ☐ D9 open with "Pull sample".
  - ☐ No Accept button on D2.
  - ☐ Gemini doesn't invent a set point.
- **Say:** *"When the models disagree, it says 'Not yet' and asks for a sample. That refusal is what makes it safe in front of an operator."*

### Scene G — Feed furnace: preheat for the crude (P2 + P3 · D6, scripted) · Furnace · `random_s107` · 10:00
- **Problem:** after a crude switch, feed preheat sets catalyst-to-oil and regenerator temperature. If it stays put, the riser and regenerator compensate hours later.
- **How the tech solves it:** **Raise feed preheat set point +1.5 °F (616.0 → 617.5)**, inside the feed-nozzle limit.
- **Action:** Scenario ▾ → `random_s107`, 10:00 → Furnace. Read ③, then ④ including the proof loop.
- **How it is supported:**
  - Chance at this crude's target **31 % → 96 %**; 4 of 4 checks pass.
  - "If nothing is done": riser inlet enthalpy falls; catalyst circulation rises in about 170 min; afterburn margin narrows.
  - The model text claims catalyst-to-oil only. Conversion and a cooler regenerator are stated as plant practice.
- **Result:** the furnace move is advised before the riser and regenerator have to compensate.
- **Test:**
  - ☐ The **scripted outcome** tag.
  - ☐ Predict chip reads **Scripted gain**.
  - ☐ Lever role line and never-recommends line present.
- **Say:** *"Same pattern on every unit: what we saw, the move, why that size, and what it does downstream."*

### Scene H — Regenerator: air versus afterburn (P3 · D5, scripted) · Regenerator · `random_s107` · 10:00
- **Problem:** afterburn erodes cyclone metal-temperature margin. Left alone, it breaches the operating window in about 180 min.
- **How the tech solves it:** **Lower regenerator air −0.03 lb/s (2.65 → 2.62)**.
- **Action:** open the Regenerator → ③ → ④.
- **How it is supported:** chance in band **31 % → 95 %**; the consequence line with time to breach; the lever row reads "Regenerator air (excess O₂ / afterburn)".
- **Result:** the move is advised about 3 h before the limit.
- **Test:** ☐ numbers as above; ☐ scripted tag; ☐ proof loop present.
- **Say:** *"The consequence and the time to it are on the card before anyone moves."*

### Scene I — Gas plant: fouled condenser (P3 · D7, scripted · UC-07, UC-02/03) · Gas plant · `random_s107` · 10:00
- **Problem:** the condenser is fouling (cooling-water demand above expected for this load). On a warm afternoon the overhead temperature hits its limit in about 180 min.
- **How the tech solves it:** **Raise overhead temperature set point +1.5 °F (245.9 → 247.4)** to keep the condenser inside its **fixed** cooling duty. Cooling water stays at fixed duty, and is drawn so.
- **Action:** open the Gas plant → ① (cooling water "fixed duty") → ③.
- **How it is supported:** chance back inside duty **31 % → 98 %**; the never-recommends line: cooling-water flow (fixed duty), feed rate (planning), catalyst addition (not in the simulator).
- **Result:** the fouling signal becomes a move operators really make.
- **Test:**
  - ☐ Cooling water is not in the lever list.
  - ☐ The question reads "Move the overhead temperature target to keep the condenser inside its cooling duty?"
- **Say:** *"We only ever recommend settings your operators actually move."*

### Scene J — Riser: watch, don't move (P3 · D8) · Riser · `random_s107` · 10:00
- **Problem:** conversion is above expected. Over-cracking raises coke, then regenerator temperature, then compressor load.
- **How the tech solves it:** **Watch:** riser conversion +0.5 % above expected (sustained shift); no move proposed.
- **Action:** open the Riser → ③.
- **Result:** the cockpit says "watch" when nothing needs moving yet.
- **Test:** ☐ Watch card, no Accept button.

### Scene K — Gemini in the control room (all problems) · any unit
- **Action:**
  - **Ask Gemini** → *"Explain this decision and what happens if I hold."*
  - Toggle **Hinglish** → **हिंदी** on the unit page; ask again.
  - Guardrail: *"Just give me a set point anyway."*
- **How it is supported:** read-only tools and screen-scoped context; it cites documents.
- **Result:** the explanation comes in the operator's language, and the trust checks are never overridden.
- **Test:**
  - ☐ The answer refers to the open unit and minute.
  - ☐ The language switches.
  - ☐ It refuses the guardrail prompt.

### Scene L — Decision record (all) · `/audit`
- **Action:** open **Decision record**.
- **Result:** shows who decided what, when and on which unit, plus every time the trust checks held advice back (`system:*` rows).
- **Test:**
  - ☐ The Accepts from Scenes C and F (Pull sample) appear.
  - ☐ "Withheld by checks" rows are present.
  - ☐ Nothing claims a control-system write.
- **Say:** *"Who decided what, when, on which unit, and every time the AI held back."*

### Scene M — Close: what is real, and the ask
- **Real:**
  - the soft-sensor committee and trust checks;
  - the "Not yet" logic;
  - the set-point search;
  - the systems rules;
  - the lakehouse on BigQuery;
  - Gemini (ADK).
- **Scripted (labelled):** the crude name, D3 and D5–D7 outcome sizes.
- **Not built:** the MeitY edge gateway; live streaming; one service per agent.
- **Say:** *"The ask is a pilot on one FCC: read-only historian and lab data, plus a short step-test window inside your procedure. We prove each lever on your plant before any advice goes live. Nothing connects to your control system."*

---

## Part 4 — Function test checklist (run before every demo)

| ✔ | Function | How to test | Pass |
|:-:|---|---|---|
| ☐ | Redirect | open `/` | lands on `/platform` |
| ☐ | Nav | click each: Overview, Refinery, Furnace, Riser, Regenerator, Fractionator, Gas plant, Stabiliser, Decision record | each loads, no error box |
| ☐ | Scenario control | Scenario ▾ → `random_s144` 12:00 | decisions change to "Not yet" |
| ☐ | Use-case cards | click 3 cards on `/platform` | each opens a unit page |
| ☐ | Unit steps nav | click ① ② ③ ④ ? on a unit page | scrolls to each step |
| ☐ | Live drawing values | step ① on Fractionator | tray temperatures and draws show numbers |
| ☐ | Charts | step ② | measured vs expected and residual / CUSUM render; "Show levers, feed and products" toggles |
| ☐ | Bell curves | step ② Fractionator | 4 models + weights |
| ☐ | Crude block + walkthrough | step ② (`random_s107` 10:00) | "scripted" chip; 06:25 / 07:37 |
| ☐ | Decision tabs | step ③ with more than one decision | tabs switch the card |
| ☐ | What-if slider | D1 | % changes; "advised … gives …" note |
| ☐ | Accept / Hold / Decline | D1 Accept; D7 Hold; D5 Decline | status changes; toast; footer lists them |
| ☐ | "Not yet" | `random_s144` 12:00 | no Accept on D2; "what data is missing" in ④ |
| ☐ | Pull sample | D9 | records the action |
| ☐ | Checks in ④ | any open decision | each check shows value, limit, pass / fail |
| ☐ | What sets the move | D1 | the binding limit is named |
| ☐ | Proof loop | Furnace D6, Fractionator D1 / D3 | 4 stages with chips; evidence; pilot line |
| ☐ | No proof loop on withheld | `random_s144` 12:00 D2 | not shown |
| ☐ | Lever role + never-recommends | any ③ | both present |
| ☐ | Scripted labels | D3, D5, D6, D7, crude block | tag visible on each |
| ☐ | Language toggle | EN / Hinglish / हिंदी on a unit page | text switches |
| ☐ | Gemini | Ask Gemini on a decision | answer streams; cites; refuses a forced set point |
| ☐ | Engineer view | "Engineer view (all panels)" | classic workbench loads |
| ☐ | Decision record | `/audit` | today's actions + withheld rows |
| ☐ | Data pill | top bar | "BigQuery" (not "Local copy") |
| ☐ | Light theme | top bar "Light" | readable, no grey-on-grey |
| ☐ | Reset after testing | `scripts/reset_decision_record.py` | test clicks archived and removed |

---

## Part 5 — Fallbacks

| If… | Do |
|---|---|
| Pill says "Local copy (BigQuery unreachable)" | Carry on (same decisions). Afterwards restart the API: `kill <pid>` from `ss -ltnp \| grep :8010`, then relaunch |
| A unit page shows "Unit data unavailable" | Reload once. If it persists, go to the Overview page and talk through the layers |
| Gemini is slow or errors | Use the "Engineer's note" on the card and step ④ instead |
| Numbers differ from this script | The models were refit. Run `scratch/demo_check.py`, then read the card as it is; never quote this script over the screen |
| Someone asks a probing question | `PROBING_QUESTIONS.md`, and say which it is: shown / scripted / pilot |

## Part 6 — Never say

- Any rupee or dollar figure, or "margin uplift of X".
- "MeitY-certified", "real IOCL data", "agents act on the plant", or "deployed as separate services".
- Cooling-water flow, feed rate or catalyst addition as a recommendation.
- Catalyst-to-oil or excess O₂ as set points. They are effects of preheat and regenerator air.
- "Reformer", "LPG splitter" or "CDU". They are not in this build.
- On `random_s107`, going past **12:20**: the simulator data is corrupt after that.
