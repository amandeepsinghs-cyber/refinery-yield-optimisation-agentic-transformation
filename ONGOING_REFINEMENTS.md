# Ongoing refinements

> **What this file is:** proposed changes agreed in discussion but **not built yet**. Each item says why, what changes, which files, and how we will know it is done. When an item is built, move its row to "Done" with the commit, and tick it in [checklist.md](checklist.md).
>
> **Order of authority still applies:** `DECISIONS.md` → `demoflow.md` → `features.md` → `SDD.md` → `BDD.md` → `build.md` → `checklist.md`. Each item below lists its file changes in that order.

| # | Item | Status | Owner ask |
|---|---|---|---|
| R-1 | **Feed quality drives the whole FCC.** Replace the crude-name classifier with a feed-quality model (feed change, feed properties, novelty; class derived from properties) and show, on every decision from the riser onward, which feed values it used | **Proposed** (7 Oct) | Owner, 7 Oct 04:17–05:40 |

---

## R-1 · Feed quality drives the whole FCC (riser → regenerator → fractionator → gas plant)

### Why
Owner, 7 Oct 2026:
- 04:17 *"why would someone like to run a classification model for crude identification when the input is heavy gas oil? … any way this is scripted and fixed at 93 %. what would be helpful in terms of a classification model?"*
- 04:20 *"just renaming may not solve the problem … we can bring this messaging"*
- 04:25 *"the problem is not just with fractionator … it is with the entire FCC unit starting from riser … the main decision … how much catalyst should go into the fcc, catalyst flow and the temperature? tell me all the decisions to be made and how we are enabling them. So the classification would identify or use the properties of the input gas oil. The classification model should handle that no?"*
- 05:40 *"capture this under the documents and lets tackle it one by one"*

The FCC is fed **heavy gas oil (VGO)**, not crude (DECISIONS S-2). Today U4 step ② shows "Which feed is arriving — crude-family classifier · scripted" with R2 Medium-heavy at a fixed 93 %. The real classifier (Gaussian class model on the unit fingerprint, SDD-REG-02) names the right crude in only 8 of 15 held-out switches, so the card follows the assay. A crude name changes no FCC decision; **feed properties change all of them.** Renaming the card would not fix this.

### The physics in one line (heat balance)
Heavier / higher-carbon-residue feed → more coke on catalyst → hotter regenerator → the regenerated-catalyst slide valve sends **less** catalyst to hold the same riser outlet temperature → lower catalyst-to-oil → lower conversion → different product slate → different cut points and gas-plant load.

**Correction to the framing "how much catalyst":** nobody sets catalyst flow directly. Operators set **riser outlet temperature (ROT)** and **feed preheat**; the slide valve moves catalyst to hold ROT. Catalyst-to-oil is the **result** of ROT, preheat and regenerator temperature. The cockpit shows it, and never advises it directly (correct).

### Every FCC decision and how the build enables it

| Area | Operator decision | Why feed quality matters | In the build | Status |
|---|---|---|---|---|
| Feed | **Has the feed changed, is the change finished, is it new to the models?** | Times the soft-sensor bias reset, picks response gains, holds advice during the transition | D4 + crude card | 🟠 Scripted name at fixed 93 % — **the weak spot (this item)** |
| Riser | **ROT set point** (severity) | Heavier feed needs a different severity for the same conversion | D3 recipe (ROT +3.5 °F) | 🟠 Scripted (fixed gain 0.12 % conversion / °F) |
| Riser | Catalyst-to-oil / circulation | Result of ROT + preheat + regenerator temperature | Shown as a measured value | 👁 Shown, never advised |
| Feed furnace | **Feed preheat** | Lower preheat → more catalyst at the same ROT; the main way to adjust catalyst-to-oil | D6 | 🟠 Gain measured (52 step tests, 1.007 °F/°F); chance scripted; move on s107 |
| Regenerator | **Air rate / excess O₂**, afterburn | More coke needs more air; too little → afterburn, CO | D5 | 🟠 Scripted |
| Fractionator | **LCO / HN cut points** | Product slate shifts with feed; lab every 8 h | D1, D2, D9 | 🟢 Real 4-model soft sensor |
| Gas plant | **Overhead temperature**, C5 recovery, LPG split | Feed changes light-ends load | D7 | 🟠 Scripted (only when fouling) |
| Whole unit | What first; what breaks downstream | — | D8 | 👁 Watch |
| Never advised | Feed rate, fresh-catalyst addition / withdrawal, cooling-water flow | Planning / maintenance | "Never recommends" line | ⚪ Out of scope |

### The model: property estimate first, class derived from it

| # | Model | Output | Why it matters | In this build (simulator) |
|---|---|---|---|---|
| 1 | **Feed-change detection** | "Feed changing since 06:25, about 70 % through, finished around 07:30" | This is what D4 asks; times the bias reset; holds advice in the transition | Real timing from the crude segments + fingerprint shift; the 12-min confirmation lag is scripted today → make it detected |
| 2 | **Feed-property soft sensor** (regression) | Estimated API gravity / density, Conradson carbon, Watson K-factor, nitrogen, metals, with a band | These set crackability, coke make, regenerator temperature, cut points. Decisions need numbers: carbon residue 0.5 % vs 3 % are both "heavy" but need different air and preheat | **Feed API is the only feed property in the simulator** (`dist_feed_API` per minute; declared API from the assay). Build a real **feed-API estimate** from the unit fingerprint, trained on s100–s139, checked on held-out runs. Other properties: "IOCL phase" |
| 3 | **Novelty check** | "This feed is outside anything the models were trained on" | Advice withheld rather than extrapolated | Real score exists but is **capped at 0.4 in scripted mode** (`scripted.py` `regime()`); remove the cap |
| 4 | **Feed-quality class** (derived) | e.g. easy / intermediate / high-carbon / high-metals | Easier to read than a crude name; still tied to how the feed cracks | Derived from estimated API bands; crude family stays as a context line ("per schedule and assay", scripted) |

