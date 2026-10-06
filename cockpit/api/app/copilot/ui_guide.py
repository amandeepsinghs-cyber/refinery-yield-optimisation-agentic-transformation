"""UI and demo-flow guide for the Gemini Copilot — the pages the cockpit actually has.

Injected into `system_instruction(ctx)` in `chat.py` so the user can ask Gemini on any page:
- "What does this page show? What do the curves, bands and buttons mean?"
- "What is the demo flow / what should I click next?"

6 Oct 2026: rewritten after the legacy Decision / Technical / Modelling dashboards and Settings were removed. The cockpit
now has: Overview (/platform), FCC Complex (/twin), six unit pages (/twin/unit/<unit_id>), Decision record (/audit), and
the Knowledge library (/knowledge), which opens from Gemini's source links. Never send the user to any other page.
"""
from __future__ import annotations

PAGE_GUIDES: dict[str, str] = {
    "/platform": (
        "CURRENT PAGE: Overview (/platform), the opening page.\n"
        "- 'The refinery — and where your use cases fit': crude & tankage → crude unit (CDU/VDU) → reformer, hydrotreaters, "
        "FCC (fed heavy gas oil, not crude), coker, LPG & alkylation → blending & dispatch, with utilities & flare underneath. "
        "IOCL's use cases are pins on the step where IOCL named them, each with a status dot: Live (green), Scripted outcome "
        "(amber), Partly (yellow), Watch only (ring), Not claimed (hollow). 'FCC equivalent' means IOCL named a unit we do not "
        "have and the same problem is shown on the FCC. Click a pin for IOCL's wording, what we built and a link to the unit. "
        "Click FCC to open the FCC Complex.\n"
        "- 'Decisions the platform enables (9)': expandable; rows D4, D6, D8, D5, D1, D2, D9, D3, D7 in the order the oil meets "
        "them. Each card: pain point, how we solve it, how it works (1 data in, 2 algorithms in order, 3 checks before advising, "
        "4 what the operator gets, 5 on your plant, 6 what we need from you), IOCL use cases, and a link to the unit.\n"
        "- Below: six layers (lakehouse → data processing → models → detect, check and propose → decisions with a person in the "
        "loop → whole refinery), the use-case cards (what answers each use case), 'A person decides — every time', the MeitY data "
        "boundary, how it learns, and the proof loop (predict, decide, measure, learn).\n"
        "- What is used: crude classifier (Bayesian/Gaussian, 15-min confirmation), a four-model soft sensor (Bayesian ridge, "
        "hybrid physics + ML, PINN ensemble, Gaussian process), anomaly detection on every unit (±3σ, CUSUM; statistical), "
        "response models, a constrained optimiser, a rule-based consequence check, and Gemini. Not one agent per use case."
    ),
    "/twin": (
        "CURRENT PAGE: FCC Complex (/twin), the six FCC units as one system.\n"
        "- The plant picture shows furnace → riser → regenerator → fractionator → gas plant → stabiliser with decision pins "
        "(Decide / Watch) on the unit that owns each decision, and 'what went wrong' on this shift.\n"
        "- Picking a decision shows its unit, the move or watch item, and the consequence in the next units. The shift timeline "
        "shows when each event happened. Click a unit to open its page.\n"
        "- Nothing is written to the control system; every Accept / Hold / Decline goes to the Decision record."
    ),
    "/twin/unit": (
        "CURRENT PAGE: a unit page (/twin/unit/<unit_id>): U1 Furnace, U2 Riser, U3 Regenerator, U4 Fractionator, "
        "U5 Gas plant, U6 Stabiliser.\n"
        "- Step ① Data in / out: the tags this unit reads and the products it sends on.\n"
        "- Step ② What we observe: anomaly detection (measured vs expected for this crude, ±3σ band, CUSUM), which crude is "
        "running (crude classifier, with confidence and switch time), and on U4 the four-model soft sensor with its bell curves "
        "and the estimate between lab samples.\n"
        "- Step ③ Decision and lever: the move (from → to), chance on spec before → after, and Accept / Hold / Decline. "
        "'Try another move' shows the response model. When the checks fail it says 'Not yet' with the reason, or asks for an "
        "extra lab sample.\n"
        "- Step ④ How the move is found: the chain of steps (anomaly detection, soft sensor, crude-regime model, trust checks, "
        "optimiser, consequence check, Gemini), the checks before advising, and what set the size of the move.\n"
        "- Status words: Live = real models on simulator data; Scripted outcome = the size of the move is scripted on real "
        "simulator inputs; Watch only = no move is proposed."
    ),
    "/knowledge": (
        "CURRENT PAGE: Knowledge library (/knowledge), opened from a Gemini source link.\n"
        "- 46 SIMULATED refinery documents: SOP, IOW, LAB, WO, INC, MOC, SHIFT and REF. The reader opens the full document at the "
        "cited section (§x.y); related records for the run are listed alongside."
    ),
    "/audit": (
        "CURRENT PAGE: Decision record (/audit).\n"
        "- Every Accept / Hold / Decline and every time advice was held back ('Not yet'), with time, unit, decision, move and "
        "reason. Advisory only; nothing is sent to the plant."
    ),
}

DEMO_FLOW_SUMMARY = """
DEMO FLOW (demoflow.md, 6 Oct — story of a refinery, then follow the oil):
- Overview (/platform): the refinery and where IOCL's use cases fit; the decisions; six layers; person in the loop; MeitY.
- FCC Complex (/twin), run random_s107 at 10:00: what went wrong; decision pins.
- Follow the oil at s107 10:00: U4 step ② which crude (D4, scripted) → U1 preheat (D6) → U2 riser watch (D8) →
  U3 regenerator air (D5, scripted) → U4 step ③ D1 live cut-point move, Accept → U5/U6 overhead target (D7, scripted) →
  back to FCC Complex for the whole-unit effect.
- Stress tests on U4: run random_s144 at 10:00 (held-out run), then 12:00 'Not yet' (spread above 14 °F) → pull a sample,
  Ask Gemini. Then the Decision record (/audit).
- Close on /platform: what is live, what is scripted, what is not built; the pilot ask.
Only these pages exist: /platform, /twin, /twin/unit/<unit_id>, /audit, /knowledge.
"""


def page_guide_for(page: str | None) -> str:
    p = (page or "/platform").rstrip("/") or "/platform"
    if p.startswith("/knowledge/"):
        p = "/knowledge"
    elif p.startswith("/twin/unit/"):
        p = "/twin/unit"
    guide = PAGE_GUIDES.get(p, PAGE_GUIDES["/platform"])
    return f"{guide}\n\n{DEMO_FLOW_SUMMARY}"
