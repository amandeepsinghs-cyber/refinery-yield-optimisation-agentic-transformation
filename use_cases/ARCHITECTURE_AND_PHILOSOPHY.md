# Target Architecture & Design Philosophy: The Agentic Refinery

> **BLUF:** One refinery, one data foundation, many specialist agents, with Gemini on top and people deciding. IOCL's
> data goes into **one lakehouse**. On top of it runs **one specialist agent per use case**, and **Gemini orchestrates
> them** behind a single operator screen. Every agent is **advisory only**: a person accepts, holds or declines, and
> nothing is written to the control system. **Today we show two of these agents working on the FCC.** Once IOCL's data
> is set up, the rest are built the same way.

**How to read this document.** It describes the **target** — what we will build with IOCL. Each part is marked:
**Shown today** (working in the demo), **Preview** (visible in the demo with a scripted outcome, labelled on screen),
or **Next** (built once the data foundation is in place). Rationale (owner, 6 Oct 2026): IOCL gave us a list of use
cases; we answer with one platform on which each use case becomes an agent, and we prove the pattern on the FCC.
Source wording: [verbatim.md](../verbatim.md) Part 11.

---

## 1. The target architecture: four layers

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  LAYER 4 · ONE OPERATOR SCREEN — A PERSON DECIDES                                      │
│  Refinery and FCC view · one page per unit · decision cards (Accept / Hold / Decline)  │
│  · decision record. Nothing is written to the control system.            [Shown today] │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
┌───────────────────────────────────────────▼────────────────────────────────────────────┐
│  LAYER 3 · GEMINI ORCHESTRATOR                                                         │
│  Answers the operator in plain words (English, Hinglish, Hindi; text or voice), calls  │
│  the right agents, combines their answers across units, cites the SOP. Read-only.      │
│  Today: Gemini 2.5 Flash calls the platform's tools live in the demo.    [Shown today] │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
┌───────────────────────────────────────────▼────────────────────────────────────────────┐
│  LAYER 2 · SPECIALIST AGENTS — ONE PER USE CASE                                        │
│   Soft-sensor agent   [Shown today]     Crude-switch agent   [Shown today]             │
│   Furnace agent       [Preview]         Regenerator agent    [Preview]                 │
│   Light-ends agent    [Preview]         Systems agent        [Preview]                 │
│   Coker · CDU/VDU · alkylation · utilities & flare agents                [Next]        │
│   Each agent: its own models, checks and decision; runs as its own service.            │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
┌───────────────────────────────────────────▼────────────────────────────────────────────┐
│  LAYER 1 · ONE REFINERY DATA LAKEHOUSE (GOOGLE CLOUD)                                  │
│  Historian tags every minute · LIMS lab results · crude assays and schedule · SOPs ·   │
│  every decision. BigQuery bronze → silver → gold on Cloud Storage.                     │
│  Today: loaded in batches from a physics simulator.                     [Shown today]  │
│  On your plant: edge gateway (OPC-UA) → Pub/Sub → Dataflow, streaming.  [Next]         │
└────────────────────────────────────────────────────────────────────────────────────────┘
   MeitY-compliant boundary: your data stays in India, under keys you hold. Control and safety systems
   stay on site, and nothing is written to them.
