/**
 * Range buttons (1D … All) as pure math: which interval a range uses and which bars it shows.
 * No lightweight-charts import, so the calendar logic is unit-testable.
 */
import type { Bar, Interval } from '../api/bars.ts';
import { RIGHT_OFFSET_BARS, type LogicalRange } from './seriesData.ts';

export const RANGES = ['1D', '5D', '1M', '3M', '6M', 'YTD', '1Y', '5Y', 'All'] as const;
export type RangeId = (typeof RANGES)[number];

export function isRangeId(value: unknown): value is RangeId {
  return typeof value === 'string' && (RANGES as readonly string[]).includes(value);
}

/**
 * Interval each range switches to, as TradingView does (it picks a bar size that fits the span).
 * Our shortest bar is 1h, so the short ranges share it; 6M uses 4h, 5Y weekly, All monthly.
 */
export const RANGE_INTERVAL: Record<RangeId, Interval> = {
  '1D': '1h',
  '5D': '1h',
  '1M': '1h',
  '3M': '1h',
  '6M': '4h',
  YTD: '1D',
  '1Y': '1D',
  '5Y': '1W',
  All: '1M',
};

export const RANGE_LABEL: Record<RangeId, string> = {
  '1D': '1 day',
  '5D': '5 days',
  '1M': '1 month',
  '3M': '3 months',
  '6M': '6 months',
  YTD: 'Year to date',
  '1Y': '1 year',
  '5Y': '5 years',
  All: 'All data',
};

const SECONDS_PER_DAY = 86_400;

/**
 * A bar's start as UTC epoch seconds: intraday times already are; a daily 'YYYY-MM-DD' counts as
 * 00:00 UTC of that date (the backend's convention, also the `before=` paging cursor).
 */
export function barSeconds(time: Bar['time']): number {
  if (typeof time === 'number') return time;
  return Date.parse(`${time}T00:00:00Z`) / 1000;
}

/** UTC midnight `months` calendar months before the date of `seconds` (day clamped to month end). */
function monthsBack(seconds: number, months: number): number {
  const day = new Date(seconds * 1000);
  const year = day.getUTCFullYear();
  const month = day.getUTCMonth() - months;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return Date.UTC(year, month, Math.min(day.getUTCDate(), lastDay)) / 1000;
}

/**
 * First second a range shows, given the bars' start times (sorted, UTC seconds).
 * Day ranges count trading days (distinct UTC dates that have bars), so 5D after a weekend still
 * shows five sessions; month and year ranges count calendar time back from the last bar.
 * `All` returns -Infinity (every bar, after all history is loaded).
 */
export function rangeStart(id: RangeId, times: readonly number[]): number {
  const last = times.at(-1);
  if (last === undefined || id === 'All') return Number.NEGATIVE_INFINITY;
  const lastDay = Math.floor(last / SECONDS_PER_DAY);
  switch (id) {
    case '1D':
    case '5D': {
      const sessions = id === '1D' ? 1 : 5;
      let seen = 0;
      let day = lastDay + 1;
      for (let i = times.length - 1; i >= 0; i--) {
        const d = Math.floor((times[i] ?? 0) / SECONDS_PER_DAY);
        if (d < day) {
          seen += 1;
          day = d;
          if (seen === sessions) return day * SECONDS_PER_DAY;
        }
      }
      return Number.NEGATIVE_INFINITY;
    }
    case '1M':
      return monthsBack(last, 1);
    case '3M':
      return monthsBack(last, 3);
    case '6M':
      return monthsBack(last, 6);
    case 'YTD':
      return Date.UTC(new Date(last * 1000).getUTCFullYear(), 0, 1) / 1000;
    case '1Y':
      return monthsBack(last, 12);
    case '5Y':
      return monthsBack(last, 60);
  }
}

/** Index of the first bar starting at or after `start` (bars.length if none). */
export function firstIndexFrom(times: readonly number[], start: number): number {
  let lo = 0;
  let hi = times.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((times[mid] ?? 0) < start) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Logical range that shows every bar from `start` to the last one, plus the right offset.
 * Half a bar of padding on the left keeps the first candle whole.
 */
export function logicalRangeFrom(
  times: readonly number[],
  start: number,
  rightOffset = RIGHT_OFFSET_BARS,
): LogicalRange {
  const last = Math.max(times.length - 1, 0);
  const first = Math.min(firstIndexFrom(times, start), last);
  return { from: first - 0.5, to: last + rightOffset };
}
