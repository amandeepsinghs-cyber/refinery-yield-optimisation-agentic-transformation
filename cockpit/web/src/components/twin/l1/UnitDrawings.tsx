"use client";

/**
 * Process drawings for the unit page, step ① (owner, 2 Oct 2026: "click it and get more details on the specific
 * process"). One calm line drawing per unit with the live value printed where it is measured, and the lever(s) marked
 * in the accent colour. Tags are the simulator's (sim_octave); values come from the unit workbench series at the cursor.
 * The fractionator drawing lives in UnitStory (FracDrawing); these cover the other five units.
 */

import { SUSPECT } from "@/lib/suspect";

type At = (k: string) => number | null;
const fx = (v: number | null | undefined, d?: number) => (v == null || !Number.isFinite(v) ? "—" : v.toFixed(d ?? (Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2)));

function Defs() {
  return <defs><marker id="ud-ar" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L10 5 L0 10 z" className="us-arh" /></marker></defs>;
}
/** A label: grey name + mono value (+ unit). */
function L({ x, y, k, v, u, end, lever, small, tag }: { x: number; y: number; k: string; v?: string; u?: string; end?: boolean; lever?: boolean; small?: boolean; tag?: string }) {
  const why = tag ? SUSPECT[tag] : undefined;
  return (
    <text x={x} y={y} textAnchor={end ? "end" : "start"} className={`us-v${lever ? " lever" : ""}${small ? " small" : ""}`}>
      <tspan className="us-k">{k}{v != null ? " " : ""}</tspan>
      {why ? <tspan className="us-suspect">{v}{u ? ` ${u}` : ""} · under review<title>{why}</title></tspan> : <>{v}{u ? ` ${u}` : ""}</>}
    </text>
  );
}
const Line = ({ d, prod, hot, cat }: { d: string; prod?: boolean; hot?: boolean; cat?: boolean }) =>
  <path d={d} className={`us-line${prod ? " prod" : ""}${hot ? " hot" : ""}${cat ? " cat" : ""}`} markerEnd="url(#ud-ar)" />;

/* 1 · Feed preheat furnace ----------------------------------------------------------------------------------------- */
function Furnace({ at }: { at: At }) {
  return (
    <svg viewBox="0 0 640 450" className="us-draw" role="img" aria-label="Feed preheat furnace with live values">
      <Defs />
      {/* stack + firebox */}
      <path d="M300 60 h40 v70 h-40 z" className="us-vessel" />
      <path d="M220 130 h200 v190 h-200 z" className="us-vessel" />
      {/* tube coil */}
      <path d="M150 200 H250 C270 200 270 230 250 230 H390 C410 230 410 260 390 260 H250 C230 260 230 290 250 290 H490" className="us-line prod" fill="none" markerEnd="url(#ud-ar)" />
      {/* burners */}
      {[260, 320, 380].map((x) => <path key={x} d={`M${x} 335 l-8 -12 l8 -16 l8 16 z`} className="us-flame" />)}
      <Line d="M150 370 H320 V340" />
      <L x={40} y={152} k="Gas-oil feed" />
      <L x={40} y={170} k="" v={`${fx(at("feed_flow_lb_s"))} lb/s · ${fx(at("dist_T_feed_in_F"))} °F`} />
      <L x={40} y={188} k="API" v={fx(at("dist_feed_API"), 1)} />
      <L x={496} y={286} k="Hot feed → riser" />
      <L x={496} y={304} k="Preheat outlet" v={fx(at("T2_preheat_F"), 1)} u="°F" />
      <L x={496} y={322} k="" v={`lever: set point ${fx(at("SP_T_preheat_F"), 1)} °F`} lever />
      <L x={40} y={366} k="Fuel gas" v={fx(at("F5_fuel"))} tag="F5_fuel" />
      <L x={40} y={384} k="Fuel valve V1" v={fx(at("V1"), 1)} u="%" />
      <Line d="M320 60 V36 H460" />
      <L x={466} y={32} k="Flue gas" />
      <L x={466} y={50} k="O₂" v={fx(at("fluegas_O2_pct"), 2)} u="%" small tag="fluegas_O2_pct" />
      <L x={466} y={66} k="CO" v={fx(at("fluegas_CO_ppm"))} u="ppm" small tag="fluegas_CO_ppm" />
      <text x={320} y={160} textAnchor="middle" className="us-k us-v small">firebox · radiant coil</text>
    </svg>
  );
}

