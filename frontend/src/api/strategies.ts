import { useQuery } from '@tanstack/react-query';

import { isInterval, type Interval } from './bars.ts';
import { apiDelete, apiGet, apiPost, apiPut, fieldsOf, isRecord, type Schemas } from './client.ts';

/**
 * Trader profiles, strategies and their signals (P4 B0, ADR 0036). A strategy goes to the backend
 * as it came (the backend validates it); here it is only checked to be a rules or Python strategy.
 */

export type ProfileId = Schemas['ProfileId'];
export type RulesStrategy = Schemas['RulesStrategy'];
export type PythonStrategy = Schemas['PythonStrategy'];
export type Strategy = RulesStrategy | PythonStrategy;
export type Condition = Schemas['Condition'];
export type Operand = Schemas['Operand'];

export interface TraderProfile {
  id: ProfileId;
  label: string;
  description: string;
  decisionIntervals: Interval[];
  contextIntervals: string[];
  capPeriod: string;
  defaultMaxTrades: number;
  overnight: boolean;
}

export interface PythonParam {
  name: string;
  type: string;
  default: number | boolean;
  label: string;
  min: number | null;
  max: number | null;
}

export interface PythonFile {
  module: string;
  description: string;
  params: PythonParam[];
  error: string | null;
}

export interface SavedStrategy {
  name: string;
  revision: number;
  kind: string;
  profile: string;
}

export interface StrategyCatalog {
  saved: SavedStrategy[];
  examples: { name: string; strategy: Strategy }[];
  python: PythonFile[];
}

export const SIGNAL_KINDS = [
  'long_entry',
  'long_exit',
  'short_entry',
  'short_exit',
  'conflict',
] as const;
export type SignalKind = (typeof SIGNAL_KINDS)[number];

export interface Signals {
  symbol: string;
  interval: string;
  bars: number;
  /** Bar times (as in /api/bars) per signal. */
  times: Record<SignalKind, (string | number)[]>;
}

const list = (v: unknown): unknown[] => (Array.isArray(v) ? (v as unknown[]) : []);
const records = (v: unknown) => list(v).filter(isRecord);
const strings = (v: unknown) => list(v).map(String);
const numOrNull = (v: unknown): number | null => (typeof v === 'number' ? v : null);
const PROFILE_IDS: readonly ProfileId[] = ['day', 'swing', 'position', 'long_term'];
const profileId = (v: unknown): ProfileId => PROFILE_IDS.find((p) => p === v) ?? 'position';

export function parseStrategy(v: unknown): Strategy {
  if (!isRecord(v) || (v['kind'] !== 'rules' && v['kind'] !== 'python')) {
    throw new Error('Unexpected strategy');
  }
  // The backend validated it and validates it again when it comes back.
  return v as unknown as Strategy;
}

export function parseProfiles(body: unknown): TraderProfile[] {
  return records(body).map((item) => {
    const f = fieldsOf<Schemas['TraderProfile']>(item);
    return {
      id: profileId(f('id')),
      label: String(f('label')),
      description: String(f('description')),
      decisionIntervals: strings(f('decision_intervals')).filter(isInterval),
      contextIntervals: strings(f('context_intervals')),
      capPeriod: String(f('cap_period')),
      defaultMaxTrades: Number(f('default_max_trades')),
      overnight: f('overnight') === true,
    };
  });
}

export function parseCatalog(body: unknown): StrategyCatalog {
  if (!isRecord(body)) throw new Error('Unexpected /api/strategies response');
  const f = fieldsOf<Schemas['StrategyCatalog']>(body);
  return {
    saved: records(f('saved')).map((item) => {
      const g = fieldsOf<Schemas['StrategySummary']>(item);
      return {
        name: String(g('name')),
        revision: Number(g('revision')),
        kind: String(g('kind')),
        profile: String(g('profile')),
      };
    }),
    examples: records(f('examples')).map((item) => ({
      name: String(item['name']),
      strategy: parseStrategy(item['strategy']),
    })),
    python: records(f('python')).map((item) => {
      const g = fieldsOf<Schemas['PythonFile']>(item);
      const error = g('error');
      return {
        module: String(g('module')),
        description: String(g('description')),
        error: typeof error === 'string' ? error : null,
        params: records(g('params')).map((p) => {
          const h = fieldsOf<Schemas['PythonParam']>(p);
          const value = h('default');
          return {
            name: String(h('name')),
            type: String(h('type')),
            default: typeof value === 'boolean' ? value : Number(value),
            label: String(h('label')),
            min: numOrNull(h('min')),
            max: numOrNull(h('max')),
          };
        }),
      };
    }),
  };
}

export function parseSignals(body: unknown): Signals {
  if (!isRecord(body)) throw new Error('Unexpected signals response');
  const f = fieldsOf<Schemas['SignalsResponse']>(body);
  const times = (key: SignalKind) =>
    list(f(key)).map((t) => (typeof t === 'number' ? t : String(t)));
  return {
    symbol: String(f('symbol')),
    interval: String(f('interval')),
    bars: Number(f('bars')),
    times: {
      long_entry: times('long_entry'),
      long_exit: times('long_exit'),
      short_entry: times('short_entry'),
      short_exit: times('short_exit'),
      conflict: times('conflict'),
    },
  };
}

export const useProfiles = () =>
  useQuery({
    queryKey: ['strategy-profiles'],
    queryFn: () => apiGet('/strategies/profiles', parseProfiles),
    staleTime: Infinity,
  });

export const useStrategyCatalog = () =>
  useQuery({
    queryKey: ['strategies'],
    queryFn: () => apiGet('/strategies', parseCatalog),
    staleTime: 10_000,
  });

const path = (name: string) => `/strategies/${encodeURIComponent(name)}`;

export const fetchStrategy = (name: string) =>
  apiGet(path(name), (body) => {
    if (!isRecord(body)) throw new Error('Unexpected strategy response');
    return { revision: Number(body['revision']), strategy: parseStrategy(body['strategy']) };
  });

/** Save on top of `revision` (0 = new); resolves to the new revision. */
export const saveStrategy = (name: string, revision: number, strategy: Strategy) =>
  apiPut(path(name), { revision, strategy }, (body) =>
    isRecord(body) ? Number(body['revision']) : 0,
  );

export const deleteStrategy = (name: string, revision: number) => apiDelete(path(name), revision);

export interface SignalsQuery {
  symbol: string;
  interval: string;
  strategy: Strategy;
}

/** The strategy's signals on the chart's symbol (the whole history; the chart shows its bars). */
export function useSignals(query: SignalsQuery | null) {
  return useQuery({
    queryKey: ['strategy-signals', query],
    enabled: query !== null,
    staleTime: 60_000,
    retry: false,
    queryFn: () => apiPost('/strategies/signals', query, parseSignals),
  });
}
