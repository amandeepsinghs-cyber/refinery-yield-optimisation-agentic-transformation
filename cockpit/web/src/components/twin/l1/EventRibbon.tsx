"use client";

/** Event ribbon (SDD-L1-01): chronological chips under the chart stack; click moves the cursor to that minute. */

import { useCockpit } from "@/lib/store";
import { clock } from "@/lib/format";
import { eventCaption } from "@/lib/l1";
import type { TwinEvent } from "@/lib/twinTypes";

export default function EventRibbon({ events }: { events: TwinEvent[] }) {
  const setTimeMin = useCockpit((s) => s.setTimeMin);
  const timeMin = useCockpit((s) => s.timeMin);
  const sorted = [...events].sort((a, b) => a.time_min - b.time_min);
  return (
    <div className="l1-ribbon" data-testid="event-ribbon">
      <span className="l1-section-label">Event ribbon</span>
      <div className="l1-ribbon-row" role="list">
        {sorted.length === 0 && <span className="muted">No events in window</span>}
        {sorted.map((e, i) => (
          <button
            key={e.event_id ?? `${e.kind}-${e.time_min}-${i}`}
            type="button"
            role="listitem"
            className={`l1-chip sev-${e.severity}${timeMin === e.time_min ? " active" : ""}`}
            title={e.briefing?.en ?? e.message ?? e.kind}
            onClick={() => setTimeMin(e.time_min)}
          >
            <span className="mono">{clock(e.time_min)}</span> {eventCaption(e)}
          </button>
        ))}
      </div>
    </div>
  );
}
