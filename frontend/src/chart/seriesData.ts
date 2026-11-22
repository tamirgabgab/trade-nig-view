/**
 * Pure helpers that turn API bars into chart series data. No lightweight-charts import here, so
 * the math is unit-testable without a canvas.
 */
import type { Bar } from '../api/bars.ts';

export interface CandlePoint {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface VolumePoint {
  time: string;
  value: number;
  color: string;
}

export interface LogicalRange {
  from: number;
  to: number;
}

/** Bars shown when a symbol is opened (about 7 months of daily bars). */
export const INITIAL_VISIBLE_BARS = 150;
/** Empty bar slots kept right of the last bar, as in TradingView. */
export const RIGHT_OFFSET_BARS = 5;

export function toCandles(bars: readonly Bar[]): CandlePoint[] {
  return bars.map(({ time, open, high, low, close }) => ({ time, open, high, low, close }));
}

/**
 * Volume histogram colored by bar direction: `up` when close >= open, else `down`
 * (TradingView's default volume coloring).
 */
export function toVolume(bars: readonly Bar[], up: string, down: string): VolumePoint[] {
  return bars.map((bar) => ({
    time: bar.time,
    value: bar.volume,
    color: bar.close >= bar.open ? up : down,
  }));
}

/**
 * Logical range for a freshly opened chart: the last `visible` bars plus `rightOffset` empty slots.
 * With fewer bars than `visible`, every bar is shown.
 */
export function initialRange(
  barCount: number,
  visible = INITIAL_VISIBLE_BARS,
  rightOffset = RIGHT_OFFSET_BARS,
): LogicalRange {
  const last = Math.max(barCount - 1, 0);
  return { from: Math.max(barCount - visible, 0), to: last + rightOffset };
}

/**
 * Bar index under the crosshair, or null when the pointer is outside the data (left of the first
 * bar, in the right offset, or off the chart). `logical` is the chart's fractional bar index.
 */
export function crosshairIndex(
  logical: number | undefined,
  hasTime: boolean,
  barCount: number,
): number | null {
  if (!hasTime || logical === undefined) return null;
  const index = Math.round(logical);
  return index >= 0 && index < barCount ? index : null;
}

/** Price format for `decimals` digits, e.g. 2 -> precision 2, minMove 0.01. */
export function priceFormat(decimals: number): { precision: number; minMove: number } {
  const precision = Math.min(Math.max(Math.trunc(decimals), 0), 8);
  return { precision, minMove: 10 ** -precision };
}
