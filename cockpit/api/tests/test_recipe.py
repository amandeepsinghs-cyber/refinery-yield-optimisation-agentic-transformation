from app.engines.recipe import recipe_for, whatif
import json
import re

def test_recipe():
    res = recipe_for("random_s144", 600, "unit_4_fractionator")
    
    assert res.get("gate") in ["ISSUED", "WITHHELD"]
    if res.get("gate") == "ISSUED":
        assert len(res.get("moves", [])) >= 2
        for m in res.get("moves", []):
            assert "limit_lo" in m
            assert "limit_hi" in m
            assert m["recommended"] >= min(m["limit_lo"], m["current"] - 15)
            assert m["recommended"] <= max(m["limit_hi"], m["current"] + 15)
            
    moves = {"SP_LCO_T98": 752.0}
    w_res = whatif("random_s144", 600, "unit_4_fractionator", moves)
    assert "d_yield_pct_feed" in w_res
    assert "p_on_spec" in w_res
