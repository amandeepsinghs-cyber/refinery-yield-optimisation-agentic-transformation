"use client";

import { useCockpit } from "@/lib/store";

export default function TimelineStrip({ timeline, timeMin }: { timeline: any[], timeMin: number | null }) {
  const setTimeMin = useCockpit((s) => s.setTimeMin);
  
  // Example range for the shift, say 0 to 1440
  const MIN_T = 0;
  const MAX_T = 1440;
  
  const width = 800;
  const height = 40;
  
  const x = (t: number) => ((t - MIN_T) / (MAX_T - MIN_T)) * width;

  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <rect x="0" y={height/2 - 2} width={width} height="4" fill="var(--border)" rx="2" />
        
        {/* Ticks */}
        {timeline.map((t, i) => {
          const px = x(t.time_min);
          const color = t.kind === 'regime_change' ? 'var(--accent)' : 
                        t.kind === 'lab' ? '#047857' : 
                        t.kind === 'breach' ? '#dc2626' : 'var(--muted)';
          return (
            <g key={i} transform={`translate(${px}, 0)`} style={{ cursor: "pointer" }} onClick={() => setTimeMin(t.time_min)}>
              <rect x="-2" y="10" width="4" height="20" fill={color} />
              <title>{t.time_min}m: {t.label}</title>
            </g>
          );
        })}
        
        {/* Cursor */}
        {timeMin != null && (
          <g transform={`translate(${x(timeMin)}, 0)`}>
            <polygon points="-5,0 5,0 0,8" fill="var(--accent)" />
            <line x1="0" y1="8" x2="0" y2="40" stroke="var(--accent)" strokeWidth="1" />
          </g>
        )}
        
        {/* Clickable overlay to jump anywhere */}
        <rect 
          x="0" y="0" width={width} height={height} fill="transparent" 
          style={{ cursor: "pointer" }}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const t = Math.round((clickX / width) * (MAX_T - MIN_T) + MIN_T);
            setTimeMin(t);
          }}
        />
      </svg>
      <div className="row between muted mt-1" style={{ fontSize: 10, width: `${width}px` }}>
        <span>Shift start</span>
        <span>Shift end</span>
      </div>
    </div>
  );
}
