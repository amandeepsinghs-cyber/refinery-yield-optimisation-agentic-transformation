"use client";

/**
 * One IOCL use case, explained end to end (owner, 2 Oct 14:40): the problem today, how the cockpit solves it, what goes
 * in, which parts of the solution do the work, how the decision is made, what comes out, and the value. Used by the home
 * page's use-case chips and by the How it works page, so the two can never disagree. Content: src/lib/howItWorks.ts.
 */

import Link from "next/link";
import { DECISIONS, PARTS, PART_NAME, STATUS_LABEL, UC_DETAIL, USE_CASES, type PartId } from "@/lib/howItWorks";

const ORDER: PartId[] = ["watch", "crude", "estimators", "response", "checks", "optimiser", "gemini"];
const N: Record<PartId, number> = Object.fromEntries(PARTS.map((p) => [p.id, p.n])) as Record<PartId, number>;

export default function UseCaseExplainer({ id, anchor = false }: { id: string; anchor?: boolean }) {
  const u = USE_CASES.find((x) => x.id === id);
  const x = UC_DETAIL[id];
  if (!u || !x) return null;
  const ds = DECISIONS.filter((d) => u.decisions.includes(d.id));
  const used = new Set<PartId>();
  ds.forEach((d) => d.parts.forEach((p) => used.add(p)));
  const parts = x.parts ? ORDER.filter((p) => x.parts!.includes(p)) : ORDER.filter((p) => used.has(p));
  return (
    <article className={`uce s-${u.status}`} id={anchor ? u.id : undefined}>
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
        <li><span className="uce-k">In</span><ul>{x.inputs.map((t) => <li key={t}>{t}</li>)}</ul></li>
        <li><span className="uce-k">Parts that do the work</span>
          <ul>{parts.map((p) => <li key={p}><a href={`/how-it-works#part-${p}`}><i>{N[p]}</i>{PART_NAME[p]}</a></li>)}</ul>
        </li>
        <li><span className="uce-k">How the decision is made</span><p>{x.decides}</p></li>
        <li><span className="uce-k">Out</span><ul>{x.outputs.map((t) => <li key={t}>{t}</li>)}</ul></li>
        <li className="uce-val"><span className="uce-k ok">Value · {x.valueArea}</span><p>{x.value}</p></li>
      </ol>
      <p className="uce-foot">
        {ds.map((d) => (
          <span key={d.id}>
            <b>{d.id}</b> {d.question} {d.unitHref ? <Link href={d.unitHref}>Open {d.unit} →</Link> : <em>({d.unit})</em>}
          </span>
        ))}
      </p>
    </article>
  );
}
