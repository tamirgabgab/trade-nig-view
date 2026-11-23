import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query';

import { apiGet, apiPost, fieldsOf, isRecord, type Schemas } from './client.ts';
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
  { id: 'volatility_regime', label: 'Volatility regime', hint: 'Calm, then 3.75 times wilder' },
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
  time: string[];
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
  const f = fieldsOf<Schemas['StatsBlock']>(isRecord(v) ? v : {});
  return {
    n: num(f('n')) ?? 0,
    mean: num(f('mean')),
    median: num(f('median')),
    std: num(f('std')),
    hitRate: num(f('hit_rate')),
  };
}

function parseStudy(v: unknown): Study | null {
  if (!isRecord(v)) return null;
  const f = fieldsOf<Schemas['LabStudy']>(v);
  const histogram = f('histogram');
  const h = fieldsOf<Schemas['Histogram']>(isRecord(histogram) ? histogram : {});
  const ci = f('ci95');
  const bounds = Array.isArray(ci) ? (ci as unknown[]) : [];
  return {
    horizon: num(f('horizon')) ?? 0,
    events: parseStats(f('events')),
    baseline: parseStats(f('baseline')),
    edge: num(f('edge')),
    se: num(f('se')),
    tStat: num(f('t_stat')),
    ci95: [num(bounds[0]), num(bounds[1])],
    histogram: {
      edges: nums(h('edges')),
      events: nums(h('events')),
      baseline: nums(h('baseline')),
    },
    eventIndex: nums(f('event_index')),
  };
}

export function parseLab(body: unknown): LabResult {
  if (!isRecord(body)) throw new Error('Unexpected lab response');
  const f = fieldsOf<Schemas['LabResponse']>(body);
  const time = f('time');
  if (!Array.isArray(time)) throw new Error('Unexpected lab response');
  const indicators = f('indicators');
  return {
    time: (time as unknown[]).filter((t): t is string => typeof t === 'string'),
    open: nums(f('open')),
    high: nums(f('high')),
    low: nums(f('low')),
    close: nums(f('close')),
    volume: nums(f('volume')),
    indicators: (Array.isArray(indicators) ? (indicators as unknown[]) : []).flatMap((item) => {
      if (!isRecord(item)) return [];
      const g = fieldsOf<Schemas['LabIndicatorResult']>(item);
      const id = g('id');
      const outputs = g('outputs');
      const params = g('params');
      if (typeof id !== 'string') return [];
      return [
        {
          id,
          params: (isRecord(params) ? params : {}) as Params,
          outputs: Object.fromEntries(
            Object.entries(isRecord(outputs) ? outputs : {}).map(([k, v]) => [k, maybeNums(v)]),
          ),
          displayShift: num(g('display_shift')) ?? 0,
        },
      ];
    }),
    study: parseStudy(f('study')),
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
  return (body['pages'] as unknown[]).flatMap((p) => {
    if (!isRecord(p)) return [];
    const f = fieldsOf<Schemas['LearnIndexEntry']>(p);
    const slug = f('slug');
    const title = f('title');
    const category = f('category');
    const indicatorId = f('indicator_id');
    if (typeof slug !== 'string' || typeof title !== 'string') return [];
    return [
      {
        slug,
        title,
        kind: f('kind') === 'concept' ? 'concept' : 'indicator',
        category: typeof category === 'string' ? category : null,
        indicatorId: typeof indicatorId === 'string' ? indicatorId : null,
      },
    ];
  });
}

/** Every learn page (indicators and concepts), for the index and the palette. */
export function useLearnIndex() {
  return useQuery({
    queryKey: ['learn-index'],
    queryFn: ({ signal }) => apiGet('/learn', parseIndex, { signal }),
    staleTime: Infinity,
  });
}
