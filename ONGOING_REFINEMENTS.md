# Ongoing refinements

> **What this file is:** proposed changes agreed in discussion but **not built yet**. Each item says why, what changes, which files, and how we will know it is done. When an item is built, move its row to "Done" with the commit, and tick it in [checklist.md](checklist.md).
>
> **Order of authority still applies:** `DECISIONS.md` → `demoflow.md` → `features.md` → `SDD.md` → `BDD.md` → `build.md` → `checklist.md`. Each item below lists its file changes in that order.

| # | Item | Status | Owner ask |
|---|---|---|---|
| R-1 | Replace the crude-name classifier card with a **"Feed arriving"** panel (feed change, feed quality, novelty, crude family as context) | **Proposed** (7 Oct) | Owner, 7 Oct 04:17–04:21 |

---

## R-1 · "Feed arriving": from crude name to feed change and feed quality

### Why
Owner, 7 Oct 2026, 04:17: *"why would someone like to run a classification model for crude identification when the input is heavy gas oil? … any way this is scripted and fixed at 93 %. what would be helpful in terms of a classification model?"*; 04:20: *"just renaming may not solve the problem … we can bring this messaging"*.

- The FCC is fed **heavy gas oil (VGO)**, not crude (DECISIONS S-2). A crude name is a proxy that the schedule and assay library happen to use; no FCC decision changes because of the name.
- The question the unit actually needs answered is **"has my feed changed, is the change finished, and is this feed new to the models?"** That times the soft-sensor bias reset, picks the response gains, and holds advice during the transition.
- Today U4 step ② shows "Which feed is arriving — crude-family classifier · scripted" with R2 Medium-heavy at a fixed 93 %. The real classifier (Gaussian class model on the unit fingerprint, SDD-REG-02) names the right crude in only 8 of 15 held-out switches, so the card follows the assay. **Renaming the card would not fix this:** the content (a name and a fixed %) answers the wrong question.

### What a useful model does (in order of value)

| # | Model | Output | Why it matters on the FCC |
|---|---|---|---|
| 1 | **Feed-change detection** | "Feed changing since 06:25, about 70 % through, finished around 07:30" | This is what D4 asks. It times the bias reset and holds advice during the transition |
| 2 | **Feed-quality soft sensor** (regression) | Estimated API gravity / density, Conradson carbon, Watson K-factor, possibly nitrogen and metals, with a confidence band | These set crackability, coke make, regenerator temperature and cut points. A crude name only stands in for them |
| 3 | **Novelty check** | "This feed is outside anything the models were trained on" | Advice should be withheld rather than extrapolated |
| 4 | Feed-quality class (optional) | e.g. paraffinic / easy, intermediate, aromatic / high-carbon, high-metals | Easier for operators to read than a crude name, and still tied to how the feed cracks |

### What the build already has (checked against the API, `random_s144` 10:00)

| Row | Data available now | Honest status on screen |
|---|---|---|
| 1 Feed change | Crude segments: switch window 06:25 → 07:25, `transition_pct` 0–100, detected 07:37 (`detection_delay_min` 12) | Timing = real simulator data. The 12-min confirmation lag is **scripted** (`scripted.py` `DETECT_LAG_MIN`) |
| 2 Feed quality | Unit-behaviour fingerprint every minute: coke per feed 2.33, riser ΔT 353.1 °F, fuel per feed 12.9, regenerator 1250 °F, conversion 93.9 %, tray ΔT 234.5 °F; declared feed API 23.3 (assay) | Inputs = **real**. The property estimate (API / carbon residue / K-factor) is **not built** → chip "Next" |
| 3 Novelty | `novelty` 0.08 | Real, **but capped at 0.4 in scripted mode** (`scripted.py` `regime()`: `min(novelty, 0.4)`). Remove the cap so a new feed can hold the advice |
| 4 Crude family | R2 Medium-heavy, p = 0.93 | **Scripted** (follows the assay). Demote to one context line: "crude family per the schedule and assay" |

