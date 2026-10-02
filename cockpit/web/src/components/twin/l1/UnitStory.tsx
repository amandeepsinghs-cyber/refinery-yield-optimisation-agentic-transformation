"use client";

/**
 * Unit page (owner, 2 Oct 2026: "on the surface it looks better — then one should be able to click it and get more
 * details on the specific process and then all the analysis and decision-making").
 *
 * Same four steps as the home-page flow, each one opened up in full, top to bottom:
 *   ① Data      the process drawing with live values where they are measured; how fresh each reading is
 *   ② Observe   measured vs expected over the shift, the residual / CUSUM, the soft-sensor bell curves, the crude
 *   ③ Decide    every decision on this unit; the lever with a what-if slider; Accept / Hold / Decline (audit only)
 *   ④ Optimise  who did what (agent → ML → checks → optimiser → Gemini); each check with its value and limit;
 *               for a withheld decision, what the search found and why it is not shown as advice
 * Footer: this unit's use cases and the shift's events. Data: GET /api/unit/{id}/workbench + GET /api/decisions.
 * The engineer's all-panels view stays one click away (?view=classic).
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useCockpit } from "@/lib/store";
import { useDistribution } from "@/lib/api";
import { getTwinWorkbench } from "@/lib/twinApi";
import { actOnDecision, getDecisions, type Decision } from "@/lib/decisionsApi";
import type { TwinWorkbench } from "@/lib/twinTypes";
import { indexAtMin } from "@/lib/l1";
import { pOnSpec, type GaussMember } from "@/lib/gauss";
import { modelColor, modelLabel, MODEL_ORDER } from "@/lib/theme";
import { clock } from "@/lib/format";
import { useScreenPart } from "@/lib/screenPart";
import LangToggle from "@/components/twin/LangToggle";
import GaussianPdf from "@/components/twin/shared/GaussianPdf";
import ChartStack from "@/components/twin/l1/ChartStack";
import { FLOW, NAME } from "@/components/twin/l0/UnitFlow";
import UnitDrawing, { HAS_DRAWING } from "./UnitDrawings";
import { SUSPECT, isSuspect } from "@/lib/suspect";

const RANK: Record<string, number> = { open: 0, held: 1, watch: 2, withheld: 3, accepted: 4, declined: 5 };
const fx = (v: number | null | undefined, d?: number) => (v == null || !Number.isFinite(v) ? "—" : v.toFixed(d ?? (Math.abs(v) >= 100 ? 1 : 2)));
const pct = (p?: number | null) => (p == null ? "—" : `${Math.round(p * 100)} %`);
const STATUS: Record<string, string> = { open: "Decide", watch: "Watch", withheld: "Not yet", held: "Held", accepted: "Accepted", declined: "Declined", expired: "Expired" };
const TAGN: Record<string, string> = { LCO_T98_F: "LCO T98", HN_T98_F: "HN T98" };
const EVK: Record<string, string> = { cusum: "drifting (sustained)", change_point: "step change", recipe_ready: "move ready", regime_change: "crude switch", sigma3: "outside ±3σ" };
const KIND: Record<string, string> = { agent: "Agent", ml: "ML", check: "Check", optimiser: "Optimiser", genai: "Gemini" };

/* ---------------------------------------------------------------------------------------------------------------- */
/* ① the process drawing                                                                                              */

