"use client";

import { useState } from "react";
import type { Data, Layout, Shape } from "plotly.js";
import Chart from "./Chart";
import { axisStyle, baseLayout, hexA } from "@/lib/plotTheme";
import { useCockpit } from "@/lib/store";
import { MODEL_ORDER, STATUS, TOKENS, modelColor, modelLabel, type ThemeName } from "@/lib/theme";
import type { CalibrationResponse, ModelRow } from "@/lib/types";

const idxAxis = (theme: ThemeName, title: string) => ({
  ...axisStyle(theme),
  title: { text: title, font: { size: 11, color: TOKENS[theme].muted } },
});

function modelsIn(obj: object, exclude: string[] = []) {
  const keys = Object.keys(obj).filter((k) => !exclude.includes(k));
  return [...MODEL_ORDER.filter((m) => keys.includes(m)), ...keys.filter((k) => !MODEL_ORDER.includes(k))];
}

function useLayout(fn: (theme: ThemeName) => { data: Data[]; layout: Partial<Layout> }, deps: unknown[]) {
  const theme = useCockpit((s) => s.theme);
  const [cache, setCache] = useState<{ key: unknown[]; value: { data: Data[]; layout: Partial<Layout> } } | null>(null);
  const key = [theme, ...deps];
  const same = cache !== null && cache.key.length === key.length && cache.key.every((v, i) => Object.is(v, key[i]));
  if (same) return cache.value;
  const value = fn(theme);
  setCache({ key, value });
  return value;
}

export function ParityPlot({ cal, R }: { cal: CalibrationResponse; R: number }) {
  const { data, layout } = useLayout(
    (theme) => {
      const t = TOKENS[theme];
      const ids = modelsIn(cal.parity);
      let lo = Infinity;
      let hi = -Infinity;
      const data: Data[] = ids.map((id) => {
        const p = cal.parity[id];
        for (const v of [...p.pred, ...p.truth]) {
          if (v !== null && Number.isFinite(v)) {
            lo = Math.min(lo, v);
            hi = Math.max(hi, v);
          }
        }
        return {
          type: "scatter",
          mode: "markers",
          x: p.truth,
          y: p.pred,
          name: modelLabel(id),
          marker: { size: 4.5, color: modelColor(id, theme), opacity: 0.65 },
          hovertemplate: `${modelLabel(id)}<br>truth %{x:.1f} · pred %{y:.1f}<extra></extra>`,
        } as Data;
      });
      if (!Number.isFinite(lo)) {
        lo = 0;
        hi = 1;
      }
      const pad = (hi - lo) * 0.04;
      lo -= pad;
      hi += pad;
      const shapes: Partial<Shape>[] = [
        { type: "path", path: `M${lo},${lo - R} L${hi},${hi - R} L${hi},${hi + R} L${lo},${lo + R} Z`, fillcolor: hexA(t.accent, 0.08), line: { width: 0 }, layer: "below" },
        { type: "line", x0: lo, y0: lo, x1: hi, y1: hi, line: { color: t.muted, width: 1.2 } },
      ];
      return {
        data,
        layout: baseLayout(theme, {
          hovermode: "closest",
          margin: { l: 52, r: 12, t: 30, b: 42 },
          xaxis: { ...idxAxis(theme, "simulator truth °F"), range: [lo, hi], showspikes: false },
          yaxis: { ...idxAxis(theme, "predicted °F"), range: [lo, hi], scaleanchor: "x" },
          shapes,
          annotations: [
            { x: hi, y: hi, text: "45°", showarrow: false, xanchor: "right", yanchor: "top", font: { size: 10, color: t.muted } },
            { x: lo, y: lo + R, text: `±R ${R} °F`, showarrow: false, xanchor: "left", yanchor: "bottom", font: { size: 10, color: t.muted } },
          ],
        }),
      };
    },
    [cal.parity, R],
  );
  return <Chart data={data} layout={layout} height={340} ariaLabel="Parity plot of predicted versus simulator truth per model" />;
}

