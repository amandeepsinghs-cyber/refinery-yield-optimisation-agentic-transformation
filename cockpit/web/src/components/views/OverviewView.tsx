"use client";

import { useState } from "react";
import { useEstimate, useEstimatesTimeseries, useOverview, useRuns } from "@/lib/api";
import { dataSpan, num, pct, propLabel, spanLabel } from "@/lib/format";
import { parseData, streamSSE } from "@/lib/sse";
import { useCockpit } from "@/lib/store";
import { STATUS } from "@/lib/theme";
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

function PeriodSummary() {
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
          else if (ev.event === "final") setText((t) => t + String(d.delta ?? ""));
          else if (ev.event === "citation") setCites((c) => [...c, d as unknown as Citation]);
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
  const gateMsg = cur.data?.gate?.status === "WITHHELD" ? cur.data.gate.message : null;

  return (
    <div className="page">
      <PageHeader
        title="Decision Overview"
        question="Is the soft sensor accurate and trustworthy right now, and does anything need a decision?"
      />
      {gateMsg ? (
        <GateBanner message={gateMsg} action={<Link href="/modelling/confidence">Why? → Modelling</Link>} />
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
              <PeriodSummary />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
