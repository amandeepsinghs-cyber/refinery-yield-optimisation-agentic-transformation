"use client";

import { useMemo } from "react";
import type { Annotations, Data, Shape } from "plotly.js";
import Chart from "@/components/charts/Chart";
import { W90Chart } from "@/components/charts/EstimateCharts";
import { useDistribution, useEstimatesTimeseries, useRuns } from "@/lib/api";
import { clock, num, pct, propLabel } from "@/lib/format";
import { axisStyle, baseLayout, hexA } from "@/lib/plotTheme";
import { useCockpit } from "@/lib/store";
import { FONT_MONO, MODEL_ORDER, STATUS, TOKENS, modelColor, modelLabel } from "@/lib/theme";
import type { Distribution } from "@/lib/types";
import {
  Card,
  EmptyState,
  ErrorState,
  GateBadge,
  GateBanner,
  LoadingBlock,
  NoRun,
  PageHeader,
  QueryView,
  TrustBadge,
} from "@/components/ui/primitives";

function orderedMembers(d: Distribution) {
  const keys = Object.keys(d.members);
  return [...MODEL_ORDER.filter((k) => keys.includes(k)), ...keys.filter((k) => !MODEL_ORDER.includes(k))];
}

export function DistributionOverlay({ d, height = 400 }: { d: Distribution; height?: number }) {
  const theme = useCockpit((s) => s.theme);
  const { data, layout } = useMemo(() => {
    const t = TOKENS[theme];
    const data: Data[] = [];
    for (const id of orderedMembers(d)) {
      const m = d.members[id];
      const inactive = m.shadow || !m.admitted;
      const color = modelColor(id, theme);
      data.push({
        type: "scatter",
        mode: "lines",
        x: d.grid,
        y: m.pdf,
        name: `${modelLabel(id)} · w ${m.weight.toFixed(2)}${inactive ? " (shadow)" : ""}`,
        line: { width: 1.3, color, dash: inactive ? "dot" : "solid", shape: "spline" },
        opacity: inactive ? 0.72 : 0.92,
        fill: "tozeroy",
        fillcolor: hexA(color, inactive ? 0.035 : 0.075),
        hovertemplate: `${modelLabel(id)} μ ${m.mu.toFixed(1)} σ ${m.sigma.toFixed(1)}<extra></extra>`,
      });
    }
    data.push({
      type: "scatter",
      mode: "lines",
      x: d.grid,
      y: d.mixture.pdf,
      name: "Mixture",
      line: { width: 1.85, color: t.text, shape: "spline" },
      hovertemplate: "Mixture %{x:.1f} °F: %{y:.3f}<extra></extra>",
    });
    const shapes: Partial<Shape>[] = [
      {
        type: "rect",
        xref: "x",
        yref: "paper",
        x0: d.mixture.q05,
        x1: d.mixture.q95,
        y0: 0,
        y1: 1,
        fillcolor: theme === "dark" ? "rgba(250,250,250,0.04)" : "rgba(9,9,11,0.04)",
        line: { width: 0 },
        layer: "below",
      },
      {
        type: "line",
        xref: "x",
        yref: "paper",
        x0: d.spec_max,
        x1: d.spec_max,
        y0: 0,
        y1: 1,
        line: { color: STATUS.RED, width: 1.2, dash: "dash" },
      },
    ];
    const g0 = d.grid[0] ?? 0;
    const g1 = d.grid.at(-1) ?? 1;
    const specRight = g1 > g0 && (d.spec_max - g0) / (g1 - g0) > 0.7;
    const annotations: Partial<Annotations>[] = [
      {
        xref: "x",
        yref: "paper",
        x: d.spec_max,
        y: 0.86,
        ...(specRight ? { xanchor: "right" as const, xshift: -4 } : { xanchor: "left" as const, xshift: 4 }),
        text: `spec ${d.spec_max} °F`,
        showarrow: false,
        font: { size: 10.5, color: STATUS.RED },
        bgcolor: t.card,
      },
    ];
    for (const id of orderedMembers(d)) {
      const m = d.members[id];
      const peak = Math.max(...m.pdf);
      annotations.push({
        x: m.mu,
        y: peak,
        text: m.mu.toFixed(1),
        showarrow: false,
        yanchor: "bottom",
        font: { size: 10, color: modelColor(id, theme), family: FONT_MONO },
      });
    }
    if (d.truth !== null && d.truth !== undefined) {
      shapes.push({
        type: "line",
        xref: "x",
        yref: "paper",
        x0: d.truth,
        x1: d.truth,
        y0: 0,
        y1: 1,
        line: { color: t.muted, width: 1.2, dash: "dot" },
      });
      const truthRight = g1 > g0 && (d.truth - g0) / (g1 - g0) > 0.7;
      annotations.push({
        xref: "x",
        yref: "paper",
        x: d.truth,
        y: 1,
        yanchor: "top",
        ...(truthRight ? { xanchor: "right" as const, xshift: -3 } : { xanchor: "left" as const, xshift: 3 }),
        text: `simulator truth ${d.truth.toFixed(1)}`,
        showarrow: false,
        font: { size: 10, color: t.muted },
        bgcolor: t.card,
      });
    }
    const layout = baseLayout(theme, {
      hovermode: "x unified",
      margin: { l: 44, r: 16, t: 40, b: 36 },
      legend: { ...baseLayout(theme).legend, orientation: "h", x: 0, xanchor: "left", y: 1.02, yanchor: "bottom", font: { size: 11, color: t.text } },
      xaxis: { ...axisStyle(theme), title: { text: "°F", font: { size: 11, color: t.muted } }, showspikes: true, spikemode: "across", spikecolor: t.muted, spikedash: "dot", spikethickness: 1 },
      yaxis: { ...axisStyle(theme), title: { text: "density", font: { size: 11, color: t.muted } }, rangemode: "tozero" },
      shapes,
      annotations,
    });
    return { data, layout };
  }, [d, theme]);
  return <Chart data={data} layout={layout} height={height} ariaLabel="Overlaid member predictive distributions and mixture with spec line and P5–P95 interval" />;
}

