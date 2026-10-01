"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Annotations, Data, Shape } from "plotly.js";
import Chart from "@/components/charts/Chart";
import { fetchJson, useRuns } from "@/lib/api";
import { clock, num, pct, propLabel, signed } from "@/lib/format";
import { axisStyle, baseLayout } from "@/lib/plotTheme";
import { useCockpit } from "@/lib/store";
import { FONT_MONO, MODEL_ORDER, STATUS, TOKENS, modelColor, modelLabel } from "@/lib/theme";
import {
  Card,
  EmptyState,
  ErrorState,
  GateBadge,
  GateBanner,
  LoadingBlock,
  NoRun,
  PageHeader,
} from "@/components/ui/primitives";
import { IconRefresh } from "@/components/ui/icons";

export interface WhatIfPropertyResult {
  members: Record<string, { mu: number; sigma: number; weight: number; admitted: boolean }>;
  mixture: {
    mean: number;
    q05: number;
    q50: number;
    q95: number;
    w90: number;
    bimodality_d: number;
    p_on_spec: number;
  };
  margin_to_spec_F: number;
  spec_max: number;
  gate: { status: "PASS" | "WITHHELD"; note: string };
}

export interface WhatIfResponse {
  run_id: string;
  time_min: number;
  baseline_inputs?: Record<string, number>;
  overrides: Record<string, number>;
  properties: Record<string, WhatIfPropertyResult>;
  note?: string;
}

interface OperatingInputConfig {
  key: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  def: number;
  desc: string;
}

const OPERATING_INPUTS: OperatingInputConfig[] = [
  {
    key: "Tr_riser_F",
    label: "Riser Temperature",
    unit: "°F",
    min: 950,
    max: 985,
    step: 0.5,
    def: 969.0,
    desc: "Primary riser cracking temperature",
  },
  {
    key: "dist_feed_API",
    label: "Feed Density",
    unit: "°API",
    min: 20,
    max: 29,
    step: 0.2,
    def: 25.0,
    desc: "Distillate feed API gravity",
  },
  {
    key: "feed_flow_lb_s",
    label: "Feed Flow Rate",
    unit: "lb/s",
    min: 145,
    max: 185,
    step: 1.0,
    def: 165.0,
    desc: "Total feed mass flow rate",
  },
  {
    key: "T_tray13_F",
    label: "Tray 13 Temperature",
    unit: "°F",
    min: 455,
    max: 495,
    step: 0.5,
    def: 476.4,
    desc: "Main fractionator LCO draw tray",
  },
  {
    key: "T_tray06_F",
    label: "Tray 6 Temperature",
    unit: "°F",
    min: 345,
    max: 385,
    step: 0.5,
    def: 363.4,
    desc: "Main fractionator heavy naphtha tray",
  },
];

function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
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

interface WhatIfComparisonChartProps {
  baseProp: WhatIfPropertyResult;
  whatProp: WhatIfPropertyResult;
  property: string;
}

