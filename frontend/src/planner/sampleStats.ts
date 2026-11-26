/** Counting on the samples of a simulation: quantiles, bins and the chance of an interval. */

/** z for a two-sided 95 % interval. */
const Z = 1.959963984540054;

/** The q-quantile of sorted values, linear between the order statistics. */
export function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return Number.NaN;
  const at = q * (sorted.length - 1);
  const below = Math.floor(at);
  const low = sorted[below] ?? Number.NaN;
  const high = sorted[Math.min(below + 1, sorted.length - 1)] ?? low;
  return low + (high - low) * (at - below);
}

/**
 * The Wilson score interval (95 %) of a share of k out of n: unlike p ± 1.96 sqrt(p(1-p)/n) it
 * stays inside [0, 1] and does not collapse when k is 0 or n.
 */
export function wilson(k: number, n: number): [number, number] {
  const p = k / n;
  const scale = 1 + (Z * Z) / n;
  const centre = (p + (Z * Z) / (2 * n)) / scale;
  const half = (Z * Math.sqrt((p * (1 - p)) / n + (Z * Z) / (4 * n * n))) / scale;
  return [Math.max(centre - half, 0), Math.min(centre + half, 1)];
}

/** The share of values in [a, b] (both ends in), with its 95 % interval. */
export function intervalProbability(
  values: readonly number[],
  a: number,
  b: number,
): { p: number; low: number; high: number } {
  const inside = values.filter((v) => v >= a && v <= b).length;
  const [low, high] = wilson(inside, values.length);
  return { p: inside / values.length, low, high };
}

/**
 * Counts of the values in `count` equal bins over [lo, hi]; a value outside lands in the first
 * or the last bin, so the tails stay on the chart.
 */
export function bins(values: readonly number[], lo: number, hi: number, count: number): number[] {
  const counts = new Array<number>(count).fill(0);
  const width = (hi - lo) / count;
  for (const value of values) {
    const index = Math.min(Math.max(Math.floor((value - lo) / width), 0), count - 1);
    counts[index] = (counts[index] ?? 0) + 1;
  }
  return counts;
}