export function ResidualsChart({ cal, R }: { cal: CalibrationResponse; R: number }) {
  const { data, layout } = useLayout(
    (theme) => {
      const t = TOKENS[theme];
      const ids = modelsIn(cal.residuals, ["time_idx"]);
      const data: Data[] = ids.map((id) => ({
        type: "scatter",
        mode: "lines",
        x: cal.residuals.time_idx,
        y: cal.residuals[id] as (number | null)[],
        name: modelLabel(id),
        line: { width: 1, color: modelColor(id, theme) },
        hovertemplate: `${modelLabel(id)} %{y:.2f} °F<extra></extra>`,
      }));
      return {
        data,
        layout: baseLayout(theme, {
          margin: { l: 48, r: 12, t: 30, b: 36 },
          xaxis: { ...idxAxis(theme, "held-out minute index") },
          yaxis: { ...idxAxis(theme, "residual °F"), zeroline: true },
          shapes: [
            { type: "rect", xref: "paper", x0: 0, x1: 1, y0: -R, y1: R, fillcolor: hexA(t.accent, 0.06), line: { width: 0 }, layer: "below" },
            { type: "line", xref: "paper", x0: 0, x1: 1, y0: 0, y1: 0, line: { color: t.muted, width: 1 } },
          ],
        }),
      };
    },
    [cal.residuals, R],
  );
  return <Chart data={data} layout={layout} height={250} ariaLabel="Residuals over time per model with ±R band" />;
}

export function RegimeBars({ models }: { models: ModelRow[] }) {
  const { data, layout } = useLayout(
    (theme) => {
      const regimes = ["light", "medium", "heavy"];
      const all = new Set<string>(regimes);
      models.forEach((m) => m.per_regime?.forEach((r) => all.add(r.regime)));
      const xs = [...all];
      const data: Data[] = models.map((m) => ({
        type: "bar",
        name: m.label || modelLabel(m.model_id),
        x: xs,
        y: xs.map((rg) => m.per_regime?.find((r) => r.regime === rg)?.rmse ?? null),
        customdata: xs.map((rg) => m.per_regime?.find((r) => r.regime === rg)?.n ?? 0),
        marker: { color: modelColor(m.model_id, theme) },
        hovertemplate: `${m.label || modelLabel(m.model_id)} · %{x}: %{y:.2f} °F (n=%{customdata})<extra></extra>`,
      }));
      return {
        data,
        layout: baseLayout(theme, {
          barmode: "group",
          bargap: 0.3,
          hovermode: "closest",
          margin: { l: 42, r: 8, t: 30, b: 30 },
          xaxis: { ...axisStyle(theme), showspikes: false },
          yaxis: idxAxis(theme, "RMSE °F"),
        }),
      };
    },
    [models],
  );
  return <Chart data={data} layout={layout} height={250} ariaLabel="RMSE per regime per model" />;
}

export function RelevanceBars({ cal }: { cal: CalibrationResponse }) {
  const { data, layout } = useLayout(
    (theme) => {
      const rows = [...cal.gpr_relevance].sort((a, b) => b.relevance - a.relevance).slice(0, 15).reverse();
      return {
        data: [
          {
            type: "bar",
            orientation: "h",
            x: rows.map((r) => r.relevance),
            y: rows.map((r) => r.feature),
            marker: { color: modelColor("gpr_v1", theme) },
            hovertemplate: "%{y}: %{x:.3f}<extra></extra>",
          },
        ],
        layout: baseLayout(theme, {
          hovermode: "closest",
          showlegend: false,
          margin: { l: 120, r: 12, t: 8, b: 36 },
          xaxis: { ...idxAxis(theme, "1 / length-scale"), showspikes: false },
          yaxis: { ...axisStyle(theme), tickfont: { family: "var(--font-mono)", size: 10.5, color: TOKENS[theme].muted } },
        }),
      };
    },
    [cal.gpr_relevance],
  );
  return <Chart data={data} layout={layout} height={250} ariaLabel="GPR feature relevance (1/length-scale), top 15" />;
}

export function DecompositionChart({ cal }: { cal: CalibrationResponse }) {
  const { data, layout } = useLayout(
    (theme) => {
      const d = cal.hybrid_decomposition;
      const hc = modelColor("hybrid_delta_v1", theme);
      const data: Data[] = [
        {
          type: "scatter",
          mode: "lines",
          x: d.time_idx,
          y: d.physics,
          name: "physics term",
          line: { width: 1.5, color: hc },
          hovertemplate: "physics %{y:.1f} °F<extra></extra>",
        },
        {
          type: "scatter",
          mode: "lines",
          x: d.time_idx,
          y: d.physics.map((p, i) => (p === null || d.delta[i] === null ? null : p + (d.delta[i] as number))),
          name: "physics + Δ_ML",
          line: { width: 1.5, color: STATUS.AMBER },
          fill: "tonexty",
          fillcolor: hexA(STATUS.AMBER, 0.25),
          customdata: d.delta,
          hovertemplate: "physics + Δ %{y:.1f} °F (Δ %{customdata:.2f})<extra></extra>",
        },
      ];
      return {
        data,
        layout: baseLayout(theme, {
          margin: { l: 52, r: 12, t: 30, b: 36 },
          xaxis: idxAxis(theme, "held-out minute index"),
          yaxis: idxAxis(theme, "°F"),
        }),
      };
    },
    [cal.hybrid_decomposition],
  );
  return <Chart data={data} layout={layout} height={250} ariaLabel="Hybrid decomposition: physics term and ML correction" />;
}