function FracDrawing({ at }: { at: (k: string) => number | null }) {
  const top = 34, step = 17, x0 = 230, w = 64;
  const ty = (i: number) => top + 10 + (i - 1) * step;
  const trays = [1, 6, 13, 17, 20];
  const pas: [string, number, number][] = [["MV_PA1", 2, 4], ["MV_PA2", 7, 9], ["MV_PA3", 12, 14], ["MV_PA4", 17, 19]];
  return (
    <svg viewBox="0 0 640 450" className="us-draw" role="img" aria-label="Main fractionator: trays, pumparounds and draws with live values">
      <defs><marker id="us-ar" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L10 5 L0 10 z" className="us-arh" /></marker></defs>
      {/* column */}
      <path d={`M${x0} ${top + 18} Q${x0} ${top} ${x0 + w / 2} ${top} Q${x0 + w} ${top} ${x0 + w} ${top + 18} V${ty(20) + 22} Q${x0 + w} ${ty(20) + 34} ${x0 + w / 2} ${ty(20) + 34} Q${x0} ${ty(20) + 34} ${x0} ${ty(20) + 22} Z`} className="us-vessel" />
      {Array.from({ length: 20 }, (_, i) => <path key={i} d={`M${i % 2 ? x0 + 14 : x0} ${ty(i + 1)} h${w - 14}`} className="us-tray" />)}
      {/* tray temperatures (left of column) */}
      {trays.map((t) => (
        <g key={t}>
          <path d={`M${x0 - 6} ${ty(t)} h-14`} className="us-tick" />
          <text x={x0 - 24} y={ty(t) + 4} textAnchor="end" className="us-v"><tspan className="us-k">Tray {t} </tspan>{(() => { const tg = `T_tray${String(t).padStart(2, "0")}_F`; return SUSPECT[tg] ? <tspan className="us-suspect">{fx(at(tg), 0)} °F ?<title>{SUSPECT[tg]}</title></tspan> : <>{fx(at(tg), 0)} °F</>; })()}</text>
        </g>
      ))}
      {/* pumparound loops (right side, short) */}
      {pas.map(([tag, a, b], i) => (
        <g key={tag} className="us-pa">
          <path d={`M${x0 + w} ${ty(b)} h26 V${ty(a)} h-26`} markerEnd="url(#us-ar)" />
          <text x={x0 + w + 32} y={(ty(a) + ty(b)) / 2 + 4} className="us-v small"><tspan className="us-k">PA{i + 1} </tspan>{fx(at(tag), 0)}</text>
        </g>
      ))}
      {/* overhead */}
      <path d={`M${x0 + w / 2} ${top} V${top - 18} H${560}`} className="us-line" markerEnd="url(#us-ar)" />
      <text x={566} y={top - 22} className="us-v" textAnchor="end"><tspan className="us-k">Overhead → gas plant · </tspan>LN {fx(at("prod_LN"), 0)} · LPG {fx(at("prod_LPG"), 0)} lb/min</text>
      {/* HN draw */}
      <path d={`M${x0 + w} ${ty(6) + 6} H${560}`} className="us-line prod" markerEnd="url(#us-ar)" />
      <text x={566} y={ty(6) + 1} className="us-v" textAnchor="end"><tspan className="us-k">Heavy naphtha </tspan>{fx(at("prod_HN"), 0)} lb/min</text>
      <text x={566} y={ty(6) + 22} className="us-v lever" textAnchor="end">lever: set point {fx(at("SP_HN_T98"), 1)} °F</text>
      {/* LCO draw */}
      <path d={`M${x0 + w} ${ty(13) + 6} H${560}`} className="us-line prod hot" markerEnd="url(#us-ar)" />
      <text x={566} y={ty(13) + 1} className="us-v" textAnchor="end"><tspan className="us-k">LCO (diesel) </tspan>{fx(at("prod_LCO"), 0)} lb/min</text>
      <text x={566} y={ty(13) + 22} className="us-v lever" textAnchor="end">T98 {fx(at("LCO_T98_F"), 1)} °F · lever: set point {fx(at("SP_LCO_T98"), 1)} °F</text>
      {/* feed and slurry */}
      <path d={`M${40} ${ty(20) + 22} H${x0 - 4}`} className="us-line" markerEnd="url(#us-ar)" />
      <text x={40} y={ty(20) + 40} className="us-v"><tspan className="us-k">Cracked vapour from riser</tspan></text>
      <text x={40} y={ty(20) + 56} className="us-v">{fx(at("dist_T_feed_in_F"), 0)} °F · {fx(at("feed_flow_lb_s"), 0)} lb/s</text>
      <path d={`M${x0 + w / 2} ${ty(20) + 34} V${ty(20) + 52} H${560}`} className="us-line" markerEnd="url(#us-ar)" />
      <text x={566} y={ty(20) + 46} className="us-v" textAnchor="end"><tspan className="us-k">Slurry </tspan>{fx(at("prod_slurry"), 0)} lb/min</text>
    </svg>
  );
}

