"use client";

/**
 * Decision record (replaces the raw audit table; owner, 2 Oct 2026: "build the front end").
 *
 * The last step of the story: who decided what, when, on which unit, and every time the trust checks held advice back.
 * Same calm canvas as the home and unit pages. Each event is written as one plain sentence; the raw payload stays one
 * click away for an auditor. Test-run events (actor "pytest") are hidden unless asked for.
 * Data: GET /api/audit (recorded only — no control-system writes).
 */

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { useAudit } from "@/lib/api";
import type { AuditRow } from "@/lib/types";
import { NAME } from "@/components/twin/l0/UnitFlow";

type Kind = "accepted" | "held" | "declined" | "withheld" | "released" | "other";
type Detail = Record<string, unknown>;
type Move = { label?: string; tag?: string; from?: number; to?: number; delta?: number; unit?: string };

const KIND_LABEL: Record<Kind, string> = {
  accepted: "Accepted",
  held: "Held",
  declined: "Declined",
  withheld: "Advice withheld",
  released: "Advice released",
  other: "Event",
};
const VERB: Record<Kind, string> = {
  accepted: "accepted",
  held: "put on hold",
  declined: "declined",
  withheld: "withheld advice on",
  released: "released advice on",
  other: "recorded",
};
const REASON: Record<string, string> = {
  wide: "the prediction spread was too wide",
  bimodal: "the models disagreed",
  ood: "inputs were outside the training range",
  stale: "the data was stale",
};
const PROP: Record<string, string> = { LCO_T98_F: "LCO T98", HN_T98_F: "HN T98" };

function kindOf(r: AuditRow): Kind {
  const a = r.action.toLowerCase();
  if (a.includes("pass→withheld")) return "withheld";
  if (a.includes("withheld→pass")) return "released";
  if (a.includes("accept")) return "accepted";
  if (a.includes("hold")) return "held";
  if (a.includes("declin")) return "declined";
  return "other";
}

function who(actor: string): { name: string; system: boolean; test: boolean } {
  if (actor === "pytest") return { name: "Test run", system: false, test: true };
  if (actor.startsWith("system:")) return { name: "Trust checks", system: true, test: false };
  if (actor === "operator" || actor === "cockpit-operator") return { name: "Operator", system: false, test: false };
  const m = actor.match(/^shift_lead_(\w+)$/);
  if (m) return { name: `${m[1][0].toUpperCase()}${m[1].slice(1)}, shift lead`, system: false, test: false };
  return { name: actor.replace(/[_-]/g, " "), system: false, test: false };
}

