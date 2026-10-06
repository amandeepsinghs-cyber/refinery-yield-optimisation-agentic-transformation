"use client";

import { useState } from "react";
import type { Decision } from "@/lib/decisionsApi";
import type { TwinRegime } from "@/lib/twinTypes";
import { probPct } from "@/lib/prob";

const fx = (v: number | null | undefined, nd = 1) => (v == null || !Number.isFinite(v) ? "—" : v.toFixed(nd));
const sgn = (v: number, nd = 1) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(nd)}`;

/**
 * "Full explanation" for one decision: the data that went in, every model and its weight, every check with its
 * value and limit, and how the move was chosen. Everything shown comes from the decision the API returned.
 */
export default function FullExplanation({ d, regime }: { d: Decision; regime?: TwinRegime | null }) {
  const [open, setOpen] = useState(false);
  const o = d.observed ?? {};
  const p = d.predicted ?? {};
  const m = d.models;
  const mv = d.proposed?.moves?.[0];
  const unit = o.unit ?? p.unit ?? "°F";
  const blended = m?.members.filter((x) => x.role === "blended") ?? [];
  const wsum = blended.reduce((a, x) => a + (x.weight ?? 0), 0);
  const blend = wsum > 0 ? blended.reduce((a, x) => a + (x.weight ?? 0) * (x.estimate ?? 0), 0) / wsum : null;
  const regimes = regime?.p_regime ? Object.entries(regime.p_regime).sort((a, b) => b[1] - a[1]) : [];

  return (
    <div className="fx-wrap">
      <button type="button" className="fx-btn" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {open ? "Hide full explanation" : "Full explanation: data, models, checks and decision"}
      </button>
      {open ? (
        <div className="fx-panel" role="region" aria-label="Full explanation">
          {/* 1. DATA IN */}
          <section>
            <h4><span className="fx-n">1</span>Data in</h4>
            <ul className="fx-list">
              {m?.inputs?.length ? (
                <li><span>Process tags, every minute</span>
                  <em>{m.inputs.map((x) => `${x.label}${x.lag_min ? ` (${x.lag_min} min delay)` : ""}`).join(" · ")}</em>
                  <small>The delay is how long each tag takes to show up in the product, found from the training data.</small>
                </li>
              ) : null}
              {o.last_lab ? (
                <li><span>Last lab result</span>
                  <em>{fx(o.last_lab.value)} {unit} · drawn {o.last_lab.drawn_label}, reported {o.last_lab.reported_label} · {o.last_lab.status === "ACCEPT" ? "accepted" : o.last_lab.status.toLowerCase()}{o.last_lab.status_reason ? ` (${o.last_lab.status_reason})` : ""}</em>
                </li>
              ) : <li><span>Last lab result</span><em>none yet in this run</em></li>}
              <li><span>Next lab</span><em>{o.next_lab_label ? `${o.next_lab_label} (in ${o.next_lab_in_min} min)` : "none scheduled"}</em></li>
              {regime ? <li><span>Crude detected</span><em>{regime.regime_id} {regime.regime_label} · declared {regime.declared_regime_id}</em></li> : null}
              {d.evidence?.docs?.length ? <li><span>Operating procedure</span><em>{d.evidence.docs.join(" · ")}</em></li> : null}
              {m?.n_train_labels ? (
                <li><span>Training data</span>
                  <em>{m.n_train_labels.toLocaleString("en-IN")} labelled points from the simulator{m.n_pinned_excluded ? `; ${m.n_pinned_excluded.toLocaleString("en-IN")} points left out where the simulator caps the value` : ""}</em>
                </li>
              ) : null}
            </ul>
          </section>

          {/* 2. MODELS */}
          {m?.members?.length ? (
            <section>
              <h4><span className="fx-n">2</span>Models</h4>
              <table className="fx-table">
                <thead><tr><th>Model</th><th>Estimate</th><th>90 % band</th><th>Weight</th></tr></thead>
                <tbody>
                  {m.members.map((x) => (
                    <tr key={x.id} className={x.role === "reference" ? "ref" : ""}>
                      <td><b>{x.name}</b><small>{x.how}</small></td>
                      <td className="num">{fx(x.estimate)} {unit}</td>
                      <td className="num">± {fx(x.band90)}</td>
                      <td className="num">{x.role === "reference" ? "reference only" : `${Math.round((x.weight ?? 0) * 100)} %`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ul className="fx-list">
                <li><span>Blend</span>
                  <em>Weighted average {fx(blend)} {unit}{m.bias != null && Math.abs(m.bias) >= 0.05 ? `, corrected ${sgn(m.bias)} °F by the recent lab results` : ""} → <b>{fx(o.estimate)} ± {fx(o.sigma)} {unit}</b>, chance on spec {probPct(p.p_on_spec_before)}</em>
                </li>
                {m.weight_source ? <li><span>Weights from</span><em>{m.weight_source}</em></li> : null}
                {m.members.some((x) => x.role === "reference") ? (
                  <li><span>Why one is reference only</span><em>The linear model&apos;s band is too wide to sharpen the estimate, so it is shown for comparison but not blended.</em></li>
                ) : null}
                {m.sigma_scale != null ? (
                  <li><span>Band check</span><em>Bands scaled ×{fx(m.sigma_scale, 2)} so that the 90 % band held the true value about 90 % of the time on runs the models never saw.</em></li>
                ) : null}
                {regimes.length ? (
                  <li><span>Crude model</span>
                    <em>{regimes.map(([r, v]) => `${r} ${probPct(v)}`).join(" · ")} — from coke/feed, riser ΔT, fuel/feed, regenerator temperature, conversion and tray ΔT. Used for the &quot;labels for this crude&quot; check.</em>
                  </li>
                ) : null}
              </ul>
            </section>
          ) : null}

          {/* 3. CHECKS */}
          {d.gates?.length ? (
            <section>
              <h4><span className="fx-n">3</span>Checks before advising — {d.gates.filter((g) => g.pass).length} of {d.gates.length} pass</h4>
              <ul className="fx-checks">
                {d.gates.map((g) => (
                  <li key={g.id} className={g.value == null ? "nodata" : g.pass ? "pass" : "fail"}>
                    <i aria-hidden>{g.value == null ? "–" : g.pass ? "✓" : "✕"}</i>
                    <span>{g.name ?? g.id}</span>
                    <em className="num">{g.value == null ? "no data" : `${fx(g.value, 2)} ${g.op ?? ""} ${fx(g.limit, 2)}${g.unit ? ` ${g.unit}` : ""}`}</em>
                  </li>
                ))}
              </ul>
              <p className="fx-note">Any failed stop-rule turns the advice into &quot;Not yet&quot; with the reason.</p>
            </section>
          ) : null}

          {/* 4. DECISION */}
          <section>
            <h4><span className="fx-n">4</span>Decision</h4>
            <ul className="fx-list">
              <li><span>Advice</span><em><b>{d.headline}</b></em></li>
              {mv && p.target != null ? (
                <li><span>How it was chosen</span>
                  <em>Searched moves in 0.5 °F steps up to the 5 °F SOP step. Picked the one that brings the estimate closest to the {fx(p.target)} °F target while keeping at least 95 % chance on spec.</em>
                </li>
              ) : mv ? (
                <li><span>How it was chosen</span><em>Smallest move inside the SOP step that brings the chance back to at least 95 %.</em></li>
              ) : null}
              {mv ? (
                <li><span>Effect</span>
                  <em>{mv.label} {fx(mv.from)} → {fx(mv.to)} {mv.unit}; estimate {fx(p.mu_before)} → {fx(p.mu_after)} {unit}{p.target != null ? ` (target ${fx(p.target)})` : ""}; chance on spec {probPct(p.p_on_spec_before)} → {probPct(p.p_on_spec_after)}{p.spec_max != null ? ` (spec ${fx(p.spec_max)} ${unit})` : ""}</em>
                </li>
              ) : null}
              {d.withheld_text ? <li><span>Withheld because</span><em>{d.withheld_text}</em></li> : null}
              {d.proposed?.alternative ? <li><span>If you hold</span><em>{d.proposed.alternative}</em></li> : null}
              <li><span>Who decides</span><em>Advisory only. The operator accepts, holds or declines; the choice goes to the decision record. Nothing is written to the DCS.</em></li>
            </ul>
          </section>
        </div>
      ) : null}
    </div>
  );
}
