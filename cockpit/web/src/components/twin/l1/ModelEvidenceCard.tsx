"use client";

/** Rail card 3 — Model evidence (SDD-L1-03): committee members & the weights the estimate uses, PINN checks, spread gate, surrogate. */

import { num } from "@/lib/format";
import type { TwinModels } from "@/lib/twinTypes";

export default function ModelEvidenceCard({ models }: { models: TwinModels }) {
  const c = models.committee;
  const weights = c?.weights ?? (c?.members ?? []).map((m) => ({ member: m.name, label: m.name, weight: m.weight }));
  const gate = models.gate;
  const gatePass = gate.status === "ISSUED" || gate.status === "PASS";
  const sur = models.surrogate;
  const r2 = sur?.r2 ? Object.entries(sur.r2).filter(([, v]) => v != null).slice(0, 3) : [];
  return (
    <section className="l1-card" data-testid="rail-evidence">
      <h3 className="l1-card-title">Model evidence</h3>
      {weights.length > 0 && (
        <table className="l1-table">
          <thead>
            <tr><th>member</th><th>weight</th><th>role</th></tr>
          </thead>
          <tbody>
            {weights.map((w) => (
              <tr key={w.member}>
                <td>{w.label}</td>
                <td className="mono">{num(w.weight, 2)}</td>
                <td className={w.weight > 0 ? "ok" : "muted"}>{w.weight > 0 ? "blended" : "reference only"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="l1-checks">
        <span className="l1-card-sub">Physics checks</span>
        {models.pinn_checks.map((p) => (
          <span key={p.name} className={`l1-check ${p.pass ? "ok" : "bad"}`} title={`${p.name}: ${p.value} ${p.unit} (limit ${p.limit})`}>
            {p.pass ? "✓" : "✗"} {p.name.replace("Tray temperature monotonicity", "tray monotonic").replace("Mass balance closure", "mass closure").replace("Reactor mass balance", "reactor balance")}{" "}
            <span className="mono">{p.unit === "violations" ? p.value : `${num(p.value, p.unit === "%" ? 2 : 1)} ${p.unit}`}</span>
          </span>
        ))}
      </div>
      <div className={`l1-gate ${gatePass ? "pass" : "withheld"}`} data-testid="spread-gate">
        Spread gate <strong>{gatePass ? "PASS" : "WITHHELD"}</strong> · W90 <span className="mono">{num(gate.w90, 1)}</span> / {num(gate.w90_limit, 0)}
        {gate.reason && !gatePass ? <span className="muted"> · {gate.reason}</span> : null}
        {gate.committee_gate && (
          <span className="l1-gate-props">
            {Object.entries(gate.committee_gate).map(([k, v]) => (
              <span key={k} className={v === "PASS" ? "ok" : "warn"}>{k.replace(/_F$/, "")}: {v}</span>
            ))}
          </span>
        )}
      </div>
      {sur && (
        <p className="l1-card-note">
          Surrogate <span className="mono">{sur.name}</span>{sur.kind ? ` — ${sur.kind}` : ""}; {sur.inputs.length} inputs · {sur.outputs.length} outputs ·{" "}
          {sur.n_train_minutes} train-min{r2.length ? ` · R² ${r2.map(([k, v]) => `${k} ${num(v as number, 2)}`).join(", ")}` : ""}.
        </p>
      )}
    </section>
  );
}
