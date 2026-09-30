"use client";

import { useState } from "react";
import { useEstimate, useEstimatesTimeseries, useRuns } from "@/lib/api";
import { num, pct, propLabel } from "@/lib/format";
import { useCockpit } from "@/lib/store";
import type { PropertyId } from "@/lib/types";
import { FanChart } from "@/components/charts/EstimateCharts";
import {
  Card,
  EmptyState,
  GateBadge,
  LoadingBlock,
  NoRun,
  PageHeader,
  QueryView,
  TrustBadge,
} from "@/components/ui/primitives";

function StatusCard({ property, t }: { property: PropertyId; t: number | null }) {
  const runId = useCockpit((s) => s.runId);
  const e = useEstimate(runId, property, t);
  if (e.isLoading) return <LoadingBlock height={160} />;
  if (!e.data) return <EmptyState title="No estimate at the cursor" />;
  const d = e.data;
  const spec = d.mixture.q95 !== undefined ? d.mixture : null;
  return (
    <div className="stack">
      <div className="row">
        <TrustBadge level={d.trust.level} />
        <GateBadge status={d.gate.status} />
      </div>
      <dl className="kv">
        <dt>Mixture mean</dt>
        <dd>{num(d.mixture.mean)} °F</dd>
        <dt>P5–P95</dt>
        <dd>
          {num(spec?.q05)}–{num(spec?.q95)} °F
        </dd>
        <dt>W90</dt>
        <dd>{num(d.mixture.w90)} °F</dd>
        <dt>P(on-spec)</dt>
        <dd>{pct(d.mixture.p_on_spec, 1)}</dd>
        {d.truth !== undefined && d.truth !== null ? (
          <>
            <dt>Simulator truth</dt>
            <dd>{num(d.truth)} °F</dd>
          </>
        ) : null}
        <dt>Source</dt>
        <dd>{d.source}</dd>
      </dl>
      <p className="muted" style={{ margin: 0, fontSize: 12 }}>
        {d.trust.reason}
      </p>
      {d.gate.status === "WITHHELD" && d.gate.message ? (
        <p style={{ margin: 0, fontSize: 12.5 }}>{d.gate.message}</p>
      ) : null}
    </div>
  );
}

function PropertyRow({ property, showTruth }: { property: PropertyId; showTruth: boolean }) {
  const runId = useCockpit((s) => s.runId);
  const timeMin = useCockpit((s) => s.timeMin);
  const setTimeMin = useCockpit((s) => s.setTimeMin);
  const est = useEstimatesTimeseries(runId, property, {}, 1500);
  return (
    <div className="grid">
      <Card className="s-9 s-md-12" title={`${propLabel(property)} vs spec`} sub="whole run · click to set the time cursor">
        <QueryView q={est} height={340} isEmpty={(d) => !d.time_min?.length}>
          {(d) => (
            <FanChart
              est={d}
              showTruth={showTruth}
              cursor={timeMin}
              onPick={setTimeMin}
              height={340}
              ariaLabel={`${propLabel(property)} fan chart versus spec over the run`}
            />
          )}
        </QueryView>
      </Card>
      <Card className="s-3 s-md-12" title="Status at cursor" sub={timeMin !== null ? `t ${timeMin}` : undefined}>
        <StatusCard property={property} t={timeMin} />
      </Card>
    </div>
  );
}

export default function QualityView() {
  const runId = useCockpit((s) => s.runId);
  const runs = useRuns();
  const [truth, setTruth] = useState(true);
  return (
    <div className="page">
      <PageHeader
        title="Quality"
        question="Where is quality now versus spec, and where is it heading?"
        actions={
          <label className="row" style={{ gap: 8, fontSize: 13 }}>
            <input type="checkbox" checked={truth} onChange={(e) => setTruth(e.target.checked)} id="truth-toggle" />
            Show simulator truth
          </label>
        }
      />
      {!runId && !runs.isLoading ? (
        <Card>
          <NoRun />
        </Card>
      ) : (
        <>
          <PropertyRow property="LCO_T98_F" showTruth={truth} />
          <PropertyRow property="HN_T98_F" showTruth={truth} />
        </>
      )}
    </div>
  );
}
