"use client";

/**
 * L0 Refinery PFD (SDD-L0-01/02, BUILD_PLAN_v3 §4, design/L0_refinery_twin_mockup.jpg).
 *
 * Hybrid whole-refinery flowsheet (decision D1): the six simulator units are live — U1 Furnace, U2 Riser,
 * U3 Regenerator and U4 Fractionator inside the outlined FCC/RFCC complex, U5 Overhead condenser & WGC as the gas
 * plant and U6 Stabiliser — each showing KPI vs plan, a status pill and decision / agent-flag counts, and opening its
 * workbench on click. Every other block (desalter, CDU, VDU, hydrotreaters, reformer, alkylation, blending, utilities)
 * is "boundary data only": muted, not clickable. No charts anywhere on this screen.
 *
 * Colour is used only for state: status pills / bars, and the three plant loops (hydrocarbon blue, catalyst orange,
 * heat green). Grey is reserved for borders, boundary blocks and the canvas.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { TwinUnit, KpiState } from "@/lib/twinTypes";

export const LOOP_COLOURS = { hydrocarbon: "#1d4ed8", catalyst: "#ea580c", heat: "#047857" } as const;
const STATE_COLOUR: Record<KpiState, string> = { OK: "var(--green)", WATCH: "var(--amber)", ACT: "var(--red)" };
export const STATE_LABEL: Record<KpiState, string> = { OK: "IN ENVELOPE", WATCH: "DRIFT", ACT: "ACT NOW" };
// Short KPI captions for the block (the full tag label lives in the workbench).
const KPI_SHORT: Record<string, string> = { T2_preheat_F: "Preheat outlet T2", conversion_pct: "Riser conversion",
  dT_cyc_reg_F: "Cyclone ΔT (afterburn)", Treg_F: "Regenerator bed T", LCO_T98_F: "LCO T98", HN_T98_F: "HN T98",
  MV_cw_flow: "Cooling-water flow", eff_C5: "C5 recovery" };

interface Block { x: number; y: number; w: number; h: number }
// Live blocks keyed by unit_id — positions follow the mockup (FCC complex centre, gas plant / stabiliser right).
const LIVE: Record<string, Block & { short: string }> = {
  unit_1_furnace: { x: 426, y: 44, w: 190, h: 116, short: "Feed furnace" },
  unit_2_riser: { x: 426, y: 176, w: 190, h: 116, short: "Riser reactor" },
  unit_3_regenerator: { x: 630, y: 176, w: 190, h: 116, short: "Regenerator" },
  unit_4_fractionator: { x: 630, y: 308, w: 190, h: 116, short: "Main fractionator" },
  unit_5_condenser: { x: 850, y: 44, w: 190, h: 116, short: "Gas plant · condenser & WGC" },
  unit_6_stabiliser: { x: 850, y: 308, w: 190, h: 116, short: "Stabiliser" },
};
const COMPLEX: Block = { x: 410, y: 20, w: 426, h: 420 };
// Boundary blocks — architecture-ready, site data required (BUILD_PLAN_v3 §2 ❌ / ⚪).
const BOUNDARY: (Block & { id: string; label: string; note: string })[] = [
  { id: "desalter", label: "Crude desalter", note: "site data required", x: 20, y: 230, w: 110, h: 64 },
  { id: "cdu", label: "CDU", note: "preheat UA proxy → U1", x: 150, y: 150, w: 110, h: 160 },
  { id: "vdu", label: "VDU", note: "VGO feed to riser", x: 280, y: 230, w: 110, h: 160 },
  { id: "nhdt", label: "Naphtha HDT", note: "site data required", x: 1060, y: 44, w: 110, h: 56 },
  { id: "ref", label: "Cat. reformer", note: "RON · no site data", x: 1060, y: 116, w: 110, h: 56 },
  { id: "dhdt", label: "Diesel HDT", note: "LCO to HDT", x: 1060, y: 188, w: 110, h: 56 },
  { id: "alky", label: "Alkylation", note: "C4 from gas plant", x: 1060, y: 260, w: 110, h: 56 },
  { id: "blend", label: "Product blending / tankage", note: "giveaway → LP reconciliation", x: 850, y: 470, w: 320, h: 52 },
  { id: "util", label: "Utilities · boilers · cooling water · flare", note: "steam / power header", x: 20, y: 470, w: 370, h: 52 },
];

function fmt(v: number, unit: string) {
  const d = Math.abs(v) >= 100 ? 1 : 2;
  return `${v.toFixed(d)}${unit ? ` ${unit}` : ""}`;
}

export default function RefineryPFD({ units }: { units: TwinUnit[] }) {
  const router = useRouter();
  const [hover, setHover] = useState<string | null>(null);
  const byId = Object.fromEntries(units.map((u) => [u.unit_id, u]));

  const live = (id: string) => {
    const b = LIVE[id];
    const u = byId[id];
    if (!b || !u) return null;
    const k = u.kpi_vs_plan;
    const state: KpiState = k?.state ?? "OK";
    const col = STATE_COLOUR[state];
    const flags = u.flags ?? 0;
    const dec = u.decisions_open ?? 0;
    const isHover = hover === id;
    return (
      <g
        key={id}
        className="pfd-live"
        data-unit={id}
        data-state={state}
        role="link"
        tabIndex={0}
        aria-label={`${b.short}: ${k ? `${k.label} ${fmt(k.value, k.unit)} vs plan ${fmt(k.plan, k.unit)}` : "no KPI"}, ${STATE_LABEL[state]}, ${dec} decisions, ${flags} agent flags. Open workbench`}
        onClick={() => router.push(`/twin/unit/${id}`)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") router.push(`/twin/unit/${id}`); }}
        onMouseEnter={() => setHover(id)}
        onMouseLeave={() => setHover(null)}
        style={{ cursor: "pointer" }}
      >
        <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={6} fill="var(--card)" stroke={isHover ? "var(--accent)" : "var(--border-strong)"} strokeWidth={isHover ? 1.5 : 1} />
        <rect x={b.x} y={b.y} width={4} height={b.h} rx={2} fill={col} />
        <text x={b.x + 12} y={b.y + 18} className="pfd-title">{b.short}</text>
        {k ? (
          <>
            <text x={b.x + 12} y={b.y + 34} className="pfd-kpi">{KPI_SHORT[k.tag] ?? k.label}</text>
            <text x={b.x + 12} y={b.y + 52} className="pfd-kpi-val">{fmt(k.value, k.unit)}</text>
            <text x={b.x + 12} y={b.y + 67} className="pfd-kpi-plan">vs plan {fmt(k.plan, k.unit)} ({k.plan_source})</text>
          </>
        ) : (
          <text x={b.x + 12} y={b.y + 44} className="pfd-kpi">no expected-value model</text>
        )}
        <text x={b.x + 12} y={b.y + 84} className="pfd-counts">
          {flags} agent flag{flags === 1 ? "" : "s"} · {dec} decision{dec === 1 ? "" : "s"}
        </text>
        <g transform={`translate(${b.x + 12}, ${b.y + b.h - 24})`}>
          <rect width={STATE_LABEL[state].length * 6.4 + 14} height={17} rx={8.5} fill="none" stroke={col} />
          <text x={7} y={12} className="pfd-pill" fill={col}>{STATE_LABEL[state]}</text>
        </g>
        {isHover ? (
          <g transform={`translate(${b.x + b.w / 2 - 56}, ${b.y - 24})`} pointerEvents="none">
            <rect width={112} height={20} rx={4} fill="var(--text)" />
            <text x={56} y={13.5} textAnchor="middle" className="pfd-tip">Open workbench →</text>
          </g>
        ) : null}
      </g>
    );
  };

  return (
    <div className="pfd-wrap">
      <svg viewBox="0 0 1180 540" width="100%" role="img" aria-label="Refinery process flow diagram with six live FCC units" className="pfd-svg">
        <defs>
          {Object.entries(LOOP_COLOURS).map(([k, c]) => (
            <marker key={k} id={`arr-${k}`} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto-start-reverse">
              <path d="M0,0 L7,3.5 L0,7 z" fill={c} />
            </marker>
          ))}
          <marker id="arr-bnd" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto-start-reverse">
            <path d="M0,0 L7,3.5 L0,7 z" fill="var(--subtle)" />
          </marker>
        </defs>

        {/* boundary flows (grey = not instrumented) */}
        <g className="pfd-flow-bnd" fill="none" stroke="var(--subtle)" strokeWidth={1.2} markerEnd="url(#arr-bnd)">
          <path d="M130,262 H150" />
          <path d="M260,310 H280" />
          <path d="M1040,72 H1060" />
          <path d="M945,424 V470" />
          <path d="M205,310 V470" markerEnd="none" />
        </g>

        {/* hydrocarbon loop: VGO → furnace → riser → fractionator → gas plant → stabiliser → alkylation */}
        <g fill="none" stroke={LOOP_COLOURS.hydrocarbon} strokeWidth={1.8} markerEnd="url(#arr-hydrocarbon)">
          <path d="M390,310 H408 V102 H426" />
          <path d="M521,160 V176" />
          <path d="M616,270 H623 V366 H630" />
          <path d="M820,366 H836 V102 H850" />
          <path d="M945,160 V308" />
          <path d="M1040,350 H1050 V288 H1060" />
        </g>
        {/* catalyst loop: riser ⇄ regenerator */}
        <g fill="none" stroke={LOOP_COLOURS.catalyst} strokeWidth={1.8}>
          <path d="M616,220 H630" markerEnd="url(#arr-catalyst)" />
          <path d="M630,248 H616" markerEnd="url(#arr-catalyst)" />
        </g>
        {/* heat loop: pumparound heat recovery → feed preheat */}
        <g fill="none" stroke={LOOP_COLOURS.heat} strokeWidth={1.6} strokeDasharray="5 4" markerEnd="url(#arr-heat)">
          <path d="M725,308 V300 H828 V32 H521 V44" />
        </g>

        {/* FCC / RFCC complex frame */}
        <rect x={COMPLEX.x} y={COMPLEX.y} width={COMPLEX.w} height={COMPLEX.h} rx={10} fill="none" stroke="var(--accent)" strokeOpacity={0.55} strokeWidth={1.2} />
        <text x={COMPLEX.x + 12} y={COMPLEX.y + COMPLEX.h - 8} className="pfd-complex">FCC / RFCC complex · live twin</text>

        {/* boundary blocks */}
        {BOUNDARY.map((b) => (
          <g key={b.id} className="pfd-boundary" aria-label={`${b.label}: boundary data only`}>
            <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={6} fill="var(--canvas)" stroke="var(--border)" />
            <text x={b.x + 10} y={b.y + 17} className="pfd-title muted">{b.label}</text>
            <text x={b.x + 10} y={b.y + 31} className="pfd-note">{b.note}</text>
            <g transform={`translate(${b.x + 10}, ${b.y + b.h - 20})`}>
              <rect width={104} height={15} rx={7.5} fill="var(--elevated)" stroke="var(--border)" />
              <text x={52} y={11} textAnchor="middle" className="pfd-pill muted">boundary data only</text>
            </g>
          </g>
        ))}

        {/* live units */}
        {Object.keys(LIVE).map(live)}

        {/* legend */}
        <g transform="translate(410, 456)" className="pfd-legend">
          {(["hydrocarbon", "catalyst", "heat"] as const).map((k, i) => (
            <g key={k} transform={`translate(${i * 120}, 0)`}>
              <line x1={0} y1={6} x2={22} y2={6} stroke={LOOP_COLOURS[k]} strokeWidth={2} strokeDasharray={k === "heat" ? "5 4" : undefined} />
              <text x={28} y={10} className="pfd-note">{k} loop</text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}