On IOCL's plant the feed-quality soft sensor would train on the **daily LIMS VGO analyses** (density, carbon residue, sulphur, metals, distillation), with unit behaviour and any on-line density / NIR analyser as inputs, and the crude schedule and tank blends as a prior.

### What changes
1. **Screen (U4 step ②, and the same block on other unit pages):** replace the classifier card with a 4-row **"Feed arriving"** panel: feed change (progress, start, finish) → feed quality (fingerprint values + declared API; property estimate "Next") → novelty (value vs the hold limit) → crude family (context, scripted). Each row carries a real / scripted / next chip.
2. **API:** expose the fingerprint, transition timing and uncapped novelty in the shape the panel needs; drop the novelty cap in `scripted.py`; D4 headline and `enabled_by` say "feed change" and "feed quality", not "names the crude".
3. **Texts:** D4 card (howItWorks), Gemini guide and guardrails, demo scripts, probing questions, story.
4. **No change** to D1 / D2 / D9 cut-point numbers.

### Files to update (authority order first)

| Order | File | What changes |
|---|---|---|
| 1 | `DECISIONS.md` | New S-8: "D4 = feed change, feed quality and novelty; the crude family is context only (FCC sees VGO)" |
| 2 | `demoflow.md` (L23, L44, L57, L89) | Stop 1 wording; "crude classifier" in the room line → "feed-change and feed-quality check" |
| 3 | `features.md` (L59, L419) | D4 row name; J2 regime engine described as feed-change / novelty, crude family secondary |
| 4 | `SDD.md` (SDD-REG-02 ~L929, SDD-DEC-07 ~L998, D4 rows ~L1086 / L1100) | Panel spec, API fields, novelty uncapped |
| 5 | `BDD.md` (L63, L1114, L1498) | Acceptance: panel shows 4 rows with chips; "classifier header scripted" → "crude-family row scripted"; novelty can exceed 0.4 |
| 6 | `build.md`, `checklist.md` | R-1 section (added 7 Oct, proposed) |
| 7 | API: `engines/scripted.py`, `engines/regime.py`, `engines/decisions.py` (D4 text, `enabled_by`), `engines/workbench.py` (regime block), `routers/regime.py` if the shape changes, `copilot/ui_guide.py`, `copilot/chat.py` | Data + Gemini |
| 8 | Web: `twin/l1/UnitStory.tsx` (CrudeSwitchStory), `twin/l1/RegimeCard.tsx`, `lib/howItWorks.ts` (D4 card, glossary), `lib/decisionsApi.ts` / `lib/twinTypes.ts` (types) | Panel |
| 9 | Pitch docs: `DEMO_SCRIPT.md` (L36, L41, Scene B L105–117), `use_cases/PRESENTER_PACK.md` (L22, Stop 1 L113–117, L210, L233, L265), `PROBING_QUESTIONS.md` (B1, B2 + new "Why classify crude when the FCC sees VGO?"), `STORY_v2.md` (L58, L245, L406, L482), `cockpit/API_CONTRACT_v3.md` (L223) | Wording |
| — | Tests: `api/tests/test_scripted.py`, `test_decisions.py`, regime tests; web vitest if the component is covered | Update expectations |

Leave alone: `use_cases/UC-FEED_*.md` and `refinery_optimisation_use_cases.md` (IOCL catalogue text); historical logs (`docs/PROGRESS_LOG.md`, `verbatim.md`, `BUILD_PLAN_v3.md`, `BCC.md`, `STORY.md`).

### Done when
- U4 step ② on `random_s107` 10:00 shows the 4-row panel during the switch (progress < 100 %) and on `random_s144` 10:00 after it (100 %, novelty 0.08, crude family as context).
- Novelty is uncapped; a test proves a high-novelty minute holds D3 / D1.
- No screen, doc or Gemini answer says the cockpit "identifies the crude" as its purpose.
- API and web tests pass; deployed as the next version.

### Effort
About 1.5–2 hours including tests and deploy.

---

## Done
*(none yet)*
