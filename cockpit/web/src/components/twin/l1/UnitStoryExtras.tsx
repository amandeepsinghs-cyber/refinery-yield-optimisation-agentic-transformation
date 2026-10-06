"use client";

/**
 * Unit page — the five items agreed on 2 Oct (11:01, "yes on both") that were still open after the crash:
 *   ② EstimateTrack    the soft-sensor estimate over the shift, its 90 % band, and the lab points on it
 *   ③ EarlierDecisions what was accepted / held / declined earlier on this decision
 *   ④ WhatSetsTheMove  which limit actually sizes the move, and which check is closest to stopping the advice
 *   ④ MissingData      for a "Not yet" decision: exactly what data is missing and how it gets fixed
 *   ① TagList          the full tag list (now, shift min / max)
 *   footer UnitActions history of actions taken on this unit (from the decision record)
 */

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchJson, useAudit, useEstimatesTimeseries } from "@/lib/api";
import type { AuditRow } from "@/lib/types";
import type { TwinWorkbench } from "@/lib/twinTypes";
import type { Decision } from "@/lib/decisionsApi";
import { clock } from "@/lib/format";
import { probPct } from "@/lib/prob";

const fx = (v: number | null | undefined, d = 1) => (v == null || !Number.isFinite(v) ? "—" : v.toFixed(d));

/* ------------------------------------------------------------------------------------------------------------ */
/* ② soft-sensor estimate over time with the lab points                                                          */

interface LabPoint { time_min: number; value: number; status: string; status_reason?: string }

