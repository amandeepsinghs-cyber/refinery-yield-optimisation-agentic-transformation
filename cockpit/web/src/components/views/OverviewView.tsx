"use client";

import { useMemo, useState } from "react";
import {
  useDistribution,
  useEstimate,
  useEstimatesTimeseries,
  useModels,
  useOverview,
  useRecommendations,
  useRuns,
  useTwin,
} from "@/lib/api";
import { clock, dataSpan, num, pct, propLabel, signed, spanLabel } from "@/lib/format";
import { parseData, streamSSE } from "@/lib/sse";
import { useCockpit } from "@/lib/store";
import { MODEL_ORDER, STATUS, modelColor, modelLabel } from "@/lib/theme";
import { FanChart } from "@/components/charts/EstimateCharts";
import { DistributionOverlay } from "@/components/views/ConfidenceView";
import RefineryTwinSchematic from "@/components/twin/RefineryTwinSchematic";
import UseCaseCatalogueView from "@/components/views/UseCaseCatalogueView";
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
import type { Citation, EstimateMessage, EstimatesTimeseries, Overview, Recommendation } from "@/lib/types";
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

interface RegimePreset {
  id: "align" | "crude" | "amber" | "diverge";
  label: string;
  badge: "green" | "amber" | "red" | "neutral";
  timeMin: number;
  sub: string;
  highlight: "none" | "align" | "diverge";
}

