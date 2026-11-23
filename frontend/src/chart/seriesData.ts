/**
 * Pure helpers that turn API bars into chart series data. No lightweight-charts import here, so
 * the math is unit-testable without a canvas.
 */
import type { Bar } from '../api/bars.ts';
import { toZoneSeconds } from './timeZone.ts';

/** 'YYYY-MM-DD' (daily and longer) or display-zone seconds (intraday, see `chartTimes`). */
export type ChartTime = string | number;

export interface CandlePoint {
  time: ChartTime;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface VolumePoint {
  time: ChartTime;
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

/** True when the bars are intraday (their times are UTC epoch seconds). */
export function hasIntradayTimes(bars: readonly Bar[]): boolean {
  return typeof bars[0]?.time === 'number';
}

/**
 * Chart time of each bar. Session dates pass through; intraday UTC seconds are shifted to
 * wall-clock seconds in `timeZone`, because the chart formats every timestamp as UTC.
 */
export function chartTimes(bars: readonly Bar[], timeZone: string): ChartTime[] {
  if (!hasIntradayTimes(bars)) return bars.map((bar) => bar.time);
  return toZoneSeconds(
    bars.map((bar) => Number(bar.time)),
    timeZone,
  );
}

export function toCandles(bars: readonly Bar[], times: readonly ChartTime[]): CandlePoint[] {
  return bars.map(({ open, high, low, close }, i) => ({
    time: times[i] ?? '',
    open,
    high,
    low,
    close,
  }));
}

/**
 * Volume histogram colored by bar direction: `up` when close >= open, else `down`
 * (TradingView's default volume coloring).
 */
export function toVolume(
  bars: readonly Bar[],
  times: readonly ChartTime[],
  up: string,
  down: string,
): VolumePoint[] {
  return bars.map((bar, i) => ({
    time: times[i] ?? '',
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

export interface ColoredCandlePoint extends CandlePoint {
  color: string;
  borderColor: string;
  wickColor: string;
}

export interface LinePoint {
  time: ChartTime;
  value: number;
}

const HOLLOW = 'rgba(0, 0, 0, 0)';

/**
 * Hollow candles (TradingView's definition): the **colour** follows the close against the previous
 * close (`up` when close >= previous close; the first bar compares with its own open), and the
 * **body** is hollow when the bar closed above its open, filled otherwise.
 */
export function toHollowCandles(
  bars: readonly Bar[],
  times: readonly ChartTime[],
  up: string,
  down: string,
): ColoredCandlePoint[] {
  return bars.map(({ open, high, low, close }, i) => {
    const reference = i === 0 ? open : (bars[i - 1]?.close ?? open);
    const color = close >= reference ? up : down;
    return {
      time: times[i] ?? '',
      open,
      high,
      low,
      close,
      color: close > open ? HOLLOW : color,
      borderColor: color,
      wickColor: color,
    };
  });
}

/** Close prices for line and area charts. */
export function toLine(bars: readonly Bar[], times: readonly ChartTime[]): LinePoint[] {
  return bars.map((bar, i) => ({ time: times[i] ?? '', value: bar.close }));
}

/** An indicator output aligned with the bars: null (warm-up) becomes a whitespace point. */
export function toValueLine(
  values: readonly (number | null)[],
  times: readonly ChartTime[],
): (LinePoint | { time: ChartTime })[] {
  return times.map((time, i) => {
    const value = values[i];
    return value === null || value === undefined ? { time } : { time, value };
  });
}

/** Values and colours of one marker output (see `toMarkers`). */
export interface MarkerSource {
  values: readonly (number | null)[];
  color: string;
  upColor?: string | undefined;
  downColor?: string | undefined;
}

export interface MarkerPoint {
  time: ChartTime;
  position: 'belowBar' | 'aboveBar';
  shape: 'arrowUp' | 'arrowDown';
  color: string;
}

/**
 * Arrows for marker outputs (by bar index: +1 = up arrow below the bar, -1 = down arrow above it,
 * null or 0 = none), in time order as lightweight-charts requires. Colours default to `color`.
 */
export function toMarkers(
  lines: readonly MarkerSource[],
  times: readonly ChartTime[],
): MarkerPoint[] {
  const out: MarkerPoint[] = [];
  times.forEach((time, i) => {
    for (const line of lines) {
      const value = line.values[i];
      if (value === null || value === undefined || value === 0) continue;
      const up = value > 0;
      out.push({
        time,
        position: up ? 'belowBar' : 'aboveBar',
        shape: up ? 'arrowUp' : 'arrowDown',
        color: (up ? line.upColor : line.downColor) ?? line.color,
      });
    }
  });
  return out;
}

/**
 * How many bars were prepended when `next` replaced `previous` (older history loaded), or 0 if
 * `next` is not `previous` with older bars in front (a different data set or a refresh).
 */
export function prependedCount(previous: readonly Bar[], next: readonly Bar[]): number {
  const added = next.length - previous.length;
  if (added <= 0 || previous.length === 0) return 0;
  return next[added]?.time === previous[0]?.time && next.at(-1)?.time === previous.at(-1)?.time
    ? added
    : 0;
}
