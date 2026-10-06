/**
 * SDD-FP-01 status dot: a CSS dot plus its word, never colour alone (projector, print, colour-blind).
 * Words match use_cases/INDEX.md.
 */
import type { Status } from "@/lib/howItWorks";

export const STATUS_WORD: Record<Status, string> = {
  real: "Interactive",
  scripted: "Scripted outcome",
  partly: "Partly",
  watch: "Watch only",
  absent: "Not claimed",
};

export const STATUS_ORDER: Status[] = ["real", "scripted", "partly", "watch", "absent"];

export default function StatusDot({ status, word = true }: { status: Status; word?: boolean }) {
  return (
    <span className={`sd sd-${status}`}>
      <i aria-hidden className="sd-dot" />
      {word ? <span>{STATUS_WORD[status]}</span> : <span className="sr-only">{STATUS_WORD[status]}</span>}
    </span>
  );
}
