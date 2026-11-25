import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { apiGet, apiPost, fieldsOf, isRecord, type Schemas } from './client.ts';
import type { LabSource } from './lab.ts';
import { keepsPrevious } from './replayPlaceholder.ts';

/**
 * The market regime (P3 G1, ADR 0014): the variance ratios and the Chow-Denning test with its
 * wild-bootstrap p-value, DFA Hurst and MF-DFA, the regime x volatility map, and the event study
 * of trend and reversion rules by regime.
 */

export type RegimeLabel = 'trend' | 'random' | 'reversion';

export interface RegimeRule {
  rule: string;
  family: 'trend' | 'reversion';
  regime: RegimeLabel;
  n: number;
  mean: number;
  edge: number;
  t: number | null;
  hitRate: number;
}

export interface Spectrum {
  qs: number[];
  h: (number | null)[];
  width: number | null;
}

export interface Regime {
  symbol: string;
  lastTime: string | number;
  window: number;
  ratios: { q: number; vr: number; z: number | null }[];
  cd: number;
  pBootstrap: number;
  pAsymptotic: number;
  hurstWindow: number | null;
  hurstNull: [number, number];
  hurstHistory: number | null;
  spectrumWindow: Spectrum | null;
  spectrumHistory: Spectrum | null;
  label: RegimeLabel;
  highVolatility: boolean | null;
  cells: { regime: RegimeLabel; highVolatility: boolean; share: number }[];
  forward: number;
  rules: RegimeRule[];
}

const num = (v: unknown): number => (typeof v === 'number' ? v : Number.NaN);
const numOrNull = (v: unknown): number | null => (typeof v === 'number' ? v : null);
const records = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? (v as unknown[]).filter(isRecord) : [];
const list = (v: unknown): unknown[] => (Array.isArray(v) ? (v as unknown[]) : []);
const LABELS: readonly RegimeLabel[] = ['trend', 'random', 'reversion'];
const label = (v: unknown): RegimeLabel => LABELS.find((l) => l === v) ?? 'random';

function spectrum(v: unknown): Spectrum | null {
  if (!isRecord(v)) return null;
  const g = fieldsOf<Schemas['RegimeSpectrum']>(v);
  return {
    qs: list(g('qs')).map(num),
    h: list(g('h')).map(numOrNull),
    width: numOrNull(g('width')),
  };
}

export function parseRegime(body: unknown): Regime {
  if (!isRecord(body)) throw new Error('Unexpected regime response');
  const f = fieldsOf<Schemas['RegimeResponse']>(body);
  const last = f('last_time');
  const band = list(f('hurst_null')).map(num);
  const high = f('high_volatility');
  return {
    symbol: String(f('symbol')),
    lastTime: typeof last === 'number' ? last : String(last),
    window: num(f('window')),
    ratios: records(f('ratios')).map((item) => {
      const g = fieldsOf<Schemas['RegimeRatio']>(item);
      return { q: num(g('q')), vr: num(g('vr')), z: numOrNull(g('z')) };
    }),
    cd: num(f('cd')),
    pBootstrap: num(f('p_bootstrap')),
    pAsymptotic: num(f('p_asymptotic')),
    hurstWindow: numOrNull(f('hurst_window')),
    hurstNull: [band[0] ?? Number.NaN, band[1] ?? Number.NaN],
    hurstHistory: numOrNull(f('hurst_history')),
    spectrumWindow: spectrum(f('spectrum_window')),
    spectrumHistory: spectrum(f('spectrum_history')),
    label: label(f('label')),
    highVolatility: typeof high === 'boolean' ? high : null,
    cells: records(f('cells')).map((item) => {
      const g = fieldsOf<Schemas['RegimeCell']>(item);
      return {
        regime: label(g('regime')),
        highVolatility: g('high_volatility') === true,
        share: num(g('share')),
      };
    }),
    forward: num(f('forward')),
    rules: records(f('rules')).map((item) => {
      const g = fieldsOf<Schemas['RegimeRule']>(item);
      return {
        rule: String(g('rule')),
        family: g('family') === 'trend' ? 'trend' : 'reversion',
        regime: label(g('regime')),
        n: num(g('n')),
        mean: num(g('mean')),
        edge: num(g('edge')),
        t: numOrNull(g('t')),
        hitRate: num(g('hit_rate')),
      };
    }),
  };
}

export interface RegimeQuery {
  symbol: string;
  interval: string;
  adjusted: boolean;
  /** At this bar (its open, UTC epoch seconds): the replay cursor; null = the last bar. */
  origin: number | null;
}

/** The chart's regime; during a replay the last result stays while the next loads. */
export function useRegime(query: RegimeQuery | null) {
  return useQuery({
    queryKey: ['regime', query],
    enabled: query !== null,
    staleTime: 60_000,
    placeholderData: (previous: Regime | undefined, previousQuery) =>
      query !== null &&
      keepsPrevious((previousQuery?.queryKey[1] ?? null) as RegimeQuery | null, query)
        ? previous
        : undefined,
    queryFn: ({ signal }) => {
      if (query === null) throw new Error('no regime query');
      const params = new URLSearchParams({
        symbol: query.symbol,
        interval: query.interval,
        adjusted: String(query.adjusted),
      });
      if (query.origin !== null) params.set('origin', String(query.origin));
      return apiGet(`/regime?${params.toString()}`, parseRegime, { signal });
    },
  });
}

/** The learn page's regime on a lab source. */
export function useLabRegime(source: LabSource) {
  return useQuery({
    queryKey: ['lab-regime', source],
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
    queryFn: ({ signal }) => apiPost('/learn/regime', { source }, parseRegime, { signal }),
  });
}
