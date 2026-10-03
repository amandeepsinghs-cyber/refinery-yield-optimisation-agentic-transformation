"""Task 4 report: gap-window lever fit vs the strict step-response windows (candidate only — not wired into decisions).

    cd cockpit/api && FCC_SCRIPTED=0 OMP_NUM_THREADS=2 .venv/bin/python scripts/surrogate_gap_report.py

Writes to <artifacts>/engines_v7_candidate/: surrogates.pkl + surrogate_card.json (candidate fit with the gap flag on),
gap_samples.csv (one row per lever move and output), gap_report.json and gap_report.md. Never touches artifacts/engines/
or the live decision record (FCC_AUDIT_DB -> temp file).

Hold-out split (documented): lever seeds 210, 211 (config lever_test_seed_min..max) plus 246..251 (the last launched
seeds; s250 is too short to be catalogued) are held out; all other lever seeds train. The candidate surrogate itself
uses the config split (210..211) so it stays comparable with the live card.
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path

os.environ.setdefault("FCC_DATA_SOURCE", "csv")
os.environ.setdefault("FCC_SCRIPTED", "0")
os.environ.setdefault("FCC_AUDIT_DB", os.path.join(tempfile.mkdtemp(prefix="fcc_audit_"), "audit.db"))
os.environ["FCC_SURROGATE_GAP_FIT"] = "1"
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

from app.engines import surrogates as S  # noqa: E402
from app.state import get_state  # noqa: E402

HOLDOUT_SEEDS = {210, 211, 246, 247, 248, 249, 250, 251}
EXTRA = ["fluegas_O2_pct", "fluegas_CO_ppm", "Treg_F", "SP_T_reg_F", "F_regen_cat", "Tr_riser_F", "valve_V8",
         "T_tray01_F", "Fair"]
OUTS = S.OUTPUTS + [c for c in EXTRA if c not in S.OUTPUTS]
KEY = {  # lever -> outputs that matter for the decision / plant-practice check
    "Fair": ["dT_cyc_reg_F", "fluegas_O2_pct", "fluegas_CO_ppm", "Treg_F", "SP_T_reg_F", "conversion_pct"],
    "SP_T_preheat_F": ["T2_preheat_F", "conversion_pct", "Treg_F", "F_regen_cat", "dT_cyc_reg_F", "F_coke"],
    "SP_T_overhead": ["MV_cw_flow", "valve_V8", "T_tray01_F", "prod_LN", "prod_HN", "HN_T98_F"],
    "MV_PA2": ["LCO_T98_F", "HN_T98_F", "prod_LCO", "prod_HN"],
    "MV_reflux_ratio": ["LCO_T98_F", "HN_T98_F", "prod_LN", "prod_HN"],
    "MV_cw_flow": ["T_tray01_F", "prod_LN", "prod_LPG", "HN_T98_F"],
}
SCRIPTED = {"Fair": ("D5", "dT_cyc_reg_F", 40.0), "SP_T_preheat_F": ("D6", "T2_preheat_F", 1.0),
            "SP_T_overhead": ("D7", "MV_cw_flow", -2.6)}


def _stats(v: np.ndarray) -> dict:
    v = v[np.isfinite(v)]
    if not len(v):
        return {"n": 0}
    med = float(np.median(v))
    return {"n": int(len(v)), "median": med, "mad": float(np.median(np.abs(v - med)) * 1.4826),
            "q25": float(np.percentile(v, 25)), "q75": float(np.percentile(v, 75)),
            "sign_agree": float(np.mean(np.sign(v) == np.sign(med))) if med != 0 else None}


def main() -> None:
    st = get_state()
    out_dir = st.s.artifacts / S.GAP_ARTIFACT_DIR
    out_dir.mkdir(parents=True, exist_ok=True)
    seg_df = S._regime_table(st)
    # strict windows (default fit) — lever moves usable before, train + hold-out
    strict = S._step_samples(st, seg_df, holdout=False)[0] + S._step_samples(st, seg_df, holdout=True)[0]
    lever_tags = sorted({S.EVENT_INPUT[c] for c in S.GAP_EVENT_CODES})
    n_strict = {t: sum(1 for s in strict if s["input"] == t) for t in lever_tags}
    tr = S._gap_samples(st, seg_df, holdout=False, outputs=OUTS, holdout_seeds=HOLDOUT_SEEDS, with_rejects=True)
    ho = S._gap_samples(st, seg_df, holdout=True, outputs=OUTS, holdout_seeds=HOLDOUT_SEEDS, with_rejects=True)
    rows, rep = [], {"holdout_seeds": sorted(HOLDOUT_SEEDS), "outputs": OUTS, "levers": {}}
    for split, ss in (("train", tr), ("holdout", ho)):
        for s in ss:
            if "rejected" in s:
                rows.append({"split": split, "run_id": s["run_id"], "input": s["input"], "t_min": s["t_min"],
                             "regime": s["regime"], "rejected": s["rejected"]})
                continue
            for k, o in enumerate(OUTS):
                rows.append({"split": split, "run_id": s["run_id"], "input": s["input"], "t_min": s["t_min"],
                             "regime": s["regime"], "post_len": s["post_len"], "dx": s["dx"], "output": o,
                             "sens": s["sens"][k], "sens_fo": s["sens_fo"][k], "sens_late": s["sens_late"][k],
                             "tau": s["tau"][k], "settled": bool(s["settled"][k]), "dy": s["dy"][k]})
    pd.DataFrame(rows).to_csv(out_dir / "gap_samples.csv", index=False)

    for tag in lever_tags:
        ok_tr = [s for s in tr if s["input"] == tag and "rejected" not in s]
        ok_ho = [s for s in ho if s["input"] == tag and "rejected" not in s]
        rej = [s["rejected"] for s in tr + ho if s["input"] == tag and "rejected" in s]
        L = {"moves_total": len(ok_tr) + len(ok_ho) + len(rej), "usable_strict": n_strict[tag],
             "usable_gap_train": len(ok_tr), "usable_gap_holdout": len(ok_ho),
             "rejected": {r: rej.count(r) for r in sorted(set(rej))},
             "dx": _stats(np.array([s["dx"] for s in ok_tr + ok_ho])),
             "post_len_median": float(np.median([s["post_len"] for s in ok_tr + ok_ho])) if ok_tr + ok_ho else None,
             "outputs": {}}
        for o in KEY.get(tag, []):
            k = OUTS.index(o)
            S_tr = np.array([s["sens"][k] for s in ok_tr])
            st_o = _stats(S_tr)
            st_o["settled_frac"] = float(np.mean([s["settled"][k] for s in ok_tr])) if ok_tr else None
            st_o["tau_median"] = float(np.nanmedian([s["tau"][k] for s in ok_tr])) if ok_tr else None
            # hold-out: predicted dy = median train gain x dx vs observed dy
            if ok_ho and st_o.get("n"):
                P = np.array([st_o["median"] * s["dx"] for s in ok_ho])
                O = np.array([s["dy"][k] for s in ok_ho])
                m = np.isfinite(P) & np.isfinite(O)
                P, O = P[m], O[m]
                if len(O):
                    ss_tot = float(((O - O.mean()) ** 2).sum())
                    st_o["holdout"] = {"n": int(len(O)), "rmse": float(np.sqrt(np.mean((O - P) ** 2))),
                                       "r2": None if ss_tot == 0 or len(O) < 3 else float(1 - ((O - P) ** 2).sum() / ss_tot),
                                       "sign_agree": float(np.mean(np.sign(O) == np.sign(P))),
                                       "median_ho_gain": float(np.median([s["sens"][k] for s in ok_ho]))}
            L["outputs"][o] = st_o
        if tag in SCRIPTED:
            d, target, g = SCRIPTED[tag]
            L["scripted"] = {"decision": d, "target": target, "gain": g}
        rep["levers"][tag] = L

    # candidate surrogate artifacts (gap flag on; config hold-out split)
    S._load_surrogates.cache_clear()
    _, card = S._load_surrogates()
    rep["candidate_card_meta"] = card.get("_meta", {})
    (out_dir / "gap_report.json").write_text(json.dumps(rep, indent=1, default=float))

    md = ["# Gap-window lever fit — candidate report", "",
          f"Hold-out seeds: {sorted(HOLDOUT_SEEDS)}. Gains = median over moves (MAD×1.4826 spread).", ""]
    for tag, L in rep["levers"].items():
        md.append(f"## {tag}  — usable strict {L['usable_strict']} → gap {L['usable_gap_train']} train + "
                  f"{L['usable_gap_holdout']} hold-out (of {L['moves_total']}); rejects {L['rejected']}")
        if "scripted" in L:
            md.append(f"Scripted {L['scripted']['decision']}: {L['scripted']['target']} gain {L['scripted']['gain']}")
        md.append("| output | median gain | spread | sign agree | settled | tau | hold-out n | sign agree | R² |")
        md.append("|---|---|---|---|---|---|---|---|---|")
        for o, v in L["outputs"].items():
            h = v.get("holdout", {})
            f = lambda x, p=4: "—" if x is None else (f"{x:.{p}g}" if isinstance(x, float) else str(x))  # noqa: E731
            md.append(f"| {o} | {f(v.get('median'))} | {f(v.get('mad'))} | {f(v.get('sign_agree'), 2)} | "
                      f"{f(v.get('settled_frac'), 2)} | {f(v.get('tau_median'), 3)} | {h.get('n', 0)} | "
                      f"{f(h.get('sign_agree'), 2)} | {f(h.get('r2'), 2)} |")
        md.append("")
    (out_dir / "gap_report.md").write_text("\n".join(md))
    print("\n".join(md))


if __name__ == "__main__":
    main()
