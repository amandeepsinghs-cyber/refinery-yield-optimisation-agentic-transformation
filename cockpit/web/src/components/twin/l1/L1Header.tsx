"use client";

/** L1 header: breadcrumb back to L0, workbench title, status pill, clock / next-lab, language toggle (SDD-L1-01). */

import Link from "next/link";
import LangToggle from "@/components/twin/LangToggle";
import { clock } from "@/lib/format";
import type { TwinWorkbench } from "@/lib/twinTypes";

const STATE_PILL: Record<string, string> = { OK: "twin-pill-OK", GREEN: "twin-pill-OK", WATCH: "twin-pill-WATCH", AMBER: "twin-pill-WATCH", ACT: "twin-pill-ACT", RED: "twin-pill-ACT" };

export default function L1Header({ data }: { data: TwinWorkbench }) {
  const { unit, time, analysis, regime } = data;
  const primary = unit.headline_kpi?.label ?? analysis.primary_tag;
  const pill = STATE_PILL[unit.headline_kpi?.state ?? unit.status] ?? "twin-pill-WATCH";
  return (
    <header className="l1-header" data-testid="l1-header">
      <div className="l1-crumbs">
        <Link href="/twin" className="l1-crumb">FCC Complex Twin</Link>
        <span className="l1-crumb-sep">›</span>
        <span className="l1-crumb current">{unit.short_name}</span>
      </div>
      <div className="l1-title-row">
        <h1 className="l1-title">
          {unit.short_name.replace(/^\d+\.\s*/, "")} <span className="l1-title-sep">·</span> Unit Workbench
          <span className="l1-title-sep"> — </span>
          <span className="l1-title-prop">{primary}</span>
          {regime?.regime_label && <span className="l1-title-regime"> · {regime.regime_id} {regime.regime_label}</span>}
        </h1>
        <div className="l1-title-actions">
          <span className={pill} title={unit.status_label}>{unit.status_label}</span>
          <span className="l1-clock mono" title={`t = ${time.time_min} min`}>{clock(time.time_min)}</span>
          <span className="l1-nextlab">
            {analysis.minutes_before_next_lab != null && Number.isFinite(analysis.minutes_before_next_lab)
              ? <>next lab in <strong>{analysis.minutes_before_next_lab}</strong> min</>
              : "no further lab scheduled"}
          </span>
          <LangToggle />
        </div>
      </div>
    </header>
  );
}
