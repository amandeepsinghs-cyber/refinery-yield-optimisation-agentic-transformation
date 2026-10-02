"use client";

/**
 * L0 Refinery Twin — application home (SDD-L0-01..04 as amended 2026-10-02 per verbatim.md, BDD-28).
 *
 *   header · plant status + crude slate · lakehouse → ML flow strip
 *   main: six live unit tiles in process order with loop connectors (each tile: KPI vs plan, 4-h fan sparkline with
 *         ŷ ± 2σ, compact N(μ,σ) vs plan / spec) · cause → effect card (systems agent) · full flowsheet (collapsed)
 *   rail: open decisions (Accept / Decline) · needs attention · crude / assay adaptation
 *   shift timeline
 *
 * Every number comes from GET /api/twin; model internals (members, residuals, what-if) stay on L1.
 */

import { useEffect, useState } from "react";
import { useCockpit } from "@/lib/store";
import { useRuns } from "@/lib/api";
import { getTwinOverview } from "@/lib/twinApi";
import type { TwinOverview } from "@/lib/twinTypes";
import L0Header from "./L0Header";
import PlantStatusStrip from "./PlantStatusStrip";
import FlowStrip from "./FlowStrip";
import UnitFlowGrid from "./UnitFlowGrid";
import RippleCard from "./RippleCard";
import RefineryPFD from "./RefineryPFD";
import OpenDecisionsCard from "./OpenDecisionsCard";
import NeedsAttentionRail from "./NeedsAttentionRail";
import CrudeAdaptationCard from "./CrudeAdaptationCard";
import ShiftTimeline from "./ShiftTimeline";

export default function L0Home() {
  const runId = useCockpit((s) => s.runId);
  const timeMin = useCockpit((s) => s.timeMin);
  const runs = useRuns();
  const maxMin = runs.data?.find((r) => r.run_id === runId)?.n_minutes ?? null;

  const [data, setData] = useState<TwinOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getTwinOverview(runId, timeMin)
      .then((d) => { if (active) { setData(d); setError(null); } })
      .catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : "Twin API unavailable"); });
    return () => { active = false; };
  }, [runId, timeMin]);

  if (!data) {
    return (
      <div className="twin-container l0" data-testid="l0-root">
        <div className="l0-loading muted">{error ? `Twin engine unavailable — ${error}` : "Loading refinery twin…"}</div>
      </div>
    );
  }

  const t = data.plant?.time_min ?? timeMin ?? 0;
  const rid = data.provenance?.run_id ?? runId ?? "";
  return (
    <div className="twin-container l0" data-testid="l0-root">
      <L0Header plant={data.plant} />
      <PlantStatusStrip data={data} />
      <FlowStrip data={data} totalMin={maxMin} />
      <div className="l0-body">
        <div className="l0-main-col">
          <UnitFlowGrid units={data.units} />
          <RippleCard data={data} />
          <details className="l0-pfd" data-testid="full-flowsheet">
            <summary>Full flowsheet — boundary units (CDU, VDU, hydrotreaters, reformer, alkylation, blending, utilities)</summary>
            <div className="l0-main"><RefineryPFD units={data.units} /></div>
          </details>
        </div>
        <aside className="l0-rail-col" data-testid="l0-rail">
          <OpenDecisionsCard units={data.units} runId={rid} timeMin={t} />
          <NeedsAttentionRail items={data.needs_attention} />
          <CrudeAdaptationCard data={data} />
        </aside>
      </div>
      <ShiftTimeline timeline={data.timeline} timeMin={t} maxMin={maxMin} />
    </div>
  );
}
