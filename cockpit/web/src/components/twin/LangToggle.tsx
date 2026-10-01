"use client";

/** EN / Hinglish / हिंदी segmented control bound to the shared store `lang` (SDD-GEM-03). Used on L0 and L1. */

import { useCockpit, type Lang } from "@/lib/store";

export const LANGS: { id: Lang; label: string; title: string }[] = [
  { id: "en", label: "EN", title: "English" },
  { id: "hinglish", label: "Hinglish", title: "Hinglish (control-room phrasing)" },
  { id: "hi", label: "हिंदी", title: "Hindi" },
];

export default function LangToggle() {
  const lang = useCockpit((s) => s.lang);
  const setLang = useCockpit((s) => s.setLang);
  return (
    <div className="seg" role="group" aria-label="Briefing language" data-testid="lang-toggle">
      {LANGS.map((l) => (
        <button
          key={l.id}
          type="button"
          title={l.title}
          aria-pressed={lang === l.id}
          onClick={() => setLang(l.id)}
          lang={l.id === "hi" ? "hi" : undefined}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
