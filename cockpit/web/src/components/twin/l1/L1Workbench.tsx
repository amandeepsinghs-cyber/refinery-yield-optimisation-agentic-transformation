"use client";

/**
 * L1 Unit Workbench (SDD-L1-01..07, BDD-28). One call — GET /api/unit/{unit_id}/workbench — renders:
 *   header · I/O strip · [Data] chart stack on one cursor · [Analysis] strip + event ribbon
 *   rail (decisions first — verbatim VN-5 "where are the decisions?"): [Decisions] decision, N(μ,σ) target distribution, optimisation · [Models] regime, evidence · Gemini
 * `?uc=UC-05` scrolls to that use case's signature panel and highlights it (SDD-L1-04).
 */

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useCockpit } from "@/lib/store";
import { getTwinWorkbench } from "@/lib/twinApi";
import type { TwinWorkbench } from "@/lib/twinTypes";
import { citationChips, openDecision, selectPanels } from "@/lib/l1";
import { dg, useScreenPart } from "@/lib/screenPart";
import { clock } from "@/lib/format";
import L1Header from "./L1Header";
import UnitIOStrip from "./UnitIOStrip";
import ChartStack from "./ChartStack";
import AnalysisStrip from "./AnalysisStrip";
import EventRibbon from "./EventRibbon";
import RegimeCard from "./RegimeCard";
import OptimisationCard from "./OptimisationCard";
import ModelEvidenceCard from "./ModelEvidenceCard";
import DecisionCard from "./DecisionCard";
import AskGeminiCard from "./AskGeminiCard";
import TargetDistributionCard from "./TargetDistributionCard";

