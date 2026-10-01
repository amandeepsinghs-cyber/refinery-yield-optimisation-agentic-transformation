"use client";

/**
 * L1 chart stack (SDD-L1-02): panels share one x-range and ONE cursor (store.timeMin); hover is broadcast so a
 * dotted guide moves in every panel together. Trace colours come from contract §8 (never grey). Click sets timeMin.
 */

import { useMemo } from "react";
import type { Layout, PlotData, Shape, Annotations } from "plotly.js";
import { useCockpit } from "@/lib/store";
import Chart from "@/components/charts/Chart";
import { baseLayout, axisStyle, timeAxis, cursorShape, hexA } from "@/lib/plotTheme";
import { TOKENS } from "@/lib/theme";
import { minToX, xToMin } from "@/lib/format";
import { traceColor } from "@/lib/l1";
import type { TwinPanel, TwinWorkbench } from "@/lib/twinTypes";

const HEIGHT: Record<string, number> = { measured_vs_expected: 200, residual: 180, mv: 150, disturbance: 150, yield: 150, tray_profile: 150, combustion: 150 };
const MARGIN = { l: 56, r: 56, t: 8, b: 24 };

export interface ChartStackProps {
  data: TwinWorkbench;
  panels: TwinPanel[];
  hoverMin: number | null;
  onHover: (min: number | null) => void;
}

type Series = (number | null)[];

export default function ChartStack({ data, panels, hoverMin, onHover }: ChartStackProps) {
  const timeMin = useCockpit((s) => s.timeMin) ?? data.time.time_min;
  const setTimeMin = useCockpit((s) => s.setTimeMin);
  const theme = useCockpit((s) => s.theme);

  const x = useMemo(() => data.series.time_min.map(minToX), [data.series.time_min]);
  const range = useMemo(() => [minToX(data.time.window_start), minToX(data.time.window_end)], [data.time.window_start, data.time.window_end]);
  const feedLbMin = useMemo<Series | null>(() => {
    const f = data.series.keys["feed_flow_lb_s"];
    return f ? f.map((v) => (v == null ? null : v * 60)) : null;
  }, [data.series.keys]);

  return (
    <div className="l1-stack" data-testid="chart-stack">
      {panels.map((panel) => {
        const built = buildPanel(panel, data, x, feedLbMin, theme);
        const shapes: Partial<Shape>[] = [...built.shapes, cursorShape(timeMin, theme)];
        if (hoverMin != null && hoverMin !== timeMin) {
          shapes.push({ ...cursorShape(hoverMin, theme), line: { color: TOKENS[theme].muted, width: 1, dash: "dot" }, opacity: 0.8 });
        }
        const base = baseLayout(theme);
        const layout: Partial<Layout> = {
          ...base,
          height: HEIGHT[panel.kind] ?? 150,
          margin: MARGIN,
          showlegend: true,
          legend: { ...base.legend, orientation: "h", x: 1, xanchor: "right", y: 1, yanchor: "bottom", font: { size: 10.5, color: TOKENS[theme].muted } },
          xaxis: { ...base.xaxis, ...timeAxis, range, fixedrange: true, showspikes: false },
          yaxis: { ...base.yaxis, title: { ...axisStyle(theme).title, text: built.yTitle }, fixedrange: true },
          ...(built.hasY2
            ? { yaxis2: { ...axisStyle(theme), overlaying: "y" as const, side: "right" as const, title: { ...axisStyle(theme).title, text: built.y2Title }, fixedrange: true, showgrid: false } }
            : {}),
          dragmode: false,
          hovermode: "x unified",
          shapes,
          annotations: built.annotations,
        };
        return (
          <section
            key={panel.panel_id}
            id={`panel-${panel.panel_id}`}
            className="l1-panel"
            data-testid="chart-panel"
            data-panel-id={panel.panel_id}
            data-kind={panel.kind}
          >
            <div className="l1-panel-head">
              <span className="l1-panel-title">{panel.title}</span>
              {panel.use_case_ids?.length ? <span className="l1-panel-uc muted">{panel.use_case_ids.join(" · ")}</span> : null}
            </div>
            <Chart
              data={built.traces}
              layout={layout}
              height={HEIGHT[panel.kind] ?? 150}
              ariaLabel={panel.title}
              onHover={(e) => { const px = e?.points?.[0]?.x; if (px != null) onHover(xToMin(px as string | number)); }}
              onUnhover={() => onHover(null)}
              onClick={(e) => { const px = e?.points?.[0]?.x; if (px != null) setTimeMin(xToMin(px as string | number)); }}
            />
          </section>
        );
      })}
    </div>
  );
}

