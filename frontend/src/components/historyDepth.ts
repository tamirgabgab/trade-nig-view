import type { Bar } from '../api/bars.ts';
import { barSeconds } from '../chart/visibleRange.ts';
import { localDate } from './formatClock.ts';

const DAY = 86_400;

/**
 * The chart's note on how far back an intraday interval goes: the date of its oldest bar, the
 * days from there to the last bar, and how long the provider keeps it (older bars exist only
 * where the local cache collected them).
 */
export function historyDepth(
  interval: string,
  start: number | null,
  windowDays: number,
  last: Bar['time'] | undefined,
  zone: string,
): string {
  const keeps = `the provider keeps ~${String(windowDays)} days`;
  if (start === null || last === undefined) return `${interval}: no data yet; ${keeps}`;
  const days = Math.max(1, Math.round((barSeconds(last) - start) / DAY));
  const plural = days === 1 ? 'day' : 'days';
  return `${interval} data since ${localDate(start, zone)} (${String(days)} ${plural}); ${keeps}`;
}
