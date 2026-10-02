"use client";

/**
 * L0 rail — Crude / assay adaptation (verbatim Part 5 Screen A "crude/assay adaptation panel"): declared vs
 * detected regime, the classifier's regime probabilities as coloured bars, novelty, transition progress and how
 * long ago the switch settled. Colours per regime (never grey); state pill follows declared_vs_detected.
 */

import type { TwinOverview } from "@/lib/twinTypes";

const REGIME_COLOR: Record<string, string> = { R1: "var(--m-hybrid)", R2: "var(--m-pinn)", R3: "var(--m-gpr)", R4: "var(--red)" };
const REGIME_NAME: Record<string, string> = { R1: "Heavy", R2: "Medium-heavy", R3: "Medium", R4: "Light" };

export default function CrudeAdaptationCard({ data }: { data: TwinOverview }) {
  const c = data.crude_slate;
  if (!c || !c.regime_id) return null;
  const match = c.declared_vs_detected ?? "match";
  const cls = match === "match" ? "OK" : match === "lagging" ? "WATCH" : "ACT";
  const t = data.plant.time_min;
  const since = c.last_switch_min != null ? t - c.last_switch_min : null;
  const ids = ["R1", "R2", "R3", "R4"];
  const pr = c.p_regime ?? {};
  const pOf = (id: string) => (pr[id] != null ? pr[id] : id === c.regime_id ? (c.p_max ?? 0) : 0);
  return (
    <section className="l0-rail-card crude" aria-label="Crude and assay adaptation" data-testid="crude-adaptation">
      <div className="l0-rail-title">
        Crude · assay adaptation <span className={`twin-pill-${cls}`}>{match.toUpperCase()}</span>
      </div>
      <div className="crude-body">
        <div className="crude-row">
          <span className="crude-k">Declared</span>
          <span className="crude-v mono">{c.declared_api?.toFixed(1)} °API · {c.declared_regime_id}</span>
          <span className="crude-k">Detected</span>
          <span className="crude-v"><strong>{c.regime_label}</strong></span>
        </div>
        <div className="crude-bars" role="list" aria-label="Regime probabilities">
          {ids.map((id) => {
            const p = pOf(id);
            return (
              <div key={id} className="crude-bar" role="listitem">
                <span className="crude-bar-id mono" style={{ color: REGIME_COLOR[id] }}>{id}</span>
                <span className="crude-bar-track"><span className="crude-bar-fill" style={{ width: `${Math.max(2, p * 100)}%`, background: REGIME_COLOR[id] }} /></span>
                <span className="crude-bar-p mono">{Math.round(p * 100)} %</span>
                <span className="crude-bar-name muted">{REGIME_NAME[id]}</span>
              </div>
            );
          })}
        </div>
        <dl className="crude-kv">
          <dt>Transition</dt><dd className="mono">{c.transition_pct}% {since != null ? `· switched ${since} min ago` : ""}</dd>
          <dt>Novelty</dt><dd className={`mono ${(c.novelty ?? 0) > 0.5 ? "warn" : ""}`}>{(c.novelty ?? 0).toFixed(2)} {(c.novelty ?? 0) > 0.5 ? "— outside training envelope" : "— inside envelope"}</dd>
          <dt>Settled</dt><dd className="mono">{c.settled_min != null ? `${c.settled_min} min after switch` : "—"}</dd>
          <dt>Models</dt><dd>committee weights re-mixed for {c.regime_id}; surrogate sensitivities switched</dd>
        </dl>
      </div>
    </section>
  );
}
