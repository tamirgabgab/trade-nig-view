import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';

/** Render with a fresh QueryClient (no retries, no cache sharing between tests). */
export function renderWithQuery(ui: ReactElement): RenderResult {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

/** Stub global fetch with a single JSON response. */
export function stubFetchJson(status: number, body: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(body), {
          status,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    ),
  );
}

type Route = { status?: number; body: unknown } | ((url: URL) => Promise<Response>);

/**
 * Stub global fetch with responses chosen by URL path prefix, e.g. `{ '/api/health': {...} }`.
 * Unknown paths answer 404 so a missing stub fails loudly.
 */
export function stubApi(routes: Record<string, Route>): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const parsed = new URL(url, 'http://localhost');
      const route = routes[parsed.pathname];
      if (route === undefined) {
        return Promise.resolve(new Response('{"detail":"no stub"}', { status: 404 }));
      }
      if (typeof route === 'function') return route(parsed);
      return Promise.resolve(
        new Response(JSON.stringify(route.body), {
          status: route.status ?? 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }),
  );
}

/** JSON response helper for function routes. */
export function jsonResponse(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

export const HEALTH_OK = { status: 'ok', version: '0.1.0', offline: false, providers: [] };

export const SYMBOLS = [
  {
    symbol: '^GSPC',
    display: 'SPX',
    name: 'S&P 500 Index',
    type: 'index',
    group: 'Indices',
    exchange: 'SNP',
    has_volume: false,
    decimals: 2,
  },
  {
    symbol: 'AAPL',
    display: 'AAPL',
    name: 'Apple Inc.',
    type: 'stock',
    group: 'Stocks',
    exchange: 'NASDAQ',
    has_volume: true,
    decimals: 2,
  },
  {
    symbol: 'TSLA',
    display: 'TSLA',
    name: 'Tesla, Inc.',
    type: 'stock',
    group: 'Stocks',
    exchange: 'NASDAQ',
    has_volume: true,
    decimals: 2,
  },
  {
    symbol: 'GBPUSD=X',
    display: 'GBPUSD',
    name: 'British Pound / US Dollar',
    type: 'forex',
    group: 'Forex',
    exchange: 'FX',
    has_volume: false,
    decimals: 5,
  },
];

export const QUOTES = [
  {
    symbol: '^GSPC',
    time: '2026-11-20',
    last: 6910.39,
    change: -265.44,
    change_pct: -3.699,
    stale: false,
    error: null,
  },
  {
    symbol: 'AAPL',
    time: '2026-11-20',
    last: 342.56,
    change: -6.65,
    change_pct: -1.904,
    stale: false,
    error: null,
  },
  {
    symbol: 'TSLA',
    time: null,
    last: null,
    change: null,
    change_pct: null,
    stale: false,
    error: 'No data for TSLA: yahoo: rate limited',
  },
  {
    symbol: 'GBPUSD=X',
    time: '2026-11-20',
    last: 1.308094,
    change: 0.000611,
    change_pct: 0.047,
    stale: false,
    error: null,
  },
];

/** Three daily AAPL bars: up day, down day, up day. */
export const AAPL_BARS = [
  { time: '2026-11-18', open: 340, high: 345, low: 338.5, close: 344.1, volume: 51_200_000 },
  { time: '2026-11-19', open: 344, high: 350.2, low: 343, close: 349.21, volume: 48_700_000 },
  { time: '2026-11-20', open: 348, high: 349, low: 340.1, close: 342.56, volume: 62_350_000 },
];

/** A GET /api/bars body (snake_case, as the backend sends it). */
export function barsBody(symbol: string, interval: string, bars: unknown[]) {
  return {
    symbol,
    interval,
    adjusted: true,
    timezone: 'America/New_York',
    source: 'fixtures',
    stale: false,
    has_more_before: false,
    warnings: [],
    bars,
  };
}
