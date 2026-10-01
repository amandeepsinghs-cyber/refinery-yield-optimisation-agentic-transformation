"use client";

/** Unit I/O strip (SDD-L1-01 / L1-07 "Data"): feeds in → unit → products out, headline KPI vs plan ± tol inline. */

import { num } from "@/lib/format";
import { stripInputs } from "@/lib/l1";
import type { TwinUnit } from "@/lib/twinTypes";

function Val({ label, value, unit }: { label: string; value: number; unit: string }) {
  const digits = Math.abs(value) >= 1000 ? 0 : Math.abs(value) >= 100 ? 0 : 1;
  return (
    <span className="l1-io-val">
      {label} <strong className="mono">{num(value, digits)}</strong>{unit ? ` ${unit}` : ""}
    </span>
  );
}

export default function UnitIOStrip({ unit }: { unit: TwinUnit }) {
  const inputs = stripInputs(unit.io.inputs, 4);
  const outputs = unit.io.outputs.slice(0, 5);
  const k = unit.headline_kpi;
  return (
    <div className="l1-io" data-testid="unit-io-strip">
      <div className="l1-io-side">
        <span className="l1-io-tag">IN</span>
        {inputs.map((i) => <Val key={i.tag} label={i.label} value={i.value} unit={i.unit} />)}
      </div>
      <div className="l1-io-arrow" aria-hidden>→</div>
      <div className="l1-io-unit" title={unit.name}>{unit.short_name.replace(/^\d+\.\s*/, "")}</div>
      <div className="l1-io-arrow" aria-hidden>→</div>
      <div className="l1-io-side">
        <span className="l1-io-tag">OUT</span>
        {k && (
          <span className={`l1-io-val l1-io-kpi state-${k.state ?? "OK"}`} data-testid="headline-kpi">
            {k.label} <strong className="mono">{num(k.value, 1)} {k.unit}</strong>
            <span className="l1-io-plan"> (plan {num(k.plan, 1)} ± {num(k.tol, 0)})</span>
          </span>
        )}
        {outputs.map((o) => <Val key={o.tag} label={o.label} value={o.value} unit={o.unit} />)}
      </div>
    </div>
  );
}
