"use client";

/** Analysis strip (SDD-L1-07 "Analysis"): residual now / σ / CUSUM / breach, root-cause ranking, briefing in the operator's language. */

import { useCockpit } from "@/lib/store";
import { clock, num, signed } from "@/lib/format";
import type { TwinAnalysis } from "@/lib/twinTypes";

export default function AnalysisStrip({ analysis, unit }: { analysis: TwinAnalysis; unit?: string }) {
  const lang = useCockpit((s) => s.lang);
  const u = unit ?? "";
  const sig = analysis.sigma_now ? analysis.residual_now / analysis.sigma_now : 0;
  return (
    <div className="l1-analysis" data-testid="analysis-strip">
      <span className="l1-section-label">Analysis</span>
      <div className="l1-analysis-grid">
        <div className="l1-stat">
          <span className="l1-stat-k">Residual now</span>
          <span className="l1-stat-v mono">{signed(analysis.residual_now, 2)} {u} <span className="muted">({num(Math.abs(sig), 1)}σ)</span></span>
        </div>
        <div className="l1-stat">
          <span className="l1-stat-k">σ (trailing MAD)</span>
          <span className="l1-stat-v mono">{num(analysis.sigma_now, 2)} {u}</span>
        </div>
        <div className="l1-stat">
          <span className="l1-stat-k">CUSUM</span>
          <span className="l1-stat-v mono">{signed(analysis.cusum_now, 1)}</span>
        </div>
        <div className="l1-stat">
          <span className="l1-stat-k">Breach</span>
          <span className={`l1-stat-v ${analysis.breach_open ? "bad" : "ok"}`}>
            {analysis.breach_open ? `OPEN since ${clock(analysis.first_breach_min)}` : "none open"}
          </span>
        </div>
        <div className="l1-stat l1-stat-wide">
          <span className="l1-stat-k">Root cause (Δ contribution)</span>
          <span className="l1-stat-v">
            {analysis.root_cause.length === 0 && <span className="muted">—</span>}
            {analysis.root_cause.slice(0, 3).map((r) => (
              <span key={r.tag} className="l1-rc" title={r.tag}>
                {r.label ?? r.tag} {r.direction === "up" ? "↑" : r.direction === "down" ? "↓" : "→"} <span className="mono">{signed(r.contrib, 2)}</span>
              </span>
            ))}
          </span>
        </div>
      </div>
      <p className="l1-briefing" lang={lang === "hi" ? "hi" : undefined} data-testid="analysis-summary">
        {analysis.summary?.[lang] || analysis.summary?.en}
      </p>
    </div>
  );
}
