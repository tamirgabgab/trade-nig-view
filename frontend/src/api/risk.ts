import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { apiGet, apiPost, fieldsOf, isRecord, type Schemas } from './client.ts';
import type { LabSource } from './lab.ts';
import { keepsPrevious } from './replayPlaceholder.ts';

/**
 * Value at Risk and Expected Shortfall (P3 R2, ADR 0013): of the next bar, week and month, by
 * four methods, for a long (a fall) and a short (a rise), with the 1-bar backtests.
 */

export type RiskMethod = 'normal' | 'cornish_fisher' | 'fhs' | 'evt';
export type RiskTail = 'long' | 'short';

export const RISK_METHODS: { id: RiskMethod; label: string }[] = [
  { id: 'normal', label: 'Normal' },
  { id: 'cornish_fisher', label: 'Cornish-Fisher' },
  { id: 'fhs', label: 'Historical (FHS)' },
  { id: 'evt', label: 'Extreme value' },
];

export interface RiskEstimate {
  horizon: string;
  bars: number;
  method: RiskMethod;
  level: number;
  tail: RiskTail;
  var: number;
  es: number;
}

export interface RiskBacktest {
  method: RiskMethod;
  level: number;
  tail: RiskTail;
  n: number;
  breaches: number;
  expected: number;
  kupiec: number | null;
  christoffersen: number | null;
  z2: number;
  z2P: number;
}

export interface RiskTailFit {
  tail: RiskTail;
  threshold: number;
  xi: number;
  beta: number;
  exceedances: number;
}

export interface Risk {
  symbol: string;
  lastTime: string | number;
  lastClose: number;
  sigma: number;
  estimates: RiskEstimate[];
  tails: RiskTailFit[];
  backtests: RiskBacktest[];
}

const num = (v: unknown): number => (typeof v === 'number' ? v : Number.NaN);
const numOrNull = (v: unknown): number | null => (typeof v === 'number' ? v : null);
const records = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? (v as unknown[]).filter(isRecord) : [];
/** A known method id, or null (an entry of a method this client does not know is left out). */
const method = (v: unknown): RiskMethod | null => RISK_METHODS.find((m) => m.id === v)?.id ?? null;
const tail = (v: unknown): RiskTail => (v === 'short' ? 'short' : 'long');

export function parseRisk(body: unknown): Risk {
  if (!isRecord(body)) throw new Error('Unexpected risk response');
  const f = fieldsOf<Schemas['RiskResponse']>(body);
  const last = f('last_time');
  return {
    symbol: String(f('symbol')),
    lastTime: typeof last === 'number' ? last : String(last),
    lastClose: num(f('last_close')),
    sigma: num(f('sigma')),
    estimates: records(f('estimates')).flatMap((item) => {
      const g = fieldsOf<Schemas['RiskEstimate']>(item);
      const m = method(g('method'));
      if (m === null) return [];
      return {
        horizon: String(g('horizon')),
        bars: num(g('bars')),
        method: m,
        level: num(g('level')),
        tail: tail(g('tail')),
        var: num(g('var')),
        es: num(g('es')),
      };
    }),
    tails: records(f('tails')).map((item) => {
      const g = fieldsOf<Schemas['RiskTail']>(item);
      return {
        tail: tail(g('tail')),
        threshold: num(g('threshold')),
        xi: num(g('xi')),
        beta: num(g('beta')),
        exceedances: num(g('exceedances')),
      };
    }),
    backtests: records(f('backtests')).flatMap((item) => {
      const g = fieldsOf<Schemas['RiskBacktest']>(item);
      const m = method(g('method'));
      if (m === null) return [];
      return {
        method: m,
        level: num(g('level')),
        tail: tail(g('tail')),
        n: num(g('n')),
        breaches: num(g('breaches')),
        expected: num(g('expected')),
        kupiec: numOrNull(g('kupiec')),
        christoffersen: numOrNull(g('christoffersen')),
        z2: num(g('z2')),
        z2P: num(g('z2_p')),
      };
    }),
  };
}

export interface RiskQuery {
  symbol: string;
  interval: string;
  adjusted: boolean;
  /** At this bar (its open, UTC epoch seconds): the replay cursor; null = the last bar. */
  origin: number | null;
}

/** The chart's VaR and ES; during a replay the last result stays while the next loads. */
export function useRisk(query: RiskQuery | null) {
  return useQuery({
    queryKey: ['risk', query],
    enabled: query !== null,
    staleTime: 60_000,
    placeholderData: (previous: Risk | undefined, previousQuery) =>
      query !== null &&
      keepsPrevious((previousQuery?.queryKey[1] ?? null) as RiskQuery | null, query)
        ? previous
        : undefined,
    queryFn: ({ signal }) => {
      if (query === null) throw new Error('no risk query');
      const params = new URLSearchParams({
        symbol: query.symbol,
        interval: query.interval,
        adjusted: String(query.adjusted),
      });
      if (query.origin !== null) params.set('origin', String(query.origin));
      return apiGet(`/risk?${params.toString()}`, parseRisk, { signal });
    },
  });
}

/** The learn page's VaR and ES on a lab source. */
export function useLabRisk(source: LabSource) {
  return useQuery({
    queryKey: ['lab-risk', source],
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
    queryFn: ({ signal }) => apiPost('/learn/risk', { source }, parseRisk, { signal }),
  });
}
