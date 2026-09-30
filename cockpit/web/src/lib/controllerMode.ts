/**
 * Controller-mode strip helpers for the Time-Series Explorer (Scene 2).
 * `cutpoint_auto` = 0 → Manual (valves held), 1 → Trim (cut-point controller active);
 * `lab_sample` = 1 marks a lab draw minute (simulator META_COLS).
 */

export type ControllerMode = "Manual" | "Trim";

export interface ModeSegment {
  mode: ControllerMode;
  /** First minute of the segment. */
  start: number;
  /** Minute where the segment ends (the next segment's start, or last minute + step). */
  end: number;
}

export function modeOf(v: number | null | undefined): ControllerMode | null {
  if (v === null || v === undefined || !Number.isFinite(v)) return null;
  return v >= 0.5 ? "Trim" : "Manual";
}

/** Contiguous Manual/Trim runs; null samples break a segment. */
export function modeSegments(time: number[], cutpointAuto: (number | null)[]): ModeSegment[] {
  const out: ModeSegment[] = [];
  const n = Math.min(time.length, cutpointAuto.length);
  const step = n > 1 ? time[n - 1] - time[n - 2] || 1 : 1;
  let cur: ModeSegment | null = null;
  for (let i = 0; i < n; i++) {
    const m = modeOf(cutpointAuto[i]);
    if (cur && m !== cur.mode) {
      cur.end = time[i];
      out.push(cur);
      cur = null;
    }
    if (m && !cur) cur = { mode: m, start: time[i], end: time[i] + step };
  }
  if (cur) {
    cur.end = time[n - 1] + step;
    out.push(cur);
  }
  return out;
}

/** Minutes where a lab sample was drawn (`lab_sample == 1`). */
export function labDrawMinutes(time: number[], labSample: (number | null)[]): number[] {
  const out: number[] = [];
  const n = Math.min(time.length, labSample.length);
  for (let i = 0; i < n; i++) if ((labSample[i] ?? 0) >= 0.5) out.push(time[i]);
  return out;
}
