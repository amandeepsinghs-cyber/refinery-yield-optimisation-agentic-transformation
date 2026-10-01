"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Citation, PropertyId } from "./types";
import { THEME_STORAGE_KEY, type ThemeName } from "./theme";

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
  setCopilotOpen: (o: boolean) => void;
  setCopilotTab: (t: "text" | "voice") => void;
  setMessages: (fn: (m: ChatMessage[]) => ChatMessage[]) => void;
  pendingPrompt: string | null;
  sourcePreview: Citation | null;
  openSource: (c: Citation) => void;
  closeSource: () => void;
  askCopilot: (prompt: string) => void;
  clearPending: () => void;
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
      theme: "light",
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
      setCopilotOpen: (copilotOpen) => set({ copilotOpen }),
      setCopilotTab: (copilotTab) => set({ copilotTab }),
      setMessages: (fn) => set({ messages: fn(get().messages) }),
      askCopilot: (prompt) => set({ pendingPrompt: prompt, copilotOpen: true, copilotTab: "text" }),
      clearPending: () => set({ pendingPrompt: null }),
    }),
    {
      name: "fcc-cockpit-context",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (s) => ({ runId: s.runId, property: s.property, timeMin: s.timeMin }),
      skipHydration: true,
    },
  ),
);
