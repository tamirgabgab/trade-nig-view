import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query';

import { apiGet, apiPost, isRecord } from './client.ts';
import type { Params } from './indicators.ts';

/**
 * The learn lab (P2a): indicators and event studies on a synthetic or a real series, all
 * computed by the backend's one implementation (`POST /api/learn/lab`).
 */

export const SCENARIOS = [
  { id: 'random_walk', label: 'Random walk', hint: 'No edge for any rule: the null hypothesis' },
  { id: 'uptrend', label: 'Uptrend', hint: 'A steady drift up' },
  { id: 'range', label: 'Range', hint: 'Mean-reverting: prices pulled back to 100' },
  { id: 'reversal', label: 'Reversal', hint: 'Up for half the bars, then down' },
  { id: 'shock', label: 'Shock', hint: 'A random walk with one −15 % gap' },
  { id: 'volatility_regime', label: 'Volatility regime', hint: 'Calm, then four times wilder' },
] as const;
export type Scenario = (typeof SCENARIOS)[number]['id'];

export type LabSource =
  | { kind: 'synthetic'; scenario: Scenario; seed: number; bars: number }
  | { kind: 'symbol'; symbol: string; bars: number };

export interface LabIndicator {
  id: string;
  params: Params;
}

export type Operand =
  | { indicator: number; output: string }
  | { price: 'open' | 'high' | 'low' | 'close' }
  | { value: number };

export type Op = 'lt' | 'gt' | 'crosses_above' | 'crosses_below';

export interface Condition {
  left: Operand;
  op: Op;
  right: Operand;
}

export interface LabRequest {
  source: LabSource;
  indicators: LabIndicator[];
  conditions: Condition[];
  horizon: number;
}

export interface Stats {
  n: number;
  mean: number | null;
  median: number | null;
  std: number | null;
  hitRate: number | null;
}

export interface Study {
  horizon: number;
  events: Stats;
  baseline: Stats;
  edge: number | null;
  se: number | null;
  tStat: number | null;
  ci95: [number | null, number | null];
  histogram: { edges: number[]; events: number[]; baseline: number[] };
  eventIndex: number[];
}

export interface LabIndicatorResult {
  id: string;
  params: Params;
  outputs: Record<string, (number | null)[]>;
  displayShift: number;
}

export interface LabResult {
  time: (string | number)[];
  open: number[];
  high: number[];
  low: number[];
  close: number[];
  volume: number[];
  indicators: LabIndicatorResult[];
  study: Study | null;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const nums = (v: unknown): number[] =>
  Array.isArray(v) ? (v as unknown[]).map((x) => num(x) ?? Number.NaN) : [];
const maybeNums = (v: unknown): (number | null)[] =>
  Array.isArray(v) ? (v as unknown[]).map(num) : [];

function parseStats(v: unknown): Stats {
  const r = isRecord(v) ? v : {};
  return {
    n: num(r['n']) ?? 0,
    mean: num(r['mean']),
    median: num(r['median']),
    std: num(r['std']),
    hitRate: num(r['hit_rate']),
  };
}

function parseStudy(v: unknown): Study | null {
  if (!isRecord(v)) return null;
  const h = isRecord(v['histogram']) ? v['histogram'] : {};
  const ci = Array.isArray(v['ci95']) ? (v['ci95'] as unknown[]) : [];
  return {
    horizon: num(v['horizon']) ?? 0,
    events: parseStats(v['events']),
    baseline: parseStats(v['baseline']),
    edge: num(v['edge']),
    se: num(v['se']),
    tStat: num(v['t_stat']),
    ci95: [num(ci[0]), num(ci[1])],
    histogram: {
      edges: nums(h['edges']),
      events: nums(h['events']),
      baseline: nums(h['baseline']),
    },
    eventIndex: nums(v['event_index']),
  };
}

export function parseLab(body: unknown): LabResult {
  if (!isRecord(body) || !Array.isArray(body['time'])) throw new Error('Unexpected lab response');
  const indicators = Array.isArray(body['indicators']) ? (body['indicators'] as unknown[]) : [];
  return {
    time: (body['time'] as unknown[]).filter(
      (t): t is string | number => typeof t === 'string' || typeof t === 'number',
    ),
    open: nums(body['open']),
    high: nums(body['high']),
    low: nums(body['low']),
    close: nums(body['close']),
    volume: nums(body['volume']),
    indicators: indicators.flatMap((item) => {
      if (!isRecord(item) || typeof item['id'] !== 'string') return [];
      const outputs = isRecord(item['outputs']) ? item['outputs'] : {};
      return [
        {
          id: item['id'],
          params: (isRecord(item['params']) ? item['params'] : {}) as Params,
          outputs: Object.fromEntries(Object.entries(outputs).map(([k, v]) => [k, maybeNums(v)])),
          displayShift: num(item['display_shift']) ?? 0,
        },
      ];
    }),
    study: parseStudy(body['study']),
  };
}

/** Run the lab; the previous result stays while a new one loads (sliders do not blink). */
export function useLab(request: LabRequest | null) {
  return useQuery({
    queryKey: ['lab', request],
    enabled: request !== null,
    queryFn: ({ signal }) => apiPost('/learn/lab', request, parseLab, { signal }),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
  });
}

/** Several labs at once (a combination's rules, each alone). */
export function useLabs(requests: readonly LabRequest[]) {
  return useQueries({
    queries: requests.map((request) => ({
      queryKey: ['lab', request],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        apiPost('/learn/lab', request, parseLab, { signal }),
      placeholderData: keepPreviousData,
      staleTime: 5 * 60_000,
    })),
  });
}

export interface LearnEntry {
  slug: string;
  title: string;
  kind: 'indicator' | 'concept';
  category: string | null;
  indicatorId: string | null;
}

function parseIndex(body: unknown): LearnEntry[] {
  if (!isRecord(body) || !Array.isArray(body['pages'])) throw new Error('Unexpected learn index');
  return (body['pages'] as unknown[]).flatMap((p) =>
    isRecord(p) && typeof p['slug'] === 'string' && typeof p['title'] === 'string'
      ? [
          {
            slug: p['slug'],
            title: p['title'],
            kind: p['kind'] === 'concept' ? 'concept' : 'indicator',
            category: typeof p['category'] === 'string' ? p['category'] : null,
            indicatorId: typeof p['indicator_id'] === 'string' ? p['indicator_id'] : null,
          },
        ]
      : [],
  );
}

/** Every learn page (indicators and concepts), for the index and the palette. */
export function useLearnIndex() {
  return useQuery({
    queryKey: ['learn-index'],
    queryFn: ({ signal }) => apiGet('/learn', parseIndex, { signal }),
    staleTime: Infinity,
  });
}
