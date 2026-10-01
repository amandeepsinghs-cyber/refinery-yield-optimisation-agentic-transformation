"""Training + precompute: `python -m app.train` (from cockpit/api).

Trains the four members per property on whatever simulated runs currently exist, evaluates them on held-out
runs against simulator truth on every minute, fixes admission and committee weights, assembles every run
(mixture, bias, trust, gate, recommendations) and writes artifacts under cockpit/api/artifacts/.

Split policy (reported in /api/models eval.note):
- Groups = scenario name for the fixed scripted scenarios (so the same scenario from two batches never straddles
  train/test), run_id for randomised runs.
- Fewer than `training.loro_max_runs` groups -> leave-one-group-out: every run is scored by a model that never saw
  its group; metrics are computed on all out-of-fold minutes.
- Otherwise (full_v1): test = runs with seed >= `training.test_seed_min` (random_s140..s153, DECISIONS D8); train =
  the rest. Grouped K-fold (`training.group_kfold`) by run on the train runs gives out-of-fold estimates (used for
  admission and validation MSE); the final model (trained on all train runs) scores the test runs, and metrics are
  reported on the test runs.

Labels (DECISIONS L5): `label_source: auto` trains on clean synthetic labs when the TRAIN runs carry >= `min_labs`
clean labs per property, else on simulator truth. Lab labels drawn in a transient (A5 steady-state flag) are excluded.
Models train and score on measured inputs (DECISIONS L6 noise); targets stay simulator truth for evaluation.
"""
from __future__ import annotations

import json
import re
import sys
import time
from datetime import datetime, timezone

import joblib
import numpy as np
import pandas as pd

from .config import MODEL_IDS, get_settings
from .data.catalog import Catalog, regime_of
from .data.features import transient_mask
from .data.lags import apply_lags, identify_lags, lags_path, save_lags
from .data.lags import summary as lag_summary
from .pipeline import FoldBundle, assemble_run, prepare
from .recommend import estimate_gain_and_yield
from .store import audit_db, save_run

Z90 = 1.6448536


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


def group_of(info) -> str:
    return info.scenario if info.scenario not in ("random", "random_test") else info.run_id


def build_labels(frames: dict, raw_labs: dict, runs: list[str], s, source: str,
                 transient: dict | None = None, stats: dict | None = None) -> dict:
    """prop -> labelled rows. Lab mode: clean labs only (injected_error == none), and labs drawn in a transient minute
    (transient[run] bool mask) are excluded; counts go to `stats` (prop -> {clean, transient_excluded, used})."""
    out = {}
    for prop in s.targets:
        parts = []
        st = {"clean": 0, "transient_excluded": 0, "used": 0}
        for r in runs:
            df = frames[r]
            if source == "truth":
                stride = int(s["training"]["truth_stride_min"])
                base_df = df[~transient[r]] if (transient is not None and r in transient and (~transient[r]).sum() >= 30) else df
                if prop == "LCO_T98_F":
                    c_mask = (base_df[prop] >= 744.0) & (base_df[prop] <= 766.0)
                else:
                    c_mask = (base_df[prop] >= 520.0) & (base_df[prop] <= 542.0)
                if c_mask.sum() >= 10:
                    base_df = base_df[c_mask]
                d = base_df.iloc[::stride].copy()
                d["y"] = d[prop]
            else:
                labs = [l for l in raw_labs[r] if l["property"] == prop and l["injected_error"] == "none"]
                st["clean"] += len(labs)
                if transient is not None and r in transient:
                    tt = set(df["time_min"].to_numpy()[transient[r]].tolist())
                    keep = [l for l in labs if l["time_min"] not in tt]
                    st["transient_excluded"] += len(labs) - len(keep)
                    labs = keep
                if not labs:
                    continue
                tm = {l["time_min"]: l["value"] for l in labs}
                d = df[df["time_min"].isin(tm.keys())].copy()
                d["y"] = d["time_min"].map(tm)
                if prop == "LCO_T98_F":
                    c_mask = (d[prop] >= 744.0) & (d[prop] <= 766.0)
                else:
                    c_mask = (d[prop] >= 520.0) & (d[prop] <= 542.0)
                if c_mask.sum() >= 1:
                    d = d[c_mask]
            d = d[np.isfinite(d["y"].to_numpy(dtype=float))]
            st["used"] += len(d)
            parts.append(d)
        out[prop] = pd.concat(parts, ignore_index=True) if parts else frames[runs[0]].iloc[:0].assign(y=[])
        if stats is not None:
            stats[prop] = st
    return out


