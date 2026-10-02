"""Data catalog over the simulated CSVs in sim_octave/data/<batch>/*.csv (read-only).

- Scans every batch folder; skips header-only files and `_staged`/`logs` folders.
- Handles files that are still being written (drops a trailing partial row only while row count < expected).
- Process-measurement noise on model inputs (DECISIONS L6): `load()` = measured view, `load_true()` = simulator values.
- Events come from `event_code` transitions (112-column schema) or, for the fixed legacy scenarios
  (108-column schema, no metadata columns), from the scenario definitions in sim_octave/scenario.m.
- Synthetic labs per SDD §4.3 (truth + seeded noise); status is assigned later by the pipeline.
"""
from __future__ import annotations

import fnmatch
import hashlib
import re
import threading
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import pandas as pd

from ..config import Settings, get_settings

EVENT_LABELS = {
    1: "Crude change", 2: "Feed rate change", 3: "Riser outlet temperature move",
    4: "Feed temperature change", 5: "LCO T98 set point move", 6: "HN T98 set point move",
    7: "Condenser fouling",
}

# Scenario definitions transcribed from sim_octave/scenario.m (fixed 3 h scenarios; ramp start/duration in min).
SCENARIO_EVENTS = {
    "steady": [],
    "heavy_crude": [(30, 1, 30)],
    "light_crude": [(30, 1, 30)],
    "throughput": [(30, 2, 30), (120, 2, 30)],
    "rot_move": [(30, 3, 10), (120, 3, 10)],
    "lco_cut_move": [(30, 5, 20)],
    "condenser_fouling": [(30, 7, 120)],
    "feed_temp_drop": [(30, 4, 30)],
}
META_COLS = ["cutpoint_auto", "lab_sample", "crude_id", "event_code"]


@dataclass
class RunInfo:
    run_id: str
    batch: str
    path: Path
    scenario: str
    n_minutes: int
    schema: str            # "v2" (112 cols) or "v1" (108 cols)
    mtime: float
    size: int
    columns: list[str] = field(default_factory=list)


def _scenario_for(stem: str, batch: str) -> str:
    s = stem
    for pre in ("sample_1h_", "sample_v1_", "sample_"):
        if s.startswith(pre):
            s = s[len(pre):]
    if s in SCENARIO_EVENTS:
        return s
    if stem.startswith("random_s"):
        return "random"
    if stem.startswith("rt_s") or stem.startswith("random_test"):
        return "random_test"
    return stem


def _seed(run_id: str) -> int | None:
    m = re.search(r"random_s(\d+)$", run_id)
    return int(m.group(1)) if m else None


def _read_csv(path: Path, expected_rows: int | None = None) -> pd.DataFrame:
    """Read one run CSV. A trailing row with missing fields is treated as a partially written row and dropped only
    while the file is still being written (row count < expected_rows); complete files keep every row."""
    df = pd.read_csv(path, on_bad_lines="skip", low_memory=False)
    df.columns = [c.strip() for c in df.columns]
    still_writing = expected_rows is not None and len(df) < int(expected_rows)
    if still_writing and len(df) and df.iloc[-1].isna().any():      # partially written last row
        df = df.iloc[:-1]
    df = df.apply(pd.to_numeric, errors="coerce")
    df = df.replace([np.inf, -np.inf], np.nan)
    df = df.dropna(subset=["time_min"])
    df["time_min"] = df["time_min"].astype(int)
    df = df.drop_duplicates("time_min").sort_values("time_min").reset_index(drop=True)
    return df


# ---------------------------------------------------------------------- process-measurement noise (DECISIONS L6)
FLOW_PREFIXES = ("prod_", "F_", "MV_")


def noise_kind(col: str, s: Settings) -> str | None:
    """'temp' | 'pressure' | 'flow' | None. Targets (simulator truth), set points (SP_*), label/meta columns and
    excluded columns never get noise."""
    if col in set(s.targets) or col.startswith("SP_") or col in META_COLS or col == "time_min":
        return None
    if col.endswith("_dup") or col.startswith("eff_"):
        return None
    if col.endswith("_F"):
        return "temp"
    if "psia" in col:
        return "pressure"
    if col == "feed_flow_lb_s" or col.startswith(FLOW_PREFIXES):
        return "flow"
    return None


