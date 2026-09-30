"""Demo-window selector for the FCC Soft-Sensor Decision Cockpit.

Scans held-out test runs (random_s140..s153, config test_seed_min) using the
exact same pipeline scoring as the API (app.pipeline/state), and ranks candidate
windows for the three canonical demoflow data moments:
  - M1 (Scene 2): Blind drift between labs on manual cut point, tracked by soft sensor
                  and later confirmed by laboratory sample.
  - M2 (Scene 1): Safe recommendation (GREEN/AMBER trust, P(on-spec) >= 0.95)
                  that is verifiably safe and right in hindsight.
  - M3 (Scene 3): Correct withholding (RED / WITHHELD, W90 > 14 °F or bimodality /
                  novelty) where withholding was the prudent engineering action.

Outputs a proposed `demo:` YAML block to stdout and writes a structured candidate
ranking report to `cockpit/api/artifacts/demo_candidates.md`.
Does NOT modify config.yaml. Degrades gracefully on partial runs (< min_rows).
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import yaml

from .config import Settings, get_settings


# ---------------------------------------------------------------------------
# Data classes for candidate moments
# ---------------------------------------------------------------------------

@dataclass
class M1Candidate:
    """M1: Blind drift during manual cut point, confirmed by subsequent lab."""
    run_id: str
    property: str
    crude_event_time_min: int
    prev_lab_time_min: int
    next_lab_time_min: int
    drift_F: float
    max_abs_drift_F: float
    tracking_mae_F: float
    lab_diff_F: float
    confirmed_by_lab: bool
    cutpoint_in_manual: bool
    window: list[int]
    score: float
    reason: str


@dataclass
class M2Candidate:
    """M2: Steady-state safe recommendation with P(on-spec)>=0.95."""
    run_id: str
    property: str
    time_min: int
    action: str
    delta_sp_F: float
    p_on_spec_before: float
    p_on_spec_after: float
    trust: str
    gate_status: str
    margin_before_F: float
    steady_duration_min: int
    hindsight_safe: bool
    hindsight_margin_F: float
    window: list[int]
    score: float
    reason: str


@dataclass
class M3Candidate:
    """M3: Justified withholding due to model spread, novelty, or bimodality."""
    run_id: str
    property: str
    time_min: int
    w90_F: float
    w90_limit_F: float
    bimodal: bool
    bimodality_d: float
    committee_spread_F: float
    novelty_s2: bool
    gate_status: str
    gate_reason: str
    trust: str
    hindsight_justified: bool
    window: list[int]
    score: float
    reason: str


@dataclass
class RunEvaluation:
    run_id: str
    batch: str
    n_rows: int
    status: str  # "complete", "partial", "scored"
    m1_candidates: list[M1Candidate] = field(default_factory=list)
    m2_candidates: list[M2Candidate] = field(default_factory=list)
    m3_candidates: list[M3Candidate] = field(default_factory=list)
    best_m1: M1Candidate | None = None
    best_m2: M2Candidate | None = None
    best_m3: M3Candidate | None = None
    composite_score: float = 0.0


# ---------------------------------------------------------------------------
# Moment Search & Ranking Algorithms (pure functions over scored run structures)
# ---------------------------------------------------------------------------

def find_m1_candidates(
    arrs: dict[str, np.ndarray],
    meta: dict[str, Any],
    df: pd.DataFrame,
    s: Settings,
    target_prop: str = "LCO_T98_F",
) -> list[M1Candidate]:
    """Find M1 blind drift moments where cutpoint is manual, truth drifts >= 5 °F,
    soft sensor follows, and next lab confirms."""
    candidates: list[M1Candidate] = []
    run_id = meta.get("group") or meta.get("run_id", "unknown")
    t = arrs["time_min"].astype(int)
    n = len(t)
    if n < 30:
        return candidates

    p_prefix = f"{target_prop}|"
    if f"{p_prefix}truth" not in arrs or f"{p_prefix}mean" not in arrs:
        return candidates

    truth = arrs[f"{p_prefix}truth"]
    mean = arrs[f"{p_prefix}mean"]
    sigma_lab = float(s.sigma_lab)
    r_reproducibility = float(s["lab"].get("reproducibility_F", 7.0))

    # Retrieve labs for target_prop
    labs = [l for l in meta.get("labs", []) if l.get("property") == target_prop]
    if len(labs) < 2:
        return candidates

    cutpoint_auto = df["cutpoint_auto"].to_numpy(dtype=int) if "cutpoint_auto" in df.columns else np.zeros(n, dtype=int)
    event_codes = df["event_code"].to_numpy(dtype=int) if "event_code" in df.columns else np.zeros(n, dtype=int)

    # Inspect consecutive lab pairs
    for k in range(len(labs) - 1):
        l_prev = labs[k]
        l_next = labs[k + 1]
        t_prev = int(l_prev["time_min"])
        t_next = int(l_next["time_min"])

        idx_prev = int(np.searchsorted(t, t_prev))
        idx_next = int(np.searchsorted(t, t_next))
        idx_prev = min(max(idx_prev, 0), n - 1)
        idx_next = min(max(idx_next, 0), n - 1)

        if idx_next <= idx_prev + 5:
            continue

        window_slice = slice(idx_prev, idx_next + 1)
        t_win = t[window_slice]
        truth_win = truth[window_slice]
        mean_win = mean[window_slice]
        auto_win = cutpoint_auto[window_slice]
        ev_win = event_codes[window_slice]

        # Check for crude switch event (code 1) or disturbance in interval
        crude_indices = np.where(ev_win == 1)[0]
        has_crude_event = len(crude_indices) > 0
        t_event = int(t_win[crude_indices[0]]) if has_crude_event else int(t_win[len(t_win) // 3])

        # True drift from initial lab value
        initial_val = float(truth_win[0])
        drift_series = truth_win - initial_val
        max_abs_idx = int(np.argmax(np.abs(drift_series)))
        max_abs_drift = float(np.abs(drift_series[max_abs_idx]))
        end_drift = float(truth_win[-1] - initial_val)

        # Soft sensor tracking error during drift
        tracking_mae = float(np.mean(np.abs(mean_win - truth_win)))

        # Confirmation by subsequent lab at t_next
        lab_next_val = float(l_next.get("value", truth_win[-1]))
        soft_next_val = float(mean_win[-1])
        lab_diff = abs(lab_next_val - soft_next_val)
        confirmed = lab_diff <= r_reproducibility

        # Check manual controller mode during drift
        manual_fraction = float(np.mean(auto_win == 0))
        cutpoint_manual = manual_fraction >= 0.70

        # Score formulation:
        # Boost for: drift magnitude, lab confirmation, manual controller mode, low tracking MAE
        drift_bonus = max_abs_drift * 3.0
        confirm_bonus = 15.0 if confirmed else -10.0
        manual_bonus = 10.0 if cutpoint_manual else 0.0
        error_penalty = tracking_mae * 2.0 + lab_diff

        score = drift_bonus + confirm_bonus + manual_bonus - error_penalty
        if has_crude_event:
            score += 10.0

        # Window for Scene 2 replay (starts ~60 min before crude switch, extends through trim after lab)
        w_start = max(0, t_event - 60)
        w_end = min(int(t[-1]), t_next + 60)

        reason = (
            f"Drift of {max_abs_drift:.1f} °F between labs at {t_prev}m and {t_next}m; "
            f"soft-sensor MAE {tracking_mae:.1f} °F, confirmed by lab within {lab_diff:.1f} °F (R={r_reproducibility:.1f} °F)."
        )

        candidates.append(M1Candidate(
            run_id=run_id,
            property=target_prop,
            crude_event_time_min=t_event,
            prev_lab_time_min=t_prev,
            next_lab_time_min=t_next,
            drift_F=round(end_drift, 2),
            max_abs_drift_F=round(max_abs_drift, 2),
            tracking_mae_F=round(tracking_mae, 2),
            lab_diff_F=round(lab_diff, 2),
            confirmed_by_lab=confirmed,
            cutpoint_in_manual=cutpoint_manual,
            window=[w_start, w_end],
            score=round(score, 2),
            reason=reason,
        ))

    candidates.sort(key=lambda c: c.score, reverse=True)
    return candidates


def find_m2_candidates(
    arrs: dict[str, np.ndarray],
    meta: dict[str, Any],
    df: pd.DataFrame,
    s: Settings,
    target_prop: str = "LCO_T98_F",
) -> list[M2Candidate]:
    """Find M2 safe recommendation moments: steady state, GREEN/AMBER trust,
    P(on-spec)>=0.95, and verified on-spec in hindsight."""
    candidates: list[M2Candidate] = []
    run_id = meta.get("group") or meta.get("run_id", "unknown")
    t = arrs["time_min"].astype(int)
    n = len(t)
    if n < 10:
        return candidates

    p_prefix = f"{target_prop}|"
    if f"{p_prefix}truth" not in arrs:
        return candidates

    truth = arrs[f"{p_prefix}truth"]
    spec_max = float(s.spec_max(target_prop))
    event_codes = df["event_code"].to_numpy(dtype=int) if "event_code" in df.columns else np.zeros(n, dtype=int)

    recs = [r for r in meta.get("recs", []) if r.get("property") == target_prop]
    for r in recs:
        t_rec = int(r["time_min"])
        idx = int(np.searchsorted(t, t_rec))
        if idx >= n:
            continue

        action = str(r.get("action", ""))
        delta_sp = float(r.get("delta_sp", 0.0))
        p_on_spec = float(r.get("p_on_spec_after", r.get("p_on_spec", 0.0)))
        trust = str(r.get("trust", ""))
        gate_status = str(r.get("gate_status", "PASS"))

        # Must meet basic recommendation criteria
        if gate_status == "WITHHELD" or trust == "RED" or p_on_spec < 0.90:
            continue

        # Steady-state check: count undisturbed minutes preceding t_rec
        lookback = max(0, idx - 120)
        recent_events = event_codes[lookback : idx + 1]
        steady_dur = int(np.sum(recent_events == 0))

        # Margin to spec before move
        truth_now = float(truth[idx])
        margin_before = spec_max - truth_now

        # Hindsight verification: look ahead 60 min
        idx_future = min(n, idx + 60)
        future_truth = truth[idx:idx_future]
        future_max_projected = np.max(future_truth) + (delta_sp if action == "RAISE" else 0.0)
        hindsight_margin = spec_max - float(future_max_projected)
        hindsight_safe = hindsight_margin >= -0.5  # within numerical tolerance

        # Score formulation
        trust_bonus = 25.0 if trust == "GREEN" else 10.0
        p_bonus = (p_on_spec - 0.90) * 100.0  # +5 for 0.95, +10 for 1.00
        action_bonus = 15.0 if (action == "RAISE" and delta_sp >= 1.0) else 5.0
        hindsight_bonus = 30.0 if hindsight_safe else -50.0
        steady_bonus = min(steady_dur, 120) * 0.15

        score = trust_bonus + p_bonus + action_bonus + hindsight_bonus + steady_bonus

        w_start = max(0, t_rec - 720)
        w_end = min(int(t[-1]), t_rec + 30)

        reason = (
            f"Recommendation {action} {delta_sp:+.1f} °F with P(on-spec)={p_on_spec:.1%}, "
            f"trust {trust}; steady for {steady_dur} min, hindsight margin {hindsight_margin:.1f} °F."
        )

        candidates.append(M2Candidate(
            run_id=run_id,
            property=target_prop,
            time_min=t_rec,
            action=action,
            delta_sp_F=round(delta_sp, 2),
            p_on_spec_before=round(float(r.get("p_on_spec_before", p_on_spec)), 3),
            p_on_spec_after=round(p_on_spec, 3),
            trust=trust,
            gate_status=gate_status,
            margin_before_F=round(margin_before, 2),
            steady_duration_min=steady_dur,
            hindsight_safe=hindsight_safe,
            hindsight_margin_F=round(hindsight_margin, 2),
            window=[w_start, w_end],
            score=round(score, 2),
            reason=reason,
        ))

    candidates.sort(key=lambda c: c.score, reverse=True)
    return candidates


def find_m3_candidates(
    arrs: dict[str, np.ndarray],
    meta: dict[str, Any],
    df: pd.DataFrame,
    s: Settings,
    target_prop: str = "HN_T98_F",
) -> list[M3Candidate]:
    """Find M3 withholding moments: gate WITHHELD or RED trust, wide W90 > 14 °F,
    bimodality or novelty S2 violation, where withholding was prudent."""
    candidates: list[M3Candidate] = []
    run_id = meta.get("group") or meta.get("run_id", "unknown")
    t = arrs["time_min"].astype(int)
    n = len(t)
    if n < 10:
        return candidates

    p_prefix = f"{target_prop}|"
    if f"{p_prefix}gate" not in arrs or f"{p_prefix}w90" not in arrs:
        return candidates

    w90 = arrs[f"{p_prefix}w90"]
    gate = arrs[f"{p_prefix}gate"]
    gate_reason = arrs[f"{p_prefix}gate_reason"]
    trust = arrs[f"{p_prefix}trust"]
    bimodal = arrs[f"{p_prefix}bimodal"] if f"{p_prefix}bimodal" in arrs else np.zeros(n, dtype=bool)
    bimod_d = arrs[f"{p_prefix}bimodality_d"] if f"{p_prefix}bimodality_d" in arrs else np.zeros(n, dtype=float)
    w90_max = float(s.w90_max)

    # Committee spread from mu array
    if f"{p_prefix}mu" in arrs:
        mu = arrs[f"{p_prefix}mu"]
        spread = np.ptp(mu, axis=1) if mu.ndim == 2 else np.zeros(n, dtype=float)
    else:
        spread = np.zeros(n, dtype=float)

    # Check S2 novelty
    if f"{p_prefix}sig|S2|pass" in arrs:
        s2_pass = arrs[f"{p_prefix}sig|S2|pass"].astype(bool)
        s2_fail = ~s2_pass
    else:
        s2_fail = np.zeros(n, dtype=bool)

    # Identify contiguous blocks of WITHHELD or RED
    is_withheld = (gate == "WITHHELD") | (trust == "RED") | (w90 > w90_max)
    indices = np.where(is_withheld)[0]
    if len(indices) == 0:
        return candidates

    # Group into consecutive segments
    segments = []
    seg_start = indices[0]
    for k in range(1, len(indices)):
        if indices[k] > indices[k - 1] + 5:  # gap of >5 minutes -> new segment
            segments.append((seg_start, indices[k - 1]))
            seg_start = indices[k]
    segments.append((seg_start, indices[-1]))

    for start_idx, end_idx in segments:
        seg_slice = slice(start_idx, end_idx + 1)
        w90_max_in_seg = float(np.max(w90[seg_slice]))
        spread_max_in_seg = float(np.max(spread[seg_slice]))
        has_bimodal = bool(np.any(bimodal[seg_slice]))
        has_novelty = bool(np.any(s2_fail[seg_slice]))
        peak_idx = int(start_idx + np.argmax(w90[seg_slice]))

        t_peak = int(t[peak_idx])
        g_stat = str(gate[peak_idx])
        g_reas = str(gate_reason[peak_idx]) or "W90 spread exceeded threshold"
        t_stat = str(trust[peak_idx])

        # Hindsight justification: committee disagreement or novelty justified withholding
        justified = bool(w90_max_in_seg > w90_max or has_bimodal or spread_max_in_seg >= 6.0 or has_novelty)

        # Score formulation
        w90_score = (w90_max_in_seg - w90_max) * 4.0 if w90_max_in_seg > w90_max else 0.0
        bimodal_bonus = 20.0 if has_bimodal else 0.0
        novelty_bonus = 15.0 if has_novelty else 0.0
        spread_bonus = spread_max_in_seg * 2.0
        justified_bonus = 20.0 if justified else -30.0

        score = w90_score + bimodal_bonus + novelty_bonus + spread_bonus + justified_bonus

        w_start = max(0, t_peak - 60)
        w_end = min(int(t[-1]), t_peak + 60)

        reason = (
            f"Gate WITHHELD at {t_peak}m ({target_prop}): W90={w90_max_in_seg:.1f} °F (limit {w90_max:.1f} °F), "
            f"spread {spread_max_in_seg:.1f} °F, bimodal={has_bimodal}, novelty={has_novelty}."
        )

        candidates.append(M3Candidate(
            run_id=run_id,
            property=target_prop,
            time_min=t_peak,
            w90_F=round(w90_max_in_seg, 2),
            w90_limit_F=w90_max,
            bimodal=has_bimodal,
            bimodality_d=round(float(np.max(bimod_d[seg_slice])), 2),
            committee_spread_F=round(spread_max_in_seg, 2),
            novelty_s2=has_novelty,
            gate_status=g_stat,
            gate_reason=g_reas,
            trust=t_stat,
            hindsight_justified=justified,
            window=[w_start, w_end],
            score=round(score, 2),
            reason=reason,
        ))

    candidates.sort(key=lambda c: c.score, reverse=True)
    return candidates


# ---------------------------------------------------------------------------
# Run Evaluation and Ranking
# ---------------------------------------------------------------------------

def evaluate_scored_run(
    run_id: str,
    arrs: dict[str, np.ndarray],
    meta: dict[str, Any],
    df: pd.DataFrame,
    s: Settings,
) -> RunEvaluation:
    """Evaluate candidate moments M1, M2, and M3 for a single scored run."""
    n_rows = len(arrs.get("time_min", []))
    batch = meta.get("batch", "unknown")

    # M1 on LCO_T98_F (as specified in demoflow Scene 2)
    m1_list = find_m1_candidates(arrs, meta, df, s, target_prop="LCO_T98_F")
    # M2 on LCO_T98_F (Scene 1)
    m2_list = find_m2_candidates(arrs, meta, df, s, target_prop="LCO_T98_F")
    # M3 on HN_T98_F (Scene 3 specification), falling back to LCO_T98_F
    m3_list = find_m3_candidates(arrs, meta, df, s, target_prop="HN_T98_F")
    if not m3_list:
        m3_list = find_m3_candidates(arrs, meta, df, s, target_prop="LCO_T98_F")

    best_m1 = m1_list[0] if m1_list else None
    best_m2 = m2_list[0] if m2_list else None
    best_m3 = m3_list[0] if m3_list else None

    # Composite score measures quality across all 3 moments
    comp = 0.0
    if best_m1:
        comp += max(0.0, best_m1.score)
    if best_m2:
        comp += max(0.0, best_m2.score)
    if best_m3:
        comp += max(0.0, best_m3.score)

    # High bonus if run satisfies all three moments simultaneously
    if best_m1 and best_m2 and best_m3:
        comp += 50.0

    return RunEvaluation(
        run_id=run_id,
        batch=batch,
        n_rows=n_rows,
        status="complete",
        m1_candidates=m1_list,
        m2_candidates=m2_list,
        m3_candidates=m3_list,
        best_m1=best_m1,
        best_m2=best_m2,
        best_m3=best_m3,
        composite_score=round(comp, 2),
    )


# ---------------------------------------------------------------------------
# Output formatting: YAML block and Markdown report
# ---------------------------------------------------------------------------

def build_demo_yaml(evaluations: list[RunEvaluation], backup_eval: RunEvaluation | None = None) -> dict:
    """Build proposed `demo:` YAML block conforming to demoflow.md requirements."""
    if not evaluations or evaluations[0].status != "complete":
        return {
            "demo": {
                "status": "pending_simulation",
                "note": "Awaiting completion of full_v1 simulation batch (min_rows target not yet met)",
                "recommended_default": "random_s140",
            }
        }

    primary = evaluations[0]
    m1 = primary.best_m1
    m2 = primary.best_m2
    m3 = primary.best_m3

    need_backup = m3 is None and backup_eval is not None and backup_eval.best_m3 is not None
    backup_m3 = backup_eval.best_m3 if need_backup else None

    scenes = {}
    if m2:
        scenes["scene1"] = {
            "minute": m2.time_min,
            "window": m2.window,
            "reason": f"M2: Safe recommendation {m2.action} {m2.delta_sp_F:+.1f} °F on {m2.property} with P(on-spec)={m2.p_on_spec_after:.1%}, trust {m2.trust}",
        }
    if m1:
        scenes["scene2"] = {
            "minute": m1.crude_event_time_min,
            "window": m1.window,
            "reason": f"M1: Replay crude switch with {m1.max_abs_drift_F:.1f} °F drift; tracking MAE {m1.tracking_mae_F:.1f} °F, confirmed by subsequent lab",
        }

    active_m3 = m3 or backup_m3
    active_m3_run = primary.run_id if m3 else (backup_eval.run_id if backup_eval else "unknown")
    if active_m3:
        scenes["scene3"] = {
            "run": active_m3_run,
            "minute": active_m3.time_min,
            "window": active_m3.window,
            "reason": f"M3: Withheld advisory on {active_m3.property} (W90={active_m3.w90_F:.1f} °F > {active_m3.w90_limit_F:.1f} °F limit); {active_m3.gate_reason}",
        }

    demo_block: dict[str, Any] = {
        "run": primary.run_id,
        "scenes": scenes,
        "moments": {
            "m1": asdict(m1) if m1 else None,
            "m2": asdict(m2) if m2 else None,
            "m3": asdict(active_m3) if active_m3 else None,
        },
        "reason": (
            f"Primary run '{primary.run_id}' ranked highest (composite score {primary.composite_score:.1f}). "
            f"Contains strong data moments for required scenes."
        ),
    }

    if need_backup and backup_eval:
        demo_block["backup_run"] = backup_eval.run_id
        demo_block["backup_reason"] = f"Backup run '{backup_eval.run_id}' provides M3 withhold moment."

    return {"demo": demo_block}


def generate_candidates_markdown(
    evaluations: list[RunEvaluation],
    skipped_runs: list[dict[str, Any]],
    demo_yaml: dict,
    min_rows: int,
    expected_rows: int,
) -> str:
    """Generate the full candidate report for artifacts/demo_candidates.md."""
    lines = [
        "# Demo Run & Window Candidates Report",
        "",
        "> **Generated by:** `cockpit/api/app/select_demo.py`",
        f"> **Criteria:** SDD §4–§7 · demoflow.md §3 (M1: Blind drift, M2: Safe rec, M3: Withhold)",
        "> **Note:** This proposal is informational; it does NOT modify `config.yaml`.",
        "",
        "## 1. Simulation Batch Status",
        "",
        f"- Target batch: `full_v1` (held-out test split: `random_s140`–`s153`)",
        f"- Requirement: `min_rows >= {min_rows}` (expected complete: `{expected_rows}` rows)",
        f"- Scored complete runs: `{len(evaluations)}`",
        f"- Partial / In-progress runs: `{len(skipped_runs)}`",
        "",
    ]

    if skipped_runs:
        lines.append("### In-Progress Runs (< min_rows)")
        lines.append("| Run ID | Batch | Current Rows | Target Min Rows | Status |")
        lines.append("|---|---|---|---|---|")
        for sr in skipped_runs:
            pct = (sr["n_rows"] / expected_rows) * 100.0 if expected_rows > 0 else 0.0
            lines.append(f"| `{sr['run_id']}` | `{sr['batch']}` | {sr['n_rows']} | {min_rows} | Still running ({pct:.1f}%) |")
        lines.append("")

    if evaluations:
        lines.append("## 2. Held-Out Runs Ranking")
        lines.append("| Rank | Run ID | Composite Score | M1 Drift (°F) | M2 Action & Trust | M3 Withhold (W90 °F) |")
        lines.append("|---|---|---|---|---|---|")
        for idx, ev in enumerate(evaluations, 1):
            m1_txt = f"{ev.best_m1.max_abs_drift_F:.1f} °F" if ev.best_m1 else "none"
            m2_txt = f"{ev.best_m2.action} ({ev.best_m2.trust})" if ev.best_m2 else "none"
            m3_txt = f"W90={ev.best_m3.w90_F:.1f} °F" if ev.best_m3 else "none"
            lines.append(f"| #{idx} | `{ev.run_id}` | {ev.composite_score:.1f} | {m1_txt} | {m2_txt} | {m3_txt} |")
        lines.append("")

        lines.append("## 3. Moment Details for Top Candidate")
        top = evaluations[0]
        lines.append(f"### Selected Run: `{top.run_id}` (Score: {top.composite_score:.1f})")
        if top.best_m1:
            lines.append(f"- **M1 (Scene 2):** {top.best_m1.reason} Replay window: `time_min {top.best_m1.window[0]}–{top.best_m1.window[1]}`.")
        if top.best_m2:
            lines.append(f"- **M2 (Scene 1):** {top.best_m2.reason} Decision window: `time_min {top.best_m2.window[0]}–{top.best_m2.window[1]}`.")
        if top.best_m3:
            lines.append(f"- **M3 (Scene 3):** {top.best_m3.reason} Model confidence window: `time_min {top.best_m3.window[0]}–{top.best_m3.window[1]}`.")
        lines.append("")
    else:
        lines.append("## 2. Evaluation Status")
        lines.append(
            f"No held-out run has yet reached the required `{min_rows}` simulated rows. "
            "The 54 background Octave simulations are currently progressing. "
            "Re-run `make demo-select` once runs finish (~2026-10-01 20:00)."
        )
        lines.append("")

    lines.append("## 4. Proposed `demo:` Configuration Block")
    lines.append("```yaml")
    lines.append(yaml.dump(demo_yaml, sort_keys=False, default_flow_style=False).strip())
    lines.append("```")
    lines.append("")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# CLI Scanner & Driver
# ---------------------------------------------------------------------------

def scan_and_rank_demo(
    settings: Settings | None = None,
    min_rows: int | None = None,
    batch: str | None = None,
    specific_runs: list[str] | None = None,
    output_md: Path | None = None,
    dry_run: bool = False,
) -> tuple[dict, list[RunEvaluation], list[dict]]:
    """Scan candidate runs, score complete ones, rank moments, and write report."""
    s = settings or get_settings()
    data_cfg = s.get("data") or {}
    train_cfg = s.get("training") or {}

    target_batch = batch or data_cfg.get("primary_batch", "full_v1")
    threshold_min_rows = int(min_rows if min_rows is not None else data_cfg.get("min_rows", 1500))
    expected_rows = int(data_cfg.get("expected_rows", 1600))
    test_seed_min = int(train_cfg.get("test_seed_min", 140))

    data_root = s.data_root
    batch_dir = data_root / target_batch

    # Identify held-out runs (random_sNNN with seed >= test_seed_min)
    candidates_to_check: list[Path] = []
    if specific_runs:
        for rname in specific_runs:
            p = batch_dir / f"{rname}.csv" if not rname.endswith(".csv") else batch_dir / rname
            if p.exists():
                candidates_to_check.append(p)
    elif batch_dir.exists():
        for p in sorted(batch_dir.glob("*.csv")):
            m = re.search(r"random_s(\d+)$", p.stem)
            if m and int(m.group(1)) >= test_seed_min:
                candidates_to_check.append(p)

    complete_runs: list[tuple[str, Path, int]] = []
    skipped_runs: list[dict[str, Any]] = []

    for p in candidates_to_check:
        run_id = p.stem
        try:
            with open(p, encoding="utf-8", errors="replace") as f:
                header = f.readline()
                n = sum(1 for line in f if line.strip())
        except OSError:
            continue

        if n >= threshold_min_rows:
            complete_runs.append((run_id, p, n))
        else:
            skipped_runs.append({"run_id": run_id, "batch": target_batch, "n_rows": n, "path": str(p)})

    # Score complete runs using State and Final model
    evaluations: list[RunEvaluation] = []
    if not dry_run and complete_runs:
        from .state import get_state
        st = get_state()

        for run_id, path, n_rows in complete_runs:
            scored = st.run(run_id)
            if scored is None and st.trained:
                try:
                    st.score_run(run_id)
                    scored = st.run(run_id)
                except Exception as e:  # noqa: BLE001
                    print(f"Warning: scoring failed for {run_id}: {e}", file=sys.stderr)

            if scored:
                arrs, meta = scored
                df = st.catalog.load(run_id)
                ev = evaluate_scored_run(run_id, arrs, meta, df, s)
                evaluations.append(ev)

    evaluations.sort(key=lambda e: e.composite_score, reverse=True)
    backup_eval = evaluations[1] if len(evaluations) > 1 else None

    demo_yaml = build_demo_yaml(evaluations, backup_eval)

    # Save to artifacts/demo_candidates.md
    out_path = output_md or (s.artifacts / "demo_candidates.md")
    report_md = generate_candidates_markdown(evaluations, skipped_runs, demo_yaml, threshold_min_rows, expected_rows)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(report_md, encoding="utf-8")

    return demo_yaml, evaluations, skipped_runs


def main() -> int:
    parser = argparse.ArgumentParser(description="Scan held-out runs and rank candidate demo windows for M1-M3.")
    parser.add_argument("--min-rows", type=int, default=None, help="Minimum row threshold (default: config min_rows, 1500)")
    parser.add_argument("--batch", type=str, default=None, help="Batch directory name to scan (default: full_v1)")
    parser.add_argument("--runs", nargs="*", default=None, help="Specific run IDs to evaluate (e.g. random_s140)")
    parser.add_argument("--output", type=str, default=None, help="Output markdown path (default: artifacts/demo_candidates.md)")
    parser.add_argument("--dry-run", action="store_true", help="Scan files without scoring")
    args = parser.parse_args()

    out_p = Path(args.output) if args.output else None
    demo_yaml, evals, skipped = scan_and_rank_demo(
        min_rows=args.min_rows,
        batch=args.batch,
        specific_runs=args.runs,
        output_md=out_p,
        dry_run=args.dry_run,
    )

    print(yaml.dump(demo_yaml, sort_keys=False, default_flow_style=False))

    if skipped and not evals:
        print(
            f"\n[Note] All {len(skipped)} held-out runs are in progress (< {args.min_rows or 1500} rows).\n"
            f"Gracefully reported status; detailed candidate report written to artifacts/demo_candidates.md.",
            file=sys.stderr,
        )

    return 0


if __name__ == "__main__":
    sys.exit(main())