function GenericDrawing({ data }: { data: TwinWorkbench }) {
  const ins = data.unit.io.inputs.slice(0, 6), outs = data.unit.io.outputs.slice(0, 6);
  const rowsY = (n: number, i: number) => 215 - ((n - 1) * 46) / 2 + i * 46;
  return (
    <svg viewBox="0 0 640 430" className="us-draw" role="img" aria-label={`${data.unit.short_name}: inputs and outputs with live values`}>
      <defs><marker id="us-ar" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L10 5 L0 10 z" className="us-arh" /></marker></defs>
      <rect x={250} y={120} width={140} height={190} rx={22} className="us-vessel" />
      <text x={320} y={220} textAnchor="middle" className="us-name">{NAME[data.unit.unit_id] ?? data.unit.short_name}</text>
      {ins.map((io, i) => (
        <g key={io.tag}>
          <path d={`M${200} ${rowsY(ins.length, i)} C${225} ${rowsY(ins.length, i)} ${225} 215 ${246} 215`} className="us-line" markerEnd="url(#us-ar)" />
          <text x={194} y={rowsY(ins.length, i) + 4} textAnchor="end" className="us-v"><tspan className="us-k">{io.label} </tspan>{fx(io.value)} {io.unit}</text>
        </g>
      ))}
      {outs.map((io, i) => (
        <g key={io.tag}>
          <path d={`M${394} 215 C${415} 215 ${415} ${rowsY(outs.length, i)} ${436} ${rowsY(outs.length, i)}`} className="us-line prod" markerEnd="url(#us-ar)" />
          <text x={444} y={rowsY(outs.length, i) + 4} className="us-v"><tspan className="us-k">{io.label} </tspan>{fx(io.value)} {io.unit}</text>
        </g>
      ))}
    </svg>
  );
}

/* ---------------------------------------------------------------------------------------------------------------- */

function Step({ n, id, title, who, children }: { n: number; id: string; title: string; who?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="us-sec" id={id} aria-labelledby={`${id}-h`}>
      <header className="us-sec-h"><span className="us-n">{n}</span><h2 id={`${id}-h`}>{title}</h2>{who ? <span className="us-whos">{who}</span> : null}</header>
      {children}
    </section>
  );
}
const Who = ({ k, children }: { k: string; children: React.ReactNode }) => <span className={`uf-who w-${k}`}>{children}</span>;

