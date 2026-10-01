"use client";

/** L0 header strip: title · shift · clock, language switch (EN / Hinglish / हिंदी) and the Gemini Live entry. */

import { useCockpit, type Lang } from "@/lib/store";
import { IconMic } from "@/components/ui/icons";
import type { TwinPlantStrip } from "@/lib/twinTypes";

const LANGS: { id: Lang; label: string; title: string }[] = [
  { id: "en", label: "EN", title: "English" },
  { id: "hinglish", label: "Hinglish", title: "Hinglish (control-room phrasing)" },
  { id: "hi", label: "हिंदी", title: "Hindi" },
];

export default function L0Header({ plant }: { plant: TwinPlantStrip }) {
  const lang = useCockpit((s) => s.lang);
  const setLang = useCockpit((s) => s.setLang);
  const setCopilotOpen = useCockpit((s) => s.setCopilotOpen);
  const setCopilotTab = useCockpit((s) => s.setCopilotTab);
  return (
    <div className="l0-header" data-testid="l0-header">
      <h1 className="l0-title">
        Refinery Digital Twin <span className="l0-title-sep">·</span> {plant.shift_label} <span className="l0-title-sep">·</span>{" "}
        <span className="mono">{plant.clock}</span>
      </h1>
      <div className="l0-header-actions">
        <div className="seg" role="group" aria-label="Briefing language" data-testid="lang-toggle">
          {LANGS.map((l) => (
            <button key={l.id} type="button" title={l.title} aria-pressed={lang === l.id} onClick={() => setLang(l.id)} lang={l.id === "hi" ? "hi" : undefined}>
              {l.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn l0-live"
          onClick={() => { setCopilotTab("voice"); setCopilotOpen(true); }}
          aria-label="Open Gemini Live voice briefing"
        >
          <IconMic /> Gemini Live
        </button>
      </div>
    </div>
  );
}
