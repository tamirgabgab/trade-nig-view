import type { Bar } from '../api/bars.ts';
import type { Forecast } from '../api/forecast.ts';

/** The quantile of `levels` at `level` (the backend's levels: 2.5, 10, 25, 50, 75, 90, 97.5 %). */
export function atLevel(
  levels: readonly number[],
  values: readonly number[],
  level: number,
): number {
  return values[levels.indexOf(level)] ?? Number.NaN;
}

/** The narrowest central interval of the forecast that holds the actual close; null: outside 95 %. */
export type Band = 50 | 80 | 95 | null;

/** A band's colour token (styles/tokens.css), for the tab's legend, chart and table. */
export const bandColor = (band: Band) =>
  `var(--color-band-${band === null ? 'out' : String(band)})`;

/** One bar ahead whose actual bar is known. */
export interface Outcome {
  h: number;
  /** The bar's time and the forecast's median close for it. */
  time: Bar['time'];
  median: number;
  actual: number;
  /** actual - median, and as a share of the median. */
  error: number;
  errorPct: number;
  band: Band;
  /** Where the actual close falls in the forecast: 0 (below its 1 % quantile) to 99 (above 99 %). */
  percentile: number;
}

const INTERVALS: readonly [Band, number, number][] = [
  [50, 0.25, 0.75],
  [80, 0.1, 0.9],
  [95, 0.025, 0.975],
];

/**
 * The forecast against what happened: for each bar ahead that `bars` already holds (the chart's
 * bars; in replay only those up to the cursor), the actual close, its error against the median,
 * the band it fell in and its percentile. Empty when the origin is not among `bars`.
 */
export function forecastOutcomes(f: Forecast, bars: readonly Bar[]): Outcome[] {
  const origin = bars.findIndex((bar) => bar.time === f.lastTime);
  if (origin < 0) return [];
  const out: Outcome[] = [];
  for (const hz of f.horizons) {
    const bar = bars[origin + hz.h];
    if (bar === undefined) break;
    const q = (level: number) => atLevel(f.levels, hz.close, level);
    const median = q(0.5);
    const actual = bar.close;
    out.push({
      h: hz.h,
      time: bar.time,
      median,
      actual,
      error: actual - median,
      errorPct: (actual - median) / median,
      band: INTERVALS.find(([, lo, hi]) => actual >= q(lo) && actual <= q(hi))?.[0] ?? null,
      percentile: hz.closePercentiles.filter((p) => p <= actual).length,
    });
  }
  return out;
}

/** "3 of 5 bars: 1 inside 50 %, 2 inside 80 %, 3 inside 95 %; mean |error| 1.2 %". */
export function outcomeSummary(outcomes: readonly Outcome[], k: number): string {
  if (outcomes.length === 0) return '';
  const inside = (width: number) =>
    outcomes.filter((o) => o.band !== null && o.band <= width).length;
  const mean = outcomes.reduce((sum, o) => sum + Math.abs(o.errorPct), 0) / outcomes.length;
  return (
    `${String(outcomes.length)} of ${String(k)} bars: ${String(inside(50))} inside 50 %, ` +
    `${String(inside(80))} inside 80 %, ${String(inside(95))} inside 95 %; ` +
    `mean |error| ${(mean * 100).toFixed(2)} %`
  );
}

export const pct = (v: number) => `${(v * 100).toFixed(0)}%`;

/** What the PIT histogram says, in words: are the tails too heavy (too narrow) or too light (too
 *  wide), is the forecast biased? Two binomial standard errors count as a difference. */
export function pitVerdict(pit: readonly number[], n: number): string {
  if (n === 0) return '';
  const tails = (pit[0] ?? 0) + (pit[9] ?? 0);
  const below = pit.slice(0, 5).reduce((a, b) => a + b, 0);
  const tailTol = 2 * Math.sqrt((0.2 * 0.8) / n);
  const halfTol = 2 * Math.sqrt(0.25 / n);
  const width =
    tails > 0.2 + tailTol
      ? `The outer tenths hold ${pct(tails)} of the outcomes (20 % if calibrated): the intervals are too narrow.`
      : tails < 0.2 - tailTol
        ? `The outer tenths hold ${pct(tails)} of the outcomes (20 % if calibrated): the intervals are too wide.`
        : `The outer tenths hold ${pct(tails)} of the outcomes (20 % if calibrated): the width fits.`;
  const bias =
    below > 0.5 + halfTol
      ? ` ${pct(below)} fell below the median: the forecast was too high.`
      : below < 0.5 - halfTol
        ? ` ${pct(1 - below)} fell above the median: the forecast was too low.`
        : '';
  return width + bias;
}
