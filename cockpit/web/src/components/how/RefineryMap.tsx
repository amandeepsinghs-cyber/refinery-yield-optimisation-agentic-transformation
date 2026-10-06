"use client";

/**
 * FP-1 "The refinery — and where your use cases fit" (SDD §14.6E SDD-FP-02..05, BDD-37).
 * Top-level refinery flow; IOCL use cases pinned on the step where IOCL named them, each with its status dot;
 * the FCC is where we built and opens /twin. Statuses come from USE_CASES; no value figures (U3).
 */
import Link from "next/link";
import { REFINERY_STEPS, UC_PINS, USE_CASES, statusSummary, type RefineryStep, type UcPin } from "@/lib/howItWorks";
import StatusDot, { STATUS_ORDER } from "./StatusDot";

const UC = Object.fromEntries(USE_CASES.map((u) => [u.id, u]));
const STEP = Object.fromEntries(REFINERY_STEPS.map((s) => [s.id, s]));

/** U# label for a cockpit link: "/twin/unit/unit_4_fractionator" → "U4"; "/twin" → "FCC Complex". */
export function unitLabel(href: string): string {
  const m = href.match(/unit_(\d)_/);
  return m ? `U${m[1]}` : "FCC Complex";
}

const pinName = (uc: string) => {
  const r = UC[uc]?.row ?? "";
  return r.startsWith("#") ? `IOCL ${r}` : "Feedstock evaluation";
};

function Pin({ p }: { p: UcPin }) {
  const u = UC[p.uc];
  if (!u) return null;
  return (
    <details className="rf-pin">
      <summary>
        <StatusDot status={u.status} word={false} />
        <b>{pinName(p.uc)}</b>
        {p.fccEquivalent && <small>shown on FCC · {unitLabel(p.href)}</small>}
      </summary>
      <div className="rf-card" role="note">
        <p className="rf-card-iocl"><em>IOCL · {u.where}</em>{u.iocl}</p>
        <p><em>What we built</em>{u.here}</p>
        <p className="rf-card-foot">
          <StatusDot status={u.status} />
          {p.fccEquivalent && <span className="rf-eq">FCC equivalent</span>}
          <Link href={p.href}>Open {unitLabel(p.href)} →</Link>
        </p>
      </div>
    </details>
  );
}

function Step({ s }: { s: RefineryStep }) {
  const pins = UC_PINS.filter((p) => p.step === s.id);
  return (
    <div className={s.fcc ? "rf-step rf-fcc" : "rf-step"} id={`rf-${s.id}`}>
      <div className="rf-step-top">
        {s.fcc ? <Link href="/twin" className="rf-name">{s.name} →</Link> : <b className="rf-name">{s.name}</b>}
        {s.fcc && <span className="rf-built">Where we built</span>}
      </div>
      <p className="rf-what">{s.what}</p>
      {(pins.length > 0 || s.notClaimed) && (
        <div className="rf-pins">
          {pins.map((p) => <Pin key={p.uc} p={p} />)}
          {s.notClaimed && (
            <span className="rf-nc" title="Same pattern, next agent">
              <StatusDot status="absent" word={false} />{s.notClaimed} · not claimed
            </span>
          )}
        </div>
      )}
    </div>
  );
}

const MIDDLE = ["reformer", "hydrotreaters", "fcc", "coker", "lpg"];

export default function RefineryMap() {
  return (
    <section className="rf" aria-labelledby="rf-h">
      <h2 id="rf-h" className="pf-h2">The refinery — and where your use cases fit</h2>
      <p className="pf-sub">
        The crude changes every 1–2 days, so every unit downstream has to keep adjusting. The FCC is fed heavy gas oil from
        the crude unit, not crude: the crude slate changes the FCC feed. Click a pin to see what we built for it.
      </p>

      <div className="rf-flow">
        <div className="rf-col">
          <Step s={STEP.crude} />
          <span className="rf-down" aria-hidden>↓ crude</span>
          <Step s={STEP.cdu} />
        </div>

        <ol className="rf-col rf-mid" aria-label="Units fed by the crude unit">
          {MIDDLE.map((id) => (
            <li key={id} className="rf-row">
              <span className="rf-stream">{STEP[id].stream} →</span>
              <Step s={STEP[id]} />
            </li>
          ))}
        </ol>

        <div className="rf-col rf-out">
          <span className="rf-stream">all products →</span>
          <Step s={STEP.blending} />
        </div>
      </div>

      <div className="rf-util">
        <Step s={STEP.utilities} />
      </div>

      <div className="rf-legend">
        <span className="rf-legend-dots">
          {STATUS_ORDER.map((s) => <StatusDot key={s} status={s} />)}
          <span className="rf-eq">FCC equivalent = IOCL named a unit we do not have; the same problem is shown on the FCC</span>
        </span>
        <b className="rf-summary">{statusSummary()}</b>
      </div>
    </section>
  );
}