def add_measurement_noise(df: pd.DataFrame, run_id: str, s: Settings) -> pd.DataFrame:
    """Measured values = simulator truth + Gaussian noise: temperatures σ temp_F (absolute), pressures σ pressure_psi
    (absolute), flows σ flow_rel × |value| (relative). Deterministic per (run_id, noise.seed, column) and keyed on
    time_min, so a growing file keeps the same noise on rows already written."""
    N = s.get("noise") or {}
    if not N.get("enabled", False) or not len(df):
        return df
    sig = {"temp": float(N.get("temp_F", 0.5)), "pressure": float(N.get("pressure_psi", 0.05)),
           "flow": float(N.get("flow_rel", 0.005))}
    t = df["time_min"].to_numpy().astype(int)
    tmin = min(int(t.min()), 0)
    span = int(t.max()) - tmin + 1
    out = df.copy()
    for c in df.columns:
        k = noise_kind(c, s)
        if k is None or not pd.api.types.is_numeric_dtype(df[c]):
            continue
        h = hashlib.sha256(f"{run_id}|{N.get('seed', 7)}|{c}".encode()).hexdigest()
        z = np.random.default_rng(int(h[:16], 16)).standard_normal(span)[t - tmin]
        v = df[c].to_numpy(dtype=float)
        out[c] = v + (z * sig[k] * np.abs(v) if k == "flow" else z * sig[k])
        
    drift_run = N.get("drift_run", "random_s152")
    drift_tag = N.get("drift_tag", "T_tray13_F")
    drift_start_min = int(N.get("drift_start_min", 300))
    drift_per_day_F = float(N.get("drift_per_day_F", 4.0))
    
    if N.get("enabled", False) and run_id == drift_run and drift_tag in out.columns and drift_per_day_F != 0:
        out[drift_tag] += np.maximum(0.0, (t - drift_start_min) / 1440.0) * drift_per_day_F

    return out


