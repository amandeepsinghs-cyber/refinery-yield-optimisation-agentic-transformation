"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Citation, PropertyId } from "./types";
import { DEFAULT_THEME, THEME_STORAGE_KEY, type ThemeName } from "./theme";

/** Operator language for briefings and Copilot (SDD-GEM-03): English, Hinglish control-room phrasing, or Hindi. */
export type Lang = "en" | "hinglish" | "hi";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  status?: string | null;
  tools?: string[];
  citations?: Citation[];
  charts?: unknown[];
  suggestions?: string[];
  error?: string | null;
  streaming?: boolean;
  voice?: boolean;
  final?: boolean;
}

interface CockpitState {
  runId: string | null;
  property: PropertyId;
  timeMin: number | null;
  theme: ThemeName;
  lang: Lang;
  copilotOpen: boolean;
  copilotTab: "text" | "voice";
  copilotExpanded: boolean;
  voiceActive: boolean;
  messages: ChatMessage[];
  setRun: (runId: string | null, nMinutes?: number) => void;
  setProperty: (p: PropertyId) => void;
  setTimeMin: (t: number | null) => void;
  setTheme: (t: ThemeName) => void;
  toggleTheme: () => void;
  setLang: (l: Lang) => void;
  setCopilotOpen: (o: boolean) => void;
  setCopilotTab: (t: "text" | "voice") => void;
  setMessages: (fn: (m: ChatMessage[]) => ChatMessage[]) => void;
  pendingPrompt: string | null;
  sourcePreview: Citation | null;
  openSource: (c: Citation) => void;
  closeSource: () => void;
  askCopilot: (prompt: string) => void;
  clearPending: () => void;
  /** Chart panels currently on screen (L1) and the one highlighted by `?uc=` / `?tag=` — forwarded to Gemini as page context. */
  screenPanels: { panel_ids: string[]; highlighted: string | null };
  setScreenPanels: (panel_ids: string[], highlighted?: string | null) => void;
  /**
   * Screen digest (SDD-GEM-04): every rendered tile / panel / card registers a compact, structured description of
   * exactly what it shows (values, plan, Δ, μ/σ, decision text, legends). Forwarded verbatim to Gemini so
   * "explain what is on the screen" is answered from what the operator actually sees, not a server summary.
   */
  screenDigest: Record<string, unknown>;
  setScreenPart: (id: string, payload: unknown | null) => void;
  /** L0 hover / pinned unit (VN-6 progressive disclosure): the unit whose detail pane is open. */
  hoverUnit: string | null;
  pinnedUnit: string | null;
  setHoverUnit: (u: string | null) => void;
  setPinnedUnit: (u: string | null) => void;
}

function applyTheme(t: ThemeName) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", t);
  document.documentElement.style.colorScheme = t;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, t);
  } catch {
    /* storage unavailable */
  }
}

export const useCockpit = create<CockpitState>()(
  persist(
    (set, get) => ({
      runId: null,
      property: "LCO_T98_F",
      timeMin: null,
      theme: DEFAULT_THEME,
      lang: "en",
      copilotOpen: false,
      copilotTab: "text",
      copilotExpanded: false,
      voiceActive: false,
      messages: [],
      pendingPrompt: null,
      sourcePreview: null,
      openSource: (c) => set({ sourcePreview: c, copilotOpen: true }),
      closeSource: () => set({ sourcePreview: null }),
      setRun: (runId, nMinutes) =>
        set({ runId, timeMin: nMinutes !== undefined ? nMinutes : get().timeMin }),
      setProperty: (property) => set({ property }),
      setTimeMin: (timeMin) => set({ timeMin }),
      setTheme: (theme) => {
        applyTheme(theme);
        set({ theme });
      },
      toggleTheme: () => get().setTheme(get().theme === "dark" ? "light" : "dark"),
      setLang: (lang) => set({ lang }),
      setCopilotOpen: (copilotOpen) => set({ copilotOpen }),
      setCopilotTab: (copilotTab) => set({ copilotTab }),
      setMessages: (fn) => set({ messages: fn(get().messages) }),
      askCopilot: (prompt) => set({ pendingPrompt: prompt, copilotOpen: true, copilotTab: "text" }),
      clearPending: () => set({ pendingPrompt: null }),
      screenPanels: { panel_ids: [], highlighted: null },
      setScreenPanels: (panel_ids, highlighted = null) => {
        const cur = get().screenPanels;
        if (cur.highlighted === highlighted && cur.panel_ids.length === panel_ids.length && cur.panel_ids.every((p, i) => p === panel_ids[i])) return;
        set({ screenPanels: { panel_ids, highlighted } });
      },
      screenDigest: {},
      setScreenPart: (id, payload) => {
        const cur = get().screenDigest;
        if (payload == null) {
          if (!(id in cur)) return;
          const next = { ...cur };
          delete next[id];
          set({ screenDigest: next });
          return;
        }
        try {
          if (id in cur && JSON.stringify(cur[id]) === JSON.stringify(payload)) return;
        } catch {
          /* non-serialisable payload: always update */
        }
        set({ screenDigest: { ...cur, [id]: payload } });
      },
      hoverUnit: null,
      pinnedUnit: null,
      setHoverUnit: (hoverUnit) => { if (get().hoverUnit !== hoverUnit) set({ hoverUnit }); },
      setPinnedUnit: (pinnedUnit) => set({ pinnedUnit }),
    }),
    {
      name: "fcc-cockpit-context",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (s) => ({ runId: s.runId, property: s.property, timeMin: s.timeMin, lang: s.lang }),
      skipHydration: true,
    },
  ),
);
