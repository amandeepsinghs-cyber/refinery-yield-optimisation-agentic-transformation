"""Text copilot (SDD §7.6): Gemini on Vertex AI via google-genai, streaming, manual function-calling loop.

Plain google-genai (not ADK) with a manual tool loop; the session is stateless on the server (the client sends
the message history each turn, SDD-COP-04 simplified)."""
from __future__ import annotations

import json
import re
from typing import AsyncIterator

from ..config import get_settings
from ..knowledge.index import CITE_RE
from ..state import get_state
from .tools import ToolBox, declarations, model_labels

MAX_TOOL_ROUNDS = 6


def system_instruction(ctx: dict) -> str:
    s = get_settings()
    return f"""You are the FCC soft-sensor Decision Cockpit copilot for a TECHNICAL DEMO on SIMULATED data (Octave FCC +
fractionator simulator). You help operators and engineers understand LCO T98 (LCO_T98_F) and heavy-naphtha T98 (HN_T98_F)
estimates, their uncertainty, the Distribution Spread Gate and cut-point recommendations.

Page context: page={ctx.get('page')}, run_id={ctx.get('run_id')}, property={ctx.get('property')}, time_min={ctx.get('time_min')}.
Models: {model_labels()}. Spec (placeholders): LCO T98 <= {s.spec_max('LCO_T98_F'):.0f} °F, HN T98 <= {s.spec_max('HN_T98_F'):.0f} °F;
R = {s.R:.0f} °F; W90 limit = {s.w90_max:.0f} °F.

GUARDRAILS (mandatory):
1. Read-only advisor. You have no write tools. Accept/Decline is a human action in the UI. Refuse any request to write to,
   change or command a DCS/MPC/control system, and say the cockpit is advisory only.
2. Before giving any advice or set-point suggestion, call get_gate_status for the property. If the gate status is WITHHELD,
   quote the gate `message` VERBATIM (exactly as returned, in its own paragraph) and do NOT propose or imply any set point
   or set-point move.
3. Every number you state must come from a tool result in this same turn. Never estimate or invent numbers. If a tool
   does not provide it, say it is not available.
4. Values of LCO_T98_F / HN_T98_F columns and `truth` fields are SIMULATOR TRUTH: always label them "simulator truth".
5. Cite documents from search_documents/get_document as [DOC-ID rN §x.y] (e.g. [SOP-FRAC-003 r4 §4.2]) using the returned
   doc_id, revision and section. Only cite results with above_threshold=true. If no document supports a statement, write
   "No cited source".
6. No financial content: never mention money, cost, price, value, savings, NPV, ROI or currency. Technical units only.
7. Be concise and decision-first: answer in the first sentence, then the supporting numbers. Use short markdown.
8. Use make_chart only with numbers returned by tools in this turn."""


def _sse(event: str, data) -> str:
    return f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n"


def suggestions(ctx: dict) -> list[str]:
    page = (ctx.get("page") or "")
    base = ["Is the gate PASS right now, and why?", "Explain what drives the current estimate",
            "How do the four models compare on held-out data?"]
    if "decision" in page:
        base = ["Should we move the cut point now?", "Why was the last recommendation withheld?", "Draft a shift handover"]
    elif "technical" in page:
        base = ["What happened around the last event?", "Show T_tray13_F and the LCO estimate over the last 60 min",
                "Which inputs are outside the training envelope?"]
    elif "modelling" in page:
        base = ["Which models are admitted and why?", "Are the distributions calibrated?", "Show GPR feature relevance"]
    return base


def _client():
    from google import genai
    g = get_settings()["gemini"]
    return genai.Client(vertexai=True, project=g["project"], location=g["location"])


async def chat_stream(messages: list[dict], ctx: dict) -> AsyncIterator[str]:
    from google.genai import types
    st = get_state()
    ctx = dict(ctx or {})
    tb = ToolBox(ctx)
    ctx.setdefault("run_id", tb.run_id)
    ctx.setdefault("property", tb.prop)
    contents = []
    for m in messages or []:
        role = "model" if m.get("role") in ("assistant", "model") else "user"
        txt = m.get("content") or ""
        if txt:
            contents.append(types.Content(role=role, parts=[types.Part(text=txt)]))
    if not contents:
        yield _sse("error", {"message": "empty message"})
        yield _sse("done", {})
        return
    cfg = types.GenerateContentConfig(
        system_instruction=system_instruction(ctx), tools=declarations(), temperature=0.2,
        thinking_config=types.ThinkingConfig(include_thoughts=True, thinking_budget=1024),
        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True))
    final_text = ""
    try:
        client = _client()
        model = st.s["gemini"]["text_model"]
        for _round in range(MAX_TOOL_ROUNDS + 1):
            parts_acc, calls = [], []
            stream = await client.aio.models.generate_content_stream(model=model, contents=contents, config=cfg)
            async for chunk in stream:
                if not chunk.candidates:
                    continue
                c = chunk.candidates[0].content
                if not c or not c.parts:
                    continue
                for p in c.parts:
                    parts_acc.append(p)
                    if p.function_call:
                        calls.append(p.function_call)
                    elif p.text and p.thought:
                        yield _sse("thought", {"text": p.text})
                    elif p.text:
                        final_text += p.text
                        yield _sse("final", {"delta": p.text})
            if not calls:
                break
            contents.append(types.Content(role="model", parts=parts_acc))
            resp_parts = []
            for fc in calls:
                args = dict(fc.args or {})
                yield _sse("tool_call", {"name": fc.name, "args": args})
                n_charts = len(tb.charts)
                result = tb.call(fc.name, args)
                if "error" in result:
                    yield _sse("thought", {"text": f"Tool {fc.name} returned an error: {result['error']}"})
                for fig in tb.charts[n_charts:]:
                    yield _sse("chart", {"figure": fig})
                resp_parts.append(types.Part.from_function_response(name=fc.name, response={"result": result}))
            contents.append(types.Content(role="user", parts=resp_parts))
        else:
            yield _sse("final", {"delta": "\n\n_Stopped after the maximum number of tool rounds._"})
    except Exception as e:  # noqa: BLE001
        yield _sse("error", {"message": f"Copilot error: {str(e)[:300]}. Please retry."})
    seen = set()
    for m in CITE_RE.finditer(final_text):
        key = m.group(0)
        if key in seen:
            continue
        seen.add(key)
        d = st.knowledge.docs.get(m.group(1))
        yield _sse("citation", {"doc_id": m.group(1), "revision": int(m.group(2)), "section": m.group(3),
                                "title": d["meta"].get("title") if d else None, "resolved": d is not None})
    yield _sse("suggestion", {"items": suggestions(ctx)})
    yield _sse("done", {})
