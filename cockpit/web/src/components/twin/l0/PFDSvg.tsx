"use client";

import { useRouter } from "next/navigation";
import { TwinUnit } from "@/lib/twinTypes";

export default function PFDSvg({ units }: { units: TwinUnit[] }) {
  const router = useRouter();
  
  // Arrange units based on mockups
  const findUnit = (seq: number) => units.find(u => u.seq === seq);
  
  // Hardcoded layout for the 6 standard units
  // sequence assumed: 1: Furnace, 2: Riser, 3: Regenerator, 4: Fractionator, 5: Condenser, 6: Stabiliser
  const blocks = [
    { seq: 1, x: 20, y: 150, w: 120, h: 100 },
    { seq: 2, x: 200, y: 150, w: 100, h: 140 },
    { seq: 3, x: 200, y: 20, w: 100, h: 100 },
    { seq: 4, x: 420, y: 50, w: 140, h: 300 },
    { seq: 5, x: 680, y: 50, w: 120, h: 100 },
    { seq: 6, x: 880, y: 150, w: 120, h: 200 },
  ];

  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <svg width="1200" height="420" viewBox="0 0 1200 420" style={{ background: "var(--canvas)", borderRadius: 8 }}>
        <defs>
          <marker id="arrow-hc" markerWidth="6" markerHeight="6" refX="6" refY="3" orient="auto-start-reverse">
            <path d="M 0 0 L 6 3 L 0 6 z" fill="#0284c7" />
          </marker>
          <marker id="arrow-cat" markerWidth="6" markerHeight="6" refX="6" refY="3" orient="auto-start-reverse">
            <path d="M 0 0 L 6 3 L 0 6 z" fill="#ca8a04" />
          </marker>
          <marker id="arrow-heat" markerWidth="6" markerHeight="6" refX="6" refY="3" orient="auto-start-reverse">
            <path d="M 0 0 L 6 3 L 0 6 z" fill="#dc2626" />
          </marker>
        </defs>

        {/* Hydrocarbon loop lines */}
        <g stroke="#0284c7" strokeWidth="2" fill="none" markerEnd="url(#arrow-hc)">
          <path d="M 140 200 L 200 200" /> {/* Furnace to Riser */}
          <path d="M 300 220 L 420 220" /> {/* Riser to Fractionator */}
          <path d="M 490 50 L 490 20 L 680 20 L 680 50" /> {/* Frac to Condenser */}
          <path d="M 800 100 L 840 100 L 840 200 L 880 200" /> {/* Condenser to Stabiliser */}
          
          {/* Fractionator Products */}
          <path d="M 560 150 L 620 150" /> <text x="625" y="154" fill="var(--text)" fontSize="12" stroke="none">HN</text>
          <path d="M 560 220 L 620 220" /> <text x="625" y="224" fill="var(--text)" fontSize="12" stroke="none">LCO</text>
          <path d="M 560 300 L 620 300" /> <text x="625" y="304" fill="var(--text)" fontSize="12" stroke="none">Slurry</text>

          {/* Stabiliser Products */}
          <path d="M 1000 200 L 1060 200" /> <text x="1065" y="204" fill="var(--text)" fontSize="12" stroke="none">LPG</text>
          <path d="M 1000 280 L 1060 280" /> <text x="1065" y="284" fill="var(--text)" fontSize="12" stroke="none">LN</text>
        </g>

        {/* Catalyst loop lines */}
        <g stroke="#ca8a04" strokeWidth="2" strokeDasharray="4,4" fill="none" markerEnd="url(#arrow-cat)">
          <path d="M 220 120 L 220 150" /> {/* Regen to Riser */}
          <path d="M 280 150 L 280 120" /> {/* Riser to Regen */}
        </g>
        <text x="210" y="135" fill="var(--muted)" fontSize="10" transform="rotate(-90 210,135)">Regen</text>
        <text x="290" y="135" fill="var(--muted)" fontSize="10" transform="rotate(-90 290,135)">Spent</text>

        {/* Heat loop lines */}
        <g stroke="#dc2626" strokeWidth="2" strokeDasharray="2,2" fill="none" markerEnd="url(#arrow-heat)">
          <path d="M 420 260 L 380 260 L 380 380 L 80 380 L 80 230 L 120 230" /> {/* Pumparound to Furnace */}
        </g>
        <text x="200" y="375" fill="var(--muted)" fontSize="10">Pumparound heat integration</text>

        {/* Unit Blocks */}
        {blocks.map(b => {
          const u = findUnit(b.seq);
          if (!u) return null;
          
          return (
            <g 
              key={u.unit_id} 
              transform={`translate(${b.x}, ${b.y})`}
              style={{ cursor: "pointer" }}
              onClick={() => router.push(`/twin/unit/${u.unit_id}`)}
              className="pfd-block"
            >
              <rect width={b.w} height={b.h} fill="var(--card)" stroke="var(--borderStrong)" strokeWidth="1" rx="4" />
              
              <text x="8" y="20" fill="var(--text)" fontSize="12" fontWeight="600">{u.short_name}</text>
              
              <rect x={b.w - 45} y="8" width="37" height="16" rx="8" fill="transparent" stroke={u.status === 'OK' ? '#16a34a' : u.status === 'WATCH' ? '#d97706' : '#dc2626'} />
              <text x={b.w - 26} y="19" fill={u.status === 'OK' ? '#16a34a' : u.status === 'WATCH' ? '#d97706' : '#dc2626'} fontSize="9" fontWeight="500" textAnchor="middle">{u.status}</text>
              
              {u.kpi_vs_plan && (
                <>
                  <text x="8" y="45" fill="var(--text)" fontSize="14" fontWeight="500">{u.kpi_vs_plan.value}</text>
                  <text x={8 + u.kpi_vs_plan.value.toString().length * 8} y="45" fill="var(--muted)" fontSize="10">{u.kpi_vs_plan.unit}</text>
                  <text x="8" y="60" fill="var(--muted)" fontSize="9">Plan: {u.kpi_vs_plan.plan} ± {u.kpi_vs_plan.tol}</text>
                </>
              )}

              <g transform={`translate(8, ${b.h - 20})`}>
                <text x="0" y="10" fill="var(--muted)" fontSize="9">
                  {u.decisions_open ? `${u.decisions_open} dec` : ''} {u.events_open ? `${u.events_open} ev` : ''} 
                </text>
              </g>
            </g>
          );
        })}
      </svg>
      <style>{`
        .pfd-block:hover rect {
          stroke: var(--accent);
        }
      `}</style>
    </div>
  );
}
