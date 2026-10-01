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
EVAL_OFFSET_MIN = 10      # earliest evaluation point after the labelled transition end
EVAL_HORIZON_MIN = 300    # look this far after the switch for the first minute where the committee gate is PASS


def held_out_switches(st) -> pd.DataFrame:
    regimes_csv = st.s.data_root / st.s["data"]["primary_batch"] / "_staged" / "regimes.csv"
    if not regimes_csv.exists():
        raise SystemExit(f"missing {regimes_csv}")
    seg = pd.read_csv(regimes_csv)
    seg = seg[seg["transition_complete"] == True].dropna(subset=["transition_end_min"])  # noqa: E712
    seed = seg["run_id"].str.extract(r"random_s(\d+)")[0].astype("float")
    return seg[(seed >= st.s["training"]["test_seed_min"]) & seg["run_id"].isin(st.catalog.runs)]


def first_pass_minute(st, run_id: str, t0: int) -> int:
    """First minute in [t0, t0 + horizon] where both T98 committee gates are PASS; t0 if none / no estimate."""
    v = st.run(run_id)
    if not v:
        return t0
    arrs, _ = v
    t = arrs["time_min"]
    ok = (t >= t0) & (t <= t0 + EVAL_HORIZON_MIN)
    for prop in ("LCO_T98_F", "HN_T98_F"):
        if f"{prop}|gate" in arrs:
            ok &= arrs[f"{prop}|gate"].astype(str) == "PASS"
    idx = ok.nonzero()[0]
    return int(t[idx[0]]) if len(idx) else t0


def run_eval() -> pd.DataFrame:
    st = get_state()
    rows = []
    for _, seg in held_out_switches(st).iterrows():
        t_switch = int(seg["transition_end_min"])
        t_eval = first_pass_minute(st, seg["run_id"], t_switch + EVAL_OFFSET_MIN)
        rcp = recipe_for(seg["run_id"], t_eval, UNIT)
        dy = rcp.get("d_yield_pct_feed", {}) or {}
        rows.append({"run_id": seg["run_id"], "time_min": t_eval, "after_switch_min": t_eval - t_switch,
                     "regime": rcp.get("regime_id"), "gate": rcp.get("gate"), "gate_reason": rcp.get("gate_reason"),
                     "LCO_gain_pct": dy.get("LCO", 0.0), "HN_gain_pct": dy.get("HN", 0.0),
                     "p_LCO": (rcp.get("p_on_spec") or {}).get("LCO"), "p_HN": (rcp.get("p_on_spec") or {}).get("HN"),
                     "obj_before": rcp.get("objective_before"), "obj_after": rcp.get("objective_after"),
                     "binding": ",".join(sorted({m["binding"] for m in rcp.get("moves", []) if m["delta"]}))})
    return pd.DataFrame(rows)


if __name__ == "__main__":
    df = run_eval()
    if df.empty:
        print("No held-out switches found.")
        raise SystemExit(0)
    issued = df[df["gate"] == "ISSUED"]
    print(f"Recipe replay on held-out switches (U4, first committee-PASS minute >= {EVAL_OFFSET_MIN} min after "
          f"transition end, horizon {EVAL_HORIZON_MIN} min):")
    print(df.to_string(index=False))
    print(f"\nissued {len(issued)}/{len(df)} · mean LCO gain {issued['LCO_gain_pct'].mean():.2f} % feed · "
          f"mean HN gain {issued['HN_gain_pct'].mean():.2f} % feed · "
          f"beats hold on objective: {(issued['obj_after'] > issued['obj_before']).mean() * 100:.0f} %")
