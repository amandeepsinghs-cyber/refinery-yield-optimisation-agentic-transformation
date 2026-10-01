"use client";

/** L0 header strip: title · shift · clock, language switch (EN / Hinglish / हिंदी) and the Gemini Live entry. */

import { useCockpit } from "@/lib/store";
import { IconMic } from "@/components/ui/icons";
import type { TwinPlantStrip } from "@/lib/twinTypes";
import LangToggle from "@/components/twin/LangToggle";

export default function L0Header({ plant }: { plant: TwinPlantStrip }) {
  const setCopilotOpen = useCockpit((s) => s.setCopilotOpen);
  const setCopilotTab = useCockpit((s) => s.setCopilotTab);
  return (
    <div className="l0-header" data-testid="l0-header">
      <h1 className="l0-title">
        Refinery Digital Twin <span className="l0-title-sep">·</span> {plant.shift_label} <span className="l0-title-sep">·</span>{" "}
        <span className="mono">{plant.clock}</span>
      </h1>
      <div className="l0-header-actions">
        <LangToggle />
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
