"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchJson, qs } from "@/lib/api";
import { useCockpit } from "@/lib/store";
import { Card, PageHeader, QueryView, NoRun } from "@/components/ui/primitives";
import dynamic from "next/dynamic";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

interface DQTag {
  tag: string;
  group: string;
  missing_pct: number;
  spike_count: number;
  out_of_range_count: number;
  status: string;
}

interface DQData {
  run_id: string;
  time_min: number[];
  t2: number[];
  t2_limit: number;
  spe: number[];
  spe_limit: number;
  tags: DQTag[];
  provenance: any;
}

const useDQ = (runId: string | null) => 
  useQuery({
    queryKey: ["dq", runId],
    queryFn: () => fetchJson<DQData>(`/api/dq${qs({ run_id: runId })}`),
    enabled: !!runId
  });

function StatusBadge({ status }: { status: string }) {
  const c = status === "OK" ? "green" : status === "WARN" ? "amber" : "red";
  return <span className={`badge ${c}`}>{status}</span>;
}

export default function DataQualityView() {
  const runId = useCockpit((s) => s.runId);
  const q = useDQ(runId);

  return (
    <div className="page">
      <PageHeader
        title="Data quality"
        question="Are the inputs healthy?"
      />
      {!runId ? (
        <Card><NoRun /></Card>
      ) : (
        <QueryView q={q}>
          {(d) => {
            const healthyTags = d.tags.filter(t => t.status === "OK").length;
            const flags = d.tags.filter(t => t.status !== "OK").length;
            
            const t2Max = Math.max(...d.t2.filter(v => v != null));
            const speMax = Math.max(...d.spe.filter(v => v != null));
            const noveltyStatus = t2Max > d.t2_limit || speMax > d.spe_limit ? "WARN" : "OK";

            return (
              <div className="stack">
                <div className="kpis grid">
                  <Card className="s-3 s-md-6">
                    <div className="kpi-v">{d.tags.length}</div>
                    <div className="kpi-l">Tags monitored</div>
                  </Card>
                  <Card className="s-3 s-md-6">
                    <div className="kpi-v" style={{ color: "var(--green)" }}>{healthyTags}</div>
                    <div className="kpi-l">Healthy tags</div>
                  </Card>
                  <Card className="s-3 s-md-6">
                    <div className="kpi-v" style={{ color: flags > 0 ? "var(--amber)" : "var(--green)" }}>{flags}</div>
                    <div className="kpi-l">Spike / Range flags</div>
                  </Card>
                  <Card className="s-3 s-md-6">
                    <div className="kpi-v"><StatusBadge status={noveltyStatus} /></div>
                    <div className="kpi-l">Novelty T² / SPE status</div>
                  </Card>
                </div>

                <div className="grid">
                  <Card className="s-6 s-md-12" title="Hotelling T² over time">
                    <Plot
                      data={[
                        {
                          x: d.time_min,
                          y: d.t2,
                          type: "scatter",
                          mode: "lines",
                          name: "T²",
                          line: { color: "#3b82f6" }
                        },
                        {
                          x: [d.time_min[0], d.time_min[d.time_min.length - 1]],
                          y: [d.t2_limit, d.t2_limit],
                          type: "scatter",
                          mode: "lines",
                          name: "Limit",
                          line: { color: "#ef4444", dash: "dash" }
                        }
                      ]}
                      layout={{ autosize: true, height: 250, margin: { t: 10, r: 10, b: 30, l: 40 }, showlegend: false }}
                      useResizeHandler
                      style={{ width: "100%" }}
                    />
                  </Card>

                  <Card className="s-6 s-md-12" title="Squared Prediction Error (SPE) over time">
                    <Plot
                      data={[
                        {
                          x: d.time_min,
                          y: d.spe,
                          type: "scatter",
                          mode: "lines",
                          name: "SPE",
                          line: { color: "#8b5cf6" }
                        },
                        {
                          x: [d.time_min[0], d.time_min[d.time_min.length - 1]],
                          y: [d.spe_limit, d.spe_limit],
                          type: "scatter",
                          mode: "lines",
                          name: "Limit",
                          line: { color: "#ef4444", dash: "dash" }
                        }
                      ]}
                      layout={{ autosize: true, height: 250, margin: { t: 10, r: 10, b: 30, l: 40 }, showlegend: false }}
                      useResizeHandler
                      style={{ width: "100%" }}
                    />
                  </Card>
                </div>

                <Card title="Tag Health" bodyClass="p-0">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Tag</th>
                        <th>Group</th>
                        <th>Missing %</th>
                        <th>Spike count</th>
                        <th>Out of range count</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.tags.map((t, i) => (
                        <tr key={i}>
                          <td>{t.tag}</td>
                          <td>{t.group}</td>
                          <td>{t.missing_pct}%</td>
                          <td>{t.spike_count}</td>
                          <td>{t.out_of_range_count}</td>
                          <td><StatusBadge status={t.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              </div>
            );
          }}
        </QueryView>
      )}
    </div>
  );
}