function SpreadGauge({ w90, limit }: { w90: number; limit: number }) {
  const theme = useCockpit((s) => s.theme);
  const { data, layout } = useMemo(() => {
    const t = TOKENS[theme];
    const max = Math.max(limit * 1.6, w90 * 1.1);
    const color = w90 > limit ? STATUS.RED : w90 >= 0.9 * limit ? STATUS.AMBER : STATUS.GREEN;
    const data: Data[] = [
      {
        type: "indicator",
        mode: "gauge+number",
        value: w90,
        number: { suffix: " °F", valueformat: ".1f", font: { family: FONT_MONO, size: 30, color: t.text } },
        gauge: {
          axis: { range: [0, max], tickfont: { family: FONT_MONO, size: 10, color: t.muted }, tickcolor: t.border },
          bar: { color, thickness: 0.28 },
          bgcolor: "rgba(0,0,0,0)",
          borderwidth: 0,
          steps: [
            { range: [0, 0.9 * limit], color: hexA(STATUS.GREEN, 0.28) },
            { range: [0.9 * limit, limit], color: hexA(STATUS.AMBER, 0.32) },
            { range: [limit, max], color: hexA(STATUS.RED, 0.28) },
          ],
          threshold: { line: { color: t.text, width: 2 }, thickness: 0.85, value: limit },
        },
      } as Data,
    ];
    const layout = baseLayout(theme, { margin: { l: 24, r: 24, t: 16, b: 8 } });
    return { data, layout };
  }, [w90, limit, theme]);
  const status = w90 > limit ? "over limit" : w90 >= 0.9 * limit ? "near limit" : "within limit";
  return (
    <>
      <Chart data={data} layout={layout} height={190} ariaLabel={`Spread gauge: W90 ${w90.toFixed(1)} °F, ${status} of ${limit} °F`} />
      <div className="row between" style={{ fontSize: 12.5 }}>
        <span className="muted">limit {limit.toFixed(1)} °F</span>
        <span className={`badge ${w90 > limit ? "red" : w90 >= 0.9 * limit ? "amber" : "green"}`}>{status}</span>
      </div>
    </>
  );
}

function MinutePicker({ max }: { max: number }) {
  const timeMin = useCockpit((s) => s.timeMin);
  const setTimeMin = useCockpit((s) => s.setTimeMin);
  const v = timeMin ?? max;
  const set = (n: number) => setTimeMin(Math.max(0, Math.min(max, Math.round(n))));
  return (
    <div className="minute-picker">
      <button type="button" className="btn sm" onClick={() => set(v - 1)} aria-label="Previous minute">
        −1
      </button>
      <input
        type="range"
        className="slider"
        min={0}
        max={max}
        value={v}
        onChange={(e) => set(Number(e.target.value))}
        aria-label="Minute (shared time cursor)"
      />
      <button type="button" className="btn sm" onClick={() => set(v + 1)} aria-label="Next minute">
        +1
      </button>
      <input
        type="number"
        className="input mono"
        min={0}
        max={max}
        value={v}
        onChange={(e) => set(Number(e.target.value))}
        aria-label="Minute"
      />
      <span className="mono muted">{clock(v)}</span>
    </div>
  );
}

