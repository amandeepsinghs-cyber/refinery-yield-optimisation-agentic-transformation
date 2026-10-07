"use client";

/** Rail card 1 — Crude family & bias reset (E1 + E2, SDD-L1-03). Weights are not regime-based (7 Oct). */

import { probPct } from "@/lib/prob";
import { clock, num } from "@/lib/format";
import type { TwinModels, TwinRegime } from "@/lib/twinTypes";

const REGIME_COLOR: Record<string, string> = { R1: "#0369a1", R2: "#047857", R3: "#ca8a04", R4: "#b91c1c" };

export default function RegimeCard({ regime, committee }: { regime: TwinRegime | null; committee: TwinModels["committee"] }) {
  if (!regime) return null;
  const probs = Object.entries(regime.p_regime ?? {}).sort(([a], [b]) => a.localeCompare(b));
  const match = regime.declared_vs_detected === "match";
  return (
    <section className="l1-card" data-testid="rail-regime">
      <h3 className="l1-card-title">Crude family &amp; bias reset</h3>
      <div className="l1-regime-head">
        <span className="l1-regime-id" style={{ background: REGIME_COLOR[regime.regime_id] ?? "#4338ca" }}>{regime.regime_id}</span>
        <span className="l1-regime-label">{regime.regime_label}</span>
      </div>
      <div className="l1-bars" role="img" aria-label="Regime probabilities">
        {probs.map(([id, p]) => (
          <div key={id} className="l1-bar-row" title={`${id}: ${probPct(p)}`}>
            <span className="l1-bar-k mono">{id}</span>
            <span className="l1-bar-track"><span className="l1-bar-fill" style={{ width: `${Math.max(2, p * 100)}%`, background: REGIME_COLOR[id] ?? "#4338ca" }} /></span>
            <span className="l1-bar-v mono">{probPct(p, "")}</span>
          </div>
        ))}
      </div>
      <dl className="l1-kv">
        <dt>Declared vs detected</dt>
        <dd className={match ? "ok" : "warn"}>
          {regime.declared_regime_id} (API {num(regime.declared_api, 1)}) → {regime.regime_id} · {match ? "match" : regime.declared_vs_detected}
        </dd>
        <dt>Detected at</dt>
        <dd className="mono">{regime.detected_at_min != null ? clock(regime.detected_at_min) : "—"}{regime.detection_delay_min != null ? ` (${regime.detection_delay_min >= 0 ? "+" : ""}${regime.detection_delay_min} min)` : ""}</dd>
        <dt>Novelty</dt>
        <dd className="mono">{num(regime.novelty, 2)} · transition {regime.transition_pct}%</dd>
        {committee && (
          <>
            <dt>Bias reset</dt>
            <dd className="mono">{committee.bias_reset_at_min != null ? clock(committee.bias_reset_at_min) : "—"}{committee.bias_F != null ? ` · offset ${num(committee.bias_F, 2)} °F` : ""}</dd>
            <dt>Model weights</dt>
            <dd>{committee.weight_source === "recent_labs" ? "from recent lab accuracy" : "from held-out accuracy"} · not set by the crude</dd>
          </>
        )}
      </dl>
      {committee?.reason && <p className="l1-card-note">{committee.reason}</p>}
    </section>
  );
}
