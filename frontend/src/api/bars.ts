import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { apiGet, fieldsOf, isRecord, type Schemas } from './client.ts';

/** Bar intervals the chart offers, shortest first. */
export const INTERVALS = [
  '1h',
  '4h',
  '1D',
  '1W',
  '1M',
] as const satisfies readonly Schemas['Interval'][];
export type Interval = (typeof INTERVALS)[number];

export function isInterval(value: unknown): value is Interval {
  return typeof value === 'string' && (INTERVALS as readonly string[]).includes(value);
}

/**
 * One OHLCV bar. Daily and longer bars carry the session date as 'YYYY-MM-DD'; intraday bars
 * (1h, 4h) carry UTC epoch seconds of the bar start.
 */
export type Bar = Schemas['Bar'];

/** GET /api/bars response (camelCase on the client side). */
export interface BarsData {
  symbol: string;
  interval: Interval;
  adjusted: boolean;
  /** Exchange time zone (IANA), e.g. 'America/New_York'. */
  timezone: string;
  source: string;
  stale: boolean;
  hasMoreBefore: boolean;
  warnings: string[];
  bars: Bar[];
}

/** Bars requested for the first screen: about 20 years of daily bars. */
export const BARS_LIMIT = 5000;

function num(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Expected a finite number for ${field}`);
  }
  return value;
}

function parseBar(item: unknown): Bar {
  if (!isRecord(item)) throw new Error('Unexpected bar entry');
  const field = fieldsOf<Schemas['Bar']>(item);
  const time = field('time');
  if (typeof time !== 'string' && !(typeof time === 'number' && Number.isInteger(time))) {
    throw new Error('Unexpected bar time');
  }
  return {
    time,
    open: num(field('open'), 'open'),
    high: num(field('high'), 'high'),
    low: num(field('low'), 'low'),
    close: num(field('close'), 'close'),
    volume: num(field('volume'), 'volume'),
  };
}

export function parseBars(body: unknown): BarsData {
  if (!isRecord(body)) throw new Error('Unexpected /api/bars response');
  const field = fieldsOf<Schemas['BarsResponse']>(body);
  const bars = field('bars');
  if (!Array.isArray(bars)) throw new Error('Unexpected /api/bars response');
  const interval = field('interval');
  if (!isInterval(interval)) throw new Error('Unexpected interval in /api/bars response');
  const warnings = field('warnings');
  const symbol = field('symbol');
  const source = field('source');
  const timezone = field('timezone');
  return {
    symbol: typeof symbol === 'string' ? symbol : '',
    interval,
    adjusted: field('adjusted') === true,
    timezone: typeof timezone === 'string' ? timezone : '',
    source: typeof source === 'string' ? source : '',
    stale: field('stale') === true,
    hasMoreBefore: field('has_more_before') === true,
    warnings: Array.isArray(warnings)
      ? (warnings as unknown[]).filter((w): w is string => typeof w === 'string')
      : [],
    bars: (bars as unknown[]).map(parseBar),
  };
}

export function barsPath(symbol: string, interval: Interval, limit = BARS_LIMIT): string {
  const query = new URLSearchParams({ symbol, interval, limit: String(limit) });
  return `/bars?${query.toString()}`;
}

/**
 * Bars of one symbol and interval. The previous chart stays on screen while the next one loads
 * (`keepPreviousData`), so switching symbols does not flash an empty chart.
 */
export function useBars(symbol: string, interval: Interval) {
  return useQuery({
    queryKey: ['bars', symbol, interval],
    queryFn: ({ signal }) => apiGet(barsPath(symbol, interval), parseBars, { signal }),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}
