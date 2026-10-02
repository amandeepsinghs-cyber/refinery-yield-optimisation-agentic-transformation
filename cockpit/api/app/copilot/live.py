"""Live voice copilot: WebSocket proxy to the Gemini Live API on Vertex AI (contract §7).

Browser <-> this server (JSON messages) <-> Gemini Live (client.aio.live.connect). Credentials (ADC) stay server-side.
Tool calls from the model are executed server-side with the same read-only ToolBox and guardrails as text chat."""
from __future__ import annotations

import asyncio
import base64
import logging
import time

from fastapi import WebSocket, WebSocketDisconnect

from ..config import get_settings
from ..knowledge.index import CITE_RE
from ..state import get_state
from .chat import system_instruction
from .tools import ToolBox, declarations

logger = logging.getLogger(__name__)

VOICE_EXTRA = """
VOICE MODE: answer in at most three short spoken sentences, then offer more detail. Speak numbers with units
(degrees Fahrenheit). When the gate is WITHHELD, read the gate message verbatim. When citing, say the document ID,
revision and section, e.g. "SOP FRAC 003 revision 4 section 4.2"."""


def _client():
    from google import genai
    g = get_settings()["gemini"]
    return genai.Client(vertexai=True, project=g["project"], location=g["location"])


LIVE_LANGUAGE = {"hi": "hi-IN", "hindi": "hi-IN", "hinglish": "hi-IN", "en": "en-IN"}


def live_language_code(ctx: dict) -> str:
    """Speech language for the Live session (SDD-GEM-04): Hindi / Hinglish → hi-IN, otherwise Indian English."""
    return LIVE_LANGUAGE.get(str(ctx.get("lang") or "en").lower(), "en-IN")


def live_config(ctx: dict, with_tools: bool = True):
    from google.genai import types
    g = get_settings()["gemini"]
    kw = dict(response_modalities=[types.Modality.AUDIO],
              system_instruction=system_instruction(ctx) + VOICE_EXTRA,
              input_audio_transcription=types.AudioTranscriptionConfig(),
              output_audio_transcription=types.AudioTranscriptionConfig())
    speech = {"language_code": live_language_code(ctx)}
    if g.get("voice"):
        speech["voice_config"] = types.VoiceConfig(prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=g["voice"]))
    kw["speech_config"] = types.SpeechConfig(**speech)
    if with_tools:
        kw["tools"] = declarations()
    return types.LiveConnectConfig(**kw)


async def _probe_one(model: str, timeout: float = 30.0) -> tuple[bool, str]:
    from google.genai import types
    client = _client()

    async def go():
        cfg = types.LiveConnectConfig(response_modalities=[types.Modality.AUDIO],
                                      output_audio_transcription=types.AudioTranscriptionConfig())
        async with client.aio.live.connect(model=model, config=cfg) as s:
            await s.send_client_content(turns=types.Content(role="user", parts=[types.Part(text="Say OK.")]), turn_complete=True)
            nbytes, tx = 0, ""
            async for m in s.receive():
                sc = m.server_content
                if sc and sc.model_turn:
                    for p in sc.model_turn.parts or []:
                        if p.inline_data and p.inline_data.data:
                            nbytes += len(p.inline_data.data)
                if sc and sc.output_transcription and sc.output_transcription.text:
                    tx += sc.output_transcription.text
                if sc and sc.turn_complete:
                    break
            return nbytes, tx
    try:
        nbytes, tx = await asyncio.wait_for(go(), timeout)
        return True, f"{nbytes} bytes audio, transcript '{tx.strip()[:60]}'"
    except Exception as e:  # noqa: BLE001
        return False, str(e)[:200]


async def probe_all() -> None:
    """Startup probe: one text call and one Live connect; picks the first working Live model."""
    st = get_state()
    g = st.s["gemini"]
    notes = []
    t0 = time.time()
    try:
        client = _client()            # keep a reference: a temporary client is closed before the call completes
        r = await client.aio.models.generate_content(model=g["text_model"], contents="Reply with the single word OK.")
        text_ok = bool(r.text)
        notes.append(f"text {g['text_model']}: OK ({(r.text or '').strip()[:20]})")
    except Exception as e:  # noqa: BLE001
        text_ok = False
        notes.append(f"text {g['text_model']}: FAILED {str(e)[:200]}")
    live_ok = False
    cands = [g["live_model"]] + [m for m in g.get("live_fallbacks", []) if m != g["live_model"]]
    for m in cands:
        ok, info = await _probe_one(m)
        if ok:
            st.gemini["live_model"] = m
            live_ok = True
            notes.append(f"live {m}: OK ({info})")
            break
        notes.append(f"live {m}: FAILED {info}")
    st.gemini.update(ok=text_ok and live_ok, text_ok=text_ok, live_ok=live_ok, note="; ".join(notes),
                     probed_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), probe_s=round(time.time() - t0, 1))


