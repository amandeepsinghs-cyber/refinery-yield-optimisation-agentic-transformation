/**
 * Design tokens (SDD-UI-02) — the single source for both CSS custom properties
 * (mirrored in globals.css, verified by tests) and Plotly chart theming.
 */

export type ThemeName = "dark" | "light";

export interface ThemeTokens {
  bg: string;
  canvas: string;
  card: string;
  elevated: string;
  border: string;
  borderStrong: string;
  text: string;
  muted: string;
  subtle: string;
  accent: string;
  accentFg: string;
  hover: string;
  grid: string;
  zeroline: string;
  band95: string;
  band50: string;
  withheldFill: string;
  eventFill: string;
}

export const TOKENS: Record<ThemeName, ThemeTokens> = {
  light: {
    bg: "#ffffff",
    canvas: "#f6f6f7",
    card: "#ffffff",
    elevated: "#ffffff",
    border: "#e4e4e7",
    borderStrong: "#d4d4d8",
    text: "#09090b",
    muted: "#71717a",
    subtle: "#a1a1aa",
    accent: "#2563eb",
    accentFg: "#ffffff",
    hover: "#f4f4f5",
    grid: "rgba(9,9,11,0.08)",
    zeroline: "rgba(9,9,11,0.22)",
    band95: "rgba(37,99,235,0.15)",
    band50: "rgba(37,99,235,0.30)",
    withheldFill: "rgba(100,116,139,0.06)",
    eventFill: "rgba(113,113,122,0.14)",
  },
  dark: {
    bg: "#0b0f17",
    canvas: "#0b0f17",
    card: "#111622",
    elevated: "#161c2a",
    border: "#1f2738",
    borderStrong: "#2c3650",
    text: "#e8ecf4",
    muted: "#9aa6bd",
    subtle: "#687491",
    accent: "#4f8cff",
    accentFg: "#ffffff",
    hover: "#182032",
    grid: "rgba(232,236,244,0.07)",
    zeroline: "rgba(232,236,244,0.22)",
    band95: "rgba(79,140,255,0.16)",
    band50: "rgba(79,140,255,0.32)",
    withheldFill: "rgba(148,163,184,0.06)",
    eventFill: "rgba(154,166,189,0.12)",
  },
};

export const STATUS = {
  GREEN: "#16a34a",
  AMBER: "#d97706",
  RED: "#dc2626",
} as const;

/** Brighter state colours for the dark register (same hue family, higher luminance). */
export const STATUS_DARK = {
  GREEN: "#22c55e",
  AMBER: "#f59e0b",
  RED: "#f43f5e",
} as const;

export const statusColor = (k: keyof typeof STATUS, theme: ThemeName): string =>
  theme === "dark" ? STATUS_DARK[k] : STATUS[k];

/** Committee member colours — never grey (verbatim VN-1/VN-5). Light: saturated; dark: high-chroma. */
export const MODEL_COLORS: Record<string, string> = {
  hybrid_delta_v1: "#2563eb",
  pinn_ens_v1: "#0d9488",
  gpr_v1: "#ea580c",
  bayes_ridge_v1: "#7c3aed",
};

export const DARK_MODEL_COLORS: Record<string, string> = {
  hybrid_delta_v1: "#22d3ee",
  pinn_ens_v1: "#34d399",
  gpr_v1: "#fbbf24",
  bayes_ridge_v1: "#a78bfa",
};

export const MODEL_LABELS: Record<string, string> = {
  hybrid_delta_v1: "Hybrid delta",
  pinn_ens_v1: "PINN ensemble",
  gpr_v1: "GPR",
  bayes_ridge_v1: "Bayesian ridge",
  mixture: "Mixture",
};

/** Display order: strongest-weighted families first, matching the mockups. */
export const MODEL_ORDER = ["hybrid_delta_v1", "pinn_ens_v1", "gpr_v1", "bayes_ridge_v1"];

export const modelColor = (id: string, theme: ThemeName): string =>
  id === "mixture"
    ? TOKENS[theme].text
    : theme === "dark"
      ? (DARK_MODEL_COLORS[id] ?? MODEL_COLORS[id] ?? TOKENS[theme].accent)
      : (MODEL_COLORS[id] ?? TOKENS[theme].accent);

export const modelLabel = (id: string): string => MODEL_LABELS[id] ?? id;

/** Maps a camelCase token key to its CSS custom property name. */
export const cssVarName = (key: string): string =>
  `--${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;

export const FONT_SANS = "var(--font-sans), 'DM Sans', system-ui, sans-serif";
export const FONT_MONO = "var(--font-mono), 'JetBrains Mono', ui-monospace, monospace";

export const THEME_STORAGE_KEY = "fcc-theme";

/** Default register. verbatim.md VN-5: "let's make the standard to be black" — dark is the default, light is the toggle. */
export const DEFAULT_THEME: ThemeName = "dark";

/**
 * Inline, render-blocking script: sets data-theme before first paint.
 * Stored choice wins; otherwise dark (control-room default). prefers-color-scheme is intentionally not used.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t!=='light'&&t!=='dark'){t='${DEFAULT_THEME}';}document.documentElement.setAttribute('data-theme',t);document.documentElement.style.colorScheme=t;}catch(e){document.documentElement.setAttribute('data-theme','${DEFAULT_THEME}');}})();`;

