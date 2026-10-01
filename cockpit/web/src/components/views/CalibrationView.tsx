"use client";

import { useMemo } from "react";
import type { Annotations, Data, Layout, Shape } from "plotly.js";
import { useCalibration, useEstimatesTimeseries, useModels } from "@/lib/api";
import { num, propLabel } from "@/lib/format";
import { useCockpit } from "@/lib/store";
import { modelColor, MODEL_ORDER, STATUS, TOKENS } from "@/lib/theme";
import { axisStyle, baseLayout } from "@/lib/plotTheme";
import Chart from "@/components/charts/Chart";
import { CoverageOverTime, CusumChart, PitHistograms, ReliabilityDiagram } from "@/components/charts/ModelCharts";
import { Card, EmptyState, ErrorState, LoadingBlock, PageHeader } from "@/components/ui/primitives";
import type { EstimatesTimeseries } from "@/lib/types";

function W90BiasChart({ estTs }: { estTs: EstimatesTimeseries }) {
  const theme = useCockpit((s) => s.theme);
  const { data, layout } = useMemo(() => {
    const t = TOKENS[theme];
    const x = estTs.time_min;
    const w90 = estTs.w90;
    const bias = ((estTs as any).bias ?? []) as (number | null)[];
    const limit = estTs.w90_limit ?? 14;

    const traces: Data[] = [
      {
        type: "scatter",
        mode: "lines",
        x,
        y: w90,
        name: "W90 spread (°F)",
        line: { width: 2, color: STATUS.AMBER },
        hovertemplate: "t %{x} min · W90 %{y:.2f} °F<extra></extra>",
      },
      {
        type: "scatter",
        mode: "lines",
        x,
        y: bias,
        name: "Kalman bias b (°F)",
        yaxis: "y2",
        line: { width: 1.8, color: t.accent },
        hovertemplate: "t %{x} min · bias %{y:.2f} °F<extra></extra>",
      },
    ];

    const shapes: Partial<Shape>[] = [
      {
        type: "line",
        xref: "paper",
        x0: 0,
        x1: 1,
        yref: "y",
        y0: limit,
        y1: limit,
        line: { color: STATUS.RED, dash: "dash", width: 1.5 },
      },
      {
        type: "line",
        xref: "paper",
        x0: 0,
        x1: 1,
        yref: "y2",
        y0: 0,
        y1: 0,
        line: { color: t.border, dash: "dot", width: 1 },
      },
    ];

    const annotations: Partial<Annotations>[] = [
      {
        xref: "paper",
        x: 1,
        yref: "y",
        y: limit,
        text: `spread limit ${limit} °F`,
        showarrow: false,
        xanchor: "right",
        yanchor: "bottom",
        font: { size: 10, color: STATUS.RED },
      },
    ];

    const lay: Partial<Layout> = baseLayout(theme, {
      margin: { l: 52, r: 52, t: 32, b: 38 },
      xaxis: {
        ...axisStyle(theme),
        title: { text: "Time (min)", font: { size: 11, color: t.muted } },
      },
      yaxis: {
        ...axisStyle(theme),
        title: { text: "W90 Spread (°F)", font: { size: 11, color: STATUS.AMBER } },
        rangemode: "tozero",
      },
      yaxis2: {
        ...axisStyle(theme),
        title: { text: "Kalman Bias b (°F)", font: { size: 11, color: t.accent } },
        overlaying: "y",
        side: "right",
        showgrid: false,
      },
      legend: {
        ...baseLayout(theme).legend,
        orientation: "h",
        x: 0,
        y: 1.12,
        xanchor: "left",
        yanchor: "bottom",
      },
      shapes,
      annotations,
    });

    return { data: traces, layout: lay };
  }, [estTs, theme]);

  return (
    <Chart
      data={data}
      layout={layout}
      height={280}
      ariaLabel="Live Run W90 Spread and Kalman Bias History"
    />
  );
}