function L1Content({ unitId }: { unitId: string }) {
  const searchParams = useSearchParams();
  const uc = searchParams?.get("uc") ?? null;
  const tag = searchParams?.get("tag") ?? null;
  const runId = useCockpit((s) => s.runId);
  const timeMin = useCockpit((s) => s.timeMin);
  const setRun = useCockpit((s) => s.setRun);

  const [data, setData] = useState<TwinWorkbench | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    setLoading(true);
    // On a fresh browser the store is empty; the API then picks its default run and the run's last minute.
    getTwinWorkbench(unitId, runId, timeMin)
      .then((d) => {
        if (!live) return;
        if (!d || !d.unit) { setError(`unknown unit '${unitId}'`); return; }
        setData(d);
        setError(null);
        if (runId == null || timeMin == null) setRun(d.run_id ?? d.regime?.run_id ?? runId, d.time.time_min);
      })
      .catch((e: unknown) => { if (live) setError(e instanceof Error ? e.message : "workbench unavailable"); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [unitId, runId, timeMin, setRun]);

  const resolvedRun = data?.run_id ?? data?.regime?.run_id ?? runId ?? null;
  const resolvedMin = data?.time.time_min ?? timeMin ?? null;

  // Shared hover guide across panels (rAF-throttled).
  const [hoverMin, setHoverMin] = useState<number | null>(null);
  const raf = useRef<number | null>(null);
  const onHover = useCallback((m: number | null) => {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => setHoverMin(m));
  }, []);

  const [showMore, setShowMore] = useState(searchParams?.get("more") === "1");
  const { primary, more } = useMemo(() => selectPanels(data?.panels ?? []), [data?.panels]);
  const panels = showMore ? [...primary, ...more] : primary;

  // ?uc= / ?tag= entry (L0 attention rail → L1): scroll to the owning panel and highlight it.
  const owningPanelId = useMemo(() => {
    if ((!uc && !tag) || !data) return null;
    const owning =
      (uc && (data.panels.find((p) => p.panel_id === data.unit.use_cases.find((u) => u.id === uc)?.panel_id) ?? data.panels.find((p) => p.use_case_ids?.includes(uc)))) ||
      (tag && (data.panels.find((p) => p.kind === "measured_vs_expected" && p.traces?.some((tr) => tr.key === tag)) ?? data.panels.find((p) => p.traces?.some((tr) => tr.key === tag)))) ||
      null;
    return owning?.panel_id ?? null;
  }, [uc, tag, data]);
  useEffect(() => {
    if (!owningPanelId) return;
    if (!primary.some((p) => p.panel_id === owningPanelId)) setShowMore(true);
    const t = setTimeout(() => {
      const el = document.getElementById(`panel-${owningPanelId}`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("twin-panel-highlight");
      setTimeout(() => el.classList.remove("twin-panel-highlight"), 6000);
    }, 400);
    return () => clearTimeout(t);
  }, [owningPanelId, primary]);

  // Tell Gemini which panels are on screen and which one the operator was sent to (SDD-GEM-02 page context).
  const setScreenPanels = useCockpit((s) => s.setScreenPanels);
  useEffect(() => {
    setScreenPanels(panels.map((p) => p.panel_id), owningPanelId);
  }, [panels, owningPanelId, setScreenPanels]);
  useEffect(() => () => setScreenPanels([], null), [setScreenPanels]);

  // SDD-GEM-04: what the workbench is rendering right now — panel by panel with the value at the cursor — so
  // "explain this screen" is answered from the drawn content, not a summary.
  const lang = useCockpit((s) => s.lang);
  const digest = useMemo(() => {
    if (!data) return null;
    const tmin = data.series.time_min;
    const cursor = resolvedMin ?? data.time.time_min;
    let ci = tmin.length - 1;
    for (let i = 0; i < tmin.length; i++) if (tmin[i] <= cursor) ci = i;
    const at = (key: string) => { const arr = data.series.keys[key]; const v = arr ? arr[ci] : null; return v == null || !Number.isFinite(v) ? null : dg(v); };
    const dec = openDecision(data.decisions);
    const rc = data.recipe;
    return {
      unit: `${data.unit.short_name}`, status: data.unit.status_label ?? data.unit.status, cursor_min: cursor, window: [data.time.window_start, data.time.window_end], next_lab_min: data.time.next_lab_min,
      headline_kpi: data.unit.headline_kpi ? { label: data.unit.headline_kpi.label, value: dg(data.unit.headline_kpi.value), plan: dg(data.unit.headline_kpi.plan), tol: data.unit.headline_kpi.tol, unit: data.unit.headline_kpi.unit } : null,
      io: { in: data.unit.io.inputs.slice(0, 4).map((i) => `${i.label} ${dg(i.value)} ${i.unit}`), out: data.unit.io.outputs.slice(0, 6).map((o) => `${o.label} ${dg(o.value)} ${o.unit}`) },
      panels: panels.map((p) => ({
        id: p.panel_id, kind: p.kind, title: p.title, highlighted: p.panel_id === owningPanelId || undefined,
        traces: (p.traces ?? []).slice(0, 8).map((tr) => ({ label: tr.label ?? tr.key, role: tr.role, at_cursor: at(tr.key), unit: tr.unit ?? p.unit })),
        reference_lines: (p.hlines ?? []).map((h) => `${h.label} ${dg(h.value)}`),
        markers: (p.markers ?? []).slice(0, 6).map((m) => `${m.label} @ ${m.time_min} min`),
      })),
      analysis: { expected_source: data.analysis.expected_source, residual_now: dg(data.analysis.residual_now), sigma_now: dg(data.analysis.sigma_now), cusum_now: dg(data.analysis.cusum_now),
        breach_open: data.analysis.breach_open, first_breach_min: data.analysis.first_breach_min, root_cause: data.analysis.root_cause.slice(0, 3).map((r) => `${r.label ?? r.tag} ${r.direction} (${Math.round(r.contrib * 100)} %)`),
        summary: data.analysis.summary[lang] ?? data.analysis.summary.en },
      regime: data.regime ? { id: data.regime.regime_id, label: data.regime.regime_label, declared_api: dg(data.regime.declared_api, 1), declared_vs_detected: data.regime.declared_vs_detected, novelty: dg(data.regime.novelty, 2), transition_pct: data.regime.transition_pct,
        crude_family_is_context: true,
        feed: data.regime.feed ? { state: data.regime.feed.state, pct_through: data.regime.feed.pct_through, api_est: dg(data.regime.feed.api_est, 1), api_band: dg(data.regime.feed.api_band, 1), feed_class: data.regime.feed.feed_class_label, novel: data.regime.feed.novel } : null } : null,
      recipe: rc ? { gate: rc.gate, gate_reason: rc.gate_reason, moves: rc.moves.map((m) => `${m.label ?? m.sp_tag} ${dg(m.current)} → ${dg(m.recommended)} ${m.unit}`) } : null,
      decision: dec ? { line: `${dec.action} ${dec.parameter} ${dg(dec.sp_before)} → ${dg(dec.sp_after)} ${dec.unit}`, trust: dec.trust ?? null, gate: dec.gate_status ?? null, rationale: dec.rationale ?? null } : null,
      models: { committee_weights: (data.models.committee?.weights ?? []).map((w) => `${w.label} ${Math.round(w.weight * 100)} %`), surrogate: `${data.models.surrogate.name} (${data.models.surrogate.regime_id})` },
    };
  }, [data, panels, owningPanelId, resolvedMin, lang]);
  useScreenPart("l1", digest);

  if (error) return <div className="twin-container l1-root l1-error" data-testid="l1-root" role="alert">Workbench unavailable: {error}</div>;
  if (loading && !data) return <div className="twin-container l1-root l1-loading" data-testid="l1-root"><div className="skeleton" style={{ height: 48 }} /><div className="skeleton" style={{ height: 420, marginTop: 12 }} /></div>;
  if (!data || !resolvedRun || resolvedMin == null) return null;

  const decision = openDecision(data.decisions);
  const ucCites = uc ? data.citations : [];
  const docChips = citationChips(data.recipe?.citations, decision?.citations, data.citations);

  return (
    <div className="twin-container l1-root" data-testid="l1-root" data-unit={data.unit.unit_id} data-uc={uc ?? undefined}>
      <L1Header data={data} />
      <UnitIOStrip unit={data.unit} />
      <div className="l1-body">
        <div className="l1-main">
          <div className="l1-zone-label"><span className="l1-section-label">Data</span><span className="muted">{clock(data.time.window_start)}–{clock(data.time.window_end)} · one cursor across all panels</span></div>
          <ChartStack data={data} panels={panels} hoverMin={hoverMin} onHover={onHover} />
          {more.length > 0 && (
            <button type="button" className="btn text l1-more" onClick={() => setShowMore((v) => !v)} aria-expanded={showMore} data-testid="more-panels">
              {showMore ? "Fewer panels ▴" : `More panels (${more.length}) ▾`}
            </button>
          )}
          <AnalysisStrip analysis={data.analysis} unit={data.unit.headline_kpi?.unit} />
          <EventRibbon events={data.analysis.events} />
        </div>
        <aside className="l1-rail" data-testid="l1-rail">
          <div className="l1-zone-label"><span className="l1-section-label">Decisions</span><span className="muted">what to do · why · how sure</span></div>
          <DecisionCard decision={decision} recipe={data.recipe} citations={ucCites.length ? ucCites : data.citations} runId={resolvedRun} timeMin={resolvedMin} />
          <TargetDistributionCard data={data} runId={resolvedRun} timeMin={resolvedMin} />
          <OptimisationCard recipe={data.recipe} decision={decision} inputs={data.unit.io.inputs} unitId={data.unit.unit_id} runId={resolvedRun} timeMin={resolvedMin} />
          <div className="l1-zone-label"><span className="l1-section-label">Models</span></div>
          <RegimeCard regime={data.regime} committee={data.models.committee} />
          <ModelEvidenceCard models={data.models} />
          <AskGeminiCard liveTags={Object.keys(data.series.keys).length} docChips={docChips} unitLabel={data.unit.short_name.replace(/^\d+\.\s*/, "")} />
        </aside>
      </div>
    </div>
  );
}

export default function L1Workbench({ unitId }: { unitId: string }) {
  return (
    <Suspense fallback={<div className="twin-container l1-root l1-loading" data-testid="l1-root" />}>
      <L1Content unitId={unitId} />
    </Suspense>
  );
}
