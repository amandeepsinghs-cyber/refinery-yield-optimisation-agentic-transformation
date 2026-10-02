"use client";

/**
 * L0 Refinery home — UI v2 (verbatim VN-6, BDD-29, ISA-101 register).
 *
 * Pyramid order, top to bottom:
 *   Q1  headline sentence — is the refinery OK, where is it not, what to review
 *   Q2  crude-slate line  — declared vs detected regime
 *   Q1.1 unit train       — six flat tiles in process order (state · hero KPI · Δ vs plan · 1 px trend)
 *   Q1.2/Q3 detail pane   — hover / focus / pin a unit: curve + band, N(μ,σ), since-when-why, ripple, recommendations;
 *                           default: needs attention + real recommendations
 *   Q4  footer            — provenance, cadence, mass closure, flags
 *   About this data       — lakehouse → ML flow strip and the full flowsheet, behind a disclosure (demo narrative)
 *
 * Every number comes from GET /api/twin; model internals (members, residuals, what-if) stay on L1. Accept / Decline
 * is an L1 action (one primary action per screen).
 */

import { useEffect, useState } from "react";
import { useCockpit } from "@/lib/store";
import { useRuns } from "@/lib/api";
import { getTwinOverview } from "@/lib/twinApi";
import type { TwinOverview } from "@/lib/twinTypes";
import L0Header from "./L0Header";
import { CrudeLine, Footer, Headline } from "./HeadlineStrip";
import UnitTrain from "./UnitTrain";
import DetailPane from "./DetailPane";
import FlowStrip from "./FlowStrip";
import RefineryPFD from "./RefineryPFD";
import ShiftTimeline from "./ShiftTimeline";

export default function L0Home() {
  const runId = useCockpit((s) => s.runId);
  const timeMin = useCockpit((s) => s.timeMin);
  const setHoverUnit = useCockpit((s) => s.setHoverUnit);
  const setPinnedUnit = useCockpit((s) => s.setPinnedUnit);
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

  // Leaving the home clears hover / pin so the next visit starts on the plant overview.
  useEffect(() => () => { setHoverUnit(null); setPinnedUnit(null); }, [setHoverUnit, setPinnedUnit]);

  if (!data) {
    return (
      <div className="twin-container l0 l0v2" data-testid="l0-root">
        <div className="l0-loading muted">{error ? `Twin engine unavailable — ${error}` : "Loading refinery…"}</div>
      </div>
    );
  }

  const t = data.plant?.time_min ?? timeMin ?? 0;
  return (
    <div className="twin-container l0 l0v2" data-testid="l0-root">
      <L0Header plant={data.plant} />
      <Headline data={data} />
      <CrudeLine data={data} />
      <div className="l0v2-body">
        <div className="l0v2-main">
          <UnitTrain units={data.units} />
          <ShiftTimeline timeline={data.timeline} timeMin={t} maxMin={maxMin} />
          <Footer data={data} totalMin={maxMin} />
          <details className="l0-about" data-testid="about-data">
            <summary>About this data — historian → lakehouse → models → decisions, and the full flowsheet</summary>
            <div className="l0-about-body">
              <FlowStrip data={data} totalMin={maxMin} />
              <div className="l0-main"><RefineryPFD units={data.units} /></div>
            </div>
          </details>
        </div>
        <DetailPane data={data} />
      </div>
    </div>
  );
}