function UnitStoryInner({ unitId }: { unitId: string }) {
  const runId = useCockpit((s) => s.runId);
  const timeMin = useCockpit((s) => s.timeMin);
  const setRun = useCockpit((s) => s.setRun);
  const theme = useCockpit((s) => s.theme);
  const ask = useCockpit((s) => s.askCopilot);

  const [data, setData] = useState<TwinWorkbench | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ds, setDs] = useState<Decision[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [rev, setRev] = useState(0);
  const [busy, setBusy] = useState(false);
  const [spPick, setSpPick] = useState<{ id: string; v: number } | null>(null);

  useEffect(() => {
    let on = true;
    getTwinWorkbench(unitId, runId, timeMin)
      .then((d) => {
        if (!on) return;
        if (!d?.unit) { setError(`unknown unit '${unitId}'`); return; }
        setData(d); setError(null);
        if (runId == null || timeMin == null) setRun(d.run_id ?? d.regime?.run_id ?? runId, d.time.time_min);
      })
      .catch((e: unknown) => { if (on) setError(e instanceof Error ? e.message : "unit data unavailable"); });
    return () => { on = false; };
  }, [unitId, runId, timeMin, setRun]);

  useEffect(() => {
    let on = true;
    getDecisions(runId, timeMin)
      .then((q) => { if (on) setDs(q.decisions.filter((d) => d.unit_id === unitId).sort((a, b) => (RANK[a.status] ?? 9) - (RANK[b.status] ?? 9))); })
      .catch(() => { if (on) setDs([]); });
    return () => { on = false; };
  }, [unitId, runId, timeMin, rev]);

  const d = ds.find((x) => x.id === sel) ?? ds[0] ?? null;
  const move = d?.proposed.moves[0] ?? null;
  const sp = spPick && spPick.id === d?.id ? spPick.v : null; // what-if pick, reset when another decision is chosen
  const setSp = (v: number) => { if (d) setSpPick({ id: d.id, v }); };

  const t = data?.time.time_min ?? timeMin ?? 0;
  const isU4 = unitId === "unit_4_fractionator";
  const prop = d?.observed?.tag === "HN_T98_F" ? "HN_T98_F" : "LCO_T98_F";
  const dist = useDistribution(isU4 && data ? (data.run_id ?? runId) : null, prop, isU4 ? t : null);

  const at = useCallback((k: string) => {
    if (!data) return null;
    const i = indexAtMin(data.series.time_min, t);
    const v = i < 0 ? null : data.series.keys[k]?.[i];
    if (v != null) return v;
    const io = [...data.unit.io.inputs, ...data.unit.io.outputs].find((x) => x.tag === k);
    return io?.value ?? data.unit.tag_table?.find((x) => x.tag === k)?.current ?? null;
  }, [data, t]);

  const obsPanels = useMemo(() => {
    if (!data) return [];
    const want = isU4 && prop === "HN_T98_F" ? ["quality_2", "residual_2"] : ["quality", "residual"];
    return data.panels.filter((p) => want.includes(p.panel_id));
  }, [data, isU4, prop]);
  const ctxPanels = useMemo(() => (data ? data.panels.filter((p) => ["mv", "disturbance", "yield"].includes(p.panel_id)) : []), [data]);
  const [showCtx, setShowCtx] = useState(false);

  useScreenPart("unit", data ? {
    unit: data.unit.short_name, clock: clock(t), status: data.unit.status_label ?? data.unit.status,
    decisions: ds.map((x) => ({ id: x.id, status: x.status, headline: x.headline })),
    selected: d ? { id: d.id, question: d.question, lever: move ? `${move.label} ${fx(move.from, 1)} → ${fx(move.to, 1)} ${move.unit}` : null,
      gates: d.gates.map((g) => `${g.name ?? g.id} ${g.pass ? "pass" : "fail"}`), withheld: d.withheld_text } : null,
    analysis: data.analysis.summary.en,
  } : null);

  if (error) return <div className="us us-msg" data-testid="l1-root" role="alert">Unit data unavailable: {error}</div>;
  if (!data) return <div className="us us-msg" data-testid="l1-root">Loading the unit…</div>;

  const u = data.unit;
  const k = u.headline_kpi;
  const a = data.analysis;
  const io = FLOW[unitId];
  const nTags = Object.keys(data.series.keys).filter((x) => !x.includes(":")).length;
  const lastLab = ds.find((x) => x.observed?.last_lab)?.observed?.last_lab ?? null;

  // Bell curves: committee members (fractionator) or the regime surrogate ŷ ± σ (other units).
  let members: GaussMember[] = [];
  let spec: { hi?: number | null; label?: string } | null = null;
  if (isU4 && dist.data?.members) {
    const dd = dist.data;
    const ids = [...MODEL_ORDER, ...Object.keys(dd.members).filter((x) => !MODEL_ORDER.includes(x))].filter((x) => dd.members[x]);
    members = ids.map((id) => ({ id, label: modelLabel(id), mu: dd.members[id].mu, sigma: dd.members[id].sigma, weight: dd.members[id].weight, color: modelColor(id, theme), dashed: dd.members[id].shadow || !dd.members[id].admitted }));
    spec = { hi: dd.spec_max, label: "spec" };
  } else {
    const tag = a.primary_tag;
    const e = at(`expected:${tag}`), lo = at(`band_lo:${tag}`), hi = at(`band_hi:${tag}`);
    if (e != null && lo != null && hi != null) members = [{ id: "sur", label: "expected (crude model)", mu: e, sigma: Math.max((hi - lo) / 4, 1e-6), weight: 1, color: modelColor("hybrid_delta_v1", theme) }];
  }

  // What-if for a set-point move: the cut-point controller follows its set point 1:1 (gain 1 °F/°F), σ unchanged.
  const p = d?.predicted ?? null;
  // P(on-spec) on the same basis as the decision engine: the 4-model committee mixture, every member shifted by the move.
  const committeeMembers = isU4 && move?.tag.startsWith("SP_") ? members.filter((m) => !m.dashed) : [];
  const pAt = (delta: number) => {
    const hi = p?.spec_max ?? null;
    if (committeeMembers.length) {
      const W = committeeMembers.reduce((acc, m) => acc + m.weight, 0) || 1;
      return committeeMembers.reduce((acc, m) => acc + m.weight * pOnSpec(m.mu + delta, m.sigma, null, hi), 0) / W;
    }
    return pOnSpec((p?.mu_before ?? 0) + delta, p?.sigma ?? 1, null, hi);
  };
  const wi = move && p?.mu_before != null && p.sigma ? (() => {
    const s = sp ?? move.to;
    const dl = s - move.from;
    return { s, mu: p.mu_before! + dl, p: Math.abs(s - move.to) < 1e-6 && p.p_on_spec_after != null ? p.p_on_spec_after : pAt(dl), d: dl };
  })() : null;
  const canAct = d?.status === "open" && (d.proposed.moves.length > 0 || !!d.proposed.sample);
  const act = async (x: "accept" | "hold" | "decline") => {
    if (!d) return;
    setBusy(true);
    try { await actOnDecision(d.id, x, data.run_id ?? runId, t); setRev((r) => r + 1); } finally { setBusy(false); }
  };
  const nPass = d?.gates.filter((g) => g.pass).length ?? 0;
  const recipe = data.recipe;
  const committee = data.models.committee;

  return (
    <div className="us" data-testid="l1-root" data-unit={unitId}>
      {/* header */}
      <header className="us-head">
        <div className="us-crumb"><Link href="/twin">Refinery</Link><span>›</span><span>{NAME[unitId] ?? u.short_name}</span></div>
        <div className="us-title">
          <h1>{NAME[unitId] ?? u.short_name}</h1>
          {k ? (
            <p className="us-kpi">{k.label} <b className="num">{fx(k.value)}</b> {k.unit}{isSuspect(data.analysis.primary_tag) ? <span className="suspect-mark" title={SUSPECT[data.analysis.primary_tag]}>under review</span> : null}
              <span className={`us-dev s-${k.state} num`}> {k.value - k.plan >= 0 ? "+" : "−"}{Math.abs(k.value - k.plan).toFixed(1)}</span>
              <span className="subtle"> vs plan {fx(k.plan)}</span></p>
          ) : null}
          <span className="us-clock num">{clock(t)} · next lab {clock(data.time.next_lab_min)}</span>
          <LangToggle />
        </div>
        <nav className="us-steps" aria-label="Steps">
          <a href="#s-data"><i>1</i>Data</a><a href="#s-observe"><i>2</i>Observe</a>
          <a href="#s-decide" className={d?.status === "open" ? "hot" : ""}><i>3</i>Decide{ds.filter((x) => x.status === "open").length ? <b className="num">{ds.filter((x) => x.status === "open").length}</b> : null}</a>
          <a href="#s-optimise"><i>4</i>Optimise</a>
          <Link href={`/twin/unit/${unitId}?view=classic`} className="us-classic">Engineer view (all panels)</Link>
        </nav>
      </header>

      {/* ① DATA */}
      <Step n={1} id="s-data" title="Data in and out" who={<><Who k="data">historian · every minute</Who><Who k="data">lab · every 8 h</Who></>}>
        <div className="us-grid data">
          <div className="us-drawwrap">{isU4 ? <FracDrawing at={at} /> : HAS_DRAWING.has(unitId) ? <UnitDrawing unitId={unitId} at={at} /> : <GenericDrawing data={data} />}</div>
          <div className="us-side">
            <h3>How fresh the data is</h3>
            <ul className="us-fresh">
              <li><span className="dot ok" /><b>Sensors</b> {nTags} tags, every minute · latest {clock(t)}</li>
              {lastLab ? (
                <li><span className={`dot ${lastLab.status === "REJECT" ? "bad" : "ok"}`} /><b>Lab</b> last {lastLab.drawn_label} · {fx(lastLab.value, 1)} °F
                  {lastLab.status === "REJECT" ? <span className="us-warn"> — rejected: {lastLab.status_reason}</span> : null}</li>
              ) : <li><span className="dot" /><b>Lab</b> none on this unit</li>}
              {lastLab ? <li><span className="dot" /><b>Next lab</b> {clock(data.time.next_lab_min)} · in {Math.max(0, data.time.next_lab_min - t)} min</li> : null}
              {lastLab ? <li><span className="dot ml" /><b>Soft sensor</b> fills the gap: an estimate every minute</li> : <li><span className="dot ml" /><b>Crude model</b> gives the expected value every minute</li>}
            </ul>
            <h3>Levers on this unit</h3>
            <ul className="us-levers">{io?.levers.map(([tag, name, un]) => <li key={tag}><span>{name}</span><b className="num">{fx(at(tag))} <small>{un}</small></b></li>)}</ul>
            <h3>What comes in</h3>
            <ul className="us-levers">{u.io.inputs.filter((x) => !x.tag.startsWith("SP_") && !x.tag.startsWith("MV_")).slice(0, 4).map((x) => <li key={x.tag}><span>{x.label}</span><b className="num">{fx(x.value)} <small>{x.unit}</small></b></li>)}</ul>
          </div>
        </div>
      </Step>

      {/* ② OBSERVE */}
      <Step n={2} id="s-observe" title="What we observe" who={<><Who k="agent">drift-watch agent</Who><Who k="ml">soft sensor</Who><Who k="ml">crude-regime model</Who></>}>
        <div className="us-facts">
          {d?.observed?.estimate != null ? (
            <div className="us-fact big"><span>Estimate now</span><b className="num">{fx(d.observed.estimate, 1)} <small>± {fx(d.observed.sigma, 1)} {d.observed.unit}</small></b><em>chance on spec {pct(p?.p_on_spec_before)}</em></div>
          ) : k ? <div className="us-fact big"><span>{k.label} now</span><b className="num">{fx(k.value)} <small>{k.unit}</small></b><em>plan {fx(k.plan)}</em></div> : null}
          <div className="us-fact"><span>Away from expected</span><b className="num">{Math.abs(a.residual_now) < 0.05 ? "" : a.residual_now > 0 ? "+" : "−"}{fx(Math.abs(a.residual_now), 1)} <small>{k?.unit}</small></b><em>{fx(a.sigma_now ? Math.abs(a.residual_now) / a.sigma_now : null, 1)} σ</em></div>
          <div className="us-fact"><span>Sustained drift (CUSUM)</span><b className="num">{fx(a.cusum_now, 1)}</b><em>{a.breach_open ? `since ${clock(a.first_breach_min)}` : "no breach open"}</em></div>
          <div className="us-fact"><span>Likely driver</span><b>{a.root_cause[0] ? `${a.root_cause[0].label ?? a.root_cause[0].tag} ${a.root_cause[0].direction === "up" ? "↑" : "↓"}` : "—"}</b><em>largest contribution</em></div>
          {data.regime ? <div className="us-fact"><span>Crude</span><b>{data.regime.regime_id} {data.regime.regime_label.split(" ")[0]}</b><em>{Math.round((data.regime.p_regime?.[data.regime.regime_id] ?? 0) * 100)} % sure · since {clock(data.regime.detected_at_min)}</em></div> : null}
        </div>
        <div className="us-grid observe">
          <div className="us-chart"><ChartStack data={data} panels={obsPanels} hoverMin={null} onHover={() => undefined} /></div>
          <div className="us-side">
            <h3>{isU4 ? "What the 4 models believe now" : "What the crude model expects now"}</h3>
            {members.length ? <GaussianPdf members={members} spec={spec} target={k ? { value: k.plan, label: "plan" } : null} measured={null} unit={k?.unit ?? ""} height={150} compact showP={false} ariaLabel="soft-sensor bell curves" /> : <p className="subtle">No estimate for this unit.</p>}
            {committee && isU4 ? (
              <ul className="us-weights">{(committee.weights ?? []).map((w) => <li key={w.member}><span>{w.label}</span><i style={{ width: `${Math.round(w.weight * 100)}%` }} /><b className="num">{Math.round(w.weight * 100)} %</b></li>)}</ul>
            ) : null}
            {committee?.reason ? <p className="us-note">{committee.reason}</p> : null}
          </div>
        </div>
        <button type="button" className="us-more" onClick={() => setShowCtx((v) => !v)} aria-expanded={showCtx}>{showCtx ? "Hide" : "Show"} levers, feed and products over the shift</button>
        {showCtx ? <div className="us-chart"><ChartStack data={data} panels={ctxPanels} hoverMin={null} onHover={() => undefined} /></div> : null}
      </Step>

      {/* ③ DECIDE */}
      <Step n={3} id="s-decide" title="Decision and lever">
        {ds.length > 1 ? (
          <div className="us-tabs" role="tablist">{ds.map((x) => (
            <button key={x.id} type="button" role="tab" aria-selected={x.id === d?.id} className={`us-tab p-${x.status} ${x.id === d?.id ? "on" : ""}`} onClick={() => setSel(x.id)}>
              <span className="st">{STATUS[x.status] ?? x.status}</span>{x.type_name.split(":")[0]}
            </button>
          ))}</div>
        ) : null}
        {d ? (
          <div className={`us-grid decide s-${d.status}`}>
            <div>
              <p className="us-q">{d.question}</p>
              <h3 className="us-headline">{d.headline}</h3>
              {d.urgency.consequence ? <p className="us-cons"><b>If nothing is done:</b> {d.urgency.consequence}{d.urgency.decide_by_label ? <> · decide by <b className="num">{d.urgency.decide_by_label}</b></> : null}</p> : null}
              {d.diagnosed?.text ? <p className="us-note">{d.diagnosed.text}</p> : null}
              {d.withheld_text ? <p className="us-why">Not advised yet, on purpose: {d.withheld_text}.</p> : null}
              <div className="uf-actions">
                {canAct ? <>
                  <button type="button" className="hs-btn primary" disabled={busy} onClick={() => act("accept")} data-testid="decision-accept">{d.proposed.sample ? "Pull sample" : "Accept"}</button>
                  <button type="button" className="hs-btn" disabled={busy} onClick={() => act("hold")}>Hold 30 min</button>
                  <button type="button" className="hs-btn" disabled={busy} onClick={() => act("decline")}>Decline</button>
                </> : null}
                <button type="button" className="hs-btn ghost" onClick={() => ask(`Explain decision "${d.headline}" (${d.id}): what we observe, the lever, what happens if we hold.`)}>Ask Gemini</button>
                {d.action ? <span className="subtle">{d.action.action} at {d.action.time_label} · recorded in audit, nothing sent to the plant</span> : null}
              </div>
              <p className="us-uc">IOCL use case · {d.use_cases.map((x) => x.iocl_title).join(" · ")}<br /><span className="subtle">Problem it solves · {d.problem_text.join(" ")}</span></p>
            </div>
            <div className="us-lever-panel">
              {move && wi ? (
                <>
                  <div className="us-lever-h"><span>Lever</span><b>{move.label}</b></div>
                  <div className="us-lever-big num">{fx(move.from, 1)} <i>→</i> <b>{fx(wi.s, 1)}</b> <small>{move.unit}</small><span className="us-lever-d">{wi.d >= 0 ? "+" : "−"}{Math.abs(wi.d).toFixed(1)}</span></div>
                  <label className="us-slider">
                    <span>Try another move</span>
                    <input type="range" min={move.from - 5} max={move.from + 5} step={0.5} value={wi.s} onChange={(e) => setSp(Number(e.target.value))} aria-label="what-if set point" />
                    <span className="us-range num"><em>{fx(move.from - 5, 1)}</em><em>now {fx(move.from, 1)}</em><em>{fx(move.from + 5, 1)}</em></span>
                  </label>
                  <GaussianPdf members={[
                    { id: "now", label: "now", mu: p!.mu_before!, sigma: p!.sigma!, weight: 1, color: modelColor("hybrid_delta_v1", theme) },
                    { id: "after", label: "after", mu: wi.mu, sigma: p!.sigma!, weight: 1, color: modelColor("pinn_ens_v1", theme), dashed: true },
                  ]} spec={p?.spec_max != null ? { hi: p.spec_max, label: "spec" } : null} unit={move.unit} height={120} compact showMixture={false} showP={false} ariaLabel="before and after the move" />
                  <p className="us-result">Chance on spec <span className="num">{pct(p?.p_on_spec_before)}</span> → <b className={`num ${wi.p >= 0.95 ? "good" : wi.p < (p?.p_on_spec_before ?? 0) ? "bad" : ""}`}>{pct(wi.p)}</b>
                    {Math.abs(wi.s - move.to) > 1e-6 ? <span className="subtle"> · advised {fx(move.to, 1)} gives {pct(p?.p_on_spec_after)}</span> : <span className="subtle"> · the advised move</span>}</p>
                  <p className="us-note subtle">SOP: one step at most 5 °F, 30 min between moves. The cut-point controller follows its set point 1 : 1.</p>
                  {p?.ripple?.length ? <p className="us-note subtle">Next units: {p.ripple.map((r) => `${r.what} — ${r.delta == null ? r.note : `${r.delta} ${r.unit}`}`).join("; ")}</p> : null}
                </>
              ) : d.proposed.sample ? (
                <>
                  <div className="us-lever-h"><span>Lever</span><b>An extra lab sample</b></div>
                  <div className="us-lever-big">now <i>instead of</i> {d.observed?.next_lab_label}</div>
                  <p className="us-note">The estimate&apos;s spread is {fx(d.predicted?.w90 ?? d.gates.find((g) => g.id === "spread")?.value, 1)} °F against a 14 °F limit. A sample re-anchors it {d.observed?.next_lab_in_min} min earlier.</p>
                </>
              ) : (
                <>
                  <div className="us-lever-h"><span>Levers here</span></div>
                  <ul className="us-levers">{io?.levers.map(([tag, name, un]) => <li key={tag}><span>{name}</span><b className="num">{fx(at(tag))} <small>{un}</small></b></li>)}</ul>
                  <p className="us-note subtle">{d.status === "withheld" ? "No move proposed until the model can be trusted here — see step 4." : "Watching; no move needed yet."}</p>
                </>
              )}
            </div>
          </div>
        ) : <p className="us-quiet">No decision on this unit right now. The agents keep watching; anything new appears here and on the refinery page.</p>}
      </Step>

      {/* ④ OPTIMISE */}
      <Step n={4} id="s-optimise" title="How the move is found" who={<><Who k="optimiser">optimiser</Who><Who k="check">trust checks</Who></>}>
        {d?.enabled_by?.length ? (
          <ol className="us-chain">{d.enabled_by.map((s, i) => (
            <li key={i} className={`k-${s.kind}`}><span className="hs-kind">{KIND[s.kind] ?? s.kind}</span><b>{s.name}</b><span>{s.did}</span></li>
          ))}</ol>
        ) : null}
        <div className="us-grid optimise">
          <div>
            <h3>{d?.gates.length ? `Checks before advising — ${nPass} of ${d.gates.length} pass` : "Checks before advising"}</h3>
            {d?.gates.length ? (
              <ul className="us-gates">{d.gates.map((g) => {
                const r = g.value != null && g.limit ? Math.min(1.15, Math.abs(g.value) / Math.abs(g.limit)) : null;
                return (
                  <li key={g.id} className={g.pass ? "pass" : "fail"}>
                    <span className="nm">{g.name ?? g.id}</span>
                    <span className="bar">{r != null && g.op === "≤" ? <i style={{ width: `${(r / 1.15) * 100}%` }} /> : null}{g.op === "≤" ? <em style={{ left: `${(1 / 1.15) * 100}%` }} /> : null}</span>
                    <span className="val num">{g.value == null ? "n/a" : fx(g.value)} {g.op} {fx(g.limit)}{g.unit ? ` ${g.unit}` : ""}</span>
                    <span className="ok">{g.pass ? "pass" : "fail"}</span>
                  </li>
                );
              })}</ul>
            ) : <p className="us-note">{d?.status === "withheld" ? d.withheld_text : "No checks needed for this item."}</p>}
          </div>
          <div>
            {d?.type === "D3" && recipe ? (
              <>
                <h3>What the multi-set-point search found — not shown as advice</h3>
                <ul className="us-levers">{recipe.moves.map((m) => <li key={m.sp_tag}><span>{m.label}</span><b className="num">{fx(m.current, 1)} → {fx(m.recommended, 1)} <small>{m.unit}</small></b></li>)}</ul>
                <p className="us-why">Blocked by the plausibility check: it predicts compressor power {recipe.d_power_MW >= 0 ? "+" : ""}{fx(recipe.d_power_MW, 1)} MW and LPG {recipe.d_yield_pct_feed?.LPG >= 0 ? "+" : ""}{fx(recipe.d_yield_pct_feed?.LPG, 1)} % feed, which is outside what this unit can physically do. {(recipe as { n_candidates?: number }).n_candidates ?? "Many"} candidates searched.</p>
                <p className="us-note subtle">It becomes live advice once designed moves of these levers are in the training data (lever batch queued).</p>
              </>
            ) : move && p ? (
              <>
                <h3>The search, in plain words</h3>
                <ul className="uf-opt">
                  <li><span>Goal</span>chance on spec ≥ 95 % with the smallest move of {move.label.toLowerCase()}</li>
                  <li><span>Limits</span>SOP step ≤ 5 °F · 30 min between moves · set-point range</li>
                  <li><span>Model</span>4-model soft sensor, weighted for the crude now ({data.regime?.regime_id ?? "—"})</li>
                  <li><span>Result</span>{fx(move.from, 1)} → {fx(move.to, 1)} {move.unit}: {pct(p.p_on_spec_before)} → {pct(p.p_on_spec_after)}, margin to spec {fx(p.margin_after, 1)} {move.unit}</li>
                </ul>
              </>
            ) : (
              <>
                <h3>The search</h3>
                <p className="us-note">{d?.proposed.sample ? "No set point moves here; the cheapest way to cut uncertainty is an earlier lab sample." : "Nothing to optimise on this unit right now."}</p>
              </>
            )}
            {d?.evidence?.docs?.length ? <p className="us-note subtle">Backed by {d.evidence.docs.join(" · ")}{d.evidence.lakehouse ? ` · ${d.evidence.lakehouse}` : ""}</p> : null}
          </div>
        </div>
      </Step>

      {/* footer */}
      <footer className="us-foot">
        <div>
          <h3>This shift on the unit</h3>
          <ol className="us-events">{a.events.slice(-6).reverse().map((e) => (
            <li key={e.event_id} className={`ev-${e.severity}`}><span className="num">{clock(e.time_min)}</span>{(e as { label?: string }).label ?? `${TAGN[e.tag] ?? e.tag} ${EVK[e.kind] ?? e.kind.replace("_", " ")}`}</li>
          ))}</ol>
        </div>
        <div>
          <h3>Use cases on this unit</h3>
          <ul className="us-ucs">{u.use_cases.map((x) => <li key={x.id}><b>{x.id}</b> {x.title}</li>)}</ul>
        </div>
        <p className="home-prov subtle">Simulated data · run {data.run_id} · advisory only — nothing here writes to a control system</p>
      </footer>
    </div>
  );
}

export default function UnitStory({ unitId }: { unitId: string }) {
  return <UnitStoryInner unitId={unitId} />;
}
