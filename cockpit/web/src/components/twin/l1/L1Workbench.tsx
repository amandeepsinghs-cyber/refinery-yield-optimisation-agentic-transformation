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
  useEffect(() => {
    if ((!uc && !tag) || !data) return;
    const owning =
      (uc && (data.panels.find((p) => p.panel_id === data.unit.use_cases.find((u) => u.id === uc)?.panel_id) ?? data.panels.find((p) => p.use_case_ids?.includes(uc)))) ||
      (tag && (data.panels.find((p) => p.kind === "measured_vs_expected" && p.traces?.some((tr) => tr.key === tag)) ?? data.panels.find((p) => p.traces?.some((tr) => tr.key === tag)))) ||
      null;
    if (!owning) return;
    if (!primary.some((p) => p.panel_id === owning.panel_id)) setShowMore(true);
    const t = setTimeout(() => {
      const el = document.getElementById(`panel-${owning.panel_id}`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("twin-panel-highlight");
      setTimeout(() => el.classList.remove("twin-panel-highlight"), 6000);
    }, 400);
    return () => clearTimeout(t);
  }, [uc, tag, data, primary]);

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
          <div className="l1-zone-label"><span className="l1-section-label">Data</span><span className="muted">{data.series.time_min.length} pts · window {data.time.window_start}–{data.time.window_end} min · one cursor</span></div>
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
