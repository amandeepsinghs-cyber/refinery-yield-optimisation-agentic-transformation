/**
 * Format a probability (0–1) as a percentage for display.
 * A Gaussian never gives exactly 0 or 1, so values that round to 0 or 100 are
 * shown as "< 1" / "> 99" rather than an impossible certainty.
 */
export function probPct(p?: number | null, sep = " "): string {
  if (p == null || !Number.isFinite(p)) return "—";
  const v = p * 100;
  if (v >= 99.5) return `> 99${sep}%`;
  if (v < 0.5) return `< 1${sep}%`;
  return `${Math.round(v)}${sep}%`;
}
