import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { apiGet, apiPost, fieldsOf, isRecord, type Schemas } from './client.ts';
import type { LabSource } from './lab.ts';

/**
 * The OHLC forecast of the next k bars (P3, ADR 0010): price quantiles per horizon, P(up), the
 * expected range, and the walk-forward validation of models A and C against the naive benchmark.
 */

export type ForecastModel = 'a' | 'c';

export interface ForecastParams {
  /** Training bars; null = all the history. */
  window: number | null;
  ridge: number;
  lags: number;
}

export interface HorizonForecast {
  h: number;
  /** Price quantiles at `levels`. */
  open: number[];
  high: number[];
  low: number[];
  close: number[];
  pUp: number;
  expectedRange: number;
}

export interface Validation {
  model: 'naive' | ForecastModel;
  h: number;
  n: number;
  pinball: number;
  /** Share of closes inside the 50 / 80 / 95 % intervals. */
  coverage: number[];
  r2: number | null;
  hitRate: number | null;
}

export interface Forecast {
  symbol: string;
  model: ForecastModel;
  auto: boolean;
  params: ForecastParams;
  lastTime: string | number;
  lastClose: number;
  levels: number[];
  horizons: HorizonForecast[];
  validation: Validation[];
  coefficients: { feature: string; value: number }[];
  tuning: { params: ForecastParams; pinball: number }[];
}

const num = (v: unknown): number => (typeof v === 'number' ? v : Number.NaN);
const numOrNull = (v: unknown): number | null => (typeof v === 'number' ? v : null);
const nums = (v: unknown): number[] => (Array.isArray(v) ? (v as unknown[]).map(num) : []);
const records = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? (v as unknown[]).filter(isRecord) : [];

function parseParams(v: unknown): ForecastParams {
  const f = fieldsOf<Schemas['ForecastParams']>(isRecord(v) ? v : {});
  return { window: numOrNull(f('window')), ridge: num(f('ridge')), lags: num(f('lags')) };
}

export function parseForecast(body: unknown): Forecast {
  if (!isRecord(body)) throw new Error('Unexpected forecast response');
  const f = fieldsOf<Schemas['ForecastResponse']>(body);
  const lastTime = f('last_time');
  const model = f('model');
  return {
    symbol: String(f('symbol')),
    model: model === 'a' ? 'a' : 'c',
    auto: f('auto') === true,
    params: parseParams(f('params')),
    lastTime: typeof lastTime === 'number' ? lastTime : String(lastTime),
    lastClose: num(f('last_close')),
    levels: nums(f('levels')),
    horizons: records(f('horizons')).map((item) => {
      const g = fieldsOf<Schemas['HorizonForecast']>(item);
      return {
        h: num(g('h')),
        open: nums(g('open')),
        high: nums(g('high')),
        low: nums(g('low')),
        close: nums(g('close')),
        pUp: num(g('p_up')),
        expectedRange: num(g('expected_range')),
      };
    }),
    validation: records(f('validation')).map((item) => {
      const g = fieldsOf<Schemas['Validation']>(item);
      const m = g('model');
      return {
        model: m === 'a' || m === 'c' ? m : 'naive',
        h: num(g('h')),
        n: num(g('n')),
        pinball: num(g('pinball')),
        coverage: nums(g('coverage')),
        r2: numOrNull(g('r2')),
        hitRate: numOrNull(g('hit_rate')),
      };
    }),
    coefficients: records(f('coefficients')).map((item) => {
      const g = fieldsOf<Schemas['Coefficient']>(item);
      return { feature: String(g('feature')), value: num(g('value')) };
    }),
    tuning: records(f('tuning')).map((item) => {
      const g = fieldsOf<Schemas['Tried']>(item);
      return { params: parseParams(g('params')), pinball: num(g('pinball')) };
    }),
  };
}

export interface ForecastQuery {
  symbol: string;
  interval: string;
  adjusted: boolean;
  k: number;
  model: ForecastModel;
  /** null: auto-tuned; else the manual parameters. */
  manual: ForecastParams | null;
  /** Forecast from this bar (its open, UTC epoch seconds): the replay origin; null = last bar. */
  origin: number | null;
}

/** The chart's forecast (the backend tunes and caches it per bars). No placeholder: another
 *  symbol's or the present's forecast must never show while a new one loads (in a replay it would
 *  reveal the future). */
export function useForecast(query: ForecastQuery | null) {
  return useQuery({
    queryKey: ['forecast', query],
    enabled: query !== null,
    staleTime: 60_000,
    queryFn: ({ signal }) => {
      if (query === null) throw new Error('no forecast query');
      const params = new URLSearchParams({
        symbol: query.symbol,
        interval: query.interval,
        adjusted: String(query.adjusted),
        k: String(query.k),
        model: query.model,
        auto: String(query.manual === null),
      });
      if (query.manual !== null) {
        params.set('window', String(query.manual.window ?? 0));
        params.set('ridge', String(query.manual.ridge));
        params.set('lags', String(query.manual.lags));
      }
      if (query.origin !== null) params.set('origin', String(query.origin));
      return apiGet(`/forecast?${params.toString()}`, parseForecast, { signal });
    },
  });
}

/** The learn page's forecast on a lab source (auto-tuned). */
export function useLabForecast(request: { source: LabSource; k: number; model: ForecastModel }) {
  return useQuery({
    queryKey: ['lab-forecast', request],
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
    queryFn: ({ signal }) => apiPost('/learn/forecast', request, parseForecast, { signal }),
  });
}
