/**
 * Trace palette — contract §8 "never grey". Two registers: `TRACE_PALETTE` (light canvas, saturated/dark inks) and
 * `TRACE_PALETTE_DARK` (obsidian canvas, high-chroma inks: cyan measured, emerald expected/band, gold plan, rose spec).
 */
export interface TracePalette {
  measured: string;
  expected: string;
  band: string;
  plan: string;
  spec: string;
  residual: { base: string; sigma3: string; cusum: string };
  mvs: string[];
  disturbances: string[];
  yields: Record<string, string>;
}

export const TRACE_PALETTE: TracePalette = {
  measured: "#1d4ed8",
  expected: "#047857",
  band: "#047857",
  plan: "#6d28d9",
  spec: "#b91c1c",
  residual: {
    base: "#0e7490",
    sigma3: "#be185d",
    cusum: "#c2410c",
  },
  mvs: ["#ea580c", "#0f766e", "#7c2d12", "#4338ca"],
  disturbances: ["#be185d", "#9333ea", "#0369a1"],
  yields: {
    LCO: "#1d4ed8",
    HN: "#047857",
    LN: "#ca8a04",
    LPG: "#9333ea",
    slurry: "#7c2d12",
  }
};

export const TRACE_PALETTE_DARK: TracePalette = {
  measured: "#22d3ee",
  expected: "#34d399",
  band: "#34d399",
  plan: "#fbbf24",
  spec: "#fb7185",
  residual: {
    base: "#38bdf8",
    sigma3: "#f472b6",
    cusum: "#fb923c",
  },
  mvs: ["#fb923c", "#2dd4bf", "#f472b6", "#818cf8"],
  disturbances: ["#f472b6", "#c084fc", "#38bdf8"],
  yields: {
    LCO: "#22d3ee",
    HN: "#34d399",
    LN: "#fde047",
    LPG: "#c084fc",
    slurry: "#fb923c",
  }
};

export const paletteFor = (theme: "light" | "dark" | undefined): TracePalette =>
  theme === "dark" ? TRACE_PALETTE_DARK : TRACE_PALETTE;


/**
 * Ensures no colour is grey by checking if r=g=b or if saturation is very low.
 * Hex strings must be 6 characters.
 */
export function isGrey(hex: string): boolean {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return false;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  
  if (r === g && g === b) return true;
  
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let s = 0;
  if (max !== min) {
    s = l > 127.5 ? (max - min) / (510 - max - min) : (max - min) / (max + min);
  }
  
  return s < 0.05; // Saturation < 5% is effectively grey
}

export function getRoleColor(role: string, index = 0): string {
  switch (role) {
    case "measured": return TRACE_PALETTE.measured;
    case "expected":
    case "band_lo":
    case "band_hi": return TRACE_PALETTE.expected;
    case "plan": return TRACE_PALETTE.plan;
    case "spec": return TRACE_PALETTE.spec;
    case "residual": return TRACE_PALETTE.residual.base;
    case "sigma3": return TRACE_PALETTE.residual.sigma3;
    case "cusum": return TRACE_PALETTE.residual.cusum;
    case "mv": return TRACE_PALETTE.mvs[index % TRACE_PALETTE.mvs.length];
    case "disturbance": return TRACE_PALETTE.disturbances[index % TRACE_PALETTE.disturbances.length];
    default: return TRACE_PALETTE.measured;
  }
}
