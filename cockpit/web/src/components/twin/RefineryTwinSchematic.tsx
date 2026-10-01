"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Data, Layout, Shape } from "plotly.js";
import Chart from "@/components/charts/Chart";
import { clickToMinute } from "@/components/charts/EstimateCharts";
import { postTwinDecision, useRunTimeseries } from "@/lib/api";
import { clock, minToX, num, signed } from "@/lib/format";
import { axisStyle, baseLayout, cursorShape, timeAxis } from "@/lib/plotTheme";
import { useCockpit } from "@/lib/store";
import { FONT_MONO, STATUS, TOKENS } from "@/lib/theme";
import { Card, Citations } from "@/components/ui/primitives";
import type {
  TwinChartPanel,
  TwinDecisionCard,
  TwinSentinelAgent,
  TwinState,
  TwinTagRow,
  TwinUnit,
  TwinUnitEnvelope,
} from "@/lib/types";

export type SentinelLang = "en" | "hinglish" | "hi";

const TRACE_PALETTE = ["#38bdf8", "#34d399", "#fbbf24", "#a78bfa", "#f43f5e"];

export function badgeClass(status: string): "green" | "amber" | "red" | "neutral" {
  if (status === "GREEN" || status === "ACCEPTED" || status === "PASS") return "green";
  if (status === "AMBER" || status === "WITHHELD" || status === "OPEN") return "amber";
  if (status === "RED" || status === "DECLINED") return "red";
  return "neutral";
}

function statusHex(status: string): string {
  if (status === "GREEN") return STATUS.GREEN;
  if (status === "AMBER") return STATUS.AMBER;
  if (status === "RED") return STATUS.RED;
  return "#64748b";
}

export function speakText(text: string, lang: SentinelLang) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === "hi" ? "hi-IN" : lang === "hinglish" ? "en-IN" : "en-US";
    u.rate = 1.02;
    window.speechSynthesis.speak(u);
  } catch {
    /* ignore speech synthesis errors in headless environments */
  }
}

export function ThreeZoneEnvelopeBar({ env }: { env: TwinUnitEnvelope }) {
  const span = Math.max(1e-6, env.scale_max - env.scale_min);
  const toPct = (v: number) => Math.max(2, Math.min(98, ((v - env.scale_min) / span) * 100));
  const swStart = toPct(env.sweet_spot_min);
  const swEnd = toPct(env.sweet_spot_max);
  const specPct = toPct(env.spec_limit);
  const p50Pct = toPct(env.p50);
  const p95Pct = toPct(env.p95);

  const zoneBadge =
    env.zone === "SWEET_SPOT"
      ? "green"
      : env.zone === "OVER_TREATING"
        ? "green"
        : env.zone === "TRANSITION_LOCK"
          ? "amber"
          : "red";

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row between" style={{ flexWrap: "wrap", gap: 6 }}>
        <span style={{ fontWeight: 600, fontSize: 12 }}>
          {env.label} <span className="mono muted">({env.parameter})</span>
        </span>
        <span className={`badge ${zoneBadge}`} style={{ fontSize: 10.5 }}>
          {env.zone_label}
        </span>
      </div>

      <div className="row between mono muted" style={{ fontSize: 10.5 }}>
        <span>Over-Treating / Sub-Optimal</span>
        <span style={{ color: STATUS.GREEN }}>
          Sweet Spot ({num(env.sweet_spot_min, 1)}–{num(env.sweet_spot_max, 1)} {env.unit})
        </span>
        <span style={{ color: STATUS.RED }}>
          Limit ({num(env.spec_limit, 1)} {env.unit})
        </span>
      </div>

      <div
        style={{
          position: "relative",
          height: 24,
          borderRadius: 6,
          background: "var(--elevated)",
          border: "1px solid var(--border-strong)",
          overflow: "hidden",
        }}
        role="img"
        aria-label={`Operating envelope for ${env.parameter}: current ${env.current_value} ${env.unit}, sweet spot ${env.sweet_spot_min} to ${env.sweet_spot_max} ${env.unit}`}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            width: `${swStart}%`,
            top: 0,
            bottom: 0,
            background: "rgba(59, 130, 246, 0.12)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: `${swStart}%`,
            width: `${Math.max(3, swEnd - swStart)}%`,
            top: 0,
            bottom: 0,
            background: "rgba(16, 185, 129, 0.24)",
            borderLeft: "1px dashed rgba(16, 185, 129, 0.65)",
            borderRight: "1px dashed rgba(16, 185, 129, 0.65)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: `${swEnd}%`,
            right: 0,
            top: 0,
            bottom: 0,
            background: "rgba(244, 63, 94, 0.16)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: `${specPct}%`,
            top: 0,
            bottom: 0,
            width: 2,
            background: STATUS.RED,
          }}
          title={`Spec / IOW Limit: ${env.spec_limit} ${env.unit}`}
        />
        <div
          style={{
            position: "absolute",
            left: `${p50Pct}%`,
            top: 4,
            bottom: 4,
            width: 4,
            borderRadius: 2,
            background: "#94a3b8",
            transform: "translateX(-50%)",
          }}
          title={`Current / P50: ${env.p50} ${env.unit}`}
        />
        <div
          style={{
            position: "absolute",
            left: `${p95Pct}%`,
            top: 2,
            bottom: 2,
            width: 8,
            borderRadius: 4,
            background: env.zone === "TRANSITION_LOCK" ? STATUS.AMBER : "#60a5fa",
            border: "1.5px solid #fff",
            transform: "translateX(-50%)",
          }}
          title={`P95 / Upper Bound: ${env.p95} ${env.unit}`}
        />
      </div>

      <div className="row between mono" style={{ fontSize: 11, flexWrap: "wrap", gap: 8 }}>
        <span>
          Current / P50: <strong>{env.p50} {env.unit}</strong>
        </span>
        <span style={{ color: "#60a5fa" }}>
          ● Upper Bound (P95): <strong>{env.p95} {env.unit}</strong>
        </span>
        <span className="muted">
          Margin to limit: <strong>{signed(env.spec_limit - env.p95, 2)} {env.unit}</strong>
        </span>
      </div>

      <p style={{ margin: 0, fontSize: 12, lineHeight: 1.45, color: "var(--text)" }}>
        {env.advice}
      </p>
    </div>
  );
}

