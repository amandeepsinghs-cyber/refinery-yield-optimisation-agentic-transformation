"""UI and demo-flow guide for the Gemini Copilot — the pages the cockpit actually has.

Injected into `system_instruction(ctx)` in `chat.py` so the user can ask Gemini on any page:
- "What does this page show? What do the curves, bands and buttons mean?"
- "What is the demo flow / what should I click next?"

6 Oct 2026: rewritten after the legacy Decision / Technical / Modelling dashboards and Settings were removed. The cockpit
now has: Overview (/platform), Architecture (/architecture), FCC Complex (/twin), six unit pages (/twin/unit/<unit_id>), Decision record (/audit), and
the Knowledge library (/knowledge), which opens from Gemini's source links. Never send the user to any other page.
"""
from __future__ import annotations

PAGE_GUIDES: dict[str, str] = {
    "/platform": (
        "CURRENT PAGE: Overview (/platform), the opening page.\n"
        "- 'The refinery — and where your use cases fit': crude & tankage → crude unit (CDU/VDU) → reformer, hydrotreaters, "
        "FCC (fed heavy gas oil, not crude), coker, LPG & alkylation → blending & dispatch, with utilities & flare underneath. "
        "IOCL's use cases are pins on the step where IOCL named them, each with a status dot: Interactive (green), Scripted outcome "
        "(amber), Partly (yellow), Watch only (ring), Not claimed (hollow). 'FCC equivalent' means IOCL named a unit we do not "
        "have and the same problem is shown on the FCC. Click a pin for IOCL's wording, what we built and a link to the unit. "
        "Click FCC to open the FCC Complex.\n"
        "- 'Decisions the platform enables (9)': expandable; rows D4, D6, D8, D5, D1, D2, D9, D3, D7 in the order the oil meets "
        "them. Each card: pain point, how we solve it, how it works (1 data in, 2 algorithms in order, 3 checks before advising, "
        "4 what the operator gets, 5 on your plant, 6 what we need from you), IOCL use cases, and a link to the unit.\n"
        "- Header: one specialist agent per use case on one refinery lakehouse; Gemini brings their advice to one screen "
        "where a person decides. The demo shows what we are building, on simulated FCC data; do not say that agents are "
        "'working today'. Link to the Architecture tab.\n"
        "- 'What the FCC makes — by molecule size and boiling range': LPG C3–C4 (below ~90 °F), light naphtha C5–C7 "
        "(~90–300 °F), heavy naphtha C7–C12 (~300–430 °F), LCO C12–C20 (~430–650 °F), slurry C20+ (above ~650 °F), in °F and °C; "
        "a cut point is where one product ends and the next begins; T98 is the temperature at which 98 % has boiled (the heavy "
        "end, what the spec limits). The soft sensor estimates HN and LCO T98. Ranges are typical; the simulated FCC cuts "
        "heavier (LCO T98 ~755 °F, HN T98 ~530 °F). The same table sits in step ① of the Fractionator page.\n"
        "- Below that: use-case cards — IOCL use case → its agent (Soft-sensor, Furnace, Regenerator, "
        "Light-ends, Systems; same names as the Architecture tab) → the models under it in small print → the decision on screen.\n"
        "- 'How an agent works': 1 models produce the numbers (statistical, hybrid, PINN, Gaussian process, response models, "
        "constrained optimiser; deterministic); 2 the agent checks them against SOP limits, history and past decisions and "
        "recommends, or says 'Not yet'; 3 Gemini orchestrates, explains and cites the SOP (read-only; numbers never come "
        "from the language model); 4 a person decides.\n"
        "- Then the decisions panel, 'A person decides — every time' (advisory only), the MeitY-compliant boundary (data "
        "stays in India under keys IOCL holds; control and safety systems stay on site and nothing is written to them; do "
        "not go into Category A / B), and 'How it learns and proves itself' (predict, decide, measure, learn).\n"
        "- What is used in this build: a feed-quality model (feed-change detection, feed API soft sensor, novelty check, feed class), a four-model soft sensor "
        "(Bayesian ridge, hybrid physics + ML, PINN ensemble, Gaussian process), anomaly detection on every unit (±3σ, "
        "CUSUM; statistical), response models, a constrained optimiser, a rule-based consequence check, and Gemini."
    ),
    "/architecture": (
        "CURRENT PAGE: Target architecture (/architecture). This page shows the TARGET we build with IOCL, not the build; "
        "every part is marked In the demo (runs in the demo, on simulated data), Preview (visible, outcome scripted and labelled) or Next "
        "(built once the data foundation is in place).\n"
        "- Four layers, top to bottom: L4 one operator screen where a person decides (Accept / Hold / Decline, decision "
        "record); L3 Gemini orchestrator (plain words in English, Hinglish, Hindi, text or voice; calls the right agents; "
        "cites the SOP; read-only); L2 specialist agents, one per use case; L1 one refinery lakehouse. L1 shows four ingest "
        "routes: only historian readings stream (one-way gateway → Pub/Sub, which carries raw readings unfiltered → "
        "Dataflow, which writes raw readings to bronze, flagged 1-minute summaries to silver, and the same readings to "
        "Bigtable, the live store each agent reads every minute (last 7–30 days; BigQuery keeps the history for training; no Bigtable in the demo); Next); LIMS, crude assays and "
        "schedule load on a schedule (Cloud Composer, Next); SOPs and documents are turned into text (Document AI only for scanned pages, Next), split into "
        "sections and embedded (Vertex AI embeddings, In the demo) into a knowledge index that Gemini searches with "
        "BigQuery vector search (RAG); decisions are written straight in by the operator screen. Zones: bronze (Parquet "
        "files), silver (Apache Iceberg tables via BigLake), gold (BigQuery tables), knowledge (vector search). Dataplex "
        "checks silver after every load (Next). The data is portable (Parquet, Iceberg); the BigQuery engine is "
        "Google-specific. Under the diagram: a glossary of every service with a one-line purpose. Right column, Identity "
        "& access on every layer (part of the design): every agent has its own "
        "identity (Cloud IAM) and reads only its unit's data (enforced by BigQuery row- and column-level security by unit; "
        "not enforced in the demo, where agents share one service), writes only its advice, has no path to the DCS; Gemini has its "
        "own identity and cannot change anything; people sign in with IOCL's own login through Identity-Aware Proxy and act by "
        "role (board operator: Accept / Hold / Decline on own unit; shift / process engineer: all units and the decision "
        "record; management: read-only; platform admin); customer-managed keys (Cloud KMS); a VPC Service Controls perimeter; "
        "Cloud Audit Logs. MeitY-compliant boundary: the data stays in India under keys IOCL holds; control and "
        "safety systems stay on site and nothing is written to them. Do not go into Category A / B on this page.\n"
        "- Agents: soft-sensor agent (IOCL #1, #11; In the demo, interactive); furnace, regenerator, light-ends and systems agents (Preview); coker, CDU/VDU, alkylation, "
        "utilities & flare agents (Next). Feedstock evaluation is not on IOCL's use-case list: do not present it as a use case; when the FCC feed changes after a crude switch, the feed model detects the change and estimates the new feed's API gravity; the soft sensor resets its lab bias and checks it has lab results for this feed, and the recipe and preheat target follow the new feed estimate. The crude family is context only. The soft-sensor model weights come from each model's accuracy on recent lab results (else held-out runs), never from the crude; Bayesian ridge has weight 0 (reference only). Vertex AI for training and serving each agent's models is Next.\n"
        "- If asked what is built: the demo runs these as separate modules inside one service on simulated data; "
        "Gemini 2.5 Flash calls the platform's tools. Never say an agent is 'live' or 'working': nothing is deployed on a plant. Below: a collapsed agent ↔ use case table."
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
        "- Step ② What we observe: anomaly detection (measured vs expected for this feed, ±3σ band, CUSUM), the feed model "
        "(① is the feed changing and how far through, ② estimated feed API with its band, ③ novelty: is this feed outside the training data, ④ feed class derived from the API; the crude family is a context line only), on U2/U3 catalyst-to-oil shown as a result (never advised), and on U4 the four-model soft sensor with its bell curves "
        "and the estimate between lab samples.\n"
        "- Step ③ Decision and lever: the move (from → to), chance on spec before → after, and Accept / Hold / Decline. "
        "'Try another move' is a slider over set-point moves. On the cut-point decisions the chart has one solid bell (the product "
        "now, or after your move) and one dotted bell at the target (LCO T98 755.3 °F, HN T98 530.3 °F); slide to line them up. A "
        "small green tick above the curve and the words 'On target' appear when the estimate is within 1 °F of the target. The "
        "response is assumed 1 : 1 with the set point (a default: the history has no designed set-point moves). Moves above the "
        "5 °F SOP step are shown as two moves 30 min apart. When the checks fail it says 'Not yet' with the reason, or asks for an "
        "extra lab sample.\n"
        "- 'Full explanation' (expandable): the data in (columns and their values at this minute), each model's inputs and fitted "
        "formula, its estimate and weight (ridge reference only; hybrid, PINN ×5 and GP weighted by accuracy), the checks, and how "
        "the move was chosen (toward the target, never below 95 % chance on spec, ≤ 5 °F per SOP step).\n"
        "- Step ④ How the move is found: the chain of steps (anomaly detection, soft sensor, feed model, trust checks, "
        "optimiser, consequence check, Gemini), the checks before advising, and what set the size of the move.\n"
        "- Status words: Interactive = the models really run, on simulated data (nothing is deployed on a plant); Scripted outcome = the size of the move is scripted on real "
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
- Overview (/platform): the refinery and where IOCL's use cases fit; use case → its agent → decision; how an agent works (models → agent → Gemini → person); person in the loop; MeitY line.
- Architecture (/architecture): the target — one lakehouse, one agent per use case, Gemini on top, one screen.
- FCC Complex (/twin), run random_s107 at 10:00: what went wrong; decision pins.
- Follow the oil at s107 10:00: U4 step ② feed model (the new feed settled; D4 appears only while the feed is changing, e.g. s107 07:20) → U1 preheat (D6) → U2 riser watch (D8) →
  U3 regenerator air (D5, scripted) → U4 step ③ D1 interactive cut-point move, Accept → U5/U6 overhead target (D7, scripted) →
  back to FCC Complex for the whole-unit effect.
- Stress tests on U4: run random_s144 at 10:00 (held-out run), then 12:00 'Not yet' (spread above 14 °F) → pull a sample,
  Ask Gemini. Then the Decision record (/audit).
- Close on /platform: what is interactive, what is scripted, what is not built; the pilot ask.
Only these pages exist: /platform, /architecture, /twin, /twin/unit/<unit_id>, /audit, /knowledge.
"""


def page_guide_for(page: str | None) -> str:
    p = (page or "/platform").rstrip("/") or "/platform"
    if p.startswith("/knowledge/"):
        p = "/knowledge"
    elif p.startswith("/twin/unit/"):
        p = "/twin/unit"
    guide = PAGE_GUIDES.get(p, PAGE_GUIDES["/platform"])
    return f"{guide}\n\n{DEMO_FLOW_SUMMARY}"
