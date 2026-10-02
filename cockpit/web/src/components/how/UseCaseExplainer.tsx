"use client";

/**
 * On-screen "how it works" (owner, 2 Oct 14:40–14:49): no separate page. Each IOCL use case explains itself where it
 * is used — the home page's use-case chips and the top of each unit page — and each step ①–④ of the unit page says
 * what it answers, which parts answer it, what goes in and out, and how to read its curves.
 * Content: src/lib/howItWorks.ts (one source, use cases in IOCL order).
 */

import Link from "next/link";
import {
  DECISIONS, PARTS, PART_NAME, STATUS_LABEL, STEP_HOW, UC_DETAIL, UNIT_UCS, USE_CASES,
  type PartId, type StepKey,
} from "@/lib/howItWorks";

const ORDER: PartId[] = ["watch", "crude", "estimators", "response", "checks", "optimiser", "gemini"];
const PART = Object.fromEntries(PARTS.map((p) => [p.id, p])) as Record<PartId, (typeof PARTS)[number]>;
/** Where each part shows on a unit page. */
const PART_STEP: Record<PartId, string | null> = {
  watch: "#s-observe", crude: "#s-observe", estimators: "#s-observe", response: "#s-decide", optimiser: "#s-decide",
  checks: "#s-optimise", gemini: null,
};

function PartChip({ id, onUnit }: { id: PartId; onUnit: boolean }) {
  const p = PART[id];
  const tip = `${p.question} — ${p.kind}`;
  const inner = <><i>{p.n}</i>{p.name}</>;
  const href = onUnit ? PART_STEP[id] : null;
  return href ? <a href={href} title={tip}>{inner}</a> : <span title={tip}>{inner}</span>;
}

/** Step link shown in the flow headers on a unit page, e.g. "→ ②". */
const See = ({ on, href, n }: { on: boolean; href: string; n: string }) => (on ? <a className="uce-see" href={href}>see {n}</a> : null);

export default function UseCaseExplainer({ id, onUnit = false, unitId }: { id: string; onUnit?: boolean; unitId?: string }) {
  const u = USE_CASES.find((x) => x.id === id);
  const x = UC_DETAIL[id];
  if (!u || !x) return null;
  const ds = DECISIONS.filter((d) => u.decisions.includes(d.id));
  const used = new Set<PartId>();
  ds.forEach((d) => d.parts.forEach((p) => used.add(p)));
  const parts = x.parts ? ORDER.filter((p) => x.parts!.includes(p)) : ORDER.filter((p) => used.has(p));
  return (
    <div className={`uce s-${u.status}`}>
      <header className="uce-h">
        <span className="uce-row">IOCL use case {u.row} · {u.where}</span>
        <h4>{u.iocl}</h4>
        <span className={`hw-pill s-${u.status}`}>{STATUS_LABEL[u.status]}</span>
      </header>
      <div className="uce-ps">
        <div><span className="uce-k bad">The problem today</span><p>{u.problem}</p></div>
        <div><span className="uce-k ok">How the cockpit solves it</span><p>{u.here}</p></div>
      </div>
      <ol className="uce-flow" aria-label="How it works for this use case">
        <li><span className="uce-k">In <See on={onUnit} href="#s-data" n="①" /></span><ul>{x.inputs.map((t) => <li key={t}>{t}</li>)}</ul></li>
        <li><span className="uce-k">Parts that do the work <See on={onUnit} href="#s-observe" n="②" /></span>
          <ul className="uce-parts">{parts.map((p) => <li key={p}><PartChip id={p} onUnit={onUnit} /></li>)}</ul>
        </li>
        <li><span className="uce-k">How the decision is made <See on={onUnit} href="#s-optimise" n="④" /></span><p>{x.decides}</p></li>
        <li><span className="uce-k">Out <See on={onUnit} href="#s-decide" n="③" /></span><ul>{x.outputs.map((t) => <li key={t}>{t}</li>)}</ul></li>
        <li className="uce-val"><span className="uce-k ok">Value · {x.valueArea}</span><p>{x.value}</p></li>
      </ol>
      <p className="uce-foot">
        {ds.map((d) => (
          <span key={d.id}>
            <b>{d.id}</b> {d.question}{" "}
            {d.unitHref && !(unitId && d.unitHref.endsWith(unitId)) ? <Link href={d.unitHref}>Open {d.unit} →</Link>
              : d.unitHref ? <a href="#s-decide">on this page, step ③</a> : <em>({d.unit})</em>}
          </span>
        ))}
      </p>
    </div>
  );
}

/** Top of a unit page: the IOCL use cases this unit solves, in IOCL order; the first is open. */
export function UnitUseCases({ unitId }: { unitId: string }) {
  const ids = (UNIT_UCS[unitId] ?? []).filter((i) => UC_DETAIL[i]);
  if (!ids.length) return null;
  const home = unitId === "refinery";
  return (
    <section className="uuc" id="s-why" aria-label="What this screen solves">
      <h2 className="uuc-h">What this screen solves <span>{home
        ? "Use cases only the whole-plant view can solve, in IOCL order. Every use case this shift is in the row below, and each unit page explains its own."
        : "IOCL use cases, in IOCL order. Each shows the problem, how it is solved, and which step below does the work."}</span></h2>
      {ids.map((i, n) => {
        const u = USE_CASES.find((x) => x.id === i)!;
        return (
          <details key={i} className="uuc-item" open={n === 0}>
            <summary><span className="uce-row">IOCL {u.row}</span><b>{u.iocl}</b><span className={`hw-pill s-${u.status}`}>{STATUS_LABEL[u.status]}</span></summary>
            <UseCaseExplainer id={i} onUnit={!home} unitId={home ? undefined : unitId} />
          </details>
        );
      })}
    </section>
  );
}

/** Under each step title: what it answers, who answers it, in → out, and how to read what is on screen. */
export function StepHowStrip({ k }: { k: StepKey }) {
  const s = STEP_HOW[k];
  return (
    <details className="ush" open>
      <summary><span className="ush-q">{s.q}</span><span className="ush-more">How this step works</span></summary>
      <dl>
        <div><dt>Answered by</dt><dd>{s.parts.length ? s.parts.map((p) => <span key={p} className="ush-part" title={PART[p].kind}><i>{PART[p].n}</i>{PART_NAME[p]}</span>) : s.by}</dd></div>
        <div><dt>In → out</dt><dd>{s.io[0]} <b>→</b> {s.io[1]}</dd></div>
        <div className="ush-read"><dt>How to read it</dt><dd>{s.read}</dd></div>
      </dl>
    </details>
  );
}