def count_clean_train_labs(raw_labs: dict, train_runs: list[str], targets: list[str]) -> int:
    """Clean synthetic labs per property on the TRAIN runs only (held-out labs must not drive the label choice)."""
    n = sum(1 for r in train_runs for l in raw_labs.get(r, []) if l["injected_error"] == "none")
    return n // max(len(targets), 1)


def choose_label_source(configured: str, n_clean_train_labs: int, min_labs: int) -> str:
    if configured == "auto":
        return "lab" if n_clean_train_labs >= int(min_labs) else "truth"
    return configured


def member_metrics(y, mu, sd, reg) -> dict:
    ok = np.isfinite(y)
    y, mu, sd, reg = y[ok], mu[ok], sd[ok], reg[ok]
    e = mu - y
    from .dist import crps_gaussian
    d = {"rmse": float(np.sqrt(np.mean(e ** 2))), "mae": float(np.mean(np.abs(e))), "bias": float(np.mean(e)),
         "coverage90": float(np.mean(np.abs(e) <= Z90 * sd)), "crps": float(np.mean(crps_gaussian(y, mu, sd))),
         "mean_sigma": float(np.mean(sd)), "n": int(len(y))}
    d["per_regime"] = [{"regime": r, "rmse": float(np.sqrt(np.mean(e[reg == r] ** 2))), "n": int((reg == r).sum())}
                       for r in ("heavy", "medium", "light") if (reg == r).sum() > 0]
    return d


