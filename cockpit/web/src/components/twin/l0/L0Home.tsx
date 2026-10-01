"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useCockpit } from "@/lib/store";
import { getTwinOverview } from "@/lib/twinApi";
import { TwinOverview } from "@/lib/twinTypes";
import PFDSvg from "./PFDSvg";
import TimelineStrip from "./TimelineStrip";

export default function L0Home() {
  const runId = useCockpit((s) => s.runId);
  const timeMin = useCockpit((s) => s.timeMin);
  
  const [data, setData] = useState<TwinOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getTwinOverview(runId, timeMin)
      .then((d) => { if (active) { setData(d); setLoading(false); } })
      .catch((e) => { 
        console.error(e);
        if (active) setLoading(false); 
      });
    return () => { active = false; };
  }, [runId, timeMin]);

  if (loading) return <div className="twin-container p-4">Loading digital twin...</div>;
  if (!data) return <div className="twin-container p-4">Engine not available yet</div>;

  return (
    <div className="twin-container p-4 stack" style={{ gap: 24 }}>
      {/* Crude Slate Banner */}
      <div className="twin-card row between" style={{ alignItems: "center", padding: "12px 24px" }}>
        <div className="row gap-4" style={{ alignItems: "center" }}>
          <div>
            <div className="muted" style={{ fontSize: 11 }}>DECLARED API</div>
            <div style={{ fontSize: 16, fontWeight: 500 }}>{data.crude_slate.declared_api}</div>
          </div>
          <div style={{ borderLeft: "1px solid var(--border)", height: 32 }} />
          <div>
            <div className="muted" style={{ fontSize: 11 }}>DETECTED REGIME</div>
            <div style={{ fontSize: 16, fontWeight: 500 }}>{data.crude_slate.regime_label}</div>
          </div>
        </div>

        <div style={{ flex: 1, maxWidth: 400, margin: "0 32px" }}>
          <div className="row between muted" style={{ fontSize: 11, marginBottom: 4 }}>
            <span>Transition Progress</span>
            <span>{data.crude_slate.transition_pct}%</span>
          </div>
          <div style={{ height: 6, background: "var(--canvas)", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${data.crude_slate.transition_pct}%`, background: "var(--accent)" }} />
          </div>
        </div>

        <div className="row gap-4" style={{ alignItems: "center" }}>
          <div className={`twin-pill-${data.crude_slate.declared_vs_detected === 'match' ? 'OK' : 'ACT'}`}>
            {data.crude_slate.declared_vs_detected.toUpperCase()}
          </div>
          <div style={{ borderLeft: "1px solid var(--border)", height: 32 }} />
          <div>
            <div className="muted" style={{ fontSize: 11 }}>NOVELTY</div>
            <div className="row gap-2" style={{ alignItems: "center" }}>
              <div style={{ width: 40, height: 4, background: "var(--canvas)", borderRadius: 2 }}>
                <div style={{ width: `${Math.min(100, data.crude_slate.novelty * 100)}%`, height: "100%", background: "var(--accent)", borderRadius: 2 }} />
              </div>
              <span style={{ fontSize: 12 }}>{data.crude_slate.novelty.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="twin-layout">
        <div className="twin-main">
          <div className="twin-zone-header">Process Flow Diagram</div>
          <PFDSvg units={data.units} />
        </div>

        <div className="twin-rail stack" style={{ gap: 24 }}>
          {/* Needs Attention */}
          <div className="twin-card">
            <div className="twin-zone-header">Needs Attention</div>
            {data.needs_attention.length === 0 ? (
              <div className="muted">All clear</div>
            ) : (
              <div className="stack gap-4">
                {data.needs_attention.map((n, i) => (
                  <div key={i} className="stack gap-1">
                    <div className="row gap-2" style={{ alignItems: "center" }}>
                      <div style={{ width: 8, height: 8, borderRadius: 4, background: `var(--${n.severity === 'warn' ? 'amber' : n.severity === 'alarm' ? 'red' : 'accent'})` }} />
                      <span className="badge neutral mono" style={{ fontSize: 10 }}>{n.unit_id}</span>
                    </div>
                    <div style={{ fontWeight: 500, fontSize: 13, lineHeight: 1.4 }}>{n.line}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{n.consequence}</div>
                    <Link href={`/twin/unit/${n.unit_id}`} style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none", marginTop: 4 }}>
                      Open workbench →
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Timeline Strip */}
          <div className="twin-card">
            <div className="twin-zone-header">Shift Timeline (Current t: {timeMin ?? "—"})</div>
            <TimelineStrip timeline={data.timeline} timeMin={timeMin} />
          </div>
        </div>
      </div>
    </div>
  );
}
