# L0 Refinery Twin — Build Plan (P5 / Step 18 / J6 · SDD-L0-01..04 · BDD-28)

## 2026-10-02 agreement (supersedes earlier UI sections where they conflict)

> [!WARNING]
> **This plan's layout is superseded** by the owner's agreement of 2 Oct 09:48–11:34 UTC (and Voice Note 11). Its Pass A back-end work (`kpi_vs_plan`, counts, consequence rules in `app/engines/systems.py`, timeline) still stands and feeds the new home. Its "D1–D3" below are this plan's own questions, not the decision inventory D1–D9 and not the old decision numbering (hydrotreater / cut points / trust), which was renamed to OD1–OD3 on 2 Oct.

**What the home is now (`/twin`, built `994380a`, `beee022`):**
1. **Top view of the refinery** = the FCC's six units in flow order: Feed furnace → Riser reactor → Regenerator → Main fractionator → Gas plant → Stabiliser. **No left bar.** The whole-refinery hybrid PFD with muted CDU / VDU / reformer / alkylation blocks (this plan's D1 recommendation) is **not** used.
2. **What went wrong:** one line; the affected unit glows (amber drifting, red act, blue halo for an open decision).
3. **Decisions pinned to their units** with Accept / Hold 30 min (Decline on the card); "Not yet" decisions grouped with their reason. No value figures.
4. **How AI / ML / agents enable it:** the four-step flow ① Data in / out → ② What we observe → ③ Decision and lever → ④ How the move is found, under the drawing.
5. **IOCL use-case band** (`GET /api/decisions-coverage`), one quiet line per use case.

**Click a unit → unit page (`/twin/unit/{unit_id}`):** the same four steps in full, plus a footer with the unit's use cases (`beee022`, `112aa48`, `11876cc`). **`/audit`** is now the Decision record (`112aa48`).

**Decisions on the home:** D1 cut point now or wait (`SP_LCO_T98`, `SP_HN_T98`), D2 trust, D4 which crude, D8 what first, D9 extra lab sample — **Live**. D3 recipe (`SP_T_riser_ROT_F`, `MV_PA1..4`), D5 regenerator air (`Fair`), D6 furnace preheat (`SP_T_preheat_F`), D7 gas plant / stabiliser (`MV_reflux_ratio`, `MV_cw_flow`, `SP_T_overhead`) — **Not yet** until the `lever_v1` batch (launched 12:15 UTC 2 Oct) and a surrogate refit. Problems P1–P4 and the IOCL mapping: [build.md](../build.md) top section.

**Open:** ② estimate over time with lab points · ③ earlier decisions on this unit · ④ binding limits and, for "Not yet", the exact missing data · ① full tag list · footer action history.

---

*Original plan (2026-10-01), kept for history:*

**Recommendation: build L0 in two short passes — first make `/api/twin` actually deliver the L0 contract (today it returns placeholders), then rebuild the screen to the approved mockup with the 6 simulator units mapped onto the whole-refinery PFD and everything else shown as "boundary data only".** Three decisions below need your call before I start; the rest is execution.

> [!IMPORTANT]
> The current L0 is weaker than it looks on both sides. Frontend: `PFDSvg` is 6 hard-coded boxes, no status/KPI/counts, no header strip, timeline not interactive. Backend (`cockpit/api/app/twin.py` (pre-Pass-A L0 block)): `needs_attention.consequence` is the literal string `"Action required"`, `kpi_vs_plan` is "approximate" with `tol=3` and `state="WATCH"` hard-coded, `flags == events_open`, timeline labels fall back to whole briefing paragraphs. A pretty screen on top of that would be a façade.

---

## Decisions needed

### D1 — PFD scope: whole refinery (mockup) vs 6 FCC units (SDD-L0-01)
The mockup draws the whole refinery; SDD-L0-01 says "6 units, 3 loops". They can be reconciled:

| Mockup block | Maps to | Rendering |
|---|---|---|
| **FCC/RFCC complex** (large outlined box) | U1 Furnace · U2 Riser · U3 Regenerator · U4 Fractionator as four live sub-blocks inside it | Live: KPI vs plan, status pill, decisions/flags, click → L1 |
| **Gas plant** | U5 Overhead condenser & WGC | Live |
| **Plant/stabiliser** | U6 Stabiliser | Live |
| Desalter, CDU, VDU, Naphtha HDT, Reformer, Diesel HDT, Alkylation, Blending, Utilities | no simulator data | Muted, `boundary data only` pill, one boundary tag value from `downstream_cases_summary`, not clickable |

**(Recommended)** Hybrid above — honours the approved mockup and BUILD_PLAN §2 ("everything ❌ is explicitly architecture-ready on Level 0") while keeping SDD-L0-01's 6 live units.
Alternative: 6-unit-only PFD (simpler, but contradicts the approved mockup and loses the "where in the refinery" story).

### D2 — Pull the Systems Agent consequence rules (P4) forward into this step
"Needs attention" lines need a *consequence* ("PA3 saturates in ~90 min; LCO yield −0.4 % feed if unadjusted"). That is the P4 Systems Agent. **(Recommended)** build a small rule table now (`app/engines/systems.py`, ~15 rules over the catalyst / heat / hydrocarbon loops keyed on `(unit, tag, direction)` → downstream unit, consequence text, horizon) rather than ship L0 with placeholder text. Alternative: ship L0 with `consequence = null` and hide the line until P4.

