"use client";

/** "Needs attention" rail (SDD-L0-01): ranked Systems-Agent lines with consequence and clock; click opens the unit. */

import Link from "next/link";
import type { TwinAttention } from "@/lib/twinTypes";

const SEV_COLOUR = { alarm: "var(--red)", warn: "var(--amber)", info: "var(--accent)" } as const;

export default function NeedsAttentionRail({ items }: { items: TwinAttention[] }) {
  return (
    <aside className="l0-rail" aria-label="Needs attention" data-testid="needs-attention">
      <div className="l0-rail-title">Needs attention</div>
      {items.length === 0 ? (
        <div className="l0-rail-empty muted">All units tracking plan — no open agent flags.</div>
      ) : (
        <ul className="l0-attn">
          {items.map((n) => (
            <li key={n.event_id} className="l0-attn-item" data-severity={n.severity}>
              <Link href={n.tag ? `/twin/unit/${n.unit_id}?tag=${encodeURIComponent(n.tag)}` : `/twin/unit/${n.unit_id}`} className="l0-attn-link" data-testid="attention-link">
                <span className="l0-attn-dot" style={{ background: SEV_COLOUR[n.severity] }} aria-label={n.severity} />
                <span className="l0-attn-body">
                  <span className="l0-attn-line">
                    <strong>{n.unit_label}</strong> · {n.line.replace(/ since \d{2}:\d{2}$/, "")}
                    <span className="l0-attn-time mono"> · {n.time_label}</span>
                  </span>
                  {n.consequence ? (
                    <span className="l0-attn-cons">
                      {n.loop ? <span className="l0-attn-loop">{n.loop}</span> : null}
                      {n.consequence}
                    </span>
                  ) : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
