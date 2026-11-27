import { apiDelete, apiGet, apiPut, fieldsOf, isRecord, type Schemas } from './client.ts';
import { SCENARIOS, type Scenario } from './lab.ts';
import type { SymbolInfo } from './market.ts';

/** Synthetic symbols (Phase K, ADR 0031, 0032): invented series served like market data. */

export const SYNTHETIC_PREFIX = 'SYN:';
/** The part after `SYN:`: a letter, then letters, digits, `.`, `-` or `_` (12 at most). */
export const NAME_PATTERN = /^[A-Z][A-Z0-9._-]{0,11}$/;
export const MIN_BARS = 100;
export const MAX_BARS = 10_000;

export type Currency = 'USD' | 'ILS';

interface Common {
  name: string;
  fullName: string;
  seed: number;
  firstPrice: number;
}

/** A lab scenario (K0). */
export interface ScenarioDefinition extends Common {
  kind: 'scenario';
  scenario: Scenario;
  /** 'YYYY-MM-DD' */
  firstDate: string;
  bars: number;
  currency: Currency;
}

/** The CBS dwelling price indexes (K1): the national one and the districts (from 2017-10). */
export const DWELLING_SERIES = [
  { id: 'dwelling', label: 'Israel (from 1994)' },
  { id: 'dwelling_telaviv', label: 'Tel Aviv district' },
  { id: 'dwelling_center', label: 'Center district' },
  { id: 'dwelling_haifa', label: 'Haifa district' },
  { id: 'dwelling_jerusalem', label: 'Jerusalem district' },
  { id: 'dwelling_north', label: 'North district' },
  { id: 'dwelling_south', label: 'South district' },
] as const;
export type DwellingSeries = (typeof DWELLING_SERIES)[number]['id'];

/** A dwelling price index as the close (K1); prices in shekels, no volume. */
export interface DwellingDefinition extends Common {
  kind: 'dwelling';
  series: DwellingSeries;
  /** The noise's daily standard deviation, % (0 to 5). */
  noisePct: number;
  /** Held from each value's assumed publication instead of interpolated between month dates. */
  causal: boolean;
  lagMonths: number;
}

export type SyntheticDefinition = ScenarioDefinition | DwellingDefinition;

export interface SyntheticSymbol {
  symbol: string;
  revision: number;
  definition: SyntheticDefinition;
}

export interface SyntheticReferences {
  layouts: string[];
  comparedIn: string[];
  watchlists: string[];
  drawings: number;
  scenarios: string[];
}

/** The one test of whether a symbol is synthetic (not market data). */
export function isSynthetic(info: Pick<SymbolInfo, 'type'> | undefined): boolean {
  return info?.type === 'synthetic';
}

const path = (symbol: string) => `/synthetic/${encodeURIComponent(symbol)}`;

function str(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`Expected string for ${field}`);
  return value;
}

function num(value: unknown, field: string): number {
  if (typeof value !== 'number') throw new Error(`Expected number for ${field}`);
  return value;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : [];
}

function isScenario(value: unknown): value is Scenario {
  return SCENARIOS.some((s) => s.id === value);
}

function isDwellingSeries(value: unknown): value is DwellingSeries {
  return DWELLING_SERIES.some((s) => s.id === value);
}

function parseDefinition(body: Record<string, unknown>): SyntheticDefinition {
  const common = {
    name: str(body['name'], 'name'),
    fullName: str(body['full_name'], 'full_name'),
    seed: num(body['seed'], 'seed'),
    firstPrice: num(body['first_price'], 'first_price'),
  };
  if (body['kind'] === 'dwelling') {
    const def = fieldsOf<Schemas['DwellingDefinition']>(body);
    const series = def('series');
    if (!isDwellingSeries(series)) throw new Error(`Unknown dwelling series ${String(series)}`);
    return {
      ...common,
      kind: 'dwelling',
      series,
      noisePct: num(def('noise_pct'), 'noise_pct'),
      causal: def('causal') === true,
      lagMonths: num(def('lag_months'), 'lag_months'),
    };
  }
  const def = fieldsOf<Schemas['ScenarioDefinition']>(body);
  const scenario = def('scenario');
  if (!isScenario(scenario)) throw new Error(`Unknown scenario ${String(scenario)}`);
  return {
    ...common,
    kind: 'scenario',
    scenario,
    firstDate: str(def('first_date'), 'first_date'),
    bars: num(def('bars'), 'bars'),
    currency: def('currency') === 'USD' ? 'USD' : 'ILS',
  };
}

export function parseSynthetic(body: unknown): SyntheticSymbol {
  if (!isRecord(body) || !isRecord(body['definition'])) {
    throw new Error('Unexpected synthetic symbol response');
  }
  const field = fieldsOf<Schemas['SyntheticOut']>(body);
  return {
    symbol: str(field('symbol'), 'symbol'),
    revision: num(field('revision'), 'revision'),
    definition: parseDefinition(body['definition']),
  };
}

export function parseReferences(body: unknown): SyntheticReferences {
  if (!isRecord(body)) throw new Error('Unexpected references response');
  const field = fieldsOf<Schemas['SyntheticReferences']>(body);
  return {
    layouts: strings(field('layouts')),
    comparedIn: strings(field('compared_in')),
    watchlists: strings(field('watchlists')),
    drawings: typeof field('drawings') === 'number' ? (field('drawings') as number) : 0,
    scenarios: strings(field('scenarios')),
  };
}

export function getSynthetic(symbol: string, signal?: AbortSignal): Promise<SyntheticSymbol> {
  return apiGet(path(symbol), parseSynthetic, { signal: signal ?? null });
}

export function getReferences(symbol: string): Promise<SyntheticReferences> {
  return apiGet(`${path(symbol)}/references`, parseReferences);
}

function toWire(
  def: SyntheticDefinition,
): Schemas['ScenarioDefinition'] | Schemas['DwellingDefinition'] {
  const common = {
    name: def.name,
    full_name: def.fullName,
    seed: def.seed,
    first_price: def.firstPrice,
  };
  return def.kind === 'dwelling'
    ? {
        ...common,
        kind: 'dwelling',
        series: def.series,
        noise_pct: def.noisePct,
        causal: def.causal,
        lag_months: def.lagMonths,
      }
    : {
        ...common,
        kind: 'scenario',
        scenario: def.scenario,
        first_date: def.firstDate,
        bars: def.bars,
        currency: def.currency,
      };
}

/** Create (revision 0) or edit in place. */
export function saveSynthetic(
  definition: SyntheticDefinition,
  revision: number,
): Promise<SyntheticSymbol> {
  const body = { revision, definition: toWire(definition) };
  return apiPut(path(SYNTHETIC_PREFIX + definition.name), body, parseSynthetic);
}

export function deleteSynthetic(symbol: string, revision: number): Promise<void> {
  return apiDelete(path(symbol), revision);
}

/** References in one line, e.g. "layout Chart, watchlist W, 2 drawings"; '' when none. */
export function describeReferences(refs: SyntheticReferences): string {
  const named = (one: string, names: string[]) =>
    names.length === 0 ? [] : [`${one}${names.length > 1 ? 's' : ''} ${names.join(', ')}`];
  return [
    ...named('layout', refs.layouts),
    ...named('compared in layout', refs.comparedIn),
    ...named('watchlist', refs.watchlists),
    ...(refs.drawings > 0
      ? [`${String(refs.drawings)} drawing${refs.drawings > 1 ? 's' : ''}`]
      : []),
    ...named('Planner scenario', refs.scenarios),
  ].join('; ');
}
