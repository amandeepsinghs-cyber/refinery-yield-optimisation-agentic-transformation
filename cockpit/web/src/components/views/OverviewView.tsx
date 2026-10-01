"use client";

import { useState } from "react";
import {
  useEstimate,
  useEstimatesTimeseries,
  useModels,
  useOverview,
  useRecommendations,
  useRuns,
} from "@/lib/api";
import { dataSpan, num, pct, propLabel, spanLabel } from "@/lib/format";
import { parseData, streamSSE } from "@/lib/sse";
import { useCockpit } from "@/lib/store";
import { MODEL_ORDER, STATUS } from "@/lib/theme";
import { FanChart } from "@/components/charts/EstimateCharts";
import Markdown from "@/components/copilot/Markdown";
import { usePageContext } from "@/components/copilot/useCopilotChat";
import {
  Card,
  Citations,
  EmptyState,
  ErrorState,
  GateBanner,
  LoadingBlock,
  NoRun,
  PageHeader,
  QueryView,
  Skeleton,
  Sparkline,
} from "@/components/ui/primitives";
import { IconSpark } from "@/components/ui/icons";
import { RecCard, WithheldCard } from "@/components/decision/RecCards";
import type { Citation, Overview } from "@/lib/types";
import Link from "next/link";

function Kpi({ label, value, sub, extra, spark }: { label: string; value: React.ReactNode; sub?: React.ReactNode; extra?: React.ReactNode; spark?: React.ReactNode }) {
  return (
    <div className="card kpi">
      <div className="kpi-top">
        <span className="kpi-label">{label}</span>
        {spark}
      </div>
      <div className="kpi-value">{value}</div>
      {extra}
      {sub ? <div className="kpi-note">{sub}</div> : null}
    </div>
  );
}

function TrustMix({ mix }: { mix: Overview["kpis"]["trust_mix"] }) {
  const g = mix.GREEN ?? 0;
  const a = mix.AMBER ?? 0;
  const r = mix.RED ?? 0;
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="mixbar" role="img" aria-label={`Trust mix: green ${pct(g)}, amber ${pct(a)}, red ${pct(r)}`}>
        <span style={{ width: `${g * 100}%`, background: STATUS.GREEN }}>{g > 0.15 ? pct(g) : ""}</span>
        <span style={{ width: `${a * 100}%`, background: STATUS.AMBER }}>{a > 0.1 ? pct(a) : ""}</span>
        <span style={{ width: `${r * 100}%`, background: STATUS.RED }}>{r > 0.1 ? pct(r) : ""}</span>
      </div>
      <div className="mix-legend">
        <span>
          green <b>{pct(g)}</b>
        </span>
        <span>
          amber <b>{pct(a)}</b>
        </span>
        <span>
          red <b>{pct(r)}</b>
        </span>
      </div>
    </div>
  );
}

function KpiRow({ ov, w90, w90Limit }: { ov: Overview; w90?: (number | null)[]; w90Limit?: number }) {
  const k = ov.kpis;
  const vsTruth = k.rmse_vs_lab === null ? (k.rmse_vs_truth ?? null) : null;
  const rmse = k.rmse_vs_lab ?? vsTruth;
  const rmseOk = rmse !== null && k.rmse_target !== null && rmse <= k.rmse_target;
  const covOk = k.coverage90 !== null && k.coverage90 >= 0.85 && k.coverage90 <= 0.95;
  return (
    <div className="kpis">
      <Kpi
        label={vsTruth !== null ? "RMSE vs simulator truth" : "RMSE vs lab"}
        value={
          <>
            {num(rmse)} °F<small>target ≤ {num(k.rmse_target)}</small>
          </>
        }
        sub={
          rmse === null
            ? "No accepted labs yet"
            : `${rmseOk ? "✓ within target" : "✕ above target"}${vsTruth !== null ? " · no accepted labs" : ""}`
        }
      />
      <Kpi label="90% interval coverage" value={pct(k.coverage90)} sub={k.coverage90 === null ? "—" : covOk ? "✓ in 85–95% band" : "✕ outside 85–95% band"} />
      <Kpi label="Trust mix" value={null} extra={<TrustMix mix={k.trust_mix} />} />
      <Kpi label="Validated-estimate availability" value={pct(k.availability)} sub="Share of minutes with a validated estimate" />
      <Kpi
        label="Recommendations accepted"
        value={
          <>
            {k.recs_accepted}
            <small>of {k.recs_total}</small>
          </>
        }
        sub="Recorded decisions this run"
      />
      <Kpi
        label="Withheld — spread too wide"
        value={k.withheld}
        sub="Gate WITHHELD records"
        spark={w90 ? <Sparkline values={w90} limit={w90Limit} color="var(--amber)" label="W90 over the window versus limit" /> : null}
      />
    </div>
  );
}

