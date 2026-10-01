"""Recipe replay harness (SDD-RCP-06, BDD-27): on held-out crude switches, compare the E4 recipe against "hold" on
priority yield (surrogate-based). Prints a small table and the mean LCO gain.

Run from cockpit/api: `.venv/bin/python scripts/eval_recipe.py` (or `make recipe-eval`)."""
from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # make `app` importable when run as a script

from app.engines.recipe import recipe_for  # noqa: E402
from app.state import get_state  # noqa: E402

UNIT = "unit_4_fractionator"
EVAL_OFFSET_MIN = 10  # evaluate the recipe this long after the labelled transition end


def held_out_switches(st) -> pd.DataFrame:
    regimes_csv = st.s.data_root / st.s["data"]["primary_batch"] / "_staged" / "regimes.csv"
    if not regimes_csv.exists():
        raise SystemExit(f"missing {regimes_csv}")
    seg = pd.read_csv(regimes_csv)
    seg = seg[seg["transition_complete"] == True].dropna(subset=["transition_end_min"])  # noqa: E712
    seed = seg["run_id"].str.extract(r"random_s(\d+)")[0].astype("float")
    return seg[(seed >= st.s["training"]["test_seed_min"]) & seg["run_id"].isin(st.catalog.runs)]


def run_eval() -> pd.DataFrame:
    st = get_state()
    rows = []
    for _, seg in held_out_switches(st).iterrows():
        t_eval = int(seg["transition_end_min"]) + EVAL_OFFSET_MIN
        rcp = recipe_for(seg["run_id"], t_eval, UNIT)
        dy = rcp.get("d_yield_pct_feed", {}) or {}
        rows.append({"run_id": seg["run_id"], "time_min": t_eval, "regime": rcp.get("regime_id"),
                     "gate": rcp.get("gate"), "gate_reason": rcp.get("gate_reason"),
                     "LCO_gain_pct": dy.get("LCO", 0.0), "HN_gain_pct": dy.get("HN", 0.0),
                     "obj_before": rcp.get("objective_before"), "obj_after": rcp.get("objective_after")})
    return pd.DataFrame(rows)


if __name__ == "__main__":
    df = run_eval()
    if df.empty:
        print("No held-out switches found.")
        raise SystemExit(0)
    issued = df[df["gate"] == "ISSUED"]
    print("Recipe replay on held-out switches (U4, +%d min after transition end):" % EVAL_OFFSET_MIN)
    print(df.to_string(index=False))
    print(f"\nissued {len(issued)}/{len(df)} · mean LCO gain {issued['LCO_gain_pct'].mean():.2f} % feed · "
          f"mean HN gain {issued['HN_gain_pct'].mean():.2f} % feed · "
          f"beats hold on objective: {(issued['obj_after'] > issued['obj_before']).mean() * 100:.0f} %")
