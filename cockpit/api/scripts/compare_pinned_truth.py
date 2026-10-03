"""Compare soft-sensor artifact sets on the SAME held-out minutes, with and without pinned T98 truth (read-only).

    .venv/bin/python scripts/compare_pinned_truth.py LIVE_DIR NAME=DIR [NAME=DIR ...] [--json OUT.json]

Each DIR is an artifacts directory written by `python -m app.train` (eval_<prop>.npz + runs/<run>.npz). Minutes are
joined on (run_id, time_min) across all sets; "original" truth = the simulator truth as stored by the LIVE set (pinned
minutes included); "unpinned" truth = the same with minutes at the T98 ceiling (app/data/pinned.py DEFAULTS) removed.
Mixture metrics: MAE / RMSE of the mixture mean, 90 % coverage of [q05, q95]. Also prints mean ± sd, [q05, q95],
gate and P(on spec) at the demo moments.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.data.pinned import DEFAULTS, pinned_mask  # noqa: E402

PROPS = ["LCO_T98_F", "HN_T98_F"]
DEMO = [("random_s107", 600), ("random_s144", 600), ("random_s144", 720)]


def load_eval(d: Path, prop: str) -> dict:
    with np.load(d / f"eval_{prop}.npz", allow_pickle=False) as z:
        a = {k: z[k] for k in ("run_id", "time_min", "truth", "mean", "q05", "q95")}
        a["truth_unmasked"] = z["truth_unmasked"] if "truth_unmasked" in z.files else a["truth"]
    a["key"] = np.char.add(np.char.add(a["run_id"].astype(str), "|"), a["time_min"].astype(str))
    return a


def metrics(y, mu, lo, hi) -> dict:
    ok = np.isfinite(y) & np.isfinite(mu)
    e = mu[ok] - y[ok]
    return {"n": int(ok.sum()), "mae": float(np.mean(np.abs(e))), "rmse": float(np.sqrt(np.mean(e ** 2))),
            "cov90": float(np.mean((y[ok] >= lo[ok]) & (y[ok] <= hi[ok])))}


def main(argv):
    out_json = None
    if "--json" in argv:
        i = argv.index("--json")
        out_json = Path(argv[i + 1])
        argv = argv[:i] + argv[i + 2:]
    live = Path(argv[0])
    sets = {"live": live, **{a.split("=", 1)[0]: Path(a.split("=", 1)[1]) for a in argv[1:]}}
    res = {"metrics": {}, "demo": {}}
    for prop in PROPS:
        ev = {n: load_eval(d, prop) for n, d in sets.items()}
        common = set(ev["live"]["key"].tolist())
        for a in ev.values():
            common &= set(a["key"].tolist())
        keys = np.array(sorted(common))
        idx = {n: {k: i for i, k in enumerate(a["key"].tolist())} for n, a in ev.items()}
        take = {n: np.array([idx[n][k] for k in keys]) for n in ev}
        y0 = ev["live"]["truth_unmasked"][take["live"]]
        for n, a in ev.items():
            yt = a["truth_unmasked"][take[n]]
            dmax = float(np.nanmax(np.abs(yt - y0))) if len(yt) else 0.0
            if dmax > 1e-6:
                print(f"WARNING {prop} {n}: truth differs from live by up to {dmax:.4f} on common minutes")
        m = pinned_mask(y0, DEFAULTS["ceilings"][prop], DEFAULTS["tol"])
        truths = {"original": y0, "unpinned": np.where(m, np.nan, y0)}
        res.setdefault("pinned_minutes", {})[prop] = int(m.sum())
        res["metrics"][prop] = {}
        for tname, y in truths.items():
            for n, a in ev.items():
                t = take[n]
                res["metrics"][prop][f"{tname}|{n}"] = metrics(y, a["mean"][t], a["q05"][t], a["q95"][t])
        res.setdefault("n_common", {})[prop] = int(len(keys))
    for run, tmin in DEMO:
        for prop in PROPS:
            for n, d in sets.items():
                p = d / "runs" / f"{run}.npz"
                if not p.exists():
                    continue
                with np.load(p, allow_pickle=False) as z:
                    hit = np.where(z["time_min"] == tmin)[0]
                    if not len(hit):
                        continue
                    i = int(hit[0])
                    res["demo"][f"{run}@{tmin}|{prop}|{n}"] = {
                        k: float(z[f"{prop}|{k}"][i]) for k in ("mean", "sd", "q05", "q95", "w90", "p_on_spec", "truth")}
                    res["demo"][f"{run}@{tmin}|{prop}|{n}"]["gate"] = str(z[f"{prop}|gate"][i])
    # ---- print
    print("pinned minutes on common held-out minutes:", res["pinned_minutes"], "common minutes:", res["n_common"])
    names = list(sets)
    for prop in PROPS:
        print(f"\n{prop}")
        print(f"{'truth':<10}{'set':<18}{'n':>7}{'MAE':>8}{'RMSE':>8}{'cov90':>8}")
        for tname in ("original", "unpinned"):
            for n in names:
                m = res["metrics"][prop][f"{tname}|{n}"]
                print(f"{tname:<10}{n:<18}{m['n']:>7}{m['mae']:>8.2f}{m['rmse']:>8.2f}{m['cov90']:>8.1%}")
    print("\nDemo moments (mean ± sd [q05, q95] gate P(on spec); truth)")
    for k, v in res["demo"].items():
        print(f"{k:<44} {v['mean']:7.1f} ± {v['sd']:4.1f} [{v['q05']:6.1f}, {v['q95']:6.1f}] {v['gate']:<9} "
              f"p={v['p_on_spec']:.2f}  truth {v['truth']:.1f}")
    if out_json:
        out_json.write_text(json.dumps(res, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