function generateMarkdownReport({
  runId,
  batch,
  property,
  ov,
  models,
  recs,
  narrative,
}: {
  runId: string;
  batch: string;
  property: string;
  ov: Overview | undefined;
  models: ReturnType<typeof useModels>["data"];
  recs: ReturnType<typeof useRecommendations>["data"];
  narrative: string;
}): string {
  const k = ov?.kpis;
  const targetLabel = propLabel(property);
  const vsTruth = k?.rmse_vs_lab === null ? (k?.rmse_vs_truth ?? null) : null;
  const rmse = k?.rmse_vs_lab ?? vsTruth;
  const g = k?.trust_mix?.GREEN ?? 0;
  const a = k?.trust_mix?.AMBER ?? 0;
  const r = k?.trust_mix?.RED ?? 0;

  const openRecs = (recs ?? []).filter((x) => x.status === "OPEN");
  const withheldRecs = (recs ?? []).filter((x) => x.status === "WITHHELD");

  const lines: string[] = [
    `# FCC Soft-Sensor Technical Demo Report (SIMULATED DATA)`,
    ``,
    `**Provenance:** SIMULATED DATA · Batch: ${batch} · Run ID: ${runId} · Target: ${targetLabel} · Advisory Only (No DCS Write Path)`,
    `**Generated:** ${new Date().toISOString()}`,
    ``,
    `---`,
    ``,
    `## 1. Technical KPIs`,
    `- **RMSE vs ${vsTruth !== null ? "Simulator Truth" : "Lab"}:** ${rmse !== null && rmse !== undefined ? `${num(rmse)} °F` : "—"} (Target: ≤ ${k?.rmse_target !== null && k?.rmse_target !== undefined ? `${num(k?.rmse_target)} °F` : "1.5R"})`,
    `- **90% Interval Coverage:** ${pct(k?.coverage90)} (Target: 85–95%)`,
    `- **Validated Estimate Availability:** ${pct(k?.availability)}`,
    `- **Trust Mix:** GREEN: ${pct(g)}, AMBER: ${pct(a)}, RED: ${pct(r)}`,
    `- **Recommendations Accepted:** ${k?.recs_accepted ?? 0} of ${k?.recs_total ?? 0}`,
    `- **Withheld for Spread Gate:** ${k?.withheld ?? 0}`,
    ``,
    `---`,
    ``,
    `## 2. Decision & Spread-Gate Summary`,
    `### Active Recommendations (${openRecs.length})`,
  ];

  if (openRecs.length) {
    lines.push(`| ID | Property | Action | Set Point (Before → After) | P(on-spec) | Trust | W90 |`);
    lines.push(`| --- | --- | --- | --- | --- | --- | --- |`);
    openRecs.forEach((rec) => {
      lines.push(
        `| ${rec.rec_id} | ${propLabel(rec.property)} | ${rec.action} | ${num(rec.sp_before)} → ${num(rec.sp_after)} °F | ${pct(rec.p_on_spec_after)} | ${rec.trust} | ${num(rec.gate?.w90)} °F |`
      );
    });
  } else {
    lines.push(`No active recommendations currently open.`);
  }

  lines.push(``);
  lines.push(`### Withheld Decisions (${withheldRecs.length})`);
  if (withheldRecs.length) {
    lines.push(`| ID | Minute | Property | Reason / Gate Message | Trust |`);
    lines.push(`| --- | --- | --- | --- | --- |`);
    withheldRecs.slice(0, 10).forEach((rec) => {
      lines.push(
        `| ${rec.rec_id} | t ${rec.time_min} | ${propLabel(rec.property)} | ${rec.gate?.message ?? "Withheld by spread gate"} | ${rec.trust} |`
      );
    });
  } else {
    lines.push(`No decisions withheld for spread in this run.`);
  }

  lines.push(``);
  lines.push(`---`);
  lines.push(``);
  lines.push(`## 3. Model Committee Summary (${targetLabel})`);
  if (models?.models?.length) {
    lines.push(`| Model Family | Status | Weight | RMSE (°F) | 90% Coverage | CRPS |`);
    lines.push(`| --- | --- | --- | --- | --- | --- |`);
    [...models.models]
      .sort((m1, m2) => MODEL_ORDER.indexOf(m1.model_id) - MODEL_ORDER.indexOf(m2.model_id))
      .forEach((m) => {
        lines.push(
          `| ${m.label} (\`${m.model_id}\`) | ${m.status} | ${num(m.weight, 2)} | ${num(m.rmse, 2)} | ${m.coverage90 === null ? "—" : pct(m.coverage90)} | ${num(m.crps, 2)} |`
        );
      });
    if (models.mixture) {
      lines.push(
        `| **Mixture** | **active** | 1.00 | ${num(models.mixture.rmse, 2)} | ${models.mixture.coverage90 === null ? "—" : pct(models.mixture.coverage90)} | ${num(models.mixture.crps, 2)} |`
      );
    }
  } else {
    lines.push(`Model committee metrics not loaded.`);
  }

  lines.push(``);
  lines.push(`---`);
  lines.push(``);
  lines.push(`## 4. Period Narrative`);
  lines.push(narrative || ov?.note || "Technical evaluation based on simulated DCS streaming data.");
  lines.push(``);

  return lines.join("\n");
}

