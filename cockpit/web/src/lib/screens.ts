/**
 * Gemini's open_screen tool (12 Oct 2026): the browser navigates when Gemini calls it, in text chat and in voice.
 * Mirrors SCREEN_PATHS in cockpit/api/app/copilot/tools.py. A UI action only; nothing reaches the plant.
 */
export const SCREEN_PATHS: Record<string, string> = {
  whole_unit: "/twin",
  furnace: "/twin/unit/unit_1_furnace",
  riser: "/twin/unit/unit_2_riser",
  regenerator: "/twin/unit/unit_3_regenerator",
  fractionator: "/twin/unit/unit_4_fractionator",
  gas_plant: "/twin/unit/unit_5_condenser",
  stabiliser: "/twin/unit/unit_6_stabiliser",
  architecture: "/architecture",
  data_in: "/architecture?view=data",
  decision_record: "/audit",
  explainer: "/explainer",
};

const UNIT_SCREEN: Record<string, string> = {
  unit_1_furnace: "furnace", unit_2_riser: "riser", unit_3_regenerator: "regenerator",
  unit_4_fractionator: "fractionator", unit_5_condenser: "gas_plant", unit_6_stabiliser: "stabiliser",
};

/** The path for an open_screen tool call, or null if it is not one / the screen is unknown. */
export function screenPathFor(name: unknown, args: unknown): string | null {
  // A refinery-status question always lands on the Whole unit view (pins on every section), even if Gemini skips open_screen.
  if (name === "get_refinery_status") return SCREEN_PATHS.whole_unit;
  if (name !== "open_screen" || !args || typeof args !== "object") return null;
  const raw = String((args as Record<string, unknown>).screen ?? "").trim().toLowerCase().replace(/[ -]/g, "_");
  return SCREEN_PATHS[UNIT_SCREEN[raw] ?? raw] ?? null;
}
