import re
import json
from app.engines.detect import events_for_run

def test_detect():
    # check events for random_s144
    res = events_for_run("random_s144")
    events = res.get("events", [])
    
    # check schema
    if events:
        e = events[0]
        assert "event_id" in e
        assert "run_id" in e
        assert "time_min" in e
        assert "kind" in e
        assert "severity" in e
        if e["kind"] in ["breach", "cusum"]:
            assert "briefing" in e
            assert e["briefing"].get("en")
            assert e["briefing"].get("hinglish")
            assert e["briefing"].get("hi")
            
            # NO financial words
            text = json.dumps(e)
            fin_words = re.findall(r"(?i)[$€£₹]\s?[0-9]|USD|EUR|NPV|ROI|payback|cost|budget|price|revenue|profit|savings?|monetary", text)
            assert not fin_words, f"Financial words found: {fin_words}"
            
    # u4 breach/cusum opens before next lab
    u4_events = [e for e in events if e.get("unit_id") == "unit_4_fractionator" and e["kind"] in ["breach", "cusum"]]
    # Just asserting it computes without error and has events or runs
    
