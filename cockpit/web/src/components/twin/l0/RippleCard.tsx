"use client";

/**
 * Cause → effect (systemic) card for L0 (verbatim Part 5 Screen A "cause→effect plot + telemetry table"):
 * the Systems Agent's primary move and, per domain, the before → after metrics it ripples into, drawn as a
 * horizontal delta bar per metric (coloured by direction, never grey) with the numbers alongside. Loop status
 * (mass closure, catalyst balance, heat) sits underneath so the whole-plant view is one card.
 */

import Link from "next/link";
import type { TwinOverview, TwinRippleMetric } from "@/lib/twinTypes";
import { UNIT_SHORT } from "./UnitTile";

const fmt = (v: number, u: string) => `${Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2)}${u ? ` ${u}` : ""}`;
const signed = (v: number) => `${v > 0 ? "+" : ""}${Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2)}`;

function DeltaRow({ m, maxAbs }: { m: TwinRippleMetric; maxAbs: number }) {
  const pct = maxAbs > 0 ? Math.min(100, (Math.abs(m.delta) / maxAbs) * 100) : 0;
  const good = m.direction === "up";
  const bad = m.direction === "down";
  const col = good ? "var(--green)" : bad ? "var(--red)" : "var(--accent)";
  return (
    <tr className="rip-row">
      <td className="rip-label">{m.label}</td>
      <td className="rip-bar">
        <span className="rip-track">
          <span className="rip-fill" style={{ width: `${pct}%`, background: col, marginLeft: m.delta < 0 ? `${100 - pct}%` : 0 }} />
          <span className="rip-zero" />
        </span>
      </td>
      <td className="rip-num mono">{fmt(m.before, "")}<span className="rip-arrow">→</span>{fmt(m.after, "")} <span className="muted">{m.unit}</span></td>
      <td className="rip-delta mono" style={{ color: col }}>{signed(m.delta)}</td>
    </tr>
  );
}

export default function RippleCard({ data }: { data: TwinOverview }) {
  const r = data.systems_ripple;
  const loops = data.system_loops ?? [];
  const domains = r?.domains ? Object.values(r.domains) : [];
  const allMetrics = domains.flatMap((d) => d.metrics ?? []);
  const maxAbs = Math.max(0, ...allMetrics.map((m) => Math.abs(m.delta)));
  const pm = r?.primary_move;
  return (
    <section className="l0-card rip" data-testid="ripple-card">
      <div className="l0-card-head">
        <h2 className="l0-card-title">Cause → effect <span className="l0-card-sub">systems agent · what one move does to the whole train</span></h2>
        {pm ? (
          <Link className="rip-move mono" href={`/twin/unit/${pm.unit_id}`}>
            {pm.action} {pm.parameter.split(" ")[0]} {pm.delta_F > 0 ? "+" : ""}{pm.delta_F} °F ({pm.sp_before} → {pm.sp_after}) · {UNIT_SHORT[pm.unit_id] ?? pm.unit_id}
            <span className={`l1-tag ${r?.gate_status === "PASS" ? "ok" : "warn"}`} style={{ marginLeft: 8 }}>{r?.gate_status}</span>
          </Link>
        ) : (
          <span className="muted">No coordinated move proposed at this minute.</span>
        )}
      </div>
      {domains.length ? (
        <div className="rip-domains">
          {domains.slice(0, 3).map((d) => (
            <div key={d.title} className="rip-domain">
              <div className="rip-domain-title">{d.title.replace(/^\d+\.\s*/, "")}</div>
              <table className="rip-table"><tbody>{(d.metrics ?? []).slice(0, 4).map((m) => <DeltaRow key={m.label} m={m} maxAbs={maxAbs} />)}</tbody></table>
              <p className="rip-summary">{d.summary}</p>
            </div>
          ))}
        </div>
      ) : null}
      {loops.length ? (
        <ul className="rip-loops">
          {loops.map((l) => (
            <li key={l.loop_id} className={`rip-loop st-${l.status}`}>
              <span className="flow-dot" aria-hidden />
              <span className="rip-loop-name">{l.name.replace(/^Loop \d+ · /, "")}</span>
              <span className="rip-loop-metric mono">{l.conservation_metric.replace(/\(.*\)$/, "").trim()}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