function WhatIfComparisonChart({ baseProp, whatProp, property }: WhatIfComparisonChartProps) {
  const theme = useCockpit((s) => s.theme);

  const { data, layout } = useMemo(() => {
    const t = TOKENS[theme];
    const traces: Data[] = [];

    // Rows order: Mixture on top (row 0), followed by members (rows 1-4)
    const rows = [
      { id: "mixture", label: "Mixture", isMixture: true },
      ...MODEL_ORDER.map((id) => ({ id, label: modelLabel(id), isMixture: false })),
    ];

    const baseCenters: number[] = [];
    const baseErrPlus: number[] = [];
    const baseErrMinus: number[] = [];
    const baseCustom: string[] = [];

    const whatCenters: number[] = [];
    const whatErrPlus: number[] = [];
    const whatErrMinus: number[] = [];
    const whatCustom: string[] = [];
    const whatColors: string[] = [];

    rows.forEach((row, i) => {
      let bC = 0;
      let bP = 0;
      let bM = 0;
      let bTxt = "";

      let wC = 0;
      let wP = 0;
      let wM = 0;
      let wTxt = "";
      const color = row.isMixture ? t.text : (modelColor(row.id, theme) as string);

      if (row.isMixture) {
        const bMix = baseProp.mixture;
        const wMix = whatProp.mixture;
        bC = bMix.q50;
        bP = bMix.q95 - bMix.q50;
        bM = bMix.q50 - bMix.q05;
        bTxt = `Mixture · Baseline<br>P50: ${bMix.q50.toFixed(1)} °F (Mean ${bMix.mean.toFixed(1)} °F)<br>90% Interval: ${bMix.q05.toFixed(1)} – ${bMix.q95.toFixed(1)} °F<br>W90: ${bMix.w90.toFixed(1)} °F<br>P(on-spec): ${(bMix.p_on_spec * 100).toFixed(1)}%`;

        wC = wMix.q50;
        wP = wMix.q95 - wMix.q50;
        wM = wMix.q50 - wMix.q05;
        const delta = wMix.q50 - bMix.q50;
        wTxt = `Mixture · What-If<br>P50: ${wMix.q50.toFixed(1)} °F (Δ ${signed(delta, 2)} °F)<br>Mean: ${wMix.mean.toFixed(1)} °F<br>90% Interval: ${wMix.q05.toFixed(1)} – ${wMix.q95.toFixed(1)} °F<br>W90: ${wMix.w90.toFixed(1)} °F<br>P(on-spec): ${(wMix.p_on_spec * 100).toFixed(1)}%<br>Margin: ${num(whatProp.margin_to_spec_F)} °F`;
      } else {
        const bMem = baseProp.members[row.id] ?? { mu: 0, sigma: 0, weight: 0, admitted: true };
        const wMem = whatProp.members[row.id] ?? { mu: 0, sigma: 0, weight: 0, admitted: true };
        bC = bMem.mu;
        bP = bMem.sigma;
        bM = bMem.sigma;
        bTxt = `${modelLabel(row.id)} · Baseline<br>μ: ${bMem.mu.toFixed(1)} °F<br>σ: ${bMem.sigma.toFixed(1)} °F (±1σ: ${(bMem.mu - bMem.sigma).toFixed(1)}–${(bMem.mu + bMem.sigma).toFixed(1)} °F)<br>Weight: ${bMem.weight.toFixed(4)}${!bMem.admitted ? " (shadow)" : ""}`;

        wC = wMem.mu;
        wP = wMem.sigma;
        wM = wMem.sigma;
        const delta = wMem.mu - bMem.mu;
        wTxt = `${modelLabel(row.id)} · What-If<br>μ: ${wMem.mu.toFixed(1)} °F (Δ ${signed(delta, 2)} °F)<br>σ: ${wMem.sigma.toFixed(1)} °F (±1σ: ${(wMem.mu - wMem.sigma).toFixed(1)}–${(wMem.mu + wMem.sigma).toFixed(1)} °F)<br>Weight: ${wMem.weight.toFixed(4)}${!wMem.admitted ? " (shadow)" : ""}`;
      }

      baseCenters.push(bC);
      baseErrPlus.push(bP);
      baseErrMinus.push(bM);
      baseCustom.push(bTxt);

      whatCenters.push(wC);
      whatErrPlus.push(wP);
      whatErrMinus.push(wM);
      whatCustom.push(wTxt);
      whatColors.push(color);

      // Connector line showing delta between baseline and what-if
      traces.push({
        type: "scatter",
        mode: "lines",
        x: [bC, wC],
        y: [i - 0.16, i + 0.16],
        line: { color, width: 1.5, dash: "dot" },
        showlegend: false,
        hoverinfo: "skip",
      });
    });

    const yVals = rows.map((_, i) => i);

    // Baseline trace
    traces.push({
      name: "Baseline (μ ± σ / Q05–Q95)",
      type: "scatter",
      mode: "markers",
      x: baseCenters,
      y: yVals.map((y) => y - 0.16),
      marker: {
        size: 9,
        color: t.card,
        line: { width: 2, color: t.muted },
        symbol: "circle",
      },
      error_x: {
        type: "data",
        symmetric: false,
        array: baseErrPlus,
        arrayminus: baseErrMinus,
        color: t.muted,
        thickness: 1.5,
        width: 6,
      },
      customdata: baseCustom,
      hovertemplate: "%{customdata}<extra></extra>",
    });

    // What-If trace
    traces.push({
      name: "What-If (μ ± σ / Q05–Q95)",
      type: "scatter",
      mode: "text+markers",
      x: whatCenters,
      y: yVals.map((y) => y + 0.16),
      text: whatCenters.map((x) => `${num(x)} °F`),
      textposition: "top center",
      textfont: { size: 10, family: FONT_MONO, color: t.muted },
      marker: {
        size: 10,
        color: whatColors,
        symbol: "circle",
        line: { width: 1.5, color: t.text },
      },
      error_x: {
        type: "data",
        symmetric: false,
        array: whatErrPlus,
        arrayminus: whatErrMinus,
        color: t.text,
        thickness: 2,
        width: 6,
      },
      customdata: whatCustom,
      hovertemplate: "%{customdata}<extra></extra>",
    });

    const specMax = baseProp.spec_max;
    const shapes: Partial<Shape>[] = [
      {
        type: "line",
        xref: "x",
        yref: "paper",
        x0: specMax,
        x1: specMax,
        y0: 0,
        y1: 1,
        line: { color: STATUS.RED, width: 1.5, dash: "dash" },
      },
    ];

    const annotations: Partial<Annotations>[] = [
      {
        xref: "x",
        yref: "paper",
        x: specMax,
        y: 1.02,
        yanchor: "bottom",
        xanchor: "center",
        text: `spec ${num(specMax)} °F`,
        showarrow: false,
        font: { size: 11, color: STATUS.RED, family: FONT_MONO },
        bgcolor: t.card,
      },
    ];

    const layout = baseLayout(theme, {
      margin: { l: 150, r: 24, t: 36, b: 36 },
      hovermode: "closest",
      xaxis: {
        ...axisStyle(theme),
        title: { text: "Predicted Temperature (°F)", font: { size: 11, color: t.muted } },
        showspikes: true,
        spikemode: "across",
        spikecolor: t.muted,
        spikedash: "dot",
        spikethickness: 1,
      },
      yaxis: {
        ...axisStyle(theme),
        tickvals: [0, 1, 2, 3, 4],
        ticktext: [
          "Mixture (Q05–Q95)",
          "Hybrid delta (±1σ)",
          "PINN ensemble (±1σ)",
          "GPR (±1σ)",
          "Bayesian ridge (±1σ)",
        ],
        autorange: "reversed",
        range: [-0.6, 4.6],
        zeroline: false,
        showgrid: true,
      },
      legend: {
        ...baseLayout(theme).legend,
        orientation: "h",
        x: 0,
        y: 1.12,
        xanchor: "left",
        yanchor: "bottom",
        font: { size: 11, color: t.text },
      },
      shapes,
      annotations,
    });

    return { data: traces, layout };
  }, [baseProp, whatProp, theme]);

  return (
    <Chart
      data={data}
      layout={layout}
      height={370}
      ariaLabel={`Comparison chart of baseline vs what-if member and mixture predictions for ${propLabel(property)}`}
    />
  );
}

