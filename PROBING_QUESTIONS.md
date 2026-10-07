# Probing Questions — Honest Answers for the IOCL Room

**Purpose:** the questions IOCL is likely to ask, each with a short answer to say out loud, what the demo shows today, and what only a pilot on their plant can prove. Owner ask, 3 Oct 2026 04:24: *"they will ask probing questions. Is our system answering those questions?"*

**Rule for every answer:** say which of three it is.
- **Shown** — runs on real models over simulated data.
- **Scripted** — real inputs, scripted outcome, labelled on screen.
- **Pilot** — only provable on IOCL's plant.

No value figures. No claim about IOCL's plant.


**Read first:** `STORY.md` (the story and philosophy these answers come from).

---

## A. "Will this setting actually maximise the yield?" (the big one)

| # | Question | Say this | Status |
|:-:|---|---|---|
| A1 | How do you know a move will increase yield? | "Every move goes round one loop: **predict, decide, measure, learn**. The model predicts the effect and how sure it is. A person decides. The next lab sample or the unit's instruments measure what happened. The result re-anchors the model. We don't ask you to trust the first prediction; we show you the measurement." | Predict and decide: **Shown**. Measure and learn: **Shown** for the soft sensor (each lab re-anchors it); lever models refit from accepted moves: **Pilot** |
| A2 | Have you tested a prediction? | "Yes, in the simulator. We took the recipe the cockpit proposed and replayed the same run twice, once with the recipe and once without, so the difference is the recipe alone." Result: \"Conversion came in at +0.44 % after an hour against +0.42 % predicted, inside the band. The cut-point part we could not prove: the trims were 1 °F, smaller than what the estimate can resolve, and once the cut-point controllers trimmed the LCO cut back, the conversion gain settled at about a quarter of the prediction. So that piece of the recipe stays labelled scripted until a pilot measures it. That is what measuring is for.\" | **Shown** (simulator) |
| A3 | How is the "ideal" temperature found? | "A search tries many combinations of the settings operators really move. It scores each one: more LCO, heavy naphtha and LPG, less energy and coke, inside the equipment and procedure limits. It keeps the best one that the trust checks allow." | Method: **Shown**. Feed-preheat gain: **Measured** in simulator step tests (chance band scripted). Riser-temperature gain: **Scripted** (labelled) |
| A4 | Why are some outcomes scripted? | "The simulator data has few clean test moves of those settings. Rather than show a number the data can't back, we label it scripted. On your plant, a short step-test pilot measures each gain." | Honest |
| A5 | What will you do on our plant to prove it? | "A pilot: small step tests of each lever inside your operating procedure, measured by your lab. Every gain the cockpit uses then comes from your own plant." | **Pilot** |
| A6 | We have years of data. Why not learn from it on day one? | "We do. Before the first live day we train on your 2–3 years of historian and lab data, test on months the models never saw, and find the best operating windows per crude family, the settings at which you were on spec with the least margin. What history can't give cleanly is every lever's effect: your advanced controller holds things steady, and some levers rarely move. A few small step tests confirm those, one lever at a time." (`STORY.md` §11.1) | **Pilot**, Phase 1 |
| A7 | When do we start benefiting? | "Around week 6, insight from your own history: margin given away per crude, best windows. Weeks 6–10, quality every minute in shadow mode. Weeks 10–16, the first advised cut-point moves recover margin while staying on spec. Months 4–6, faster crude switches. All measured in plant terms; you apply your prices." (`STORY.md` §11.6) | **Pilot** plan |

## B. Crude type

| # | Question | Say this | Status |
|:-:|---|---|---|
| B1 | How do you know the feed has changed, and what it is now? | "The FCC sees gas oil, not crude, so we watch the feed. A feed-quality model estimates the feed's API gravity every minute from the unit's response — coke per feed, riser temperature rise, fuel, regenerator temperature, conversion. When the estimate leaves its baseline we flag a feed change and hold advice; when it has been steady for 15 minutes the new feed has settled and advice resumes, sized for that feed." | Shown: held-out API error **0.2**; **15 of 15** held-out feed changes caught, **2** false alarms |
| B2 | Why classify crude at all when the FCC is fed VGO? | "We don't. Earlier versions named the crude; that is not what the FCC needs. The crude family is shown only as context. What drives the decisions is the feed's quality — how it will crack, how much coke it makes, how hot the regenerator runs." | Shown: crude family is a context line only |
| B3 | Which feed properties do you estimate? | "On the simulated data, API gravity — that is what the simulator models. On your plant we add Conradson carbon, K-factor, nitrogen and metals from your lab and assays, with a confidence band on each, and a novelty check that withholds advice when a feed is outside anything the models have seen." | Honest: API only in the demo |
| B4 | Why don't you advise catalyst flow or catalyst-to-oil? | "Because it isn't a lever. The slide valve moves catalyst automatically to hold the riser outlet temperature; catalyst-to-oil follows from the heat balance — riser temperature, preheat and regenerator air. We advise those and show catalyst-to-oil as a result on the riser and regenerator pages." | Shown: catalyst-to-oil as a result on U2; never advised |
| B3 | What happens on a crude you've never seen? | "A novelty check flags inputs outside the training range, the spread widens, and if it crosses the limit the cockpit says 'Not yet' and asks for a lab sample instead of advising a move." | **Shown** |

