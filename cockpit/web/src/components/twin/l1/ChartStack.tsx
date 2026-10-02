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
import { traceColor, yieldAxis, trayNumber, indexAtMin } from "@/lib/l1";
import type { TwinPanel, TwinWorkbench } from "@/lib/twinTypes";

const HEIGHT: Record<string, number> = { measured_vs_expected: 230, residual: 190, mv: 165, disturbance: 165, yield: 165, tray_profile: 200, combustion: 165 };
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
        const built = buildPanel(panel, data, x, feedLbMin, theme, timeMin);
        const isTime = panel.kind !== "tray_profile";
        const shapes: Partial<Shape>[] = isTime ? [...built.shapes, cursorShape(timeMin, theme)] : [...built.shapes];
        if (isTime && hoverMin != null && hoverMin !== timeMin) {
          shapes.push({ ...cursorShape(hoverMin, theme), line: { color: TOKENS[theme].muted, width: 1, dash: "dot" }, opacity: 0.8 });
        }
        const base = baseLayout(theme);
        const layout: Partial<Layout> = {
          ...base,
          height: HEIGHT[panel.kind] ?? 150,
          margin: MARGIN,
          showlegend: true,
          legend: { ...base.legend, orientation: "h", x: 1, xanchor: "right", y: 1, yanchor: "bottom", font: { size: 11.5, color: TOKENS[theme].muted } },
          xaxis: isTime
            ? { ...base.xaxis, ...timeAxis, range, fixedrange: true, showspikes: false }
            : { ...base.xaxis, title: { ...axisStyle(theme).title, text: "Tray (1 = top)" }, tickmode: "linear", dtick: 1, range: [0.5, 20.5], fixedrange: true, showspikes: false },
          yaxis: { ...base.yaxis, title: { ...axisStyle(theme).title, text: built.yTitle }, fixedrange: true },
          ...(built.hasY2
            ? { yaxis2: { ...axisStyle(theme), overlaying: "y" as const, side: "right" as const, title: { ...axisStyle(theme).title, text: built.y2Title }, fixedrange: true, showgrid: false } }
            : {}),
          dragmode: false,
          hovermode: isTime ? "x unified" : "closest",
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
              {!isTime ? <span className="l1-panel-uc muted">at t = {timeMin} min · dashed = window start</span> : null}
              {panel.use_case_ids?.length ? <span className="l1-panel-uc muted">{panel.use_case_ids.join(" · ")}</span> : null}
            </div>
            <Chart
              data={built.traces}
              layout={layout}
              height={HEIGHT[panel.kind] ?? 150}
              ariaLabel={panel.title}
              onHover={isTime ? (e) => { const px = e?.points?.[0]?.x; if (px != null) onHover(xToMin(px as string | number)); } : undefined}
              onUnhover={isTime ? () => onHover(null) : undefined}
              onClick={isTime ? (e) => { const px = e?.points?.[0]?.x; if (px != null) setTimeMin(xToMin(px as string | number)); } : undefined}
            />
          </section>
        );
      })}
    </div>
  );
}

/** Column temperature profile at the cursor (solid) vs the window start (dashed): x = tray number, y = °F. */
function buildTrayProfile(panel: TwinPanel, data: TwinWorkbench, timeMin: number, theme: "light" | "dark") {
  const keys = data.series.keys;
  const t = TOKENS[theme];
  const trays = (panel.traces ?? [])
    .map((tr) => ({ tr, n: trayNumber(tr.key) }))
    .filter((d): d is { tr: NonNullable<TwinPanel["traces"]>[number]; n: number } => d.n != null && !!keys[d.tr.key])
    .sort((a, b) => a.n - b.n);
  const iNow = indexAtMin(data.series.time_min, timeMin);
  const iStart = indexAtMin(data.series.time_min, data.time.window_start);
  const at = (i: number) => trays.map((d) => (i < 0 ? null : keys[d.tr.key][i] ?? null));
  const xs = trays.map((d) => d.n);
  const traces: Partial<PlotData>[] = [
    {
      x: xs, y: at(Math.max(iStart, 0)), type: "scatter", mode: "lines+markers", name: "window start",
      line: { color: traceColor("expected", "", 0, undefined, theme), width: 1.2, dash: "dash" }, marker: { size: 5, color: traceColor("expected", "", 0, undefined, theme) },
      hovertemplate: "Tray %{x}: %{y:.1f} °F<extra>window start</extra>",
    },
    {
      x: xs, y: at(iNow), type: "scatter", mode: "lines+markers", name: `t = ${timeMin} min`,
      line: { color: traceColor("measured", "", 0, undefined, theme), width: 2 }, marker: { size: 6, color: traceColor("measured", "", 0, undefined, theme) },
      hovertemplate: "Tray %{x}: %{y:.1f} °F<extra>now</extra>",
    },
  ];
  const annotations: Partial<Annotations>[] = [];
  if (!trays.length) {
    annotations.push({ xref: "paper", yref: "paper", x: 0.5, y: 0.5, text: "No tray temperatures in this run", showarrow: false, font: { size: 11, color: t.muted } });
  }
  return { traces, shapes: [] as Partial<Shape>[], annotations, yTitle: "°F", y2Title: "", hasY2: false };
}

