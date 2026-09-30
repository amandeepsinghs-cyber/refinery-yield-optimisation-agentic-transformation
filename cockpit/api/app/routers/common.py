"""Shared router helpers."""
from __future__ import annotations

from fastapi import HTTPException

from ..state import get_state


def check_prop(prop: str | None) -> str:
    st = get_state()
    prop = prop or st.s.targets[0]
    if prop not in st.s.targets:
        raise HTTPException(400, detail=f"unknown property '{prop}'; expected one of {st.s.targets}")
    return prop


def default_run() -> str | None:
    st = get_state()
    b = st.bundle or {}
    for r in [st.s["data"].get("default_run")] + (b.get("test_runs") or []) + sorted(st.catalog.runs):
        if r and r in st.catalog.runs:
            return r
    return None


def check_run(run_id: str | None) -> str:
    st = get_state()
    run_id = run_id or default_run()
    if not run_id or run_id not in st.catalog.runs:
        raise HTTPException(404, detail=f"unknown run '{run_id}'")
    return run_id


def window_mask(t, frm, to):
    m = (t >= (frm if frm is not None else -10 ** 9)) & (t <= (to if to is not None else 10 ** 9))
    return m
