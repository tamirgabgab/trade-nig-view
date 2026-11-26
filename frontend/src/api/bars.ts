import {
  keepPreviousData,
  useInfiniteQuery,
  useQueries,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';

import type { BarTransform } from '../chart/chartTypes.ts';
import { barSeconds } from '../chart/visibleRange.ts';

import { apiGet, fieldsOf, isRecord, type Schemas } from './client.ts';

/** Bar intervals the chart offers, shortest first. */
export const INTERVALS = [
  '1m',
  '2m',
  '5m',
  '15m',
  '30m',
  '90m',
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

/** The minute intervals: their history is short (the provider keeps weeks), and they refresh. */
export const isMinuteInterval = (interval: Interval) => interval.endsWith('m');
/** Bars shorter than a day (minutes and hours): their history is limited. */
export const isIntraday = (interval: Interval) =>
  isMinuteInterval(interval) || interval.endsWith('h');

/**
 * One OHLCV bar. Daily and longer bars carry the session date as 'YYYY-MM-DD'; intraday bars
 * (1m … 4h) carry UTC epoch seconds of the bar start.
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
  /** UTC seconds of the oldest bar of this interval that exists (before paging), or null. */
  historyStart: number | null;
  /** Intraday: days of this interval the provider keeps (older bars only where collected). */
  providerWindowDays: number | null;
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
  const historyStart = field('history_start');
  const windowDays = field('provider_window_days');
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
    historyStart: typeof historyStart === 'number' ? historyStart : null,
    providerWindowDays: typeof windowDays === 'number' ? windowDays : null,
    bars: (bars as unknown[]).map(parseBar),
  };
}

/** How often minute charts re-fetch their newest bars (the backend refreshes them after 60 s). */
export const MINUTE_REFRESH_MS = 60_000;
/** Extra bars asked for on a refresh: more than a minute can add, so nothing is skipped. */
const REFRESH_EXTRA = 100;

type BarPages = InfiniteData<BarsData, number | undefined>;

/**
 * The newest page after a refresh: `latest` (the newest bars, from at least the old page's first
 * bar) cut to start at that first bar, so it meets the older pages without a gap or an overlap.
 */
export function withLatest(old: BarPages, latest: BarsData): BarPages {
  const first = old.pages[0]?.bars[0];
  if (first === undefined) return old;
  const from = barSeconds(first.time);
  const page = { ...latest, bars: latest.bars.filter((bar) => barSeconds(bar.time) >= from) };
  return { ...old, pages: [page, ...old.pages.slice(1)] };
}

/** Bars requested per older page when the user scrolls left. */
export const OLDER_PAGE_LIMIT = 5000;

export interface BarsQuery {
  symbol: string;
  interval: Interval;
  adjusted: boolean;
  transform: BarTransform;
}

export function barsPath(
  { symbol, interval, adjusted, transform }: BarsQuery,
  { limit = BARS_LIMIT, before }: { limit?: number; before?: number | undefined } = {},
): string {
  const query = new URLSearchParams({ symbol, interval, limit: String(limit) });
  if (!adjusted) query.set('adjusted', 'false');
  if (transform !== 'none') query.set('transform', transform);
  if (before !== undefined) query.set('before', String(before));
  return `/bars?${query.toString()}`;
}

/** Older bars first; pages arrive newest first (page 0 is the latest history). */
export function mergePages(pages: readonly BarsData[]): Bar[] {
  if (pages.length === 1) return pages[0]?.bars ?? [];
  return [...pages].reverse().flatMap((page) => page.bars);
}

/** The `before=` cursor for the page older than `page`, or undefined when there is none. */
export function olderCursor(page: BarsData): number | undefined {
  const first = page.bars[0];
  return page.hasMoreBefore && first !== undefined ? barSeconds(first.time) : undefined;
}

