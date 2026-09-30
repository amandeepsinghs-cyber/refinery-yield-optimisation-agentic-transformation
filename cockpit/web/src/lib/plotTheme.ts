import type { Config, Layout, Shape, Annotations } from "plotly.js";
import { FONT_MONO, FONT_SANS, STATUS, TOKENS, type ThemeName } from "./theme";
import { minToX, segments } from "./format";
import type { EventMark, GateStatus } from "./types";

/** SDD-UI-06 shared layout template, themed from tokens. */
export function baseLayout(theme: ThemeName, overrides: Partial<Layout> = {}): Partial<Layout> {
  const t = TOKENS[theme];
  const axis = {
    gridcolor: t.grid,
    linecolor: t.border,
    zerolinecolor: t.zeroline,
    tickcolor: t.border,
    tickfont: { family: FONT_MONO, size: 10.5, color: t.muted },
    title: { font: { family: FONT_SANS, size: 11, color: t.muted } },
    showspikes: true,
    spikecolor: t.muted,
    spikethickness: 1,
    spikedash: "dot",
    spikemode: "across" as const,
    automargin: true,
  };
  return {
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { family: FONT_SANS, size: 11.5, color: t.text },
    margin: { l: 48, r: 16, t: 12, b: 36 },
    hoverlabel: {
      bgcolor: t.elevated,
      bordercolor: t.borderStrong,
      font: { family: FONT_MONO, size: 11, color: t.text },
      align: "left",
    },
    legend: {
      orientation: "h",
      x: 0,
      y: 1.02,
      yanchor: "bottom",
      xanchor: "left",
      bgcolor: "rgba(0,0,0,0)",
      font: { size: 11, color: t.muted },
      itemclick: "toggle",
      itemdoubleclick: "toggleothers",
    },
    xaxis: { ...axis },
    yaxis: { ...axis, showspikes: false },
    hovermode: "x unified",
    dragmode: "zoom",
    modebar: { bgcolor: t.card, color: t.muted, activecolor: t.text },
    ...overrides,
  };
}

/** Axis defaults for extra axes (yaxis2…), themed. */
export function axisStyle(theme: ThemeName) {
  const t = TOKENS[theme];
  return {
    gridcolor: t.grid,
    linecolor: t.border,
    zerolinecolor: t.zeroline,
    tickfont: { family: FONT_MONO, size: 10.5, color: t.muted },
    title: { font: { family: FONT_SANS, size: 11, color: t.muted } },
    automargin: true,
  };
}

export const timeAxis = {
  type: "date" as const,
  tickformat: "%H:%M",
  hoverformat: "%H:%M",
};

export const PLOT_CONFIG: Partial<Config> = {
  displaylogo: false,
  responsive: true,
  modeBarButtonsToRemove: [
    "zoomIn2d",
    "zoomOut2d",
    "pan2d",
    "select2d",
    "lasso2d",
    "autoScale2d",
    "toggleSpikelines",
    "hoverClosestCartesian",
    "hoverCompareCartesian",
  ],
  toImageButtonOptions: { format: "png", scale: 2, filename: "fcc-cockpit-simulated" },
};

export const specShape = (spec: number, yref = "y", color: string = STATUS.RED): Partial<Shape> => ({
  type: "line",
  xref: "paper",
  x0: 0,
  x1: 1,
  yref: yref as Shape["yref"],
  y0: spec,
  y1: spec,
  line: { color, width: 1.25, dash: "dash" },
});

export const cursorShape = (m: number, theme: ThemeName, yref: Shape["yref"] = "paper"): Partial<Shape> => ({
  type: "line",
  xref: "x",
  x0: minToX(m),
  x1: minToX(m),
  yref,
  y0: 0,
  y1: 1,
  line: { color: TOKENS[theme].text, width: 1, dash: "solid" },
  opacity: 0.55,
});

/** Event vrects + rotated labels. `y0/y1` are paper coords for the band. */
export function eventOverlays(
  events: EventMark[],
  theme: ThemeName,
  y0 = 0,
  y1 = 1,
): { shapes: Partial<Shape>[]; annotations: Partial<Annotations>[] } {
  const t = TOKENS[theme];
  const shapes: Partial<Shape>[] = [];
  const annotations: Partial<Annotations>[] = [];
  for (const e of events) {
    const dur = Math.max(e.duration || 0, 2);
    shapes.push({
      type: "rect",
      xref: "x",
      yref: "paper",
      x0: minToX(e.time_min),
      x1: minToX(e.time_min + dur),
      y0,
      y1,
      fillcolor: t.eventFill,
      line: { width: 0 },
      layer: "below",
    });
    annotations.push({
      x: minToX(e.time_min),
      xref: "x",
      yref: "paper",
      y: y1,
      xanchor: "left",
      yanchor: "top",
      text: e.label,
      showarrow: false,
      font: { size: 10, color: t.muted },
      bgcolor: "rgba(0,0,0,0)",
      xshift: 3,
      yshift: -2,
    });
  }
  return { shapes, annotations };
}

/** WITHHELD gate bands as vrects over a paper-y window, labelled. */
export function gateBands(
  time: number[],
  gate: GateStatus[],
  theme: ThemeName,
  y0 = 0,
  y1 = 1,
  label = true,
): { shapes: Partial<Shape>[]; annotations: Partial<Annotations>[] } {
  const t = TOKENS[theme];
  const shapes: Partial<Shape>[] = [];
  const annotations: Partial<Annotations>[] = [];
  for (const s of segments(gate)) {
    if (s.value !== "WITHHELD") continue;
    const x0 = minToX(time[s.start]);
    const x1 = minToX(time[s.end] + 1);
    shapes.push({
      type: "rect",
      xref: "x",
      yref: "paper",
      x0,
      x1,
      y0,
      y1,
      fillcolor: t.withheldFill,
      line: { width: 1, color: "rgba(217,119,6,0.55)", dash: "dot" },
      layer: "below",
    });
    if (label) {
      annotations.push({
        x: x0,
        xref: "x",
        yref: "paper",
        y: y1,
        xanchor: "left",
        yanchor: "top",
        text: "WITHHELD",
        showarrow: false,
        font: { size: 10, color: STATUS.AMBER, family: FONT_MONO },
        xshift: 3,
        yshift: -2,
      });
    }
  }
  return { shapes, annotations };
}

/** Trust strip as coloured rects over a paper-y window, with text for wide segments. */
export function trustStrip(
  time: number[],
  trust: string[],
  y0: number,
  y1: number,
  xSpanMin: number,
): { shapes: Partial<Shape>[]; annotations: Partial<Annotations>[] } {
  const shapes: Partial<Shape>[] = [];
  const annotations: Partial<Annotations>[] = [];
  for (const s of segments(trust)) {
    const color = STATUS[s.value as keyof typeof STATUS] ?? "#71717a";
    const a = time[s.start];
    const b = time[s.end] + 1;
    shapes.push({
      type: "rect",
      xref: "x",
      yref: "paper",
      x0: minToX(a),
      x1: minToX(b),
      y0,
      y1,
      fillcolor: color,
      line: { width: 0 },
      opacity: 0.9,
    });
    if (xSpanMin > 0 && (b - a) / xSpanMin > 0.08) {
      annotations.push({
        x: minToX((a + b) / 2),
        xref: "x",
        yref: "paper",
        y: (y0 + y1) / 2,
        yanchor: "middle",
        xanchor: "center",
        text: s.value,
        showarrow: false,
        font: { size: 9, color: "#ffffff", family: FONT_MONO },
      });
    }
  }
  return { shapes, annotations };
}

export function hexA(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, "$1$1") : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