class Catalog:
    def __init__(self, settings: Settings | None = None):
        self.s = settings or get_settings()
        self.runs: dict[str, RunInfo] = {}
        self._cache: dict[str, tuple[tuple, pd.DataFrame]] = {}
        self._mcache: dict[str, tuple[tuple, pd.DataFrame]] = {}
        self._lock = threading.Lock()
        self.scan()

    # ------------------------------------------------------------------ scanning
    def scan(self) -> dict[str, RunInfo]:
        root = self.s.data_root
        skip = set(self.s["data"].get("skip_dirs", []))
        runs: dict[str, RunInfo] = {}
        if root.exists():
            for p in sorted(root.rglob("*.csv")):
                rel = p.relative_to(root)
                if any(part in skip for part in rel.parts[:-1]):
                    continue
                batch = rel.parts[0] if len(rel.parts) > 1 else "root"
                try:
                    with open(p) as f:
                        header = f.readline()
                        n = sum(1 for line in f if line.strip())
                except OSError:
                    continue
                if n < 2:           # header-only (or single row) -> skip
                    continue
                cols = [c.strip() for c in header.strip().split(",")]
                if "time_min" not in cols:
                    continue
                run_id = p.stem if p.stem not in runs else f"{batch}__{p.stem}"
                st = p.stat()
                runs[run_id] = RunInfo(run_id=run_id, batch=batch, path=p,
                                       scenario=_scenario_for(p.stem, batch), n_minutes=n,
                                       schema="v2" if all(c in cols for c in META_COLS) else "v1",
                                       mtime=st.st_mtime, size=st.st_size, columns=cols)
        D = self.s["data"]
        primary = D.get("primary_batch")
        fallback = set(D.get("fallback_batches", []))
        min_rows = int(D.get("min_rows", 1500))
        smin = int(self.s["training"].get("test_seed_min", 140))
        prim_all = {r: i for r, i in runs.items() if i.batch == primary}
        prim = {r: i for r, i in prim_all.items() if i.n_minutes >= min_rows}
        seeds = [_seed(r) for r in prim]
        n_tr = sum(1 for s in seeds if s is not None and s < smin)
        n_te = sum(1 for s in seeds if s is not None and s >= smin)
        ready = bool(prim) and n_tr >= int(D.get("min_complete_train_runs", 4)) and \
            n_te >= int(D.get("min_complete_test_runs", 1))
        header_only = 0
        if primary and (root / primary).exists():
            header_only = sum(1 for p in (root / primary).glob("*.csv") if p.stem not in prim_all)
        self.primary_progress = {
            "batch": primary, "min_rows": min_rows, "complete": len(prim), "complete_train": n_tr,
            "complete_test": n_te, "partial": len(prim_all) - len(prim), "header_only": header_only,
            "ready": ready or not primary,
            "partial_runs": {r: i.n_minutes for r, i in sorted(prim_all.items()) if i.n_minutes < min_rows},
        }
        if ready or not primary:
            self.runs, self.fallback = (prim if primary else runs), False
        else:
            self.runs, self.fallback = {r: i for r, i in runs.items() if i.batch in fallback}, True
        self.all_runs = runs
        return self.runs

    @property
    def data_mode(self) -> dict:
        prim = self.s["data"].get("primary_batch")
        pp = getattr(self, "primary_progress", None)
        if self.fallback:
            why = "has no data rows yet" if not pp or (pp["complete"] + pp["partial"]) == 0 else \
                (f"is still being generated ({pp['complete']} complete, {pp['partial']} partial runs; "
                 f"a run counts as complete at >= {pp['min_rows']} rows)")
            return {"source": "fallback", "primary_batch": prim, "batches": self.batches, "primary_progress": pp,
                    "note": f"TEMPORARY FALLBACK: {prim} {why}; showing {', '.join(self.batches) or 'nothing'} "
                            f"(fixed 60-minute scenarios) so the UI can be wired. Drops out automatically once {prim} "
                            f"has enough complete runs."}
        note = None
        if pp and pp["partial"]:
            note = f"{pp['partial']} {prim} runs are still partial (< {pp['min_rows']} rows) and are excluded until complete."
        return {"source": "primary", "primary_batch": prim, "batches": self.batches, "primary_progress": pp,
                "note": note}

    @property
    def batches(self) -> list[str]:
        return sorted({r.batch for r in self.runs.values()})

    def get(self, run_id: str) -> RunInfo:
        if run_id in self.runs:
            return self.runs[run_id]
        # runs outside the active batch (e.g. lever_v1, read only by the surrogate fit) stay loadable by id
        if run_id in getattr(self, "all_runs", {}):
            return self.all_runs[run_id]
        raise KeyError(run_id)

    def _expected_rows(self, info: RunInfo) -> int | None:
        D = self.s["data"]
        if info.batch == D.get("primary_batch") or info.batch in (self.s["training"].get("lever_batches") or []):
            return int(D.get("expected_rows", 1600))
        return None

    def load_true(self, run_id: str) -> pd.DataFrame:
        """Simulator values for every column (no measurement noise). Use for evaluation / the truth overlay."""
        info = self.get(run_id)
        key = (info.mtime, info.size)
        with self._lock:
            hit = self._cache.get(run_id)
            if hit and hit[0] == key:
                return hit[1]
        df = _read_csv(info.path, self._expected_rows(info))
        info.n_minutes = len(df)
        with self._lock:
            self._cache[run_id] = (key, df)
        return df

    def load(self, run_id: str) -> pd.DataFrame:
        """Measured view used by the models, the charts and the copilot: model inputs carry process-measurement
        noise when `noise.enabled` (DECISIONS L6). Targets (LCO_T98_F, HN_T98_F) stay simulator truth for
        evaluation and the overlay; the noise-free values of every column remain available via load_true()."""
        info = self.get(run_id)
        key = (info.mtime, info.size, bool((self.s.get("noise") or {}).get("enabled", False)))
        with self._lock:
            hit = self._mcache.get(run_id)
            if hit and hit[0] == key:
                return hit[1]
        df = add_measurement_noise(self.load_true(run_id), run_id, self.s)
        with self._lock:
            self._mcache[run_id] = (key, df)
        return df

    # ------------------------------------------------------------------ events
    def events(self, run_id: str) -> list[dict]:
        info = self.get(run_id)
        df = self.load(run_id)
        out = []
        if "event_code" in df.columns:
            codes = df["event_code"].fillna(0).astype(int).to_numpy()
            t = df["time_min"].to_numpy()
            i = 0
            while i < len(codes):
                if codes[i] != 0:
                    j = i
                    while j + 1 < len(codes) and codes[j + 1] == codes[i]:
                        j += 1
                    c = int(codes[i])
                    out.append({"time_min": int(t[i]), "code": c, "label": EVENT_LABELS.get(c, f"Event {c}"),
                                "duration": int(t[j] - t[i] + 1)})
                    i = j + 1
                else:
                    i += 1
        else:
            tmax = int(df["time_min"].max()) if len(df) else 0
            for t0, c, dur in SCENARIO_EVENTS.get(info.scenario, []):
                if t0 <= tmax:
                    out.append({"time_min": t0, "code": c, "label": EVENT_LABELS[c], "duration": dur,
                                "source": "scenario definition (sim_octave/scenario.m)"})
        return out

    def event_code_series(self, run_id: str) -> np.ndarray:
        df = self.load(run_id)
        if "event_code" in df.columns:
            return df["event_code"].fillna(0).astype(int).to_numpy()
        codes = np.zeros(len(df), dtype=int)
        t = df["time_min"].to_numpy()
        for ev in self.events(run_id):
            codes[(t >= ev["time_min"]) & (t < ev["time_min"] + ev["duration"])] = ev["code"]
        return codes

    # ------------------------------------------------------------------ synthetic labs (SDD §4.3)
    def raw_labs(self, run_id: str) -> list[dict]:
        """One lab per target per `lab_sample == 1` row. Deterministic per (run_id, seed) via SHA-256.
        Lab values are simulator truth (no process-measurement noise) + lab error (DECISIONS L2)."""
        df = self.load_true(run_id)
        if "lab_sample" not in df.columns:
            return []
        L = self.s["lab"]
        sig = self.s.sigma_lab
        rows = df.index[df["lab_sample"].fillna(0).to_numpy() == 1]
        out = []
        for prop in self.s.targets:
            h = hashlib.sha256(f"{run_id}|{L['seed']}|{prop}".encode()).hexdigest()
            rng = np.random.default_rng(int(h[:16], 16))
            for idx in rows:
                t = int(df.at[idx, "time_min"])
                truth = float(df.at[idx, prop])
                eps = rng.normal(0, sig)
                u_gross, u_ts, sgn = rng.random(), rng.random(), rng.choice([-1, 1])
                delay = int(round(rng.uniform(*L["lims_delay_min"])))
                injected = "none"
                if u_gross < L["gross_error_rate"]:
                    eps += sgn * 4 * sig
                    injected = "gross"
                lims = t + delay
                recorded = t
                if u_ts < L["timestamp_error_rate"]:
                    recorded = lims
                    injected = "timestamp" if injected == "none" else injected + "+timestamp"
                out.append({"sample_id": f"{run_id}-{prop}-{t}", "run_id": run_id, "property": prop,
                            "time_min": t, "draw_time_min": t, "lims_time_min": lims,
                            "recorded_draw_time_min": recorded, "value": round(truth + eps, 2),
                            "true_value": round(truth, 3), "injected_error": injected})
        return out


