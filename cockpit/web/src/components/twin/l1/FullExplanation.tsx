"use client";

import type { Decision } from "@/lib/decisionsApi";
import type { TwinRegime } from "@/lib/twinTypes";
import { probPct } from "@/lib/prob";

const fx = (v: number | null | undefined, nd = 1) => (v == null || !Number.isFinite(v) ? "—" : v.toFixed(nd));
const sgn = (v: number, nd = 1) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(nd)}`;
const val = (v: number | null, unit: string) =>
  v == null ? "—" : `${fx(v, Math.abs(v) >= 100 ? 1 : 3)}${unit ? ` ${unit}` : ""}`;

/** One collapsible section: a numbered one-line summary that opens to the detail. */
function Sec({ n, title, gist, children }: { n: number; title: string; gist: string; children: React.ReactNode }) {
  return (
    <details className="fx-sec">
      <summary><span className="fx-n">{n}</span><b>{title}</b><span className="fx-gist">{gist}</span></summary>
      <div className="fx-body">{children}</div>
    </details>
  );
}

/**
 * "Full explanation" for one decision, as an expandable menu: the data that went in (exact historian columns and their
 * values at this minute), each trained model with its fitted formula, output and weight, every check with its value
 * and limit, and how the move was chosen. Everything shown comes from the decision the API returned.
 */
export default function FullExplanation({ d, regime }: { d: Decision; regime?: TwinRegime | null }) {
  const o = d.observed ?? {};
  const p = d.predicted ?? {};
  const m = d.models;
  const mv = d.proposed?.moves?.[0];
  const unit = o.unit ?? p.unit ?? "°F";
  const blended = m?.members.filter((x) => x.role === "blended") ?? [];
  const wsum = blended.reduce((a, x) => a + (x.weight ?? 0), 0);
  const blend = wsum > 0 ? blended.reduce((a, x) => a + (x.weight ?? 0) * (x.estimate ?? 0), 0) / wsum : null;
  const feed = regime?.feed;   // DECISIONS S-8: feed properties, not the crude name
  const nPass = d.gates?.filter((g) => g.pass).length ?? 0;
  const at = d.created_label ?? "this minute";
  const nDiag = m?.inputs.filter((x) => x.label.includes("simulator diagnostic")).length ?? 0;

  return (
    <details className="fx-wrap">
      <summary className="fx-btn">Full explanation: which data goes in, what each model does with it, and how the decision is taken</summary>
      <div className="fx-panel" role="region" aria-label="Full explanation">
        {/* the whole chain in one line, with this minute's numbers */}
        <ol className="fx-flow">
          {m?.inputs?.length ? <li><b>{m.inputs.length}</b> historian columns</li> : null}
          {m?.members?.length ? <li><b>{m.members.length}</b> models, {blended.length} blended</li> : null}
          {blend != null ? <li>blend <b>{fx(blend)}</b>{m?.bias != null && Math.abs(m.bias) >= 0.05 ? <>, lab correction <b>{sgn(m.bias)}</b></> : null}</li> : null}
          {o.estimate != null ? <li>estimate <b>{fx(o.estimate)} ± {fx(o.sigma)} {unit}</b></li> : null}
          {d.gates?.length ? <li><b>{nPass} of {d.gates.length}</b> checks pass</li> : null}
          <li><b>{mv ? `${mv.delta >= 0 ? "+" : "−"}${Math.abs(mv.delta).toFixed(1)} ${mv.unit}` : d.status === "withheld" ? "Not yet" : "no move"}</b></li>
        </ol>

        <Sec n={1} title="Data in" gist={`last lab ${o.last_lab ? `${fx(o.last_lab.value)} ${unit} (${o.last_lab.drawn_label})` : "none yet"} · next lab ${o.next_lab_label ?? "none scheduled"}${feed ? ` · feed API ${fx(feed.api_est, 1)}` : ""}`}>
          <ul className="fx-list">
            {o.last_lab ? (
              <li><span>Last lab result</span>
                <em><code>{o.last_lab.sample_id}</code>: {fx(o.last_lab.value)} {unit} · drawn {o.last_lab.drawn_label}, reported {o.last_lab.reported_label} · {o.last_lab.status === "ACCEPT" ? "accepted" : o.last_lab.status.toLowerCase()}{o.last_lab.status_reason ? ` (${o.last_lab.status_reason})` : ""}</em>
              </li>
            ) : <li><span>Last lab result</span><em>none yet in this run</em></li>}
            <li><span>Next lab</span><em>{o.next_lab_label ? `${o.next_lab_label} (in ${o.next_lab_in_min} min)` : "none scheduled"}</em></li>
            {feed ? <li><span>Feed</span><em>estimated API {fx(feed.api_est, 1)} ± {fx(feed.api_band, 1)} ({feed.feed_class_label}), {feed.state}{feed.api_declared != null ? ` · schedule says ${fx(feed.api_declared, 1)}` : ""}{feed.crude_family_context ? ` · context: crude slate ${feed.crude_family_context}` : ""}</em></li> : null}
            {d.evidence?.docs?.length ? <li><span>Operating procedure</span><em>{d.evidence.docs.join(" · ")}</em></li> : null}
            {d.evidence?.lakehouse ? <li><span>Stored in</span><em><code>{d.evidence.lakehouse}</code></em></li> : null}
            {m?.n_train_labels ? (
              <li><span>Training data</span>
                <em>{m.n_train_runs ? `${m.n_train_runs} simulated runs; ` : ""}{m.n_train_labels.toLocaleString("en-IN")} labelled minutes (simulator T98 every 5 min){m.n_pinned_excluded ? `; ${m.n_pinned_excluded.toLocaleString("en-IN")} minutes left out where the simulator caps T98` : ""}</em>
              </li>
            ) : null}
          </ul>
        </Sec>

        {m?.inputs?.length ? (
          <Sec n={2} title="Columns the models read" gist={`${m.inputs.length} columns, values at ${at}${nDiag ? ` · ${nDiag} are simulator diagnostics` : ""}`}>
            <table className="fx-table">
              <thead><tr><th>Column</th><th>What it is</th><th>Value at {at}</th><th>Read by</th></tr></thead>
              <tbody>
                {m.inputs.map((x) => (
                  <tr key={x.tag} className={x.label.includes("simulator diagnostic") ? "warn" : ""}>
                    <td><code>{x.tag}</code></td>
                    <td>{x.label}</td>
                    <td className="num">{val(x.value, x.unit)}</td>
                    <td className="num">{["L", "G", "H", "N"].map((k) => <span key={k} className={`fx-by${x.used_by.includes(k) ? " on" : ""}`}>{k}</span>)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="fx-note">L linear · G Gaussian process · H physics + correction · N neural nets. Each model picked its own columns at training: the draw-tray temperature always, then the columns most correlated with T98 (at most 12–15), skipping any more than 0.88 correlated with one already picked. Amber rows are simulator diagnostics with no plant equivalent.</p>
          </Sec>
        ) : null}

        {m?.members?.length ? (
          <Sec n={3} title="Models: what each one computed" gist={m.members.map((x) => `${x.short} ${fx(x.estimate)}${x.role === "reference" ? " (ref.)" : ` × ${Math.round((x.weight ?? 0) * 100)} %`}`).join(" · ")}>
            {m.members.map((x) => (
              <details key={x.id} className={`fx-model${x.role === "reference" ? " ref" : ""}`}>
                <summary>
                  <b>{x.short} · {x.name}</b>
                  <span className="num">{fx(x.estimate)} {unit} ± {fx(x.band90)}</span>
                  <span className="num">{x.role === "reference" ? "reference only" : `weight ${Math.round((x.weight ?? 0) * 100)} %`}</span>
                </summary>
                <div className="fx-body">
                  <p className="fx-formula">{x.formula}</p>
                  <p className="fx-note">{x.n_inputs} columns · trained on {x.trained_on_runs} simulated runs · ± is the 90 % band</p>
                  <ul className="fx-cols">
                    {m.inputs.filter((c) => c.used_by.includes(x.short)).map((c) => (
                      <li key={c.tag} className={c.label.includes("simulator diagnostic") ? "warn" : ""}><code>{c.tag}</code><span>{c.label}</span><em className="num">{val(c.value, c.unit)}</em></li>
                    ))}
                  </ul>
                </div>
              </details>
            ))}
            <ul className="fx-list">
              <li><span>Blend</span>
                <em>{blended.map((x) => `${Math.round((x.weight ?? 0) * 100)} % × ${fx(x.estimate)}`).join(" + ")} = {fx(blend)} {unit}{m.bias != null && Math.abs(m.bias) >= 0.05 ? `; lab correction ${sgn(m.bias)} °F` : ""} → <b>{fx(o.estimate)} ± {fx(o.sigma)} {unit}</b>, chance on spec {probPct(p.p_on_spec_before)}</em>
              </li>
              {m.weight_source ? <li><span>Weights from</span><em>{m.weight_source}</em></li> : null}
              {m.members.some((x) => x.role === "reference") ? (
                <li><span>Why L is reference only</span><em>Its band is too wide to sharpen the estimate, so it is shown for comparison but not blended.</em></li>
              ) : null}
              {m.sigma_scale != null ? (
                <li><span>Band check</span><em>Bands scaled ×{fx(m.sigma_scale, 2)} so that the 90 % band held the true value about 90 % of the time on runs the models never saw.</em></li>
              ) : null}
              {feed ? (
                <li><span>Feed model</span>
                  <em>Feed API {fx(feed.api_est, 1)} ± {fx(feed.api_band, 1)}, novelty {fx(feed.novelty, 2)} — estimated from coke/feed, riser ΔT, fuel/feed, regenerator temperature, conversion and tray ΔT{feed.model?.heldout ? `; held-out error ${fx(feed.model.heldout.mae_api, 2)} API` : ""}. The bias resets when a new feed settles; advice is held while it changes.</em>
                </li>
              ) : null}
            </ul>
          </Sec>
        ) : null}

        {d.gates?.length ? (
          <Sec n={4} title="Checks before advising" gist={`${nPass} of ${d.gates.length} pass`}>
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
          </Sec>
        ) : null}

        <Sec n={5} title="Decision" gist={d.headline}>
          <ul className="fx-list">
            {mv && p.target != null ? (
              <li><span>How it was chosen</span>
                <em>Tried every move from −5 to +5 °F in 0.5 °F steps (5 °F = SOP step). For each, shifted the estimate by the move (assumes T98 follows its set point 1 : 1 — a default, because the training runs have no set-point step tests) and recomputed the chance on spec. Kept the moves with at least 95 % chance; picked the one that lands closest to the {fx(p.target)} °F target.</em>
              </li>
            ) : mv && d.scripted ? (
              <li><span>How it was chosen</span><em>Scripted outcome for the demo: move = drift ÷ a fixed response gain{p.gain != null ? ` (${p.gain} ${p.unit ?? ""} per ${mv.unit})` : ""}, rounded to the step and capped at the SOP step{d.gain_source === "measured" ? "; the gain is measured from simulator step tests, the chance band is scripted" : ""}. Not a model search.</em></li>
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
        </Sec>
      </div>
    </details>
  );
}