/* 2 · Riser reactor ------------------------------------------------------------------------------------------------ */
function Riser({ at }: { at: At }) {
  return (
    <svg viewBox="0 0 640 450" className="us-draw" role="img" aria-label="Riser reactor with live values">
      <Defs />
      {/* reactor / disengager */}
      <path d="M250 60 Q250 40 290 40 h60 Q390 40 390 60 v70 l-40 30 h-60 l-40 -30 z" className="us-vessel" />
      {/* riser pipe */}
      <path d="M305 160 h18 v230 h-18 z" className="us-vessel" />
      <text x={314} y={290} textAnchor="middle" className="us-k us-v small" transform="rotate(-90 314 290)">riser · 2–3 s contact</text>
      {/* stripper / standpipe to regenerator */}
      <path d="M360 160 V330 H470" className="us-line cat" markerEnd="url(#ud-ar)" />
      <L x={476} y={326} k="Spent catalyst → regenerator" />
      {/* feed & regenerated catalyst into riser bottom */}
      <Line d="M90 380 H300" prod />
      <L x={90} y={372} k="Hot feed" v={`${fx(at("feed_flow_lb_s"))} lb/s · API ${fx(at("dist_feed_API"), 1)}`} />
      <path d="M560 410 H330" className="us-line cat" markerEnd="url(#ud-ar)" />
      <L x={560} y={402} k="Regenerated catalyst" v={fx(at("F_regen_cat"))} end tag="F_regen_cat" />
      {/* vapour out */}
      <Line d="M320 40 V22 H560" prod />
      <L x={566} y={18} k="Cracked vapour → fractionator" end />
      <L x={400} y={70} k="Conversion" v={fx(at("conversion_pct"), 1)} u="%" tag="conversion_pct" />
      <L x={400} y={90} k="" v={`lever: riser outlet T set point ${fx(at("SP_T_riser_ROT_F"), 0)} °F`} lever />
      <L x={400} y={110} k="Reactor–fractionator ΔP" v={fx(at("dP_reactor_frac"), 1)} tag="dP_reactor_frac" />
      <text x={320} y={92} textAnchor="middle" className="us-k us-v small">cyclones</text>
    </svg>
  );
}

/* 3 · Regenerator -------------------------------------------------------------------------------------------------- */
function Regenerator({ at }: { at: At }) {
  return (
    <svg viewBox="0 0 640 450" className="us-draw" role="img" aria-label="Catalyst regenerator with live values">
      <Defs />
      <path d="M230 90 Q230 60 270 60 h100 Q410 60 410 90 v240 Q410 350 390 350 h-140 Q230 350 230 330 z" className="us-vessel" />
      <path d="M230 250 h180" className="us-tray" />
      <text x={320} y={300} textAnchor="middle" className="us-k us-v small">dense bed</text>
      {/* cyclone */}
      <path d="M340 80 h24 v60 l-12 18 l-12 -18 z" className="us-vessel" />
      <Line d="M352 60 V30 H560" />
      <L x={566} y={26} k="Flue gas" end />
      <L x={420} y={110} k="Cyclone ΔT (afterburn)" v={fx(at("dT_cyc_reg_F"), 1)} u="°F" />
      <L x={420} y={130} k="" v={`lever: bed T set point ${fx(at("SP_T_reg_F"), 0)} °F`} lever />
      <L x={420} y={150} k="Coke burn" v={fx(at("F_coke"))} tag="F_coke" />
      {/* spent cat in */}
      <path d="M80 200 H226" className="us-line cat" markerEnd="url(#ud-ar)" />
      <L x={80} y={192} k="Spent catalyst from riser" />
      {/* air in */}
      <Line d="M120 400 H320 V354" />
      <L x={40} y={392} k="Combustion air" v={fx(at("Fair"), 2)} u="lb/s" lever />
      <L x={40} y={412} k="Valves V6 / V7" v={`${fx(at("V6"), 0)} / ${fx(at("V7"), 0)}`} u="%" small />
      <L x={40} y={430} k="Air blower power" v={fx(at("power_CAB"))} small tag="power_CAB" />
      {/* regen cat out */}
      <path d="M380 350 V400 H560" className="us-line cat" markerEnd="url(#ud-ar)" />
      <L x={566} y={392} k="Regenerated catalyst → riser" end />
      <L x={566} y={412} k="Carbon left on catalyst" v={fx(at("C_regen_cat") != null ? (at("C_regen_cat") as number) * 100 : null, 2)} u="wt %" end small />
    </svg>
  );
}

