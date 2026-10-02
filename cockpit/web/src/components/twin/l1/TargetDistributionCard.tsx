"use client";

/**
 * L1 rail — "Target distribution N(μ,σ)" (verbatim VN-1/VN-5; SDD-L1-03 amended). For the fractionator the committee
 * members and their mixture come from GET /api/distribution (same source as the legacy Confidence view); for the
 * other units the regime surrogate's ŷ ± σ at the cursor is drawn as one Gaussian. Plan (gold), spec / tolerance
 * (rose) and the measured value (cyan) sit on the same axis so the operator sees belief vs target vs reality at once.
 */

import { useMemo } from "react";
import { useCockpit } from "@/lib/store";
import { useDistribution } from "@/lib/api";
import { modelColor, modelLabel, MODEL_ORDER } from "@/lib/theme";
import { indexAtMin } from "@/lib/l1";
import { pOnSpec, type GaussMember } from "@/lib/gauss";
import type { TwinWorkbench } from "@/lib/twinTypes";
import GaussianPdf from "@/components/twin/shared/GaussianPdf";

const num = (v: number | null | undefined, d = 1) => (v == null || !Number.isFinite(v) ? "—" : v.toFixed(d));

export default function TargetDistributionCard({ data, runId, timeMin }: { data: TwinWorkbench; runId: string; timeMin: number }) {
  const theme = useCockpit((s) => s.theme);
  const property = useCockpit((s) => s.property);
  const isU4 = data.unit.unit_id === "unit_4_fractionator";
  const dist = useDistribution(isU4 ? runId : null, property, timeMin);

  const local = useMemo(() => {
    const panel = data.panels.find((p) => p.kind === "measured_vs_expected" && (!isU4 || p.traces?.some((t) => t.key === property)))
      ?? data.panels.find((p) => p.kind === "measured_vs_expected");
    const tag = panel?.traces?.find((t) => t.role === "measured")?.key ?? data.analysis.primary_tag;
    const i = indexAtMin(data.series.time_min, timeMin);
    const at = (k: string) => (i < 0 ? null : (data.series.keys[k]?.[i] ?? null));
    const measured = at(tag);
    const exp = at(`expected:${tag}`);
    const lo = at(`band_lo:${tag}`), hi = at(`band_hi:${tag}`);
    const sigma = lo != null && hi != null ? Math.max((hi - lo) / 4, 1e-6) : (data.models.surrogate.resid_sd?.[tag] ?? null);
    const plan = panel?.hlines?.find((h) => h.role === "plan")?.value ?? data.unit.headline_kpi?.plan ?? null;
    const specHi = panel?.hlines?.find((h) => h.role === "spec")?.value ?? null;
    const tol = data.unit.headline_kpi?.tol ?? null;
    const unit = panel?.unit ?? data.unit.headline_kpi?.unit ?? "";
    const label = panel?.traces?.find((t) => t.role === "measured")?.label ?? data.unit.headline_kpi?.label ?? tag;
    return { tag, measured, exp, sigma, plan, specHi, tol, unit, label };
  }, [data, isU4, property, timeMin]);

  let members: GaussMember[] = [];
  let spec: { lo?: number | null; hi?: number | null; label?: string } | null = null;
  let truth: number | null = local.measured;
  let gateLine: string | null = null;
  if (isU4 && dist.data && dist.data.members) {
    const d = dist.data;
    const ids = [...MODEL_ORDER, ...Object.keys(d.members).filter((k) => !MODEL_ORDER.includes(k))].filter((k) => d.members[k]);
    members = ids.map((id) => {
      const m = d.members[id];
      return { id, label: modelLabel(id), mu: m.mu, sigma: m.sigma, weight: m.weight, color: modelColor(id, theme), dashed: m.shadow || !m.admitted };
    });
    spec = { hi: d.spec_max, label: "spec" };
    truth = d.truth ?? local.measured;
    gateLine = `W90 ${num(d.w90)} / ${num(d.w90_limit, 0)} · gate ${d.gate.status}${d.bimodal ? " · bimodal" : ""}`;
  } else if (local.exp != null && local.sigma != null) {
    members = [{ id: "surrogate", label: `${data.models.surrogate.name} (${data.models.surrogate.regime_id})`, mu: local.exp, sigma: local.sigma, weight: 1, color: modelColor("hybrid_delta_v1", theme) }];
    spec = local.specHi != null
      ? { hi: local.specHi, label: "spec" }
      : local.plan != null && local.tol != null
        ? { lo: local.plan - local.tol, hi: local.plan + local.tol, label: "tol" }
        : null;
  }
  const belief = members.length === 1 ? members[0] : null;
  const pSpec = belief && spec ? pOnSpec(belief.mu, belief.sigma, spec.lo, spec.hi) : isU4 && dist.data ? dist.data.mixture.p_on_spec : null;

  return (
    <section className="l1-card l1-gauss" data-testid="target-distribution">
      <h3 className="l1-card-title">
        Target distribution <span className="l1-card-sub">N(μ, σ) · {local.label}</span>
      </h3>
      {members.length ? (
        <GaussianPdf
          members={members}
          target={local.plan != null ? { value: local.plan, label: "plan" } : null}
          spec={spec}
          measured={truth}
          unit={local.unit}
          height={150}
          ariaLabel={`Target distribution for ${local.label}`}
        />
      ) : (
        <p className="l1-card-note">{isU4 && dist.isLoading ? "Loading committee distribution…" : "No expected-value model for this tag at the cursor."}</p>
      )}
      <div className="l1-gauss-legend">
        {members.map((m) => (
          <span key={m.id} className="l1-gauss-chip" style={{ color: m.color }}>
            <i style={{ background: m.color }} /> {m.label} <span className="mono">μ {num(m.mu)} σ {num(m.sigma, 2)}</span>{members.length > 1 ? <span className="muted"> w {num(m.weight, 2)}</span> : null}
          </span>
        ))}
      </div>
      <dl className="l1-kv">
        {local.plan != null ? (<><dt>Plan / sweet spot</dt><dd className="mono">{num(local.plan)} {local.unit}</dd></>) : null}
        {spec?.hi != null && spec.lo == null ? (<><dt>Spec</dt><dd className="mono">≤ {num(spec.hi)} {local.unit}</dd></>) : null}
        {spec?.lo != null ? (<><dt>Tolerance</dt><dd className="mono">{num(spec.lo)} – {num(spec.hi)} {local.unit}</dd></>) : null}
        {truth != null ? (<><dt>Measured now</dt><dd className="mono">{num(truth)} {local.unit}</dd></>) : null}
        {pSpec != null ? (<><dt>P(on-spec)</dt><dd className={`mono ${pSpec >= 0.9 ? "ok" : pSpec >= 0.6 ? "warn" : "bad"}`}>{Math.round(pSpec * 100)} %</dd></>) : null}
        {gateLine ? (<><dt>Spread</dt><dd className="mono">{gateLine}</dd></>) : null}
      </dl>
    </section>
  );
}