async def live_ws(ws: WebSocket, ctx: dict) -> None:
    from google.genai import types
    await ws.accept()
    st = get_state()
    tb = ToolBox(ctx)
    ctx = {**ctx, "run_id": tb.run_id, "property": tb.prop}
    model = st.gemini.get("live_model") or st.s["gemini"]["live_model"]
    try:
        client = _client()            # keep a reference for the whole session
        session_cm = client.aio.live.connect(model=model, config=live_config(ctx))
        session = await session_cm.__aenter__()
    except Exception as e:  # noqa: BLE001
        await ws.send_json({"type": "error", "message": f"Live connect failed for {model}: {str(e)[:300]}"})
        await ws.close()
        return
    await ws.send_json({"type": "ready", "model": model})
    user_tx, model_tx = [], []

    async def upstream():
        from .chat import screen_block
        while True:
            msg = await ws.receive_json()
            typ = msg.get("type")
            if typ == "audio" and msg.get("data"):
                await session.send_realtime_input(audio=types.Blob(data=base64.b64decode(msg["data"]),
                                                                   mime_type="audio/pcm;rate=16000"))
            elif typ == "text" and msg.get("text"):
                await session.send_client_content(turns=types.Content(role="user", parts=[types.Part(text=msg["text"])]),
                                                  turn_complete=True)
            elif typ == "context" and isinstance(msg.get("screen"), dict):
                # SDD-GEM-04: the UI pushes what is rendered (and the route) after `ready` and whenever it changes.
                # Injected as user content without completing the turn, so the model has it for the next question
                # but does not answer the update itself.
                try:
                    cctx = {**ctx, "page": msg.get("page") or ctx.get("page"), "time_min": msg.get("time_min", ctx.get("time_min")),
                            "screen": msg["screen"], "lang": msg.get("lang") or ctx.get("lang")}
                    block = screen_block(cctx)
                    await session.send_client_content(
                        turns=types.Content(role="user", parts=[types.Part(text=f"[SCREEN CONTEXT UPDATE — do not reply to this message; "
                                                                                 f"use it for the operator's next question]\n{block}")]),
                        turn_complete=False)
                except Exception as e:  # noqa: BLE001 - never let a context update break the voice session
                    logger.warning("live context update ignored: %s", str(e)[:120])
            elif typ == "end":
                await session.send_realtime_input(audio_stream_end=True)
            elif typ == "close":
                return

    async def downstream():
        while True:
            async for m in session.receive():
                sc = m.server_content
                if sc:
                    if sc.model_turn:
                        for p in sc.model_turn.parts or []:
                            if p.inline_data and p.inline_data.data:
                                await ws.send_json({"type": "audio", "data": base64.b64encode(p.inline_data.data).decode()})
                    if sc.input_transcription and sc.input_transcription.text:
                        user_tx.append(sc.input_transcription.text)
                        await ws.send_json({"type": "transcript", "role": "user", "text": sc.input_transcription.text, "final": False})
                    if sc.output_transcription and sc.output_transcription.text:
                        model_tx.append(sc.output_transcription.text)
                        await ws.send_json({"type": "transcript", "role": "model", "text": sc.output_transcription.text, "final": False})
                    if sc.interrupted:
                        await ws.send_json({"type": "interrupted"})
                    if sc.turn_complete:
                        if user_tx:
                            await ws.send_json({"type": "transcript", "role": "user", "text": "".join(user_tx).strip(), "final": True})
                        full = "".join(model_tx).strip()
                        if full:
                            await ws.send_json({"type": "transcript", "role": "model", "text": full, "final": True})
                        for c in {x.group(0): x for x in CITE_RE.finditer(full)}.values():
                            d = st.knowledge.docs.get(c.group(1))
                            await ws.send_json({"type": "citation", "doc_id": c.group(1), "revision": int(c.group(2)),
                                                "section": c.group(3), "title": d["meta"].get("title") if d else None})
                        user_tx.clear()
                        model_tx.clear()
                        await ws.send_json({"type": "turn_complete"})
                if m.tool_call and m.tool_call.function_calls:
                    responses = []
                    for fc in m.tool_call.function_calls:
                        args = dict(fc.args or {})
                        await ws.send_json({"type": "tool_call", "name": fc.name, "args": args})
                        result = await asyncio.to_thread(tb.call, fc.name, args)
                        if fc.name == "search_documents":
                            for r in (result.get("results") or [])[:3]:
                                if r.get("above_threshold"):
                                    await ws.send_json({"type": "citation", "doc_id": r["doc_id"], "revision": r["revision"],
                                                        "section": r["section"], "title": r["title"]})
                        responses.append(types.FunctionResponse(id=fc.id, name=fc.name, response={"result": result}))
                    await session.send_tool_response(function_responses=responses)

    up = asyncio.create_task(upstream())
    down = asyncio.create_task(downstream())
    try:
        done, pending = await asyncio.wait({up, down}, return_when=asyncio.FIRST_COMPLETED)
        for t in done:
            exc = t.exception()
            if exc and not isinstance(exc, WebSocketDisconnect):
                try:
                    await ws.send_json({"type": "error", "message": str(exc)[:300]})
                except Exception:  # noqa: BLE001
                    pass
        for t in pending:
            t.cancel()
    finally:
        try:
            await session_cm.__aexit__(None, None, None)
        except Exception:  # noqa: BLE001
            pass
        try:
            await ws.close()
        except Exception:  # noqa: BLE001
            pass
