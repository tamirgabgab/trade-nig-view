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

type Route =
  | { status?: number; body: unknown }
  | ((url: URL, init: RequestInit | undefined) => Promise<Response>);

/**
 * Stub global fetch with responses chosen by URL path prefix, e.g. `{ '/api/health': {...} }`.
 * Unknown paths answer 404 so a missing stub fails loudly.
 */
export function stubApi(routes: Record<string, Route>): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const parsed = new URL(url, 'http://localhost');
      const route = routes[parsed.pathname];
      if (route === undefined) {
        return Promise.resolve(new Response('{"detail":"no stub"}', { status: 404 }));
      }
      if (typeof route === 'function') return route(parsed, init);
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

/** GET /api/indicators body: the four core moving averages (snake_case, as the backend sends). */
function maSpec(id: string, name: string, length: number, color: string) {
  return {
    id,
    version: 1,
    name,
    short_name: id.toUpperCase(),
    category: 'moving_averages',
    overlay: true,
    inputs: ['open', 'high', 'low', 'close'],
    params: [
      {
        name: 'length',
        type: 'int',
        default: length,
        label: 'Length',
        min: 1,
        max: 5000,
        step: 1,
        options: [],
      },
      {
        name: 'source',
        type: 'source',
        default: 'close',
        label: 'Source',
        min: null,
        max: null,
        step: null,
        options: ['close', 'open', 'high', 'low', 'hl2', 'hlc3', 'ohlc4', 'hlcc4'],
      },
      {
        name: 'offset',
        type: 'int',
        default: 0,
        label: 'Offset',
        min: 0,
        max: 500,
        step: 1,
        options: [],
      },
    ],
    outputs: [
      { name: 'ma', label: id.toUpperCase(), plot: 'line', color, line_width: 2, style: {} },
    ],
    levels: [],
    learn_slug: id,
    description: `${name} of the source.`,
  };
}

export const INDICATORS = [
  maSpec('sma', 'Simple Moving Average', 9, '#2962FF'),
  maSpec('ema', 'Exponential Moving Average', 9, '#FF6D00'),
  maSpec('wma', 'Weighted Moving Average', 9, '#00BCD4'),
  maSpec('smma', 'Smoothed Moving Average', 7, '#AB47BC'),
];

const MA_TYPE_OPTIONS = ['sma', 'ema', 'hma'];

function maTypeParam(name: string, label: string) {
  return {
    name,
    type: 'enum',
    default: 'sma',
    label,
    min: null,
    max: null,
    step: null,
    options: MA_TYPE_OPTIONS,
    option_labels: ['SMA', 'EMA', 'HMA (Hull)'],
  };
}

function lengthParam(name: string, label: string, value: number) {
  return { name, type: 'int', default: value, label, min: 1, max: 5000, step: 1, options: [] };
}

/** A composite with an enum per average and a markers output (backend `ma_cross`). */
export const MA_CROSS_SPEC = {
  id: 'ma_cross',
  version: 1,
  name: 'Moving Average Cross',
  short_name: 'MA Cross',
  category: 'moving_averages',
  overlay: true,
  inputs: ['open', 'high', 'low', 'close', 'volume'],
  params: [
    maTypeParam('fast_type', 'Fast MA type'),
    lengthParam('fast_length', 'Fast length', 9),
    maTypeParam('slow_type', 'Slow MA type'),
    lengthParam('slow_length', 'Slow length', 21),
  ],
  outputs: [
    { name: 'fast', label: 'Fast', plot: 'line', color: '#FF6D00', line_width: 2, style: {} },
    { name: 'slow', label: 'Slow', plot: 'line', color: '#2962FF', line_width: 2, style: {} },
    {
      name: 'crosses',
      label: 'Crosses',
      plot: 'markers',
      color: '#089981',
      line_width: 2,
      style: { up: '#089981', down: '#F23645' },
    },
  ],
  levels: [],
  learn_slug: 'ma-cross',
  description: 'Fast and slow averages with arrows where they cross.',
};
