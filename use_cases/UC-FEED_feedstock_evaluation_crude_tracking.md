# UC-FEED: Feedstock Evaluation — Feed-Change Tracking

> **Status:** 🟢 **Interactive on simulated data** (feed model, R-1c) — the feed change and the feed API estimate come from the unit's response; the crude family is context only
> - **IOCL catalogue:** Scheduling & planning — *Feedstock evaluation* (also supports "Coker recycle → FCC yield optimisation", FCC side only). Not on IOCL's use-case list as a row: do not present it as a use case; it supports #1 and #11.
> - **Cockpit:** step ② of every unit page ("Feed arriving"), best shown on **U4 · Fractionator** · answered by: *Feed model*
> - **Decision:** **D4** is the feed changing, and has the new feed settled? (shown only while the feed is changing, novel, or off from the declared API)
> - **Lever:** none — every other decision says which feed it was sized for ("For this feed …") and is held while the feed is changing or novel
> - **Problem it answers:** **P2** — the crude slate changes every 12–48 h, so the VGO feeding the FCC changes too

## 1. The problem in plant terms
The FCC is fed heavy gas oil (VGO), not crude. When the crude slate changes, the VGO changes with it, and its quality (API gravity, carbon residue, crackability) sets coke make, regenerator temperature and cut points. The schedule says which crude is coming, but not when the new feed really reaches the unit or how it will crack. Every model and set point tuned on yesterday's feed is now off.

## 2. What we built
| Piece | What it does |
|---|---|
| Inputs | Coke per feed, riser ΔT, fuel per feed, regenerator temperature, conversion, tray ΔT (the unit's response); the declared API from the schedule |
| ① Feed change | Flags a change when the estimated API leaves its slow baseline by more than 0.7 API; settled after 15 min steady. Held-out: **15 of 15** feed changes caught, **2** false alarms |
| ② Feed API soft sensor | Quadratic ridge regression on the response. Held-out error **0.20 API** (p90 0.41, R² 0.98), shown with a band |
| ③ Novelty | Is this feed outside the training data? If so, advice is withheld rather than extrapolated (no cap) |
| ④ Feed class | Derived from the API estimate (e.g. "light, easy-cracking", "intermediate") |
| Context | Crude family (e.g. R4 Light, Bonny-Light-type) as one line; never the purpose |
| Soft sensor | Lab bias resets when the new feed has settled; model weights stay accuracy-based, never set by the crude |

## 3. What remains
- More feed properties: Conradson carbon, K-factor, nitrogen and metals from IOCL's lab and assays (the simulator models API only).
- LP assay import, crude purchase evaluation, coker-recycle link.

## 4. How it solves IOCL's problem
Advice is held while the feed is changing and resumes when the new feed **really** arrives and settles, sized for its estimated quality, not for the crude name on the schedule. Catalyst circulation follows from the heat balance and is never advised. That is the practical half of feedstock evaluation at the unit.

## 5. Show it in the demo
| Step | Do | Point at | Say |
|---|---|---|---|
| 1 | **Scenario** → `random_s107`, 10:00 → **FCC Complex** | **What went wrong:** new feed settled at API 27.2 (08:47) | "The feed changed. The plant tells us before the lab does." |
| 2 | **U4 · Fractionator** → step ② | "Feed arriving" rows ①–④, **How it knows** (held-out error 0.2 API; 15/15 changes caught); walkthrough **06:25** slate R3 → R4 → **06:25–07:25** behaviour shifts → **07:07** feed change detected, advice held → **08:47** new feed settled, lab bias reset, advice resumes | "Your FCC sees gas oil, not crude. We estimate the feed's quality from how the unit responds and hold advice until the new feed has settled." |
| 3 (optional) | Clock → **07:20** | D4 "feed changing, 55 % through"; D1/D5/D6/D7 "Not yet — the feed is still changing" | "No move until the new feed has settled." |

**Pass check:** panel shows ①–④ with the crude family as context only; walkthrough shows 06:25 / 06:25–07:25 / 07:07 / 08:47; at 07:20 D4 is shown and the other decisions are held.

## 6. If asked
- *"Why classify crude when the FCC sees VGO?"* — "We don't. The crude family is context; what drives the decisions is the feed's quality." (`PROBING_QUESTIONS.md` B2)
- *"Which properties?"* — "API in the demo; on your plant add Conradson carbon, K-factor, nitrogen and metals from your lab." (B3)
- *"A feed you've never seen?"* — "The novelty check withholds advice rather than extrapolating; then it leans on physics, moves smaller, and learns the feed within a few lab cycles."
- *"Why not advise catalyst flow?"* — "It isn't a lever: catalyst-to-oil follows riser outlet temperature, preheat and air. We show it as a result." (B4)

## 7. Pilot on IOCL's plant
Crude schedule and assays, historian around past feed changes, lab feed properties; fit the feed model on IOCL's own data; best operating window per feed class from history.
