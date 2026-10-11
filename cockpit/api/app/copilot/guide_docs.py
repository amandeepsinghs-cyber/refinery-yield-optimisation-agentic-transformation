"""Beginner guides (owner, 11 Oct 2026): one dedicated guide per page, written for a reader with no prior knowledge, plus
the FCC basics, the models from zero and a glossary. Markdown files live in ./guides/<slug>.md. The web /explainer hub
and /explainer/<slug> pages read them through GET /api/explainer/..., and Gemini gets the guide for the page the
operator is on (plus the models guide), so the page and Gemini explain things in the same words."""
from __future__ import annotations

from pathlib import Path

GUIDES_DIR = Path(__file__).with_name("guides")
TOUR_PATH = Path(__file__).with_name("fcc_explainer.md")

# slug, title, one-line blurb, group (hub section), app page it explains (None = reference)
GUIDES: list[dict] = [
    {"slug": "basics", "title": "Start here: the FCC from zero", "group": "Start here", "page": None,
     "blurb": "What a refinery and the FCC do, the six sections, the catalyst loop and why quality is hard to know."},
    {"slug": "models", "title": "The models, from zero", "group": "Start here", "page": None,
     "blurb": "Bell curves, the four models (incl. Gaussian process and PINN), 'Not yet', anomaly detection and the optimiser."},
    {"slug": "tour", "title": "Quick tour (10 minutes)", "group": "Start here", "page": None,
     "blurb": "The whole demo on one page: follow the oil, read the screen, the nine decisions."},
    {"slug": "overview", "title": "How to read: Overview", "group": "Pages", "page": "/platform",
     "blurb": "The front page: layers, use cases and status words, a person decides."},
    {"slug": "architecture", "title": "How to read: Architecture", "group": "Pages", "page": "/architecture",
     "blurb": "Both views: platform & agents, and how your data comes in (Cortex Framework)."},
    {"slug": "whole-unit", "title": "How to read: FCC Whole unit", "group": "Pages", "page": "/twin",
     "blurb": "The FCC overview: what went wrong, the drawing, the pins and the four-step card."},
    {"slug": "unit-page", "title": "How a unit page works", "group": "Unit pages", "page": None,
     "blurb": "The layout every unit page shares, panel by panel."},
    {"slug": "furnace", "title": "How to read: Feed furnace", "group": "Unit pages", "page": "/twin/unit/unit_1_furnace",
     "blurb": "Preheating the feed; the preheat decision."},
    {"slug": "riser", "title": "How to read: Riser reactor", "group": "Unit pages", "page": "/twin/unit/unit_2_riser",
     "blurb": "Where the cracking happens; riser outlet temperature for this feed."},
    {"slug": "regenerator", "title": "How to read: Regenerator", "group": "Unit pages", "page": "/twin/unit/unit_3_regenerator",
     "blurb": "Burning coke off the catalyst; regenerator air and afterburn."},
    {"slug": "fractionator", "title": "How to read: Main fractionator", "group": "Unit pages", "page": "/twin/unit/unit_4_fractionator",
     "blurb": "Product quality: cut points, the model estimate between lab results, 'Not yet' and the extra lab sample."},
    {"slug": "gas-plant", "title": "How to read: Gas plant", "group": "Unit pages", "page": "/twin/unit/unit_5_condenser",
     "blurb": "Condensing the overhead; the overhead temperature target."},
    {"slug": "stabiliser", "title": "How to read: Stabiliser", "group": "Unit pages", "page": "/twin/unit/unit_6_stabiliser",
     "blurb": "Splitting LPG from light naphtha; C5 recovery."},
    {"slug": "decision-record", "title": "How to read: Decision record", "group": "Pages", "page": "/audit",
     "blurb": "Every Accept, Hold and Decline, and why nothing reaches the plant."},
    {"slug": "models-technical", "title": "Technical reference: the estimation models", "group": "Technical", "page": None,
     "blurb": "Exact inputs and outputs, libraries, training data, formulas for the spread, blending, lab correction and the move."},
    {"slug": "glossary", "title": "Glossary: every term in plain words", "group": "Reference", "page": None,
     "blurb": "Process, data and model terms, with where you see them in the app."},
]
BY_SLUG = {g["slug"]: g for g in GUIDES}


def guide_path(slug: str) -> Path | None:
    if slug == "tour":
        return TOUR_PATH
    if slug not in BY_SLUG:
        return None
    return GUIDES_DIR / f"{slug}.md"


def guide_md(slug: str) -> str | None:
    p = guide_path(slug)
    if p is None or not p.exists():
        return None
    return p.read_text(encoding="utf-8")


def index() -> list[dict]:
    """Hub listing: only guides whose file exists."""
    out = []
    for g in GUIDES:
        p = guide_path(g["slug"])
        if p is not None and p.exists():
            out.append(dict(g))
    return out


def slugs_for_page(page: str | None) -> list[str]:
    """Which guides explain the page the operator is on (most specific first)."""
    p = (page or "").split("?")[0].rstrip("/") or "/"
    if p.startswith("/explainer/"):
        s = p.split("/", 2)[2]
        return [s] if s in BY_SLUG else []
    if p.startswith("/twin/unit/"):
        own = [g["slug"] for g in GUIDES if g["page"] == p]
        extra = ["models-technical"] if p.endswith("unit_4_fractionator") else []
        return own + ["unit-page", *extra]
    return [g["slug"] for g in GUIDES if g["page"] == p] or (["tour"] if p in ("/", "/explainer") else [])


def gemini_context(page: str | None) -> str:
    """The guide(s) for this page plus the models guide, for the system prompt. Empty if no files are present."""
    parts = []
    for s in [*slugs_for_page(page), "models"]:
        md = guide_md(s)
        if md and s not in [x for x, _ in parts]:
            parts.append((s, md))
    return "\n\n".join(f"--- GUIDE: {s} ---\n{md}" for s, md in parts)