export default function WhatIfView() {
  const runId = useCockpit((s) => s.runId);
  const property = useCockpit((s) => s.property);
  const timeMin = useCockpit((s) => s.timeMin);
  const theme = useCockpit((s) => s.theme);

  const runs = useRuns();
  const run = runs.data?.find((r) => r.run_id === runId);

  // Overrides state: map of tag -> overridden value
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const debouncedOverrides = useDebounce(overrides, 180);

  // Reset overrides when switching run or minute
  useEffect(() => {
    setOverrides({});
  }, [runId, timeMin]);

  // Query baseline what-if (overrides: {})
  const baselineQuery = useQuery({
    queryKey: ["whatif", "baseline", runId, property, timeMin],
    queryFn: () =>
      fetchJson<WhatIfResponse>("/api/whatif", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ run_id: runId, time_min: timeMin, property, overrides: {} }),
      }),
    enabled: !!runId,
  });

  const hasOverrides = Object.keys(debouncedOverrides).length > 0;

  // Query perturbed what-if with active overrides
  const whatifQuery = useQuery({
    queryKey: ["whatif", "perturbed", runId, property, timeMin, debouncedOverrides],
    queryFn: () =>
      fetchJson<WhatIfResponse>("/api/whatif", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ run_id: runId, time_min: timeMin, property, overrides: debouncedOverrides }),
      }),
    enabled: !!runId && hasOverrides,
  });

  const baseData = baselineQuery.data;
  const whatData = hasOverrides ? whatifQuery.data : baseData;

  const baseProp = baseData?.properties?.[property] ?? (baseData ? Object.values(baseData.properties)[0] : undefined);
  const whatProp = whatData?.properties?.[property] ?? (whatData ? Object.values(whatData.properties)[0] : undefined);

  // Baseline input defaults
  const baselineInputs = baseData?.baseline_inputs ?? {};

  const handleOverrideChange = (key: string, val: number) => {
    const baseVal = baselineInputs[key] ?? OPERATING_INPUTS.find((i) => i.key === key)?.def ?? val;
    setOverrides((prev) => {
      if (Math.abs(val - baseVal) < 1e-5) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: val };
    });
  };

  const handleReset = () => {
    setOverrides({});
  };

  const isCalculating = hasOverrides && whatifQuery.isFetching;

  // Calculations for KPIs
  const baseMix = baseProp?.mixture;
  const whatMix = whatProp?.mixture;

  const deltaP50 = baseMix && whatMix ? whatMix.q50 - baseMix.q50 : 0;
  const deltaW90 = baseMix && whatMix ? whatMix.w90 - baseMix.w90 : 0;
  const deltaPonSpec = baseMix && whatMix ? (whatMix.p_on_spec - baseMix.p_on_spec) * 100 : 0;
  const deltaMargin = baseProp && whatProp ? whatProp.margin_to_spec_F - baseProp.margin_to_spec_F : 0;

  return (
    <div className="page">
      {whatProp?.gate.status === "WITHHELD" ? (
        <GateBanner
          message={
            whatProp.gate.note
              ? `${whatProp.gate.note} — instantaneous spread gate triggered under perturbed operating conditions.`
              : "Instantaneous spread gate triggered under perturbed operating conditions."
          }
        />
      ) : null}

      <PageHeader
        title={`What-If Explorer · ${propLabel(property)}`}
        question="How would committee estimates and spread gate respond to operating changes?"
        actions={run ? <MinutePicker max={run.n_minutes} /> : null}
      />

      {!runId && !runs.isLoading ? (
        <Card>
          <NoRun />
        </Card>
      ) : baselineQuery.isLoading ? (
        <LoadingBlock height={420} label="Loading baseline model state" />
      ) : baselineQuery.isError ? (
        <ErrorState error={baselineQuery.error} onRetry={() => baselineQuery.refetch()} />
      ) : !baseProp || !whatProp ? (
        <Card>
          <EmptyState
            title="No what-if data available"
            detail="The final trained committee models may not be available for this run."
          />
        </Card>
      ) : (
        <>
          {/* Comparison KPI Row */}
          <div className="kpis" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
            {/* KPI 1: Mixture P50 / Mean */}
            <div className="card kpi">
              <div className="kpi-top">
                <span className="kpi-label">Mixture P50</span>
                {hasOverrides ? (
                  <span
                    className={`badge ${deltaP50 > 0 ? "amber" : deltaP50 < 0 ? "green" : "neutral"}`}
                    style={{ fontSize: 10.5 }}
                  >
                    Δ {signed(deltaP50)} °F
                  </span>
                ) : null}
              </div>
              <div className="kpi-value">
                {num(whatMix?.q50)} °F
                <small style={{ fontSize: 12 }}>mean {num(whatMix?.mean)}</small>
              </div>
              <div className="kpi-note">
                Baseline: {num(baseMix?.q50)} °F (mean {num(baseMix?.mean)} °F)
              </div>
            </div>

            {/* KPI 2: 90% Interval Width W90 */}
            <div className="card kpi">
              <div className="kpi-top">
                <span className="kpi-label">Spread W90</span>
                <span
                  className={`badge ${(whatMix?.w90 ?? 0) > 14.0 ? "red" : "green"}`}
                  style={{ fontSize: 10.5 }}
                >
                  {(whatMix?.w90 ?? 0) <= 14.0 ? "PASS (≤14°F)" : "WIDE (>14°F)"}
                </span>
              </div>
              <div className="kpi-value">
                {num(whatMix?.w90)} °F
                {hasOverrides ? (
                  <small
                    className="mono"
                    style={{
                      fontSize: 13,
                      color: deltaW90 > 0 ? "var(--amber)" : "var(--muted)",
                    }}
                  >
                    ({signed(deltaW90)} °F)
                  </small>
                ) : null}
              </div>
              <div className="kpi-note">
                Baseline: {num(baseMix?.w90)} °F · Limit ≤ 14.0 °F
              </div>
            </div>

            {/* KPI 3: P(on-spec) */}
            <div className="card kpi">
              <div className="kpi-top">
                <span className="kpi-label">P(on-spec)</span>
                {hasOverrides ? (
                  <span
                    className={`badge ${deltaPonSpec >= 0 ? "green" : "amber"}`}
                    style={{ fontSize: 10.5 }}
                  >
                    {signed(deltaPonSpec, 1)}%
                  </span>
                ) : null}
              </div>
              <div className="kpi-value">
                {pct(whatMix?.p_on_spec, 1)}
                <small style={{ fontSize: 12 }}>target ≥ 90%</small>
              </div>
              <div className="kpi-note">
                Baseline: {pct(baseMix?.p_on_spec, 1)}
              </div>
            </div>

            {/* KPI 4: Margin to Spec */}
            <div className="card kpi">
              <div className="kpi-top">
                <span className="kpi-label">Margin to Spec</span>
                {hasOverrides ? (
                  <span className="badge neutral" style={{ fontSize: 10.5 }}>
                    Δ {signed(deltaMargin)} °F
                  </span>
                ) : null}
              </div>
              <div className="kpi-value">
                {num(whatProp.margin_to_spec_F)} °F
                <small style={{ fontSize: 12 }}>to {num(whatProp.spec_max)} °F</small>
              </div>
              <div className="kpi-note">
                Baseline: {num(baseProp.margin_to_spec_F)} °F (spec {num(baseProp.spec_max)} °F)
              </div>
            </div>

            {/* KPI 5: Instantaneous Spread Gate */}
            <div className="card kpi">
              <div className="kpi-top">
                <span className="kpi-label">Spread Gate</span>
                <span className="muted" style={{ fontSize: 10.5 }}>
                  instantaneous
                </span>
              </div>
              <div className="kpi-value" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <GateBadge status={whatProp.gate.status} />
              </div>
              <div className="kpi-note">
                {whatProp.gate.note} · baseline {baseProp.gate.status}
              </div>
            </div>
          </div>

          {/* Main Grid: Chart + Sliders */}
          <div className="grid">
            <Card
              className="s-8 s-md-12"
              title="Predictive Committee Estimates: Baseline vs. What-If"
              sub={`Selected minute t = ${baseData?.time_min ?? 0} (${clock(baseData?.time_min ?? 0)}) · spec limit ${num(baseProp.spec_max)} °F`}
              actions={
                isCalculating ? (
                  <span className="muted mono" style={{ fontSize: 11 }}>
                    Updating...
                  </span>
                ) : null
              }
            >
              <WhatIfComparisonChart baseProp={baseProp} whatProp={whatProp} property={property} />
            </Card>

            <Card
              className="s-4 s-md-12"
              title="Operating Input Overrides"
              sub="Perturb inputs to re-evaluate committee models"
              actions={
                <button
                  type="button"
                  className="btn sm"
                  onClick={handleReset}
                  disabled={!hasOverrides}
                  title="Reset all operating inputs to baseline values"
                >
                  <IconRefresh /> Reset
                </button>
              }
            >
              <div className="stack" style={{ gap: 18 }}>
                {OPERATING_INPUTS.map((inp) => {
                  const baseVal = baselineInputs[inp.key] ?? inp.def;
                  const currentVal = overrides[inp.key] ?? baseVal;
                  const isModified = inp.key in overrides;
                  const delta = currentVal - baseVal;

                  return (
                    <div key={inp.key} className="stack" style={{ gap: 4 }}>
                      <div className="row between">
                        <div>
                          <span style={{ fontWeight: 600, fontSize: "var(--fs-sm)" }}>{inp.label}</span>
                          <span className="muted mono" style={{ fontSize: "var(--fs-xs)", marginLeft: 6 }}>
                            {inp.key}
                          </span>
                        </div>
                        <div className="row" style={{ gap: 6 }}>
                          <span className="mono" style={{ fontWeight: 600, fontSize: "var(--fs-md)" }}>
                            {num(currentVal, inp.step < 1 ? 1 : 0)} {inp.unit}
                          </span>
                          {isModified ? (
                            <span
                              className="badge amber"
                              style={{ fontSize: 10, padding: "1px 6px" }}
                              title={`Baseline: ${num(baseVal, inp.step < 1 ? 1 : 0)} ${inp.unit}`}
                            >
                              {signed(delta, inp.step < 1 ? 1 : 0)}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="row" style={{ gap: 8, width: "100%" }}>
                        <span className="muted mono" style={{ fontSize: 10.5, minWidth: 32 }}>
                          {inp.min}
                        </span>
                        <input
                          type="range"
                          className="slider"
                          min={inp.min}
                          max={inp.max}
                          step={inp.step}
                          value={currentVal}
                          onChange={(e) => handleOverrideChange(inp.key, Number(e.target.value))}
                          aria-label={`${inp.label} slider`}
                        />
                        <span className="muted mono" style={{ fontSize: 10.5, minWidth: 32, textAlign: "right" }}>
                          {inp.max}
                        </span>
                        <input
                          type="number"
                          className="input mono"
                          style={{ width: 74, height: 28, fontSize: 12, textAlign: "right" }}
                          min={inp.min}
                          max={inp.max}
                          step={inp.step}
                          value={currentVal}
                          onChange={(e) => handleOverrideChange(inp.key, Number(e.target.value))}
                          aria-label={`${inp.label} numeric input`}
                        />
                      </div>
                      <div className="muted" style={{ fontSize: 11 }}>
                        {inp.desc}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* Committee Member Breakdown Table */}
            <Card
              className="s-12"
              title="Committee Member Breakdown"
              sub="Individual model predictions, weights, and response deltas under what-if conditions"
              bodyClass="flush"
            >
              <div className="table-wrap">
                <table className="t">
                  <thead>
                    <tr>
                      <th>Model</th>
                      <th>Status</th>
                      <th className="r">Weight</th>
                      <th className="r">Baseline μ ± σ (°F)</th>
                      <th className="r">What-If μ ± σ (°F)</th>
                      <th className="r">Δμ (°F)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {MODEL_ORDER.map((id) => {
                      const baseM = baseProp.members[id];
                      const whatM = whatProp.members[id];
                      if (!baseM || !whatM) return null;
                      const delta = whatM.mu - baseM.mu;
                      const inactive = !whatM.admitted;
                      return (
                        <tr key={id} className={inactive ? "shadow" : ""}>
                          <td style={{ whiteSpace: "nowrap" }}>
                            <span
                              className="swatch"
                              style={{
                                background: inactive ? "var(--subtle)" : (modelColor(id, theme) as string),
                              }}
                            />
                            <span style={{ fontWeight: 500 }}>{modelLabel(id)}</span>
                          </td>
                          <td>
                            <span className={`badge ${whatM.admitted ? "green" : "neutral"}`}>
                              {whatM.admitted ? "admitted" : "shadow"}
                            </span>
                          </td>
                          <td className="r mono">{num(whatM.weight, 4)}</td>
                          <td className="r mono">
                            {num(baseM.mu)} ± {num(baseM.sigma)}
                          </td>
                          <td className="r mono">
                            {num(whatM.mu)} ± {num(whatM.sigma)}
                          </td>
                          <td className="r mono">
                            <span
                              style={{
                                color: delta > 0 ? "var(--amber)" : delta < 0 ? "var(--accent)" : "inherit",
                              }}
                            >
                              {signed(delta, 2)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="total">
                      <td style={{ whiteSpace: "nowrap" }}>
                        <span className="swatch" style={{ background: TOKENS[theme].text }} />
                        <strong>Mixture</strong>
                      </td>
                      <td>
                        <GateBadge status={whatProp.gate.status} />
                      </td>
                      <td className="r mono">1.0000</td>
                      <td className="r mono">
                        P50 {num(baseMix?.q50)} [{num(baseMix?.q05)}–{num(baseMix?.q95)}]
                      </td>
                      <td className="r mono">
                        P50 {num(whatMix?.q50)} [{num(whatMix?.q05)}–{num(whatMix?.q95)}]
                      </td>
                      <td className="r mono">
                        <strong>{signed(deltaP50, 2)}</strong>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <div className="bimodal-row">
                <span className="muted">Bimodality score D</span>
                <span className={`badge ${(whatMix?.bimodality_d ?? 0) > 1.2 ? "amber" : "green"}`}>
                  D {num(whatMix?.bimodality_d, 2)} —{" "}
                  {(whatMix?.bimodality_d ?? 0) > 1.2
                    ? "bimodal distribution (committee disagreement)"
                    : "unimodal distribution (committee consensus)"}
                </span>
              </div>
              <div className="bimodal-row" style={{ paddingBottom: 10 }}>
                <span className="muted">State</span>
                <span className="mono muted">
                  {hasOverrides
                    ? `${Object.keys(overrides).length} input override(s) active · steady-state EWMA assumption`
                    : "Operating at baseline simulation state"}
                </span>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
