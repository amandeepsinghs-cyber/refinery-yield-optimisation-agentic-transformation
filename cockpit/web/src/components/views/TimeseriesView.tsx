"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Annotations, Data, Layout, LayoutAxis, PlotRelayoutEvent, Shape } from "plotly.js";
import Link from "next/link";
import Chart from "@/components/charts/Chart";
import { clickToMinute } from "@/components/charts/EstimateCharts";
import {
  useEstimatesTimeseries,
  useKnowledgeRecords,
  useRuns,
  useRunTimeseries,
  useTags,
  type TimeWindow,
} from "@/lib/api";
import { useRunRecords, type KnowledgeRecordFull } from "@/lib/knowledgeApi";
import { clock, minToX, propLabel, xToMin, yAxisFit } from "@/lib/format";
import {
  axisStyle,
  baseLayout,
  cursorShape,
  eventOverlays,
  gateBands,
  hexA,
  specShape,
  timeAxis,
  trustStrip,
} from "@/lib/plotTheme";
import { useCockpit } from "@/lib/store";
import { labDrawMinutes, modeOf, modeSegments } from "@/lib/controllerMode";
import { FONT_MONO, MODEL_ORDER, STATUS, TOKENS, modelColor, modelLabel } from "@/lib/theme";
import type { EstimatesTimeseries, RunTimeseries, TagGroup, TagInfo } from "@/lib/types";
import { Card, EmptyState, ErrorState, LoadingBlock, NoRun, PageHeader } from "@/components/ui/primitives";
import { IconRefresh } from "@/components/ui/icons";

function getSimWindow(rec: KnowledgeRecordFull): [number, number] | null {
  const w = (rec as unknown as { sim_window?: number[] }).sim_window ?? rec.window;
  if (Array.isArray(w) && w.length >= 2 && typeof w[0] === "number" && typeof w[1] === "number") {
    return [w[0], w[1]];
  }
  return null;
}

function getEffectiveDate(rec: KnowledgeRecordFull): string {
  return (rec as unknown as { effective_date?: string }).effective_date ?? rec.date ?? "—";
}

const MAX_PANELS = 6;
/** Simulator meta columns behind the controller-mode strip (Scene 2). */
const MODE_COLS = ["cutpoint_auto", "lab_sample"];

/** Minimum visible half-range per engineering unit, so flat signals don't zoom into noise. */
function unitFloor(unit: string | undefined): number {
  const u = (unit ?? "").toLowerCase();
  if (u.includes("°") || u === "f" || u === "degf" || u === "c") return 0.5;
  if (u.includes("psi") || u.includes("kpa") || u.includes("bar")) return 0.25;
  if (u.includes("%")) return 0.25;
  if (u.includes("bpd") || u.includes("bbl") || u.includes("kg") || u.includes("lb")) return 1;
  return 0.05;
}
const TAG_PALETTE = ["#38bdf8", "#f59e0b", "#84cc16", "#f472b6", "#94a3b8", "#fb7185", "#22d3ee", "#facc15"];
const GROUP_LABEL: Record<TagGroup, string> = {
  input: "Inputs",
  mv: "MVs",
  tray: "Tray temperatures",
  target: "Targets",
  reactor: "Reactor",
  signal: "Signals (raw)",
};
const GROUP_ORDER: TagGroup[] = ["input", "mv", "tray", "target", "reactor", "signal"];
const MODEL_KEYS = [...MODEL_ORDER, "mixture"];

interface Selection {
  /** raw tag → panel number (1-based) */
  raw: Record<string, number>;
  models: string[];
  truth: boolean;
  labs: boolean;
  w90: boolean;
  gate: boolean;
  trust: boolean;
  records: boolean;
  /** Controller-mode strip (cutpoint_auto → Manual / Trim) with lab draw markers (lab_sample). */
  mode: boolean;
}

function defaultSelection(tags: TagInfo[]): Selection {
  const raw: Record<string, number> = {};
  const input = tags.find((t) => t.tag === "dist_feed_API") ?? tags.find((t) => t.group === "input");
  const tray = tags.find((t) => t.tag === "T_tray13_F") ?? tags.find((t) => t.group === "tray");
  let p = 1;
  if (input) raw[input.tag] = p++;
  if (tray) raw[tray.tag] = p++;
  return {
    raw,
    models: ["hybrid_delta_v1", "pinn_ens_v1", "gpr_v1", "mixture"],
    truth: true,
    labs: true,
    w90: true,
    gate: true,
    trust: true,
    records: true,
    mode: true,
  };
}

function toCsv(raw: RunTimeseries | undefined, est: EstimatesTimeseries | undefined): string {
  const cols: string[] = ["time_min"];
  const rows = new Map<number, Record<string, string>>();
  const put = (t: number, k: string, v: number | null | string | undefined) => {
    const r = rows.get(t) ?? {};
    r[k] = v === null || v === undefined ? "" : String(v);
    rows.set(t, r);
  };
  if (raw) {
    for (const k of Object.keys(raw.series)) {
      cols.push(k);
      raw.time_min.forEach((t, i) => put(t, k, raw.series[k][i]));
    }
  }
  if (est) {
    const add = (k: string, arr: (number | null | string)[]) => {
      cols.push(k);
      est.time_min.forEach((t, i) => put(t, k, arr[i]));
    };
    for (const [id, m] of Object.entries(est.members)) add(`${id}_mu`, m.mu);
    add("mixture_q05", est.mixture.q05);
    add("mixture_q50", est.mixture.q50);
    add("mixture_q95", est.mixture.q95);
    add("simulator_truth", est.truth);
    add("w90", est.w90);
    add("gate", est.gate);
    add("trust", est.trust);
  }
  const times = [...rows.keys()].sort((a, b) => a - b);
  const lines = [`# Simulated data${raw ? ` · ${raw.run_id}` : ""}`, cols.join(",")];
  for (const t of times) {
    const r = rows.get(t)!;
    lines.push([String(t), ...cols.slice(1).map((c) => r[c] ?? "")].join(","));
  }
  return lines.join("\n");
}

