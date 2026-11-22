import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { apiGet, isRecord } from './client.ts';

/** Bar intervals the chart offers (the backend also knows them; `1h` arrives in R1b). */
export const INTERVALS = ['1D', '1W', '1M'] as const;
export type Interval = (typeof INTERVALS)[number];

export function isInterval(value: unknown): value is Interval {
  return typeof value === 'string' && (INTERVALS as readonly string[]).includes(value);
}

/** One OHLCV bar. Daily and longer bars carry the session date as 'YYYY-MM-DD'. */
export interface Bar {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** GET /api/bars response (camelCase on the client side). */
export interface BarsData {
  symbol: string;
  interval: Interval;
  adjusted: boolean;
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
  if (!isRecord(item) || typeof item['time'] !== 'string') throw new Error('Unexpected bar entry');
  return {
    time: item['time'],
    open: num(item['open'], 'open'),
    high: num(item['high'], 'high'),
    low: num(item['low'], 'low'),
    close: num(item['close'], 'close'),
    volume: num(item['volume'], 'volume'),
  };
}

export function parseBars(body: unknown): BarsData {
  if (!isRecord(body) || !Array.isArray(body['bars'])) {
    throw new Error('Unexpected /api/bars response');
  }
  const interval = body['interval'];
  if (!isInterval(interval)) throw new Error('Unexpected interval in /api/bars response');
  const warnings = Array.isArray(body['warnings']) ? (body['warnings'] as unknown[]) : [];
  return {
    symbol: typeof body['symbol'] === 'string' ? body['symbol'] : '',
    interval,
    adjusted: body['adjusted'] === true,
    source: typeof body['source'] === 'string' ? body['source'] : '',
    stale: body['stale'] === true,
    hasMoreBefore: body['has_more_before'] === true,
    warnings: warnings.filter((w): w is string => typeof w === 'string'),
    bars: (body['bars'] as unknown[]).map(parseBar),
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
