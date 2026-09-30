"use client";

import { useMemo, useState } from "react";
import { useCalibration, useConfig, useModels } from "@/lib/api";
import { num, pct, propLabel, sig3, signed } from "@/lib/format";
import { useCockpit } from "@/lib/store";
import { MODEL_ORDER, modelColor } from "@/lib/theme";
import type { ModelRow } from "@/lib/types";
import {
  DecompositionChart,
  ParityPlot,
  PinnSpread,
  RegimeBars,
  RelevanceBars,
  ResidualsChart,
} from "@/components/charts/ModelCharts";
import { Card, EmptyState, ErrorState, LoadingBlock, PageHeader, QueryView } from "@/components/ui/primitives";

type SortKey = "weight" | "rmse" | "mae" | "bias" | "coverage90" | "crps" | "mean_sigma";

function fmtParam(v: unknown): string {
  if (typeof v === "number") return sig3(v);
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return `[${v.slice(0, 6).map(fmtParam).join(", ")}${v.length > 6 ? ", …" : ""}]`;
  if (v && typeof v === "object") {
    const e = Object.entries(v as Record<string, unknown>);
    return e
      .slice(0, 6)
      .map(([k, x]) => `${k}=${typeof x === "object" && x !== null ? "…" : fmtParam(x)}`)
      .join(", ") + (e.length > 6 ? ", …" : "");
  }
  return "—";
}

