"use client";

import { useMemo, useState } from "react";
import { clock, num } from "@/lib/format";
import { Card } from "@/components/ui/primitives";
import {
  MultiTraceUnitChart,
  type SentinelLang,
  ThreeZoneEnvelopeBar,
  TwinDecisionActionCard,
  UnitTagTable,
  badgeClass,
  speakText,
} from "@/components/twin/RefineryTwinSchematic";
import type { TwinSentinelAgent, TwinState, TwinUseCase } from "@/lib/types";

export default function UseCaseCatalogueView({
  twin,
  initialUseCaseId,
  onHighlightUnitOnTwin,
}: {
  twin: TwinState;
  initialUseCaseId?: string | null;
  onHighlightUnitOnTwin?: (unitId: string) => void;
}) {
  const [selectedId, setSelectedId] = useState<string>(initialUseCaseId || "UC-01");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [downstreamTierFilter, setDownstreamTierFilter] = useState<string>("ALL");
  const [lang, setLang] = useState<SentinelLang>("en");

  const categories = useMemo(() => {
    const s = new Set<string>();
    twin.use_cases.forEach((uc) => s.add(uc.category));
    return ["ALL", ...Array.from(s)];
  }, [twin.use_cases]);

  const filteredUseCases = useMemo(
    () =>
      categoryFilter === "ALL"
        ? twin.use_cases
        : twin.use_cases.filter((u) => u.category === categoryFilter),
    [twin.use_cases, categoryFilter],
  );

  const activeUseCase: TwinUseCase = useMemo(
    () =>
      twin.use_cases.find((u) => u.id === selectedId) ??
      filteredUseCases[0] ??
      twin.use_cases[0],
    [twin.use_cases, filteredUseCases, selectedId],
  );

  const activeAgent: TwinSentinelAgent | undefined = useMemo(
    () =>
      (twin.agent_fleet ?? []).find(
        (a) => a.use_case_ids.includes(activeUseCase.id) || a.unit_id === activeUseCase.unit_id,
      ) ?? (twin.agent_fleet ?? [])[0],
    [twin.agent_fleet, activeUseCase],
  );

  const filteredDownstream = useMemo(
    () =>
      downstreamTierFilter === "ALL"
        ? twin.downstream_cases_summary
        : twin.downstream_cases_summary.filter((d) => d.tier === downstreamTierFilter),
    [twin.downstream_cases_summary, downstreamTierFilter],
  );

  const pr = twin.pinn_residuals;

  return (
    <div className="stack" style={{ gap: 16 }} data-testid="use-case-catalogue-view">
      {/* 1. Master System Tree + Full Use-Case Operational Workspace */}
      <Card
        title="Plant Head Requirement Explorer · All 11 Core FCC/Fractionator Use Cases (UC-01 to UC-11)"
        sub={`Live Digital Twin Operational Workspaces at t ${twin.provenance.time_min} (${clock(twin.provenance.time_min)}) on Run ${twin.provenance.run_id} · Select any use case to inspect its live trends, tag table & actionable decisions`}
        actions={
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <div className="seg" role="group" aria-label="Filter use cases by engineering domain">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  aria-pressed={categoryFilter === cat}
                  onClick={() => setCategoryFilter(cat)}
                >
                  {cat === "ALL" ? "All 11 Core" : cat.split("&")[0].trim()}
                </button>
              ))}
            </div>
            <div className="seg" role="group" aria-label="Select sentinel briefing language">
              {(
                [
                  { id: "en", label: "EN" },
                  { id: "hinglish", label: "Hinglish" },
                  { id: "hi", label: "हिंदी" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  data-testid={`uc-lang-${opt.id}`}
                  aria-pressed={lang === opt.id}
                  onClick={() => setLang(opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        }
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(255px, 310px) minmax(0, 1fr)",
            gap: 16,
            alignItems: "start",
          }}
        >
          {/* Left Rail: System Tree Organized by Physical Refinery Units */}
          <div
            className="stack"
            style={{
              gap: 10,
              padding: "10px",
              borderRadius: "var(--radius-sm)",
              background: "var(--surface)",
              border: "1px solid var(--border)",
            }}
            role="navigation"
            aria-label="11 Core Use Cases System Tree"
          >
            <div className="mono muted" style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              6-Unit System Hierarchy · 11 Use Cases
            </div>
            {twin.units.map((unit) => {
              const unitUcs = filteredUseCases.filter((u) => u.unit_id === unit.unit_id);
              if (unitUcs.length === 0) return null;
              return (
                <div key={unit.unit_id} className="stack" style={{ gap: 5 }}>
                  <div
                    className="row between"
                    style={{
                      padding: "4px 6px",
                      borderRadius: 4,
                      background: "var(--elevated)",
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    <span>{unit.short_name}</span>
                    <span className={`badge ${badgeClass(unit.status)}`} style={{ fontSize: 9 }}>
                      {unit.status}
                    </span>
                  </div>
                  {unitUcs.map((uc) => {
                    const active = uc.id === activeUseCase.id;
                    return (
                      <button
                        key={uc.id}
                        type="button"
                        data-testid={`uc-pill-${uc.id}`}
                        onClick={() => setSelectedId(uc.id)}
                        style={{
                          textAlign: "left",
                          padding: "8px 10px",
                          borderRadius: 6,
                          border: active ? "2px solid #38bdf8" : "1px solid var(--border)",
                          background: active
                            ? "linear-gradient(180deg, rgba(56,189,248,0.16) 0%, rgba(15,23,42,0.75) 100%)"
                            : "var(--elevated)",
                          color: "var(--text)",
                          cursor: "pointer",
                          display: "flex",
                          flexDirection: "column",
                          gap: 3,
                        }}
                      >
                        <div className="row between" style={{ gap: 6 }}>
                          <span className="mono" style={{ fontWeight: 700, fontSize: 11, color: "#38bdf8" }}>
                            {uc.id} · Req #{uc.number}
                          </span>
                          <span className={`badge ${badgeClass(uc.status)}`} style={{ fontSize: 9 }}>
                            {uc.status}
                          </span>
                        </div>
                        <div style={{ fontWeight: 600, fontSize: 11.5, lineHeight: 1.3 }}>
                          {uc.title}
                        </div>
                        <div className="mono muted" style={{ fontSize: 9.5 }}>
                          {uc.tag_table?.length ?? 0} tags · {uc.decisions_needed?.[0]?.action ?? "HOLD"} ({uc.decisions_needed?.[0]?.status ?? "OPEN"})
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Right Pane: Full Operational Workspace for Selected Use Case */}
          <div
            style={{
              padding: "16px",
              borderRadius: "var(--radius-sm)",
              background: "var(--surface)",
              border: "1px solid var(--border-strong)",
            }}
            data-testid={`uc-detail-${activeUseCase.id}`}
          >
            <div className="stack" style={{ gap: 14 }}>
              {/* Workspace Header */}
              <div className="row between" style={{ flexWrap: "wrap", gap: 10 }}>
                <div>
                  <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span className="badge neutral mono" style={{ fontSize: 11 }}>
                      {activeUseCase.id} (Requirement #{activeUseCase.number})
                    </span>
                    <span className="badge neutral" style={{ fontSize: 11 }}>
                      {activeUseCase.category}
                    </span>
                    <span className={`badge ${badgeClass(activeUseCase.status)}`} style={{ fontSize: 11 }}>
                      {activeUseCase.badge_text}
                    </span>
                  </div>
                  <h3 style={{ margin: "6px 0 2px", fontSize: 16, fontWeight: 700 }}>
                    {activeUseCase.title}
                  </h3>
                  <div className="muted" style={{ fontSize: 12 }}>
                    Physical Equipment Unit: <strong>{activeUseCase.unit_name}</strong> · Subscribed Telemetry:{" "}
                    <strong>{activeUseCase.tag_table?.length ?? 0} Live Tags</strong>
                  </div>
                </div>

                {onHighlightUnitOnTwin ? (
                  <button
                    type="button"
                    className="btn primary sm"
                    onClick={() => onHighlightUnitOnTwin(activeUseCase.unit_id)}
                  >
                    Inspect {activeUseCase.unit_name.split("·")[0]} on Digital Twin PFD ↗
                  </button>
                ) : null}
              </div>

              {/* Proactive Domain Sentinel Agent Briefing (English / Hinglish / Hindi + Speak) */}
              {activeAgent ? (
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: 6,
                    background: "rgba(56, 189, 248, 0.08)",
                    border: "1px solid rgba(56, 189, 248, 0.35)",
                  }}
                  data-testid="uc-sentinel-briefing"
                >
                  <div className="row between" style={{ marginBottom: 4, flexWrap: "wrap", gap: 6 }}>
                    <div className="row" style={{ gap: 8, alignItems: "center" }}>
                      <span className="badge green mono" style={{ fontSize: 9.5 }}>
                        ● SENTINEL AGENT
                      </span>
                      <span style={{ fontWeight: 700, fontSize: 12 }}>
                        {activeAgent.name} · {activeAgent.role}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="btn sm"
                      onClick={() => speakText(activeAgent.briefings[lang] || activeAgent.briefings.en, lang)}
                    >
                      🔊 Speak ({lang.toUpperCase()})
                    </button>
                  </div>
                  <p style={{ margin: 0, fontSize: 12, lineHeight: 1.45 }}>
                    {activeAgent.briefings[lang] || activeAgent.briefings.en}
                  </p>
                </div>
              ) : null}

              {/* Problem Statement vs AI/PINN Solution */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                  gap: 12,
                }}
              >
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: 6,
                    background: "var(--elevated)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <div className="muted" style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
                    Refinery Operational Problem
                  </div>
                  <p style={{ margin: 0, fontSize: 12, lineHeight: 1.45 }}>
                    {activeUseCase.problem_statement}
                  </p>
                </div>

                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: 6,
                    background: "var(--elevated)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <div className="muted" style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
                    Physics-Informed ML &amp; Committee Solution
                  </div>
                  <p style={{ margin: 0, fontSize: 12, lineHeight: 1.45 }}>
                    {activeUseCase.solution_summary}
                  </p>
                </div>
              </div>

              {/* 4 Headline Live Technical KPIs for this Use Case */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(175px, 1fr))",
                  gap: 10,
                }}
              >
                {activeUseCase.kpis.map((k) => (
                  <div
                    key={k.label}
                    style={{
                      padding: "9px 12px",
                      borderRadius: 6,
                      background: "var(--elevated)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <div className="muted" style={{ fontSize: 11 }}>{k.label}</div>
                    <div className="mono" style={{ fontSize: 15, fontWeight: 700, marginTop: 2 }}>
                      {k.value} <small className="muted">{k.unit}</small>
                    </div>
                    <div className="mono muted" style={{ fontSize: 10, marginTop: 2 }}>
                      Tag: {k.tag} · Target: {k.target}
                    </div>
                  </div>
                ))}
              </div>

              {/* 2 Live Multi-Trace Time-Series Charts for this Use Case */}
              {activeUseCase.chart_panels && activeUseCase.chart_panels.length > 0 ? (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
                    gap: 12,
                  }}
                >
                  {activeUseCase.chart_panels.map((panel) => (
                    <MultiTraceUnitChart
                      key={panel.panel_id}
                      panel={panel}
                      runId={twin.provenance.run_id}
                      timeMin={twin.provenance.time_min}
                    />
                  ))}
                </div>
              ) : null}

              {/* 3-Zone Operating Envelope + Actionable Decision Card (Accept / Decline) */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                  gap: 12,
                }}
              >
                <div
                  style={{
                    padding: "12px",
                    borderRadius: 6,
                    background: "var(--elevated)",
                    border: "1px solid var(--border)",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                >
                  <ThreeZoneEnvelopeBar env={activeUseCase.envelope} />

                  {/* 4-Domain Ripple Summary for this Use Case */}
                  <div
                    style={{
                      paddingTop: 8,
                      borderTop: "1px solid var(--border)",
                      display: "grid",
                      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                      gap: 6,
                      fontSize: 11,
                    }}
                  >
                    <div>
                      <strong style={{ color: "#60a5fa" }}>Yield Ripple:</strong> {activeUseCase.systems_ripple.yield_impact}
                    </div>
                    <div>
                      <strong style={{ color: "#fbbf24" }}>Energy Ripple:</strong> {activeUseCase.systems_ripple.energy_impact}
                    </div>
                    <div>
                      <strong style={{ color: "#34d399" }}>Regen Ripple:</strong> {activeUseCase.systems_ripple.regeneration_impact}
                    </div>
                    <div>
                      <strong style={{ color: "#f43f5e" }}>IOW Integrity:</strong> {activeUseCase.systems_ripple.reliability_impact}
                    </div>
                  </div>
                </div>

                <div className="stack" style={{ gap: 10 }}>
                  {(activeUseCase.decisions_needed ?? []).map((dc) => (
                    <TwinDecisionActionCard
                      key={dc.rec_id}
                      card={dc}
                      runId={twin.provenance.run_id}
                      timeMin={twin.provenance.time_min}
                    />
                  ))}
                </div>
              </div>

              {/* Complete Use-Case Tag Table */}
              {activeUseCase.tag_table && activeUseCase.tag_table.length > 0 ? (
                <UnitTagTable
                  rows={activeUseCase.tag_table}
                  title={`${activeUseCase.id} (${activeUseCase.title}) · Complete Subscribed Tag Telemetry & Shift Summary`}
                />
              ) : null}
            </div>
          </div>
        </div>
      </Card>

      {/* 2. Dual-Sensor Drift Matrix (5 Hardware-Redundant Pairs) & Control Valve Authority Table */}
      <div className="grid">
        <Card
          className="s-6 s-md-12"
          title="UC-11 · 5-Channel Hardware-Redundant Dual-Sensor Drift Matrix"
          sub="Real-time primary vs. duplicate thermocouple & pressure transmitter voting (S3 Trust Signal)"
        >
          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr>
                  <th>Primary / Dup Tag</th>
                  <th>Location</th>
                  <th className="r">Primary</th>
                  <th className="r">Duplicate</th>
                  <th className="r">|Drift|</th>
                  <th className="r">Limit</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {pr.sensor_drift_matrix.map((row) => (
                  <tr key={row.tag}>
                    <td className="mono" style={{ fontSize: 11.5 }}>
                      <strong>{row.tag}</strong> / {row.dup_tag}
                    </td>
                    <td style={{ fontSize: 11.5 }}>{row.label}</td>
                    <td className="r mono">{num(row.primary_val, 2)} {row.unit}</td>
                    <td className="r mono">{num(row.dup_val, 2)} {row.unit}</td>
                    <td className="r mono"><strong>{num(row.abs_drift, 3)}</strong> {row.unit}</td>
                    <td className="r mono muted">≤ {num(row.threshold, 2)}</td>
                    <td>
                      <span className={`badge ${badgeClass(row.status)}`} style={{ fontSize: 10 }}>
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card
          className="s-6 s-md-12"
          title="UC-09 · Final Control Valve Authority & Stiction Watch (V8–V11, V1–V6)"
          sub="Monitors stem travel against [15%, 85%] linear authority band to prevent cut-point hunting"
        >
          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr>
                  <th>Valve Tag</th>
                  <th>Control Loop Function</th>
                  <th>Unit</th>
                  <th className="r">Stem Open</th>
                  <th className="r">Linear Band</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {pr.valve_health_matrix.map((v) => (
                  <tr key={v.tag}>
                    <td className="mono" style={{ fontSize: 11.5 }}>
                      <strong>{v.tag}</strong>
                    </td>
                    <td style={{ fontSize: 11.5 }}>{v.label}</td>
                    <td className="muted" style={{ fontSize: 11 }}>{v.unit_name}</td>
                    <td className="r mono"><strong>{num(v.position_pct, 1)}%</strong></td>
                    <td className="r mono muted">{v.operating_band_pct[0]}–{v.operating_band_pct[1]}%</td>
                    <td>
                      <span className={`badge ${badgeClass(v.status)}`} style={{ fontSize: 10 }}>
                        {v.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* 3. Downstream Refinery Use Cases (#12–#34) — Boundary Conditions & Architecture Clones */}
      <Card
        title="Plant-Wide Expansion Roadmap · Remaining 23 Refinery Use Cases (#12–#34)"
        sub="Shows how the 6-Unit FCC/Fractionator Digital Twin supplies live boundary feeds to downstream hydrotreating, reforming, alkylation & blending units"
        actions={
          <div className="seg" role="group" aria-label="Filter 23 downstream use cases by integration tier">
            {[
              { id: "ALL", label: "All 23 Downstream" },
              { id: "BOUNDARY_LINKED", label: "Tier 2A: Live Boundary Feed (6)" },
              { id: "ARCHITECTURE_READY", label: "Tier 2B: Soft-Sensor Clones (6)" },
              { id: "PLANT_WIDE_ROADMAP", label: "Tier 2C: Plant-Wide Phase 2/3 (11)" },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={downstreamTierFilter === t.id}
                onClick={() => setDownstreamTierFilter(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        }
      >
        <div className="table-wrap">
          <table className="t">
            <thead>
              <tr>
                <th>Req #</th>
                <th>Refinery Optimization Use Case</th>
                <th>Integration Tier</th>
                <th>Live Twin Boundary Tag</th>
                <th>Current Boundary Value</th>
                <th>Systems-Thinking Integration Path</th>
              </tr>
            </thead>
            <tbody>
              {filteredDownstream.map((item) => (
                <tr key={item.number}>
                  <td className="mono"><strong>#{item.number}</strong></td>
                  <td><strong>{item.title}</strong></td>
                  <td>
                    <span
                      className={`badge ${
                        item.tier === "BOUNDARY_LINKED"
                          ? "green"
                          : item.tier === "ARCHITECTURE_READY"
                            ? "amber"
                            : "neutral"
                      }`}
                      style={{ fontSize: 10 }}
                    >
                      {item.tier}
                    </span>
                  </td>
                  <td className="mono" style={{ fontSize: 11.5 }}>{item.boundary_tag}</td>
                  <td className="mono" style={{ fontSize: 11.5 }}><strong>{item.boundary_value}</strong></td>
                  <td style={{ fontSize: 12 }}>{item.integration_note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