function buildPanel(panel: TwinPanel, data: TwinWorkbench, x: string[], feedLbMin: Series | null, theme: "light" | "dark", timeMin: number) {
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
    const c = traceColor("band_lo", lo.key, 0, lo.color, theme);
    traces.push({ x, y: keys[lo.key], type: "scatter", mode: "lines", line: { width: 0, color: c }, showlegend: false, hoverinfo: "skip", name: "band" });
    traces.push({ x, y: keys[hi.key], type: "scatter", mode: "lines", fill: "tonexty", fillcolor: hexA(c, theme === "dark" ? 0.13 : 0.14), line: { width: 0, color: c }, name: hi.label ?? lo.label ?? "5–95 % band", hoverinfo: "skip" });
  }

  if (panel.kind === "tray_profile") {
    return buildTrayProfile(panel, data, timeMin, theme);
  }

  let mvIdx = 0, distIdx = 0, yieldIdx = 0, trayIdx = 0;
  const yTitles = new Set<string>();
  // Manipulated-variable panels mix scales (pumparound lb/min vs setpoint °F vs valve fraction). When the spans differ by
  // more than 20× AND at least one MV genuinely moves (span ≫ its robust noise), plot each MV as % of its own window range
  // so the move has visible shape; hover keeps the raw value. Held-constant MVs stay raw: flat lines honestly read "held".
  const mvRaw = panel.kind === "mv"
    ? (panel.traces ?? []).filter((tr) => tr.role === "mv" && keys[tr.key]).map((tr) => {
        const vals = keys[tr.key].filter((v): v is number => v != null && Number.isFinite(v));
        const lo = Math.min(...vals), hi = Math.max(...vals);
        const sorted = [...vals].sort((a, b) => a - b);
        const med = sorted[Math.floor(sorted.length / 2)] ?? 0;
        const dev = vals.map((v) => Math.abs(v - med)).sort((a, b) => a - b);
        const mad = dev[Math.floor(dev.length / 2)] ?? 0;
        return { key: tr.key, lo, hi, mag: Math.max(Math.abs(lo), Math.abs(hi)), moving: hi - lo > 8 * 1.4826 * mad && hi - lo > 0 };
      })
    : [];
  const mvMags = mvRaw.map((r) => r.mag).filter((m) => Number.isFinite(m) && m > 0);
  const mvNormalise = mvMags.length > 1 && Math.max(...mvMags) / Math.min(...mvMags) > 20 && mvRaw.some((r) => r.moving);
  const mvRange = Object.fromEntries(mvRaw.map((r) => [r.key, r]));

  panel.traces?.forEach((tr) => {
    if (tr.role === "band_lo" || tr.role === "band_hi") return;
    let y: Series | undefined = keys[tr.key];
    if (!y) return;
    const idx = tr.role === "mv" ? mvIdx++ : tr.role === "disturbance" ? distIdx++ : tr.role === "yield" ? yieldIdx++ : tr.role === "tray_profile" ? trayIdx++ : 0;
    const color = traceColor(tr.role, tr.key, idx, tr.color, theme);

    if (tr.role === "sigma3") {
      traces.push({ x, y, type: "scatter", mode: "lines", line: { color, width: 1, dash: "dash" }, name: tr.label ?? "±3σ", hoverinfo: "skip" });
      traces.push({ x, y: y.map((v) => (v == null ? null : -v)), type: "scatter", mode: "lines", line: { color, width: 1, dash: "dash" }, showlegend: false, hoverinfo: "skip" });
      return;
    }
    let onY2 = tr.role === "cusum" || (panel.kind === "combustion" && tr.key.includes("CO"));
    if (onY2) y2Title = tr.role === "cusum" ? "CUSUM" : "CO ppm";
    let hovertemplate = `%{y:.2f}<extra>${tr.label ?? tr.key}</extra>`;
    let customdata: (number | null)[] | undefined;
    if (mvNormalise && tr.role === "mv" && mvRange[tr.key]) {
      const r = mvRange[tr.key];
      const span = r.hi - r.lo;
      customdata = y;
      y = span > 0 ? y.map((v) => (v == null ? null : ((v - r.lo) / span) * 100)) : y.map((v) => (v == null ? null : 50));
      hovertemplate = `%{customdata:.2f} ${tr.unit ?? ""} · %{y:.0f} % of window range<extra>${tr.label ?? tr.key}</extra>`;
      yTitle = "% of own window range";
    }
    if (panel.kind === "yield") {
      const ax = yieldAxis(tr.key, tr.unit);
      if (ax.scale === "feed" && feedLbMin) {
        y = y.map((v, i) => (v == null || feedLbMin[i] == null || !feedLbMin[i] ? null : (v / (feedLbMin[i] as number)) * 100));
        yTitles.add(ax.title);
      } else if (ax.scale === "wtpct") {
        y = y.map((v) => (v == null ? null : v * 100));
        yTitles.add(ax.title);
      } else if (ax.scale === "pct") {
        yTitles.add(ax.title);
      } else {
        onY2 = true;
        y2Title = y2Title ? (y2Title.includes(ax.title) ? y2Title : `${y2Title} · ${ax.title}`) : ax.title;
      }
    }
    if (onY2) hasY2 = true;
    traces.push({
      x, y, type: "scatter", mode: "lines",
      line: { color, width: tr.role === "measured" || tr.role === "residual" ? 2.2 : tr.role === "expected" ? 1.8 : 1.7, dash: tr.role === "expected" ? "solid" : "solid", shape: "spline", smoothing: 0.6 },
      name: tr.label ?? tr.key,
      yaxis: onY2 ? "y2" : "y",
      customdata: customdata as unknown as PlotData["customdata"],
      hovertemplate,
    });
  });
  if (panel.kind === "yield") {
    // Everything on the left axis is a percentage; if only right-axis traces exist, promote them to the left.
    if (yTitles.size) yTitle = [...yTitles].join(" · ");
    else if (hasY2 && !traces.some((tr) => tr.yaxis !== "y2")) {
      traces.forEach((tr) => { tr.yaxis = "y"; });
      yTitle = y2Title; y2Title = ""; hasY2 = false;
    }
  }

  panel.hlines?.forEach((h) => {
    const color = traceColor(h.role, "", 0, h.color, theme);
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
    const color = m.kind === "regime_change" ? (theme === "dark" ? "#c084fc" : "#6d28d9") : (theme === "dark" ? "#fb7185" : "#b91c1c");
    shapes.push({ type: "line", xref: "x", x0: minToX(m.time_min), x1: minToX(m.time_min), yref: "paper", y0: 0, y1: 1, line: { color, width: 1, dash: "dot" }, opacity: 0.7 });
    if (m.time_min - lastLabelAt >= minGap && labels < 3) {
      lastLabelAt = m.time_min;
      labels += 1;
      annotations.push({ xref: "x", x: minToX(m.time_min), yref: "paper", y: 0.02, yanchor: "bottom", xanchor: "left", text: `◆ ${m.label}`, showarrow: false, font: { size: 10, color }, xshift: 3, bgcolor: hexA(t.card, 0.75) });
    }
  });

  return { traces, shapes, annotations, yTitle, y2Title, hasY2 };
}