export default function ConfidenceView() {
  const runId = useCockpit((s) => s.runId);
  const property = useCockpit((s) => s.property);
  const timeMin = useCockpit((s) => s.timeMin);
  const setTimeMin = useCockpit((s) => s.setTimeMin);
  const runs = useRuns();
  const run = runs.data?.find((r) => r.run_id === runId);
  const t = timeMin ?? run?.n_minutes ?? null;
  const dist = useDistribution(runId, property, t);
  const est = useEstimatesTimeseries(runId, property, {}, 1500);
  const d = dist.data;

  return (
    <div className="page">
      {d?.gate?.status === "WITHHELD" && d.gate.message ? <GateBanner message={d.gate.message} /> : null}
      <PageHeader
        title={`Model Confidence · ${propLabel(property)}`}
        question="How sure are we, and do the models agree at this minute?"
        actions={run ? <MinutePicker max={run.n_minutes} /> : null}
      />
      {!runId && !runs.isLoading ? (
        <Card>
          <NoRun />
        </Card>
      ) : (
        <>
          <div className="grid">
            <Card className="s-8 s-md-12" title="Predictive distributions"
              sub={
                t !== null
                  ? `t ${t} (${clock(t)})${dist.data ? ` · P5–P95 ${num(dist.data.mixture.q05)} to ${num(dist.data.mixture.q95)} °F (shaded)` : ""}`
                  : undefined
              }>
              {dist.isLoading ? (
                <LoadingBlock height={400} />
              ) : dist.isError ? (
                <ErrorState error={dist.error} onRetry={() => dist.refetch()} />
              ) : d && d.grid?.length ? (
                <DistributionOverlay d={d} />
              ) : (
                <EmptyState title="No distribution at this minute" detail={d?.note ?? undefined} />
              )}
            </Card>
            <div className="s-4 s-md-12 stack" style={{ gap: 16 }}>
              <Card title="Spread W90">
                {d ? <SpreadGauge w90={d.w90} limit={d.w90_limit} /> : <LoadingBlock height={190} />}
              </Card>
              <Card title="Members" bodyClass="flush">
                {d ? (
                  <>
                    <div className="table-wrap">
                      <table className="t">
                        <thead>
                          <tr>
                            <th>Model</th>
                            <th className="r">μ °F</th>
                            <th className="r">σ °F</th>
                            <th className="r">Weight</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {orderedMembers(d).map((id) => {
                            const m = d.members[id];
                            const inactive = m.shadow || !m.admitted;
                            return (
                              <tr key={id} className={inactive ? "shadow" : ""}>
                                <td style={{ whiteSpace: "nowrap" }}>
                                  <span className="swatch" style={{ background: inactive ? "var(--subtle)" : modelColor(id, "dark") }} />
                                  {modelLabel(id)}
                                </td>
                                <td className="r">{num(m.mu)}</td>
                                <td className="r">{num(m.sigma)}</td>
                                <td className="r">{num(m.weight, 2)}</td>
                                <td>
                                  <span className={`badge ${inactive ? "neutral" : "green"}`}>{m.shadow ? "shadow" : m.admitted ? "admitted" : "not admitted"}</span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="bimodal-row">
                      <span className="muted">Bimodality D</span>
                      <span className={`badge ${d.bimodal ? "amber" : "green"}`}>
                        D {num(d.bimodality_d)} — {d.bimodal ? "models disagree (bimodal)" : "unimodal"}
                      </span>
                    </div>
                    <div className="bimodal-row">
                      <span className="muted">Trust · gate</span>
                      <span className="row" style={{ gap: 6 }}>
                        <TrustBadge level={d.trust.level} short />
                        <GateBadge status={d.gate.status} />
                      </span>
                    </div>
                    <div className="bimodal-row" style={{ paddingBottom: 10 }}>
                      <span className="muted">P(on-spec) · mean</span>
                      <span className="mono">
                        {pct(d.mixture.p_on_spec, 1)} · {num(d.mixture.mean)} °F
                      </span>
                    </div>
                  </>
                ) : (
                  <LoadingBlock height={180} />
                )}
              </Card>
            </div>
          </div>
          <Card title="W90 over time" sub="click to move the minute">
            <QueryView q={est} height={200} isEmpty={(e) => !e.time_min?.length}>
              {(e) => (
                <W90Chart
                  time={e.time_min}
                  w90={e.w90}
                  gate={e.gate}
                  limit={e.w90_limit}
                  cursor={t}
                  onPick={setTimeMin}
                  height={210}
                  ariaLabel="W90 over the run versus limit with WITHHELD bands"
                />
              )}
            </QueryView>
          </Card>
        </>
      )}
    </div>
  );
}
