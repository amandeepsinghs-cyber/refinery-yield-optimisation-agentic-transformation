"use client";

import { useMemo } from "react";
import type { Annotations, Data, Layout, PlotMouseEvent, Shape } from "plotly.js";
import Chart from "./Chart";
import { useCockpit } from "@/lib/store";
import { clock, minToX, xToMin } from "@/lib/format";
import {
  axisStyle,
  baseLayout,
  cursorShape,
  eventOverlays,
  gateBands,
  specShape,
  timeAxis,
  trustStrip,
} from "@/lib/plotTheme";
import { FONT_MONO, MODEL_ORDER, STATUS, TOKENS, modelColor, modelLabel } from "@/lib/theme";
import type { EstimatesTimeseries } from "@/lib/types";

export function clickToMinute(e: Readonly<PlotMouseEvent>): number | null {
  const p = e.points?.[0];
  if (!p || p.x === undefined || p.x === null) return null;
  const m = xToMin(p.x as string);
  return Number.isFinite(m) ? m : null;
}

interface FanProps {
  est: EstimatesTimeseries;
  showTruth?: boolean;
  cursor?: number | null;
  onPick?: (m: number) => void;
  height?: number;
  withStrips?: boolean;
  unitLabel?: string;
  highlightMode?: "none" | "align" | "diverge";
  ariaLabel: string;
}

/**
 * Fan chart (SDD §7.4): P5–P95 / P25–P75 bands, median, labs, simulator truth,
 * spec line, event bands, WITHHELD bands, optional W90 + trust strips underneath.
 */
