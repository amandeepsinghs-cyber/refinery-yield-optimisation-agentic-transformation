"use client";

/**
 * L0 Refinery Twin — application home (SDD-L0-01..04, BDD-28).
 * Header · plant status + crude slate · whole-refinery PFD with six live units · "Needs attention" rail · shift timeline.
 * No Plotly chart and no model internals on this screen; every number comes from GET /api/twin.
 */

import { useEffect, useState } from "react";
import { useCockpit } from "@/lib/store";
import { useRuns } from "@/lib/api";
import { getTwinOverview } from "@/lib/twinApi";
import type { TwinOverview } from "@/lib/twinTypes";
import L0Header from "./L0Header";
import PlantStatusStrip from "./PlantStatusStrip";
import RefineryPFD from "./RefineryPFD";
import NeedsAttentionRail from "./NeedsAttentionRail";
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
  return (
    <div className="twin-container l0" data-testid="l0-root">
      <L0Header plant={data.plant} />
      <PlantStatusStrip data={data} />
      <div className="l0-body">
        <div className="l0-main">
          <RefineryPFD units={data.units} />
        </div>
        <NeedsAttentionRail items={data.needs_attention} />
      </div>
      <ShiftTimeline timeline={data.timeline} timeMin={t} maxMin={maxMin} />
    </div>
  );
}