export default function CalibrationView() {
  const property = useCockpit((s) => s.property);
  const runId = useCockpit((s) => s.runId);
  const cal = useCalibration(property);
  const models = useModels(property);
  const estTs = useEstimatesTimeseries(runId, property, {});
  const d = cal.data;
  return (
    <div className="page">
      <PageHeader
        title={`Calibration · ${propLabel(property)}`}
        question="Are the distributions honest, and are the models still good?"
      />
      {cal.isLoading ? (
        <LoadingBlock height={320} />
      ) : cal.isError ? (
        <Card>
          <ErrorState error={cal.error} onRetry={() => cal.refetch()} />
        </Card>
      ) : !d ? (
        <Card>
          <EmptyState title="No calibration data" />
        </Card>
      ) : (
        <div className="grid">
          <Card
            className="s-12"
            title="Live Run W90 Spread & Kalman Bias History"
            sub={runId ? `run ${runId} · spread limit ${estTs.data?.w90_limit ?? 14} °F` : "select a run"}
          >
            {!runId ? (
              <EmptyState title="No run selected" detail="Select a run in the header to inspect live W90 spread and Kalman bias." />
            ) : estTs.isLoading ? (
              <LoadingBlock height={260} label="Loading run timeseries" />
            ) : estTs.data?.time_min?.length ? (
              <W90BiasChart estTs={estTs.data} />
            ) : (
              <EmptyState title="No timeseries points" detail="This run does not contain scored estimates yet." />
            )}
          </Card>
          <Card className="s-7 s-md-12" title="PIT histograms" sub="roughly uniform = well calibrated">
            {d.pit?.bins?.length ? <PitHistograms cal={d} /> : <EmptyState title="No PIT data" />}
          </Card>
          <Card className="s-5 s-md-12" title="Reliability diagram" sub="nominal vs observed coverage">
            {d.reliability?.nominal?.length ? <ReliabilityDiagram cal={d} /> : <EmptyState title="No reliability data" />}
          </Card>
          <Card className="s-6 s-md-12" title="90% coverage over time" sub="mixture · target 85–95%">
            {d.coverage_over_time?.time_idx?.length ? <CoverageOverTime cal={d} /> : <EmptyState title="No coverage series" />}
          </Card>
          <Card className="s-6 s-md-12" title="Residual CUSUM" sub="drift sentinel">
            {d.cusum?.time_idx?.length ? <CusumChart cal={d} /> : <EmptyState title="No CUSUM series" />}
          </Card>
          <Card className="s-12" title="CRPS per model" sub="lower is better">
            {models.data?.models?.length ? (
              <div className="table-wrap">
                <table className="t">
                  <thead>
                    <tr>
                      <th>Model</th>
                      <th className="r">CRPS</th>
                      <th className="r">90% coverage</th>
                      <th className="r">Mean σ °F</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...models.data.models]
                      .sort((a, b) => MODEL_ORDER.indexOf(a.model_id) - MODEL_ORDER.indexOf(b.model_id))
                      .map((m) => (
                        <tr key={m.model_id} className={m.status === "shadow" ? "shadow" : ""}>
                          <td>
                            <span className="swatch" style={{ background: modelColor(m.model_id, "dark") }} />
                            {m.label}
                          </td>
                          <td className="r">{num(m.crps, 2)}</td>
                          <td className="r">{m.coverage90 === null ? "—" : `${(m.coverage90 * 100).toFixed(0)}%`}</td>
                          <td className="r">{num(m.mean_sigma, 2)}</td>
                        </tr>
                      ))}
                    <tr className="total">
                      <td>Mixture</td>
                      <td className="r">{num(models.data.mixture.crps, 2)}</td>
                      <td className="r">
                        {models.data.mixture.coverage90 === null ? "—" : `${(models.data.mixture.coverage90 * 100).toFixed(0)}%`}
                      </td>
                      <td className="r">—</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="No model metrics" />
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