/* 5 · Gas plant (overhead condenser, drum, wet-gas compressor) ----------------------------------------------------- */
function GasPlant({ at }: { at: At }) {
  return (
    <svg viewBox="0 0 640 450" className="us-draw" role="img" aria-label="Gas plant: condenser, drum and wet-gas compressor with live values">
      <Defs />
      {/* condenser */}
      <circle cx={210} cy={150} r={46} className="us-vessel" />
      <path d="M175 150 h70 M190 130 l40 40 M190 170 l40 -40" className="us-tray" />
      <Line d="M40 150 H160" prod />
      <L x={40} y={172} k="Overhead vapour" />
      <L x={40} y={188} k="from fractionator" />
      <L x={150} y={92} k="Cooling water (fixed duty)" v={fx(at("MV_cw_flow"))} u="lb/s" />
      <L x={150} y={74} k="Ambient" v={fx(at("dist_T_ambient_F"), 0)} u="°F" small />
      {/* drum */}
      <path d="M300 230 h140 a30 30 0 0 1 0 60 h-140 a30 30 0 0 1 0 -60 z" className="us-vessel" />
      <path d="M256 150 H370 V226" className="us-line prod" fill="none" markerEnd="url(#ud-ar)" />
      <text x={370} y={265} textAnchor="middle" className="us-k us-v small">reflux drum</text>
      {/* wet gas to compressor */}
      <circle cx={540} cy={150} r={30} className="us-vessel" />
      <path d="M520 130 L560 140 L560 160 L520 170 z" className="us-tray" fill="none" />
      <path d="M440 240 V150 H506" className="us-line" fill="none" markerEnd="url(#ud-ar)" />
      <L x={540} y={204} k="Wet-gas compressor" end={false} />
      <L x={540} y={222} k="Power" v={fx(at("power_WGC"))} tag="power_WGC" />
      {/* reflux back */}
      <path d="M300 290 V350 H80" className="us-line" fill="none" markerEnd="url(#ud-ar)" />
      <L x={80} y={370} k="Reflux → fractionator" />
      <L x={80} y={390} k="Reflux ratio" v={fx(at("MV_reflux_ratio"), 2)} lever />
      {/* naphtha to stabiliser */}
      <path d="M420 290 V350 H600" className="us-line prod" fill="none" markerEnd="url(#ud-ar)" />
      <L x={600} y={370} k="Unstabilised naphtha → stabiliser" end />
      <L x={600} y={390} k="" v={`lever: overhead T set point ${fx(at("SP_T_overhead"), 1)} °F`} lever end />
    </svg>
  );
}

/* 6 · Stabiliser --------------------------------------------------------------------------------------------------- */
function Stabiliser({ at }: { at: At }) {
  const x0 = 280, w = 56, top = 60, bot = 380;
  return (
    <svg viewBox="0 0 640 450" className="us-draw" role="img" aria-label="Stabiliser column with live values">
      <Defs />
      <path d={`M${x0} ${top + 18} Q${x0} ${top} ${x0 + w / 2} ${top} Q${x0 + w} ${top} ${x0 + w} ${top + 18} V${bot - 18} Q${x0 + w} ${bot} ${x0 + w / 2} ${bot} Q${x0} ${bot} ${x0} ${bot - 18} Z`} className="us-vessel" />
      {Array.from({ length: 14 }, (_, i) => <path key={i} d={`M${i % 2 ? x0 + 12 : x0} ${top + 30 + i * 21} h${w - 12}`} className="us-tray" />)}
      <Line d="M60 220 H276" prod />
      <L x={60} y={210} k="Unstabilised naphtha" />
      <L x={60} y={240} k="Feed" v={`${fx(at("feed_flow_lb_s"))} lb/s · API ${fx(at("dist_feed_API"), 1)}`} small />
      {/* top: LPG */}
      <Line d={`M${x0 + w / 2} ${top} V36 H580`} prod />
      <L x={586} y={30} k="LPG" v={fx(at("prod_LPG"))} u="lb/min" end />
      <L x={586} y={58} k="C3 recovery" v={fx(at("eff_C3"), 1)} u="%" end small tag="eff_C3" />
      <L x={586} y={76} k="C4 recovery" v={fx(at("eff_C4"), 1)} u="%" end small tag="eff_C4" />
      <L x={586} y={100} k="" v={`lever: overhead T set point ${fx(at("SP_T_overhead"), 1)} °F`} lever end />
      <L x={586} y={118} k="" v={`lever: reflux ratio ${fx(at("MV_reflux_ratio"), 2)}`} lever end />
      {/* bottom: light naphtha */}
      <Line d={`M${x0 + w / 2} ${bot} V410 H580`} prod />
      <L x={586} y={404} k="Stabilised light naphtha" v={fx(at("prod_LN"))} u="lb/min" end />
      <L x={586} y={430} k="C5 recovery" v={fx(at("eff_C5"), 1)} u="%" end small tag="eff_C5" />
    </svg>
  );
}

export const HAS_DRAWING = new Set(["unit_1_furnace", "unit_2_riser", "unit_3_regenerator", "unit_5_condenser", "unit_6_stabiliser"]);

export default function UnitDrawing({ unitId, at }: { unitId: string; at: At }) {
  switch (unitId) {
    case "unit_1_furnace": return <Furnace at={at} />;
    case "unit_2_riser": return <Riser at={at} />;
    case "unit_3_regenerator": return <Regenerator at={at} />;
    case "unit_5_condenser": return <GasPlant at={at} />;
    case "unit_6_stabiliser": return <Stabiliser at={at} />;
    default: return null;
  }
}
