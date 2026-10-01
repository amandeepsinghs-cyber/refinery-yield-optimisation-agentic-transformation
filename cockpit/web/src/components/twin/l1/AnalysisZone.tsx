"use client";

import { useState } from "react";
import { TwinAnalysis } from "@/lib/twinTypes";
import { clock } from "@/lib/format";

export default function AnalysisZone({ analysis }: { analysis: TwinAnalysis }) {
  const [lang, setLang] = useState<"en" | "hinglish" | "hi">("en");

  // Filter specific step events for ribbon
  const ribbonSteps = ["breach", "agent flag", "root cause", "recipe", "accepted"];
  const ribbonEvents = analysis.events.filter(e => ribbonSteps.some(s => e.kind.toLowerCase().includes(s)));

  return (
    <div className="twin-card stack" style={{ gap: 16 }}>
      {/* Event Ribbon (Horizontal Steps) */}
      <div style={{ borderBottom: "1px solid var(--border)", paddingBottom: 16 }}>
        <div className="muted" style={{ fontSize: 11, marginBottom: 8 }}>EVENT RIBBON</div>
        <div className="row gap-4" style={{ overflowX: "auto", paddingBottom: 4 }}>
          {analysis.events.map((e, i) => (
            <div key={i} className="row gap-2" style={{ alignItems: "center", whiteSpace: "nowrap" }}>
              <div className="stack gap-1">
                <span className="mono muted" style={{ fontSize: 10 }}>{clock(e.time_min)}</span>
                <span className={`twin-pill-${e.severity === 'info' ? 'OK' : e.severity === 'warn' ? 'WATCH' : 'ACT'}`}>{e.kind}</span>
              </div>
              {i < analysis.events.length - 1 && <span className="muted">→</span>}
            </div>
          ))}
          {analysis.events.length === 0 && <span className="muted" style={{ fontSize: 12 }}>No events</span>}
        </div>
      </div>

      <div className="row gap-4" style={{ flexWrap: "wrap", borderBottom: "1px solid var(--border)", paddingBottom: 16 }}>
        <div className="stack gap-1" style={{ flex: 1, minWidth: 120 }}>
          <div className="muted" style={{ fontSize: 11 }}>STATUS</div>
          <div style={{ fontSize: 18, fontWeight: 500, color: analysis.breach_open ? "var(--accent)" : "inherit" }}>
            {analysis.breach_open ? `BREACH (${analysis.first_breach_min}m)` : "NOMINAL"}
          </div>
        </div>
        
        <div className="stack gap-1" style={{ flex: 1, minWidth: 120 }}>
          <div className="muted" style={{ fontSize: 11 }}>RESIDUAL</div>
          <div style={{ fontSize: 18, fontWeight: 500 }}>{analysis.residual_now}</div>
        </div>
        
        <div className="stack gap-1" style={{ flex: 1, minWidth: 120 }}>
          <div className="muted" style={{ fontSize: 11 }}>σ (SIGMA)</div>
          <div style={{ fontSize: 18, fontWeight: 500 }}>{analysis.sigma_now}</div>
        </div>

        <div className="stack gap-1" style={{ flex: 1, minWidth: 120 }}>
          <div className="muted" style={{ fontSize: 11 }}>CUSUM</div>
          <div style={{ fontSize: 18, fontWeight: 500 }}>{analysis.cusum_now}</div>
        </div>

        <div className="stack gap-1" style={{ flex: 1, minWidth: 120 }}>
          <div className="muted" style={{ fontSize: 11 }}>NEXT LAB</div>
          <div style={{ fontSize: 18, fontWeight: 500 }}>{analysis.minutes_before_next_lab} m</div>
        </div>
      </div>

      <div className="row gap-4">
        <div style={{ flex: 1 }}>
          <div className="muted" style={{ fontSize: 11, marginBottom: 8 }}>ROOT CAUSE BARS</div>
          <div className="stack gap-3">
            {analysis.root_cause.map((rc, i) => (
              <div key={i} className="row gap-3" style={{ alignItems: "center" }}>
                <span style={{ width: 100, fontSize: 12 }} className="muted">{rc.label ?? rc.tag}</span>
                <div style={{ flex: 1, height: 6, background: "var(--canvas)", borderRadius: 3 }}>
                  <div style={{ width: `${Math.min(100, Math.abs(rc.contrib) * 20)}%`, height: "100%", background: rc.direction === 'up' ? "var(--accent)" : "var(--borderStrong)", borderRadius: 3 }} />
                </div>
                <span style={{ fontSize: 12, width: 30, textAlign: "right" }}>{rc.contrib}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ background: "var(--canvas)", padding: 12, borderRadius: 6 }}>
        <div className="row between" style={{ marginBottom: 8 }}>
          <div className="muted" style={{ fontSize: 11 }}>SUMMARY</div>
          <div className="row gap-2">
            <button className="btn text" style={{ fontWeight: lang === 'en' ? 'bold' : 'normal', padding: '0 4px', fontSize: 11 }} onClick={() => setLang('en')}>EN</button>
            <button className="btn text" style={{ fontWeight: lang === 'hinglish' ? 'bold' : 'normal', padding: '0 4px', fontSize: 11 }} onClick={() => setLang('hinglish')}>Hinglish</button>
            <button className="btn text" style={{ fontWeight: lang === 'hi' ? 'bold' : 'normal', padding: '0 4px', fontSize: 11 }} onClick={() => setLang('hi')}>हिंदी</button>
          </div>
        </div>
        <div style={{ lineHeight: 1.5, fontSize: 13 }}>
          {analysis.summary[lang]}
        </div>
      </div>
    </div>
  );
}