### D3 — Navigation: make `/twin` the home now
BDD-28 says root → `/twin`. **(Recommended)** redirect `/` → `/twin` and leave the other dashboards in the nav until L1 lands (they still back the Technical/Modelling story); retire "Decision › Overview & Twin" only after L1 U4 is done. Alternative: retire now (risk: demo regressions on screens nobody has re-tested).

---

## Pass A — backend: make `/api/twin` honour API_CONTRACT_v3 §6 (≈ ½ day)

1. **`kpi_vs_plan` per unit** — headline tag per unit from contract §0 (`T2_preheat_F` vs SP, `conversion_pct`, `dT_cyc_reg_F`, `LCO_T98_F` vs `SP_LCO_T98`, `MV_cw_flow`, `eff_C5`); `plan` = set point or regime-surrogate expected; `tol` from a new `config.yaml → plan_tolerances:` block; `state ∈ {OK, WATCH, ACT}` = |value−plan| vs tol / 2·tol.
2. **Counts** — `flags` = open E3 events with severity ≥ warn (distinct tag), `events_open` = all open, `decisions_open` from the `decisions` table (not `decisions_needed` length).
3. **`needs_attention`** — top 5, sorted alarm > warn > info then recency; `line` = short form built from event fields (`"LCO T98 +4.8 °F above expected since 08:23"`), `consequence` from D2 rules, `time_label` HH:MM.
4. **`timeline`** — compact `label` (≤ 60 chars) + `severity`; include `regime_change`, `recipe_ready`, `accepted/declined`.
5. **`plant` strip** — `mass_closure_pct` (from `mass_balance_err_pct`), `open_decisions`, `agent_flags`, `shift_label` + `clock` (derived from `time_min`; shift A/B/C by 8-h blocks).
6. Tests: `tests/test_twin_l0.py` — all 6 units carry `kpi_vs_plan` with numeric plan/tol and a valid state; `needs_attention[*].consequence` non-empty when rules match; no financial terms; timeline labels ≤ 60 chars. Extend `twinTypes.ts` to match.

## Pass B — frontend: rebuild `/twin` to the mockup (≈ 1 day)

| Component | Replaces | Content |
|---|---|---|
| `l0/L0Header.tsx` | — | "Refinery Digital Twin · Shift B · 06:40", run selector (reuse existing), **EN / Hinglish / हिंदी** toggle (new `lang` in store, feeds Copilot `context.lang`), Gemini Live button (reuse `CopilotLauncher`) |
| `l0/PlantStatusStrip.tsx` | — | "Plant mass closure +0.03 % · 3 open decisions · 1 proactive agent flag (…)" |
| `l0/RefineryPFD.tsx` | `PFDSvg.tsx` | Flat SVG PFD per D1; live unit block = name, KPI line "758.4 °F vs plan 760", status pill (`IN ENVELOPE` / `DRIFT` / `ACT`), `n decisions` + `n agent flag`, hover "Open workbench →", click → `/twin/unit/[id]`; boundary blocks muted; three loop lines (catalyst, heat, hydrocarbon) in palette colours, grey only for borders. **No sparkline** (mockup's gas-plant mini-chart dropped per SDD-L0-02) |
| `l0/NeedsAttentionRail.tsx` | inline JSX | Right rail; severity dot (amber / blue / grey-dot is allowed as *state* colour), "Unit · line", consequence, HH:MM; click → L1 |
| `l0/ShiftTimeline.tsx` | `TimelineStrip.tsx` | 12-h strip, hour ticks, event ticks coloured by severity with tooltip, draggable cursor → `setTimeMin`, ▶ replay (reuse Replay view's ticker) |
| `app/page.tsx` | — | redirect → `/twin` (D3) |
| `app/layout.tsx` | — | `data-theme` default `"dark"` → `"light"` (SDD-L0-03; store already defaults to light — mismatch today) |
| `e2e/twin.spec.ts` | lenient test | Real asserts: 6 live unit blocks, banner text present, ≥ 1 needs-attention row on the demo run, `.js-plotly-plot` count = 0, no horizontal scroll at 1440, `data-theme="light"` on first load and dark persists after reload |

Register: PI-Vision/Seeq sober — DM Sans, 13 px body, 1-px borders, colour only for state (`--ok` green, `--amber`, `--red`, accent blue for "open workbench").

## Pass C — bookkeeping (≈ ½ h)
- Tick Phase 18 L0 items in `checklist.md`, add Pass A items under Phase 15/17 where they belong.
- `docs/PROGRESS_LOG.md` entry; commit after Pass A and after Pass B separately (you approve each).

## Out of scope for this step
L1 workbench (next step, U4 first), Hindi-first Copilot suggestions (P6), retiring old dashboards (after L1).

---

**Ask:** confirm D1 (hybrid PFD), D2 (build consequence rules now), D3 (redirect only) — or override any — and I'll start Pass A.
