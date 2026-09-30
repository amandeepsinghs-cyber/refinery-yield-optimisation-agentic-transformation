"""Real Vertex AI checks (opt-in: RUN_GEMINI=1). One streamed text-copilot turn with tool calls and one Live session
(text in, audio + transcript out) through the /api/live WebSocket proxy."""
import json
import os

import pytest
from fastapi.testclient import TestClient

pytestmark = pytest.mark.skipif(os.environ.get("RUN_GEMINI") != "1", reason="set RUN_GEMINI=1 to call Vertex AI")


def _client():
    from app.main import app
    from app.state import get_state
    get_state().s.raw["gemini"]["probe_on_startup"] = False
    return TestClient(app)


def test_copilot_chat_real():
    c = _client()
    body = {"messages": [{"role": "user", "content": "Is the LCO gate PASS right now? One sentence."}],
            "context": {"page": "/decision/overview", "property": "LCO_T98_F"}}
    r = c.post("/api/copilot/chat", json=body)
    assert r.status_code == 200
    events = [l[7:] for l in r.text.splitlines() if l.startswith("event: ")]
    assert "tool_call" in events and "final" in events and events[-1] == "done", r.text[:2000]
    assert "error" not in events, r.text[:2000]


def test_live_ws_real():
    c = _client()
    with c.websocket_connect("/api/live?property=LCO_T98_F&page=/decision/overview") as ws:
        first = ws.receive_json()
        assert first["type"] == "ready", first
        ws.send_json({"type": "text", "text": "Say hello in three words."})
        got_audio, got_tx = False, False
        for _ in range(400):
            m = ws.receive_json()
            if m["type"] == "audio":
                got_audio = True
            if m["type"] == "transcript" and m["role"] == "model":
                got_tx = True
            if m["type"] == "error":
                pytest.fail(json.dumps(m))
            if m["type"] == "turn_complete":
                break
        ws.send_json({"type": "close"})
        assert got_audio and got_tx