function Opt({
  checked,
  onChange,
  label,
  unit,
  children,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  unit?: string;
  children?: React.ReactNode;
}) {
  return (
    <label className={`tag-opt ${checked ? "checked" : ""}`}>
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span>{label}</span>
      {children ?? (unit ? <span className="unit">{unit}</span> : null)}
    </label>
  );
}

function TagPicker({
  tags,
  sel,
  setSel,
  panelCount,
  property,
}: {
  tags: TagInfo[];
  sel: Selection;
  setSel: (fn: (s: Selection) => Selection) => void;
  panelCount: number;
  property: string;
}) {
  const grouped = GROUP_ORDER.map((g) => ({ g, items: tags.filter((t) => t.group === g) })).filter((x) => x.items.length);
  const usedPanels = new Set(Object.values(sel.raw));
  const rawPanelLimit = MAX_PANELS - (sel.models.length || sel.truth || sel.labs ? 1 : 0) - (sel.w90 ? 1 : 0);

  const toggleRaw = (tag: string) =>
    setSel((s) => {
      const raw = { ...s.raw };
      if (raw[tag]) delete raw[tag];
      else {
        const used = new Set(Object.values(raw));
        let p = 1;
        while (used.has(p) && p < rawPanelLimit) p++;
        raw[tag] = Math.max(1, Math.min(p, rawPanelLimit));
      }
      return { ...s, raw };
    });

  return (
    <nav className="card tagpicker" aria-label="Tag picker">
      {grouped.map(({ g, items }) => (
        <div key={g}>
          <h3>{GROUP_LABEL[g]}</h3>
          {items.map((t) => (
            <Opt key={t.tag} checked={!!sel.raw[t.tag]} onChange={() => toggleRaw(t.tag)} label={t.label || t.tag} unit={t.unit}>
              {sel.raw[t.tag] ? (
                <select
                  className="select tag-panel-select"
                  aria-label={`Panel for ${t.label || t.tag}`}
                  value={sel.raw[t.tag]}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setSel((s) => ({ ...s, raw: { ...s.raw, [t.tag]: v } }));
                  }}
                >
                  {Array.from({ length: Math.max(1, rawPanelLimit) }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n} disabled={!usedPanels.has(n) && n > panelCount + 1}>
                      P{n}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="unit">{t.unit}</span>
              )}
            </Opt>
          ))}
        </div>
      ))}
      <h3>Model outputs · {propLabel(property)}</h3>
      {MODEL_KEYS.map((m) => (
        <Opt
          key={m}
          checked={sel.models.includes(m)}
          onChange={() =>
            setSel((s) => ({ ...s, models: s.models.includes(m) ? s.models.filter((x) => x !== m) : [...s.models, m] }))
          }
          label={modelLabel(m)}
        >
          <span className="swatch line" style={{ background: m === "mixture" ? "var(--text)" : modelColor(m, "dark"), marginLeft: "auto", marginRight: 0 }} />
        </Opt>
      ))}
      <Opt checked={sel.truth} onChange={() => setSel((s) => ({ ...s, truth: !s.truth }))} label="Simulator truth" />
      <Opt checked={sel.labs} onChange={() => setSel((s) => ({ ...s, labs: !s.labs }))} label="Lab results" />
      <h3>Signals</h3>
      <Opt checked={sel.w90} onChange={() => setSel((s) => ({ ...s, w90: !s.w90 }))} label="W90 spread" unit="°F" />
      <Opt checked={sel.gate} onChange={() => setSel((s) => ({ ...s, gate: !s.gate }))} label="Gate (WITHHELD bands)" />
      <Opt checked={sel.trust} onChange={() => setSel((s) => ({ ...s, trust: !s.trust }))} label="Trust strip" />
      <Opt
        checked={sel.mode}
        onChange={() => setSel((s) => ({ ...s, mode: !s.mode }))}
        label="Controller mode (Manual / Trim) + lab draws"
      />
      <h3>Records</h3>
      <Opt checked={sel.records} onChange={() => setSel((s) => ({ ...s, records: !s.records }))} label="Job records (knowledge)" />
    </nav>
  );
}