## C. Trust and safety

| # | Question | Say this | Status |
|:-:|---|---|---|
| C1 | What if the model is wrong? | "Three brakes. Seven trust checks run before any advice is shown. If the models disagree beyond a 14 °F spread, the advice becomes 'Not yet'. And a person decides every time. Nothing is written to the control system." | **Shown** (e.g. run s144 at 12:00 shows "Not yet") |
| C2 | Will the AI change our plant settings? | "No. It advises. A person accepts, holds or declines, and that is recorded. There is no write path to the DCS." | **Shown** |
| C3 | Why should operators trust it? | "It only recommends settings operators really move on that unit, and it says what it never recommends: cooling-water flow, feed rate, catalyst addition. Every card shows its evidence and its checks." | **Shown** |
| C4 | What about a bad lab result? | "Suspect lab results are screened before they touch the model, and the screen shows why a result was rejected." | **Shown** |

## D. Data

| # | Question | Say this | Status |
|:-:|---|---|---|
| D1 | What data did you use? | "Simulated data only, from a physics-based FCC simulator: 54 runs (about 83,000 one-minute rows) for the soft sensor, plus 52 runs (about 26,600 rows, about 285 designed lever moves) for the lever models. No IOCL data." | Facts |
| D2 | How were the models checked? | "Trained on 40 runs and checked on 14 held-out runs they never saw." | **Shown** |
| D3 | What data do you need from us? | "Read-only historian tags for the FCC, lab results and crude assays, plus a short step-test window. Nothing from the safety or control systems." | **Pilot** scope (to agree with IOCL) |
| D4 | Where does our data go? (MeitY) | "Category A, meaning control, safety, raw tag names and cargo names, stays on site. An edge gateway de-identifies the data and sends it one way only. Category B goes to India cloud regions with customer-managed keys. This is designed for MeitY; the gateway is a design, and the demo uses simulated data." | Design. **Not built**; demo lake is in `us-central1` |

## E. Architecture

| # | Question | Say this | Status |
|:-:|---|---|---|
| E1 | Is this one big application? | "One screen; separate agents behind it, one per use case, sharing one source of truth. Modular by design; deployed as one service for this demo." | Honest |
| E2 | Is it streaming live? | "The demo loads simulator data in batches. On site it reads the historian every minute." | Gap, say it |
| E3 | Which use cases are real today? | "The cut-point quality inferential and soft sensor (IOCL rows #1 and #11) run on real models. The others are shown with real inputs and scripted outcomes, or as watch-only. The Overview page marks each one." | See `/platform` |

---

**Where these answers live on screen:** Overview `/platform` (layers, use cases, person in the loop, MeitY, predict-decide-measure-learn, pilot line); each unit page step ② (crude walkthrough) and step ④ ("How do we know the move works?").

---

## F. The refinery story (2026-10-06 story-first, 6 Oct)

| # | Question | Say this | Status |
|:-:|---|---|---|
| F1 | Our operators aren't blind — they see the feed entering the column and adjust. Why systemic? | "They see temperatures, and your DCS handles the seconds very well. Two gaps remain: quality, which the lab gives every eight hours, and the consequence of one console's move on another, two to three hours later. We fill those two gaps; we don't replace local control." | Honest |
| F2 | Does the FCC run on crude? | "No — on heavy gas oil from the crude unit. When the crude slate changes, the FCC feed changes, and the settings have to follow, starting with the feed preheat." | Fact |
| F3 | Why start at the furnace? | "Because the oil does. The preheat sets catalyst circulation, which reaches the regenerator and then the fractionator and gas plant hours later. Follow the oil and you see the whole chain." | Shown |
| F4 | Are those dollar figures your promise? | "No — they're your figures from your list. We measure benefit in plant terms on the pilot; you apply your prices." | Honest |
| F5 | Why is the live one the smallest-value row? | "It's where the whole loop — estimate, trust, decide, measure — can be proven end to end. Every higher-value row reuses that loop; the pilot turns them green." | Honest |
