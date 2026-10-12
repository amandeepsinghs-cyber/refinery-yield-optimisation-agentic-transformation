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

/**
 * Deterministic screen intent (12 Oct 2026): the browser moves to the screen the operator asks about as soon as the
 * message is sent (typed) or the spoken sentence is complete (voice), in English, Hinglish or Hindi. Gemini's own
 * open_screen call remains a second path. Most specific first: a unit beats a general "status" question.
 */
const INTENTS: [string, RegExp][] = [
  ["data_in", /(how (does |do )?(the )?data (come|comes|get|gets) in|data comes in|cortex|data engine|manufacturing connect|डेटा कैसे|data kaise)/i],
  ["architecture", /(architecture|आर्किटेक्चर|platform (and|&) agents)/i],
  ["decision_record", /(decision record|audit|record of (decisions|actions)|निर्णय (का )?रिकॉर्ड|रिकॉर्ड)/i],
  ["explainer", /(explainer|guide(s)?\b|how to read|गाइड)/i],
  ["overview", /(overview page|front page|home page|ओवरव्यू)/i],
  ["furnace", /(furnace|preheat|heater|फर्नेस|भट्ठी|भट्टी|प्रीहीट)/i],
  ["riser", /(riser|riser outlet|\brot\b|conversion|राइज़र|राइजर|रायज़र)/i],
  ["regenerator", /(regenerator|regen\b|afterburn|regenerator air|रीजनरेटर|रीजेनरेटर|रिजनरेटर|आफ्टरबर्न)/i],
  ["fractionator", /(fractionator|main column|cut ?point|\blco\b|heavy naphtha|\bhn\b|t98|lab sample|फ्रैक्शनेटर|फ्रेक्शनेटर|कट पॉइंट|कट प्वाइंट)/i],
  ["gas_plant", /(gas plant|condenser|cooling water|overhead temperature|गैस प्लांट|कंडेंसर)/i],
  ["stabiliser", /(stabili[sz]er|\bc5\b|\blpg\b|स्टेबलाइज़र|स्टेबलाइजर)/i],
  ["whole_unit", /(status|needs? (my )?attention|anything (that )?needs|what('?s| is) (going on|happening)|whole unit|fcc complex|overview of the fcc|स्थिति|ध्यान|क्या हो रहा|haal|dhyaan|kya chal raha)/i],
];

/** The path for what the operator asked, or null if the message is not about a particular screen (e.g. a greeting). */
export function intentPathFor(text: string): string | null {
  const t = (text || "").trim();
  if (!t) return null;
  for (const [screen, re] of INTENTS) {
    if (re.test(t)) return screen === "overview" ? "/platform" : SCREEN_PATHS[screen];
  }
  return null;
}