export function EstimateTrack({ runId, prop, t, label }: { runId: string | null; prop: string; t: number; label: string }) {
  const est = useEstimatesTimeseries(runId, prop, { from: 0, to: t }, 2000, !!runId);
  const labs = useQuery({
    queryKey: ["labs", runId, prop],
    queryFn: () => fetchJson<{ labs: LabPoint[] }>(`/api/labs?run_id=${encodeURIComponent(runId ?? "")}&property=${prop}`),
    enabled: !!runId,
  });

  const view = useMemo(() => {
    const e = est.data;
    if (!e) return null;
    const t0 = Math.max(0, t - 720);
    const idx = e.time_min.map((x, i) => [x, i] as const).filter(([x]) => x >= t0 && x <= t).map(([, i]) => i);
    if (idx.length < 2) return null;
    const pts = idx.map((i) => ({ x: e.time_min[i], m: e.mixture.mean[i], lo: e.mixture.q05[i], hi: e.mixture.q95[i], tr: e.truth[i] }));
    const lab = (labs.data?.labs ?? []).filter((l) => l.time_min >= t0 && l.time_min <= t);
    const ys = [...pts.flatMap((p) => [p.lo, p.hi, p.tr]), ...lab.map((l) => l.value), e.spec_max ?? null].filter((v): v is number => v != null && Number.isFinite(v));
    let y0 = Math.min(...ys), y1 = Math.max(...ys);
    const pad = Math.max(1, (y1 - y0) * 0.08); y0 -= pad; y1 += pad;
    return { pts, lab, t0, y0, y1, spec: e.spec_max ?? null };
  }, [est.data, labs.data, t]);

  if (!view) return <p className="us-note subtle">The estimate history is loading…</p>;
  const W = 900, H = 200, L = 44, R = 12, T = 10, B = 24;
  const sx = (x: number) => L + ((x - view.t0) / Math.max(1, t - view.t0)) * (W - L - R);
  const sy = (y: number) => T + (1 - (y - view.y0) / (view.y1 - view.y0)) * (H - T - B);
  const path = (k: "m" | "tr") => view.pts.filter((p) => p[k] != null).map((p, i) => `${i ? "L" : "M"}${sx(p.x).toFixed(1)} ${sy(p[k] as number).toFixed(1)}`).join(" ");
  const band = view.pts.filter((p) => p.lo != null && p.hi != null);
  const area = band.length ? `M${band.map((p) => `${sx(p.x).toFixed(1)} ${sy(p.hi as number).toFixed(1)}`).join(" L")} L${band.slice().reverse().map((p) => `${sx(p.x).toFixed(1)} ${sy(p.lo as number).toFixed(1)}`).join(" L")} Z` : "";
  const ticks = Array.from({ length: 4 }, (_, i) => view.y0 + ((i + 0.5) * (view.y1 - view.y0)) / 4);
  const hours = Array.from({ length: 13 }, (_, i) => Math.ceil(view.t0 / 60) * 60 + i * 60).filter((x) => x <= t);

  return (
    <figure className="us-track">
      <figcaption>
        <b>{label} — soft-sensor estimate between lab samples</b>
        <span className="lg"><i className="k-est" />estimate</span>
        <span className="lg"><i className="k-band" />90 % band</span>
        <span className="lg"><i className="k-truth" />measured (simulator truth)</span>
        <span className="lg"><i className="k-lab" />lab sample</span>
        {view.spec != null ? <span className="lg"><i className="k-spec" />spec {fx(view.spec, 0)}</span> : null}
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label} estimate, band and lab samples over the shift`}>
        {ticks.map((y) => <g key={y}><line x1={L} x2={W - R} y1={sy(y)} y2={sy(y)} className="g" /><text x={L - 6} y={sy(y) + 4} className="ax" textAnchor="end">{y.toFixed(0)}</text></g>)}
        {hours.map((x) => <text key={x} x={sx(x)} y={H - 6} className="ax" textAnchor="middle">{clock(x)}</text>)}
        {view.spec != null ? <line x1={L} x2={W - R} y1={sy(view.spec)} y2={sy(view.spec)} className="spec" /> : null}
        <path d={area} className="band" />
        <path d={path("tr")} className="truth" />
        <path d={path("m")} className="est" />
        {view.lab.map((l) => (
          <g key={l.time_min} className={`lab s-${l.status}`}>
            <circle cx={sx(l.time_min)} cy={sy(l.value)} r={5} />
            <title>{`Lab ${clock(l.time_min)}: ${fx(l.value)} — ${l.status}${l.status_reason ? ` (${l.status_reason})` : ""}`}</title>
          </g>
        ))}
      </svg>
      <p className="us-note subtle">
        {view.lab.length
          ? view.lab.map((l) => `Lab ${clock(l.time_min)}: ${fx(l.value)}${l.status === "REJECT" ? " — rejected, not used" : l.status === "HOLD" ? " — on hold" : " — accepted"}`).join(" · ")
          : "No lab sample in this window."}
        {" "}Between samples the estimate is the only reading of product quality.
      </p>
    </figure>
  );
}

/* ------------------------------------------------------------------------------------------------------------ */
/* ③ earlier decisions / footer: actions on this unit — both read the decision record                           */

const VERB: Record<string, string> = { accept: "Accepted", hold: "Held", declin: "Declined" };
function verbOf(action: string) {
  const a = action.toLowerCase();
  return Object.entries(VERB).find(([k]) => a.includes(k))?.[1] ?? action;
}
function whoOf(actor: string) {
  if (actor === "operator" || actor === "cockpit-operator") return "Operator";
  const m = actor.match(/^shift_lead_(\w+)$/);
  return m ? `${m[1][0].toUpperCase()}${m[1].slice(1)}, shift lead` : actor.replace(/[_-]/g, " ");
}
const det = (r: AuditRow) => (r.detail && typeof r.detail === "object" ? (r.detail as Record<string, unknown>) : {});

export function useUnitActions(unitId: string) {
  const audit = useAudit("");
  return useMemo(
    () => (audit.data ?? []).filter((r) => r.actor !== "pytest" && !r.actor.startsWith("system:") && det(r).unit_id === unitId),
    [audit.data, unitId],
  );
}

const when = (ts: string) => `${ts.slice(8, 10)}/${ts.slice(5, 7)} ${ts.slice(11, 16)}`;

export function EarlierDecisions({ rows, d }: { rows: AuditRow[]; d: Decision }) {
  const base = d.id.replace(/-\d+$/, "");
  const mine = rows.filter((r) => r.target.startsWith(base)).slice(0, 4);
  if (!mine.length) return <p className="us-note subtle">No earlier action on this exact decision. Other actions on this unit are listed at the bottom of the page.</p>;
  return (
    <ul className="us-earlier">
      {mine.map((r) => {
        const note = det(r).note;
        return (
          <li key={r.audit_id}>
            <span className="num">{when(r.ts)}</span>
            <b className={`v-${verbOf(r.action).toLowerCase()}`}>{verbOf(r.action)}</b>
            <span>by {whoOf(r.actor)}</span>
            {typeof note === "string" && note && note !== "pytest" ? <em>“{note}”</em> : null}
          </li>
        );
      })}
    </ul>
  );
}

export function UnitActions({ rows }: { rows: AuditRow[] }) {
  if (!rows.length) return <p className="us-note subtle">No actions recorded on this unit yet.</p>;
  return (
    <>
      <ol className="us-events us-acts">
        {rows.slice(0, 6).map((r) => {
          const dd = det(r);
          const mv = Array.isArray(dd.moves) ? (dd.moves as { label?: string; from?: number; to?: number; unit?: string }[])[0] : null;
          const what = mv ? `${mv.label} ${fx(mv.from)} → ${fx(mv.to)} ${mv.unit ?? ""}` : typeof dd.parameter === "string" ? String(dd.parameter).replace(/^SP_T_preheat_F \/ /, "Preheat set point / ") : r.target;
          return (
            <li key={r.audit_id}>
              <span className="num">{when(r.ts)}</span>
              <span className="what">{verbOf(r.action)} · {what} <span className="subtle">· {whoOf(r.actor)}</span></span>
            </li>
          );
        })}
      </ol>
      <Link href="/audit" className="us-more-link">Full decision record →</Link>
    </>
  );
}

/* ------------------------------------------------------------------------------------------------------------ */
/* ④ what sizes the move, and what is closest to stopping it                                                     */

/** A cut-point move made while already on spec: its purpose is to take back margin (less product given away), not to reach 95 %. */
export function isGiveBack(d: Decision): boolean {
  return d.type === "D1" && !d.predicted?.goal_label && (d.predicted?.p_on_spec_before ?? 0) >= 0.95;
}

export function WhatSetsTheMove({ d, stepLimit = 5 }: { d: Decision; stepLimit?: number }) {
  const mv = d.proposed.moves[0];
  const p = d.predicted;
  if (!mv || !p) return null;
  const used = Math.abs(mv.delta ?? mv.to - mv.from);
  const near = d.gates
    .filter((g) => g.value != null && g.limit)
    .map((g) => ({ g, r: g.op === "≥" ? Math.abs(g.limit!) / Math.max(1e-9, Math.abs(g.value!)) : Math.abs(g.value!) / Math.abs(g.limit!) }))
    .sort((a, b) => b.r - a.r)[0];
  const nd = (p.step ?? 0.5) < 0.1 ? 2 : 1;
  const tu = p.unit ?? mv.unit;
  const lim = p.spec_max ?? p.spec_min;
  const giveBack = isGiveBack(d);
  return (
    <ul className="us-binding">
      {d.type === "D1" && p.target != null ? (
        <li className="bind">
          <span>Sets the move</span>
          <b>Land on the {fx(p.target, 1)} {tu} target, never below 95 % chance on spec</b>
          <em>{mv.delta != null && mv.delta < 0 ? "−" : "+"}{fx(used, nd)} {mv.unit} takes the estimate from {fx(p.mu_before, 1)} to {fx(p.mu_after, 1)} {tu}{Math.abs(used - stepLimit) < 1e-6 && Math.abs((p.mu_after ?? 0) - p.target) > 1 ? `; the ${fx(stepLimit, nd)} ${mv.unit} SOP step stops it short, so a second step follows` : " — on target"}. Chance on spec {probPct(p.p_on_spec_after)}.</em>
        </li>
      ) : giveBack ? (
        <li className="bind">
          <span>Sets the move</span>
          <b>Take back margin while the chance on spec stays at 95 % or more</b>
          <em>Already {probPct(p.p_on_spec_before)} on spec, so the move runs the cut closer to spec and keeps more product in the right stream: {mv.delta != null && mv.delta < 0 ? "−" : "+"}{fx(used, nd)} {mv.unit} keeps {probPct(p.p_on_spec_after)}{d.diagnosed?.conservative ? "; half size because one check is amber" : ""}.</em>
        </li>
      ) : (
        <li className="bind">
          <span>Sets the move</span>
          <b>{p.goal_label ?? "Chance on spec"} must reach 95 %</b>
          <em>The search stops at the smallest move that gets there: {mv.delta != null && mv.delta < 0 ? "−" : "+"}{fx(used, nd)} {mv.unit} gives {probPct(p.p_on_spec_after)}.</em>
        </li>
      )}
      <li>
        <span>{Math.abs(used - stepLimit) < 1e-6 ? "Limiting" : "Not limiting"}</span>
        <b>SOP step ≤ {fx(stepLimit, nd)} {mv.unit}</b>
        <em>{fx(used, nd)} of {fx(stepLimit, nd)} {mv.unit} used.</em>
      </li>
      {p.margin_after != null && lim != null ? (
        <li className={p.margin_after < 1 && !p.goal_label ? "warn" : ""}>
          <span>{p.margin_after < 1 && !p.goal_label ? "Tight" : "Room"}</span>
          <b>Margin to the {fx(lim, 1)} {tu} {p.goal_label ? "band edge" : "spec"} after the move</b>
          <em>{fx(p.margin_after)} {tu} at the most likely value{p.margin_after < 1 && !p.goal_label ? " — little room; the lab at the next sample confirms it." : "."}</em>
        </li>
      ) : null}
      {near && near.r > 0.85 ? (
        <li className="warn">
          <span>Closest check</span>
          <b>{near.g.name ?? near.g.id}: {fx(near.g.value)} against {fx(near.g.limit)}{near.g.unit ? ` ${near.g.unit}` : ""}</b>
          <em>{Math.round(near.r * 100)} % of its limit. If it crosses, the cockpit withholds this advice and asks for a lab sample.</em>
        </li>
      ) : null}
    </ul>
  );
}

export function MissingData({ d, levers }: { d: Decision; levers: [string, string, string][] }) {
  const names = levers.map(([, n]) => n.toLowerCase());
  const insufficient = d.withheld_reason === "insufficient_data";
  return (
    <div className="us-missing">
      <h3>What is missing before this becomes advice</h3>
      {insufficient ? (
        <ul>
          <li><b>Designed moves of {names.length ? names.join(", ") : "these set points"}</b> in the training data. The simulator history never moved {names.length > 1 ? "them" : "it"}, so no model can say what a move would do.</li>
          <li><b>How it gets fixed:</b> a simulation batch with deliberate, small moves of these levers is running. After it, the models are refit and this decision gets a real target value.</li>
          <li><b>Until then:</b> the cockpit watches this unit and says so, rather than guessing.</li>
        </ul>
      ) : (
        <p className="us-note">{d.withheld_text ?? "The checks did not pass."}</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------------------ */
/* ① the full tag list                                                                                            */

export function TagList({ data, t, labels }: { data: TwinWorkbench; t: number; labels: Record<string, readonly [string, string]> }) {
  const rows = useMemo(() => {
    const tm = data.series.time_min;
    const iNow = tm.reduce((best, x, i) => (x <= t ? i : best), 0);
    return Object.entries(data.series.keys)
      .filter(([k]) => !k.includes(":"))
      .map(([k, vs]) => {
        const v = vs.slice(0, iNow + 1).filter((x): x is number => x != null && Number.isFinite(x));
        return { k, now: v.length ? v[v.length - 1] : null, min: v.length ? Math.min(...v) : null, max: v.length ? Math.max(...v) : null };
      });
  }, [data, t]);
  return (
    <details className="us-tags">
      <summary>All {rows.length} tags on this unit</summary>
      <table>
        <thead><tr><th>Tag</th><th>What it is</th><th className="r">Now</th><th className="r">Shift min</th><th className="r">Shift max</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.k}>
              <td className="mono">{r.k}</td>
              <td>{labels[r.k]?.[0] ?? "—"}</td>
              <td className="r num">{fx(r.now, 2)} <small>{labels[r.k]?.[1] ?? ""}</small></td>
              <td className="r num">{fx(r.min, 2)}</td>
              <td className="r num">{fx(r.max, 2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