/**
 * Live Multi-Trace Time-Series Chart for a Unit or Use-Case workspace panel.
 * Pulls shift-window time series from `/api/runs/{runId}/timeseries` and syncs click with `setTimeMin`.
 */
export function MultiTraceUnitChart({
  panel,
  runId,
  timeMin,
  onPickMinute,
}: {
  panel: TwinChartPanel;
  runId: string;
  timeMin: number;
  onPickMinute?: (m: number) => void;
}) {
  const theme = useCockpit((s) => s.theme);
  const setTimeMin = useCockpit((s) => s.setTimeMin);

  const tags = useMemo(() => (panel.traces ?? []).map((tr) => tr.tag), [panel.traces]);

  const win = useMemo(() => {
    const span = 12 * 60;
    return { from: Math.max(0, timeMin - span), to: timeMin + 30 };
  }, [timeMin]);

  const tsQ = useRunTimeseries(runId, tags, win, 600);

  const { data, layout } = useMemo(() => {
    const t = TOKENS[theme];
    const ts = tsQ.data;
    const x = (ts?.time_min ?? []).map(minToX);
    const traces: Data[] = (panel.traces ?? []).map((tr, idx) => {
      const y = ts?.series?.[tr.tag] ?? [];
      const color = tr.color || TRACE_PALETTE[idx % TRACE_PALETTE.length];
      const isDash = tr.dash === "dash" || tr.dash === "dot" || tr.tag.startsWith("SP_") || tr.tag.includes("dup");
      return {
        type: "scatter",
        mode: "lines",
        name: tr.label || tr.tag,
        x,
        y,
        line: {
          color,
          width: isDash ? 1.6 : 2.1,
          dash: (tr.dash as "solid" | "dash" | "dot" | undefined) ?? (isDash ? "dash" : "solid"),
        },
        hovertemplate: `<b>${tr.label || tr.tag}</b>: %{y:.2f} ${panel.unit}<extra></extra>`,
      } satisfies Data;
    });

    const shapes: Partial<Shape>[] = [];
    if (panel.sweet_spot && panel.sweet_spot.length === 2) {
      shapes.push({
        type: "rect",
        xref: "paper",
        yref: "y",
        x0: 0,
        x1: 1,
        y0: panel.sweet_spot[0],
        y1: panel.sweet_spot[1],
        fillcolor: "rgba(16, 185, 129, 0.08)",
        line: { width: 1, dash: "dot", color: "rgba(16, 185, 129, 0.45)" },
        layer: "below",
      });
    }
    if (panel.spec_limit !== null && panel.spec_limit !== undefined) {
      shapes.push({
        type: "line",
        xref: "paper",
        yref: "y",
        x0: 0,
        x1: 1,
        y0: panel.spec_limit,
        y1: panel.spec_limit,
        line: { width: 1.5, dash: "dash", color: STATUS.RED },
      });
    }
    shapes.push(cursorShape(timeMin, theme));

    const lay: Partial<Layout> = {
      ...baseLayout(theme, { margin: { l: 52, r: 16, t: 26, b: 34 } }),
      xaxis: { ...axisStyle(theme), ...timeAxis },
      yaxis: {
        ...axisStyle(theme),
        title: { text: panel.unit, font: { family: FONT_MONO, size: 10, color: t.muted } },
      },
      shapes,
      legend: {
        orientation: "h",
        x: 0,
        y: 1.14,
        font: { family: FONT_MONO, size: 10, color: t.text },
        bgcolor: "rgba(0,0,0,0)",
      },
    };
    return { data: traces, layout: lay };
  }, [theme, tsQ.data, panel, timeMin]);

  return (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: 6,
        background: "var(--elevated)",
        border: "1px solid var(--border)",
      }}
      data-testid={`twin-chart-${panel.panel_id}`}
    >
      <div className="row between" style={{ marginBottom: 4, gap: 8, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 12.5 }}>{panel.title}</div>
          <div className="muted" style={{ fontSize: 11 }}>{panel.subtitle}</div>
        </div>
        <span className="badge neutral mono" style={{ fontSize: 10 }}>
          {tags.join(" · ")}
        </span>
      </div>
      <Chart
        data={data}
        layout={layout}
        height={225}
        ariaLabel={`${panel.title}: ${panel.subtitle}`}
        onClick={(e) => {
          const m = clickToMinute(e);
          if (m !== null) {
            setTimeMin(m);
            onPickMinute?.(m);
          }
        }}
      />
    </div>
  );
}

/**
 * Actionable Decision Card with working `Accept Recommendation` and `Decline` buttons
 * backed by `POST /api/twin/decision` and recorded in the SQLite `decisions` & `audit` tables.
 */