export function FanChart({
  est,
  showTruth = true,
  cursor,
  onPick,
  height = 380,
  withStrips = false,
  unitLabel = "°F",
  highlightMode = "none",
  ariaLabel,
}: FanProps) {
  const theme = useCockpit((s) => s.theme);
  const { data, layout } = useMemo(() => {
    const t = TOKENS[theme];
    const x = est.time_min.map(minToX);
    const m = est.mixture;
    const hoverTrust = est.trust.map((tr, i) => `${tr} · gate ${est.gate[i] ?? "—"}`);
    const traces: Data[] = [
      {
        type: "scatter",
        x,
        y: m.q05,
        mode: "lines",
        line: { width: 0, color: t.accent },
        name: "P5",
        legendgroup: "b95",
        showlegend: false,
        hovertemplate: "P5 %{y:.1f}<extra></extra>",
      },
      {
        type: "scatter",
        x,
        y: m.q95,
        mode: "lines",
        line: { width: 0, color: t.accent },
        fill: "tonexty",
        fillcolor: t.band95,
        name: "P5–P95",
        legendgroup: "b95",
        hovertemplate: "P95 %{y:.1f}<extra></extra>",
      },
      {
        type: "scatter",
        x,
        y: m.q25,
        mode: "lines",
        line: { width: 0, color: t.accent },
        name: "P25",
        legendgroup: "b50",
        showlegend: false,
        hovertemplate: "P25 %{y:.1f}<extra></extra>",
      },
      {
        type: "scatter",
        x,
        y: m.q75,
        mode: "lines",
        line: { width: 0, color: t.accent },
        fill: "tonexty",
        fillcolor: t.band50,
        name: "P25–P75",
        legendgroup: "b50",
        hovertemplate: "P75 %{y:.1f}<extra></extra>",
      },
    ];
    if (est.members) {
      for (const id of MODEL_ORDER) {
        const mem = est.members[id];
        if (!mem?.mu?.length) continue;
        traces.push({
          type: "scatter",
          x,
          y: mem.mu,
          mode: "lines",
          line: { width: 1.05, color: modelColor(id, theme) },
          opacity: 0.72,
          name: modelLabel(id),
          hovertemplate: `${modelLabel(id)} %{y:.1f} °F<extra></extra>`,
        });
      }
    }
    traces.push({
      type: "scatter",
      x,
      y: m.q50,
      mode: "lines",
      line: { width: 1.55, color: t.text },
      name: "Mixture median",
      customdata: hoverTrust,
      hovertemplate: "Mixture median %{y:.1f} °F · trust %{customdata}<extra></extra>",
    });
    if (showTruth && est.truth?.some((v) => v !== null)) {
      traces.push({
        type: "scatter",
        x,
        y: est.truth,
        mode: "lines",
        line: { width: 1.25, color: t.muted, dash: "dot" },
        name: "simulator truth",
        hovertemplate: "simulator truth %{y:.1f}<extra></extra>",
      });
    }
    if (est.labs?.length) {
      traces.push({
        type: "scatter",
        x: est.labs.map((l) => minToX(l.time_min)),
        y: est.labs.map((l) => l.value),
        mode: "markers",
        marker: { size: 7, color: t.text, line: { color: t.card, width: 1.5 } },
        name: "lab",
        customdata: est.labs.map((l) => l.status),
        hovertemplate: "lab %{y:.1f} (%{customdata})<extra></extra>",
      });
    }

    const mainDomain: [number, number] = withStrips ? [0.3, 1] : [0, 1];
    const shapes: Partial<Shape>[] = [specShape(est.spec_max, "y")];
    const annotations: Partial<Annotations>[] = [
      {
        xref: "paper",
        x: 0,
        yref: "y",
        y: est.spec_max,
        text: `spec ${est.spec_max} °F`,
        showarrow: false,
        xanchor: "left",
        yanchor: "bottom",
        font: { size: 10, color: STATUS.RED },
      },
    ];
    const ev = eventOverlays(est.events ?? [], theme, mainDomain[0], mainDomain[1]);
    const gb = gateBands(est.time_min, est.gate, theme, mainDomain[0], mainDomain[1]);
    shapes.push(...ev.shapes, ...gb.shapes);
    annotations.push(...ev.annotations, ...gb.annotations);

    if (highlightMode !== "none" && est.members) {
      const n = est.time_min.length;
      const flags: boolean[] = [];
      for (let i = 0; i < n; i++) {
        const mus: number[] = [];
        for (const id of MODEL_ORDER) {
          const v = est.members[id]?.mu?.[i];
          if (v !== null && v !== undefined && Number.isFinite(v)) mus.push(v);
        }
        const diff = mus.length >= 2 ? Math.max(...mus) - Math.min(...mus) : 0;
        if (highlightMode === "align") {
          flags.push(diff <= 1.5 && est.gate[i] === "PASS");
        } else {
          flags.push(diff >= 3.8 || est.gate[i] === "WITHHELD");
        }
      }
      const isAlign = highlightMode === "align";
      const fill = isAlign ? "rgba(16,185,129,0.11)" : "rgba(244,63,94,0.11)";
      const border = isAlign ? "rgba(16,185,129,0.45)" : "rgba(244,63,94,0.45)";
      const labelTxt = isAlign ? "MODELS ALIGN (Δμ ≤ 1.5°F)" : "MODELS DIVERGE (Δμ ≥ 3.8°F)";
      const labelColor = isAlign ? STATUS.GREEN : STATUS.RED;
      let startIdx: number | null = null;
      let labelled = false;
      for (let i = 0; i <= n; i++) {
        const active = i < n && flags[i];
        if (active && startIdx === null) {
          startIdx = i;
        } else if (!active && startIdx !== null) {
          const endIdx = Math.max(startIdx, i - 1);
          const tStart = est.time_min[startIdx];
          const tEnd = est.time_min[endIdx];
          if (tEnd - tStart >= 10) {
            shapes.push({
              type: "rect",
              xref: "x",
              yref: "paper",
              x0: minToX(tStart),
              x1: minToX(tEnd),
              y0: mainDomain[0],
              y1: mainDomain[1],
              fillcolor: fill,
              line: { width: 1, color: border, dash: "dot" },
              layer: "below",
            });
            if (!labelled) {
              annotations.push({
                xref: "x",
                yref: "paper",
                x: minToX(Math.round((tStart + tEnd) / 2)),
                y: mainDomain[1] - 0.02,
                yanchor: "top",
                xanchor: "center",
                text: labelTxt,
                showarrow: false,
                font: { size: 10, color: labelColor, family: FONT_MONO },
                bgcolor: t.elevated,
                bordercolor: border,
                borderpad: 2,
              });
              labelled = true;
            }
          }
          startIdx = null;
        }
      }
    }

    const t0 = est.time_min[0] ?? 0;
    const t1 = est.time_min.at(-1) ?? t0 + 1;
    const xRange = [minToX(t0), minToX(Math.max(t1, t0 + 1))];
    const lay: Partial<Layout> = baseLayout(theme, {
      margin: { l: 52, r: 16, t: 40, b: withStrips ? 28 : 36 },
      xaxis: { ...baseLayout(theme).xaxis, ...timeAxis, range: xRange, autorange: false },
      yaxis: { ...axisStyle(theme), domain: mainDomain, title: { text: unitLabel, font: { size: 11, color: t.muted } } },
      legend: { ...baseLayout(theme).legend, x: 0, xanchor: "left", y: 1.0, yanchor: "bottom" },
    });

    if (withStrips) {
      traces.push({
        type: "scatter",
        x,
        y: est.w90,
        yaxis: "y2",
        mode: "lines",
        line: { width: 1.3, color: t.accent },
        name: "W90",
        showlegend: false,
        hovertemplate: "W90 %{y:.1f} °F<extra></extra>",
      });
      lay.yaxis2 = {
        ...axisStyle(theme),
        domain: [0.1, 0.24],
        nticks: 3,
        title: { text: "W90", font: { size: 10, color: t.muted } },
        rangemode: "tozero",
      };
      shapes.push({ ...specShape(est.w90_limit, "y2"), line: { color: STATUS.RED, width: 1, dash: "dash" } });
      annotations.push({
        xref: "paper",
        x: 1,
        yref: "y2",
        y: est.w90_limit,
        text: `limit ${est.w90_limit} °F`,
        showarrow: false,
        xanchor: "right",
        yanchor: "bottom",
        font: { size: 10, color: STATUS.RED },
      });
      const span = (est.time_min.at(-1) ?? 0) - (est.time_min[0] ?? 0);
      const ts = trustStrip(est.time_min, est.trust, 0.015, 0.06, span);
      shapes.push(...ts.shapes);
      annotations.push(...ts.annotations, {
        xref: "paper",
        x: 0,
        xanchor: "right",
        yref: "paper",
        y: 0.0375,
        text: "trust",
        showarrow: false,
        font: { size: 10, color: t.muted },
        xshift: -6,
      });
      lay.xaxis = { ...lay.xaxis, anchor: "free", position: 0 } as Layout["xaxis"];
    }
    if (cursor !== null && cursor !== undefined) {
      const c = Math.min(Math.max(cursor, t0), t1);
      const frac = t1 > t0 ? (c - t0) / (t1 - t0) : 0;
      shapes.push(cursorShape(c, theme));
      annotations.push({
        x: minToX(c),
        xref: "x",
        yref: "paper",
        y: mainDomain[0],
        yanchor: "bottom",
        xanchor: frac > 0.85 ? "right" : frac < 0.15 ? "left" : "center",
        xshift: frac > 0.85 ? -4 : frac < 0.15 ? 4 : 0,
        yshift: 4,
        text: `t ${c} · ${clock(c)}`,
        showarrow: false,
        font: { size: 10, color: t.text, family: FONT_MONO },
        bgcolor: t.elevated,
        bordercolor: t.borderStrong,
        borderpad: 2,
      });
    }
    lay.shapes = shapes;
    lay.annotations = annotations;
    return { data: traces, layout: lay };
  }, [est, showTruth, cursor, theme, withStrips, unitLabel, highlightMode]);

  return (
    <Chart
      data={data}
      layout={layout}
      height={height}
      ariaLabel={ariaLabel}
      onClick={(e) => {
        const m = clickToMinute(e);
        if (m !== null && onPick) onPick(m);
      }}
    />
  );
}