const num = (v: unknown, d = 1) => (typeof v === "number" && Number.isFinite(v) ? v.toFixed(d) : null);
const signed = (v: number, d = 1) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(d)}`;
const asDetail = (d: AuditRow["detail"]): Detail => (d && typeof d === "object" ? (d as Detail) : d ? { note: d } : {});

/** "random_s102/LCO_T98_F@253" → run s102 · LCO T98 · minute 253 */
function gateTarget(t: string) {
  const m = t.match(/^(?:random_)?([^/]+)\/([A-Z0-9_]+)@(\d+)$/);
  if (!m) return { prop: t, where: "" };
  const min = +m[3];
  const hh = String(Math.floor(min / 60)).padStart(2, "0");
  const mm = String(min % 60).padStart(2, "0");
  return { prop: PROP[m[2]] ?? m[2], where: `run ${m[1]} · ${hh}:${mm} sim time` };
}

interface Entry {
  r: AuditRow;
  kind: Kind;
  who: ReturnType<typeof who>;
  unitId: string | null;
  subject: string;
  moves: string[];
  note: string | null;
  why: string | null;
  tags: string[];
  noWrite: boolean;
}

function toEntry(r: AuditRow): Entry {
  const kind = kindOf(r);
  const d = asDetail(r.detail);
  const w = who(r.actor);
  const unitId = typeof d.unit_id === "string" ? d.unit_id : null;
  const tags: string[] = [];
  const uc = (d.use_case ?? d.use_case_id) as string | undefined;
  if (uc) tags.push(uc);
  if (Array.isArray(d.problem)) tags.push(...(d.problem as string[]));
  if (typeof d.type === "string") tags.push(`Decision ${d.type}`);

  let subject = r.target;
  let why: string | null = null;
  const moves: string[] = [];

  if (kind === "withheld" || kind === "released") {
    const g = gateTarget(r.target);
    subject = g.prop;
    if (g.where) tags.unshift(g.where);
    if (kind === "withheld") {
      const reason = typeof d.reason === "string" ? REASON[d.reason] ?? d.reason : null;
      const w90 = num(d.w90);
      why = [reason && `Held back because ${reason}`, w90 && `90 % spread ${w90} °F`].filter(Boolean).join(" · ") || null;
      if (typeof d.message === "string" && /Suggested action:/.test(d.message)) {
        why = `${why ? `${why}. ` : ""}${d.message.split("Suggested action:")[1].trim()}`;
      }
    } else {
      why = "Checks passed again — advice is shown on screen.";
    }
  } else {
    if (Array.isArray(d.moves)) {
      for (const m of d.moves as Move[]) {
        const from = num(m.from), to = num(m.to);
        moves.push(`${m.label ?? m.tag ?? "Set point"} ${from ?? "?"} → ${to ?? "?"}${m.unit ? ` ${m.unit}` : ""}`);
      }
      subject = moves.length > 1 ? `${moves.length} moves` : "a move";
    } else if (typeof d.parameter === "string") {
      subject = d.parameter.replace(/^SP_T_preheat_F \/ /, "Preheat set point / ");
      if (typeof d.delta === "number") {
        moves.push(`${subject} ${signed(d.delta, 2)}`);
        subject = "a move";
      }
    }
    if (unitId && NAME[unitId] && subject === r.target) subject = NAME[unitId];
  }

  const note = typeof d.note === "string" && d.note && d.note !== "pytest" ? d.note : null;
  return { r, kind, who: w, unitId, subject, moves, note, why, tags, noWrite: d.control_system_write === false || w.system };
}

const dayKey = (ts: string) => ts.slice(0, 10);
const dayLabel = (k: string) => {
  const d = new Date(`${k}T00:00:00Z`);
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
};
const hhmm = (ts: string) => ts.slice(11, 16);

type Filter = "all" | "people" | "accepted" | "held" | "declined" | "withheld";

export default function DecisionRecord() {
  const [q, setQ] = useState("");
  const dq = useDeferredValue(q);
  const [filter, setFilter] = useState<Filter>("people");
  const [unit, setUnit] = useState<string>("");
  const [tests, setTests] = useState(false);
  const audit = useAudit(dq);

  const all = useMemo(() => (audit.data ?? []).map(toEntry), [audit.data]);
  const base = useMemo(() => all.filter((e) => tests || !e.who.test), [all, tests]);
  const counts = useMemo(() => {
    const c = { accepted: 0, held: 0, declined: 0, withheld: 0 };
    for (const e of base) if (e.kind in c) c[e.kind as keyof typeof c]++;
    return c;
  }, [base]);
  const units = useMemo(() => Array.from(new Set(base.map((e) => e.unitId).filter(Boolean))) as string[], [base]);

  const shown = useMemo(
    () =>
      base.filter((e) => {
        if (unit && e.unitId !== unit) return false;
        if (filter === "all") return true;
        if (filter === "people") return !e.who.system;
        return e.kind === filter;
      }),
    [base, filter, unit],
  );
  const days = useMemo(() => {
    const m = new Map<string, Entry[]>();
    for (const e of shown) {
      const k = dayKey(e.r.ts);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(e);
    }
    return Array.from(m.entries());
  }, [shown]);

  const tiles: { k: Filter; n: number; label: string; sub: string }[] = [
    { k: "accepted", n: counts.accepted, label: "Accepted", sub: "moves a person agreed to make" },
    { k: "held", n: counts.held, label: "Held", sub: "parked to wait for the lab or a check" },
    { k: "declined", n: counts.declined, label: "Declined", sub: "advice a person chose not to follow" },
    { k: "withheld", n: counts.withheld, label: "Withheld by checks", sub: "times the system stayed silent" },
  ];

  return (
    <div className="dr">
      <header className="dr-head">
        <div className="us-crumb">
          <Link href="/twin">FCC Complex</Link>
          <span>/</span>
          <span>Decision record</span>
        </div>
        <div className="dr-title">
          <h1>Decision record</h1>
          <p>
            Who decided what, on which unit, and every time the trust checks held advice back. Recorded only —
            <b> nothing here was written to the control system.</b>
          </p>
        </div>
        <div className="dr-tiles" role="group" aria-label="Filter by outcome">
          {tiles.map((t) => (
            <button
              key={t.k}
              type="button"
              className={`dr-tile k-${t.k}${filter === t.k ? " on" : ""}`}
              aria-pressed={filter === t.k}
              onClick={() => setFilter(filter === t.k ? "people" : t.k)}
            >
              <b>{t.n}</b>
              <span>{t.label}</span>
              <small>{t.sub}</small>
            </button>
          ))}
        </div>
        <div className="dr-bar">
          <div className="dr-seg" role="group" aria-label="Whose events">
            {(
              [
                ["people", "People's decisions"],
                ["all", "Everything"],
              ] as [Filter, string][]
            ).map(([k, l]) => (
              <button key={k} type="button" className={filter === k ? "on" : ""} aria-pressed={filter === k} onClick={() => setFilter(k)}>
                {l}
              </button>
            ))}
          </div>
          <label className="dr-sel">
            <span className="sr-only">Unit</span>
            <select value={unit} onChange={(e) => setUnit(e.target.value)}>
              <option value="">All units</option>
              {units.map((u) => (
                <option key={u} value={u}>
                  {NAME[u] ?? u}
                </option>
              ))}
            </select>
          </label>
          <label className="dr-check">
            <input type="checkbox" checked={tests} onChange={(e) => setTests(e.target.checked)} /> Include test runs
          </label>
          <input className="dr-q" placeholder="Search person, unit, set point…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the record" />
        </div>
      </header>

      {audit.isLoading ? (
        <p className="us-msg">Loading the record…</p>
      ) : audit.isError ? (
        <p className="us-msg">The record could not be loaded. Is the cockpit API running?</p>
      ) : !shown.length ? (
        <p className="us-msg">{q || unit || filter !== "people" ? "Nothing matches these filters." : "No decisions recorded yet. Accept, Hold or Decline on a unit page and it appears here."}</p>
      ) : (
        <div className="dr-days">
          {days.map(([k, list]) => (
            <section key={k} className="dr-day">
              <h2>
                {dayLabel(k)} <span>{list.length} event{list.length === 1 ? "" : "s"}</span>
              </h2>
              <ol className="dr-list">
                {list.map((e) => (
                  <li key={e.r.audit_id} className={`dr-ev k-${e.kind}${e.who.system ? " sys" : ""}`}>
                    <time dateTime={e.r.ts}>{hhmm(e.r.ts)}</time>
                    <span className="dr-dot" aria-hidden />
                    <div className="dr-body">
                      <p className="dr-line">
                        <b>{e.who.name}</b> {VERB[e.kind]} <b>{e.subject}</b>
                        {e.unitId && NAME[e.unitId] && e.subject !== NAME[e.unitId] ? (
                          <>
                            {" "}on{" "}
                            <Link href={`/twin/unit/${e.unitId}`} className="dr-unit">
                              {NAME[e.unitId]}
                            </Link>
                          </>
                        ) : null}
                        <span className={`dr-kind k-${e.kind}`}>{KIND_LABEL[e.kind]}</span>
                      </p>
                      {e.moves.length ? <p className="dr-moves">{e.moves.join(" · ")}</p> : null}
                      {e.why ? <p className="dr-why">{e.why}</p> : null}
                      {e.note ? <p className="dr-note">“{e.note}”</p> : null}
                      <div className="dr-meta">
                        {e.tags.map((t) => (
                          <span key={t}>{t}</span>
                        ))}
                        {e.noWrite ? <span className="ok">No control-system write</span> : null}
                        <details>
                          <summary>Raw entry</summary>
                          <pre>{JSON.stringify(e.r, null, 2)}</pre>
                        </details>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
