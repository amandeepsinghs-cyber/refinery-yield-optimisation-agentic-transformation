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
    bg: "#09090b",
    canvas: "#09090b",
    card: "#0c0c0f",
    elevated: "#131318",
    border: "#1e1e24",
    borderStrong: "#2a2a32",
    text: "#fafafa",
    muted: "#a1a1aa",
    subtle: "#71717a",
    accent: "#3b82f6",
    accentFg: "#ffffff",
    hover: "#16161b",
    grid: "rgba(250,250,250,0.08)",
    zeroline: "rgba(250,250,250,0.22)",
    band95: "rgba(59,130,246,0.15)",
    band50: "rgba(59,130,246,0.30)",
    withheldFill: "rgba(148,163,184,0.06)",
    eventFill: "rgba(161,161,170,0.12)",
  },
};

export const STATUS = {
  GREEN: "#16a34a",
  AMBER: "#d97706",
  RED: "#dc2626",
} as const;

export const MODEL_COLORS: Record<string, string> = {
  hybrid_delta_v1: "#2563eb",
  pinn_ens_v1: "#0d9488",
  gpr_v1: "#ea580c",
  bayes_ridge_v1: "#64748b",
};

export const DARK_MODEL_COLORS: Record<string, string> = {
  hybrid_delta_v1: "#60a5fa",
  pinn_ens_v1: "#2dd4bf",
  gpr_v1: "#fb923c",
  bayes_ridge_v1: "#c084fc",
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
      ? (DARK_MODEL_COLORS[id] ?? MODEL_COLORS[id] ?? TOKENS[theme].muted)
      : (MODEL_COLORS[id] ?? TOKENS[theme].muted);

export const modelLabel = (id: string): string => MODEL_LABELS[id] ?? id;

/** Maps a camelCase token key to its CSS custom property name. */
export const cssVarName = (key: string): string =>
  `--${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;

export const FONT_SANS = "var(--font-sans), 'DM Sans', system-ui, sans-serif";
export const FONT_MONO = "var(--font-mono), 'JetBrains Mono', ui-monospace, monospace";

export const THEME_STORAGE_KEY = "fcc-theme";

/**
 * Inline, render-blocking script: sets data-theme before first paint.
 * Stored choice wins; otherwise light. The user decided that every
 * screen is light by default, so prefers-color-scheme is intentionally not used.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t!=='light'&&t!=='dark'){t='light';}document.documentElement.setAttribute('data-theme',t);document.documentElement.style.colorScheme=t;}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;
