import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { apiGet, apiPost, fieldsOf, isRecord, type Schemas } from './client.ts';
import type { LabSource } from './lab.ts';

/**
 * The volatility cone (P3 V1, ADR 0011): per calendar horizon, today's per-bar volatility against
 * the history's percentiles, the HAR forecast, the squeeze probability, the overnight and downside
 * shares and the estimators' QLIKE scores. Volatilities are per bar; annualise with
 * `sqrt(barsPerYear)`.
 */

export type Estimator = 'yang_zhang' | 'close' | 'parkinson' | 'garman_klass' | 'rogers_satchell';
export type SqueezeHorizon = 'week' | 'month' | 'quarter';

export const ESTIMATORS: { id: Estimator; label: string }[] = [
  { id: 'yang_zhang', label: 'Yang-Zhang' },
  { id: 'close', label: 'Close to close' },
  { id: 'parkinson', label: 'Parkinson' },
  { id: 'garman_klass', label: 'Garman-Klass' },
  { id: 'rogers_satchell', label: 'Rogers-Satchell' },
];

export interface VolForecast {
  low: number;
  median: number;
  high: number;
  coverage: number | null;
  qlike: number | null;
  qlikeNaive: number | null;
}

export interface VolHorizon {
  label: string;
  bars: number;
  current: number;
  ci: [number | null, number | null];
  percentiles: number[];
  rank: number;
  forecast: VolForecast | null;
}

export interface VolSqueeze {
  horizon: string;
  bars: number;
  threshold: number;
  factor: number;
  rank: number | null;
  active: boolean;
  events: number;
  independent: number;
  p: number | null;
  ci: [number | null, number | null];
  baseRate: number;
  moveEvents: [number | null, number | null];
  moveAll: [number | null, number | null];
}

export interface VolScore {
  estimator: string;
  label: string;
  n: number;
  qlike: number;
  bias: number | null;
}

export interface Shares {
  window: number | null;
  history: number | null;
}

export interface Volatility {
  symbol: string;
  estimator: Estimator;
  lastTime: string | number;
  barsPerYear: number;
  levels: number[];
  horizons: VolHorizon[];
  main: string;
  squeeze: VolSqueeze | null;
  overnight: Shares;
  downside: Shares;
  scores: VolScore[];
  realized: boolean;
}

const num = (v: unknown): number => (typeof v === 'number' ? v : Number.NaN);
const numOrNull = (v: unknown): number | null => (typeof v === 'number' ? v : null);
const pair = (v: unknown): [number | null, number | null] => {
  const a = Array.isArray(v) ? (v as unknown[]) : [];
  return [numOrNull(a[0]), numOrNull(a[1])];
};
const records = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? (v as unknown[]).filter(isRecord) : [];

function parseShares(v: unknown): Shares {
  const f = fieldsOf<Schemas['VolShares']>(isRecord(v) ? v : {});
  return { window: numOrNull(f('window')), history: numOrNull(f('history')) };
}

function parseForecast(v: unknown): VolForecast | null {
  if (!isRecord(v)) return null;
  const f = fieldsOf<Schemas['VolForecast']>(v);
  return {
    low: num(f('low')),
    median: num(f('median')),
    high: num(f('high')),
    coverage: numOrNull(f('coverage')),
    qlike: numOrNull(f('qlike')),
    qlikeNaive: numOrNull(f('qlike_naive')),
  };
}

function parseSqueeze(v: unknown): VolSqueeze | null {
  if (!isRecord(v)) return null;
  const f = fieldsOf<Schemas['VolSqueeze']>(v);
  return {
    horizon: String(f('horizon')),
    bars: num(f('bars')),
    threshold: num(f('threshold')),
    factor: num(f('factor')),
    rank: numOrNull(f('rank')),
    active: f('active') === true,
    events: num(f('events')),
    independent: num(f('independent')),
    p: numOrNull(f('p')),
    ci: pair(f('ci')),
    baseRate: num(f('base_rate')),
    moveEvents: pair(f('move_events')),
    moveAll: pair(f('move_all')),
  };
}

export function parseVolatility(body: unknown): Volatility {
  if (!isRecord(body)) throw new Error('Unexpected volatility response');
  const f = fieldsOf<Schemas['VolatilityResponse']>(body);
  const lastTime = f('last_time');
  const estimator = ESTIMATORS.find((e) => e.id === f('estimator'))?.id ?? 'yang_zhang';
  return {
    symbol: String(f('symbol')),
    estimator,
    lastTime: typeof lastTime === 'number' ? lastTime : String(lastTime),
    barsPerYear: num(f('bars_per_year')),
    levels: Array.isArray(f('levels')) ? (f('levels') as unknown[]).map(num) : [],
    horizons: records(f('horizons')).map((item) => {
      const g = fieldsOf<Schemas['VolHorizon']>(item);
      const p = g('percentiles');
      return {
        label: String(g('label')),
        bars: num(g('bars')),
        current: num(g('current')),
        ci: pair(g('ci')),
        percentiles: Array.isArray(p) ? (p as unknown[]).map(num) : [],
        rank: num(g('rank')),
        forecast: parseForecast(g('forecast')),
      };
    }),
    main: String(f('main')),
    squeeze: parseSqueeze(f('squeeze')),
    overnight: parseShares(f('overnight')),
    downside: parseShares(f('downside')),
    scores: records(f('scores')).map((item) => {
      const g = fieldsOf<Schemas['VolScore']>(item);
      return {
        estimator: String(g('estimator')),
        label: String(g('label')),
        n: num(g('n')),
        qlike: num(g('qlike')),
        bias: numOrNull(g('bias')),
      };
    }),
    realized: f('realized') === true,
  };
}

export interface VolatilitySettings {
  estimator: Estimator;
  horizon: SqueezeHorizon;
  threshold: number;
  factor: number;
}

export interface VolatilityQuery extends VolatilitySettings {
  symbol: string;
  interval: string;
  adjusted: boolean;
  /** The cone at this bar (its open, UTC epoch seconds): the replay cursor; null = last bar. */
  origin: number | null;
}

/** The chart's cone. No placeholder: another symbol's or the present's cone must never show
 *  while a new one loads (in a replay it would reveal the future). */
export function useVolatility(query: VolatilityQuery | null) {
  return useQuery({
    queryKey: ['volatility', query],
    enabled: query !== null,
    staleTime: 60_000,
    queryFn: ({ signal }) => {
      if (query === null) throw new Error('no volatility query');
      const params = new URLSearchParams({
        symbol: query.symbol,
        interval: query.interval,
        adjusted: String(query.adjusted),
        estimator: query.estimator,
        horizon: query.horizon,
        threshold: String(query.threshold),
        factor: String(query.factor),
      });
      if (query.origin !== null) params.set('origin', String(query.origin));
      return apiGet(`/volatility?${params.toString()}`, parseVolatility, { signal });
    },
  });
}

/** The learn page's cone on a lab source. */
export function useLabVolatility(request: { source: LabSource; estimator: Estimator }) {
  return useQuery({
    queryKey: ['lab-volatility', request],
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
    queryFn: ({ signal }) => apiPost('/learn/volatility', request, parseVolatility, { signal }),
  });
}