function downloadReportFile(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function DemoReportCard({
  runId,
  batch,
  property,
  ov,
  models,
  recs,
  narrative,
  onClose,
}: {
  runId: string;
  batch: string;
  property: string;
  ov: Overview | undefined;
  models: ReturnType<typeof useModels>["data"];
  recs: ReturnType<typeof useRecommendations>["data"];
  narrative: string;
  onClose: () => void;
}) {
  const k = ov?.kpis;
  const vsTruth = k?.rmse_vs_lab === null ? (k?.rmse_vs_truth ?? null) : null;
  const rmse = k?.rmse_vs_lab ?? vsTruth;
  const openRecs = (recs ?? []).filter((r) => r.status === "OPEN");
  const withheldRecs = (recs ?? []).filter((r) => r.status === "WITHHELD");

  const effectiveNarrative =
    narrative ||
    ov?.note ||
    `Operational evaluation on simulated run ${runId} for target ${propLabel(
      property
    )}. Technical accuracy target is ${
      rmse !== null && k && k.rmse_target !== null && rmse <= k.rmse_target ? "satisfied" : "monitored"
    }. Committee distribution spread supervised by W90 gate.`;

  const handleDownload = () => {
    const md = generateMarkdownReport({
      runId,
      batch,
      property,
      ov,
      models,
      recs,
      narrative: effectiveNarrative,
    });
    downloadReportFile(md, `fcc_demo_report_${runId}_${property}.md`);
  };

  return (
    <Card
      className="s-12 demo-report-card"
      id="fcc-demo-report"
      title="FCC Soft-Sensor Technical Demo Report (SIMULATED DATA)"
      sub={`Run ${runId} · Target ${propLabel(property)} · Demo Report (F14)`}
      actions={
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn primary sm" onClick={() => window.print()}>
            Print / Save as PDF
          </button>
          <button type="button" className="btn sm" onClick={handleDownload}>
            Download Report (.md)
          </button>
          <button type="button" className="btn ghost sm" onClick={onClose} aria-label="Close report">
            ✕ Close
          </button>
        </div>
      }
    >
      <style>{`
        @media print {
          body { background: white !important; color: black !important; }
          .page-head, .page-actions, .kpis, .grid, .rec-list, .banner.withheld { display: none !important; }
          #fcc-demo-report { border: none !important; box-shadow: none !important; background: white !important; color: black !important; margin: 0 !important; }
          #fcc-demo-report .card-h button { display: none !important; }
          #fcc-demo-report .banner.info { background: #f1f5f9 !important; color: #1e293b !important; border: 1px solid #cbd5e1 !important; }
          #fcc-demo-report .card { background: #f8fafc !important; border: 1px solid #e2e8f0 !important; }
          #fcc-demo-report table.t th, #fcc-demo-report table.t td { border-bottom: 1px solid #cbd5e1 !important; color: black !important; }
        }
      `}</style>
      <div className="stack" style={{ gap: 16 }}>
        {/* Provenance banner */}
        <div
          className="banner info"
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
            fontSize: "var(--fs-xs, 12px)",
          }}
        >
          <div>
            <strong>PROVENANCE:</strong> SIMULATED DATA · Batch: {batch} · Run ID: {runId} · Target: {propLabel(property)}
          </div>
          <div className="badge neutral" style={{ fontSize: 11 }}>
            Advisory Only (No DCS Write Path)
          </div>
        </div>

        {/* Technical KPIs */}
        <div>
          <h3 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)", margin: "0 0 8px" }}>
            1. Technical Performance KPIs
          </h3>
          {k ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 10,
              }}
            >
              <div className="card" style={{ padding: 10, background: "var(--surface)" }}>
                <div className="muted" style={{ fontSize: 11 }}>{vsTruth !== null ? "RMSE vs truth" : "RMSE vs lab"}</div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{num(rmse)} °F</div>
                <div className="muted" style={{ fontSize: 10 }}>target ≤ {num(k.rmse_target)} °F</div>
              </div>
              <div className="card" style={{ padding: 10, background: "var(--surface)" }}>
                <div className="muted" style={{ fontSize: 11 }}>90% Interval Coverage</div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{pct(k.coverage90)}</div>
                <div className="muted" style={{ fontSize: 10 }}>target 85–95%</div>
              </div>
              <div className="card" style={{ padding: 10, background: "var(--surface)" }}>
                <div className="muted" style={{ fontSize: 11 }}>Estimate Availability</div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{pct(k.availability)}</div>
                <div className="muted" style={{ fontSize: 10 }}>validated minutes</div>
              </div>
              <div className="card" style={{ padding: 10, background: "var(--surface)" }}>
                <div className="muted" style={{ fontSize: 11 }}>Trust Mix</div>
                <div style={{ fontSize: 13, fontWeight: 600, display: "flex", gap: 6 }}>
                  <span style={{ color: STATUS.GREEN }}>G {pct(k.trust_mix?.GREEN ?? 0)}</span>
                  <span style={{ color: STATUS.AMBER }}>A {pct(k.trust_mix?.AMBER ?? 0)}</span>
                  <span style={{ color: STATUS.RED }}>R {pct(k.trust_mix?.RED ?? 0)}</span>
                </div>
                <div className="muted" style={{ fontSize: 10 }}>green / amber / red</div>
              </div>
              <div className="card" style={{ padding: 10, background: "var(--surface)" }}>
                <div className="muted" style={{ fontSize: 11 }}>Recs Accepted</div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{k.recs_accepted} <span className="muted" style={{ fontSize: 12 }}>/ {k.recs_total}</span></div>
                <div className="muted" style={{ fontSize: 10 }}>recorded decisions</div>
              </div>
              <div className="card" style={{ padding: 10, background: "var(--surface)" }}>
                <div className="muted" style={{ fontSize: 11 }}>Withheld for Spread</div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{k.withheld}</div>
                <div className="muted" style={{ fontSize: 10 }}>W90 gate events</div>
              </div>
            </div>
          ) : (
            <div className="muted" style={{ fontSize: 12 }}>KPIs loading or unavailable</div>
          )}
        </div>

        {/* Decision & Spread-Gate Summary */}
        <div>
          <h3 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)", margin: "0 0 8px" }}>
            2. Decision &amp; Spread-Gate Summary
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12 }}>
            <div className="card" style={{ padding: 12, background: "var(--surface)" }}>
              <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 6 }}>
                Active Recommendations ({openRecs.length})
              </div>
              {openRecs.length ? (
                <div className="table-wrap">
                  <table className="t">
                    <thead>
                      <tr>
                        <th>Property</th>
                        <th>Action</th>
                        <th className="r">SP Move</th>
                        <th className="r">P(on-spec)</th>
                        <th>Trust</th>
                      </tr>
                    </thead>
                    <tbody>
                      {openRecs.slice(0, 5).map((r) => (
                        <tr key={r.rec_id}>
                          <td>{propLabel(r.property)}</td>
                          <td><strong>{r.action}</strong></td>
                          <td className="r">{num(r.sp_before)} → {num(r.sp_after)} °F</td>
                          <td className="r">{pct(r.p_on_spec_after)}</td>
                          <td><span className="badge neutral" style={{ fontSize: 10 }}>{r.trust}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="muted" style={{ fontSize: 12 }}>No active recommendations open.</div>
              )}
            </div>

            <div className="card" style={{ padding: 12, background: "var(--surface)" }}>
              <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 6 }}>
                Spread-Gate Withheld Events ({withheldRecs.length})
              </div>
              {withheldRecs.length ? (
                <div className="table-wrap">
                  <table className="t">
                    <thead>
                      <tr>
                        <th>Minute</th>
                        <th>Property</th>
                        <th>Gate Reason</th>
                        <th>Trust</th>
                      </tr>
                    </thead>
                    <tbody>
                      {withheldRecs.slice(0, 5).map((r) => (
                        <tr key={r.rec_id}>
                          <td className="num">t {r.time_min}</td>
                          <td>{propLabel(r.property)}</td>
                          <td style={{ fontSize: 11 }}>{r.gate?.message ?? "W90 spread too wide"}</td>
                          <td><span className="badge amber" style={{ fontSize: 10 }}>{r.trust}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="muted" style={{ fontSize: 12 }}>Zero withheld decisions in this run.</div>
              )}
            </div>
          </div>
        </div>

        {/* Model Committee Summary */}
        <div>
          <h3 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)", margin: "0 0 8px" }}>
            3. Model Committee Summary ({propLabel(property)})
          </h3>
          {models?.models?.length ? (
            <div className="table-wrap">
              <table className="t">
                <thead>
                  <tr>
                    <th>Model Family</th>
                    <th>Status</th>
                    <th className="r">Weight</th>
                    <th className="r">RMSE (°F)</th>
                    <th className="r">90% Coverage</th>
                    <th className="r">CRPS</th>
                  </tr>
                </thead>
                <tbody>
                  {[...models.models]
                    .sort((m1, m2) => MODEL_ORDER.indexOf(m1.model_id) - MODEL_ORDER.indexOf(m2.model_id))
                    .map((m) => (
                      <tr key={m.model_id} className={m.status === "shadow" ? "shadow" : ""}>
                        <td>
                          <strong>{m.label}</strong>{" "}
                          <span className="mono muted" style={{ fontSize: 11 }}>({m.model_id})</span>
                        </td>
                        <td>
                          <span className={`badge ${m.status === "admitted" ? "green" : "neutral"}`} style={{ fontSize: 10 }}>
                            {m.status}
                          </span>
                        </td>
                        <td className="r">{num(m.weight, 2)}</td>
                        <td className="r">{num(m.rmse, 2)}</td>
                        <td className="r">{m.coverage90 === null ? "—" : pct(m.coverage90)}</td>
                        <td className="r">{num(m.crps, 2)}</td>
                      </tr>
                    ))}
                  {models.mixture ? (
                    <tr className="total">
                      <td><strong>Mixture</strong></td>
                      <td><span className="badge green" style={{ fontSize: 10 }}>active</span></td>
                      <td className="r">1.00</td>
                      <td className="r">{num(models.mixture.rmse, 2)}</td>
                      <td className="r">{models.mixture.coverage90 === null ? "—" : pct(models.mixture.coverage90)}</td>
                      <td className="r">{num(models.mixture.crps, 2)}</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="muted" style={{ fontSize: 12 }}>No model metrics loaded for {propLabel(property)}.</div>
          )}
        </div>

        {/* Period Narrative */}
        <div>
          <h3 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)", margin: "0 0 8px" }}>
            4. Period Narrative
          </h3>
          <div className="bubble" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
            <Markdown>{effectiveNarrative}</Markdown>
          </div>
        </div>
      </div>
    </Card>
  );
}

function PeriodSummary({ onSummaryChange }: { onSummaryChange?: (s: string) => void }) {
  const ctx = usePageContext();
  const [text, setText] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cites, setCites] = useState<Citation[]>([]);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setText("");
    setCites([]);
    setError(null);
    setBusy(true);
    setStatus("Thinking…");
    try {
      let accumulated = "";
      await streamSSE(
        "/api/copilot/chat",
        {
          messages: [
            {
              role: "user",
              content:
                "Write a concise period summary (max 5 bullets) of the currently displayed window for this run and property: estimate accuracy, trust, spread gate events and recommendations. Technical metrics only.",
            },
          ],
          context: ctx,
        },
        (ev) => {
          const d = parseData<Record<string, unknown>>(ev) ?? {};
          if (ev.event === "thought") setStatus(String(d.text ?? ""));
          else if (ev.event === "tool_call") setStatus(`Calling ${String(d.name)}…`);
          else if (ev.event === "final") {
            const delta = String(d.delta ?? "");
            accumulated += delta;
            setText((t) => t + delta);
            onSummaryChange?.(accumulated);
          } else if (ev.event === "citation") setCites((c) => [...c, d as unknown as Citation]);
          else if (ev.event === "error") setError(String(d.message ?? "Copilot error"));
        },
      );
    } catch (e) {
      setError((e as Error).message === "Failed to fetch" ? "The cockpit API is not reachable." : (e as Error).message);
    } finally {
      setBusy(false);
      setStatus(null);
    }
  };
  return (
    <Card
      title="Period summary"
      sub={text ? <span className="generated-label">Generated by Gemini</span> : "Gemini · on request"}
      actions={
        <button type="button" className="btn sm" onClick={run} disabled={busy || !ctx.run_id}>
          {busy ? <span className="spinner" /> : <IconSpark />} {text ? "Regenerate" : "Generate"}
        </button>
      }
    >
      {busy && status ? (
        <div className="status-line" role="status">
          <span className="spinner" />
          <span className="txt">{status}</span>
        </div>
      ) : null}
      {error ? <ErrorState error={new Error(error)} onRetry={run} title="Summary unavailable" /> : null}
      {text ? (
        <div className="bubble">
          <Markdown>{text}</Markdown>
        </div>
      ) : !busy && !error ? (
        <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
          Ask Gemini to summarise the displayed window. Numbers come from read-only tools over simulated data.
        </p>
      ) : null}
      <Citations items={cites} />
    </Card>
  );
}