function buildPanel(panel: TwinPanel, data: TwinWorkbench, x: string[], feedLbMin: Series | null, theme: "light" | "dark") {
  const keys = data.series.keys;
  const traces: Partial<PlotData>[] = [];
  const shapes: Partial<Shape>[] = [];
  const annotations: Partial<Annotations>[] = [];
  const t = TOKENS[theme];
  let yTitle = panel.unit ?? "";
  let y2Title = "";
  let hasY2 = false;

  const lo = panel.traces?.find((tr) => tr.role === "band_lo");
  const hi = panel.traces?.find((tr) => tr.role === "band_hi");
  if (lo && hi && keys[lo.key] && keys[hi.key]) {
    const c = traceColor("band_lo", lo.key, 0, lo.color);
    traces.push({ x, y: keys[lo.key], type: "scatter", mode: "lines", line: { width: 0, color: c }, showlegend: false, hoverinfo: "skip", name: "band" });
    traces.push({ x, y: keys[hi.key], type: "scatter", mode: "lines", fill: "tonexty", fillcolor: hexA(c, 0.14), line: { width: 0, color: c }, name: hi.label ?? lo.label ?? "5–95 % band", hoverinfo: "skip" });
  }

  let mvIdx = 0, distIdx = 0, yieldIdx = 0, trayIdx = 0;
  panel.traces?.forEach((tr) => {
    if (tr.role === "band_lo" || tr.role === "band_hi") return;
    let y: Series | undefined = keys[tr.key];
    if (!y) return;
    const idx = tr.role === "mv" ? mvIdx++ : tr.role === "disturbance" ? distIdx++ : tr.role === "yield" ? yieldIdx++ : tr.role === "tray_profile" ? trayIdx++ : 0;
    const color = traceColor(tr.role, tr.key, idx, tr.color);

    if (tr.role === "sigma3") {
      traces.push({ x, y, type: "scatter", mode: "lines", line: { color, width: 1, dash: "dash" }, name: tr.label ?? "±3σ", hoverinfo: "skip" });
      traces.push({ x, y: y.map((v) => (v == null ? null : -v)), type: "scatter", mode: "lines", line: { color, width: 1, dash: "dash" }, showlegend: false, hoverinfo: "skip" });
      return;
    }
    if (panel.kind === "yield" && feedLbMin) {
      y = y.map((v, i) => (v == null || feedLbMin[i] == null || !feedLbMin[i] ? null : (v / (feedLbMin[i] as number)) * 100));
      yTitle = "% feed";
    }
    const onY2 = tr.role === "cusum" || (panel.kind === "combustion" && tr.key.includes("CO"));
    if (onY2) { hasY2 = true; y2Title = tr.role === "cusum" ? "CUSUM" : "CO ppm"; }
    traces.push({
      x, y, type: "scatter", mode: "lines",
      line: { color, width: tr.role === "measured" || tr.role === "residual" ? 1.8 : 1.4, dash: tr.role === "expected" ? "solid" : "solid" },
      name: tr.label ?? tr.key,
      yaxis: onY2 ? "y2" : "y",
      hovertemplate: `%{y:.2f}<extra>${tr.label ?? tr.key}</extra>`,
    });
  });

  panel.hlines?.forEach((h) => {
    const color = traceColor(h.role, "", 0, h.color);
    shapes.push({ type: "line", xref: "paper", x0: 0, x1: 1, yref: "y", y0: h.value, y1: h.value, line: { color, width: 1, dash: h.role === "plan" ? "dash" : "dot" } });
    if (h.label && h.label !== "0") {
      annotations.push({ xref: "paper", x: 1, xanchor: "right", yref: "y", y: h.value, yanchor: "bottom", text: h.label, showarrow: false, font: { size: 10, color }, yshift: 1 });
    }
  });

  const seen = new Set<number>();
  const minGap = Math.max(45, (data.time.window_end - data.time.window_start) / 7);
  let lastLabelAt = -Infinity;
  let labels = 0;
  const sortedMarkers = [...(panel.markers ?? [])].sort((a, b) => a.time_min - b.time_min);
  sortedMarkers.forEach((m) => {
    if (seen.has(m.time_min)) return;
    seen.add(m.time_min);
    const color = m.kind === "regime_change" ? "#6d28d9" : "#b91c1c";
    shapes.push({ type: "line", xref: "x", x0: minToX(m.time_min), x1: minToX(m.time_min), yref: "paper", y0: 0, y1: 1, line: { color, width: 1, dash: "dot" }, opacity: 0.7 });
    if (m.time_min - lastLabelAt >= minGap && labels < 3) {
      lastLabelAt = m.time_min;
      labels += 1;
      annotations.push({ xref: "x", x: minToX(m.time_min), yref: "paper", y: 0.02, yanchor: "bottom", xanchor: "left", text: `◆ ${m.label}`, showarrow: false, font: { size: 10, color }, xshift: 3, bgcolor: hexA(t.card, 0.75) });
    }
  });

  return { traces, shapes, annotations, yTitle, y2Title, hasY2 };
}
