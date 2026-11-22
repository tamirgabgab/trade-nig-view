import { useQuery } from '@tanstack/react-query';

import { apiGet, isRecord } from './client.ts';

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

function list(body: unknown, what: string): unknown[] {
  if (!Array.isArray(body)) throw new Error(`Unexpected ${what} response`);
  return body as unknown[];
}

export function parseSymbols(body: unknown): SymbolInfo[] {
  return list(body, '/api/symbols').map((item) => {
    if (!isRecord(item)) throw new Error('Unexpected symbol entry');
    return {
      symbol: str(item['symbol'], 'symbol'),
      display: str(item['display'], 'display'),
      name: str(item['name'], 'name'),
      type: str(item['type'], 'type'),
      group: str(item['group'], 'group'),
      exchange: str(item['exchange'], 'exchange'),
      hasVolume: item['has_volume'] === true,
      decimals: typeof item['decimals'] === 'number' ? item['decimals'] : 2,
    };
  });
}

export function parseQuotes(body: unknown): Quote[] {
  return list(body, '/api/quotes').map((item) => {
    if (!isRecord(item)) throw new Error('Unexpected quote entry');
    return {
      symbol: str(item['symbol'], 'symbol'),
      time: strOrNull(item['time'], 'time'),
      last: numOrNull(item['last'], 'last'),
      change: numOrNull(item['change'], 'change'),
      changePct: numOrNull(item['change_pct'], 'change_pct'),
      stale: item['stale'] === true,
      error: strOrNull(item['error'], 'error'),
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
