"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchJson, qs } from "@/lib/api";
import { useCockpit } from "@/lib/store";
import { propLabel, num } from "@/lib/format";
import { Card, PageHeader, QueryView, NoRun } from "@/components/ui/primitives";
import dynamic from "next/dynamic";
import { useMemo } from "react";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

interface LabRow {
  time_min: number;
  property: string;
  value: number;
  status: string;
  lims_time_min: number;
  recorded_draw_time_min: number;
  true_value: number;
  injected_error: string;
  status_reason: string;
  estimate_at_draw?: number;
  residual_F?: number;
}

interface LabData {
  run_id: string;
  reproducibility_F: number;
  labs: LabRow[];
  summary: {
    total: number;
    accepted: number;
    held: number;
    rejected: number;
    injected_errors: number;
  };
  provenance: any;
}

const useLabs = (runId: string | null) => 
  useQuery({
    queryKey: ["labs", runId],
    queryFn: () => fetchJson<LabData>(`/api/labs${qs({ run_id: runId })}`),
    enabled: !!runId
  });

function LabsChart({ data, property }: { data: LabData; property: string }) {
  const labs = data.labs.filter(l => l.property === property);
  
  const drawTimes = labs.map(l => l.time_min);
  const values = labs.map(l => l.value);
  const estimates = labs.map(l => l.estimate_at_draw);
  const truths = labs.map(l => l.true_value);
  
  const R = data.reproducibility_F;
  
  return (
    <Plot
      data={[
        {
          x: drawTimes,
          y: values,
          type: "scatter",
          mode: "markers",
          name: "Lab Draw",
          marker: { color: "#3b82f6", size: 8 }
        },
        {
          x: drawTimes,
          y: truths,
          type: "scatter",
          mode: "markers",
          name: "Simulator Truth",
          marker: { color: "#10b981", symbol: "x", size: 8 }
        },
        {
          x: drawTimes,
          y: estimates,
          type: "scatter",
          mode: "markers",
          name: "Soft-Sensor Estimate",
          error_y: {
            type: "constant",
            value: R / 2,
            visible: true,
            color: "#f59e0b"
          },
          marker: { color: "#f59e0b", size: 8 }
        }
      ]}
      layout={{
        autosize: true,
        height: 300,
        margin: { t: 10, r: 10, b: 30, l: 40 },
        legend: { orientation: "h", y: -0.2 }
      }}
      useResizeHandler
      style={{ width: "100%" }}
    />
  );
}

function StatusBadge({ status }: { status: string }) {
  const c = status === "ACCEPT" ? "green" : status === "HOLD" ? "amber" : status === "REJECT" ? "red" : "neutral";
  return <span className={`badge ${c}`}>{status}</span>;
}

export default function LabsView() {
  const runId = useCockpit((s) => s.runId);
  const q = useLabs(runId);

  return (
    <div className="page">
      <PageHeader
        title="Labs"
        question="Can we trust the lab data?"
      />
      {!runId ? (
        <Card><NoRun /></Card>
      ) : (
        <QueryView q={q}>
          {(d) => (
            <div className="stack">
              <div className="kpis grid">
                <Card className="s-2 s-md-4">
                  <div className="kpi-v">{d.summary.total}</div>
                  <div className="kpi-l">Total draws</div>
                </Card>
                <Card className="s-2 s-md-4">
                  <div className="kpi-v" style={{ color: "var(--green)" }}>{d.summary.accepted}</div>
                  <div className="kpi-l">Accepted</div>
                </Card>
                <Card className="s-2 s-md-4">
                  <div className="kpi-v" style={{ color: "var(--amber)" }}>{d.summary.held} / {d.summary.rejected}</div>
                  <div className="kpi-l">Held / Rejected</div>
                </Card>
                <Card className="s-2 s-md-4">
                  <div className="kpi-v">{d.reproducibility_F} °F</div>
                  <div className="kpi-l">Reproducibility (R)</div>
                </Card>
                <Card className="s-4 s-md-8">
                  <div className="kpi-v">{d.summary.injected_errors}</div>
                  <div className="kpi-l">Injected errors (simulator truth)</div>
                </Card>
              </div>

              <Card title="Lab Draws vs Simulator Truth and Soft-Sensor Estimate (LCO T98)">
                <LabsChart data={d} property="LCO_T98_F" />
              </Card>

              <Card title="Lab Draws vs Simulator Truth and Soft-Sensor Estimate (HN T98)">
                <LabsChart data={d} property="HN_T98_F" />
              </Card>

              <Card title="Detailed reconciliation table" bodyClass="p-0">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Draw time</th>
                      <th>LIMS arr</th>
                      <th>Property</th>
                      <th>Lab °F</th>
                      <th>SS Est °F</th>
                      <th>Residual</th>
                      <th>Status</th>
                      <th>Injected error (sim)</th>
                      <th>Agent rationale</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.labs.map((l, i) => (
                      <tr key={i}>
                        <td>{l.time_min}</td>
                        <td>{l.lims_time_min}</td>
                        <td>{propLabel(l.property)}</td>
                        <td>{num(l.value)}</td>
                        <td>{l.estimate_at_draw !== undefined ? num(l.estimate_at_draw) : "—"}</td>
                        <td>{l.residual_F !== undefined ? num(l.residual_F) : "—"}</td>
                        <td><StatusBadge status={l.status} /></td>
                        <td>{l.injected_error}</td>
                        <td className="muted">{l.status_reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </div>
          )}
        </QueryView>
      )}
    </div>
  );
}