function ParamsCell({ p }: { p: Record<string, unknown> }) {
  const entries = Object.entries(p ?? {}).filter(([, v]) => v !== null && v !== undefined);
  if (!entries.length) return <>—</>;
  const numeric = entries.filter(([, v]) => typeof v === "number").slice(0, 3);
  const summary = numeric.length
    ? numeric.map(([k, v]) => `${k} ${sig3(v as number)}`).join(" · ")
    : `${entries.length} parameters`;
  return (
    <details className="params">
      <summary title="Show all parameters">
        <span className="params-sum">{summary}</span>
      </summary>
      <dl>
        {entries.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{fmtParam(v)}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

const HEADERS: { key: SortKey; label: string; title: string }[] = [
  { key: "weight", label: "Weight", title: "Committee weight in the mixture" },
  { key: "rmse", label: "RMSE °F", title: "Root-mean-square error vs simulator truth on held-out minutes" },
  { key: "mae", label: "MAE °F", title: "Mean absolute error vs simulator truth" },
  { key: "bias", label: "Bias °F", title: "Mean(predicted − truth)" },
  { key: "coverage90", label: "90% cov.", title: "Share of held-out minutes inside the 90% interval (target 85–95%)" },
  { key: "crps", label: "CRPS", title: "Continuous ranked probability score (lower is better)" },
  { key: "mean_sigma", label: "Mean σ °F", title: "Average predictive standard deviation" },
];

function ModelTable({ models, mixture }: { models: ModelRow[]; mixture: { rmse: number | null; coverage90: number | null; crps: number | null } }) {
  const theme = useCockpit((s) => s.theme);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null);
  const rows = useMemo(() => {
    const r = [...models].sort((a, b) => MODEL_ORDER.indexOf(a.model_id) - MODEL_ORDER.indexOf(b.model_id));
    if (!sort) return r;
    return r.sort((a, b) => ((a[sort.key] ?? Infinity) - (b[sort.key] ?? Infinity)) * sort.dir);
  }, [models, sort]);
  const ridge = models.find((m) => m.model_id === "bayes_ridge_v1")?.rmse ?? null;
  const regimes = [...new Set(models.flatMap((m) => m.per_regime?.map((r) => r.regime) ?? []))];
  return (
    <div className="table-wrap">
      <table className="t">
        <thead>
          <tr>
            <th>Model</th>
            <th>Status</th>
            {HEADERS.map((h) => (
              <th key={h.key} className="r" title={h.title} aria-sort={sort?.key === h.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
                <button type="button" onClick={() => setSort((s) => ({ key: h.key, dir: s?.key === h.key ? ((-s.dir) as 1 | -1) : 1 }))}>
                  {h.label}
                  {sort?.key === h.key ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
                </button>
              </th>
            ))}
            {regimes.map((r) => (
              <th key={r} className="r" title={`RMSE in the ${r} regime`}>
                {r}
              </th>
            ))}
            <th className="r" title="RMSE ratio to Bayesian ridge">÷ ridge</th>
            <th>Key parameters</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.model_id} className={m.status === "shadow" ? "shadow" : ""}>
              <td style={{ whiteSpace: "nowrap", fontWeight: 500 }}>
                <span className="swatch" style={{ background: modelColor(m.model_id, theme) }} />
                {m.label}
              </td>
              <td>
                <span className={`badge ${m.status === "admitted" ? "green" : "neutral"}`}>{m.status}</span>
              </td>
              <td className="r">{num(m.weight, 2)}</td>
              <td className="r">{num(m.rmse, 2)}</td>
              <td className="r">{num(m.mae, 2)}</td>
              <td className="r">{signed(m.bias, 2)}</td>
              <td className="r">{pct(m.coverage90)}</td>
              <td className="r">{num(m.crps, 2)}</td>
              <td className="r">{num(m.mean_sigma, 2)}</td>
              {regimes.map((r) => (
                <td key={r} className="r">
                  {num(m.per_regime?.find((x) => x.regime === r)?.rmse, 2)}
                </td>
              ))}
              <td className="r">{ridge && m.rmse !== null ? num(m.rmse / ridge, 2) : "—"}</td>
              <td className="mono params-td">
                <ParamsCell p={m.params} />
              </td>
            </tr>
          ))}
          <tr className="total">
            <td>Mixture</td>
            <td>—</td>
            <td className="r">—</td>
            <td className="r">{num(mixture.rmse, 2)}</td>
            <td className="r">—</td>
            <td className="r">—</td>
            <td className="r">{pct(mixture.coverage90)}</td>
            <td className="r">{num(mixture.crps, 2)}</td>
            <td className="r">—</td>
            {regimes.map((r) => (
              <td key={r} className="r">
                —
              </td>
            ))}
            <td className="r">{ridge && mixture.rmse !== null ? num(mixture.rmse / ridge, 2) : "—"}</td>
            <td />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default function ModelsView() {
  const property = useCockpit((s) => s.property);
  const models = useModels(property);
  const cal = useCalibration(property);
  const cfg = useConfig();
  const R = cfg.data?.R ?? 7;
  const evalNote = models.data?.eval;

  return (
    <div className="page">
      <PageHeader
        title={`Model Comparison & Parameters · ${propLabel(property)}`}
        question="How good is each model, and what are its parameters?"
        actions={
          evalNote ? (
            <span className="chip mono">
              held-out: {evalNote.runs.slice(0, 3).join(", ")}
              {evalNote.runs.length > 3 ? ` +${evalNote.runs.length - 3}` : ""} · n={evalNote.n_minutes}
            </span>
          ) : null
        }
      />
      <Card title="Model comparison" sub="vs simulator truth on held-out minutes · click headers to sort">
        <QueryView q={models} height={240} isEmpty={(d) => !d.models?.length} empty={<EmptyState title="No trained models" detail={models.data?.eval?.note ?? "The API reports no model cards for this property yet."} />}>
          {(d) => (
            <>
              <ModelTable models={d.models} mixture={d.mixture} />
              {d.models.some((m) => typeof m.params?.physics === "string" || typeof m.params?.residual === "string") ? (
                <div className="stack" style={{ marginTop: 12, gap: 4 }}>
                  {d.models
                    .filter((m) => typeof m.params?.physics === "string" || typeof m.params?.residual === "string")
                    .map((m) => (
                      <div key={m.model_id} className="muted" style={{ fontSize: 12 }}>
                        <b style={{ color: "var(--text)" }}>{m.label}</b>
                        {typeof m.params.physics === "string" ? <> · physics: <span className="mono">{m.params.physics}</span></> : null}
                        {typeof m.params.residual === "string" ? <> · residual: <span className="mono">{m.params.residual}</span></> : null}
                      </div>
                    ))}
                </div>
              ) : null}
              {d.eval?.note ? <p className="muted" style={{ fontSize: 12 }}>{d.eval.note}</p> : null}
            </>
          )}
        </QueryView>
      </Card>
      {cal.isLoading ? (
        <LoadingBlock height={340} />
      ) : cal.isError ? (
        <Card>
          <ErrorState error={cal.error} onRetry={() => cal.refetch()} />
        </Card>
      ) : cal.data ? (
        <div className="grid">
          <Card className="s-4 s-md-6" title="Parity: predicted vs simulator truth">
            {Object.keys(cal.data.parity ?? {}).length ? <ParityPlot cal={cal.data} R={R} /> : <EmptyState title="No parity data" />}
          </Card>
          <Card className="s-5 s-md-6" title="Residuals over time" sub={`±R = ${R} °F band`}>
            {cal.data.residuals?.time_idx?.length ? <ResidualsChart cal={cal.data} R={R} /> : <EmptyState title="No residuals" />}
          </Card>
          <Card className="s-3 s-md-6" title="Per-regime RMSE">
            {models.data?.models?.length ? <RegimeBars models={models.data.models} /> : <EmptyState title="No regime metrics" />}
          </Card>
          <Card className="s-4 s-md-6" title="GPR relevance" sub="1 / length-scale · top 15">
            {cal.data.gpr_relevance?.length ? <RelevanceBars cal={cal.data} /> : <EmptyState title="No GPR relevance" />}
          </Card>
          <Card className="s-4 s-md-6" title="Hybrid decomposition" sub="physics term vs ML delta">
            {cal.data.hybrid_decomposition?.time_idx?.length ? <DecompositionChart cal={cal.data} /> : <EmptyState title="No decomposition" />}
          </Card>
          <Card className="s-4 s-md-6" title="PINN member spread">
            {cal.data.pinn_members?.members?.length ? <PinnSpread cal={cal.data} /> : <EmptyState title="No PINN members" />}
          </Card>
        </div>
      ) : null}
    </div>
  );
}
