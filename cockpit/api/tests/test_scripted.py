"""Scripted outcomes (demo): D3/D5–D7 become open moves built from live inputs, labelled scripted, inside the lever window."""
from app.engines import decisions


def test_scripted_decisions_open_and_consistent(monkeypatch):
    monkeypatch.setenv("FCC_SCRIPTED", "1")
    # Since the 2 Oct valid-range retrain s107 t600 withholds D2, which (by design) blocks the scripted recipe
    # there; the scripted D3 is checked on s144 t600, the demo recipe scene.
    b107, b144 = decisions.build("random_s107", 600), decisions.build("random_s144", 600)
    types = {r: {d["type"] for d in b["decisions"] if d.get("scripted")} for r, b in (("s107", b107), ("s144", b144))}
    assert types["s107"] >= {"D5", "D6", "D7"} and "D3" in types["s144"]
    for b in (b107, b144):
        for d in (d for d in b["decisions"] if d.get("scripted")):
            assert d["status"] == "open" and d["proposed"]["moves"]
            p, m = d["predicted"], d["proposed"]["moves"][0]
            assert p["p_on_spec_after"] > 0.9 > p["p_on_spec_before"]
            assert abs(p["mu_after"] - (p["mu_before"] + p["gain"] * (m["to"] - m["from"]))) < 0.05 * max(1, abs(p["gain"]))
            lv = next(x for x in d["levers"] if x["tag"] == m["tag"])
            if lv["lo"] is not None:
                assert lv["lo"] <= m["to"] <= lv["hi"]
        assert all(not d.get("scripted") for d in b["decisions"] if d["type"] in ("D1", "D2", "D9"))


def test_scripted_off_keeps_real_engine(monkeypatch):
    monkeypatch.setenv("FCC_SCRIPTED", "0")
    b = decisions.build("random_s107", 600)
    assert not any(d.get("scripted") for d in b["decisions"])
