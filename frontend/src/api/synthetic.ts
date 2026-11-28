import { keepPreviousData, type QueryClient, skipToken, useQuery } from '@tanstack/react-query';

import { apiDelete, apiGet, apiPost, apiPut, fieldsOf, isRecord, type Schemas } from './client.ts';
import { SCENARIOS, type Scenario } from './lab.ts';
import type { SymbolInfo } from './market.ts';

/** Synthetic symbols (Phase K, ADR 0031 to 0034): invented series served like market data. */

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
}

/** Every kind but a shuffled copy (which starts at its source's first price). */
interface Priced {
  firstPrice: number;
}

/** A lab scenario (K0). */
export interface ScenarioDefinition extends Common, Priced {
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
export interface DwellingDefinition extends Common, Priced {
  kind: 'dwelling';
  series: DwellingSeries;
  /** The noise's daily standard deviation, % (0 to 5). */
  noisePct: number;
  /** Held from each value's assumed publication instead of interpolated between month dates. */
  causal: boolean;
  lagMonths: number;
}

/** The families of a parametric symbol's daily shocks (K2), standardised to mean 0, variance 1. */
export const DISTRIBUTIONS = [
  { id: 'normal', label: 'Normal', hint: 'The bell curve: thin tails, a 4-sigma day is rare.' },
  {
    id: 'student_t',
    label: 'Student-t (fat tails)',
    hint: 'Fat tails: big days far more often; the fewer degrees of freedom, the fatter.',
  },
  {
    id: 'uniform',
    label: 'Uniform (no tails)',
    hint: 'Every return in a band equally likely, nothing beyond it.',
  },
  {
    id: 'laplace',
    label: 'Laplace (sharp peak)',
    hint: 'Many quiet days around a sharp peak, and exponential tails.',
  },
  {
    id: 'skew_normal',
    label: 'Skew-normal',
    hint: 'Lopsided: a negative skew gives rare deep falls and frequent small rises.',
  },
] as const;
export type Distribution = (typeof DISTRIBUTIONS)[number]['id'];

/** A parametric symbol's daily return (K2): its family, its yearly mean and volatility, and the
 *  layers on top. Percentages as typed (7 = 7 %). */
export interface ReturnShape {
  meanPct: number;
  volPct: number;
  distribution: Distribution;
  df: number;
  skew: number;
  /** The path's own mean and standard deviation are the targets (else the distribution's). */
  exact: boolean;
  memory: number;
  jumpsPerYear: number;
  jumpMeanPct: number;
  jumpSdPct: number;
  garchAlpha: number;
  garchBeta: number;
}

/** Drawn from the user's statistics (K2). */
export interface ParametricDefinition extends Common, Priced, ReturnShape {
  kind: 'parametric';
  /** 'YYYY-MM-DD' */
  firstDate: string;
  bars: number;
  currency: Currency;
}

/** A market symbol's bars in another order (K3): blocks of `blockDays` permuted, on its dates. */
export interface ShuffleDefinition extends Common {
  kind: 'shuffle';
  source: string;
  /** 'YYYY-MM-DD', or '' until the source's range is known. */
  start: string;
  end: string;
  blockDays: number;
}

export type SyntheticDefinition =
  ScenarioDefinition | DwellingDefinition | ParametricDefinition | ShuffleDefinition;

/** A path's sequence (the shuffle preview), in %. */
export interface Sequence {
  totalReturnPct: number;
  maxDrawdownPct: number;
  worstYear: number;
  worstYearPct: number;
  longestLosingStreak: number;
}

/** What a shuffled copy draws (POST /api/synthetic/shuffle/preview). */
export interface ShufflePreview {
  start: string;
  end: string;
  bars: number;
  blocks: number;
  dates: string[];
  sourceClose: number[];
  copyClose: number[];
  sourceMeasures: Sequence;
  copyMeasures: Sequence;
}

/** What the dialog's preview shows (POST /api/synthetic/preview). */
export interface ReturnPreview {
  edges: number[];
  counts: number[];
  curveX: number[];
  curveCounts: number[];
  meanPct: number;
  volPct: number;
  skewness: number;
  excessKurtosis: number;
  /** null: none (a Student-t with 3 degrees of freedom or fewer). */
  familySkewness: number | null;
  /** null: infinite (a Student-t with 4 degrees of freedom or fewer). */
  familyExcessKurtosis: number | null;
  floored: number;
}

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
  };
  if (body['kind'] === 'shuffle') {
    const def = fieldsOf<Schemas['ShuffleDefinition']>(body);
    return {
      ...common,
      kind: 'shuffle',
      source: str(def('source'), 'source'),
      start: str(def('start'), 'start'),
      end: str(def('end'), 'end'),
      blockDays: num(def('block_days'), 'block_days'),
    };
  }
  const firstPrice = num(body['first_price'], 'first_price');
  if (body['kind'] === 'parametric') {
    const def = fieldsOf<Schemas['ParametricDefinition']>(body);
    const distribution = def('distribution');
    if (!DISTRIBUTIONS.some((d) => d.id === distribution)) {
      throw new Error(`Unknown distribution ${String(distribution)}`);
    }
    return {
      ...common,
      firstPrice,
      kind: 'parametric',
      firstDate: str(def('first_date'), 'first_date'),
      bars: num(def('bars'), 'bars'),
      currency: def('currency') === 'USD' ? 'USD' : 'ILS',
      meanPct: num(def('mean_pct'), 'mean_pct'),
      volPct: num(def('vol_pct'), 'vol_pct'),
      distribution: distribution as Distribution,
      df: num(def('df'), 'df'),
      skew: num(def('skew'), 'skew'),
      exact: def('exact') === true,
      memory: num(def('memory'), 'memory'),
      jumpsPerYear: num(def('jumps_per_year'), 'jumps_per_year'),
      jumpMeanPct: num(def('jump_mean_pct'), 'jump_mean_pct'),
      jumpSdPct: num(def('jump_sd_pct'), 'jump_sd_pct'),
      garchAlpha: num(def('garch_alpha'), 'garch_alpha'),
      garchBeta: num(def('garch_beta'), 'garch_beta'),
    };
  }
  if (body['kind'] === 'dwelling') {
    const def = fieldsOf<Schemas['DwellingDefinition']>(body);
    const series = def('series');
    if (!isDwellingSeries(series)) throw new Error(`Unknown dwelling series ${String(series)}`);
    return {
      ...common,
      firstPrice,
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
    firstPrice,
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

function shapeToWire(shape: ReturnShape) {
  return {
    mean_pct: shape.meanPct,
    vol_pct: shape.volPct,
    distribution: shape.distribution,
    df: shape.df,
    skew: shape.skew,
    exact: shape.exact,
    memory: shape.memory,
    jumps_per_year: shape.jumpsPerYear,
    jump_mean_pct: shape.jumpMeanPct,
    jump_sd_pct: shape.jumpSdPct,
    garch_alpha: shape.garchAlpha,
    garch_beta: shape.garchBeta,
  };
}

function toWire(
  def: SyntheticDefinition,
):
  | Schemas['ScenarioDefinition']
  | Schemas['DwellingDefinition']
  | Schemas['ParametricDefinition']
  | Schemas['ShuffleDefinition'] {
  const common = { name: def.name, full_name: def.fullName, seed: def.seed };
  switch (def.kind) {
    case 'scenario':
      return {
        ...common,
        first_price: def.firstPrice,
        kind: 'scenario',
        scenario: def.scenario,
        first_date: def.firstDate,
        bars: def.bars,
        currency: def.currency,
      };
    case 'dwelling':
      return {
        ...common,
        first_price: def.firstPrice,
        kind: 'dwelling',
        series: def.series,
        noise_pct: def.noisePct,
        causal: def.causal,
        lag_months: def.lagMonths,
      };
    case 'parametric':
      return {
        ...common,
        ...shapeToWire(def),
        first_price: def.firstPrice,
        kind: 'parametric',
        first_date: def.firstDate,
        bars: def.bars,
        currency: def.currency,
      };
    case 'shuffle':
      return {
        ...common,
        kind: 'shuffle',
        source: def.source,
        start: def.start,
        end: def.end,
        block_days: def.blockDays,
        // Set by the server from the source when it is saved.
        currency: 'USD',
        has_volume: true,
        decimals: 2,
      };
    default: {
      const never: never = def;
      throw new Error(`Unknown kind ${String(never)}`);
    }
  }
}

function parseSequence(body: unknown): Sequence {
  if (!isRecord(body)) throw new Error('Unexpected sequence');
  const field = fieldsOf<Schemas['SequenceOut']>(body);
  return {
    totalReturnPct: num(field('total_return_pct'), 'total_return_pct'),
    maxDrawdownPct: num(field('max_drawdown_pct'), 'max_drawdown_pct'),
    worstYear: num(field('worst_year'), 'worst_year'),
    worstYearPct: num(field('worst_year_pct'), 'worst_year_pct'),
    longestLosingStreak: num(field('longest_losing_streak'), 'longest_losing_streak'),
  };
}

function parseShufflePreview(body: unknown): ShufflePreview {
  if (!isRecord(body)) throw new Error('Unexpected shuffle preview response');
  const field = fieldsOf<Schemas['ShufflePreviewOut']>(body);
  const numbers = (value: unknown) =>
    Array.isArray(value) ? value.filter((x): x is number => typeof x === 'number') : [];
  return {
    start: str(field('start'), 'start'),
    end: str(field('end'), 'end'),
    bars: num(field('bars'), 'bars'),
    blocks: num(field('blocks'), 'blocks'),
    dates: strings(field('dates')),
    sourceClose: numbers(field('source_close')),
    copyClose: numbers(field('copy_close')),
    sourceMeasures: parseSequence(field('source_measures')),
    copyMeasures: parseSequence(field('copy_measures')),
  };
}

/** A shuffled copy's preview request; null dates ask for the source's whole range. */
export interface ShuffleRequest {
  source: string;
  start: string | null;
  end: string | null;
  blockDays: number;
  seed: number;
}

function shuffleQuery(request: ShuffleRequest) {
  const body = {
    source: request.source,
    start: request.start,
    end: request.end,
    block_days: request.blockDays,
    seed: request.seed,
  } satisfies Schemas['ShufflePreviewRequest'];
  return {
    queryKey: ['shufflePreview', body],
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      apiPost('/synthetic/shuffle/preview', body, parseShufflePreview, { signal }),
    staleTime: Infinity,
  };
}

/** The source against a shuffled copy, and their sequences (none for null); the last preview
 *  stays while the next one loads. */
export function useShufflePreview(request: ShuffleRequest | null) {
  const query = request === null ? null : shuffleQuery(request);
  return useQuery({
    queryKey: query?.queryKey ?? ['shufflePreview', null],
    queryFn: query?.queryFn ?? skipToken,
    placeholderData: keepPreviousData,
    staleTime: Infinity,
  });
}

/** A source's whole range (from 1970 to its last bar before today), from the same preview. */
export function fetchShuffleRange(
  client: QueryClient,
  request: Omit<ShuffleRequest, 'start' | 'end'>,
): Promise<ShufflePreview> {
  return client.query(shuffleQuery({ ...request, start: null, end: null }));
}

function parsePreview(body: unknown): ReturnPreview {
  if (!isRecord(body)) throw new Error('Unexpected preview response');
  const field = fieldsOf<Schemas['PreviewOut']>(body);
  const numbers = (value: unknown) =>
    Array.isArray(value) ? value.filter((x): x is number => typeof x === 'number') : [];
  const optional = (value: unknown) => (typeof value === 'number' ? value : null);
  return {
    edges: numbers(field('edges')),
    counts: numbers(field('counts')),
    curveX: numbers(field('curve_x')),
    curveCounts: numbers(field('curve_counts')),
    meanPct: num(field('mean_pct'), 'mean_pct'),
    volPct: num(field('vol_pct'), 'vol_pct'),
    skewness: num(field('skewness'), 'skewness'),
    excessKurtosis: num(field('excess_kurtosis'), 'excess_kurtosis'),
    familySkewness: optional(field('family_skewness')),
    familyExcessKurtosis: optional(field('family_excess_kurtosis')),
    floored: num(field('floored'), 'floored'),
  };
}

/** What a parametric symbol with these statistics, seed and length draws (none for null); the
 *  last preview stays while the next one loads. */
export function useReturnPreview(def: ParametricDefinition | null) {
  const body =
    def === null
      ? null
      : ({
          ...shapeToWire(def),
          seed: def.seed,
          bars: def.bars,
        } satisfies Schemas['PreviewRequest']);
  return useQuery({
    queryKey: ['syntheticPreview', body],
    queryFn:
      body === null
        ? skipToken
        : ({ signal }) => apiPost('/synthetic/preview', body, parsePreview, { signal }),
    placeholderData: keepPreviousData,
    staleTime: Infinity,
  });
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