export function TwinDecisionActionCard({
  card,
  runId,
  timeMin,
}: {
  card: TwinDecisionCard;
  runId: string;
  timeMin: number;
}) {
  const qc = useQueryClient();
  const user = "operator";
  const [busy, setBusy] = useState(false);
  const [localStatus, setLocalStatus] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);

  const effectiveStatus = localStatus ?? card.status;
  const isWithheld = effectiveStatus === "WITHHELD" || card.gate_status === "WITHHELD";
  const canDecide = !isWithheld && effectiveStatus !== "ACCEPTED" && effectiveStatus !== "DECLINED";

  async function onDecide(decision: "accepted" | "declined") {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await postTwinDecision(card.rec_id, decision, user, note, runId, timeMin);
      setLocalStatus(res.status);
      setFeedback(`Recorded ${res.status} in audit log (#${res.audit_id}) · Advisory only (0 control writes)`);
      qc.invalidateQueries({ queryKey: ["twin"] });
      qc.invalidateQueries({ queryKey: ["audit"] });
      qc.invalidateQueries({ queryKey: ["recommendations"] });
      qc.invalidateQueries({ queryKey: ["overview"] });
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "Failed to record decision");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        padding: "12px 14px",
        borderRadius: 6,
        background: "var(--elevated)",
        border: "1px solid var(--border-strong)",
        borderLeft: `3px solid ${
          effectiveStatus === "ACCEPTED"
            ? STATUS.GREEN
            : effectiveStatus === "DECLINED"
              ? STATUS.RED
              : isWithheld
                ? STATUS.AMBER
                : "#3b82f6"
        }`,
      }}
      data-testid={`twin-decision-card-${card.target_id}`}
    >
      <div className="row between" style={{ flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
        <div>
          <span style={{ fontWeight: 700, fontSize: 13 }}>
            {card.use_case_id} · Advisory Set-Point Decision ({card.parameter})
          </span>
          <div className="mono muted" style={{ fontSize: 10.5 }}>
            ID: {card.rec_id} · Target: <strong>{card.target_id}</strong>
          </div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <span className={`badge ${badgeClass(effectiveStatus)}`} style={{ fontSize: 10.5 }}>
            {effectiveStatus}
          </span>
          <span className={`badge ${card.gate_status === "PASS" ? "green" : "amber"}`} style={{ fontSize: 10.5 }}>
            Gate {card.gate_status}
          </span>
        </div>
      </div>

      <div
        className="row mono"
        style={{
          gap: 16,
          fontSize: 12,
          padding: "7px 10px",
          borderRadius: 5,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          marginBottom: 8,
          flexWrap: "wrap",
        }}
      >
        <span>
          Action: <strong>{card.action}</strong>
        </span>
        <span>
          Current SP: <strong>{card.sp_before} {card.unit}</strong>
        </span>
        <span>
          Recommended SP: <strong>{card.sp_after} {card.unit}</strong>
        </span>
        <span>
          Step: <strong>{signed(card.delta, 2)} {card.unit}</strong>
        </span>
      </div>

      <p style={{ margin: "0 0 8px", fontSize: 12, lineHeight: 1.45 }}>{card.rationale}</p>

      <Citations items={card.citations} />

      {/* Operator Action Bar (Accept / Decline) */}
      <div
        className="row between"
        style={{
          marginTop: 10,
          paddingTop: 10,
          borderTop: "1px solid var(--border)",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        {isWithheld ? (
          <span className="mono" style={{ fontSize: 11.5, color: STATUS.AMBER }}>
            ⚠ Spread Gate WITHHELD — Set-point move suppressed until committee spread W90 ≤ 14.0 °F
          </span>
        ) : (
          <div className="row" style={{ gap: 8, flexWrap: "wrap", flex: 1 }}>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional operator shift log note..."
              aria-label={`Operator note for ${card.rec_id}`}
              style={{
                flex: 1,
                minWidth: 180,
                padding: "5px 9px",
                fontSize: 11.5,
                borderRadius: 5,
                border: "1px solid var(--border)",
                background: "var(--surface)",
                color: "var(--text)",
              }}
            />
            <button
              type="button"
              className="btn primary sm"
              disabled={busy || !canDecide}
              data-testid={`accept-btn-${card.target_id}`}
              onClick={() => onDecide("accepted")}
            >
              {effectiveStatus === "ACCEPTED" ? "✓ Accepted" : "Accept Recommendation"}
            </button>
            <button
              type="button"
              className="btn sm"
              disabled={busy || !canDecide}
              data-testid={`decline-btn-${card.target_id}`}
              onClick={() => onDecide("declined")}
            >
              {effectiveStatus === "DECLINED" ? "✕ Declined" : "Decline"}
            </button>
          </div>
        )}
      </div>

      {feedback ? (
        <div className="mono" style={{ fontSize: 11, marginTop: 6, color: "#34d399" }}>
          {feedback}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Complete Tag Telemetry Table for a Unit or Use Case (CV, MV, SP, DV, VALVE, REDUNDANT, RESIDUAL).
 */
export function UnitTagTable({ rows, title }: { rows: TwinTagRow[]; title: string }) {
  return (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: 6,
        background: "var(--elevated)",
        border: "1px solid var(--border)",
      }}
    >
      <div className="row between" style={{ marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
        <span style={{ fontWeight: 700, fontSize: 12.5 }}>{title}</span>
        <span className="badge neutral mono" style={{ fontSize: 10 }}>
          {rows.length} Live Tags · 12h Shift Min / Mean / Max
        </span>
      </div>
      <div className="table-wrap">
        <table className="t">
          <thead>
            <tr>
              <th>Tag ID</th>
              <th>Role</th>
              <th>Engineering Description</th>
              <th className="r">Current</th>
              <th className="r">12h Min</th>
              <th className="r">12h Mean</th>
              <th className="r">12h Max</th>
              <th>IOW / Target</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.tag}>
                <td className="mono" style={{ fontSize: 11.5 }}>
                  <strong>{r.tag}</strong>
                </td>
                <td>
                  <span className="badge neutral mono" style={{ fontSize: 9.5 }}>
                    {r.role}
                  </span>
                </td>
                <td style={{ fontSize: 11.5 }}>{r.label}</td>
                <td className="r mono" style={{ fontWeight: 700 }}>
                  {num(r.current, 2)} <small className="muted">{r.unit}</small>
                </td>
                <td className="r mono muted">{num(r.window_min, 2)}</td>
                <td className="r mono muted">{num(r.window_mean, 2)}</td>
                <td className="r mono muted">{num(r.window_max, 2)}</td>
                <td className="mono" style={{ fontSize: 11 }}>{r.limit_or_sp}</td>
                <td>
                  <span className={`badge ${badgeClass(r.status)}`} style={{ fontSize: 9.5 }}>
                    {r.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Proactive Multi-Agent Sentinel Bar with English / Hinglish / Hindi toggle & Gemini Live Voice Readout.
 */
export function ProactiveSentinelBar({
  agents,
  selectedUnitId,
  lang,
  onChangeLang,
  onSelectUnit,
}: {
  agents: TwinSentinelAgent[];
  selectedUnitId: string;
  lang: SentinelLang;
  onChangeLang: (l: SentinelLang) => void;
  onSelectUnit?: (unitId: string) => void;
}) {
  const supervisor = agents.find((a) => a.agent_id === "agent_supervisor") ?? agents[0];
  const unitAgent =
    agents.find((a) => a.unit_id === selectedUnitId && a.agent_id !== "agent_supervisor") ?? supervisor;

  if (!supervisor || !unitAgent) return null;

  const supText = supervisor.briefings[lang] || supervisor.briefings.en;
  const unitText = unitAgent.briefings[lang] || unitAgent.briefings.en;

  return (
    <div
      style={{
        padding: "12px 14px",
        borderRadius: "var(--radius-sm)",
        background:
          "linear-gradient(180deg, rgba(59, 130, 246, 0.10) 0%, rgba(15, 23, 42, 0.65) 100%)",
        border: "1px solid var(--border-strong)",
        borderLeft: `3px solid ${statusHex(unitAgent.status)}`,
      }}
      data-testid="proactive-sentinel-bar"
    >
      <div className="row between" style={{ flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
        <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span className="badge green mono" style={{ fontSize: 10.5 }}>
            ● LIVE MULTI-AGENT SENTINEL FLEET ({agents.length} AGENTS)
          </span>
          <span style={{ fontWeight: 700, fontSize: 13 }}>
            Proactive Control-Room Watch · Real-Time Anomaly &amp; Set-Point Briefings
          </span>
        </div>

        <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div className="seg" role="group" aria-label="Select agent briefing language">
            {(
              [
                { id: "en", label: "English" },
                { id: "hinglish", label: "Hinglish (Control Room)" },
                { id: "hi", label: "हिंदी (Hindi)" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                data-testid={`sentinel-lang-${opt.id}`}
                aria-pressed={lang === opt.id}
                onClick={() => onChangeLang(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn sm primary"
            data-testid="sentinel-speak-btn"
            onClick={() => speakText(`${supText} ${unitText}`, lang)}
            title="Speak proactive sentinel briefing aloud in selected language"
          >
            🔊 Speak Live Alert
          </button>
        </div>
      </div>

      {/* Agent Fleet Status Pills */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(165px, 1fr))",
          gap: 6,
          marginBottom: 10,
        }}
      >
        {agents.map((ag) => {
          const isFocused = ag.agent_id === unitAgent.agent_id || ag.agent_id === "agent_supervisor";
          return (
            <button
              key={ag.agent_id}
              type="button"
              data-testid={`sentinel-agent-${ag.agent_id}`}
              onClick={() => {
                if (onSelectUnit) onSelectUnit(ag.unit_id);
              }}
              style={{
                textAlign: "left",
                padding: "6px 9px",
                borderRadius: 5,
                border: isFocused ? "1.5px solid #38bdf8" : "1px solid var(--border)",
                background: isFocused ? "rgba(56, 189, 248, 0.12)" : "var(--surface)",
                color: "var(--text)",
                cursor: "pointer",
              }}
            >
              <div className="row between" style={{ gap: 4 }}>
                <span style={{ fontWeight: 700, fontSize: 11 }}>{ag.name}</span>
                <span className={`badge ${badgeClass(ag.status)}`} style={{ fontSize: 9 }}>
                  {ag.status}
                </span>
              </div>
              <div
                className="mono muted"
                style={{
                  fontSize: 9.5,
                  marginTop: 2,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {ag.proactive_alert}
              </div>
            </button>
          );
        })}
      </div>

      {/* Live Multilingual Transcripts (Shift Supervisor + Active Unit Sentinel) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 10,
        }}
      >
        <div
          style={{
            padding: "8px 11px",
            borderRadius: 6,
            background: "var(--surface)",
            border: "1px solid var(--border)",
          }}
        >
          <div className="row between" style={{ marginBottom: 3 }}>
            <span className="mono" style={{ fontSize: 10.5, fontWeight: 700, color: "#38bdf8" }}>
              {supervisor.name} ({supervisor.role})
            </span>
            <span className="mono muted" style={{ fontSize: 10 }}>
              Plant-Wide Orchestrator
            </span>
          </div>
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.45 }} data-testid="sentinel-supervisor-text">
            {supText}
          </p>
        </div>

        <div
          style={{
            padding: "8px 11px",
            borderRadius: 6,
            background: "var(--surface)",
            border: "1px solid var(--border)",
          }}
        >
          <div className="row between" style={{ marginBottom: 3 }}>
            <span className="mono" style={{ fontSize: 10.5, fontWeight: 700, color: "#34d399" }}>
              {unitAgent.name} ({unitAgent.use_case_ids.join(", ")})
            </span>
            <span className={`badge ${badgeClass(unitAgent.status)}`} style={{ fontSize: 9.5 }}>
              PROACTIVE WATCH
            </span>
          </div>
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.45 }} data-testid="sentinel-unit-text">
            {unitText}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Interactive 2D ISA-101 SVG Process Flow Diagram (PFD) of the 6 Connected Refinery Units.
 * Clicking any vessel switches the entire Unit Digital Twin Workspace below.
 */
function RefinerySvgProcessFlowsheet({
  units,
  selectedUnitId,
  onSelectUnit,
  onOpenUseCase,
}: {
  units: TwinUnit[];
  selectedUnitId: string;
  onSelectUnit: (uid: string) => void;
  onOpenUseCase?: (ucId: string) => void;
}) {
  const coords: Record<string, { x: number; y: number; w: number; h: number; shape: string }> = {
    unit_1_furnace: { x: 24, y: 80, w: 164, h: 175, shape: "furnace" },
    unit_2_riser: { x: 224, y: 46, w: 168, h: 215, shape: "riser" },
    unit_3_regenerator: { x: 428, y: 54, w: 174, h: 207, shape: "regen" },
    unit_4_fractionator: { x: 640, y: 26, w: 188, h: 245, shape: "column" },
    unit_5_condenser: { x: 864, y: 66, w: 150, h: 190, shape: "condenser" },
    unit_5_overhead: { x: 864, y: 66, w: 150, h: 190, shape: "condenser" },
    unit_6_stabiliser: { x: 1044, y: 52, w: 136, h: 208, shape: "stabiliser" },
  };

  return (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: "var(--radius-sm)",
        background: "var(--surface)",
        border: "1px solid var(--border-strong)",
      }}
      role="region"
      aria-label="6-Unit Sequential Refinery Process Flow Diagram"
    >
      <div className="row between" style={{ marginBottom: 6, flexWrap: "wrap", gap: 6 }}>
        <span className="mono muted" style={{ fontSize: 11 }}>
          ISA-101 High-Performance Process Flowsheet · Click any equipment unit (1–6) or use-case pin (#1–#11) to open its full Digital Twin telemetry &amp; decisions workspace
        </span>
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          {units.map((u) => {
            const active = u.unit_id === selectedUnitId;
            return (
              <button
                key={u.unit_id}
                type="button"
                data-testid={`twin-unit-${u.unit_id}`}
                onClick={() => onSelectUnit(u.unit_id)}
                className={`btn sm ${active ? "primary" : ""}`}
                style={{
                  fontSize: 11,
                  padding: "3px 9px",
                  borderLeft: `3px solid ${statusHex(u.status)}`,
                }}
              >
                {u.short_name} ({u.headline_kpi.value} {u.headline_kpi.unit})
              </button>
            );
          })}
        </div>
      </div>

      <svg
        viewBox="0 0 1200 325"
        style={{ width: "100%", height: "auto", maxHeight: 310, display: "block" }}
        role="img"
        aria-label="Interactive 6-unit FCC and Main Fractionator SVG process schematic"
      >
        <defs>
          <marker id="arrow-blue" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1 L 10 5 L 0 9 z" fill="#38bdf8" />
          </marker>
          <marker id="arrow-amber" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1 L 10 5 L 0 9 z" fill="#fbbf24" />
          </marker>
          <marker id="arrow-green" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1 L 10 5 L 0 9 z" fill="#34d399" />
          </marker>
        </defs>

        {/* Forward Process Stream Connectors */}
        <line x1="188" y1="165" x2="222" y2="165" stroke="#38bdf8" strokeWidth="3" markerEnd="url(#arrow-blue)" />
        <line x1="392" y1="115" x2="638" y2="115" stroke="#38bdf8" strokeWidth="3" markerEnd="url(#arrow-blue)" />
        <line x1="828" y1="92" x2="862" y2="92" stroke="#38bdf8" strokeWidth="2.5" markerEnd="url(#arrow-blue)" />
        <line x1="1014" y1="155" x2="1042" y2="155" stroke="#38bdf8" strokeWidth="2.5" markerEnd="url(#arrow-blue)" />

        {/* Closed-Loop 1: Riser <-> Regenerator Figure-8 Catalyst Circulation */}
        <path d="M 392 195 C 410 195, 410 195, 426 195" stroke="#fbbf24" strokeWidth="2.5" strokeDasharray="5,3" markerEnd="url(#arrow-amber)" fill="none" />
        <path d="M 426 145 C 410 145, 410 145, 392 145" stroke="#34d399" strokeWidth="2.5" markerEnd="url(#arrow-green)" fill="none" />
        <text x="410" y="137" textAnchor="middle" fill="#34d399" fontSize="9" fontFamily="monospace">Hot Regen Cat</text>
        <text x="410" y="210" textAnchor="middle" fill="#fbbf24" fontSize="9" fontFamily="monospace">Spent Cat</text>

        {/* Closed-Loop 2: Fractionator Bottoms Slurry Recycle to Feed Preheat (Unit 4 -> Unit 1) */}
        <path
          d="M 734 272 L 734 304 L 106 304 L 106 257"
          stroke="#fbbf24"
          strokeWidth="2"
          strokeDasharray="6,4"
          markerEnd="url(#arrow-amber)"
          fill="none"
        />
        <text x="420" y="298" textAnchor="middle" fill="#fbbf24" fontSize="9.5" fontFamily="monospace">
          Closed Loop 2 · Bottoms Slurry Pumparound (PA4 → Feed Preheat Exchanger)
        </text>

        {/* Closed-Loop 3: Overhead Reflux Return (Unit 5 -> Unit 4 Top Tray 20) */}
        <path
          d="M 935 66 L 935 14 L 755 14 L 755 25"
          stroke="#34d399"
          strokeWidth="2"
          strokeDasharray="5,3"
          markerEnd="url(#arrow-green)"
          fill="none"
        />
        <text x="845" y="11" textAnchor="middle" fill="#34d399" fontSize="9.5" fontFamily="monospace">
          Closed Loop 3 · Overhead Reflux (F_reflux)
        </text>

        {/* 6 Interactive Unit Vessels */}
        {units.map((u) => {
          const c = coords[u.unit_id] ?? { x: 20, y: 50, w: 150, h: 180, shape: "column" };
          const active = u.unit_id === selectedUnitId;
          const sCol = statusHex(u.status);
          return (
            <g
              key={u.unit_id}
              onClick={() => onSelectUnit(u.unit_id)}
              style={{ cursor: "pointer" }}
            >
              {/* Outer Vessel Frame */}
              <rect
                x={c.x}
                y={c.y}
                width={c.w}
                height={c.h}
                rx={c.shape === "column" || c.shape === "stabiliser" ? 18 : 10}
                fill={active ? "rgba(30, 58, 138, 0.42)" : "rgba(15, 23, 42, 0.88)"}
                stroke={active ? "#38bdf8" : sCol}
                strokeWidth={active ? 2.8 : 1.6}
              />
              {/* Top Status Bar */}
              <rect
                x={c.x}
                y={c.y}
                width={c.w}
                height={6}
                rx={3}
                fill={sCol}
              />
              {/* Internal Tray Lines for Fractionator / Stabiliser */}
              {(c.shape === "column" || c.shape === "stabiliser") ? (
                <g stroke="rgba(148, 163, 184, 0.22)" strokeWidth="1" strokeDasharray="3,3">
                  <line x1={c.x + 12} y1={c.y + 65} x2={c.x + c.w - 12} y2={c.y + 65} />
                  <line x1={c.x + 12} y1={c.y + 95} x2={c.x + c.w - 12} y2={c.y + 95} />
                  <line x1={c.x + 12} y1={c.y + 125} x2={c.x + c.w - 12} y2={c.y + 125} />
                  <line x1={c.x + 12} y1={c.y + 155} x2={c.x + c.w - 12} y2={c.y + 155} />
                </g>
              ) : null}

              {/* Unit Title */}
              <text
                x={c.x + 10}
                y={c.y + 24}
                fill="#f8fafc"
                fontSize="11.5"
                fontWeight="700"
                fontFamily="sans-serif"
              >
                {u.short_name}
              </text>
              <text
                x={c.x + c.w - 10}
                y={c.y + 24}
                textAnchor="end"
                fill={sCol}
                fontSize="10"
                fontWeight="700"
                fontFamily="monospace"
              >
                {u.status}
              </text>

              {/* Primary Live Telemetry Box */}
              <rect
                x={c.x + 8}
                y={c.y + 34}
                width={c.w - 16}
                height={38}
                rx={5}
                fill="rgba(2, 6, 23, 0.72)"
                stroke="rgba(148, 163, 184, 0.25)"
              />
              <text x={c.x + 14} y={c.y + 49} fill="#94a3b8" fontSize="9.5" fontFamily="sans-serif">
                {u.headline_kpi.label}
              </text>
              <text x={c.x + 14} y={c.y + 65} fill="#38bdf8" fontSize="12" fontWeight="700" fontFamily="monospace">
                {u.headline_kpi.value} {u.headline_kpi.unit}
              </text>

              {/* Top 4 Live Tags inside the Vessel */}
              {u.kpis.slice(0, 4).map((k, idx) => (
                <g key={k.tag}>
                  <text
                    x={c.x + 10}
                    y={c.y + 90 + idx * 18}
                    fill="#cbd5e1"
                    fontSize="9.5"
                    fontFamily="monospace"
                  >
                    {k.tag}:
                  </text>
                  <text
                    x={c.x + c.w - 10}
                    y={c.y + 90 + idx * 18}
                    textAnchor="end"
                    fill="#f8fafc"
                    fontSize="9.5"
                    fontWeight="700"
                    fontFamily="monospace"
                  >
                    {k.value} {k.unit}
                  </text>
                </g>
              ))}

              {/* Use Case Number Pins (#1-#11) at Bottom of Vessel */}
              {u.use_case_ids.map((ucId, idx) => (
                <g
                  key={ucId}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectUnit(u.unit_id);
                    onOpenUseCase?.(ucId);
                  }}
                >
                  <rect
                    x={c.x + 10 + idx * 46}
                    y={c.y + c.h - 24}
                    width={42}
                    height={16}
                    rx={4}
                    fill="rgba(59, 130, 246, 0.25)"
                    stroke="#60a5fa"
                    strokeWidth="1"
                  />
                  <text
                    x={c.x + 31 + idx * 46}
                    y={c.y + c.h - 13}
                    textAnchor="middle"
                    fill="#e2e8f0"
                    fontSize="9"
                    fontWeight="700"
                    fontFamily="monospace"
                  >
                    {ucId}
                  </text>
                </g>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function RefineryTwinSchematic({
  twin,
  selectedUnitId: controlledUnitId,
  onSelectUnit,
  onOpenUseCase,
}: {
  twin: TwinState;
  selectedUnitId?: string | null;
  onSelectUnit?: (unitId: string) => void;
  onOpenUseCase?: (ucId: string) => void;
}) {
  const [internalUnitId, setInternalUnitId] = useState<string>("unit_4_fractionator");
  const [showRipple, setShowRipple] = useState<boolean>(true);
  const [lang, setLang] = useState<SentinelLang>("en");
  const activeUnitId = controlledUnitId ?? internalUnitId;

  const handleUnitClick = (uid: string) => {
    setInternalUnitId(uid);
    onSelectUnit?.(uid);
  };

  const selectedUnit: TwinUnit = useMemo(
    () => twin.units.find((u) => u.unit_id === activeUnitId) ?? twin.units[3] ?? twin.units[0],
    [twin.units, activeUnitId],
  );

  const pr = twin.pinn_residuals;
  const sr = twin.systems_ripple;

  return (
    <Card
      className="s-12"
      title="Connected Refinery Digital Twin & Systems-Thinking Flowsheet (ISA-101 PFD)"
      sub={`6 Sequential Units · 3 Closed-Loop Couplings · 112 Live Tags at t ${twin.provenance.time_min} (${clock(twin.provenance.time_min)}) · Click any unit to open its complete time-series charts, tag table & actionable decisions`}
      actions={
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            className={`btn sm ${showRipple ? "primary" : ""}`}
            onClick={() => setShowRipple((s) => !s)}
          >
            {showRipple ? "Hide 4-Domain Ripple Matrix" : "Show 4-Domain Ripple Matrix"}
          </button>
          {onOpenUseCase ? (
            <button
              type="button"
              className="btn sm"
              onClick={() => onOpenUseCase(selectedUnit.use_case_ids[0] || "UC-01")}
            >
              Open Use-Case Explorer ({selectedUnit.use_case_ids.join(", ")}) →
            </button>
          ) : null}
        </div>
      }
    >
      <div className="stack" style={{ gap: 14 }}>
        {/* 1. Proactive Multi-Agent Sentinel Bar (English / Hinglish / Hindi + Live Voice) */}
        {twin.agent_fleet && twin.agent_fleet.length > 0 ? (
          <ProactiveSentinelBar
            agents={twin.agent_fleet}
            selectedUnitId={selectedUnit.unit_id}
            lang={lang}
            onChangeLang={setLang}
            onSelectUnit={handleUnitClick}
          />
        ) : null}

        {/* 2. PINN First-Principles Conservation & Health Strip */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(175px, 1fr))",
            gap: 8,
            padding: "10px 12px",
            borderRadius: "var(--radius-sm)",
            background: "var(--surface)",
            border: "1px solid var(--border)",
          }}
          aria-label="PINN First-Principles Conservation Strip"
        >
          <div className="stack" style={{ gap: 2 }}>
            <span className="muted" style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              PINN Mass Closure (112 Tags)
            </span>
            <div className="row" style={{ gap: 6, alignItems: "center" }}>
              <span className="mono" style={{ fontWeight: 700, fontSize: 13 }}>
                {signed(pr.mass_balance_err_pct, 3)}%
              </span>
              <span className={`badge ${pr.mass_closure_ok ? "green" : "amber"}`} style={{ fontSize: 9.5 }}>
                {pr.mass_closure_ok ? "CLOSED" : "DRIFT"}
              </span>
            </div>
          </div>

          <div className="stack" style={{ gap: 2 }}>
            <span className="muted" style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              20-Tray Boiling Monotonicity
            </span>
            <div className="row" style={{ gap: 6, alignItems: "center" }}>
              <span className="mono" style={{ fontWeight: 700, fontSize: 13 }}>
                {pr.tray_profile_F.T_tray01_F}° → {pr.tray_profile_F.T_tray20_F}°F
              </span>
              <span className={`badge ${pr.tray_monotonicity_ok ? "green" : "amber"}`} style={{ fontSize: 9.5 }}>
                {pr.tray_monotonicity_ok ? "0 INV" : `${pr.tray_violations_count} INV`}
              </span>
            </div>
          </div>

          <div className="stack" style={{ gap: 2 }}>
            <span className="muted" style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              LCO–HN Boiling Separation
            </span>
            <div className="row" style={{ gap: 6, alignItems: "center" }}>
              <span className="mono" style={{ fontWeight: 700, fontSize: 13 }}>
                Δ {num(pr.cutpoint_gap_F, 1)} °F
              </span>
              <span className={`badge ${pr.cutpoint_gap_ok ? "green" : "red"}`} style={{ fontSize: 9.5 }}>
                {pr.cutpoint_gap_ok ? "≥ 50 °F OK" : "OVERLAP"}
              </span>
            </div>
          </div>

          <div className="stack" style={{ gap: 2 }}>
            <span className="muted" style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Condenser UA Efficiency
            </span>
            <div className="row" style={{ gap: 6, alignItems: "center" }}>
              <span className="mono" style={{ fontWeight: 700, fontSize: 13 }}>
                {num(pr.condenser_eff * 100, 1)}%
              </span>
              <span className={`badge ${badgeClass(pr.condenser_fouling_status)}`} style={{ fontSize: 9.5 }}>
                res {num(pr.condenser_ua_residual, 3)}
              </span>
            </div>
          </div>

          <div className="stack" style={{ gap: 2 }}>
            <span className="muted" style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Furnace Tube Coking Res
            </span>
            <div className="row" style={{ gap: 6, alignItems: "center" }}>
              <span className="mono" style={{ fontWeight: 700, fontSize: 13 }}>
                {signed(pr.furnace_coking_residual_F, 1)} °F
              </span>
              <span className={`badge ${badgeClass(pr.furnace_coking_status)}`} style={{ fontSize: 9.5 }}>
                {pr.furnace_coking_status}
              </span>
            </div>
          </div>

          <div className="stack" style={{ gap: 2 }}>
            <span className="muted" style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Hydraulic Flooding Ratio
            </span>
            <div className="row" style={{ gap: 6, alignItems: "center" }}>
              <span className="mono" style={{ fontWeight: 700, fontSize: 13 }}>
                {num(pr.hydraulic_dp_norm, 2)}x nom
              </span>
              <span className={`badge ${badgeClass(pr.flooding_status)}`} style={{ fontSize: 9.5 }}>
                dP {num(pr.hydraulic_dp_frac, 3)}
              </span>
            </div>
          </div>
        </div>

        {/* 3. Interactive 2D ISA-101 SVG Process Flowsheet */}
        <RefinerySvgProcessFlowsheet
          units={twin.units}
          selectedUnitId={selectedUnit.unit_id}
          onSelectUnit={handleUnitClick}
          onOpenUseCase={onOpenUseCase}
        />

        {/* 4. Three Closed-Loop Thermodynamic Coupling Pills (SDD-TWIN-02) */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 8,
          }}
        >
          {twin.system_loops.map((loop) => (
            <div
              key={loop.loop_id}
              style={{
                padding: "8px 11px",
                borderRadius: "var(--radius-sm)",
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderLeft: `3px solid ${statusHex(loop.status)}`,
                display: "flex",
                flexDirection: "column",
                gap: 3,
              }}
            >
              <div className="row between" style={{ gap: 6 }}>
                <span style={{ fontWeight: 600, fontSize: 11.5 }}>{loop.name}</span>
                <span className={`badge ${badgeClass(loop.status)}`} style={{ fontSize: 9.5 }}>
                  {loop.status}
                </span>
              </div>
              <div className="mono" style={{ fontSize: 10.5, color: "var(--text)" }}>
                {loop.flow_label}
              </div>
              <div className="mono muted" style={{ fontSize: 10 }}>
                {loop.conservation_metric}
              </div>
            </div>
          ))}
        </div>

        {/* 5. FULL UNIT DIGITAL TWIN OPERATIONAL WORKSPACE (Dynamic when clicking any unit) */}
        <div
          style={{
            padding: "16px",
            borderRadius: "var(--radius-sm)",
            background: "var(--surface)",
            border: "1px solid var(--border-strong)",
          }}
          data-testid="twin-unit-inspector"
        >
          <div className="stack" style={{ gap: 14 }}>
            {/* Workspace Header */}
            <div className="row between" style={{ flexWrap: "wrap", gap: 10 }}>
              <div>
                <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span className="badge neutral mono" style={{ fontSize: 11 }}>
                    UNIT DIGITAL TWIN WORKSPACE · SEQ #{selectedUnit.seq}
                  </span>
                  <span className={`badge ${badgeClass(selectedUnit.status)}`} style={{ fontSize: 11 }}>
                    {selectedUnit.status_label}
                  </span>
                  <span className="badge neutral mono" style={{ fontSize: 10.5 }}>
                    {selectedUnit.tag_table?.length ?? 0} Subscribed Tags · {selectedUnit.chart_panels?.length ?? 0} Live Trends
                  </span>
                </div>
                <h3 style={{ margin: "6px 0 2px", fontSize: 16, fontWeight: 700 }}>
                  {selectedUnit.name}
                </h3>
                <div className="muted" style={{ fontSize: 12 }}>
                  {selectedUnit.subtitle} · Solves Plant Requirements{" "}
                  <strong>{selectedUnit.use_case_ids.join(", ")}</strong>
                </div>
              </div>

              <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                {twin.use_cases
                  .filter((uc) => selectedUnit.use_case_ids.includes(uc.id))
                  .map((uc) => (
                    <button
                      key={uc.id}
                      type="button"
                      className="btn sm"
                      onClick={() => onOpenUseCase?.(uc.id)}
                    >
                      {uc.id} (#{uc.number}): {uc.title.split(" ")[0]} →
                    </button>
                  ))}
              </div>
            </div>

            {/* 2 Live Multi-Trace Time-Series Charts for the Selected Unit */}
            {selectedUnit.chart_panels && selectedUnit.chart_panels.length > 0 ? (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
                  gap: 12,
                }}
              >
                {selectedUnit.chart_panels.map((panel) => (
                  <MultiTraceUnitChart
                    key={panel.panel_id}
                    panel={panel}
                    runId={twin.provenance.run_id}
                    timeMin={twin.provenance.time_min}
                  />
                ))}
              </div>
            ) : null}

            {/* 3-Zone Operating Envelope + Actionable Decision Cards (Accept / Decline) */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
                gap: 12,
              }}
            >
              <div
                style={{
                  padding: "12px 14px",
                  borderRadius: 6,
                  background: "var(--elevated)",
                  border: "1px solid var(--border)",
                }}
              >
                <ThreeZoneEnvelopeBar env={selectedUnit.envelope} />
              </div>

              <div className="stack" style={{ gap: 10 }}>
                {(selectedUnit.decisions_needed ?? []).map((dc) => (
                  <TwinDecisionActionCard
                    key={dc.rec_id}
                    card={dc}
                    runId={twin.provenance.run_id}
                    timeMin={twin.provenance.time_min}
                  />
                ))}
              </div>
            </div>

            {/* Complete Unit Tag Table (All CVs, MVs, SPs, Disturbances, Valves & Redundant Sensors) */}
            {selectedUnit.tag_table && selectedUnit.tag_table.length > 0 ? (
              <UnitTagTable
                rows={selectedUnit.tag_table}
                title={`${selectedUnit.short_name} · Complete Process Telemetry, Set Points, Valves & Redundant Sensors`}
              />
            ) : null}
          </div>
        </div>

        {/* 6. 4-Domain Systems-Thinking Ripple Matrix (SDD-RIP-01) */}
        {showRipple ? (
          <div
            style={{
              padding: "12px 14px",
              borderRadius: "var(--radius-sm)",
              background: "var(--surface)",
              border: "1px solid var(--border)",
            }}
            data-testid="systems-ripple-matrix"
          >
            <div className="row between" style={{ flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
              <div>
                <span style={{ fontWeight: 700, fontSize: 13 }}>
                  Systems-Thinking 4-Domain Ripple Matrix ("One Connected Elephant")
                </span>
                <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>
                  Primary Move: <strong>{sr.primary_move.action} {sr.primary_move.parameter}</strong> ({sr.primary_move.sp_before} → {sr.primary_move.sp_after} °F, Δ {signed(sr.primary_move.delta_F, 1)} °F)
                </span>
              </div>
              <span className={`badge ${sr.gate_status === "PASS" ? "green" : "amber"}`} style={{ fontSize: 10.5 }}>
                Spread Gate {sr.gate_status} · Advisory Only
              </span>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
                gap: 10,
              }}
            >
              {(["yield", "energy", "regeneration", "reliability"] as const).map((domKey) => {
                const dom = sr.domains[domKey];
                return (
                  <div
                    key={domKey}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 6,
                      background: "var(--elevated)",
                      border: "1px solid var(--border)",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      gap: 8,
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4 }}>{dom.title}</div>
                      <p className="muted" style={{ margin: 0, fontSize: 11.5, lineHeight: 1.4 }}>
                        {dom.summary}
                      </p>
                    </div>
                    <div className="stack" style={{ gap: 4, paddingTop: 6, borderTop: "1px solid var(--border)" }}>
                      {dom.metrics.map((m) => (
                        <div key={m.label} className="row between mono" style={{ fontSize: 10.5 }}>
                          <span className="muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {m.label}
                          </span>
                          <span>
                            {m.before} → <strong>{m.after}</strong> ({signed(m.delta, 2)} {m.unit})
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
