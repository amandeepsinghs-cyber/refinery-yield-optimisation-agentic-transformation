/**
 * Plain-language guide to the six sections of the FCC complex (the only plant simulated in this build).
 * Single source for "what does this unit do" text on L0 (plant canvas + unit guide) and L1 (unit header).
 * Levers mirror STORY.md §1.2.
 */

export const SCOPE_NOTE =
  "Simulated scope: the FCC complex, 6 sections. Other refinery units (CDU, VDU, hydrotreaters, reformer, alkylation) are not simulated.";

export interface UnitInfo {
  name: string;
  /** One line: what this section does in the FCC. */
  role: string;
  /** What operators move on this section in the cockpit; null when it is watched only. */
  levers: string | null;
}

export const UNIT_INFO: Record<string, UnitInfo> = {
  unit_1_furnace: {
    name: "Feed furnace",
    role: "Preheats the heavy gas oil feed before it meets hot catalyst.",
    levers: "Feed preheat temperature",
  },
  unit_2_riser: {
    name: "Riser reactor",
    role: "Feed and hot catalyst mix here and crack into lighter products in a few seconds.",
    levers: "Riser outlet temperature (severity)",
  },
  unit_3_regenerator: {
    name: "Regenerator",
    role: "Burns coke off the spent catalyst; this reheats it, and that heat drives the cracking in the riser.",
    levers: "Regenerator air",
  },
  unit_4_fractionator: {
    name: "Main fractionator",
    role: "Separates the cracked vapour by boiling range: slurry, diesel (LCO) and heavy naphtha; gases and light naphtha go overhead.",
    levers: "LCO and heavy-naphtha cut points",
  },
  unit_5_condenser: {
    name: "Gas plant",
    role: "Cools and condenses the fractionator overhead; the wet-gas compressor then recovers the light gases.",
    levers: "Overhead temperature target",
  },
  unit_6_stabiliser: {
    name: "Stabiliser",
    role: "Splits LPG from light naphtha (gasoline).",
    levers: "Overhead temperature target (shared with the gas plant)",
  },
};

export const UNIT_ORDER = Object.keys(UNIT_INFO);
