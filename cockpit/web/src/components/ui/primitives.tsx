"use client";

import type { ReactNode } from "react";
import { HttpError } from "@/lib/api";
import { citationLabel } from "@/lib/format";
import { useCockpit } from "@/lib/store";
import type { Citation, GateStatus, TrustLevel } from "@/lib/types";
import {
  IconAlert,
  IconDatabase,
  IconInfo,
  IconOctagon,
  IconRefresh,
  IconShieldCheck,
  IconClock,
} from "./icons";

export function PageHeader({
  title,
  question,
  actions,
}: {
  title: ReactNode;
  question: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        <p className="question">{question}</p>
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}

export function Card({
  title,
  sub,
  actions,
  children,
  className = "",
  bodyClass = "",
  footer,
  id,
}: {
  title?: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClass?: string;
  footer?: ReactNode;
  id?: string;
}) {
  return (
    <section className={`card ${className}`} id={id} aria-label={typeof title === "string" ? title : undefined}>
      {title || actions ? (
        <div className="card-h">
          <h2>
            {title}
            {sub ? <span className="card-sub">{sub}</span> : null}
          </h2>
          {actions ? <div className="row">{actions}</div> : null}
        </div>
      ) : null}
      <div className={`card-b ${bodyClass}`}>{children}</div>
      {footer ? <div className="card-foot">{footer}</div> : null}
    </section>
  );
}

const TRUST_META: Record<TrustLevel, { cls: string; label: string; Icon: typeof IconShieldCheck }> = {
  GREEN: { cls: "green", label: "Trust GREEN", Icon: IconShieldCheck },
  AMBER: { cls: "amber", label: "Trust AMBER", Icon: IconAlert },
  RED: { cls: "red", label: "Trust RED", Icon: IconOctagon },
};

/** Trust is always icon + text + colour (SDD-UI-08). */
export function TrustBadge({ level, short = false }: { level: TrustLevel | string | null | undefined; short?: boolean }) {
  const m = TRUST_META[(level as TrustLevel) ?? "RED"];
  if (!m) return <span className="badge neutral">Trust —</span>;
  return (
    <span className={`badge ${m.cls}`}>
      <m.Icon />
      {short ? (level as string) : m.label}
    </span>
  );
}

export function GateBadge({ status }: { status: GateStatus | string | null | undefined }) {
  if (status === "WITHHELD")
    return (
      <span className="badge amber">
        <IconAlert />
        Gate WITHHELD
      </span>
    );
  if (status === "PASS")
    return (
      <span className="badge green">
        <IconShieldCheck />
        Gate PASS
      </span>
    );
  return <span className="badge neutral">Gate —</span>;
}

/** F5 gate banner: renders the API message verbatim. */
export function GateBanner({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className="banner withheld" role="alert">
      <IconAlert />
      <div className="stack" style={{ gap: 4 }}>
        <div>
          <span className="banner-title">Recommendation withheld. </span>
          {message}
        </div>
        {action}
      </div>
    </div>
  );
}

/** Citation chip: opens a compact source preview inside the Gemini panel. */
export function CitationChip({ c }: { c: Citation }) {
  const openSource = useCockpit((s) => s.openSource);
  return (
    <button
      type="button"
      className="cite"
      onClick={() => openSource(c)}
      title={`Preview ${c.doc_id}${c.title ? ` — ${c.title}` : ""}`}
      aria-label={`Open source preview ${citationLabel(c)}`}
    >
      {citationLabel(c)}
    </button>
  );
}

export function Citations({ items }: { items: Citation[] | undefined }) {
  if (!items?.length) return null;
  return (
    <div className="cites">
      {items.map((c, i) => (
        <CitationChip key={`${c.doc_id}-${c.section}-${i}`} c={c} />
      ))}
    </div>
  );
}

export function Skeleton({ height = 200, width = "100%" }: { height?: number | string; width?: number | string }) {
  return <div className="skeleton" style={{ height, width }} aria-hidden />;
}

export function LoadingBlock({ height = 220, label = "Loading simulated data" }: { height?: number; label?: string }) {
  return (
    <div role="status" aria-live="polite" style={{ position: "relative" }}>
      <span className="sr-only">{label}</span>
      <Skeleton height={height} />
    </div>
  );
}

export function EmptyState({ title, detail, icon }: { title: string; detail?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="state" role="status">
      {icon ?? <IconDatabase />}
      <div className="state-title">{title}</div>
      {detail ? <div className="state-detail">{detail}</div> : null}
    </div>
  );
}

export function ErrorState({ error, onRetry, title = "Could not load data" }: { error: unknown; onRetry?: () => void; title?: string }) {
  const msg =
    error instanceof HttpError
      ? `${error.message}${error.detail ? ` — ${error.detail}` : ""}`
      : error instanceof Error
        ? error.message
        : String(error);
  return (
    <div className="state error" role="alert">
      <IconAlert />
      <div className="state-title">{title}</div>
      <div className="state-detail">{msg}</div>
      {onRetry ? (
        <button className="btn sm" onClick={onRetry} type="button">
          <IconRefresh /> Retry
        </button>
      ) : null}
    </div>
  );
}

interface QueryLike<T> {
  data: T | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => unknown;
}

/**
 * Renders loading / error / empty / data states for a TanStack query (SDD-UI-10).
 */
export function QueryView<T>({
  q,
  children,
  isEmpty,
  empty,
  height = 220,
}: {
  q: QueryLike<T>;
  children: (data: T) => ReactNode;
  isEmpty?: (d: T) => boolean;
  empty?: ReactNode;
  height?: number;
}) {
  if (q.isLoading) return <LoadingBlock height={height} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (q.data === undefined) return <>{empty ?? <EmptyState title="No simulated run selected" />}</>;
  if (isEmpty?.(q.data)) return <>{empty ?? <EmptyState title="No data for this selection" />}</>;
  return <>{children(q.data)}</>;
}

export function NoRun() {
  return (
    <EmptyState
      title="No simulated run selected"
      detail="Pick a run in the top bar. Runs are served by the cockpit API from sim_octave/data."
    />
  );
}

export function StaleBadge({ show, label = "Stale — no update for over 2 min" }: { show: boolean; label?: string }) {
  if (!show) return null;
  return (
    <span className="stale" role="status">
      <IconClock width={13} height={13} />
      {label}
    </span>
  );
}

export function PlannedState({ feature, title, bullets }: { feature: string; title: string; bullets: string[] }) {
  return (
    <section className="card">
      <div className="planned">
        <span className="badge neutral">
          <IconInfo /> Demo+ — planned · {feature}
        </span>
        <h2>{title}</h2>
        <p>
          This page is part of the Demo+ scope. Its API endpoint is not yet served, so the cockpit shows no data here
          rather than placeholder values.
        </p>
        <ul>
          {bullets.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Tiny inline SVG sparkline for KPI tiles. */
export function Sparkline({
  values,
  limit,
  color = "var(--accent)",
  label,
}: {
  values: (number | null)[];
  limit?: number;
  color?: string;
  label: string;
}) {
  const v = values.filter((x): x is number => x !== null && Number.isFinite(x));
  if (v.length < 2) return null;
  const min = Math.min(...v, limit ?? Infinity);
  const max = Math.max(...v, limit ?? -Infinity);
  const span = max - min || 1;
  const W = 76;
  const H = 22;
  const step = W / (values.length - 1);
  let d = "";
  values.forEach((y, i) => {
    if (y === null || !Number.isFinite(y)) return;
    const px = i * step;
    const py = H - 2 - ((y - min) / span) * (H - 4);
    d += `${d ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`;
  });
  const ly = limit !== undefined ? H - 2 - ((limit - min) / span) * (H - 4) : null;
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} preserveAspectRatio="none">
      {ly !== null ? (
        <line x1="0" x2={W} y1={ly} y2={ly} stroke="var(--red)" strokeDasharray="3 2" strokeWidth="1" />
      ) : null}
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
