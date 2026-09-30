"""Distribution Spread Gate (SDD §5.10, SDD-GATE-01..07) with hysteresis and exact SDD-GATE-04 messages."""
from __future__ import annotations

from dataclasses import dataclass

MSG_WIDE = ("Distribution spread too wide — W90 = {w90:.1f} °F exceeds limit {limit:.1f} °F. "
            "No recommendation issued. Likely cause: {cause}. Suggested action: {action}.")
MSG_BIMODAL = ("Distribution spread too wide — models disagree (bimodal, D = {d:.1f}). "
               "No recommendation issued. Likely cause: {cause}. Suggested action: {action}.")
MSG_HYST = ("Distribution spread too wide — W90 = {w90:.1f} °F has not yet stayed below {clear:.1f} °F for {n} minutes. "
            "No recommendation issued. Likely cause: {cause}. Suggested action: {action}.")


def gate_cause(bimodal: bool, s2_fail: bool, P: float, sigma_lab: float) -> str:
    """SDD-GATE-05 cause priority."""
    if bimodal:
        return "models disagree"
    if s2_fail:
        return "inputs outside the training envelope"
    if P > 2 * sigma_lab ** 2:
        return "bias uncertain, no recent accepted lab"
    return "high predictive uncertainty"


def gate_action(s5_failed_tag: str | None) -> str:
    """SDD-GATE-05 action; 'hold current set point' is always appended."""
    first = f"check sensor {s5_failed_tag}" if s5_failed_tag else "request a lab sample"
    return f"{first}; hold current set point"


@dataclass
class GateResult:
    status: str            # PASS | WITHHELD
    reason: str | None     # None | wide | bimodal | hysteresis
    message: str | None


class SpreadGate:
    """Stateful per (run, property). Call step() once per simulated minute in time order."""

    def __init__(self, w90_max: float, ratio: float = 0.9, n_clear: int = 10):
        self.w90_max, self.ratio, self.n_clear = w90_max, ratio, n_clear
        self.status = "PASS"
        self.clear_count = 0

    def step(self, w90: float, bimodal: bool, d: float, cause: str, action: str) -> GateResult:
        limit, clear = self.w90_max, self.ratio * self.w90_max
        if bimodal:
            self.status, self.clear_count = "WITHHELD", 0
            if w90 > limit:
                return GateResult("WITHHELD", "wide", MSG_WIDE.format(w90=w90, limit=limit, cause=cause, action=action))
            return GateResult("WITHHELD", "bimodal", MSG_BIMODAL.format(d=d, cause=cause, action=action))
        if w90 > limit:
            self.status, self.clear_count = "WITHHELD", 0
            return GateResult("WITHHELD", "wide", MSG_WIDE.format(w90=w90, limit=limit, cause=cause, action=action))
        if self.status == "PASS":
            return GateResult("PASS", None, None)
        # currently WITHHELD, W90 within the limit and not bimodal -> hysteresis (SDD-GATE-03)
        if w90 < clear:
            self.clear_count += 1
        else:
            self.clear_count = 0
        if self.clear_count >= self.n_clear:
            self.status, self.clear_count = "PASS", 0
            return GateResult("PASS", None, None)
        return GateResult("WITHHELD", "hysteresis",
                          MSG_HYST.format(w90=w90, clear=clear, n=self.n_clear, cause=cause, action=action))
