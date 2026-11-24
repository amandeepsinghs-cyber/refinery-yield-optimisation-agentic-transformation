"""BDD-28 'Gemini knows which screen is open' (SDD-GEM-01..04) — no live Gemini call needed."""
from __future__ import annotations

import re

from app.copilot import adk_agent
from app.copilot.chat import screen_of, suggestions, system_instruction
from app.copilot.tools import DECLS, ToolBox

FIN = re.compile(r"[$€£₹]\s?\d|USD|EUR|NPV|ROI|payback|\bcost|budget|price|revenue|profit|savings?|monetary", re.I)


def test_screen_inference_from_route():
    s0 = screen_of({"page": "/twin"})
    assert (s0["level"], s0["unit_id"], s0["window_min"], s0.get("focus_unit")) == ("L0", None, 720, None)
    assert screen_of({"page": "/twin/unit/unit_4_fractionator"})["unit_id"] == "unit_4_fractionator"
    assert screen_of({"page": "/twin/unit/unit_4_fractionator"})["level"] == "L1"
    assert screen_of({"page": "/modelling/models"})["level"] == "other"
    # explicit screen wins, unknown unit degrades to L0
    assert screen_of({"page": "/x", "screen": {"level": "L1", "unit_id": "unit_9_bogus"}})["level"] == "L0"
    s1 = screen_of({"page": "/x", "screen": {"level": "L1", "unit_id": "unit_1_furnace", "window_min": 240}})
    assert (s1["level"], s1["unit_id"], s1["window_min"]) == ("L1", "unit_1_furnace", 240)
    # SDD-GEM-05: the pinned / hovered unit on L0 travels as focus_unit; it is dropped off L0
    assert screen_of({"page": "/twin", "screen": {"level": "L0", "focus_unit": "unit_4_fractionator"}})["focus_unit"] == "unit_4_fractionator"


def test_system_instruction_states_open_screen_and_embeds_snapshot():
    l0 = system_instruction({"page": "/twin", "time_min": 600})
    assert "OPEN SCREEN: Level 0 Refinery home" in l0
    assert "SCOPE SNAPSHOT" in l0
    assert "12. Screen fidelity" in l0 and "never say it is hidden" in l0  # guardrail from the 2026-10-02 Live transcript
    l1 = system_instruction({"page": "/twin/unit/unit_4_fractionator", "time_min": 600})
    assert "OPEN SCREEN: Level 1 Unit Workbench for Main fractionator (unit_4_fractionator)" in l1
    assert "unit_4_fractionator" in l1.split("SCOPE SNAPSHOT")[1][:3000]
    # whole-refinery questions stay allowed on L1
    assert "any other unit or the whole refinery" in l1
    for txt in (l0, l1):
        body = txt.split("GUARDRAILS")[0]
        assert not FIN.search(body.replace("No financial content", "")), "no financial wording in the scope block"


def test_suggestions_are_screen_specific_and_hindi_first():
    en_l1 = suggestions({"page": "/twin/unit/unit_3_regenerator"})
    assert any("regenerator" in s.lower() for s in en_l1)
    hi_l1 = suggestions({"page": "/twin/unit/unit_3_regenerator", "lang": "hi"})
    assert any("\u0915" <= ch <= "\u097f" for ch in "".join(hi_l1)), "Hindi suggestions in Devanagari"
    l0 = suggestions({"page": "/twin"})
    assert any("attention" in s.lower() for s in l0)
    assert suggestions({"page": "/decision/overview"})[1] == "Should we move the cut point now?"


def test_tools_declared_and_callable_with_fallback():
    names = {d[0] for d in DECLS}
    assert {"get_scope_snapshot", "get_regime", "get_recipe"} <= names
    tb = ToolBox({"page": "/twin", "time_min": 600})
    snap = tb.call("get_scope_snapshot", {})
    assert "error" not in snap and snap["screen"]["level"] == "L0"
    unit = tb.call("get_scope_snapshot", {"unit_id": "unit_4_fractionator"})
    assert unit["screen"]["unit_id"] == "unit_4_fractionator"
    reg = tb.call("get_regime", {})
    assert isinstance(reg, dict)   # engine payload or a clear error string
    rec = tb.call("get_recipe", {"unit_id": "unit_4_fractionator"})
    assert isinstance(rec, dict)
    if "gate" in rec and rec["gate"] == "WITHHELD":
        assert rec.get("moves") == [] and rec.get("gate_reason")


def test_adk_canonical_count_unchanged_and_extras_registered():
    assert len(adk_agent.root_agent.tools) == 8
    extra = {f.__name__ for f in adk_agent.ALL_TOOLS}
    assert {"get_scope_snapshot", "get_regime", "get_recipe"} <= extra


def test_live_language_follows_operator_lang():
    """SDD-GEM-04: Hindi / Hinglish operators get a hi-IN Live session; English defaults to en-IN."""
    from app.copilot.live import live_language_code
    assert live_language_code({"lang": "hi"}) == "hi-IN"
    assert live_language_code({"lang": "hinglish"}) == "hi-IN"
    assert live_language_code({"lang": "en"}) == "en-IN"
    assert live_language_code({}) == "en-IN"


