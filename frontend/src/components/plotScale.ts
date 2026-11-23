/** Pure helpers for the learn drawer's SVG plots: scales, ticks and nearest-point lookup. */

export type Scale = (value: number) => number;

/** Map `[d0, d1]` onto `[r0, r1]` (linear, or logarithmic for positive domains). */
export function scale(
  [d0, d1]: readonly [number, number],
  [r0, r1]: readonly [number, number],
  log = false,
): Scale {
  const f = log ? Math.log : (v: number) => v;
  const a = f(d0);
  const span = f(d1) - a || 1;
  return (value) => r0 + ((f(value) - a) / span) * (r1 - r0);
}

/** About `count` round ticks (steps of 1, 2 or 5 x 10^k) covering `[min, max]`. */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!(max > min)) return [min];
  const raw = (max - min) / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 5, 10].find((m) => m * magnitude >= raw) ?? 10) * magnitude;
  const ticks: number[] = [];
  for (let t = Math.ceil(min / step) * step; t <= max + step * 1e-9; t += step) {
    ticks.push(Math.abs(t) < step * 1e-9 ? 0 : Number(t.toPrecision(12)));
  }
  return ticks;
}

/** `[min, max]` of the finite values, padded by `pad` of the span (a flat series gets +-1). */
export function extent(values: readonly (number | null)[], pad = 0.08): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (v === null || !Number.isFinite(v)) continue;
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  if (lo === Infinity) return [0, 1];
  if (hi - lo < 1e-12) return [lo - 1, hi + 1];
  const margin = (hi - lo) * pad;
  return [lo - margin, hi + margin];
}

/** Index of the value in ascending `xs` nearest to `x` (`xs` must not be empty). */
export function nearestIndex(xs: readonly number[], x: number): number {
  let lo = 0;
  let hi = xs.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if ((xs[mid] ?? 0) <= x) lo = mid;
    else hi = mid;
  }
  return Math.abs((xs[hi] ?? 0) - x) < Math.abs((xs[lo] ?? 0) - x) ? hi : lo;
}

/** Period ticks of the frequency plots (log axis, 2 to 200 bars). */
export const PERIOD_TICKS = [2, 5, 10, 20, 50, 100, 200];