function computeRegimePresets(est: EstimatesTimeseries | undefined): RegimePreset[] {
  if (!est?.time_min?.length || !est.members) return [];
  const n = est.time_min.length;
  const spec = est.spec_max;
  const diffs: number[] = [];
  for (let i = 0; i < n; i++) {
    const mus: number[] = [];
    for (const id of MODEL_ORDER) {
      const v = est.members[id]?.mu?.[i];
      if (v !== null && v !== undefined && Number.isFinite(v)) mus.push(v);
    }
    diffs.push(mus.length >= 2 ? Math.max(...mus) - Math.min(...mus) : 0);
  }

  const snap5 = (t: number) => Math.max(5, Math.round(t / 5) * 5);

  // 1. Models Align (Consensus, GREEN, PASS, giveaway margin > 3°F)
  let bestAlignIdx = -1;
  let bestAlignDiff = Infinity;
  for (let i = 0; i < n; i++) {
    const tm = est.time_min[i];
    const q95 = est.mixture.q95[i];
    const margin = q95 !== null && q95 !== undefined ? spec - q95 : 0;
    if (tm >= 35 && est.gate[i] === "PASS" && est.trust[i] === "GREEN" && margin >= 2.5 && diffs[i] < bestAlignDiff) {
      bestAlignDiff = diffs[i];
      bestAlignIdx = i;
    }
  }
  if (bestAlignIdx < 0) {
    for (let i = 0; i < n; i++) {
      if (est.gate[i] === "PASS" && diffs[i] < bestAlignDiff) {
        bestAlignDiff = diffs[i];
        bestAlignIdx = i;
      }
    }
  }

  // 2. Crude Mix Switch (event code 1, or first major feed disturbance)
  const crudeEv = (est.events ?? []).find((e) => e.code === 1 || e.label.toLowerCase().includes("crude")) ?? est.events?.[0];
  let crudeIdx = -1;
  if (crudeEv) {
    const targetT = snap5(crudeEv.time_min + Math.min(25, Math.floor((crudeEv.duration || 40) / 2)));
    let bestDist = Infinity;
    for (let i = 0; i < n; i++) {
      const d = Math.abs(est.time_min[i] - targetT);
      if (d < bestDist) {
        bestDist = d;
        crudeIdx = i;
      }
    }
  }

  // 3. Conservative Step (AMBER, PASS, post-disturbance recovery)
  let amberIdx = -1;
  const afterT = crudeEv ? crudeEv.time_min + (crudeEv.duration || 40) : 200;
  for (let i = 0; i < n; i++) {
    const tm = est.time_min[i];
    const q95 = est.mixture.q95[i];
    const margin = q95 !== null && q95 !== undefined ? spec - q95 : 0;
    if (tm >= afterT && est.gate[i] === "PASS" && est.trust[i] === "AMBER" && margin >= 2.5) {
      amberIdx = i;
      break;
    }
  }
  if (amberIdx < 0) {
    for (let i = 0; i < n; i++) {
      if (est.gate[i] === "PASS" && est.trust[i] === "AMBER") {
        amberIdx = i;
        break;
      }
    }
  }

  // 4. Models Diverge (Max inter-model spread Δμ / WITHHELD)
  let maxDivIdx = -1;
  let maxDivDiff = -1;
  for (let i = 0; i < n; i++) {
    if (diffs[i] > maxDivDiff) {
      maxDivDiff = diffs[i];
      maxDivIdx = i;
    }
  }

  const out: RegimePreset[] = [];
  if (bestAlignIdx >= 0) {
    const tAlign = snap5(est.time_min[bestAlignIdx]);
    out.push({
      id: "align",
      label: "✓ Models Align (Avoid Over-Treating)",
      badge: "green",
      timeMin: tAlign,
      sub: `t ${tAlign} · Δμ ${num(diffs[bestAlignIdx], 2)} °F · W90 ${num(est.w90[bestAlignIdx], 1)} °F · RAISE SP`,
      highlight: "align",
    });
  }
  if (crudeIdx >= 0 && crudeEv) {
    const tCrude = snap5(est.time_min[crudeIdx]);
    out.push({
      id: "crude",
      label: `⚡ ${crudeEv.label} (Feed Transient)`,
      badge: "amber",
      timeMin: tCrude,
      sub: `t ${tCrude} · Δμ ${num(diffs[crudeIdx], 2)} °F · W90 ${num(est.w90[crudeIdx], 1)} °F · ${est.gate[crudeIdx]}`,
      highlight: "diverge",
    });
  }
  if (amberIdx >= 0) {
    const tAmber = snap5(est.time_min[amberIdx]);
    out.push({
      id: "amber",
      label: "⚖️ Conservative Step (AMBER)",
      badge: "amber",
      timeMin: tAmber,
      sub: `t ${tAmber} · Δμ ${num(diffs[amberIdx], 2)} °F · W90 ${num(est.w90[amberIdx], 1)} °F · Half-Step RAISE`,
      highlight: "none",
    });
  }
  if (maxDivIdx >= 0) {
    const tDiv = snap5(est.time_min[maxDivIdx]);
    out.push({
      id: "diverge",
      label: "⚠️ Models Diverge (Avoid Off-Spec)",
      badge: "red",
      timeMin: tDiv,
      sub: `t ${tDiv} · Δμ ${num(diffs[maxDivIdx], 2)} °F · W90 ${num(est.w90[maxDivIdx], 1)} °F · Gate ${est.gate[maxDivIdx]}`,
      highlight: "diverge",
    });
  }
  return out;
}

