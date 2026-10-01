"use client";

/** Rail card 5 — Ask Gemini about this unit (SDD-L1-03 / SDD-GEM): text → copilot (screen-scoped via usePageContext), mic → voice tab. */

import { useState } from "react";
import { useCockpit } from "@/lib/store";
import { IconMic, IconSend } from "@/components/ui/icons";

const SUGGEST: Record<"en" | "hinglish" | "hi", string[]> = {
  en: ["Why is the residual drifting?", "What happens downstream if I accept?", "Summarise this unit for the shift handover"],
  hinglish: ["Residual kyun drift kar raha hai?", "Accept karne se downstream kya hoga?", "Shift handover ke liye is unit ka summary do"],
  hi: ["अवशेष क्यों बह रहा है?", "स्वीकार करने पर डाउनस्ट्रीम क्या होगा?", "शिफ्ट हैंडओवर के लिए इस यूनिट का सारांश दें"],
};

export default function AskGeminiCard({ liveTags, docChips, unitLabel }: { liveTags: number; docChips: string[]; unitLabel: string }) {
  const askCopilot = useCockpit((s) => s.askCopilot);
  const setCopilotOpen = useCockpit((s) => s.setCopilotOpen);
  const setCopilotTab = useCockpit((s) => s.setCopilotTab);
  const lang = useCockpit((s) => s.lang);
  const [q, setQ] = useState("");

  const send = (text: string) => {
    const t = text.trim();
    if (!t) return;
    askCopilot(t);
    setQ("");
  };

  return (
    <section className="l1-card l1-gemini" data-testid="rail-gemini">
      <form className="l1-ask" onSubmit={(e) => { e.preventDefault(); send(q); }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Ask Gemini about ${unitLabel}`} aria-label="Ask Gemini about this unit" lang={lang === "hi" ? "hi" : undefined} />
        <button type="submit" className="btn icon" aria-label="Send to Gemini" disabled={!q.trim()}><IconSend /></button>
        <button type="button" className="btn icon" aria-label="Gemini Live voice" onClick={() => { setCopilotTab("voice"); setCopilotOpen(true); }}><IconMic /></button>
      </form>
      <div className="l1-suggest">
        {SUGGEST[lang].map((s) => <button key={s} type="button" className="l1-chip" onClick={() => send(s)} lang={lang === "hi" ? "hi" : undefined}>{s}</button>)}
      </div>
      <div className="l1-doc-chips">
        <span className="l1-chip neutral">Live tags ({liveTags})</span>
        {docChips.map((d) => <span key={d} className="l1-chip neutral mono">{d}</span>)}
      </div>
    </section>
  );
}