export default function OverviewView() {
  const runId = useCockpit((s) => s.runId);
  const property = useCockpit((s) => s.property);
  const timeMin = useCockpit((s) => s.timeMin);
  const setTimeMin = useCockpit((s) => s.setTimeMin);
  const runs = useRuns();
  const run = runs.data?.find((r) => r.run_id === runId);
  const end = timeMin ?? run?.n_minutes ?? null;
  const from = end !== null ? Math.max(0, end - 720) : null;
  const ov = useOverview(runId);
  const est = useEstimatesTimeseries(runId, property, { from, to: end }, 1000, end !== null);
  const cur = useEstimate(runId, property, end);
  const models = useModels(property);
  const recs = useRecommendations(runId);
  const [showReport, setShowReport] = useState(false);
  const [periodNarrative, setPeriodNarrative] = useState("");
  const gateMsg = cur.data?.gate?.status === "WITHHELD" ? cur.data.gate.message : null;

  return (
    <div className="page">
      <PageHeader
        title="Decision Overview"
        question="Is the soft sensor accurate and trustworthy right now, and does anything need a decision?"
        actions={
          <button
            type="button"
            className={`btn ${showReport ? "primary" : ""}`}
            onClick={() => setShowReport((s) => !s)}
            disabled={!runId}
          >
            {showReport ? "Hide Demo Report" : "Export Demo Report (F14)"}
          </button>
        }
      />
      {gateMsg ? (
        <GateBanner message={gateMsg} action={<Link href="/modelling/confidence">Why? → Modelling</Link>} />
      ) : null}
      {showReport && runId ? (
        <DemoReportCard
          runId={runId}
          batch={run?.batch ?? "full_v1"}
          property={property}
          ov={ov.data}
          models={models.data}
          recs={recs.data}
          narrative={periodNarrative}
          onClose={() => setShowReport(false)}
        />
      ) : null}
      {!runId && !runs.isLoading ? (
        runs.isError ? (
          <Card>
            <ErrorState error={runs.error} onRetry={() => runs.refetch()} title="Cockpit API unavailable" />
          </Card>
        ) : (
          <Card>
            <NoRun />
          </Card>
        )
      ) : (
        <>
          {ov.isLoading ? (
            <div className="kpis">
              {Array.from({ length: 6 }, (_, i) => (
                <div className="card kpi" key={i}>
                  <Skeleton height={14} width="60%" />
                  <Skeleton height={28} width="45%" />
                </div>
              ))}
            </div>
          ) : ov.isError ? (
            <Card>
              <ErrorState error={ov.error} onRetry={() => ov.refetch()} />
            </Card>
          ) : ov.data ? (
            <KpiRow ov={ov.data} w90={est.data?.w90} w90Limit={est.data?.w90_limit} />
          ) : null}
          {ov.data?.note ? <div className="banner info">{ov.data.note}</div> : null}
          <div className="grid">
            <Card
              className="s-8 s-md-12"
              title={`${propLabel(property)} — ${est.data?.time_min?.length ? spanLabel(dataSpan(est.data.time_min)) : "estimates"}`}
              sub={
                est.data?.time_min?.length
                  ? `t ${est.data.time_min[0]}–${est.data.time_min.at(-1)} · click to move the time cursor`
                  : undefined
              }
            >
              <QueryView
                q={est}
                height={420}
                isEmpty={(d) => !d.time_min?.length}
                empty={<EmptyState title="No estimates for this window" detail={est.data?.note ?? "The API returned no estimate rows for this run and property."} />}
              >
                {(d) => (
                  <FanChart
                    est={d}
                    cursor={end}
                    onPick={setTimeMin}
                    withStrips
                    height={440}
                    ariaLabel={`${propLabel(property)} fan chart, ${spanLabel(dataSpan(d.time_min)).toLowerCase()}, with W90 and trust strips`}
                  />
                )}
              </QueryView>
            </Card>
            <div className="s-4 s-md-12 stack" style={{ gap: 16 }}>
              <Card title="Decisions needed" sub={ov.data ? `${ov.data.decisions_needed.length} open` : undefined}>
                {ov.isLoading ? (
                  <LoadingBlock height={180} />
                ) : ov.data?.decisions_needed?.length ? (
                  <div className="rec-list">
                    {ov.data.decisions_needed.slice(0, 4).map((r) =>
                      r.status === "WITHHELD" ? <WithheldCard key={r.rec_id} rec={r} compact /> : <RecCard key={r.rec_id} rec={r} compact />,
                    )}
                    {ov.data.decisions_needed.length > 4 ? (
                      <Link href="/decision/decisions">View all {ov.data.decisions_needed.length} →</Link>
                    ) : null}
                  </div>
                ) : ov.data ? (
                  <EmptyState title="Nothing needs a decision" detail="No open recommendations for this run." />
                ) : null}
              </Card>
              <PeriodSummary onSummaryChange={setPeriodNarrative} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