def test_screen_carries_visible_panels_and_highlight_on_l1_only():
    """Pass I leftover: the page sends the chart panels on screen + the deep-linked one; the prompt names them."""
    ctx = {"page": "/twin/unit/unit_4_fractionator", "run_id": "random_s144", "time_min": 600,
           "screen": {"level": "L1", "unit_id": "unit_4_fractionator", "window_min": 720,
                      "panel_ids": ["quality", "residual", "mv", "disturbance", "yield"], "highlighted_panel": "residual"}}
    sc = screen_of(ctx)
    assert sc["panel_ids"] == ["quality", "residual", "mv", "disturbance", "yield"]
    assert sc["highlighted_panel"] == "residual"
    si = system_instruction(ctx)
    assert "CHART PANELS ON SCREEN" in si and "'residual' panel" in si
    # L0 never carries panels, even if a stale client sends them
    sc0 = screen_of({"page": "/twin", "screen": {"level": "L0", "panel_ids": ["quality"]}})
    assert "panel_ids" not in sc0


def test_decision_math_lookup_rebuttal_and_live_voice_rules():
    """current_feedback.md regression checks: anti-sycophancy on crude lookup tables, 4-step math, adaptive voice depth,
    ambient-chatter guard, and /api/live lang query parameter forwarding."""
    import inspect
    from app.copilot.live import VOICE_EXTRA, live_config
    from app.main import live as live_endpoint

    si = system_instruction({"page": "/twin/unit/unit_4_fractionator", "run_id": "random_s144", "time_min": 600})
    assert "NEVER agree if the user suggests that crude or feed classification sets the initial cut point" in si
    assert "15. End-to-end decision math & why ML beats a static crude lookup table" in si
    assert "tank-blended VGO" in si and "8-hour lab blind spot" in si
    assert "Do NOT call open_screen for greetings, conceptual questions" in si
    g14_onward = si.split("14. Feed and heat balance")[1]
    assert not FIN.search(g14_onward), "no financial wording in guardrails 14–15"

    # Voice mode lifts the 3-sentence cap for how/math/why-ML/story questions and guards against background chatter
    assert "4–6 sentence step-by-step spoken walkthrough" in VOICE_EXTRA
    assert "off-topic background speech" in VOICE_EXTRA
    assert not FIN.search(VOICE_EXTRA), "no financial wording in VOICE_EXTRA"

    cfg_hi = live_config({"page": "/twin", "lang": "hinglish"}, with_tools=False)
    assert cfg_hi.speech_config.language_code == "hi-IN"
    assert "4–6 sentence step-by-step spoken walkthrough" in cfg_hi.system_instruction

    # /api/live endpoint accepts `lang` query param so browser language reaches live_ws()
    sig = inspect.signature(live_endpoint)
    assert "lang" in sig.parameters

    # Explainer demo-flow guide is first in 'Start here', served by guide_docs, linked from fcc_explainer.md, and money-free
    from app.copilot import guide_docs
    from app.copilot.chat import EXPLAINER_MD
    idx = guide_docs.index()
    assert idx[0]["slug"] == "demo-flow" and idx[0]["group"] == "Start here"
    demo_md = guide_docs.guide_md("demo-flow")
    assert demo_md and "lookup table" in demo_md and "random_s144" in demo_md
    assert "/explainer/demo-flow" in EXPLAINER_MD
    assert not FIN.search(demo_md), "no financial wording in demo-flow.md"
    assert not FIN.search(EXPLAINER_MD), "no financial wording in fcc_explainer.md"


def test_live_voice_slim_prompt_tools_and_singleton_client():
    """Urvi/Yukti latency parity checks: compact voice prompt (<12 KB), slim voice toolset, session resumption &
    sliding-window compression, and singleton genai.Client reuse."""
    from app.copilot.chat import VOICE_TOUR_SUMMARY, get_genai_client
    from app.copilot.live import live_config
    from app.copilot.tools import VOICE_TOOL_NAMES, declarations, voice_declarations

    full_si = system_instruction({"page": "/twin/unit/unit_4_fractionator", "run_id": "random_s144", "time_min": 600}, with_guides=True)
    voice_si = system_instruction({"page": "/twin/unit/unit_4_fractionator", "run_id": "random_s144", "time_min": 600}, with_guides=False)
    assert len(voice_si) < len(full_si) * 0.45, f"voice prompt should be <45% of full prompt ({len(voice_si)} vs {len(full_si)})"
    assert "SCOPE SNAPSHOT" in voice_si and "15. End-to-end decision math" in voice_si
    assert not FIN.search(VOICE_TOUR_SUMMARY), "no financial wording in VOICE_TOUR_SUMMARY"

    all_decls = declarations()[0].function_declarations
    v_decls = voice_declarations()[0].function_declarations
    assert len(v_decls) == len(VOICE_TOOL_NAMES) < len(all_decls)

    cfg = live_config({"page": "/twin", "lang": "en"}, with_tools=True)
    assert cfg.session_resumption is not None
    assert cfg.context_window_compression is not None
    assert len(cfg.tools[0].function_declarations) == len(VOICE_TOOL_NAMES)

    assert get_genai_client() is get_genai_client()