Inputs (every minute): coke per feed, riser ΔT, regenerator temperature, catalyst circulation, conversion, dry gas, preheat duty, tray ΔT (all already computed as the regime fingerprint), plus any on-line density / NIR analyser on site. **Labels on IOCL's plant:** daily LIMS VGO analyses (density, carbon residue, sulphur, metals, distillation); crude schedule and tank blends as a prior.

### What changes
1. **One feed-quality block, unit-wide.** "Follow the oil" stop 1 becomes **"Feed arriving"**: feed change (progress, start, finish) → feed properties (estimated API vs declared, band; other properties "IOCL phase") → novelty (value vs hold limit) → class (derived) → crude family (context, scripted). Each row has a real / scripted / next chip.
2. **Every downstream decision states the feed it used.** D3 (ROT), D6 (preheat), D5 (air), D1 (cut points), D7 (overhead) each show one line, e.g. *"For this feed: API 23.1 (est.) · class intermediate · change finished 07:37"*, and are held while the feed is changing or novel.
3. **Catalyst-to-oil shown as the result** of ROT, preheat and regenerator temperature on U2/U3, with the "never advised directly" note.
4. **No change** to D1 / D2 / D9 cut-point numbers.

### Steps (tackle one by one; commit after each)

| Step | What | Files |
|---|---|---|
| **R-1a** | DECISIONS S-8: feed quality drives every FCC decision; the feed model is a property estimate with a derived class; crude family is context only; catalyst flow is a result, never advised | `DECISIONS.md` §0A |
| **R-1b** | Specs in authority order | `demoflow.md` (L23, L44, L57, L89), `features.md` (L59, L419), `SDD.md` (SDD-REG-02 ~L929, SDD-DEC-07 ~L998, D4 rows ~L1086 / L1100), `BDD.md` (L63, L1114, L1498) |
| **R-1c** | API: feed-API estimate (train s100–s139, report held-out error); change detection from the fingerprint (replace the scripted 12-min lag); uncapped novelty; derived class; one `feed` block on `/api/decisions` and the unit workbench; D4 wording; D3/D5/D6/D1/D7 carry `feed_used` and hold while changing / novel | `engines/regime.py`, `engines/scripted.py`, `engines/decisions.py`, `engines/workbench.py`, `routers/regime.py` |
| **R-1d** | Web: "Feed arriving" panel (stop 1, every unit page step ②); "For this feed …" line on each decision; catalyst-to-oil as a result on U2/U3 | `twin/l1/UnitStory.tsx` (CrudeSwitchStory), `twin/l1/RegimeCard.tsx`, `twin/l0/UnitFlow.tsx`, `lib/howItWorks.ts`, `lib/decisionsApi.ts`, `lib/twinTypes.ts` |
| **R-1e** | Gemini guide and guardrails: explain feed change / properties and the heat balance; never present crude identification as the purpose; never advise catalyst flow directly | `copilot/ui_guide.py`, `copilot/chat.py` |
| **R-1f** | Pitch docs | `DEMO_SCRIPT.md` (L36, L41, Scene B L105–117), `use_cases/PRESENTER_PACK.md` (L22, stop 1 L113–117, L210, L233, L265), `PROBING_QUESTIONS.md` (B1, B2 + new "Why classify crude when the FCC sees VGO?" and "Why don't you advise catalyst flow?"), `STORY_v2.md` (L58, L245, L406, L482), `cockpit/API_CONTRACT_v3.md` (L223) |
| **R-1g** | Tests and deploy | `api/tests/test_scripted.py`, `test_decisions.py`, regime tests; web vitest; next version |

Leave alone: `use_cases/UC-FEED_*.md`, `refinery_optimisation_use_cases.md` (IOCL catalogue text); historical logs (`docs/PROGRESS_LOG.md`, `verbatim.md`, `BUILD_PLAN_v3.md`, `BCC.md`, `STORY.md`).

### Done when
- Stop 1 on `random_s107` 10:00 shows the panel mid-switch; `random_s144` 10:00 shows it settled (100 %, estimated API near the declared 23.3, novelty 0.08, crude family as context).
- The feed-API estimate's held-out error is reported on screen (Full explanation) and in the model card.
- Each of D1 / D3 / D5 / D6 / D7 shows "For this feed …"; a changing or high-novelty feed holds D3 / D1 (test).
- No screen, doc or Gemini answer presents crude identification as the purpose, or advises catalyst flow directly.
- API and web tests pass; deployed as the next version.

### Effort
About 3–4 hours in total (the feed-API model and change detection are the new work; the rest is wiring and text).

---

## Done
*(none yet)*
