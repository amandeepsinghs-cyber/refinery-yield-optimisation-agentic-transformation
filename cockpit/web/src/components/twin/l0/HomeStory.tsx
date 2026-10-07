"use client";

/**
 * The story under the plant view (owner brief, 2 Oct), read left → right:
 *   What went wrong  ·  The decision (with before/after bell curves and Accept / Hold)  ·  How AI makes it possible
 * and, underneath, the IOCL use cases this shift is exercising. Every number comes from /api/twin and /api/decisions.
 */

import { probPct } from "@/lib/prob";
import UseCaseExplainer from "@/components/how/UseCaseExplainer";
import { UC_DETAIL } from "@/lib/howItWorks";
import { useEffect, useState } from "react";
import { useCockpit } from "@/lib/store";
import { modelColor } from "@/lib/theme";
import { clock } from "@/lib/format";
import { useScreenPart } from "@/lib/screenPart";
import { actOnDecision, type CoverageRow, type Decision } from "@/lib/decisionsApi";
import type { TwinOverview } from "@/lib/twinTypes";
import GaussianPdf from "@/components/twin/shared/GaussianPdf";

const pct = (p?: number | null) => probPct(p, "");
const f1 = (v?: number | null) => (v == null || !Number.isFinite(v) ? "—" : v.toFixed(1));
const KIND: Record<string, string> = { agent: "Rule-based", ml: "ML model", check: "Check", optimiser: "Optimiser", genai: "Gemini" };
const UNIT: Record<string, string> = {
  unit_1_furnace: "Feed furnace", unit_2_riser: "Riser", unit_3_regenerator: "Regenerator", unit_4_fractionator: "Fractionator",
  unit_5_condenser: "Gas plant", unit_6_stabiliser: "Stabiliser",
};

export function WhatWentWrong({ data }: { data: TwinOverview }) {
  const c = data.crude_slate;
  const t = data.plant.time_min;
  const ok = data.units.filter((u) => (u.kpi_vs_plan?.state ?? "OK") === "OK").length;
  const recentSwitch = c?.last_switch_min != null && t - c.last_switch_min >= 0 && t - c.last_switch_min <= 720;
  const items = data.needs_attention.slice(0, 4);
  return (
    <section className="hs-col hs-wrong" data-testid="what-went-wrong">
      <h2 className="hs-h">What went wrong</h2>
      <p className="hs-lead"><span className="num">{ok}</span> of <span className="num">{data.units.length}</span> units on plan</p>
      <ol className="hs-events">
        {recentSwitch ? (
          <li className="ev-crude"><span className="hs-time num">{clock(c.last_switch_min)}</span>
            <span><b>New feed settled</b>{c.feed?.api_est != null ? <> at API {c.feed.api_est.toFixed(1)} ({c.feed.feed_class_label})</> : null} <span className="subtle">(crude slate {c.regime_id} {c.regime_label})</span></span></li>
        ) : null}
        {items.map((n) => (
          <li key={n.event_id} className={`ev-${n.severity}`}><span className="hs-time num">{n.time_label}</span>
            <span><b>{UNIT[n.unit_id] ?? n.unit_label}</b> · {n.line.replace(/ since \d{2}:\d{2}$/, "").replace(/ \(sustained shift\)| \(outside ±3σ\)/, "")}
              {n.consequence ? <span className="hs-cons">{n.consequence}</span> : null}</span></li>
        ))}
        {!items.length && !recentSwitch ? <li><span className="hs-time" /> <span className="subtle">Nothing unusual this shift.</span></li> : null}
      </ol>
    </section>
  );
}

