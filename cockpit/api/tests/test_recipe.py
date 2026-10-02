"""E4 recipe engine (SDD-RCP-02..06, BDD-27) — unit-level tests against the real training batch."""
from __future__ import annotations

import re

import numpy as np

from app.engines.recipe import GATE_REASONS, recipe_for, whatif
from app.engines.surrogates import CUTPOINT_SP, OUTPUTS, get_surrogate_card, predict_delta, supported_inputs

RUN, U4, U2 = "random_s144", "unit_4_fractionator", "unit_2_riser"
# Since the valid-range retrain (2 Oct 17:10) the real engine withholds every s144 recipe (implausible or spread),
# so the ISSUED check uses hold-out random_s147 t300 (one of the few PASS-and-plausible minutes), and the
# spread-gate check uses s144 t720 (12:00, the demo honesty scene).
RUN_PASS, T_PASS, T_WITHHELD = "random_s147", 300, 720
FINANCIAL = re.compile(r"[$€£₹]\s?[0-9]|\b(USD|EUR|NPV|ROI|payback|cost|price|revenue|profit|savings?)\b", re.I)


def test_surrogate_card_is_structural_for_cut_points():
    sup = supported_inputs()
    assert {"SP_T_riser_ROT_F", "SP_LCO_T98", "SP_HN_T98"} <= set(sup)
    card = get_surrogate_card("R2")
    for sp, t98 in CUTPOINT_SP.items():
        assert card["sensitivity"][t98][sp] == 1.0, "controller gain 1 to the own T98"
        other = [t for t in CUTPOINT_SP.values() if t != t98][0]
        assert card["sensitivity"][other][sp] == 0.0
        assert card["source"][sp].startswith("structural")
    # the auto-window yield response is used only where it has hold-out skill; then it is negative in this simulator,
    # otherwise it is zero (no claim). On full_v1 the HN response has skill; the LCO one does not (hold-out R² ~0).
    for out, sp in (("prod_LCO", "SP_LCO_T98"), ("prod_HN", "SP_HN_T98")):
        g = card["sensitivity"][out][sp]
        assert g < -2 or g == 0.0, (out, g)
    assert card["sensitivity"]["prod_HN"]["SP_HN_T98"] < -2
    # constant tags are never searched
    assert {"SP_T_preheat_F", "MV_PA1", "MV_reflux_ratio", "SP_T_overhead", "MV_cw_flow"} <= set(card["unsupported_inputs"])


def test_predict_delta_is_linear_and_zero_at_rest():
    sup = supported_inputs()
    z = predict_delta("R3", np.zeros((1, len(sup))))
    assert np.allclose(z, 0.0)
    d = np.zeros((1, len(sup)))
    d[0, sup.index("SP_T_riser_ROT_F")] = 2.0
    one = predict_delta("R3", d)
    assert np.allclose(predict_delta("R3", 2 * d), 2 * one)
    assert one[0, OUTPUTS.index("prod_LPG")] > 0  # ROT raises LPG make (designed-move response)


def test_recipe_issued_at_committee_pass_minute():
    r = recipe_for(RUN_PASS, T_PASS, U4)
    assert r["gate"] == "ISSUED", r["explanation"]
    assert r["gate_reason"] is None and len(r["moves"]) >= 2
    moved = [m for m in r["moves"] if m["delta"] != 0]
    assert any(m["sp_tag"] in CUTPOINT_SP for m in moved)
    for m in r["moves"]:
        assert m["limit_lo"] - 1e-6 <= m["recommended"] <= m["limit_hi"] + 1e-6
        assert m["box_lo"] - 1e-6 <= m["recommended"] <= m["box_hi"] + 1e-6
        assert m["binding"] in {"iow", "step_limit", "envelope", "interior"}
    assert min(r["p_on_spec"].values()) >= 0.95
    assert r["objective_after"] > r["objective_before"] == 0.0
    assert r["d_yield_pct_feed"]["LCO"] > 0 and abs(r["d_yield_pct_feed"]["LCO"]) < 2.0  # sane magnitude, % feed
    assert r["data_support"]["searched"] and all(r["data_support"]["model_source"].values())
    assert not FINANCIAL.search(r["explanation"])


def test_recipe_is_deterministic():
    a, b = recipe_for(RUN, T_PASS, U4), recipe_for(RUN, T_PASS, U4)
    assert a == b


def test_recipe_withheld_when_committee_withheld():
    r = recipe_for(RUN, T_WITHHELD, U4)
    assert r["gate"] == "WITHHELD" and r["gate_reason"] == "spread_gate" and r["moves"] == []
    # the riser's coordinated cut-point move is gated the same way
    r2 = recipe_for(RUN, T_WITHHELD, U2)
    assert r2["gate"] == "WITHHELD" and r2["gate_reason"] == "spread_gate"


def test_recipe_withheld_without_data_support():
    for unit in ("unit_1_furnace", "unit_3_regenerator", "unit_5_condenser", "unit_6_stabiliser"):
        r = recipe_for(RUN, T_PASS, unit)
        assert r["gate"] == "WITHHELD" and r["gate_reason"] == "insufficient_data", unit
        assert r["gate_reason"] in GATE_REASONS and r["data_support"]["unsupported"]


def test_whatif_tracks_limits_and_spec():
    inside = whatif(RUN, T_PASS, U4, {"SP_LCO_T98": 750.0})
    assert inside["within_limits"] is True
    # lower LCO T98 never lowers predicted LCO make; it is 0 while the LCO yield response has no hold-out skill
    assert inside["d_yield_pct_feed"]["LCO"] >= 0
    assert inside["predicted"]["LCO_T98_F"] < 755
    outside = whatif(RUN, T_PASS, U4, {"SP_LCO_T98": 790.0})
    assert outside["within_limits"] is False
    unsupported = whatif(RUN, T_PASS, U4, {"MV_PA1": 40.0})
    assert unsupported["within_limits"] is False and unsupported["limits"]["MV_PA1"]["supported"] is False
