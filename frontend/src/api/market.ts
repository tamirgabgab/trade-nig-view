import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { apiGet, fieldsOf, isRecord, type Schemas } from './client.ts';

/** One symbol of the curated universe (GET /api/symbols). */
export interface SymbolInfo {
  symbol: string;
  display: string;
  name: string;
  type: string;
  group: string;
  exchange: string;
  hasVolume: boolean;
  decimals: number;
  currency: string;
  /** Exchange time zone (IANA), e.g. 'America/New_York'. */
  timezone: string;
  /** Local 'HH:MM' start of a session spanning midnight (futures, forex), else null. */
  sessionStart: string | null;
  /** Local 'HH:MM-HH:MM' weekday session when not the US 09:30-16:00 (TASE), else null. */
  cashHours: string | null;
  /** Local 'HH:MM-HH:MM' Friday session when it differs, else null. */
  fridayHours: string | null;
}

/** Last close vs previous close (GET /api/quotes). */
export interface Quote {
  symbol: string;
  time: string | null;
  last: number | null;
  change: number | null;
  changePct: number | null;
  stale: boolean;
  error: string | null;
  /** The last 20 daily closes, oldest first. */
  spark: number[];
  dayLow: number | null;
  dayHigh: number | null;
  low52w: number | null;
  high52w: number | null;
}

function str(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`Expected string for ${field}`);
  return value;
}

function numOrNull(value: unknown, field: string): number | null {
  if (value === null) return null;
  if (typeof value !== 'number') throw new Error(`Expected number or null for ${field}`);
  return value;
}

function strOrNull(value: unknown, field: string): string | null {
  return value === null ? null : str(value, field);
}

/** A number, or null when missing or null (fields added later than the first API version). */
function optionalNum(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

function list(body: unknown, what: string): unknown[] {
  if (!Array.isArray(body)) throw new Error(`Unexpected ${what} response`);
  return body as unknown[];
}

export function parseSymbols(body: unknown): SymbolInfo[] {
  return list(body, '/api/symbols').map((item) => {
    if (!isRecord(item)) throw new Error('Unexpected symbol entry');
    const field = fieldsOf<Schemas['SymbolInfo']>(item);
    const decimals = field('decimals');
    return {
      symbol: str(field('symbol'), 'symbol'),
      display: str(field('display'), 'display'),
      name: str(field('name'), 'name'),
      type: str(field('type'), 'type'),
      group: str(field('group'), 'group'),
      exchange: str(field('exchange'), 'exchange'),
      hasVolume: field('has_volume') === true,
      decimals: typeof decimals === 'number' ? decimals : 2,
      currency: typeof field('currency') === 'string' ? str(field('currency'), 'currency') : 'USD',
      timezone:
        typeof field('timezone') === 'string'
          ? str(field('timezone'), 'timezone')
          : 'America/New_York',
      sessionStart:
        typeof field('session_start') === 'string'
          ? str(field('session_start'), 'session_start')
          : null,
      cashHours:
        typeof field('cash_hours') === 'string' ? str(field('cash_hours'), 'cash_hours') : null,
      fridayHours:
        typeof field('friday_hours') === 'string'
          ? str(field('friday_hours'), 'friday_hours')
          : null,
    };
  });
}

export function parseQuotes(body: unknown): Quote[] {
  return list(body, '/api/quotes').map((item) => {
    if (!isRecord(item)) throw new Error('Unexpected quote entry');
    const field = fieldsOf<Schemas['QuoteOut']>(item);
    return {
      symbol: str(field('symbol'), 'symbol'),
      time: strOrNull(field('time'), 'time'),
      last: numOrNull(field('last'), 'last'),
      change: numOrNull(field('change'), 'change'),
      changePct: numOrNull(field('change_pct'), 'change_pct'),
      stale: field('stale') === true,
      error: strOrNull(field('error'), 'error'),
      spark: Array.isArray(field('spark'))
        ? (field('spark') as unknown[]).filter((v): v is number => typeof v === 'number')
        : [],
      dayLow: optionalNum(field('day_low')),
      dayHigh: optionalNum(field('day_high')),
      low52w: optionalNum(field('low_52w')),
      high52w: optionalNum(field('high_52w')),
    };
  });
}

export const QUOTES_POLL_MS = 60_000;

export function useSymbols() {
  return useQuery({
    queryKey: ['symbols'],
    queryFn: ({ signal }) => apiGet('/symbols', parseSymbols, { signal }),
    staleTime: Infinity,
  });
}

/** Quotes for `symbols`. The first call may take a while: it downloads each symbol's history. */
export function useQuotes(symbols: readonly string[]) {
  return useQuery({
    queryKey: ['quotes', symbols],
    queryFn: ({ signal }) =>
      apiGet(`/quotes?symbols=${encodeURIComponent(symbols.join(','))}`, parseQuotes, { signal }),
    enabled: symbols.length > 0,
    refetchInterval: QUOTES_POLL_MS,
    staleTime: 30_000,
  });
}

/** Quotes of every symbol in the universe (one shared query for the watchlist and the card). */
export function useUniverseQuotes() {
  const symbols = useSymbols().data;
  return useQuotes(useMemo(() => (symbols ?? []).map((s) => s.symbol), [symbols]));
}

/** Group symbols into watchlist sections, keeping universe order. */
export function groupSymbols(symbols: readonly SymbolInfo[]): [string, SymbolInfo[]][] {
  const groups = new Map<string, SymbolInfo[]>();
  for (const info of symbols) {
    const members = groups.get(info.group) ?? [];
    members.push(info);
    groups.set(info.group, members);
  }
  return [...groups.entries()];
}
