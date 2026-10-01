"use client";

import { useDeferredValue, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAudit, useHealth, useConfig } from "@/lib/api";
import { Card, EmptyState, PageHeader, PlannedState, QueryView } from "@/components/ui/primitives";
import { IconSearch } from "@/components/ui/icons";

export function AuditView() {
  const [q, setQ] = useState("");
  const dq = useDeferredValue(q);
  const audit = useAudit(dq);
  return (
    <div className="page">
      <PageHeader
        title="Audit log"
        question="Who decided what, when — and what did the system do?"
        actions={
          <div className="search-box" style={{ width: 320 }}>
            <IconSearch />
            <label htmlFor="audit-q" className="sr-only">
              Search audit log
            </label>
            <input id="audit-q" className="input" placeholder="Search actor, action, target…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        }
      />
      <Card title="Events" sub="recorded only · no control-system writes">
        <QueryView q={audit} isEmpty={(d) => !d.length} empty={<EmptyState title="No audit events" detail={q ? "No events match this search." : "Accept/Decline decisions and gate transitions appear here."} />}>
          {(rows) => (
            <div className="table-wrap">
              <table className="t">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Actor</th>
                    <th>Action</th>
                    <th>Target</th>
                    <th>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.audit_id}>
                      <td className="num" style={{ whiteSpace: "nowrap" }}>{r.ts}</td>
                      <td>{r.actor}</td>
                      <td>
                        <span className="badge neutral">{r.action}</span>
                      </td>
                      <td className="mono" style={{ fontSize: 12 }}>{r.target}</td>
                      <td className="muted" style={{ fontSize: 12 }}>
                        {typeof r.detail === "string" ? r.detail : r.detail ? JSON.stringify(r.detail) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </QueryView>
      </Card>
    </div>
  );
}

const ROLES = [
  { name: "Operator", path: "/decision/overview", desc: "Actionable recommendations, live KPIs & fan charts" },
  { name: "Process Engineer", path: "/technical/timeseries", desc: "Multi-panel time series, truth overlay & lab draws" },
  { name: "Data Scientist", path: "/modelling/models", desc: "Model comparison, CRPS, coverage & weights" },
  { name: "Shift Lead", path: "/knowledge", desc: "Shift handover logs, incident records & work orders" },
] as const;

export function SettingsView() {
  const router = useRouter();
  const health = useHealth();
  const cfg = useConfig();
  const [wallMode, setWallMode] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem("fcc_wall_mode") === "true";
    setWallMode(saved);
    document.documentElement.dataset.wallMode = saved ? "true" : "false";
    document.documentElement.style.fontSize = saved ? "118%" : "";
  }, []);

  const toggleWallMode = () => {
    const next = !wallMode;
    setWallMode(next);
    if (typeof window !== "undefined") {
      localStorage.setItem("fcc_wall_mode", next ? "true" : "false");
      document.documentElement.dataset.wallMode = next ? "true" : "false";
      document.documentElement.style.fontSize = next ? "118%" : "";
    }
  };

  const handleRoleSelect = (path: string, roleName: string) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("fcc_user_role", roleName);
    }
    router.push(path);
  };

  return (
    <div className="page">
      <PageHeader title="Settings" question="How is the cockpit configured, and is every service healthy?" />
      <div className="grid">
        <Card
          className="s-12"
          title="Display & Control-Room Mode (F25)"
          sub="Layout scaling for control-room wall displays & role-based landing views"
        >
          <div className="stack" style={{ gap: 20 }}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
              <div className="stack" style={{ gap: 4, maxWidth: 580 }}>
                <div style={{ fontWeight: 600, fontSize: "var(--fs-md, 14px)" }}>Control-Room Wall Mode</div>
                <div className="muted" style={{ fontSize: "var(--fs-xs, 12px)", lineHeight: 1.4 }}>
                  Optimizes display zoom and visual contrast for large overhead wall displays and control-room monitors (≥ 2560 px).
                  Enlarges root font size by 118% for distant legibility across the room.
                </div>
              </div>
              <div className="row" style={{ gap: 10, alignItems: "center" }}>
                <span className={`badge ${wallMode ? "green" : "neutral"}`}>
                  {wallMode ? "Active (118% Zoom)" : "Standard (100%)"}
                </span>
                <button
                  type="button"
                  className={`btn ${wallMode ? "primary" : ""}`}
                  onClick={toggleWallMode}
                >
                  {wallMode ? "Disable Wall Mode" : "Enable Wall Mode"}
                </button>
              </div>
            </div>

            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
              <div className="stack" style={{ gap: 8 }}>
                <div style={{ fontWeight: 600, fontSize: "var(--fs-md, 14px)" }}>Role Switcher &amp; Default Dashboard</div>
                <div className="muted" style={{ fontSize: "var(--fs-xs, 12px)" }}>
                  Select an operational role to navigate to that role&apos;s primary dashboard:
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: 10,
                    marginTop: 4,
                  }}
                >
                  {ROLES.map((r) => (
                    <button
                      key={r.name}
                      type="button"
                      className="btn"
                      style={{
                        height: "auto",
                        padding: "12px",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-start",
                        textAlign: "left",
                        gap: 4,
                        whiteSpace: "normal",
                      }}
                      onClick={() => handleRoleSelect(r.path, r.name)}
                    >
                      <div className="row" style={{ width: "100%", justifyContent: "space-between", alignItems: "center" }}>
                        <strong>{r.name}</strong>
                        <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>{r.path}</span>
                      </div>
                      <div className="muted" style={{ fontSize: 11 }}>{r.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Card>
        <Card className="s-6 s-md-12" title="Service health" sub="GET /api/health · read-only">
          <QueryView q={health} height={140}>
            {(h) => (
              <dl className="kv">
                <dt>API</dt>
                <dd>{h.status}</dd>
                <dt>Simulated runs</dt>
                <dd>{h.data.runs}</dd>
                <dt>Batches</dt>
                <dd>{h.data.batches.join(", ") || "—"}</dd>
                <dt>Models trained</dt>
                <dd>{h.data.trained ? `yes · ${h.data.trained_at ?? ""}` : "no"}</dd>
                <dt>Gemini</dt>
                <dd>{h.gemini.ok ? `${h.gemini.text_model} · ${h.gemini.live_model}` : `unavailable${h.gemini.note ? ` — ${h.gemini.note}` : ""}`}</dd>
                <dt>Vertex AI</dt>
                <dd>
                  {h.gemini.project} · {h.gemini.location}
                </dd>
                <dt>Knowledge index</dt>
                <dd>
                  {h.knowledge.mode === "empty" ? "Knowledge corpus not generated yet — see delegation.md" : `${h.knowledge.docs} docs · ${h.knowledge.chunks} chunks · ${h.knowledge.mode}`}
                </dd>
              </dl>
            )}
          </QueryView>
        </Card>
        <Card className="s-6 s-md-12" title="Thresholds" sub="GET /api/config · read-only">
          <QueryView q={cfg} height={140}>
            {(c) => (
              <dl className="kv">
                {Object.entries(c.spec).map(([k, v]) => (
                  <div key={k} style={{ display: "contents" }}>
                    <dt>Spec {k}</dt>
                    <dd>≤ {v} °F</dd>
                  </div>
                ))}
                <dt>R</dt>
                <dd>{c.R} °F</dd>
                <dt>W90 limit</dt>
                <dd>{c.w90_limit} °F</dd>
                <dt>Hysteresis</dt>
                <dd>
                  {c.hysteresis_ratio} × limit for {c.hysteresis_min} min
                </dd>
              </dl>
            )}
          </QueryView>
        </Card>
      </div>
    </div>
  );
}

export function PlannedPage({ title, question, feature, bullets }: { title: string; question: string; feature: string; bullets: string[] }) {
  return (
    <div className="page">
      <PageHeader title={title} question={question} />
      <PlannedState feature={feature} title={`${title} — Demo+`} bullets={bullets} />
    </div>
  );
}
