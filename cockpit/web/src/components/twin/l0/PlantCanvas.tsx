"use client";

/**
 * Top view of the refinery (owner brief, 2 Oct): the FCC train as one luminous line-art flowsheet across the screen.
 * Normal units recede (dim strokes); a drifting unit glows amber, an acting unit red; a unit carrying an open decision
 * gets a soft blue halo. Decision pins sit on their unit, so "what went wrong" and "what to decide" are read in place,
 * and the pipes show how a move travels to the next unit. Click a unit for its data; click a pin to open the decision.
 */

import type { Decision } from "@/lib/decisionsApi";
import type { TwinUnit } from "@/lib/twinTypes";

const VB_W = 1400, VB_H = 330, BASE = 250;
export const UNIT_X: Record<string, number> = {
  unit_1_furnace: 120, unit_2_riser: 340, unit_3_regenerator: 545, unit_4_fractionator: 800, unit_5_condenser: 1040, unit_6_stabiliser: 1270,
};
const NAME: Record<string, string> = {
  unit_1_furnace: "Feed furnace", unit_2_riser: "Riser reactor", unit_3_regenerator: "Regenerator",
  unit_4_fractionator: "Main fractionator", unit_5_condenser: "Gas plant", unit_6_stabiliser: "Stabiliser",
};
const KPI: Record<string, string> = {
  T2_preheat_F: "preheat", conversion_pct: "conversion", dT_cyc_reg_F: "afterburn ΔT", Treg_F: "bed T",
  LCO_T98_F: "LCO T98", HN_T98_F: "HN T98", MV_cw_flow: "CW flow", eff_C5: "C5 recovery",
};

type State = "OK" | "WATCH" | "ACT";
const st = (u?: TwinUnit): State => (u?.kpi_vs_plan?.state ?? u?.headline_kpi?.state ?? "OK") as State;

function Glyph({ id }: { id: string }) {
  switch (id) {
    case "unit_1_furnace": // firebox with stack and radiant coil
      return (<g>
        <path d="M-58 0 V-78 H58 V0 Z" /><path d="M-20 -78 V-118 H20 V-78" /><path d="M-8 -118 V-132 M8 -118 V-132" opacity=".5" />
        <path d="M-40 -18 h80 M-40 -18 c-14 0 -14 -16 0 -16 h80 c14 0 14 -16 0 -16 h-80" className="pc-fine" />
      </g>);
    case "unit_2_riser": // riser pipe up into the disengager
      return (<g>
        <path d="M-9 0 V-150" /><path d="M9 0 V-150" /><path d="M-30 -150 V-196 Q-30 -214 0 -214 Q30 -214 30 -196 V-150 Z" />
        <path d="M-30 -150 L-9 -128 M30 -150 L9 -128" className="pc-fine" />
      </g>);
    case "unit_3_regenerator": // fluid-bed vessel with cyclone
      return (<g>
        <path d="M-50 0 V-120 Q-50 -160 0 -160 Q50 -160 50 -120 V0 Z" /><path d="M-50 -50 H50" className="pc-fine" />
        <path d="M14 -140 V-100 L22 -88 L30 -100 V-140 Z" className="pc-fine" />
      </g>);
    case "unit_4_fractionator": // tall column with trays and side draws
      return (<g>
        <path d="M-26 0 V-210 Q-26 -232 0 -232 Q26 -232 26 -210 V0 Z" />
        {Array.from({ length: 9 }, (_, i) => <path key={i} d={`M${i % 2 ? -26 : -6} ${-24 - i * 21} h32`} className="pc-fine" />)}
        <path d="M26 -150 h22 M26 -95 h22" className="pc-fine" />
      </g>);
    case "unit_5_condenser": // overhead exchanger + reflux drum + compressor
      return (<g>
        <circle cx="-34" cy="-112" r="18" /><path d="M-48 -112 h28" className="pc-fine" />
        <rect x="-10" y="-82" width="70" height="30" rx="15" /><circle cx="-26" cy="-26" r="22" /><path d="M-26 -48 V-4 M-48 -26 H-4" className="pc-fine" />
      </g>);
    default: // stabiliser column
      return (<g>
        <path d="M-20 0 V-150 Q-20 -168 0 -168 Q20 -168 20 -150 V0 Z" />
        {Array.from({ length: 6 }, (_, i) => <path key={i} d={`M${i % 2 ? -20 : -4} ${-22 - i * 22} h24`} className="pc-fine" />)}
      </g>);
  }
}

