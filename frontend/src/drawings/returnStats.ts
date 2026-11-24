import type { Bar } from '../api/bars.ts';
import { barSeconds } from '../chart/visibleRange.ts';

/**
 * Statistics of a range (the Statistics tool): the distribution of the bars' returns and of their
 * change ("curvature"), at the chart's interval.
 *
 * For each bar t in the range, the return is
 *   log:    r_t = ln(C_t / P_t)      simple: r_t = C_t / P_t - 1
 * with P_t the previous bar's close (close-to-close, so overnight gaps count) or the bar's own
 * open (open-to-close, within the bar). The first bar of the chart has no previous close.
 * The curvature is the change of consecutive returns, c_t = r_t - r_{t-1} (for log returns, the
 * second difference of the log price: an acceleration per bar).
 * Mean, sample standard deviation (n - 1), min, max and a histogram for each; annualised with the
 * chart's bars per year, k = (loaded bars - 1) / years they span: mean x k, std x sqrt(k).
 */

export type ReturnKind = 'log' | 'simple';
export type ReturnBasis = 'close' | 'open';

export interface Distribution {
  n: number;
  mean: number;
  /** Sample standard deviation (n - 1); NaN below two values. */
  std: number;
  min: number;
  max: number;
  /** `counts.length + 1` edges from min to max. */
  edges: number[];
  counts: number[];
}

export interface RangeStats {
  /** Bars in the range. */
  bars: number;
  firstTime: Bar['time'];
  lastTime: Bar['time'];
  returns: Distribution | null;
  curvature: Distribution | null;
  /** Bars per year of the loaded series; null with fewer than two bars. */
  barsPerYear: number | null;
}

const YEAR_SECONDS = 365.25 * 86_400;
const MIN_BINS = 5;
const MAX_BINS = 40;

/** Mean, sample std, extremes and a histogram of about sqrt(n) equal bins. */
export function distribution(values: readonly number[]): Distribution | null {
  const n = values.length;
  if (n === 0) return null;
  let sum = 0;
  let lowest = Infinity;
  let highest = -Infinity;
  // One loop, not Math.min(...values): a spread of a long range would overflow the call stack.
  for (const v of values) {
    sum += v;
    lowest = Math.min(lowest, v);
    highest = Math.max(highest, v);
  }
  const mean = sum / n;
  const std =
    n < 2 ? Number.NaN : Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1));
  let min = lowest;
  let max = highest;
  if (max === min) {
    // One value only: a narrow bin around it.
    const pad = Math.abs(min) * 1e-6 || 1e-9;
    min -= pad;
    max += pad;
  }
  const bins = Math.min(MAX_BINS, Math.max(MIN_BINS, Math.ceil(Math.sqrt(n))));
  const width = (max - min) / bins;
  const edges = Array.from({ length: bins + 1 }, (_, i) => min + i * width);
  const counts = new Array<number>(bins).fill(0);
  for (const v of values) {
    const bin = Math.min(bins - 1, Math.floor((v - min) / width));
    counts[bin] = (counts[bin] ?? 0) + 1;
  }
  return { n, mean, std, min: lowest, max: highest, edges, counts };
}

/** The statistics of the bars between two times (inclusive, in any order). */
export function rangeStats(
  bars: readonly Bar[],
  from: number,
  to: number,
  kind: ReturnKind,
  basis: ReturnBasis,
): RangeStats | null {
  // The bars that contain the two anchors and every bar between (an anchor can sit inside a bar
  // when the magnet is off), as the range's label counts them.
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const containing = bars.findLastIndex((bar) => barSeconds(bar.time) <= lo);
  // An anchor before the first bar: the range starts at the first bar.
  const start = containing >= 0 ? containing : bars.findIndex((bar) => barSeconds(bar.time) >= lo);
  const end = bars.findLastIndex((bar) => barSeconds(bar.time) <= hi);
  const lastOpen = bars.at(-1);
  const afterData = lastOpen === undefined || lo > barSeconds(lastOpen.time);
  const index =
    afterData || start < 0 || end < start
      ? []
      : Array.from({ length: end - start + 1 }, (_, k) => start + k);
  const first = bars[index[0] ?? -1];
  const last = bars[index.at(-1) ?? -1];
  if (first === undefined || last === undefined) return null;

  // One return per bar (NaN where it is undefined), so consecutive bars stay aligned.
  const r = index.map((i) => {
    const bar = bars[i];
    const base = basis === 'open' ? bar?.open : bars[i - 1]?.close;
    if (bar === undefined || base === undefined || base <= 0 || bar.close <= 0) return Number.NaN;
    return kind === 'log' ? Math.log(bar.close / base) : bar.close / base - 1;
  });
  const curvature = r.slice(1).map((v, k) => v - (r[k] ?? Number.NaN));
  // Bars per year from all the loaded bars (weekends, nights and holidays included), not from
  // the range: a range inside one week or one session would count them as trading time.
  const all = [bars[0], bars.at(-1)];
  const years =
    all[0] === undefined || all[1] === undefined
      ? 0
      : (barSeconds(all[1].time) - barSeconds(all[0].time)) / YEAR_SECONDS;
  return {
    bars: index.length,
    firstTime: first.time,
    lastTime: last.time,
    returns: distribution(r.filter(Number.isFinite)),
    curvature: distribution(curvature.filter(Number.isFinite)),
    barsPerYear: years > 0 ? (bars.length - 1) / years : null,
  };
}
