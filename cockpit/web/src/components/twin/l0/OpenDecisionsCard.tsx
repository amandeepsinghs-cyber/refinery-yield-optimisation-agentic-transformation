"use client";

/**
 * L0 rail — Open decisions (verbatim VN-5 "where are the decisions?"; Pass I). Every OPEN decision card across the
 * six units, newest / most trusted first, with the action line, gate / trust, and Accept · Decline that post to
 * POST /api/twin/decision (same audit path as L1). Click the line to open the unit with `?uc=`.
 */

import Link from "next/link";
import { useState } from "react";
import { postTwinDecision } from "@/lib/api";
import { decisionLine } from "@/lib/l1";
import type { TwinDecision, TwinUnit } from "@/lib/twinTypes";
import { UNIT_SHORT } from "./UnitTile";

function Row({ d, runId, timeMin }: { d: TwinDecision; runId: string; timeMin: number }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const submit = async (choice: "accepted" | "declined") => {
    setBusy(true); setErr(null);
    try {
      const r = await postTwinDecision(d.rec_id, choice, "operator", "", runId, timeMin, d.recipe_id ?? undefined);
      setDone(r.decision);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "decision failed");
    } finally {
      setBusy(false);
    }
  };
  const trustCls = d.trust === "GREEN" ? "ok" : d.trust === "RED" ? "bad" : "warn";
  const href = `/twin/unit/${d.unit_id}${d.use_case_id ? `?uc=${encodeURIComponent(d.use_case_id)}` : ""}`;
  return (
    <li className="dec-row" data-testid="open-decision" data-rec={d.rec_id}>
      <div className="dec-top">
        <Link href={href} className="dec-unit">{UNIT_SHORT[d.unit_id] ?? d.unit_id}</Link>
        {d.use_case_id ? <span className="dec-uc mono">{d.use_case_id}</span> : null}
        {d.trust ? <span className={`l1-tag ${trustCls}`}>{d.trust}</span> : null}
        {d.gate_status ? <span className="dec-gate mono">{d.gate_status}</span> : null}
      </div>
      <Link href={href} className="dec-line mono">{decisionLine(d)}</Link>
      {d.rationale ? <p className="dec-why">{d.rationale}</p> : null}
      {done ? (
        <p className={`dec-done ${done.startsWith("acc") ? "ok" : "warn"}`}>{done.toUpperCase()} · logged</p>
      ) : (
        <div className="dec-actions">
          <button type="button" className="btn primary sm" disabled={busy} onClick={() => submit("accepted")} data-testid="l0-accept">Accept</button>
          <button type="button" className="btn sm" disabled={busy} onClick={() => submit("declined")} data-testid="l0-decline">Decline</button>
          <Link href={href} className="dec-open">Open workbench →</Link>
        </div>
      )}
      {err ? <p className="bad">{err}</p> : null}
    </li>
  );
}

const TRUST_RANK: Record<string, number> = { RED: 0, AMBER: 1, GREEN: 2 };

export default function OpenDecisionsCard({ units, runId, timeMin, limit = 4 }: { units: TwinUnit[]; runId: string; timeMin: number; limit?: number }) {
  const open = units.flatMap((u) => (u.decisions_needed ?? []).filter((d) => d.status === "OPEN"));
  open.sort((a, b) => (TRUST_RANK[a.trust ?? "AMBER"] ?? 1) - (TRUST_RANK[b.trust ?? "AMBER"] ?? 1) || b.time_min - a.time_min);
  const shown = open.slice(0, limit);
  return (
    <section className="l0-rail-card" aria-label="Open decisions" data-testid="open-decisions">
      <div className="l0-rail-title">
        Open decisions <span className="mono l0-rail-count">{open.length}</span>
      </div>
      {shown.length === 0 ? (
        <div className="l0-rail-empty muted">No open recommendation — all units are holding plan.</div>
      ) : (
        <ul className="dec-list">
          {shown.map((d) => <Row key={d.rec_id} d={d} runId={runId} timeMin={timeMin} />)}
        </ul>
      )}
      {open.length > shown.length ? <div className="l0-rail-more muted">+{open.length - shown.length} more in the unit workbenches</div> : null}
    </section>
  );
}