function RegimeScenarioBar({
  presets,
  cursor,
  onSelectMinute,
  highlightMode,
  onChangeHighlight,
}: {
  presets: RegimePreset[];
  cursor: number | null;
  onSelectMinute: (m: number, hl: "none" | "align" | "diverge") => void;
  highlightMode: "none" | "align" | "diverge";
  onChangeHighlight: (hl: "none" | "align" | "diverge") => void;
}) {
  if (!presets.length) return null;
  return (
    <div
      className="card"
      style={{
        padding: "12px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div className="row between" style={{ flexWrap: "wrap", gap: 8 }}>
        <div>
          <span style={{ fontWeight: 600, fontSize: 13 }}>
            Real-Time Decision Scenarios &amp; Model Alignment Explorer
          </span>
          <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>
            Jump to key operating regimes to see how the 4-model committee prevents both over-treating (quality giveaway) and under-treating (off-spec)
          </span>
        </div>
        <div className="row" style={{ gap: 6, alignItems: "center" }}>
          <span className="muted" style={{ fontSize: 11.5 }}>
            Shade chart zones:
          </span>
          <div className="seg" role="group" aria-label="Highlight model alignment or divergence on chart">
            <button
              type="button"
              aria-pressed={highlightMode === "none"}
              onClick={() => onChangeHighlight("none")}
            >
              Standard
            </button>
            <button
              type="button"
              aria-pressed={highlightMode === "align"}
              onClick={() => onChangeHighlight("align")}
              title="Shade time windows where all 4 models align within Δμ ≤ 1.5 °F"
            >
              Where Models Align
            </button>
            <button
              type="button"
              aria-pressed={highlightMode === "diverge"}
              onClick={() => onChangeHighlight("diverge")}
              title="Shade time windows where models diverge (Δμ ≥ 3.8 °F or Gate WITHHELD)"
            >
              Where Models Diverge
            </button>
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 8,
        }}
      >
        {presets.map((p) => {
          const active = cursor !== null && Math.abs(cursor - p.timeMin) <= 5;
          const borderColor =
            p.badge === "green"
              ? "rgba(16,185,129,0.45)"
              : p.badge === "red"
                ? "rgba(244,63,94,0.45)"
                : "rgba(245,158,11,0.42)";
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelectMinute(p.timeMin, p.highlight)}
              style={{
                textAlign: "left",
                padding: "9px 12px",
                borderRadius: "var(--radius-sm)",
                border: active ? `1.5px solid ${borderColor}` : "1px solid var(--border)",
                background: active
                  ? "linear-gradient(180deg, rgba(59,130,246,0.12) 0%, rgba(15,23,42,0.5) 100%)"
                  : "var(--elevated)",
                color: "var(--text)",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                gap: 3,
                transition: "border-color 0.15s ease, background 0.15s ease",
              }}
            >
              <div className="row between" style={{ gap: 6 }}>
                <span style={{ fontWeight: 600, fontSize: 12.5 }}>{p.label}</span>
                {active ? (
                  <span className={`badge ${p.badge}`} style={{ fontSize: 10 }}>
                    active
                  </span>
                ) : null}
              </div>
              <span className="mono muted" style={{ fontSize: 11 }}>
                {p.sub}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function OperatingEnvelopeCard({
  cur,
  openRec,
  property,
}: {
  cur: EstimateMessage | undefined;
  openRec: Recommendation | undefined;
  property: string;
}) {
  const theme = useCockpit((s) => s.theme);
  if (!cur) return null;

  const curExt = cur as EstimateMessage & { spec_max?: number; w90_limit?: number };
  const specMax = curExt.spec_max ?? (property === "LCO_T98_F" ? 765.0 : 540.0);
  const w90Limit = curExt.w90_limit ?? 14.0;
  const safetyMargin = 2.0;
  const sweetSpotTarget = specMax - safetyMargin; // e.g. 763.0 °F for LCO, 538.0 °F for HN
  const q50 = cur.mixture.q50;
  const q95 = cur.mixture.q95;
  const w90 = cur.mixture.w90;
  const pOnSpec = cur.mixture.p_on_spec;
  const marginToSpec = specMax - q95;
  const giveawayF = Math.max(0, sweetSpotTarget - q95);

  const memberList = MODEL_ORDER.map((id) => {
    const m = cur.members?.[id];
    return {
      id,
      label: modelLabel(id),
      mu: m?.mu ?? null,
      sigma: m?.sigma ?? null,
      color: modelColor(id, theme) as string,
    };
  }).filter((m) => m.mu !== null);

  const mus = memberList.map((m) => m.mu as number);
  const memSpread = mus.length >= 2 ? Math.max(...mus) - Math.min(...mus) : 0;
  const alignStatus =
    memSpread <= 1.5
      ? { label: "ALL 4 MODELS ALIGN", badge: "green" }
      : memSpread < 3.8
        ? { label: "MODERATE DRIFT", badge: "amber" }
        : { label: "MODELS DIVERGE", badge: "red" };

  // Determine operational state: Over-Treating vs Sweet Spot vs Under-Treating vs Transition Lock
  let regimeTitle = "";
  let regimeBadge: "green" | "amber" | "red" | "neutral" = "neutral";
  let regimeAdvice = "";
  if (cur.gate.status === "WITHHELD") {
    regimeTitle = "TRANSITION LOCK · HOLD SET POINT";
    regimeBadge = "amber";
    regimeAdvice = `Models diverge (Δμ = ${num(memSpread, 2)} °F, W90 = ${num(w90, 1)} °F > ${num(w90Limit, 1)} °F limit). Holding cut-point set point prevents over-cutting into an off-spec excursion during a crude/feed transient.`;
  } else if (marginToSpec < 1.0 || pOnSpec < 0.95) {
    regimeTitle = "UNDER-TREATING RISK · LOWER SET POINT";
    regimeBadge = "red";
    regimeAdvice = `P95 (${num(q95, 1)} °F) encroaches on the ${num(specMax, 0)} °F spec limit (margin ${num(marginToSpec, 1)} °F, P(on-spec) ${pct(pOnSpec)}). Lower the cut-point set point immediately to avoid off-spec product.`;
  } else if (marginToSpec > 2.5) {
    regimeTitle = "OVER-TREATING (QUALITY GIVEAWAY) · RAISE SET POINT";
    regimeBadge = "green";
    regimeAdvice = `P95 (${num(q95, 1)} °F) sits ${num(marginToSpec, 1)} °F below the ${num(specMax, 0)} °F spec (${num(giveawayF, 1)} °F below the ${num(sweetSpotTarget, 0)} °F sweet spot). Unit is under-cutting distillate — safe to raise set point${openRec && openRec.action === "RAISE" ? ` by +${num(openRec.delta_F, 1)} °F (${num(openRec.sp_before, 1)} → ${num(openRec.sp_after, 1)} °F)` : ""}.`;
  } else {
    regimeTitle = "OPTIMAL SWEET SPOT · HOLD SET POINT";
    regimeBadge = "green";
    regimeAdvice = `P95 (${num(q95, 1)} °F) is right inside the ${num(specMax - 2.5, 1)}–${num(specMax - 1.0, 1)} °F sweet-spot window with P(on-spec) = ${pct(pOnSpec)}. Distillate yield is maximized without off-spec risk.`;
  }

  // Gauge scale: [specMax - 14, specMax + 2]
  const minScale = specMax - 14;
  const maxScale = specMax + 2;
  const toPct = (v: number) => Math.max(2, Math.min(98, ((v - minScale) / (maxScale - minScale)) * 100));
  const q50Pct = toPct(q50);
  const q95Pct = toPct(q95);
  const sweetStartPct = toPct(specMax - 2.5);
  const sweetEndPct = toPct(specMax - 1.0);
  const specPct = toPct(specMax);
  const q95After =
    openRec && openRec.action !== "HOLD" && openRec.margin_after_F !== null ? specMax - openRec.margin_after_F : null;
  const q95AfterPct = q95After !== null ? toPct(q95After) : null;

  return (
    <Card
      title="Operating Envelope: Over-Treating vs. Under-Treating"
      sub={`Live parameter positioning at t ${cur.provenance.time_min} (${clock(cur.provenance.time_min)}) · ${propLabel(property)}`}
    >
      <div className="stack" style={{ gap: 12 }}>
        <div className="row between" style={{ gap: 8, flexWrap: "wrap" }}>
          <span className={`badge ${regimeBadge}`} style={{ fontSize: 11, fontWeight: 600 }}>
            {regimeTitle}
          </span>
          <span className={`badge ${alignStatus.badge}`} style={{ fontSize: 10.5 }}>
            {alignStatus.label} · Δμ {num(memSpread, 2)} °F
          </span>
        </div>

        <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.45, color: "var(--text)" }}>
          {regimeAdvice}
        </p>

        {/* 3-Zone Visual Operating Bar */}
        <div className="stack" style={{ gap: 6, marginTop: 2 }}>
          <div className="row between mono muted" style={{ fontSize: 10.5 }}>
            <span>Over-Treating (Giveaway)</span>
            <span style={{ color: STATUS.GREEN }}>Sweet Spot ({num(sweetSpotTarget, 0)} °F)</span>
            <span style={{ color: STATUS.RED }}>Spec ({num(specMax, 0)} °F)</span>
          </div>
          <div
            style={{
              position: "relative",
              height: 26,
              borderRadius: 6,
              background: "var(--elevated)",
              border: "1px solid var(--border-strong)",
              overflow: "hidden",
            }}
            role="img"
            aria-label={`Operating envelope bar: P50 ${num(q50)} °F, P95 ${num(q95)} °F versus sweet spot ${num(sweetSpotTarget)} °F and spec ${num(specMax)} °F`}
          >
            {/* Left zone: Over-treating / giveaway */}
            <div
              style={{
                position: "absolute",
                left: 0,
                width: `${sweetStartPct}%`,
                top: 0,
                bottom: 0,
                background: "rgba(59, 130, 246, 0.12)",
              }}
            />
            {/* Middle zone: Optimal Sweet Spot */}
            <div
              style={{
                position: "absolute",
                left: `${sweetStartPct}%`,
                width: `${Math.max(2, sweetEndPct - sweetStartPct)}%`,
                top: 0,
                bottom: 0,
                background: "rgba(16, 185, 129, 0.25)",
                borderLeft: "1px dashed rgba(16, 185, 129, 0.65)",
                borderRight: "1px dashed rgba(16, 185, 129, 0.65)",
              }}
            />
            {/* Right zone: Under-treating / Off-spec risk */}
            <div
              style={{
                position: "absolute",
                left: `${sweetEndPct}%`,
                right: 0,
                top: 0,
                bottom: 0,
                background: "rgba(244, 63, 94, 0.18)",
              }}
            />
            {/* Spec line */}
            <div
              style={{
                position: "absolute",
                left: `${specPct}%`,
                top: 0,
                bottom: 0,
                width: 2,
                background: STATUS.RED,
              }}
              title={`Spec Limit: ${num(specMax)} °F`}
            />
            {/* P50 marker */}
            <div
              style={{
                position: "absolute",
                left: `${q50Pct}%`,
                top: 5,
                bottom: 5,
                width: 3,
                borderRadius: 2,
                background: "var(--muted)",
                transform: "translateX(-50%)",
              }}
              title={`Mixture P50: ${num(q50)} °F`}
            />
            {/* Current P95 marker */}
            <div
              style={{
                position: "absolute",
                left: `${q95Pct}%`,
                top: 2,
                bottom: 2,
                width: 8,
                borderRadius: 4,
                background: cur.gate.status === "WITHHELD" ? STATUS.AMBER : "#60a5fa",
                border: "1.5px solid #fff",
                transform: "translateX(-50%)",
              }}
              title={`Current P95: ${num(q95)} °F (Margin: ${num(marginToSpec)} °F)`}
            />
            {/* P95 After Recommended Set-Point Move */}
            {q95AfterPct !== null ? (
              <div
                style={{
                  position: "absolute",
                  left: `${q95AfterPct}%`,
                  top: 2,
                  bottom: 2,
                  width: 8,
                  borderRadius: 4,
                  background: STATUS.GREEN,
                  border: "1.5px solid #fff",
                  transform: "translateX(-50%)",
                }}
                title={`P95 After Recommended Move: ${num(q95After)} °F`}
              />
            ) : null}
          </div>
          <div className="row between mono" style={{ fontSize: 11, flexWrap: "wrap", gap: 6 }}>
            <span>
              P50: <strong>{num(q50)} °F</strong>
            </span>
            <span style={{ color: "#60a5fa" }}>
              ● Current P95: <strong>{num(q95)} °F</strong> (margin {signed(marginToSpec, 1)} °F)
            </span>
            {q95After !== null ? (
              <span style={{ color: STATUS.GREEN }}>
                ● Target P95 after SP move: <strong>{num(q95After)} °F</strong>
              </span>
            ) : null}
          </div>
        </div>

        {/* 4-Model Individual Means Pill Row */}
        <div
          style={{
            paddingTop: 8,
            borderTop: "1px solid var(--border)",
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 6,
            fontSize: 11.5,
          }}
        >
          {memberList.map((m) => (
            <div
              key={m.id}
              className="row between"
              style={{
                padding: "4px 8px",
                borderRadius: 4,
                background: "var(--surface)",
                border: "1px solid var(--border)",
              }}
            >
              <span className="row" style={{ gap: 5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: m.color,
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: 11 }}>{m.label}</span>
              </span>
              <span className="mono" style={{ fontWeight: 600, fontSize: 11 }}>
                {num(m.mu, 1)}°
              </span>
            </div>
          ))}
        </div>
      </div>
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
  const [windowHours, setWindowHours] = useState<3 | 6 | 12 | 24>(12);
  const [highlightMode, setHighlightMode] = useState<"none" | "align" | "diverge">("none");
  const [viewMode, setViewMode] = useState<"twin" | "catalogue">("twin");
  const [selectedUnitId, setSelectedUnitId] = useState<string>("unit_4_fractionator");
  const [selectedUseCaseId, setSelectedUseCaseId] = useState<string>("UC-01");
  const end = timeMin ?? run?.n_minutes ?? null;
  const from = end !== null ? Math.max(0, end - windowHours * 60) : null;
  const ov = useOverview(runId, property, end);
  const twin = useTwin(runId, end);
  const est = useEstimatesTimeseries(runId, property, { from, to: end }, 1000, end !== null);
  const fullEst = useEstimatesTimeseries(runId, property, {}, 400, !!runId);
  const cur = useEstimate(runId, property, end);
  const dist = useDistribution(runId, property, end);
  const models = useModels(property);
  const recs = useRecommendations(runId, undefined, end);
  const [showReport, setShowReport] = useState(false);
  const [periodNarrative, setPeriodNarrative] = useState("");
  const gateMsg = cur.data?.gate?.status === "WITHHELD" ? cur.data.gate.message : null;
  const presets = useMemo(() => computeRegimePresets(fullEst.data), [fullEst.data]);
  const openRec = useMemo(
    () => (ov.data?.decisions_needed ?? []).find((r) => r.status === "OPEN"),
    [ov.data?.decisions_needed],
  );

  return (
    <div className="page">
      <PageHeader
        title="Decision Overview & Connected Refinery Digital Twin"
        question="Is the connected refinery operating inside its optimal yield, energy, and integrity envelope right now, and what needs a decision?"
        actions={
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <div className="seg" role="group" aria-label="Switch between Systems Digital Twin and Use-Case Catalogue">
              <button
                type="button"
                aria-pressed={viewMode === "twin"}
                onClick={() => setViewMode("twin")}
              >
                🌐 Systems Digital Twin (6 Units)
              </button>
              <button
                type="button"
                aria-pressed={viewMode === "catalogue"}
                onClick={() => setViewMode("catalogue")}
              >
                📋 Use-Case Catalogue (#1–#11 + 23)
              </button>
            </div>
            <button
              type="button"
              className={`btn ${showReport ? "primary" : ""}`}
              onClick={() => setShowReport((s) => !s)}
              disabled={!runId}
            >
              {showReport ? "Hide Demo Report" : "Export Demo Report (F14)"}
            </button>
          </div>
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
          <RegimeScenarioBar
            presets={presets}
            cursor={end}
            onSelectMinute={(m, hl) => {
              setTimeMin(m);
              setHighlightMode(hl);
            }}
            highlightMode={highlightMode}
            onChangeHighlight={setHighlightMode}
          />
          {viewMode === "catalogue" && twin.data ? (
            <UseCaseCatalogueView
              twin={twin.data}
              initialUseCaseId={selectedUseCaseId}
              onHighlightUnitOnTwin={(uid) => {
                setSelectedUnitId(uid);
                setViewMode("twin");
              }}
            />
          ) : (
            <>
              {twin.data ? (
                <RefineryTwinSchematic
                  twin={twin.data}
                  selectedUnitId={selectedUnitId}
                  onSelectUnit={setSelectedUnitId}
                  onOpenUseCase={(ucId) => {
                    setSelectedUseCaseId(ucId);
                    setViewMode("catalogue");
                  }}
                />
              ) : null}
              <div className="grid">
            <div className="s-8 s-md-12 stack" style={{ gap: 16 }}>
              <Card
                title={`${propLabel(property)} — ${est.data?.time_min?.length ? spanLabel(dataSpan(est.data.time_min)) : "estimates"}`}
                sub={
                  est.data?.time_min?.length
                    ? `t ${est.data.time_min[0]}–${est.data.time_min.at(-1)} (${clock(est.data.time_min[0])}–${clock(est.data.time_min.at(-1) ?? null)}) · click to move the time cursor`
                    : undefined
                }
                actions={
                  <div className="seg" role="group" aria-label="Decision horizon window">
                    {([3, 6, 12, 24] as const).map((h) => (
                      <button
                        key={h}
                        type="button"
                        aria-pressed={windowHours === h}
                        onClick={() => setWindowHours(h)}
                        title={h === 12 ? "12-hour shift window (default)" : `${h}-hour window`}
                      >
                        {h}h
                      </button>
                    ))}
                  </div>
                }
              >
                <QueryView
                  q={est}
                  height={400}
                  isEmpty={(d) => !d.time_min?.length}
                  empty={<EmptyState title="No estimates for this window" detail={est.data?.note ?? "The API returned no estimate rows for this run and property."} />}
                >
                  {(d) => (
                    <FanChart
                      est={d}
                      cursor={end}
                      onPick={setTimeMin}
                      withStrips
                      height={410}
                      highlightMode={highlightMode}
                      ariaLabel={`${propLabel(property)} fan chart, ${spanLabel(dataSpan(d.time_min)).toLowerCase()}, with W90 and trust strips`}
                    />
                  )}
                </QueryView>
              </Card>
              <Card
                title={`Predictive Normal Distributions — ${propLabel(property)} at t ${end ?? "—"} (${clock(end)})`}
                sub={
                  dist.data
                    ? `4-model committee Gaussian PDFs + Consensus Mixture (mean ${num(dist.data.mixture.mean)} °F · P5–P95 [${num(dist.data.mixture.q05)}, ${num(dist.data.mixture.q95)}] °F · W90 ${num(dist.data.w90)} °F vs limit ${num(dist.data.w90_limit)} °F · spec ${num(dist.data.spec_max)} °F)`
                    : "Member Gaussian densities and consensus mixture at the selected cursor minute"
                }
                actions={
                  <Link href="/modelling/confidence" className="btn ghost sm">
                    Full Confidence View →
                  </Link>
                }
              >
                <QueryView
                  q={dist}
                  height={290}
                  isEmpty={(d) => !d.grid?.length}
                  empty={<EmptyState title="No predictive distribution" detail="Select a run and minute to inspect member normal distributions." />}
                >
                  {(d) => <DistributionOverlay d={d} height={300} />}
                </QueryView>
              </Card>
            </div>
            <div className="s-4 s-md-12 stack" style={{ gap: 16 }}>
              <OperatingEnvelopeCard cur={cur.data} openRec={openRec} property={property} />
              <Card
                title={`Decisions needed at t ${end ?? "—"}`}
                sub={ov.data ? `${ov.data.decisions_needed.filter((r) => r.status === "OPEN").length} actionable · ${ov.data.decisions_needed.length} shown` : undefined}
              >
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
                  <EmptyState title="Nothing needs a decision at this minute" detail="Select a Regime Scenario above or click the trajectory chart to inspect set-point recommendations." />
                ) : null}
              </Card>
              <PeriodSummary onSummaryChange={setPeriodNarrative} />
            </div>
          </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
