import { apiDelete, apiGet, apiPut, fieldsOf, isRecord, type Schemas } from './client.ts';
import { SCENARIOS, type Scenario } from './lab.ts';
import type { SymbolInfo } from './market.ts';

/** Synthetic symbols (Phase K, ADR 0031): invented series served like market data. */

export const SYNTHETIC_PREFIX = 'SYN:';
/** The part after `SYN:`: a letter, then letters, digits, `.`, `-` or `_` (12 at most). */
export const NAME_PATTERN = /^[A-Z][A-Z0-9._-]{0,11}$/;
export const MIN_BARS = 100;
export const MAX_BARS = 10_000;

export type Currency = 'USD' | 'ILS';

export interface SyntheticDefinition {
  name: string;
  fullName: string;
  scenario: Scenario;
  seed: number;
  /** 'YYYY-MM-DD' */
  firstDate: string;
  firstPrice: number;
  bars: number;
  currency: Currency;
}

export interface SyntheticSymbol {
  symbol: string;
  revision: number;
  lastDate: string;
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

export function parseSynthetic(body: unknown): SyntheticSymbol {
  if (!isRecord(body) || !isRecord(body['definition'])) {
    throw new Error('Unexpected synthetic symbol response');
  }
  const field = fieldsOf<Schemas['SyntheticOut']>(body);
  const def = fieldsOf<Schemas['ScenarioDefinition']>(body['definition']);
  const scenario = def('scenario');
  if (!isScenario(scenario)) throw new Error(`Unknown scenario ${String(scenario)}`);
  return {
    symbol: str(field('symbol'), 'symbol'),
    revision: num(field('revision'), 'revision'),
    lastDate: str(field('last_date'), 'last_date'),
    definition: {
      name: str(def('name'), 'name'),
      fullName: str(def('full_name'), 'full_name'),
      scenario,
      seed: num(def('seed'), 'seed'),
      firstDate: str(def('first_date'), 'first_date'),
      firstPrice: num(def('first_price'), 'first_price'),
      bars: num(def('bars'), 'bars'),
      currency: def('currency') === 'USD' ? 'USD' : 'ILS',
    },
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

/** Create (revision 0) or edit in place. */
export function saveSynthetic(
  definition: SyntheticDefinition,
  revision: number,
): Promise<SyntheticSymbol> {
  const body = {
    revision,
    definition: {
      kind: 'scenario',
      name: definition.name,
      full_name: definition.fullName,
      scenario: definition.scenario,
      seed: definition.seed,
      first_date: definition.firstDate,
      first_price: definition.firstPrice,
      bars: definition.bars,
      currency: definition.currency,
    } satisfies Schemas['ScenarioDefinition'],
  };
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