export function PinnSpread({ cal }: { cal: CalibrationResponse }) {
  const { data, layout } = useLayout(
    (theme) => {
      const t = TOKENS[theme];
      const p = cal.pinn_members;
      const pc = modelColor("pinn_ens_v1", theme);
      const n = p.time_idx.length;
      const mean: (number | null)[] = [];
      const lo: (number | null)[] = [];
      const hi: (number | null)[] = [];
      for (let i = 0; i < n; i++) {
        const vs = p.members.map((m) => m[i]).filter((v): v is number => v !== null && Number.isFinite(v));
        if (!vs.length) {
          mean.push(null);
          lo.push(null);
          hi.push(null);
          continue;
        }
        const mu = vs.reduce((a, b) => a + b, 0) / vs.length;
        const sd = Math.sqrt(vs.reduce((a, b) => a + (b - mu) ** 2, 0) / Math.max(1, vs.length - 1));
        mean.push(mu);
        lo.push(mu - 2 * sd);
        hi.push(mu + 2 * sd);
      }
      const data: Data[] = [
        { type: "scatter", mode: "lines", x: p.time_idx, y: lo, line: { width: 0, color: pc }, hoverinfo: "skip", showlegend: false },
        { type: "scatter", mode: "lines", x: p.time_idx, y: hi, line: { width: 0, color: pc }, fill: "tonexty", fillcolor: hexA(pc, 0.18), name: "±2σ (epistemic)", hoverinfo: "skip" },
        ...p.members.map(
          (m, i) =>
            ({
              type: "scatter",
              mode: "lines",
              x: p.time_idx,
              y: m,
              line: { width: 0.8, color: hexA(pc, 0.7) },
              name: `member ${i + 1}`,
              showlegend: i === 0,
              legendgroup: "members",
              hovertemplate: `member ${i + 1} %{y:.1f}<extra></extra>`,
            }) as Data,
        ),
        { type: "scatter", mode: "lines", x: p.time_idx, y: mean, line: { width: 2.2, color: t.text }, name: "ensemble mean", hovertemplate: "mean %{y:.1f}<extra></extra>" },
      ];
      return {
        data,
        layout: baseLayout(theme, {
          margin: { l: 52, r: 12, t: 30, b: 36 },
          xaxis: idxAxis(theme, "held-out minute index"),
          yaxis: idxAxis(theme, "°F"),
        }),
      };
    },
    [cal.pinn_members],
  );
  return <Chart data={data} layout={layout} height={250} ariaLabel="PINN ensemble member spread" />;
}

export function PitHistograms({ cal }: { cal: CalibrationResponse }) {
  const { data, layout } = useLayout(
    (theme) => {
      const t = TOKENS[theme];
      const ids = modelsIn(cal.pit, ["bins"]);
      const bins = cal.pit.bins;
      const centers = bins.slice(0, -1).map((b, i) => (b + bins[i + 1]) / 2);
      const data: Data[] = ids.map((id) => {
        const counts = cal.pit[id] as number[];
        const total = counts.reduce((a, b) => a + b, 0) || 1;
        return {
          type: "bar",
          x: centers,
          y: counts.map((c) => c / total),
          name: modelLabel(id),
          marker: { color: id === "mixture" ? t.text : modelColor(id, theme) },
          hovertemplate: `${modelLabel(id)} · PIT %{x:.2f}: %{y:.1%}<extra></extra>`,
        };
      });
      const uniform = 1 / Math.max(1, centers.length);
      return {
        data,
        layout: baseLayout(theme, {
          barmode: "group",
          bargap: 0.15,
          hovermode: "closest",
          margin: { l: 48, r: 12, t: 30, b: 36 },
          xaxis: { ...idxAxis(theme, "PIT value"), range: [0, 1], showspikes: false },
          yaxis: { ...idxAxis(theme, "share of minutes"), tickformat: ".0%" },
          shapes: [{ type: "line", xref: "paper", x0: 0, x1: 1, y0: uniform, y1: uniform, line: { color: STATUS.RED, dash: "dash", width: 1.2 } }],
          annotations: [{ xref: "paper", x: 1, y: uniform, text: "uniform", showarrow: false, xanchor: "right", yanchor: "bottom", font: { size: 10, color: STATUS.RED } }],
        }),
      };
    },
    [cal.pit],
  );
  return <Chart data={data} layout={layout} height={280} ariaLabel="PIT histograms per model with uniform reference" />;
}