```

### The agents and IOCL's use cases

| Agent | IOCL use cases | Decision it brings to the operator | Status |
|---|---|---|---|
| **Soft-sensor agent** | #1 Product-quality inferential · #11 Product soft sensors | D1 move the cut point now or wait for the lab · D2 can the estimate be trusted · D9 pull an extra sample | **Shown today — live** |
| **Crude-switch agent** | Supports #1 · #11 (not a separate IOCL use case) | D4 which crude is in the unit, has the switch finished; every other agent re-weights for it | **Shown today — scripted outcome** |
| Furnace agent | #5 Fired-heater combustion · #10 Crude-furnace coke & hydraulics | D6 preheat for this feed | Preview (gain measured, outcome scripted) |
| Regenerator agent | #4 Regeneration-cycle tracking | D5 regenerator air against afterburn | Preview (scripted) |
| Light-ends agent | #2 Stabiliser C5 recovery · #3 LPG / naphtha split · #7 Exchanger fouling | D7 overhead temperature target | Preview (scripted) |
| Systems agent | #6 Multi-unit energy · #8 Filter breakthrough · #9 Rotating equipment | D8 riser drift and its downstream consequence (watch) · D3 several set points together | Preview (watch only / scripted) |
| Coker, CDU / VDU, alkylation, utilities & flare agents | The rest of IOCL's list | Same pattern on other units | Next |

**The two agents shown today, and why these two:**
- **Soft-sensor agent** — the live one. Four models estimate product quality every minute between lab samples; when
  they disagree it says **"Not yet"** and asks for a sample instead of guessing.
- **Crude-switch agent** — the clearest example of one data foundation feeding many agents. It names the crude from the
  unit's own behaviour, and every other agent adjusts to it.

---

## 2. Why one screen, and why separate agents

### One screen for the operator
* **Oil flows between units.** A move on the furnace shows up in the regenerator and the gas plant hours later. Separate
  dashboards per agent would hide that.
* **No dashboard sprawl.** One screen shows the whole FCC, the decision on each unit and its effect on the next units.

### Separate agents behind it
* **Each agent has its own job and pace.** The soft-sensor agent runs every minute; anomaly detection keeps a rolling
  history; Gemini runs on demand.
* **Resilience.** If Gemini is slow, estimates and trust checks keep running.
* **Growth without rework.** A new unit (coker, alkylation) is a new agent on the same lakehouse and the same screen;
  the FCC agents are not touched.
* **Today** the demo runs these as separate modules inside one service, for simplicity; each has its own inputs and
  outputs and is deployed as its own service on your plant.

---

## 3. Five design principles

### 1. Advisory only — nothing written to the control system
* Agents never write to DCS set points or valves. The operator gets a decision card — **Accept / Hold / Decline** — and
  every action goes to the **decision record**, for engineering review and for retraining the models.

### 2. Trust before advice — an AI that always answers is dangerous
* A single soft sensor always gives a number, even when it should not be trusted. Here, four different estimators must
  agree: if their spread is too wide (W90 above 14 °F) or the inputs are outside the training range, the agent
  **withholds advice** and says **"Not yet"** (D2).
* It then asks for an extra lab sample (D9) to re-anchor the estimate.

### 3. Physics and data together
* Pure data-driven models can propose states the plant cannot reach. The soft sensor combines a statistical model
  (Bayesian ridge), a hybrid physics + data model, **physics-informed neural networks (PINN)** held to the column's
  boiling-point physics, and a Gaussian process that says how unsure it is. A new crude starts from physics and its
  nearest crude family, then learns.

### 4. Engineering numbers on screen, not money
* Operators work in °F to spec, % chance on spec and equipment limits. The screen shows only those. IOCL's own value
  figures stay in the business-case documents, attributed to IOCL.

### 5. Same pattern everywhere — the "Next" agents are not gaps
* Every new agent follows the same four steps: bring the unit's historian tags into the lakehouse → train that unit's
  models → deploy the agent → add the unit to the operator screen.

---

## 4. The decision chain, following the oil through the FCC

| Step | Decision | What the agent does | Status |
|:-:|---|---|---|
| 1 | **D4** Which crude is in the unit, and has the switch finished? | Names the crude from the unit's own behaviour, confirms when the switch is done, and re-weights every model for it | Shown today — scripted outcome |
| 2 | **D6** What preheat for this feed? | A sized preheat move for this crude, with its effect on riser and regenerator shown before anyone acts | Preview — gain measured |
| 3 | **D8** Act on the riser now, before it reaches the regenerator? | Flags the drift with its downstream consequence and when it will land; no move proposed | Preview — watch only |
| 4 | **D5** Rebalance regenerator air against afterburn? | Tracks cyclone ΔT against expected for this feed and proposes the air move before the limit, with the likely cause | Preview — scripted |
| 5 | **D1** Move the LCO cut point now, or wait for the lab? | A cut-point estimate every minute with the chance of being on spec, and the move now — or "wait for the lab" | **Shown today — live** |
| 6 | **D2** Can the estimate be trusted right now? | Four different estimators; when they disagree the cockpit says "Not yet" and holds every move | **Shown today — live** |
| 7 | **D9** Pull an extra lab sample now? | Asks for an extra sample exactly when the estimate is least certain | **Shown today — live** |
| 8 | **D3** Which set points, together, for the new crude? | A recipe of several set points checked against limits — held back while D2 says the estimate is too uncertain | Preview — scripted |
| 9 | **D7** Move the overhead temperature target? | Flags cooling-water demand above expected for the load and proposes the overhead move; cooling water stays at fixed duty | Preview — scripted |

Wording matches the Overview page (SDD §14.6E). "Scripted": the size of the move is scripted on real simulator inputs;
on your plant it comes from the agent's models, refitted on your data.

---

## 5. How we get there, and what we need from you

| Phase | What happens | Result |
|---|---|---|
| 1 · Data foundation | Connect historian, LIMS, crude assays and schedule into the lakehouse, inside the MeitY boundary | One source of truth for the refinery |
| 2 · First agents | Soft-sensor and crude-switch agents on your FCC, run offline against your own history first | The two agents shown today, on your data |
| 3 · Scale out | The next agents on the FCC, then other units, on the same lakehouse and screen | IOCL's use-case list, one agent at a time |

**What we need from you:** 1-minute historian tags · LIMS lab results · crude assays and schedule · SOP limits for each
lever · the decision log. Nothing is written to the control system.

---

## 6. Pitch script (discovery call)

### 1. One data foundation
> *"Everything starts with one lakehouse for the refinery: every tag every minute, every lab result, every crude assay,
> and every decision, governed in one place and inside the MeitY data boundary."*

### 2. Specialist agents, orchestrated by Gemini
> *"On top of it, each of your use cases becomes a specialist agent: its own models, its own checks, its own decision.
> Gemini sits above them: it answers your operators in plain words, calls the right agents, and connects what one unit
> does to the next. Every agent is advisory — a person decides, and nothing is written to the control system."*

### 3. One screen, and two agents working today
> *"Because the oil flows between units, your operators get one screen, not ten tools. Today I'll show you two of these
> agents on the FCC: the soft-sensor agent, which tells you the product quality every minute and says 'not yet' when it
> isn't sure, and the crude-switch agent, which every other agent depends on. Once your data is set up, the rest are
> built the same way."*
