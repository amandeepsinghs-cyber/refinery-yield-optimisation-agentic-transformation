"use client";

import { create } from "zustand";

export interface Toast {
  id: number;
  text: string;
  tone: "ok" | "info" | "error";
}

interface ToastState {
  toasts: Toast[];
  push: (text: string, tone?: Toast["tone"], ms?: number) => void;
  dismiss: (id: number) => void;
}

let seq = 0;

/** Minimal global toast queue, rendered by <Toaster /> in the app shell. */
export const useToasts = create<ToastState>()((set, get) => ({
  toasts: [],
  push: (text, tone = "ok", ms = 4500) => {
    const id = ++seq;
    set({ toasts: [...get().toasts, { id, text, tone }].slice(-3) });
    if (ms > 0) setTimeout(() => get().dismiss(id), ms);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export const toast = (text: string, tone?: Toast["tone"], ms?: number) => useToasts.getState().push(text, tone, ms);
