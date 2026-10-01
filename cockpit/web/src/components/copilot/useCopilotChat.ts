"use client";

import { usePathname } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { parseData, streamSSE } from "@/lib/sse";
import { useCockpit, type ChatMessage } from "@/lib/store";
import type { Citation } from "@/lib/types";

export const uid = () => Math.random().toString(36).slice(2, 10);

export function usePageContext() {
  const pathname = usePathname() ?? "/";
  const runId = useCockpit((s) => s.runId);
  const property = useCockpit((s) => s.property);
  const timeMin = useCockpit((s) => s.timeMin);
  
  let screen: { level: 'L0' | 'L1' | 'other', unit_id?: string, window_min: 720 } = { level: 'other', window_min: 720 };
  if (pathname === '/twin') {
    screen.level = 'L0';
  } else if (pathname.startsWith('/twin/unit/')) {
    screen.level = 'L1';
    screen.unit_id = pathname.split('/twin/unit/')[1];
  }

  return { page: pathname, run_id: runId, property, time_min: timeMin, screen };
}

/** Streams POST /api/copilot/chat (SDD-COP-03) into the shared session. */
export function useCopilotChat() {
  const ctx = usePageContext();
  const setMessages = useCockpit((s) => s.setMessages);
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const patch = useCallback(
    (id: string, fn: (m: ChatMessage) => ChatMessage) =>
      setMessages((ms) => ms.map((m) => (m.id === id ? fn(m) : m))),
    [setMessages],
  );

  const send = useCallback(
    async (prompt: string) => {
      const text = prompt.trim();
      if (!text || busy) return;
      const history = useCockpit.getState().messages.filter((m) => !m.error && m.content);
      const userMsg: ChatMessage = { id: uid(), role: "user", content: text };
      const aId = uid();
      setMessages((ms) => [
        ...ms,
        userMsg,
        { id: aId, role: "assistant", content: "", status: "Thinking…", streaming: true, citations: [], charts: [], tools: [] },
      ]);
      setBusy(true);
      const ac = new AbortController();
      abortRef.current = ac;
      try {
        await streamSSE(
          "/api/copilot/chat",
          {
            messages: [...history, userMsg].map((m) => ({ role: m.role, content: m.content })),
            context: ctx,
          },
          (ev) => {
            const d = parseData<Record<string, unknown>>(ev) ?? {};
            switch (ev.event) {
              case "thought":
                patch(aId, (m) => ({ ...m, status: String(d.text ?? "Thinking…") }));
                break;
              case "tool_call":
                patch(aId, (m) => ({
                  ...m,
                  status: `Calling ${String(d.name)}…`,
                  tools: [...(m.tools ?? []), String(d.name)],
                }));
                break;
              case "final":
                patch(aId, (m) => ({ ...m, content: m.content + String(d.delta ?? ""), status: m.status }));
                break;
              case "citation":
                patch(aId, (m) => {
                  const c = d as unknown as Citation;
                  const exists = (m.citations ?? []).some((x) => x.doc_id === c.doc_id && x.section === c.section);
                  return exists ? m : { ...m, citations: [...(m.citations ?? []), c] };
                });
                break;
              case "chart":
                patch(aId, (m) => ({ ...m, charts: [...(m.charts ?? []), d.figure] }));
                break;
              case "suggestion":
                patch(aId, (m) => ({ ...m, suggestions: (d.items as string[]) ?? [] }));
                break;
              case "error":
                patch(aId, (m) => ({ ...m, error: String(d.message ?? "Copilot error") }));
                break;
              case "done":
                patch(aId, (m) => ({ ...m, streaming: false, status: null }));
                break;
              default:
                break;
            }
          },
          ac.signal,
        );
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          patch(aId, (m) => ({
            ...m,
            error:
              (e as Error).message === "Failed to fetch"
                ? "The cockpit API is not reachable. Start cockpit/api on port 8010 and retry."
                : (e as Error).message,
          }));
        }
      } finally {
        patch(aId, (m) => ({ ...m, streaming: false, status: null }));
        setBusy(false);
        abortRef.current = null;
      }
    },
    [busy, ctx, patch, setMessages],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  return { send, stop, busy };
}
