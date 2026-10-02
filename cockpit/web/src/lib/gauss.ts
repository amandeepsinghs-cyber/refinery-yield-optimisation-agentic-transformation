/**
 * Gaussian helpers for the N(μ,σ) target distributions (verbatim VN-1/VN-5: "bell curves per target vs theoretical
 * value and spec"). Pure functions, unit-tested in gauss.test.ts; the SVG renderer lives in components/twin/shared.
 */

export interface GaussMember {
  id: string;
  label: string;
  mu: number;
  sigma: number;
  weight: number;
  color: string;
  dashed?: boolean;
}

export const SQRT_2PI = Math.sqrt(2 * Math.PI);

export function pdf(x: number, mu: number, sigma: number): number {
  const s = Math.max(sigma, 1e-9);
  const z = (x - mu) / s;
  return Math.exp(-0.5 * z * z) / (s * SQRT_2PI);
}

/** Standard normal CDF (Abramowitz–Stegun 7.1.26, |err| < 1.5e-7). */
export function cdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp(-0.5 * z * z);
  const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z >= 0 ? 1 - p : p;
}

/** P(lo ≤ X ≤ hi) for X ~ N(μ,σ); open-ended when a bound is null/undefined. */
export function pOnSpec(mu: number, sigma: number, lo?: number | null, hi?: number | null): number {
  const s = Math.max(sigma, 1e-9);
  const a = lo == null ? 0 : cdf((lo - mu) / s);
  const b = hi == null ? 1 : cdf((hi - mu) / s);
  return Math.max(0, Math.min(1, b - a));
}

/** x-grid covering every member ±3.5σ plus any reference lines, with a little margin. */
export function gaussGrid(members: { mu: number; sigma: number }[], refs: (number | null | undefined)[] = [], n = 96): number[] {
  const xs: number[] = [];
  for (const m of members) if (Number.isFinite(m.mu) && Number.isFinite(m.sigma)) xs.push(m.mu - 3.5 * m.sigma, m.mu + 3.5 * m.sigma);
  for (const r of refs) if (r != null && Number.isFinite(r)) xs.push(r);
  if (!xs.length) return [];
  let lo = Math.min(...xs), hi = Math.max(...xs);
  const pad = (hi - lo) * 0.06 || 1;
  lo -= pad; hi += pad;
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = lo + ((hi - lo) * i) / (n - 1);
  return out;
}

/** Weighted mixture μ/σ (moment-matched) of members — the committee's single belief. */
export function mixtureMoments(members: GaussMember[]): { mu: number; sigma: number } | null {
  const act = members.filter((m) => Number.isFinite(m.mu) && Number.isFinite(m.sigma) && m.weight > 0);
  const W = act.reduce((s, m) => s + m.weight, 0);
  if (!act.length || W <= 0) return null;
  const mu = act.reduce((s, m) => s + (m.weight / W) * m.mu, 0);
  const v = act.reduce((s, m) => s + (m.weight / W) * (m.sigma * m.sigma + (m.mu - mu) * (m.mu - mu)), 0);
  return { mu, sigma: Math.sqrt(v) };
}

/** SVG path (`M … L …`) for a pdf curve on a grid, mapped into a [x0,x1]×[yBase,yTop] box; `peak` scales all curves alike. */
export function gaussPath(
  grid: number[], mu: number, sigma: number, peak: number,
  box: { x0: number; x1: number; yBase: number; yTop: number }, close = false,
): string {
  if (!grid.length || !(peak > 0)) return "";
  const g0 = grid[0], g1 = grid[grid.length - 1];
  const sx = (x: number) => box.x0 + ((x - g0) / (g1 - g0 || 1)) * (box.x1 - box.x0);
  const sy = (p: number) => box.yBase - (p / peak) * (box.yBase - box.yTop);
  let d = "";
  grid.forEach((x, i) => { d += `${i ? "L" : "M"}${sx(x).toFixed(1)},${sy(pdf(x, mu, sigma)).toFixed(1)}`; });
  if (close) d += `L${sx(g1).toFixed(1)},${box.yBase}L${sx(g0).toFixed(1)},${box.yBase}Z`;
  return d;
}

/** Highest pdf peak across members (and the mixture) so every curve shares one vertical scale. */
export function sharedPeak(members: { mu: number; sigma: number }[]): number {
  let p = 0;
  for (const m of members) if (Number.isFinite(m.sigma)) p = Math.max(p, pdf(m.mu, m.mu, m.sigma));
  return p;
}