/** W90 over time vs limit, WITHHELD bands shaded (F4/F1). */
export function W90Chart({
  time,
  w90,
  gate,
  limit,
  cursor,
  onPick,
  height = 200,
  ariaLabel,
}: {
  time: number[];
  w90: (number | null)[];
  gate: EstimatesTimeseries["gate"];
  limit: number;
  cursor?: number | null;
  onPick?: (m: number) => void;
  height?: number;
  ariaLabel: string;
}) {
  const theme = useCockpit((s) => s.theme);
  const { data, layout } = useMemo(() => {
    const t = TOKENS[theme];
    const x = time.map(minToX);
    const gb = gateBands(time, gate, theme, 0, 1);
    const shapes: Partial<Shape>[] = [
      { ...specShape(limit, "y"), line: { color: STATUS.RED, width: 1.2, dash: "dash" } },
      ...gb.shapes,
    ];
    const annotations: Partial<Annotations>[] = [
      {
        xref: "paper",
        x: 0,
        yref: "y",
        y: limit,
        text: `limit ${limit} °F`,
        showarrow: false,
        xanchor: "left",
        yanchor: "bottom",
        font: { size: 10, color: STATUS.RED },
      },
      ...gb.annotations,
    ];
    if (cursor !== null && cursor !== undefined) shapes.push(cursorShape(cursor, theme));
    const data: Data[] = [
      {
        type: "scatter",
        x,
        y: w90,
        mode: "lines",
        line: { width: 1.6, color: t.text },
        fill: "tozeroy",
        fillcolor: t.band95,
        name: "W90",
        hovertemplate: "W90 %{y:.1f} °F<extra></extra>",
      },
    ];
    const layout = baseLayout(theme, {
      margin: { l: 44, r: 12, t: 10, b: 30 },
      showlegend: false,
      xaxis: { ...baseLayout(theme).xaxis, ...timeAxis },
      yaxis: { ...axisStyle(theme), rangemode: "tozero", title: { text: "°F", font: { size: 11, color: t.muted } } },
      shapes,
      annotations,
    });
    return { data, layout };
  }, [time, w90, gate, limit, cursor, theme]);
  return (
    <Chart
      data={data}
      layout={layout}
      height={height}
      ariaLabel={ariaLabel}
      onClick={(e) => {
        const m = clickToMinute(e);
        if (m !== null && onPick) onPick(m);
      }}
    />
  );
}
