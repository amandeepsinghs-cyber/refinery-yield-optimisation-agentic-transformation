"use client";

/**
 * L0 "tile flowsheet" — the six live units laid out in process order with loop connectors drawn over the grid
 * (systemic + sectional in one view, verbatim VN-1 "married"):
 *
 *   U1 Furnace ──▶ U2 Riser ◀──▶ U3 Regenerator      (catalyst loop, orange)
 *       ▲ heat        │
 *   U4 Fractionator ◀─┘ ──▶ U5 Gas plant ──▶ U6 Stabiliser   (hydrocarbon, cyan; heat recovery U4 → U1, emerald dashed)
 *
 * Connector geometry is measured from the tiles (ResizeObserver) so it survives any viewport. Flow dashes animate
 * slowly on the hydrocarbon loop — motion carries meaning (material moving), nothing else animates.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { TwinUnit } from "@/lib/twinTypes";
import UnitTile from "./UnitTile";

const ORDER = ["unit_1_furnace", "unit_2_riser", "unit_3_regenerator", "unit_4_fractionator", "unit_5_condenser", "unit_6_stabiliser"];
// grid: row 1 = U1 U2 U3 ; row 2 = U4 U5 U6 — U4 sits under U1 so heat recovery is a straight vertical and the
// hydrocarbon train runs U2 ↓ U4 → U5 → U6 left to right.
const CELL: Record<string, { r: number; c: number }> = {
  unit_1_furnace: { r: 1, c: 1 }, unit_2_riser: { r: 1, c: 2 }, unit_3_regenerator: { r: 1, c: 3 },
  unit_4_fractionator: { r: 2, c: 1 }, unit_5_condenser: { r: 2, c: 2 }, unit_6_stabiliser: { r: 2, c: 3 },
};

interface Box { x: number; y: number; w: number; h: number }
type Edge = { from: string; to: string; kind: "hc" | "cat" | "heat"; bidir?: boolean };
const EDGES: Edge[] = [
  { from: "unit_1_furnace", to: "unit_2_riser", kind: "hc" },
  { from: "unit_2_riser", to: "unit_4_fractionator", kind: "hc" },
  { from: "unit_4_fractionator", to: "unit_5_condenser", kind: "hc" },
  { from: "unit_5_condenser", to: "unit_6_stabiliser", kind: "hc" },
  { from: "unit_2_riser", to: "unit_3_regenerator", kind: "cat", bidir: true },
  { from: "unit_4_fractionator", to: "unit_1_furnace", kind: "heat" },
];
const STROKE: Record<Edge["kind"], string> = { hc: "var(--m-hybrid)", cat: "var(--m-gpr)", heat: "var(--m-pinn)" };

function route(a: Box, b: Box, kind: Edge["kind"]): string {
  const ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 }, bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  const sameRow = Math.abs(ac.y - bc.y) < 10;
  if (kind === "heat") {
    // U4 → U1 share a column: straight up, offset left so it does not collide with the hydrocarbon arrow into U4
    const x = a.x + a.w * 0.22;
    return `M${x},${a.y} V${b.y + b.h}`;
  }
  if (sameRow) {
    const right = bc.x > ac.x;
    const x0 = right ? a.x + a.w : a.x, x1 = right ? b.x : b.x + b.w;
    return `M${x0},${ac.y} H${x1}`;
  }
  if (Math.abs(ac.x - bc.x) < 10) return `M${ac.x},${a.y + a.h} V${b.y}`;
  // L-route through the row gutter (U2 bottom → U4 top): down, across, down
  const y0 = a.y + a.h, ym = y0 + (b.y - y0) / 2;
  return `M${ac.x},${y0} V${ym} H${b.x + b.w * 0.6} V${b.y}`;
}

export default function UnitFlowGrid({ units }: { units: TwinUnit[] }) {
  const byId = Object.fromEntries(units.map((u) => [u.unit_id, u]));
  const wrap = useRef<HTMLDivElement>(null);
  const [boxes, setBoxes] = useState<Record<string, Box>>({});
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  const measure = () => {
    const el = wrap.current;
    if (!el) return;
    const r0 = el.getBoundingClientRect();
    const out: Record<string, Box> = {};
    el.querySelectorAll<HTMLElement>("[data-unit]").forEach((t) => {
      const r = t.getBoundingClientRect();
      out[t.dataset.unit!] = { x: r.left - r0.left, y: r.top - r0.top, w: r.width, h: r.height };
    });
    setBoxes(out);
    setSize({ w: r0.width, h: r0.height });
  };
  useLayoutEffect(measure, [units.length]);
  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="u-flow" ref={wrap} data-testid="unit-flow">
      <svg className="u-flow-links" width={size.w} height={size.h} viewBox={`0 0 ${size.w || 1} ${size.h || 1}`} aria-hidden>
        <defs>
          {(["hc", "cat", "heat"] as const).map((k) => (
            <marker key={k} id={`uf-arr-${k}`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto-start-reverse">
              <path d="M0,0 L8,4 L0,8 z" fill={STROKE[k]} />
            </marker>
          ))}
        </defs>
        {EDGES.map((e) => {
          const a = boxes[e.from], b = boxes[e.to];
          if (!a || !b) return null;
          const d = route(a, b, e.kind);
          return (
            <path key={`${e.from}-${e.to}`} d={d} fill="none" stroke={STROKE[e.kind]} strokeWidth={e.kind === "cat" ? 2.4 : 2}
              strokeDasharray={e.kind === "heat" ? "6 5" : e.kind === "hc" ? "10 6" : undefined}
              className={e.kind === "hc" ? "u-flow-anim" : undefined}
              markerEnd={`url(#uf-arr-${e.kind})`} markerStart={e.bidir ? `url(#uf-arr-${e.kind})` : undefined} opacity={0.9} />
          );
        })}
      </svg>
      {ORDER.map((id) => {
        const u = byId[id];
        const cell = CELL[id];
        return (
          <div key={id} className="u-cell" style={{ gridRow: cell.r, gridColumn: cell.c }}>
            {u ? <UnitTile unit={u} /> : <div className="u-tile muted">{id}: no data</div>}
          </div>
        );
      })}
      <div className="u-flow-legend" aria-hidden>
        <span><i style={{ background: STROKE.hc }} /> hydrocarbon</span>
        <span><i style={{ background: STROKE.cat }} /> catalyst</span>
        <span><i className="dash" style={{ borderColor: STROKE.heat }} /> heat recovery</span>
      </div>
    </div>
  );
}
