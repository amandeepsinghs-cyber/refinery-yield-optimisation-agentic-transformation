"use client";

import { useState, useEffect, useRef } from "react";
import { TwinRecipe } from "@/lib/twinTypes";
import { postTwinDecision } from "@/lib/api";
import { postWhatIf } from "@/lib/twinApi";

export default function RecipeCard({ 
  recipe, 
  decisions,
  unitId,
  runId,
  timeMin
}: { 
  recipe: TwinRecipe | null;
  decisions: any[];
  unitId: string;
  runId: string | null;
  timeMin: number;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [moves, setMoves] = useState<Record<string, number>>({});
  const [effects, setEffects] = useState<TwinRecipe | null>(recipe);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize moves
  useEffect(() => {
    if (recipe) {
      const initial: Record<string, number> = {};
      recipe.moves.forEach(m => { initial[m.sp_tag] = m.recommended; });
      setMoves(initial);
      setEffects(recipe);
    }
  }, [recipe]);

  const handleMoveChange = (tag: string, val: number) => {
    const newMoves = { ...moves, [tag]: val };
    setMoves(newMoves);
    
    if (debounceRef.current) clearTimeout(debounceRef.current);
    
    debounceRef.current = setTimeout(() => {
      if (!runId) return;
      postWhatIf(runId, timeMin, unitId, newMoves).then(res => {
        setEffects(prev => prev ? {
          ...prev,
          predicted: res.predicted,
          d_yield_pct_feed: res.d_yield_pct_feed,
          p_on_spec: res.p_on_spec,
          // Could update fuel/power/coke here if returned by what-if, assuming backend aligns
        } : null);
      }).catch(console.error);
    }, 300);
  };

  if (!recipe || !effects) {
    return <div className="twin-card p-4 muted">No recipe available.</div>;
  }

  const handleDecision = async (decision: "accepted" | "declined") => {
    setSubmitting(true);
    try {
      await postTwinDecision(
        decisions[0]?.rec_id ?? recipe.recipe_id, 
        decision, 
        "operator", 
        "", 
        runId, 
        timeMin,
        recipe.recipe_id
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="twin-card stack" style={{ gap: 16 }}>
      {recipe.gate === "WITHHELD" ? (
        <div style={{ padding: 12, border: "1px solid var(--borderStrong)", background: "var(--canvas)", borderRadius: 6 }}>
          <div style={{ color: "#d97706", fontWeight: 600, marginBottom: 8, fontSize: 13 }}>GATE WITHHELD</div>
          <div className="mono" style={{ fontSize: 12 }}>{recipe.gate_reason}</div>
        </div>
      ) : (
        <>
          <div>
            <div className="muted" style={{ fontSize: 11, marginBottom: 12 }}>RECOMMENDED MOVES</div>
            <div className="stack gap-3">
              {recipe.moves.map((m) => {
                const cur = moves[m.sp_tag] ?? m.recommended;
                const delta = cur - m.current;
                return (
                  <div key={m.sp_tag} style={{ border: "1px solid var(--border)", padding: "12px", borderRadius: 6, background: "var(--canvas)" }}>
                    <div className="row between" style={{ marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{m.label}</span>
                      <span style={{ fontSize: 11 }} className="muted mono">{m.sp_tag}</span>
                    </div>
                    <div className="row between mono" style={{ fontSize: 13, marginBottom: 8 }}>
                      <span>{m.current.toFixed(1)} → <strong>{cur.toFixed(1)}</strong> {m.unit}</span>
                      <span style={{ color: delta > 0 ? "var(--accent)" : "inherit" }}>Δ {delta > 0 ? "+" : ""}{delta.toFixed(1)}</span>
                    </div>
                    <input 
                      type="range" 
                      min={m.limit_lo} 
                      max={m.limit_hi} 
                      value={cur} 
                      step={0.1} 
                      onChange={(e) => handleMoveChange(m.sp_tag, parseFloat(e.target.value))}
                      style={{ width: "100%", accentColor: "var(--accent)" }} 
                    />
                    <div className="row between muted" style={{ fontSize: 10, marginTop: 4 }}>
                      <span>{m.limit_lo}</span>
                      <span>{m.limit_hi}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="row gap-4" style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
            <div className="stack gap-2" style={{ flex: 1 }}>
              <div className="muted" style={{ fontSize: 11 }}>Δ YIELD (% feed)</div>
              {Object.entries(effects.d_yield_pct_feed).map(([k, v]) => (
                <div key={k} className="row between" style={{ fontSize: 12 }}>
                  <span>{k}</span><strong style={{ color: v > 0 ? '#16a34a' : v < 0 ? '#dc2626' : 'inherit' }}>{v > 0 ? "+" : ""}{v.toFixed(2)}</strong>
                </div>
              ))}
            </div>
            
            <div className="stack gap-2" style={{ flex: 1 }}>
              <div className="muted" style={{ fontSize: 11 }}>UTILITIES</div>
              <div className="row between" style={{ fontSize: 12 }}><span>Fuel (lb/s)</span><strong>{effects.d_fuel_lb_s.toFixed(2)}</strong></div>
              <div className="row between" style={{ fontSize: 12 }}><span>Power (MW)</span><strong>{effects.d_power_MW.toFixed(2)}</strong></div>
              <div className="row between" style={{ fontSize: 12 }}><span>Coke (%)</span><strong>{effects.d_coke_pct.toFixed(2)}</strong></div>
              
              <div className="muted mt-2" style={{ fontSize: 11 }}>P(ON-SPEC)</div>
              {Object.entries(effects.p_on_spec).map(([k, v]) => (
                <div key={k} className="row between" style={{ fontSize: 12 }}>
                  <span>{k}</span><strong style={{ color: v >= 0.95 ? '#16a34a' : 'inherit' }}>{(v * 100).toFixed(0)}%</strong>
                </div>
              ))}
            </div>
          </div>

          <div className="row gap-3" style={{ marginTop: 12 }}>
            <button 
              className="btn" 
              style={{ flex: 1, padding: "8px 0", background: "var(--accent)", color: "white", border: "none" }} 
              disabled={submitting} 
              onClick={() => handleDecision("accepted")}
            >
              Accept Recipe
            </button>
            <button 
              className="btn" 
              style={{ flex: 1, padding: "8px 0", background: "transparent", border: "1px solid var(--borderStrong)" }} 
              disabled={submitting}
              onClick={() => handleDecision("declined")}
            >
              Decline
            </button>
          </div>
        </>
      )}

      {recipe.citations && recipe.citations.length > 0 && (
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
          <div className="muted" style={{ fontSize: 11, marginBottom: 8 }}>CITATIONS</div>
          <div className="stack gap-2">
            {recipe.citations.map((c, i) => (
              <div key={i} className="stack gap-1" style={{ fontSize: 11 }}>
                <span className="mono">[{c.doc_id} {c.revision} §{c.section}]</span>
                <span className="muted">{c.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
