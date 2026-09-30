"use client";

import { useDeferredValue, useState } from "react";
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

export function SettingsView() {
  const health = useHealth();
  const cfg = useConfig();
  return (
    <div className="page">
      <PageHeader title="Settings" question="How is the cockpit configured, and is every service healthy?" />
      <PlannedState
        feature="F18"
        title="Editable settings"
        bullets={["Role switcher and default landing dashboard (F17)", "Wall mode for ≥ 2560 px displays (F19)", "Threshold review via /api/config/thresholds"]}
      />
      <div className="grid">
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