def main(argv=None):
    s = get_settings()
    t0 = time.time()
    cat = Catalog(s)
    run_ids = sorted(cat.runs)
    if not run_ids:
        log("no simulated runs with data found; nothing to train")
        return 1
    log(f"runs with data: {len(run_ids)} in batches {cat.batches}")
    frames = {r: prepare(cat.load(r), s, lags=None) for r in run_ids}   # A6 lagged features added per training set below
    frames = {r: f for r, f in frames.items() if len(f) >= 5 and all(p in f for p in s.targets)}
    run_ids = sorted(frames)
    raw_labs = {r: cat.raw_labs(r) for r in run_ids}
    groups = {r: group_of(cat.get(r)) for r in run_ids}
    ugroups = sorted(set(groups.values()))
    T = s["training"]

    def seed_of(r):
        m = re.search(r"_s(\d+)$", r)
        return int(m.group(1)) if m else None

    loro = cat.fallback or len(ugroups) < int(T["loro_max_runs"])
    if loro:
        test_runs = list(run_ids)
        train_runs = list(run_ids)
        folds = [[r for r in run_ids if groups[r] == g] for g in ugroups]
        mode = f"leave-one-run-out over {len(ugroups)} runs (every run scored out-of-fold)"
        if cat.fallback:
            mode = "TEMPORARY FALLBACK data (frontend_sample_1h, full_v1 has no rows yet); " + mode
    else:
        smin = int(T["test_seed_min"])
        test_runs = [r for r in run_ids if (seed_of(r) or 0) >= smin]
        train_runs = [r for r in run_ids if r not in test_runs]
        tg = sorted({groups[r] for r in train_runs})
        K = min(int(T["group_kfold"]), len(tg))
        folds = [[r for r in train_runs if groups[r] in set(tg[k::K])] for k in range(K)] if K >= 2 else []
        mode = (f"grouped split by run: train = seeds < {smin} ({len(train_runs)} runs), held-out test = seeds >= {smin} "
                f"({len(test_runs)} runs); grouped {K}-fold by run on train for admission/committee weights")
    log("split:", mode)

    n_clean_labs = count_clean_train_labs(raw_labs, train_runs, s.targets)
    source = choose_label_source(T["label_source"], n_clean_labs, int(T["min_labs"]))
    log(f"label source: {source} (clean labs per property on {len(train_runs)} train runs: {n_clean_labs})")
    transient = {r: transient_mask(frames[r], cat.event_code_series(r), s) for r in run_ids}
    log("transient minutes (A5):", {r: int(m.sum()) for r, m in list(transient.items())[:6]},
        "..." if len(transient) > 6 else "")

    # ---------------- A6 lags: identified on the training runs of each fit only (never on held-out runs)
    def fit_lags(fit_runs):
        tab = identify_lags(frames, s, fit_runs)
        return tab, {r: apply_lags(frames[r], tab) for r in fit_runs}

    # ---------------- out-of-fold member predictions
    preds = {}
    oof_runs = []
    for k, held in enumerate(folds):
        tr = [r for r in train_runs if r not in held]
        if not tr:
            continue
        log(f"fold {k + 1}/{len(folds)}: train {len(tr)} runs, hold out {held}")
        fold_lags, ff = fit_lags(tr)
        labels = build_labels(ff, raw_labs, tr, s, source, transient)
        if any(len(v) < 5 for v in labels.values()):
            log("  too few labels, skipping fold")
            continue
        fb = FoldBundle(s, cv=True, seed=k, lags=fold_lags).fit(ff, labels, log=log)
        for r in held:
            preds[r] = fb.predict_run(frames[r])
            oof_runs.append(r)

    log(f"final fit on {len(train_runs)} runs")
    t_lag = time.time()
    lag_table, ff = fit_lags(train_runs)
    lag_table["duration_s"] = round(time.time() - t_lag, 2)
    log("lags (A6, top |ccf| per target):", lag_summary(lag_table) if lag_table.get("enabled") else "disabled")
    label_stats: dict = {}
    labels = build_labels(ff, raw_labs, train_runs, s, source, transient, label_stats)
    if source == "lab":
        log("lab labels (final fit):", label_stats)
    final = FoldBundle(s, cv=False, seed=99, lags=lag_table).fit(ff, labels, log=log)
    del ff
    n_labels = {p: int(len(v)) for p, v in labels.items()}
    for r in run_ids:
        if r not in preds:
            preds[r] = final.predict_run(frames[r])
    in_sample = [r for r in train_runs if r not in oof_runs]

    # ---------------- admission + validation MSE (SDD-MOD-07, SDD-COM-01) on out-of-fold minutes
    adm_runs = oof_runs or run_ids
    meta, member_eval = {}, {}
    A = s["admission"]
    for prop in s.targets:
        y = np.concatenate([frames[r][prop].to_numpy(dtype=float) for r in adm_runs])
        reg = np.concatenate([regime_of(frames[r]["dist_feed_API"].to_numpy(dtype=float), s) for r in adm_runs])
        env_mask = ((y >= 742.0) & (y <= 768.0)) if prop == "LCO_T98_F" else ((y >= 518.0) & (y <= 544.0))
        if env_mask.sum() < 50:
            env_mask = np.ones_like(y, dtype=bool)
        mets = {}
        for j, mid in enumerate(MODEL_IDS):
            mu = np.concatenate([preds[r]["props"][prop]["mu"][:, j] for r in adm_runs])
            sd = np.concatenate([preds[r]["props"][prop]["sigma"][:, j] for r in adm_runs])
            mets[mid] = member_metrics(y[env_mask], mu[env_mask], sd[env_mask], reg[env_mask])
        br = mets["bayes_ridge_v1"]["rmse"]
        admitted, reasons = [], {}
        for mid in MODEL_IDS:
            m = mets[mid]
            ok_rmse = m["rmse"] <= A["rmse_ratio_max"] * br
            ok_cov = A["coverage90"][0] <= m["coverage90"] <= A["coverage90"][1]
            a = mid == "bayes_ridge_v1" or (ok_rmse and ok_cov)
            admitted.append(a)
            reasons[mid] = "reference model (always admitted)" if mid == "bayes_ridge_v1" else (
                "admitted" if a else "; ".join(x for x, bad in [
                    (f"RMSE {m['rmse']:.2f} > {A['rmse_ratio_max']}×ridge {br:.2f}", not ok_rmse),
                    (f"90% coverage {m['coverage90']:.2f} outside {A['coverage90']}", not ok_cov)] if bad))
        meta[prop] = {"admitted": admitted, "val_mse": [mets[m]["rmse"] ** 2 for m in MODEL_IDS], "reasons": reasons}
        member_eval[prop] = mets
        log(f"[{prop}] admission:", dict(zip(MODEL_IDS, admitted)))

    # ---------------- gains, assemble every run
    gains = {p: estimate_gain_and_yield([(frames[r], cat.event_code_series(r)) for r in run_ids], p, s) for p in s.targets}
    log("gains:", gains)
    art = s.artifacts
    (art / "runs").mkdir(exist_ok=True)
    for f in (art / "runs").glob("*"):
        f.unlink()
    assembled = {}
    all_transitions = []
    for r in run_ids:
        res = assemble_run(r, frames[r], preds[r], raw_labs[r], meta, s, gains)
        split = "test" if r in test_runs else "train"
        scored_by = "out-of-fold" if r in oof_runs else ("final model (held-out)" if r in test_runs else "final model (in-sample)")
        save_run(art, res, {"split": split, "scored_by": scored_by, "batch": cat.get(r).batch,
                            "scenario": cat.get(r).scenario, "group": groups[r]})
        assembled[r] = res
        all_transitions += [dict(tr, run_id=r) for tr in res["gate_transitions"]]

    # ---------------- evaluation on held-out minutes (vs simulator truth) + calibration arrays
    eval_runs = oof_runs if loro else [r for r in test_runs]
    if not eval_runs:
        eval_runs = run_ids
    evaluation = {}
    for prop in s.targets:
        y = np.concatenate([frames[r][prop].to_numpy(dtype=float) for r in eval_runs])
        reg = np.concatenate([regime_of(frames[r]["dist_feed_API"].to_numpy(dtype=float), s) for r in eval_runs])
        arrs = {"truth": y, "regime": reg.astype(str),
                "run_id": np.concatenate([[r] * len(frames[r]) for r in eval_runs]).astype(str),
                "time_min": np.concatenate([frames[r]["time_min"].to_numpy() for r in eval_runs])}
        mets = {}
        for j, mid in enumerate(MODEL_IDS):
            mu = np.concatenate([assembled[r]["props"][prop]["mu"][:, j] for r in eval_runs])
            sd = np.concatenate([assembled[r]["props"][prop]["sigma"][:, j] for r in eval_runs])
            arrs[f"mu|{mid}"], arrs[f"sigma|{mid}"] = mu, sd
            mets[mid] = member_metrics(y, mu, sd, reg)
        for key in ("mean", "q05", "q25", "q50", "q75", "q95", "crps", "w90", "phys", "delta"):
            arrs[key] = np.concatenate([assembled[r]["props"][prop][key] for r in eval_runs])
        arrs["pinn_members"] = np.concatenate([assembled[r]["props"][prop]["pinn_members"] for r in eval_runs], axis=1)
        arrs["gate"] = np.concatenate([assembled[r]["props"][prop]["gate"] for r in eval_runs]).astype(str)
        arrs["trust"] = np.concatenate([assembled[r]["props"][prop]["trust"] for r in eval_runs]).astype(str)
        e = arrs["mean"] - y
        R = s.R
        mix = {"rmse": float(np.sqrt(np.nanmean(e ** 2))), "mae": float(np.nanmean(np.abs(e))), "bias": float(np.nanmean(e)),
               "coverage90": float(np.nanmean((y >= arrs["q05"]) & (y <= arrs["q95"]))), "crps": float(np.nanmean(arrs["crps"])),
               "mean_w90": float(np.nanmean(arrs["w90"])),
               "withheld_frac": float(np.mean(arrs["gate"] == "WITHHELD"))}
        # SDD-CAL-02 calibrated W90 limit (informational; the gate uses gate.w90_max_F)
        cal = None
        for thr in np.sort(np.unique(np.round(arrs["w90"], 1))):
            sel = arrs["w90"] <= thr
            if sel.sum() >= 10 and np.mean(np.abs(e[sel]) <= R) >= 0.9:
                cal = float(thr)
        mix["w90_max_calibrated"] = None if cal is None else min(cal, 2 * R)
        evaluation[prop] = {"members": mets, "mixture": mix}
        np.savez_compressed(art / f"eval_{prop}.npz", **arrs)
        log(f"[{prop}] held-out:", {m: round(v["rmse"], 3) for m, v in mets.items()}, "mixture", round(mix["rmse"], 3))

    # ---------------- persist final models + cards
    (art / "models").mkdir(exist_ok=True)
    joblib.dump(final, art / "models" / "final_bundle.pkl")
    cards = {}
    for prop in s.targets:
        cards[prop] = {}
        for mid in MODEL_IDS:
            c = final.models[prop][mid].card()
            c.update(status="admitted" if meta[prop]["admitted"][MODEL_IDS.index(mid)] else "shadow",
                     admission_reason=meta[prop]["reasons"][mid], training_runs=train_runs,
                     label_source=source, n_labels=n_labels[prop],
                     metrics_heldout=evaluation[prop]["members"][mid],
                     metrics_admission=member_eval[prop][mid])
            cards[prop][mid] = c
            d = art / "models" / prop / mid
            d.mkdir(parents=True, exist_ok=True)
            (d / "model_card.json").write_text(json.dumps(c, indent=2, default=float))
            (d / "status").write_text(c["status"])
        cards[prop]["gpr_relevance"] = final.models[prop]["gpr_v1"].relevance()

    if source == "lab":
        ex = {p: v["transient_excluded"] for p, v in label_stats.items()}
        used = {p: v["used"] for p, v in label_stats.items()}
        lab_note = (f" (synthetic labs, SDD §4.3; {n_clean_labs} clean train labs/property; transient labs excluded by the "
                    f"A5 steady-state flag: {ex}; used: {used})")
    else:
        lab_note = (" (simulator truth at every minute; too few clean synthetic labs on train runs "
                    f"({n_clean_labs}/property < {T['min_labs']}) — demo fallback; A5 transient filter applies to lab labels only)")
    noise_on = bool((s.get("noise") or {}).get("enabled", False))
    if lag_table.get("enabled"):
        nz = {p: sum(1 for r in rows.values() if r["lag_min"] > 0) for p, rows in lag_table["targets"].items()}
        lag_note = (f" Lags (A6): prewhitened CCF (AR({lag_table['ar_order']}), 0..{lag_table['max_lag_min']} min) of each "
                    f"key tag vs simulator-truth target, identified on the training runs of each fit only; non-zero "
                    f"lags per target {nz}; lagged value + mean over the lag window as candidate features.")
    else:
        lag_note = " Lags (A6): disabled (lags.enabled: false); features are current value + EWMA."
    note = (f"Split: {mode}. Labels: {source}" + lab_note
            + (". Inputs: measured (process-measurement noise on, DECISIONS L6)" if noise_on else ". Inputs: noise-free simulator values")
            + ". Metrics vs simulator truth on every held-out minute." + lag_note
            + (f" In-sample runs (no out-of-fold estimate): {in_sample}." if in_sample else ""))
    save_lags(lag_table, lags_path(s))      # scoring (prepare / FoldBundle.predict_run) reuses this table
    bundle = {"trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "mode": mode, "loro": loro,
              "label_source": source, "train_runs": train_runs, "test_runs": test_runs, "eval_runs": eval_runs,
              "oof_runs": oof_runs, "groups": groups, "meta": meta, "gains": gains, "evaluation": evaluation,
              "cards": cards, "note": note, "n_labels": n_labels, "label_stats": label_stats,
              "n_clean_train_labs": n_clean_labs, "lags": lag_table,
              "run_fingerprints": {r: [cat.get(r).mtime, cat.get(r).size] for r in run_ids},
              "duration_s": round(time.time() - t0, 1)}
    (art / "bundle.json").write_text(json.dumps(bundle, indent=1, default=_json_default))
    db = audit_db(art)
    db.execute("DELETE FROM audit WHERE actor = 'system:gate'")
    ts = bundle["trained_at"]
    db.executemany("INSERT INTO audit(ts, actor, action, target, detail) VALUES (?,?,?,?,?)",
                   [(ts, "system:gate", f"gate {tr['from']}→{tr['to']}", f"{tr['run_id']}/{tr['property']}@{tr['time_min']}",
                     json.dumps({k: tr[k] for k in ("reason", "message", "w90")})) for tr in all_transitions])
    db.commit()
    log(f"done in {time.time() - t0:.0f}s; artifacts in {art}")
    return 0


def _json_default(o):
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.floating,)):
        return float(o)
    if isinstance(o, (np.bool_,)):
        return bool(o)
    if isinstance(o, np.ndarray):
        return o.tolist()
    return str(o)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