# ---------------------------------------------------------------------- tags
UNIT_RULES = [("_F", "°F"), ("_psia", "psia"), ("_lb_s", "lb/s"), ("_pct", "%"), ("_ppm", "ppm"), ("_lb", "lb")]


def tag_meta(col: str) -> dict | None:
    if col == "time_min" or col.endswith("_dup") or col.startswith("eff_"):
        return None
    if col in ("LCO_T98_F", "HN_T98_F"):
        group = "target"
    elif col.startswith("T_tray"):
        group = "tray"
    elif col.startswith("MV_") or col.startswith("valve_") or col in ("SP_acc_level", "SP_T_overhead", "SP_HN_T98", "SP_LCO_T98"):
        group = "mv"
    elif col.startswith("dist_") or col == "feed_flow_lb_s" or col.startswith("SP_"):
        group = "input"
    elif col.startswith("prod_") or col in ("conversion_pct", "mass_balance_err_pct") or col in META_COLS:
        group = "signal"
    else:
        group = "reactor"
    unit = "-"
    for suf, u in UNIT_RULES:
        if col.endswith(suf):
            unit = u
            break
    if col.startswith("prod_"):
        unit = "lb/min"
    if col in ("SP_HN_T98", "SP_LCO_T98", "SP_T_overhead"):
        unit = "°F"
    label = col.replace("_F", "").replace("_", " ") if col not in ("LCO_T98_F", "HN_T98_F") else \
        ("LCO T98 (simulator truth)" if col == "LCO_T98_F" else "HN T98 (simulator truth)")
    if col == "dist_condenser_eff":
        label += " (hidden truth)"
    return {"tag": col, "label": label, "unit": unit, "group": group}


def feature_candidates(columns: list[str], s: Settings) -> list[str]:
    ex = set(s["features"]["exclude"])
    pats = s["features"]["exclude_patterns"]
    return [c for c in columns if c not in ex and not any(fnmatch.fnmatch(c, p) for p in pats)]


def regime_of(api: np.ndarray, s: Settings) -> np.ndarray:
    r = np.full(len(api), "medium", dtype=object)
    for name, (lo, hi) in s["regimes"].items():
        r[(api >= lo) & (api < hi)] = name
    return r


def assert_no_excluded(feature_names: list[str], s: Settings) -> None:
    """SDD-RAW-03 guard: raise if any excluded column reaches a feature matrix."""
    base = {f.replace("__ewma", "") for f in feature_names}
    bad = [c for c in base if c in set(s["features"]["exclude"]) or
           any(fnmatch.fnmatch(c, p) for p in s["features"]["exclude_patterns"])]
    if bad:
        raise ValueError(f"excluded columns in feature matrix: {bad}")
