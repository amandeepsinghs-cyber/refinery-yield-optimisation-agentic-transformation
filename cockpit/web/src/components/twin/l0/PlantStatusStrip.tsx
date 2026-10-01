"use client";

/** Plant status strip + crude-slate banner (SDD-L0-01): one line of plant facts, one line of crude regime state. */

import type { TwinOverview } from "@/lib/twinTypes";

const signed = (v: number, d = 2) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(d)}`;

export default function PlantStatusStrip({ data }: { data: TwinOverview }) {
  const p = data.plant;
  const c = data.crude_slate;
  const match = c?.declared_vs_detected ?? "match";
  const matchCls = match === "match" ? "OK" : match === "lagging" ? "WATCH" : "ACT";
  return (
    <div className="l0-strip" data-testid="plant-strip">
      <div className="l0-strip-row">
        <span>
          Plant mass closure <span className="mono">{p.mass_closure_pct === null ? "—" : `${signed(p.mass_closure_pct)} %`}</span>
        </span>
        <span className="l0-dot" aria-hidden>·</span>
        <span>
          <span className="mono">{p.open_decisions}</span> open decision{p.open_decisions === 1 ? "" : "s"}
        </span>
        <span className="l0-dot" aria-hidden>·</span>
        <span>
          <span className="mono">{p.agent_flags}</span> proactive agent flag{p.agent_flags === 1 ? "" : "s"}
          {p.top_flag ? <span className="muted"> ({p.top_flag})</span> : null}
        </span>
        {p.units_act + p.units_watch > 0 ? (
          <>
            <span className="l0-dot" aria-hidden>·</span>
            <span>
              {p.units_act > 0 ? <span className="twin-pill-ACT">{p.units_act} unit{p.units_act === 1 ? "" : "s"} act now</span> : null}{" "}
              {p.units_watch > 0 ? <span className="twin-pill-WATCH">{p.units_watch} drifting</span> : null}
            </span>
          </>
        ) : null}
      </div>
      {c && c.regime_id ? (
        <div className="l0-strip-row l0-crude" data-testid="crude-banner">
          <span className="l0-strip-label">Crude slate</span>
          <span>
            Declared <span className="mono">{c.declared_api?.toFixed(1)} °API</span> ({c.declared_regime_id})
          </span>
          <span className="l0-dot" aria-hidden>·</span>
          <span>
            Detected <strong>{c.regime_label}</strong> <span className="mono">{Math.round((c.p_max ?? 0) * 100)} %</span>
          </span>
          <span className="l0-dot" aria-hidden>·</span>
          <span>
            Transition <span className="mono">{c.transition_pct}%</span>
          </span>
          <span className="l0-dot" aria-hidden>·</span>
          <span>
            Novelty <span className="mono">{(c.novelty ?? 0).toFixed(2)}</span>
          </span>
          <span className={`twin-pill-${matchCls}`} style={{ marginLeft: 8 }}>{match.toUpperCase()}</span>
        </div>
      ) : null}
    </div>
  );
}
