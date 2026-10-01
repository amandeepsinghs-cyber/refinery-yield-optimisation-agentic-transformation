"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCockpit } from "@/lib/store";
import { getTwinWorkbench } from "@/lib/twinApi";
import { TwinWorkbench } from "@/lib/twinTypes";
import ChartStack from "./ChartStack";
import RecipeCard from "./RecipeCard";
import AnalysisZone from "./AnalysisZone";
import ModelsZone from "./ModelsZone";
import { clock } from "@/lib/format";

function L1Content({ unitId }: { unitId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const uc = searchParams?.get("uc");
  const runId = useCockpit((s) => s.runId);
  const timeMin = useCockpit((s) => s.timeMin);
  
  const [data, setData] = useState<TwinWorkbench | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getTwinWorkbench(unitId, runId, timeMin)
      .then((d) => { if (active) { setData(d); setLoading(false); } })
      .catch((e) => { 
        console.error(e);
        if (active) setLoading(false); 
      });
    return () => { active = false; };
  }, [unitId, runId, timeMin]);

  useEffect(() => {
    if (uc && data) {
      setTimeout(() => {
        const el = document.getElementById(`panel-${uc}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.classList.add("twin-panel-highlight");
          setTimeout(() => el.classList.remove("twin-panel-highlight"), 3000);
        }
      }, 500);
    }
  }, [uc, data]);

  if (loading) return <div className="twin-container p-4">Loading unit workbench...</div>;
  if (!data) return <div className="twin-container p-4">Engine not available yet</div>;

  const { unit, time, analysis } = data;

  return (
    <div className="twin-container p-4 stack" style={{ gap: 24 }}>
      {/* Header */}
      <div className="row gap-2 muted" style={{ fontSize: 12 }}>
        <button className="btn text" onClick={() => router.push("/twin")}>← Back to L0</button>
        <span>/</span>
        <span>{unit.name}</span>
      </div>
      
      <div className="twin-card row between" style={{ alignItems: "center", padding: "12px 24px" }}>
        <div className="row gap-4" style={{ alignItems: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 600 }}>{unit.name}</div>
          <div className="row gap-2" style={{ padding: "4px 8px", background: "var(--canvas)", borderRadius: 12, border: "1px solid var(--border)", alignItems: "center" }}>
            <span style={{ fontSize: 12, fontWeight: 500 }}>{data.regime?.regime_label ?? data.models.surrogate.regime_id}</span>
          </div>
          <div className={`twin-pill-${unit.status}`}>{unit.status_label}</div>
        </div>
        
        <div className="row gap-4" style={{ alignItems: "center" }}>
          <div className="mono" style={{ fontSize: 14 }}>t = {time.time_min} ({time.ts.slice(11,16)})</div>
          <div style={{ borderLeft: "1px solid var(--border)", height: 24 }} />
          <div>Next lab: <strong>{analysis.minutes_before_next_lab}</strong>m</div>
        </div>
      </div>

      <div className="twin-layout">
        <div className="twin-main stack" style={{ gap: 24 }}>
          {/* ZONE 1: Data */}
          <div className="twin-zone">
            <div className="twin-zone-header">Data</div>
            
            {/* I/O Strip */}
            <div className="twin-card row between" style={{ marginBottom: 16, alignItems: 'center', padding: "16px" }}>
              <div className="stack gap-2" style={{ flex: 1 }}>
                <div className="muted" style={{ fontSize: 11 }}>INPUTS</div>
                {unit.io.inputs.map(i => <div key={i.tag}>{i.label}: <strong>{i.value}</strong> {i.unit}</div>)}
              </div>
              
              <div style={{ padding: "0 16px" }}>
                <svg width="40" height="20"><path d="M0,10 L35,10 M30,5 L35,10 L30,15" stroke="var(--borderStrong)" strokeWidth="2" fill="none"/></svg>
              </div>

              <div style={{ padding: "16px 24px", border: "1px solid var(--borderStrong)", borderRadius: 6, background: "var(--canvas)", fontWeight: 500 }}>
                {unit.short_name}
              </div>

              <div style={{ padding: "0 16px" }}>
                <svg width="40" height="20"><path d="M0,10 L35,10 M30,5 L35,10 L30,15" stroke="var(--borderStrong)" strokeWidth="2" fill="none"/></svg>
              </div>

              <div className="stack gap-2" style={{ flex: 1, alignItems: 'flex-end' }}>
                <div className="muted" style={{ fontSize: 11 }}>OUTPUTS</div>
                {unit.io.outputs.map(i => <div key={i.tag}>{i.label}: <strong>{i.value}</strong> {i.unit}</div>)}
              </div>
            </div>

            {/* Chart Stack */}
            <ChartStack data={data} />
            
            {/* Tag Table */}
            {unit.tag_table && unit.tag_table.length > 0 && (
              <div className="twin-card mt-4 p-4" style={{ overflowX: "auto" }}>
                <div className="twin-zone-header" style={{ borderBottom: "none", paddingBottom: 0, marginBottom: 8 }}>Process Tags</div>
                <table style={{ width: "100%", fontSize: 12, textAlign: "left", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      <th className="muted font-normal py-2">Tag</th>
                      <th className="muted font-normal py-2">Role</th>
                      <th className="muted font-normal py-2">Current</th>
                      <th className="muted font-normal py-2">Min / Mean / Max</th>
                      <th className="muted font-normal py-2">Limit / SP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unit.tag_table.map((t) => (
                      <tr key={t.tag} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td className="py-2">{t.tag}</td>
                        <td className="py-2"><span className="badge neutral mono" style={{ fontSize: 10 }}>{t.role}</span></td>
                        <td className="py-2 mono"><strong>{t.current}</strong></td>
                        <td className="py-2 mono muted">{t.min} / {t.mean} / {t.max}</td>
                        <td className="py-2 mono">{t.limit ?? t.sp ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ZONE 2: Analysis */}
          <div className="twin-zone">
            <div className="twin-zone-header">Analysis</div>
            <AnalysisZone analysis={data.analysis} />
          </div>
        </div>

        <div className="twin-rail stack" style={{ gap: 24 }}>
          {/* ZONE 3: Models */}
          <div className="twin-zone">
            <div className="twin-zone-header">Models</div>
            <ModelsZone models={data.models} />
          </div>

          {/* ZONE 4: Decisions */}
          <div className="twin-zone">
            <div className="twin-zone-header">Decisions</div>
            <RecipeCard 
              recipe={data.recipe} 
              decisions={data.decisions}
              unitId={unitId}
              runId={runId}
              timeMin={timeMin ?? 0}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function L1Workbench({ unitId }: { unitId: string }) {
  return (
    <Suspense fallback={<div className="twin-container p-4">Loading workbench...</div>}>
      <L1Content unitId={unitId} />
    </Suspense>
  );
}