export function ReliabilityDiagram({ cal }: { cal: CalibrationResponse }) {
  const { data, layout } = useLayout(
    (theme) => {
      const t = TOKENS[theme];
      const ids = modelsIn(cal.reliability, ["nominal"]);
      const data: Data[] = ids.map((id) => ({
        type: "scatter",
        mode: "lines+markers",
        x: cal.reliability.nominal,
        y: cal.reliability[id] as (number | null)[],
        name: modelLabel(id),
        line: { width: id === "mixture" ? 3 : 1.6, color: id === "mixture" ? t.text : modelColor(id, theme) },
        marker: { size: 5 },
        hovertemplate: `${modelLabel(id)} · nominal %{x:.0%} → observed %{y:.1%}<extra></extra>`,
      }));
      return {
        data,
        layout: baseLayout(theme, {
          hovermode: "closest",
          margin: { l: 52, r: 12, t: 30, b: 40 },
          xaxis: { ...idxAxis(theme, "nominal coverage"), range: [0, 1], tickformat: ".0%", showspikes: false },
          yaxis: { ...idxAxis(theme, "observed coverage"), range: [0, 1], tickformat: ".0%" },
          shapes: [{ type: "line", x0: 0, y0: 0, x1: 1, y1: 1, line: { color: t.muted, dash: "dot", width: 1.2 } }],
        }),
      };
    },
    [cal.reliability],
  );
  return <Chart data={data} layout={layout} height={300} ariaLabel="Reliability diagram: nominal versus observed coverage" />;
}

export function CoverageOverTime({ cal }: { cal: CalibrationResponse }) {
  const { data, layout } = useLayout(
    (theme) => {
      const t = TOKENS[theme];
      const c = cal.coverage_over_time;
      return {
        data: [
          {
            type: "scatter",
            mode: "lines",
            x: c.time_idx,
            y: c.mixture,
            name: "Mixture 90% coverage",
            line: { width: 2, color: t.text },
            hovertemplate: "coverage %{y:.1%}<extra></extra>",
          },
        ],
        layout: baseLayout(theme, {
          showlegend: false,
          margin: { l: 52, r: 12, t: 12, b: 36 },
          xaxis: idxAxis(theme, "held-out minute index"),
          yaxis: { ...idxAxis(theme, "coverage"), tickformat: ".0%", range: [0.5, 1] },
          shapes: [
            { type: "rect", xref: "paper", x0: 0, x1: 1, y0: 0.85, y1: 0.95, fillcolor: hexA(STATUS.GREEN, 0.1), line: { width: 0 }, layer: "below" },
            { type: "line", xref: "paper", x0: 0, x1: 1, y0: 0.9, y1: 0.9, line: { color: STATUS.GREEN, dash: "dot", width: 1 } },
          ],
          annotations: [{ xref: "paper", x: 1, y: 0.95, text: "target 85–95%", showarrow: false, xanchor: "right", yanchor: "bottom", font: { size: 10, color: STATUS.GREEN } }],
        }),
      };
    },
    [cal.coverage_over_time],
  );
  return <Chart data={data} layout={layout} height={250} ariaLabel="Mixture 90% coverage over time versus 85–95% target" />;
}

export function CusumChart({ cal }: { cal: CalibrationResponse }) {
  const { data, layout } = useLayout(
    (theme) => {
      const t = TOKENS[theme];
      const c = cal.cusum;
      const shapes: Partial<Shape>[] = [];
      if (c.h !== null && c.h !== undefined) {
        shapes.push({ type: "line", xref: "paper", x0: 0, x1: 1, y0: c.h, y1: c.h, line: { color: STATUS.RED, dash: "dash", width: 1.2 } });
      }
      return {
        data: [
          {
            type: "scatter",
            mode: "lines",
            x: c.time_idx,
            y: c.value,
            line: { width: 1.6, color: t.accent },
            fill: "tozeroy",
            fillcolor: t.band95,
            name: "CUSUM",
            hovertemplate: "CUSUM %{y:.2f}<extra></extra>",
          },
        ],
        layout: baseLayout(theme, {
          showlegend: false,
          margin: { l: 48, r: 12, t: 12, b: 36 },
          xaxis: idxAxis(theme, "held-out minute index"),
          yaxis: { ...idxAxis(theme, "CUSUM"), rangemode: "tozero" },
          shapes,
          annotations:
            c.h !== null && c.h !== undefined
              ? [{ xref: "paper", x: 1, y: c.h, text: `h = ${c.h.toFixed(2)}`, showarrow: false, xanchor: "right", yanchor: "bottom", font: { size: 10, color: STATUS.RED } }]
              : [],
        }),
      };
    },
    [cal.cusum],
  );
  return <Chart data={data} layout={layout} height={250} ariaLabel="Residual CUSUM with decision threshold h" />;
}
