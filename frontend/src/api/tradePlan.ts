import { useQuery } from '@tanstack/react-query';

import { apiGet, fieldsOf, isRecord, type Schemas } from './client.ts';

/**
 * The Trade plan tool's numbers (P3 T1): from the history's own paths at today's volatility, the
 * chances of the entry, the target and the stop over the next h bars, the expected result in R,
 * an EV heat map and the walk-forward calibration.
 */

export interface PlanSummary {
  paths: number;
  pFill: number;
  pTarget: number;
  pStop: number;
  pNeither: number;
  pTargetBounds: [number, number];
  bars: number;
  evR: number;
  evReturn: number;
  lossR: number | null;
  kelly: number | null;
}

export interface PlanCalibration {
  n: number;
  forecast: (number | null)[];
  observed: (number | null)[];
  count: number[];
  brier: number;
  brierBase: number;
}

/** 'both': the deciding bar touched both levels (`actualR` is then the bridge's mean). */
export type Actual = 'target' | 'stop' | 'both' | 'neither' | 'open' | 'not_filled';

export interface TradePlan {
  side: 'long' | 'short';
  h: number;
  originTime: string | number;
  originClose: number;
  sigma: number;
  summary: PlanSummary | null;
  multiples: number[];
  heat: (number | null)[][];
  reference: number | null;
  calibration: PlanCalibration | null;
  actual: Actual | null;
  actualR: number | null;
}

const num = (v: unknown): number => (typeof v === 'number' ? v : Number.NaN);
const numOrNull = (v: unknown): number | null => (typeof v === 'number' ? v : null);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? (v as unknown[]) : []);
const ACTUALS: readonly Actual[] = ['target', 'stop', 'both', 'neither', 'open', 'not_filled'];

export function parseTradePlan(body: unknown): TradePlan {
  if (!isRecord(body)) throw new Error('Unexpected trade plan response');
  const f = fieldsOf<Schemas['TradePlanResponse']>(body);
  const s = f('summary');
  const c = f('calibration');
  const time = f('origin_time');
  let summary: PlanSummary | null = null;
  if (isRecord(s)) {
    const g = fieldsOf<Schemas['PlanSummary']>(s);
    const bounds = list(g('p_target_bounds')).map(num);
    summary = {
      paths: num(g('paths')),
      pFill: num(g('p_fill')),
      pTarget: num(g('p_target')),
      pStop: num(g('p_stop')),
      pNeither: num(g('p_neither')),
      pTargetBounds: [bounds[0] ?? Number.NaN, bounds[1] ?? Number.NaN],
      bars: num(g('bars')),
      evR: num(g('ev_r')),
      evReturn: num(g('ev_return')),
      lossR: numOrNull(g('loss_r')),
      kelly: numOrNull(g('kelly')),
    };
  }
  let calibration: PlanCalibration | null = null;
  if (isRecord(c)) {
    const g = fieldsOf<Schemas['Calibration']>(c);
    calibration = {
      n: num(g('n')),
      forecast: list(g('forecast')).map(numOrNull),
      observed: list(g('observed')).map(numOrNull),
      count: list(g('count')).map(num),
      brier: num(g('brier')),
      brierBase: num(g('brier_base')),
    };
  }
  const actual = f('actual');
  return {
    side: f('side') === 'short' ? 'short' : 'long',
    h: num(f('h')),
    originTime: typeof time === 'number' ? time : String(time),
    originClose: num(f('origin_close')),
    sigma: num(f('sigma')),
    summary,
    multiples: list(f('multiples')).map(num),
    heat: list(f('heat')).map((row) => list(row).map(numOrNull)),
    reference: numOrNull(f('reference')),
    calibration,
    actual: ACTUALS.find((a) => a === actual) ?? null,
    actualR: numOrNull(f('actual_r')),
  };
}

export interface TradePlanQuery {
  symbol: string;
  interval: string;
  adjusted: boolean;
  /** The entry anchor (UTC epoch seconds). */
  time: number;
  entry: number;
  target: number;
  stop: number;
  h: number;
  /** Replay cursor (a bar's open, UTC epoch seconds): no later bar; null = all. */
  cursor: number | null;
}

export function useTradePlan(query: TradePlanQuery | null) {
  return useQuery({
    queryKey: ['trade-plan', query],
    enabled: query !== null,
    staleTime: 60_000,
    queryFn: ({ signal }) => {
      if (query === null) throw new Error('no trade plan query');
      const params = new URLSearchParams({
        symbol: query.symbol,
        interval: query.interval,
        adjusted: String(query.adjusted),
        time: String(query.time),
        entry: String(query.entry),
        target: String(query.target),
        stop: String(query.stop),
        h: String(query.h),
      });
      if (query.cursor !== null) params.set('cursor', String(query.cursor));
      return apiGet(`/trade-plan?${params.toString()}`, parseTradePlan, { signal });
    },
  });
}