export function DecisionFocus({ d, total, index, onStep, runId, timeMin, onActed }: {
  d: Decision | null; total: number; index: number; onStep: (delta: number) => void; runId: string | null; timeMin: number | null; onActed: () => void;
}) {
  const theme = useCockpit((s) => s.theme);
  const ask = useCockpit((s) => s.askCopilot);
  const [busy, setBusy] = useState(false);
  if (!d) return <section className="hs-col hs-dec"><h2 className="hs-h">Decision</h2><p className="hs-lead">No decision to take right now.</p></section>;
  const p = d.predicted ?? {};
  const o = d.observed ?? {};
  const spec = p.spec_max ?? o.spec_max ?? null;
  const members = p.mu_before != null && p.sigma ? [
    { id: "now", label: "now", mu: p.mu_before, sigma: p.sigma, weight: 1, color: modelColor("hybrid_delta_v1", theme) },
    ...(p.mu_after != null ? [{ id: "after", label: "after", mu: p.mu_after, sigma: p.sigma, weight: 1, color: modelColor("pinn_ens_v1", theme) }] : []),
  ] : [];
  const act = async (a: "accept" | "hold" | "decline") => {
    setBusy(true);
    try { await actOnDecision(d.id, a, runId, timeMin); onActed(); } finally { setBusy(false); }
  };
  const canAct = d.status === "open" && (d.proposed.moves.length > 0 || !!d.proposed.sample);
  return (
    <section className={`hs-col hs-dec s-${d.status}`} data-testid="decision-focus" data-decision={d.id}>
      <div className="hs-dec-top">
        <h2 className="hs-h">{d.status === "open" ? "Decision to take" : d.status === "withheld" ? "Not yet — and why" : d.status === "watch" ? "Watching" : `Decision · ${d.status}`}</h2>
        <span className="hs-step">
          <button type="button" onClick={() => onStep(-1)} aria-label="Previous decision" disabled={index <= 0}>‹</button>
          <span className="num">{index + 1} / {total}</span>
          <button type="button" onClick={() => onStep(1)} aria-label="Next decision" disabled={index >= total - 1}>›</button>
        </span>
      </div>
      <p className="hs-q">{UNIT[d.unit_id] ?? d.unit_label} · {d.question}</p>
      <p className="hs-headline">{d.status === "withheld" ? `No move proposed — ${d.withheld_text}` : d.headline}</p>
      {d.feed_used?.line ? <p className="hs-q subtle" data-testid="feed-used">{d.feed_used.line}</p> : null}
      {members.length ? (
        <div className="hs-curve">
          <div className="hs-p">
            <span className="hs-p-label">Chance of staying on spec</span>
            <span className="hs-p-val num">{pct(p.p_on_spec_before)}{p.p_on_spec_after != null ? <> <i>→</i> <b>{pct(p.p_on_spec_after)}</b></> : null}</span>
            <span className="hs-p-sub num">now {f1(p.mu_before)}{p.mu_after != null ? ` → ${f1(p.mu_after)}` : ""} ± {f1(p.sigma)} °F{spec != null ? ` · spec ≤ ${f1(spec)}` : ""}</span>
          </div>
          <div className="hs-pdf">
            <GaussianPdf members={members} spec={spec != null ? { hi: spec, label: "spec" } : null} target={p.target != null ? { value: p.target, label: "target" } : o.plan != null ? { value: o.plan, label: "set point" } : null}
              unit="°F" height={118} compact showMixture={false} showP={false} ariaLabel="now vs after the move" />
          </div>
        </div>
      ) : (
        <p className="hs-why">{d.observed?.line ?? d.diagnosed?.text ?? ""}{d.urgency.consequence && d.status !== "withheld" ? ` — ${d.urgency.consequence}` : ""}</p>
      )}
      {d.proposed.alternative ? <p className="hs-alt">Or: {d.proposed.alternative}</p> : null}
      <div className="hs-actions">
        {canAct ? (
          <>
            <button type="button" className="hs-btn primary" disabled={busy} onClick={() => act("accept")} data-testid="decision-accept">{d.proposed.sample ? "Pull sample" : "Accept"}</button>
            <button type="button" className="hs-btn" disabled={busy} onClick={() => act("hold")} data-testid="decision-hold">Hold 30 min</button>
            <button type="button" className="hs-btn ghost" disabled={busy} onClick={() => act("decline")}>Decline</button>
          </>
        ) : null}
        <button type="button" className="hs-btn ghost" onClick={() => ask(`Explain decision "${d.headline}" (${d.id}): why it exists, the evidence, and what happens if I hold.`)}>Ask Gemini</button>
        {d.action ? <span className="hs-acted subtle">{d.action.action} at {d.action.time_label} · audit log only</span> : null}
      </div>
    </section>
  );
}

export function HowAIEnables({ d }: { d: Decision | null }) {
  const steps = d?.enabled_by ?? [];
  return (
    <section className="hs-col hs-ai" data-testid="how-ai">
      <h2 className="hs-h">How AI makes this decision possible</h2>
      {d ? <p className="hs-why-exists">{d.why_this_exists}</p> : null}
      <ol className="hs-chain">
        {steps.map((s, i) => (
          <li key={i} className={`k-${s.kind}`}>
            <span className="hs-kind">{KIND[s.kind]}</span>
            <span className="hs-step-body"><b>{s.name}</b><span>{s.did}</span></span>
          </li>
        ))}
      </ol>
    </section>
  );
}

const UC_STATE: Record<string, string> = { active: "decision open", watching: "watching", quiet: "quiet now", "not claimed": "not in this demo" };

export function UseCaseBand({ rows, selected }: { rows: CoverageRow[]; selected: Decision | null }) {
  const mine = new Set(selected?.use_cases.map((u) => u.platform_id) ?? []);
  // Each chip is an explainer (owner, 14:40): click → the problem, the parts that solve it, in / out, how the decision is
  // made and the value. Same component as the How it works page.
  const [open, setOpen] = useState<string | null>(null);
  // Deep link: /twin#uc-UC-01 opens that explainer (used by the demo script and screenshots).
  useEffect(() => {
    const m = window.location.hash.match(/^#uc-(.+)$/);
    if (!m || !UC_DETAIL[m[1]]) return;
    const t1 = setTimeout(() => setOpen(m[1]), 0);
    const t2 = setTimeout(() => document.getElementById("uc-panel")?.scrollIntoView({ block: "start" }), 400);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);
  useScreenPart("use_cases", rows.map((r) => ({ use_case: r.iocl_title, row: r.iocl_row, state: r.state })));
  return (
    <section className="ucb" data-testid="use-case-band" aria-label="IOCL use cases">
      <h2 className="hs-h">IOCL use cases this shift <span className="ucb-hint">click one to see how we would solve it</span></h2>
      <ul className="ucb-list">
        {rows.map((r) => {
          const id = r.platform_id;
          const can = !!id && !!UC_DETAIL[id];
          return (
            <li key={r.iocl_title}>
              <button type="button" disabled={!can} aria-expanded={can ? open === id : undefined}
                className={`ucb-chip u-${r.state.replace(" ", "-")} ${id && mine.has(id) ? "mine" : ""} ${open === id ? "on" : ""}`}
                title={`${r.iocl_row}${id ? ` · ${id}` : ""} — ${UC_STATE[r.state]}`}
                onClick={() => can && setOpen(open === id ? null : id)}>
                <i aria-hidden />{r.iocl_title}
              </button>
            </li>
          );
        })}
      </ul>
      {open ? (
        <div className="ucb-panel" id="uc-panel">
          <button type="button" className="ucb-close" onClick={() => setOpen(null)} aria-label="Close">×</button>
          <UseCaseExplainer id={open} />
        </div>
      ) : null}
    </section>
  );
}
