"use client";

import { TwinModels } from "@/lib/twinTypes";

export default function ModelsZone({ models }: { models: TwinModels }) {
  return (
    <div className="twin-card stack" style={{ gap: 16 }}>
      {models.committee && (
        <div style={{ borderBottom: "1px solid var(--border)", paddingBottom: 16 }}>
          <div className="muted" style={{ fontSize: 11, marginBottom: 12 }}>COMMITTEE ENSEMBLE</div>
          
          <div className="stack gap-3" style={{ marginBottom: 16 }}>
            {models.committee.members?.map((m, i) => (
              <div key={i} className="row gap-3" style={{ alignItems: "center" }}>
                <div style={{ width: 100, fontSize: 12 }}>{m.name}</div>
                <div style={{ flex: 1, height: 6, background: "var(--canvas)", borderRadius: 3 }}>
                  <div style={{ width: `${m.weight * 100}%`, height: "100%", background: "var(--accent)", borderRadius: 3 }} />
                </div>
                <div style={{ width: 30, fontSize: 12, textAlign: "right" }}>{(m.weight * 100).toFixed(0)}%</div>
              </div>
            ))}
          </div>

          <div className="row between" style={{ alignItems: "center" }}>
            <div className="stack gap-1">
              <span className="muted" style={{ fontSize: 10 }}>PHYSICS WEIGHT</span>
              <span style={{ fontSize: 16, fontWeight: 500 }}>{((models.committee.physics_weight ?? 0) * 100).toFixed(0)}%</span>
            </div>
            
            <div className="stack gap-1">
              <span className="muted" style={{ fontSize: 10 }}>NOVELTY</span>
              <span style={{ fontSize: 16, fontWeight: 500 }}>{models.committee.novelty?.toFixed(2) ?? '—'}</span>
            </div>
            
            <div className="stack gap-1">
              <span className="muted" style={{ fontSize: 10 }}>REGIME</span>
              <span className="badge neutral mono" style={{ fontSize: 12 }}>{models.committee.regime_id ?? '—'}</span>
            </div>
          </div>
        </div>
      )}
      
      <div style={{ borderBottom: "1px solid var(--border)", paddingBottom: 16 }}>
        <div className="muted" style={{ fontSize: 11, marginBottom: 12 }}>SURROGATE CARD</div>
        <div className="row gap-4" style={{ marginBottom: 12 }}>
          <div className="stack gap-1">
            <span className="muted" style={{ fontSize: 10 }}>NAME</span>
            <span style={{ fontSize: 13, fontWeight: 500 }}>{models.surrogate.name}</span>
          </div>
          <div className="stack gap-1">
            <span className="muted" style={{ fontSize: 10 }}>N_TRAIN</span>
            <span style={{ fontSize: 13, fontWeight: 500 }}>{models.surrogate.n_train_minutes}m</span>
          </div>
        </div>
        
        <div className="stack gap-2">
          {Object.entries(models.surrogate.r2).map(([k, v]) => (
            <div key={k} className="row between" style={{ fontSize: 12 }}>
              <span>{k} R²</span>
              <strong style={{ color: v > 0.8 ? '#16a34a' : 'inherit' }}>{v.toFixed(2)}</strong>
            </div>
          ))}
        </div>
      </div>

      <div style={{ borderBottom: "1px solid var(--border)", paddingBottom: 16 }}>
        <div className="muted" style={{ fontSize: 11, marginBottom: 12 }}>PINN CONSERVATION CHECKS</div>
        <div className="stack gap-3">
          {models.pinn_checks.map((c, i) => (
            <div key={i} className="row between" style={{ alignItems: "center" }}>
              <span style={{ fontSize: 12 }}>{c.name}</span>
              <div className="row gap-2" style={{ alignItems: "center" }}>
                <span style={{ fontSize: 12 }} className="muted">{c.value.toFixed(1)} / {c.limit} {c.unit}</span>
                <span className={`twin-pill-${c.pass ? 'OK' : 'ACT'}`}>{c.pass ? 'PASS' : 'FAIL'}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="muted" style={{ fontSize: 11, marginBottom: 8 }}>SPREAD GATE</div>
        <div className="row between" style={{ alignItems: "center" }}>
          <span style={{ fontSize: 12 }}>Status</span>
          <span className={`twin-pill-${models.gate.status === 'ISSUED' ? 'OK' : 'ACT'}`}>{models.gate.status}</span>
        </div>
        <div className="row between mt-2" style={{ alignItems: "center" }}>
          <span style={{ fontSize: 12 }}>W90</span>
          <span style={{ fontSize: 12 }}>{models.gate.w90} (Limit: {models.gate.w90_limit})</span>
        </div>
        {models.gate.reason && <div className="muted mt-2" style={{ fontSize: 11 }}>Reason: {models.gate.reason}</div>}
      </div>
    </div>
  );
}
