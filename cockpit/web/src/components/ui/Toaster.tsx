"use client";

import { useToasts } from "@/lib/toast";
import { IconCheck, IconClose, IconInfo, IconAlert } from "./icons";

export default function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  return (
    <div className="toaster" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tone}`}>
          {t.tone === "ok" ? <IconCheck width={15} height={15} /> : t.tone === "error" ? <IconAlert width={15} height={15} /> : <IconInfo width={15} height={15} />}
          <span>{t.text}</span>
          <button type="button" className="btn icon sm ghost" aria-label="Dismiss notification" onClick={() => dismiss(t.id)}>
            <IconClose width={13} height={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
