import json
import re
from app.engines.workbench import workbench

def test_workbench():
    for unit_id in ["unit_1_furnace", "unit_2_riser", "unit_3_regenerator", "unit_4_fractionator", "unit_5_condenser", "unit_6_stabiliser"]:
        res = workbench(unit_id, "random_s144", 600)
        assert res, f"Workbench failed for {unit_id}"
        
        # four zones
        assert "analysis" in res
        assert "models" in res
        assert "regime" in res
        assert "recipe" in res
        
        text = json.dumps(res).lower()
        # no grey colours
        bad_colors = ["#808080", "#999999", "#9ca3af", "#6b7280", "#64748b", "#94a3b8", "#cbd5e1", "gray", "grey"]
        for bc in bad_colors:
            assert bc not in text, f"Bad color {bc} found in {unit_id}"
            
        # no financial words
        fin_words = re.findall(r"(?i)[$€£₹]\s?[0-9]|USD|EUR|NPV|ROI|payback|cost|budget|price|revenue|profit|savings?|monetary", text)
        assert not fin_words, f"Financial words found: {fin_words}"