export default function PlantCanvas({ units, decisions, selectedId, onSelect, selectedUnit, onSelectUnit }: {
  units: TwinUnit[]; decisions: Decision[]; selectedId: string | null; onSelect: (id: string) => void;
  selectedUnit: string | null; onSelectUnit: (unitId: string) => void;
}) {
  const byId = Object.fromEntries(units.map((u) => [u.unit_id, u]));
  const openUnits = new Set(decisions.filter((d) => d.status === "open").map((d) => d.unit_id));
  const x = UNIT_X;
  const pins: Record<string, Decision[]> = {};
  for (const d of decisions) (pins[d.unit_id] ??= []).push(d);

  return (
    <div className="pc" data-testid="plant-canvas">
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="pc-svg" role="img" aria-label="Top view of the FCC refinery train">
        <defs>
          <filter id="pc-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          <marker id="pc-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L10 5 L0 10 z" className="pc-arrowhead" /></marker>
        </defs>
        {/* process pipes — hydrocarbon (feed → furnace → riser → column → gas plant → stabiliser) and catalyst loop */}
        <g className="pc-pipes">
          <path d={`M10 ${BASE - 30} H${x.unit_1_furnace - 58}`} markerEnd="url(#pc-arrow)" />
          <path d={`M${x.unit_1_furnace + 58} ${BASE - 30} H${x.unit_2_riser - 9}`} markerEnd="url(#pc-arrow)" />
          <path d={`M${x.unit_2_riser + 30} ${BASE - 196} H${x.unit_4_fractionator - 60} V${BASE - 40} H${x.unit_4_fractionator - 26}`} markerEnd="url(#pc-arrow)" />
          <path d={`M${x.unit_4_fractionator} ${BASE - 232} V${BASE - 262} H${x.unit_5_condenser - 34} V${BASE - 130}`} markerEnd="url(#pc-arrow)" />
          <path d={`M${x.unit_5_condenser + 60} ${BASE - 67} H${x.unit_6_stabiliser - 20}`} markerEnd="url(#pc-arrow)" />
          <path d={`M${x.unit_6_stabiliser + 20} ${BASE - 140} H${VB_W - 20}`} markerEnd="url(#pc-arrow)" />
          <path d={`M${x.unit_6_stabiliser + 20} ${BASE - 30} H${VB_W - 20}`} markerEnd="url(#pc-arrow)" />
          <path d={`M${x.unit_4_fractionator + 48} ${BASE - 150} H${x.unit_4_fractionator + 110}`} markerEnd="url(#pc-arrow)" />
          <path d={`M${x.unit_4_fractionator + 48} ${BASE - 95} H${x.unit_4_fractionator + 110}`} markerEnd="url(#pc-arrow)" />
        </g>
        <g className="pc-pipes pc-cat">
          <path d={`M${x.unit_2_riser + 30} ${BASE - 170} C${x.unit_2_riser + 100} ${BASE - 170} ${x.unit_3_regenerator - 80} ${BASE - 140} ${x.unit_3_regenerator - 50} ${BASE - 120}`} markerEnd="url(#pc-arrow)" />
          <path d={`M${x.unit_3_regenerator - 50} ${BASE - 20} C${x.unit_3_regenerator - 110} ${BASE} ${x.unit_2_riser + 60} ${BASE} ${x.unit_2_riser + 9} ${BASE - 10}`} markerEnd="url(#pc-arrow)" />
        </g>
        <text x={x.unit_4_fractionator + 114} y={BASE - 146} className="pc-stream">HN</text>
        <text x={x.unit_4_fractionator + 114} y={BASE - 91} className="pc-stream">LCO</text>
        <text x={VB_W - 20} y={BASE - 148} className="pc-stream" textAnchor="end">LPG</text>
        <text x={VB_W - 20} y={BASE - 38} className="pc-stream" textAnchor="end">Light naphtha</text>
        <text x={(x.unit_2_riser + x.unit_3_regenerator) / 2} y={BASE + 6} className="pc-stream" textAnchor="middle">catalyst loop</text>

        {Object.keys(x).map((id) => {
          const u = byId[id];
          const s = st(u);
          const k = u?.kpi_vs_plan;
          const hasDecision = openUnits.has(id);
          const isSel = selectedUnit === id;
          return (
            <g key={id} transform={`translate(${x[id]} ${BASE})`} className={`pc-unit s-${s} ${hasDecision ? "has-dec" : ""} ${isSel ? "sel" : ""}`}
              onClick={() => onSelectUnit(id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelectUnit(id); }} role="button" tabIndex={0}
              aria-label={`${NAME[id]}: ${s === "OK" ? "in envelope" : s === "WATCH" ? "drifting" : "act now"}`} data-unit={id}>
              {s !== "OK" || hasDecision ? <g className="pc-halo" filter="url(#pc-glow)"><Glyph id={id} /></g> : null}
              <g className="pc-body"><Glyph id={id} /></g>
              <text y={34} className="pc-name" textAnchor="middle">{NAME[id]}</text>
              {k ? (
                <text y={54} className="pc-kpi" textAnchor="middle">
                  {KPI[k.tag] ?? k.label} {k.value.toFixed(Math.abs(k.value) >= 100 ? 1 : 2)}
                  <tspan className={`pc-dev s-${s}`}> {k.deviation >= 0 ? "+" : "−"}{Math.abs(k.deviation).toFixed(1)}</tspan>
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      {/* decision pins, anchored over their unit */}
      {Object.entries(pins).map(([uid, ds]) => (
        <div key={uid} className="pc-pins" style={{ left: `${(x[uid] / VB_W) * 100}%` }}>
          {ds.map((d) => (
            <button key={d.id} type="button" className={`pc-pin p-${d.status} ${d.id === selectedId ? "sel" : ""}`} onClick={() => onSelect(d.id)}
              title={d.question} data-testid="plant-pin" data-status={d.status}>
              {d.status === "open" ? <><b className="num">{d.urgency.rank}</b> Decide</> : d.status === "withheld" ? "Not yet" : d.status === "watch" ? "Watch" : d.status}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