export interface BarHistory {
  /** Newest page's metadata (symbol, interval, stale…); undefined before the first response. */
  data: BarsData | undefined;
  /** Every loaded bar, oldest first. */
  bars: Bar[];
  hasOlder: boolean;
  loadOlder: () => void;
  isLoadingOlder: boolean;
  /** Loading a new data set (first load or another symbol/interval/setting). */
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Bars of one symbol and interval, newest page first; `loadOlder` fetches the page before the
 * oldest loaded bar. The previous chart stays on screen while the next one loads
 * (`keepPreviousData`), so switching symbols does not flash an empty chart. With `live`, minute
 * charts refresh their newest page every minute (the forming bar moves).
 */
export function useBarHistory(query: BarsQuery, live = false): BarHistory {
  const queryKey = ['bars', query.symbol, query.interval, query.adjusted, query.transform];
  const result = useInfiniteQuery({
    queryKey,
    queryFn: ({ signal, pageParam }) =>
      apiGet(
        barsPath(query, {
          before: pageParam,
          limit: pageParam === undefined ? BARS_LIMIT : OLDER_PAGE_LIMIT,
        }),
        parseBars,
        { signal },
      ),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: olderCursor,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
  // A minute chart refreshes only its newest page (a refetch would reload every older page).
  const client = useQueryClient();
  const { symbol, interval, adjusted, transform } = query;
  useEffect(() => {
    if (!live || !isMinuteInterval(interval)) return;
    const key = ['bars', symbol, interval, adjusted, transform];
    const timer = setInterval(() => {
      const newest = client.getQueryData<BarPages>(key)?.pages[0];
      if (newest === undefined) return;
      const path = barsPath(
        { symbol, interval, adjusted, transform },
        { limit: newest.bars.length + REFRESH_EXTRA },
      );
      apiGet(path, parseBars).then(
        (latest) => {
          client.setQueryData<BarPages>(key, (old) => old && withLatest(old, latest));
        },
        () => undefined, // the next tick tries again; the chart keeps its bars
      );
    }, MINUTE_REFRESH_MS);
    return () => {
      clearInterval(timer);
    };
  }, [client, live, symbol, interval, adjusted, transform]);
  const pages = (result.data as BarPages | undefined)?.pages;
  const bars = useMemo(() => (pages === undefined ? [] : mergePages(pages)), [pages]);
  const { fetchNextPage, refetch } = result;
  return {
    data: pages?.[0],
    bars,
    hasOlder: result.hasNextPage,
    loadOlder: () => {
      void fetchNextPage({ cancelRefetch: false });
    },
    isLoadingOlder: result.isFetchingNextPage,
    isLoading:
      result.isFetching &&
      !result.isFetchingNextPage &&
      (result.isPlaceholderData || pages === undefined),
    // A failed older page only stops paging; the chart keeps what it has.
    isError: result.isError && !result.isFetchNextPageError,
    error: result.error,
    refetch: () => {
      void refetch();
    },
  };
}

/** The weekly bars of a symbol's whole history (the ghost history backdrop); off when disabled. */
export function useWeeklyHistory(symbol: string, adjusted: boolean, enabled: boolean) {
  const query: BarsQuery = { symbol, interval: '1W', adjusted, transform: 'none' };
  return useQuery({
    queryKey: ['bars-weekly', symbol, adjusted],
    queryFn: ({ signal }) =>
      apiGet(barsPath(query, { limit: OLDER_PAGE_LIMIT }), parseBars, { signal }),
    enabled,
    staleTime: 3_600_000,
  });
}

const dataOf = (results: readonly { data?: BarsData | undefined }[]) => results.map((r) => r.data);

/** The bars of each compared symbol (same interval and adjustment, the plain closes), in order;
 *  undefined while one loads. The array keeps its identity while the data does. */
export function useCompareBars(symbols: readonly string[], interval: Interval, adjusted: boolean) {
  return useQueries({
    combine: dataOf,
    queries: symbols.map((symbol) => {
      const query: BarsQuery = { symbol, interval, adjusted, transform: 'none' };
      return {
        queryKey: ['bars-compare', symbol, interval, adjusted],
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          apiGet(barsPath(query), parseBars, { signal }),
        staleTime: 60_000,
      };
    }),
  });
}
