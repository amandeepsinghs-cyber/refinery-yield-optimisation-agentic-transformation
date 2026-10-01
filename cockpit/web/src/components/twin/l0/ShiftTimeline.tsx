"use client";

/**
 * Shift timeline (SDD-L0-01): a 12-hour strip ending at the store's timeMin with hour ticks, event ticks coloured by
 * severity, a draggable cursor (scrubs the whole twin) and ▶ replay that advances the clock one simulated minute per
 * tick. Pure SVG — no chart library (SDD-L0-02).
 */

import { useEffect, useRef, useState } from "react";
import { useCockpit } from "@/lib/store";
import { clock } from "@/lib/format";
import { IconPause, IconPlay } from "@/components/ui/icons";
import type { TwinTimelineItem } from "@/lib/twinTypes";

const WINDOW_MIN = 720;
const SEV_COLOUR = { alarm: "var(--red)", warn: "var(--amber)", info: "var(--accent)" } as const;
const W = 1180, H = 64, PAD = 24, Y = 36;

export default function ShiftTimeline({ timeline, timeMin, maxMin }: { timeline: TwinTimelineItem[]; timeMin: number; maxMin?: number | null }) {
  const setTimeMin = useCockpit((s) => s.setTimeMin);
  const [playing, setPlaying] = useState(false);
  const [hover, setHover] = useState<TwinTimelineItem | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);

  const end = Math.max(timeMin, WINDOW_MIN);
  const start = end - WINDOW_MIN;
  const xOf = (t: number) => PAD + ((t - start) / WINDOW_MIN) * (W - 2 * PAD);
  const tOf = (x: number) => Math.round(start + ((x - PAD) / (W - 2 * PAD)) * WINDOW_MIN);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      const t = useCockpit.getState().timeMin ?? timeMin;
      const next = t + 1;
      if (maxMin && next > maxMin) { setPlaying(false); return; }
      setTimeMin(next);
    }, 400);
    return () => clearInterval(id);
  }, [playing, maxMin, setTimeMin, timeMin]);

  const scrub = (clientX: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * W;
    const t = Math.max(1, Math.min(maxMin ?? Infinity, tOf(Math.max(PAD, Math.min(W - PAD, x)))));
    setTimeMin(t);
  };

  const hours: number[] = [];
  for (let t = Math.ceil(start / 60) * 60; t <= end; t += 60) hours.push(t);
  const visible = timeline.filter((e) => e.time_min >= start && e.time_min <= end);

  return (
    <div className="l0-timeline" data-testid="shift-timeline">
      <button type="button" className="btn l0-play" onClick={() => setPlaying((p) => !p)} aria-pressed={playing} aria-label={playing ? "Pause replay" : "Play replay"}>
        {playing ? <IconPause /> : <IconPlay />}
      </button>
      <div className="l0-timeline-svg">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height={H}
          role="slider"
          aria-label="Shift timeline — drag to scrub the twin"
          aria-valuemin={start}
          aria-valuemax={end}
          aria-valuenow={timeMin}
          aria-valuetext={clock(timeMin)}
          tabIndex={0}
          onPointerDown={(e) => { dragging.current = true; (e.target as Element).setPointerCapture?.(e.pointerId); scrub(e.clientX); }}
          onPointerMove={(e) => { if (dragging.current) scrub(e.clientX); }}
          onPointerUp={() => { dragging.current = false; }}
          onPointerCancel={() => { dragging.current = false; }}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") setTimeMin(Math.max(1, timeMin - (e.shiftKey ? 60 : 5)));
            if (e.key === "ArrowRight") setTimeMin(Math.min(maxMin ?? Infinity, timeMin + (e.shiftKey ? 60 : 5)));
          }}
        >
          <line x1={PAD} y1={Y} x2={W - PAD} y2={Y} stroke="var(--border-strong)" strokeWidth={1.5} />
          {hours.map((t) => (
            <g key={t}>
              <line x1={xOf(t)} y1={Y - 6} x2={xOf(t)} y2={Y + 6} stroke="var(--border-strong)" />
              <text x={xOf(t)} y={Y + 20} textAnchor="middle" className="l0-tl-label">{clock(t)}</text>
            </g>
          ))}
          {visible.map((e) => (
            <line
              key={e.event_id}
              x1={xOf(e.time_min)} y1={Y - 12} x2={xOf(e.time_min)} y2={Y + 2}
              stroke={SEV_COLOUR[e.severity] ?? "var(--accent)"}
              strokeWidth={e.severity === "alarm" ? 3 : 2}
              onMouseEnter={() => setHover(e)}
              onMouseLeave={() => setHover(null)}
              style={{ cursor: "help" }}
            >
              <title>{`${e.time_label} · ${e.label}`}</title>
            </line>
          ))}
          <g transform={`translate(${xOf(timeMin)}, 0)`} className="l0-cursor">
            <path d={`M-6,${Y - 20} L6,${Y - 20} L0,${Y - 10} z`} fill="var(--text)" />
            <line x1={0} y1={Y - 10} x2={0} y2={Y + 8} stroke="var(--text)" strokeWidth={1.5} />
          </g>
        </svg>
        <div className="l0-tl-foot">
          <span className="mono">{clock(timeMin)}</span>
          <span className="muted">
            {hover ? ` · ${hover.time_label} ${hover.label}` : ` · ${visible.length} event${visible.length === 1 ? "" : "s"} in the last 12 h — drag to scrub, ▶ to replay`}
          </span>
        </div>
      </div>
    </div>
  );
}