export default function TimeseriesView() {
  const theme = useCockpit((s) => s.theme);
  const runId = useCockpit((s) => s.runId);
  const property = useCockpit((s) => s.property);
  const timeMin = useCockpit((s) => s.timeMin);
  const setTimeMin = useCockpit((s) => s.setTimeMin);
  const openSource = useCockpit((s) => s.openSource);
  const tagsQ = useTags();
  const [selState, setSelState] = useState<Selection | null>(null);
  const sel = useMemo(() => selState ?? (tagsQ.data ? defaultSelection(tagsQ.data) : null), [selState, tagsQ.data]);
  const setSel = useCallback(
    (fn: (s: Selection) => Selection) => setSelState((prev) => fn(prev ?? defaultSelection(tagsQ.data ?? []))),
    [tagsQ.data],
  );
  const [win, setWin] = useState<TimeWindow>({});
  const [uirev, setUirev] = useState(0);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rawTags = useMemo(() => (sel ? Object.keys(sel.raw) : []), [sel]);
  const needEst = !!sel && (sel.models.length > 0 || sel.truth || sel.labs || sel.w90 || sel.gate || sel.trust);
  const rawQ = useRunTimeseries(runId, rawTags, win, 2000);
  const estQ = useEstimatesTimeseries(runId, property, win, 2000, needEst);
  const recQ = useKnowledgeRecords(sel?.records ? runId : null);
  const modeQ = useRunTimeseries(sel?.mode ? runId : null, MODE_COLS, win, 2000);
  const records = useRunRecords(runId);
  const runsQ = useRuns();
  const currentRun = runsQ.data?.find((r) => r.run_id === runId);

  const maxMinute = useMemo(() => {
    if (currentRun?.n_minutes && currentRun.n_minutes > 0) return currentRun.n_minutes;
    if (rawQ.data?.time_min?.length) return Math.max(...rawQ.data.time_min);
    if (estQ.data?.time_min?.length) return Math.max(...estQ.data.time_min);
    return 1440;
  }, [currentRun, rawQ.data, estQ.data]);

  const placedRecords = useMemo(() => {
    const list = records.data ?? [];
    return list
      .filter((r) => getSimWindow(r) !== null)
      .sort((a, b) => getSimWindow(a)![0] - getSimWindow(b)![0]);
  }, [records.data]);

  const dateRecords = useMemo(() => {
    const list = records.data ?? [];
    return list.filter((r) => getSimWindow(r) === null).slice(0, 8);
  }, [records.data]);

  useEffect(() => () => {
    if (debounce.current) clearTimeout(debounce.current);
  }, []);

  const tagMeta = useMemo(() => new Map((tagsQ.data ?? []).map((t) => [t.tag, t])), [tagsQ.data]);

  const figure = useMemo(() => {
    if (!sel) return null;
    const t = TOKENS[theme];
    const raw = rawQ.data;
    const est = needEst ? estQ.data : undefined;
    const rawPanels = [...new Set(Object.values(sel.raw))].sort((a, b) => a - b);
    const hasEstPanel = sel.models.length > 0 || sel.truth || sel.labs;
    type P = { key: string; title: string; weight: number };
    const panels: P[] = rawPanels.map((p) => {
      const tagsIn = Object.entries(sel.raw).filter(([, v]) => v === p).map(([k]) => k);
      const title = tagsIn
        .map((k) => {
          const m = tagMeta.get(k);
          return m ? `${m.label || k}${m.unit ? ` (${m.unit})` : ""}` : k;
        })
        .join(" · ");
      return { key: `raw${p}`, title, weight: 1 };
    });
    if (hasEstPanel) panels.push({ key: "est", title: `${propLabel(property)} °F — models vs simulator truth vs lab`, weight: 1.5 });
    if (sel.w90) panels.push({ key: "w90", title: `W90 spread${sel.gate ? " & gate" : ""} (°F)`, weight: 0.8 });
    if (!panels.length) return null;

    // Vertical layout (paper coords). Bottom strips first.
    const recH = sel.records ? 0.05 : 0;
    const trustH = sel.trust && est ? 0.03 : 0;
    const stripGap = recH || trustH ? 0.015 : 0;
    const baseBottom = recH + trustH + stripGap + (recH && trustH ? 0.01 : 0) + (trustH ? 0.035 : 0);
    const modeData = sel.mode ? modeQ.data : undefined;
    const modeCol = modeData?.series.cutpoint_auto;
    const modeH = modeCol && modeCol.some((v) => v !== null) ? 0.03 : 0;
    const modeY0 = baseBottom + (baseBottom ? 0.005 : 0);
    const bottom = modeH ? modeY0 + modeH + 0.03 : baseBottom;
    const gap = 0.045;
    const totalW = panels.reduce((a, p) => a + p.weight, 0);
    const avail = 1 - bottom - gap * (panels.length - 1) - 0.02;
    const domains: Record<string, [number, number]> = {};
    let top = 0.98;
    panels.forEach((p) => {
      const h = (avail * p.weight) / totalW;
      domains[p.key] = [Math.max(0, top - h), top];
      top = top - h - gap;
    });

    const axisId = (i: number) => (i === 0 ? "y" : `y${i + 1}`);
    const axisKey = (i: number) => (i === 0 ? "yaxis" : `yaxis${i + 1}`);
    const panelAxis: Record<string, string> = {};
    const lay: Partial<Layout> & Record<string, unknown> = baseLayout(theme, {
      margin: { l: 58, r: 18, t: 16, b: 30 },
      showlegend: false,
      hovermode: "x unified",
      uirevision: `${runId}-${property}-${uirev}`,
      xaxis: {
        ...baseLayout(theme).xaxis,
        ...timeAxis,
        anchor: "free",
        position: 0,
        rangeslider: { visible: true, thickness: 0.07, bgcolor: t.elevated, bordercolor: t.border, borderwidth: 1 },
      } as Partial<LayoutAxis>,
    });
    const shapes: Partial<Shape>[] = [];
    const annotations: Partial<Annotations>[] = [];
    panels.forEach((p, i) => {
      panelAxis[p.key] = axisId(i);
      lay[axisKey(i)] = {
        ...axisStyle(theme),
        domain: domains[p.key],
        anchor: "x",
        nticks: p.weight < 1 ? 4 : 5,
        ...(p.key === "w90" ? { rangemode: "tozero" } : {}),
      };
      annotations.push({
        xref: "paper",
        yref: "paper",
        x: 0,
        y: domains[p.key][1],
        xanchor: "left",
        yanchor: "bottom",
        text: `<b>${p.title}</b>`,
        showarrow: false,
        font: { size: 11.5, color: t.text },
        yshift: 2,
      });
    });

    const data: Data[] = [];
    // Raw tags
    let ci = 0;
    if (raw) {
      const x = raw.time_min.map(minToX);
      for (const [tag, pn] of Object.entries(sel.raw)) {
        const ser = raw.series[tag];
        if (!ser) continue;
        const m = tagMeta.get(tag);
        data.push({
          type: "scatter",
          mode: "lines",
          x,
          y: ser,
          yaxis: panelAxis[`raw${pn}`],
          name: m?.label || tag,
          line: { width: 1.5, color: TAG_PALETTE[ci++ % TAG_PALETTE.length] },
          hovertemplate: `${m?.label || tag} %{y:.2f}${m?.unit ? ` ${m.unit}` : ""}<extra></extra>`,
        });
      }
      // Per-panel y fit: min visible range ±max(0.5 % |mean|, unit floor), rounded ticks.
      const byPanel = new Map<number, { vals: (number | null)[]; floor: number }>();
      for (const [tag, pn] of Object.entries(sel.raw)) {
        const ser = raw.series[tag];
        if (!ser) continue;
        const cur = byPanel.get(pn) ?? { vals: [], floor: 0 };
        for (const v of ser) cur.vals.push(v);
        cur.floor = Math.max(cur.floor, unitFloor(tagMeta.get(tag)?.unit));
        byPanel.set(pn, cur);
      }
      for (const [pn, { vals, floor }] of byPanel) {
        const key = axisKey(panels.findIndex((p) => p.key === `raw${pn}`));
        const fit = yAxisFit(vals, floor);
        const ax = lay[key] as Record<string, unknown> | undefined;
        if (!ax) continue;
        lay[key] = {
          ...ax,
          tickformat: fit.tickformat,
          hoverformat: fit.hoverformat,
          ...(fit.range ? { range: fit.range, autorange: false } : {}),
        };
      }
    }
    if (est && hasEstPanel) {
      const ya = panelAxis.est;
      const x = est.time_min.map(minToX);
      const mix = sel.models.includes("mixture");
      if (mix) {
        data.push(
          { type: "scatter", x, y: est.mixture.q05, yaxis: ya, mode: "lines", line: { width: 0, color: t.accent }, hoverinfo: "skip", showlegend: false, name: "P5" },
          { type: "scatter", x, y: est.mixture.q95, yaxis: ya, mode: "lines", line: { width: 0, color: t.accent }, fill: "tonexty", fillcolor: theme === "dark" ? "rgba(250,250,250,0.08)" : "rgba(9,9,11,0.07)", name: "P5–P95", hovertemplate: "P95 %{y:.1f}<extra></extra>" },
          { type: "scatter", x, y: est.mixture.q25, yaxis: ya, mode: "lines", line: { width: 0, color: t.accent }, hoverinfo: "skip", showlegend: false, name: "P25" },
          { type: "scatter", x, y: est.mixture.q75, yaxis: ya, mode: "lines", line: { width: 0, color: t.accent }, fill: "tonexty", fillcolor: theme === "dark" ? "rgba(250,250,250,0.14)" : "rgba(9,9,11,0.12)", name: "P25–P75", hoverinfo: "skip" },
        );
      }
      const selectedModels = sel.models.filter((m) => m !== "mixture");
      for (const id of selectedModels) {
        const mm = est.members[id];
        if (!mm) continue;
        const color = modelColor(id, theme);
        if (selectedModels.length <= 2) {
          const lo = mm.mu.map((v, i) => (v === null || mm.sigma[i] === null ? null : v - 1.645 * (mm.sigma[i] as number)));
          const hi = mm.mu.map((v, i) => (v === null || mm.sigma[i] === null ? null : v + 1.645 * (mm.sigma[i] as number)));
          data.push(
            { type: "scatter", x, y: lo, yaxis: ya, mode: "lines", line: { width: 0, color }, hoverinfo: "skip", showlegend: false },
            { type: "scatter", x, y: hi, yaxis: ya, mode: "lines", line: { width: 0, color }, fill: "tonexty", fillcolor: hexA(color, 0.12), hoverinfo: "skip", showlegend: false },
          );
        }
        data.push({
          type: "scatter",
          x,
          y: mm.mu,
          yaxis: ya,
          mode: "lines",
          line: { width: 1.2, color },
          name: modelLabel(id),
          hovertemplate: `${modelLabel(id)} %{y:.1f}<extra></extra>`,
        });
      }
      if (mix) {
        data.push({
          type: "scatter",
          x,
          y: est.mixture.mean,
          yaxis: ya,
          mode: "lines",
          line: { width: 1.65, color: t.text },
          name: "Mixture",
          hovertemplate: "Mixture %{y:.1f}<extra></extra>",
        });
      }
      if (sel.truth) {
        data.push({
          type: "scatter",
          x,
          y: est.truth,
          yaxis: ya,
          mode: "lines",
          line: { width: 1.4, color: t.muted, dash: "dot" },
          name: "simulator truth",
          hovertemplate: "simulator truth %{y:.1f}<extra></extra>",
        });
      }
      if (sel.labs && est.labs?.length) {
        data.push({
          type: "scatter",
          x: est.labs.map((l) => minToX(l.time_min)),
          y: est.labs.map((l) => l.value),
          yaxis: ya,
          mode: "markers",
          marker: { size: 7, color: t.text, line: { color: t.card, width: 1 } },
          name: "lab",
          customdata: est.labs.map((l) => l.status),
          hovertemplate: "lab %{y:.1f} (%{customdata})<extra></extra>",
        });
      }
      shapes.push(specShape(est.spec_max, ya));
      annotations.push({
        xref: "paper",
        x: 1,
        yref: ya as Annotations["yref"],
        y: est.spec_max,
        text: `spec ${est.spec_max}`,
        showarrow: false,
        xanchor: "right",
        yanchor: "bottom",
        font: { size: 10, color: STATUS.RED },
      });
    }
    // W90 panel
    if (est && sel.w90) {
      const ya = panelAxis.w90;
      const x = est.time_min.map(minToX);
      data.push({
        type: "scatter",
        x,
        y: est.w90,
        yaxis: ya,
        mode: "lines",
        line: { width: 1.5, color: t.accent },
        name: "W90",
        hovertemplate: "W90 %{y:.1f} °F<extra></extra>",
      });
      shapes.push({ ...specShape(est.w90_limit, ya), line: { color: STATUS.RED, width: 1, dash: "dash" } });
      annotations.push({
        xref: "paper",
        x: 1,
        yref: ya as Annotations["yref"],
        y: est.w90_limit,
        text: `limit ${est.w90_limit} °F`,
        showarrow: false,
        xanchor: "right",
        yanchor: "bottom",
        font: { size: 10, color: STATUS.RED },
      });
      if (sel.gate) {
        const d = domains.w90;
        const gb = gateBands(est.time_min, est.gate, theme, d[0], d[1]);
        shapes.push(...gb.shapes);
        annotations.push(...gb.annotations);
      }
    } else if (est && sel.gate && hasEstPanel) {
      const d = domains.est;
      const gb = gateBands(est.time_min, est.gate, theme, d[0], d[1]);
      shapes.push(...gb.shapes);
      annotations.push(...gb.annotations);
    }
    // Trust strip (colour + text)
    const nextAxis = panels.length;
    if (est && trustH) {
      const y0 = recH + (recH ? 0.01 : 0) + stripGap;
      const y1 = y0 + trustH;
      const span = (est.time_min.at(-1) ?? 0) - (est.time_min[0] ?? 0);
      const ts = trustStrip(est.time_min, est.trust, y0, y1, span);
      shapes.push(...ts.shapes);
      annotations.push(...ts.annotations, {
        xref: "paper",
        yref: "paper",
        x: 0,
        y: (y0 + y1) / 2,
        xanchor: "right",
        text: "Trust",
        showarrow: false,
        font: { size: 10.5, color: t.muted },
        xshift: -6,
      });
      lay[axisKey(nextAxis)] = { domain: [y0, y1], visible: false, range: [0, 1], fixedrange: true, anchor: "x" };
      data.push({
        type: "scatter",
        x: est.time_min.map(minToX),
        y: est.trust.map(() => 0.5),
        text: est.trust.map((v, i) => `${v} · gate ${est.gate[i]}`),
        yaxis: axisId(nextAxis),
        mode: "lines",
        line: { width: 0, color: "rgba(0,0,0,0)" },
        name: "Trust",
        hovertemplate: "trust %{text}<extra></extra>",
      });
    }
    // Records track
    if (sel.records && recH) {
      const y0 = 0;
      const y1 = recH;
      const ai = nextAxis + (est && trustH ? 1 : 0);
      lay[axisKey(ai)] = { domain: [y0, y1], visible: false, range: [0, 1], fixedrange: true, anchor: "x" };
      annotations.push({
        xref: "paper",
        yref: "paper",
        x: 0,
        y: (y0 + y1) / 2,
        xanchor: "right",
        text: "Records",
        showarrow: false,
        font: { size: 10.5, color: t.muted },
        xshift: -6,
      });
      const recs = (recQ.data ?? []).filter((r) => r.time_min !== null);
      if (recs.length) {
        data.push({
          type: "scatter",
          x: recs.map((r) => minToX(r.time_min as number)),
          y: recs.map(() => 0.35),
          yaxis: axisId(ai),
          mode: "text+markers",
          marker: { symbol: "diamond", size: 9, color: t.text, line: { color: t.card, width: 1 } },
          text: recs.map((r) => r.doc_id),
          textposition: "top center",
          textfont: { size: 10, color: t.muted, family: FONT_MONO },
          customdata: recs.map((r) => `${r.doc_type} · ${r.title}`),
          name: "Record",
          hovertemplate: "%{text} — %{customdata}<extra></extra>",
        });
      }
    }
    // Controller-mode strip: Manual / Trim bands from cutpoint_auto, lab draw ▼ markers from lab_sample.
    if (modeH && modeData && modeCol) {
      const y0 = modeY0;
      const y1 = modeY0 + modeH;
      const ai = nextAxis + (est && trustH ? 1 : 0) + (sel.records && recH ? 1 : 0);
      lay[axisKey(ai)] = { domain: [y0, y1], visible: false, range: [0, 1], fixedrange: true, anchor: "x" };
      const tm = modeData.time_min;
      const span = Math.max(1, (tm.at(-1) ?? 0) - (tm[0] ?? 0));
      for (const sg of modeSegments(tm, modeCol)) {
        const trim = sg.mode === "Trim";
        shapes.push({
          type: "rect",
          xref: "x",
          yref: "paper",
          x0: minToX(sg.start),
          x1: minToX(sg.end),
          y0,
          y1,
          line: { width: 0 },
          fillcolor: trim ? hexA(t.accent, 0.45) : hexA(t.muted, 0.22),
          layer: "below",
        });
        if ((sg.end - sg.start) / span > 0.05) {
          annotations.push({
            xref: "x",
            yref: "paper",
            x: minToX((sg.start + sg.end) / 2),
            y: (y0 + y1) / 2,
            text: sg.mode,
            showarrow: false,
            font: { size: 10, color: t.text },
          });
        }
      }
      annotations.push({
        xref: "paper",
        yref: "paper",
        x: 0,
        y: (y0 + y1) / 2,
        xanchor: "right",
        text: "Mode",
        showarrow: false,
        font: { size: 10.5, color: t.muted },
        xshift: -6,
      });
      data.push({
        type: "scatter",
        x: tm.map(minToX),
        y: tm.map(() => 0.5),
        text: modeCol.map((v) => modeOf(v) ?? "—"),
        yaxis: axisId(ai),
        mode: "lines",
        line: { width: 0, color: "rgba(0,0,0,0)" },
        name: "Controller mode",
        hovertemplate: "controller %{text}<extra></extra>",
      });
      const draws = modeData.series.lab_sample ? labDrawMinutes(tm, modeData.series.lab_sample) : [];
      if (draws.length) {
        data.push({
          type: "scatter",
          x: draws.map(minToX),
          y: draws.map(() => 0.5),
          yaxis: axisId(ai),
          mode: "markers",
          marker: { symbol: "triangle-down", size: 9, color: t.text, line: { color: t.card, width: 1 } },
          name: "Lab draw",
          customdata: draws,
          hovertemplate: "lab draw · t %{customdata}<extra></extra>",
        });
      }
    }
    // Events across all panels, clipped to the data extent so long events can't stretch the axis.
    const times = [...(raw?.time_min ?? []), ...(est?.time_min ?? [])];
    const xMin = times.length ? Math.min(...times) : null;
    const xMax = times.length ? Math.max(...times) : null;
    const events = (est?.events?.length ? est.events : (raw?.events ?? [])).map((e) =>
      xMax !== null ? { ...e, duration: Math.max(0, Math.min(e.duration || 0, xMax - e.time_min)) } : e,
    );
    const ev = eventOverlays(events, theme, bottom, 0.98);
    shapes.push(...ev.shapes);
    annotations.push(...ev.annotations.map((a) => ({ ...a, y: domains[panels[0].key][1], yshift: -14 })));
    if (timeMin !== null) shapes.push(cursorShape(timeMin, theme));
    if (xMin !== null && xMax !== null && xMax > xMin) {
      const xr: [string, string] = [minToX(xMin), minToX(xMax)];
      const xa = lay.xaxis as Record<string, unknown>;
      lay.xaxis = {
        ...xa,
        range: xr,
        autorange: false,
        rangeslider: { ...(xa.rangeslider as object), range: xr, autorange: false },
      } as Partial<LayoutAxis>;
    }
    lay.shapes = shapes;
    lay.annotations = annotations;
    const height = Math.max(
      420,
      panels.reduce((a, p) => a + p.weight * 170, 0) + (recH ? 50 : 0) + (trustH ? 30 : 0) + (modeH ? 34 : 0) + 110,
    );
    return { data, layout: lay as Partial<Layout>, height, recs: recQ.data ?? [] };
  }, [sel, theme, rawQ.data, estQ.data, modeQ.data, needEst, recQ.data, tagMeta, property, runId, uirev, timeMin]);

  const onRelayout = useCallback((e: Readonly<PlotRelayoutEvent>) => {
    const ev = e as Record<string, unknown>;
    let range: [unknown, unknown] | null = null;
    if (ev["xaxis.range[0]"] !== undefined) range = [ev["xaxis.range[0]"], ev["xaxis.range[1]"]];
    else if (Array.isArray(ev["xaxis.range"])) range = ev["xaxis.range"] as [unknown, unknown];
    const auto = ev["xaxis.autorange"] === true;
    if (!range && !auto) return;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      if (auto) setWin({});
      else if (range) {
        const a = xToMin(range[0] as string);
        const b = xToMin(range[1] as string);
        if (Number.isFinite(a) && Number.isFinite(b)) setWin({ from: Math.max(0, Math.floor(a)), to: Math.ceil(b) });
      }
    }, 250);
  }, []);

  const exportCsv = () => {
    const csv = toCsv(rawQ.data, estQ.data);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fcc-simulated-${runId}-${property}${win.from !== undefined ? `-${win.from}-${win.to}` : ""}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const loading = tagsQ.isLoading || (rawQ.isLoading && rawTags.length > 0) || (needEst && estQ.isLoading);
  const err = tagsQ.error ?? rawQ.error ?? estQ.error;
  const downsampled = rawQ.data?.downsampled;

  return (
    <div className="page">
      <PageHeader
        title="Time-Series Explorer"
        question="What is the plant doing over time, and why did the estimate move?"
        actions={
          <>
            <span className="chip mono" aria-live="polite">
              {win.from !== undefined ? `window t ${win.from}–${win.to} (${clock(win.from ?? 0)}–${clock(win.to ?? 0)})` : "full run"}
              {downsampled ? " · LTTB" : " · 1-min"}
            </span>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setWin({});
                setUirev((u) => u + 1);
              }}
              disabled={win.from === undefined}
            >
              <IconRefresh /> Reset zoom
            </button>
            <button type="button" className="btn" onClick={exportCsv} disabled={!rawQ.data && !estQ.data}>
              Export CSV
            </button>
          </>
        }
      />
      {!runId ? (
        <Card>
          <NoRun />
        </Card>
      ) : (
        <>
          <div className="ts-layout">
          {tagsQ.data && sel ? (
            <TagPicker tags={tagsQ.data} sel={sel} setSel={setSel} panelCount={new Set(Object.values(sel.raw)).size} property={property} />
          ) : (
            <div className="card tagpicker">
              <LoadingBlock height={400} label="Loading tags" />
            </div>
          )}
          <section className="card" aria-label="Synchronised time-series panels">
            <div className="card-b flush" style={{ paddingTop: 8 }}>
              {err && !rawQ.data && !estQ.data ? (
                <ErrorState
                  error={err}
                  onRetry={() => {
                    void tagsQ.refetch();
                    void rawQ.refetch();
                    void estQ.refetch();
                  }}
                />
              ) : loading && !figure?.data.length ? (
                <LoadingBlock height={640} />
              ) : figure && figure.data.length ? (
                <Chart
                  data={figure.data}
                  layout={figure.layout}
                  height={figure.height}
                  ariaLabel="Synchronised simulated time-series panels with estimates, W90, trust strip, controller mode and records"
                  onRelayout={onRelayout}
                  onClick={(e) => {
                    const p = e.points?.[0];
                    if (p && (p.data as { name?: string }).name === "Record") {
                      const idx = p.pointIndex;
                      const rec = figure.recs.filter((r) => r.time_min !== null)[idx];
                      if (rec) openSource({ doc_id: rec.doc_id, revision: "", section: "", title: rec.title });
                      return;
                    }
                    const m = clickToMinute(e);
                    if (m !== null) setTimeMin(m);
                  }}
                />
              ) : (
                <EmptyState title="Nothing selected" detail="Pick tags, model outputs or signals from the left to build 1–6 synchronised panels." />
              )}
            </div>
            <div className="card-foot row between">
              <span>
                Simulated data · click a point to move the shared time cursor · click a record ◆ to preview its source
              </span>
              {estQ.data?.note || rawQ.data?.note ? <span>{estQ.data?.note ?? rawQ.data?.note}</span> : null}
              {recQ.isError ? <span>Job records unavailable</span> : null}
            </div>
          </section>
        </div>
        <Card
          className="s-12"
          title="Job & Shift Record Track (H6)"
          sub="SHIFT logs placed at sim_window · WO / INC / MOC listed by date (never at an invented minute)"
        >
          {records.isLoading ? (
            <LoadingBlock height={140} label="Loading job and shift records" />
          ) : records.isError ? (
            <ErrorState error={records.error} onRetry={() => records.refetch()} />
          ) : (
            <div className="stack" style={{ gap: 16 }}>
              {/* Timeline-placed records */}
              <div className="stack" style={{ gap: 6 }}>
                <div className="row between">
                  <span style={{ fontWeight: 600, fontSize: "var(--fs-sm)" }}>
                    Shift Handover Logs on Timeline (sim_window)
                  </span>
                  <span className="muted mono" style={{ fontSize: "var(--fs-xs)" }}>
                    0 to {maxMinute} min ({clock(0)} to {clock(maxMinute)}) · {placedRecords.length} log(s)
                  </span>
                </div>

                {placedRecords.length === 0 ? (
                  <div className="muted" style={{ fontSize: "var(--fs-sm)", padding: "8px 0" }}>
                    No shift logs placed on this run&apos;s timeline.
                  </div>
                ) : (
                  <>
                    <div
                      style={{
                        position: "relative",
                        width: "100%",
                        minHeight: 76,
                        background: "var(--elevated)",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius-sm)",
                        padding: "8px 6px",
                        overflow: "hidden",
                      }}
                    >
                      {/* Cursor line */}
                      {timeMin !== null && timeMin >= 0 && timeMin <= maxMinute ? (
                        <div
                          style={{
                            position: "absolute",
                            left: `${(timeMin / maxMinute) * 100}%`,
                            top: 0,
                            bottom: 0,
                            width: 2,
                            background: "var(--accent)",
                            zIndex: 10,
                            pointerEvents: "none",
                            boxShadow: "0 0 6px var(--accent)",
                          }}
                        />
                      ) : null}

                      {placedRecords.map((rec) => {
                        const win = getSimWindow(rec)!;
                        const start = win[0];
                        const end = win[1];
                        const leftPct = Math.max(0, Math.min(100, (start / maxMinute) * 100));
                        const widthPct = Math.max(8, Math.min(100 - leftPct, ((end - start) / maxMinute) * 100));
                        const isCurrent = timeMin !== null && timeMin >= start && timeMin <= end;

                        return (
                          <div
                            key={rec.doc_id}
                            onClick={() => setTimeMin(start)}
                            title={`Click to move time cursor to t = ${start} (${clock(start)})`}
                            style={{
                              position: "absolute",
                              left: `${leftPct}%`,
                              width: `${widthPct}%`,
                              top: 8,
                              bottom: 8,
                              background: isCurrent
                                ? "color-mix(in srgb, var(--accent) 30%, var(--card))"
                                : "var(--card)",
                              border: isCurrent ? "1.5px solid var(--accent)" : "1px solid var(--border-strong)",
                              borderRadius: 6,
                              padding: "6px 8px",
                              cursor: "pointer",
                              display: "flex",
                              flexDirection: "column",
                              justifyContent: "space-between",
                              minWidth: 120,
                              zIndex: isCurrent ? 5 : 2,
                              transition: "border-color 0.15s ease, background 0.15s ease",
                            }}
                          >
                            <div className="row between" style={{ gap: 4 }}>
                              <span className="badge blue" style={{ fontSize: 9.5, padding: "1px 5px" }}>
                                {rec.doc_type}
                              </span>
                              <Link
                                href={`/knowledge/${encodeURIComponent(rec.doc_id)}`}
                                className="mono"
                                style={{
                                  fontSize: 11,
                                  fontWeight: 600,
                                  color: "var(--accent)",
                                  textDecoration: "none",
                                }}
                                onClick={(e) => e.stopPropagation()}
                                title={`Open ${rec.doc_id} in Knowledge`}
                              >
                                {rec.doc_id} ↗
                              </Link>
                            </div>
                            <div
                              style={{
                                fontSize: 11,
                                fontWeight: 500,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {rec.title}
                            </div>
                            <div className="muted mono" style={{ fontSize: 10 }}>
                              t {start}–{end} ({clock(start)}–{clock(end)})
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Time scale ticks */}
                    <div style={{ position: "relative", height: 16, width: "100%" }}>
                      {[0, 240, 480, 720, 960, 1200, 1440]
                        .filter((t) => t <= maxMinute)
                        .map((t) => {
                          const pct = (t / maxMinute) * 100;
                          return (
                            <span
                              key={t}
                              className="mono muted"
                              style={{
                                position: "absolute",
                                left: `${pct}%`,
                                transform:
                                  pct > 85
                                    ? "translateX(-100%)"
                                    : pct < 15
                                      ? "translateX(0)"
                                      : "translateX(-50%)",
                                fontSize: 10,
                              }}
                            >
                              {clock(t)}
                            </span>
                          );
                        })}
                    </div>
                  </>
                )}
              </div>

              {/* Date-listed records */}
              <div className="stack" style={{ gap: 8, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                <div className="row between">
                  <span style={{ fontWeight: 600, fontSize: "var(--fs-sm)" }}>
                    Historical Records by Date (WO · INC · MOC)
                  </span>
                  <span className="muted" style={{ fontSize: "var(--fs-xs)" }}>
                    Showing up to 8 records listed by date (no simulated minute)
                  </span>
                </div>

                {dateRecords.length === 0 ? (
                  <div className="muted" style={{ fontSize: "var(--fs-sm)" }}>
                    No date-listed records found.
                  </div>
                ) : (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                      gap: 8,
                    }}
                  >
                    {dateRecords.map((rec) => {
                      const typeCls =
                        rec.doc_type === "INC"
                          ? "amber"
                          : rec.doc_type === "MOC"
                            ? "red"
                            : rec.doc_type === "WO"
                              ? "blue"
                              : "neutral";
                      return (
                        <Link
                          key={rec.doc_id}
                          href={`/knowledge/${encodeURIComponent(rec.doc_id)}`}
                          style={{
                            padding: "8px 10px",
                            background: "var(--elevated)",
                            border: "1px solid var(--border)",
                            borderRadius: "var(--radius-sm)",
                            textDecoration: "none",
                            color: "inherit",
                            display: "flex",
                            flexDirection: "column",
                            gap: 3,
                            transition: "border-color 0.15s ease",
                          }}
                        >
                          <div className="row between" style={{ gap: 6 }}>
                            <span className={`badge ${typeCls}`} style={{ fontSize: 10, padding: "1px 5px" }}>
                              {rec.doc_type}
                            </span>
                            <span className="mono" style={{ fontWeight: 600, fontSize: 11.5 }}>
                              {rec.doc_id}
                            </span>
                            <span className="muted mono" style={{ fontSize: 10.5, marginLeft: "auto" }}>
                              {getEffectiveDate(rec)}
                            </span>
                          </div>
                          <div
                            style={{
                              fontSize: 11.5,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {rec.title}
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </Card>
        </>
      )}
    </div>
  );
}
