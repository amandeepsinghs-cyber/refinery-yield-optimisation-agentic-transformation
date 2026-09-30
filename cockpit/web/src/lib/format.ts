/** Formatting helpers. Simulator minutes are rendered on a clock axis starting at 00:00. */

const BASE_MS = Date.UTC(2000, 0, 1, 0, 0, 0);

const pad = (n: number) => String(n).padStart(2, "0");

/** Minute → Plotly date string (UTC, no zone suffix) so the x-axis shows HH:MM ticks. */
export function minToX(m: number): string {
  const d = new Date(BASE_MS + m * 60_000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(
    d.getUTCHours(),
  )}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

/** Plotly date string/number → minute (rounded). */
export function xToMin(x: string | number | Date): number {
  if (typeof x === "number") return Math.round((x - BASE_MS) / 60_000);
  if (x instanceof Date) return Math.round((x.getTime() - BASE_MS) / 60_000);
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?)?/.exec(x);
  if (!m) return NaN;
  const ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  const frac = m[7] ? Number(`0.${m[7]}`) * 1000 : 0;
  return Math.round((ms + frac - BASE_MS) / 60_000);
}

/** "06:52", or "D2 06:52" beyond the first day. */
export function clock(m: number | null | undefined): string {
  if (m === null || m === undefined || !Number.isFinite(m)) return "—";
  const day = Math.floor(m / 1440);
  const rem = ((m % 1440) + 1440) % 1440;
  const s = `${pad(Math.floor(rem / 60))}:${pad(rem % 60)}`;
  return day > 0 ? `D${day + 1} ${s}` : s;
}

export function num(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return v.toFixed(digits);
}

export function signed(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const s = v.toFixed(digits);
  return v > 0 ? `+${s}` : s.replace("-", "−");
}

export function pct(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}

export const PROPERTY_LABELS: Record<string, string> = {
  LCO_T98_F: "LCO T98",
  HN_T98_F: "HN T98",
};

export const propLabel = (p: string) => PROPERTY_LABELS[p] ?? p;

/** Citation display format from the contract: [DOC-ID rN §x.y] */
export function citationLabel(c: { doc_id: string; revision?: number | string | null; section?: string | null }) {
  const rev = c.revision !== undefined && c.revision !== null && c.revision !== "" ? ` r${c.revision}` : "";
  const sec = c.section ? ` §${c.section}` : "";
  return `[${c.doc_id}${rev}${sec}]`;
}

/** Contiguous runs of equal values → segments [startIdx, endIdx] inclusive. */
export function segments<T>(arr: readonly T[]): { value: T; start: number; end: number }[] {
  const out: { value: T; start: number; end: number }[] = [];
  for (let i = 0; i < arr.length; i++) {
    const last = out[out.length - 1];
    if (last && last.value === arr[i]) last.end = i;
    else out.push({ value: arr[i], start: i, end: i });
  }
  return out;
}

/** 3 significant figures: 14012.13 → "14,000", 0.028705 → "0.0287", 1e-6 → "1.00e-6". */
export function sig3(v: number): string {
  if (!Number.isFinite(v)) return "—";
  if (v === 0) return "0";
  const a = Math.abs(v);
  if (a < 1e-3 || a >= 1e7) return v.toExponential(2).replace("e+", "e");
  return Number(v.toPrecision(3)).toLocaleString("en-US", { maximumFractionDigits: 6 });
}

/** "Last 60 min" / "Last 12 h" / "Last 1.5 h" from a span in minutes. */
export function spanLabel(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes) || minutes <= 0) return "Current window";
  if (minutes < 120) return `Last ${Math.round(minutes)} min`;
  const h = minutes / 60;
  const hs = Math.abs(h - Math.round(h)) < 0.05 ? String(Math.round(h)) : h.toFixed(1);
  return `Last ${hs} h`;
}

/** Inclusive span of a minute index (0..59 → 60). */
export function dataSpan(time: readonly number[]): number {
  if (!time.length) return 0;
  return (time[time.length - 1] - time[0]) + 1;
}

/** d3 tick format that shows sensible digits for a given axis span. */
export function tickFormatFor(span: number): string {
  if (!Number.isFinite(span) || span <= 0) return ".4~g";
  if (span >= 50) return ",.0f";
  if (span >= 2) return ".1~f";
  if (span >= 0.2) return ".2~f";
  if (span >= 0.02) return ".3~f";
  return ".3~g";
}

/**
 * Y-axis fit for a (possibly flat) signal: enforces a minimum visible range of
 * ±max(0.5 % of |mean|, floor) around the midpoint so flat lines render cleanly,
 * and returns a matching tick format.
 */
export function yAxisFit(
  values: readonly (number | null | undefined)[],
  floor = 0.1,
): { range?: [number, number]; tickformat: string; hoverformat: string } {
  let lo = Infinity;
  let hi = -Infinity;
  let sum = 0;
  let n = 0;
  for (const v of values) {
    if (v === null || v === undefined || !Number.isFinite(v)) continue;
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
    sum += v;
    n++;
  }
  if (!n) return { tickformat: ".4~g", hoverformat: ".4~g" };
  const mean = sum / n;
  const minHalf = Math.max(0.005 * Math.abs(mean), floor);
  const half = (hi - lo) / 2;
  const mid = (hi + lo) / 2;
  let range: [number, number] | undefined;
  let span = hi - lo;
  if (half < minHalf) {
    range = [mid - minHalf, mid + minHalf];
    span = 2 * minHalf;
  }
  const tf = tickFormatFor(span);
  const hf = span >= 50 ? ".1f" : span >= 5 ? ".2f" : span >= 0.5 ? ".3f" : ".4~g";
  return { range, tickformat: tf, hoverformat: hf };
}
