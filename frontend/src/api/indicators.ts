/**
 * Indicator registry (GET /api/indicators) and values (POST /api/indicators/compute).
 * The whole indicator UI is generated from the registry, so adding an indicator needs no change here.
 */
import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query';

import type { Bar, Interval } from './bars.ts';
import type { BarTransform } from '../chart/chartTypes.ts';
import { barSeconds } from '../chart/visibleRange.ts';
import { apiGet, apiPost, fieldsOf, isRecord, type Schemas } from './client.ts';

export type ParamValue = boolean | number | string;
export type Params = Record<string, ParamValue>;
export type ParamType = Schemas['ParamInfo']['type'];
export type IndicatorCategory = Schemas['IndicatorInfo']['category'];

export interface ParamInfo {
  name: string;
  type: ParamType;
  default: ParamValue;
  label: string;
  min: number | null;
  max: number | null;
  step: number | null;
  options: string[];
  /** Display names of `options` (same order and length). */
  optionLabels: string[];
  /** The bool / enum param that switches this one on (true, or not "none"); null = always on. */
  requires: string | null;
}

export interface OutputInfo {
  name: string;
  label: string;
  plot: Schemas['OutputInfo']['plot'];
  color: string;
  lineWidth: number;
  /** Extra colours by role, e.g. markers' `up` / `down`. */
  style: Record<string, string>;
  /** As `ParamInfo.requires`: the line exists only while that param switches it on. */
  requires: string | null;
}

export interface IndicatorInfo {
  id: string;
  version: number;
  name: string;
  shortName: string;
  category: IndicatorCategory;
  overlay: boolean;
  params: ParamInfo[];
  outputs: OutputInfo[];
  levels: number[];
  /** Shade the band between these two levels in the indicator's pane (RSI 30–70), or null. */
  levelFill: readonly [number, number] | null;
  learnSlug: string;
  description: string;
}

export const CATEGORY_LABELS: Record<IndicatorCategory, string> = {
  moving_averages: 'Moving averages',
  bands: 'Bands & channels',
  oscillators: 'Oscillators',
  volatility: 'Volatility',
  volume: 'Volume',
  structure: 'Structure',
};

const PARAM_TYPES: readonly ParamType[] = ['int', 'float', 'bool', 'enum', 'source'];
const PLOTS: readonly OutputInfo['plot'][] = ['line', 'histogram', 'area', 'markers'];

function str(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`Expected string for ${field}`);
  return value;
}

function numOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isParamValue(value: unknown): value is ParamValue {
  return typeof value === 'boolean' || typeof value === 'string' || typeof value === 'number';
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? (value as unknown[]).filter((v): v is string => typeof v === 'string')
    : [];
}

function stringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
}

function parseParam(item: unknown): ParamInfo {
  if (!isRecord(item)) throw new Error('Unexpected indicator param');
  const field = fieldsOf<Schemas['ParamInfo']>(item);
  const type = field('type');
  const value = field('default');
  if (!PARAM_TYPES.includes(type as ParamType)) throw new Error('Unexpected param type');
  if (!isParamValue(value)) throw new Error('Unexpected param default');
  const options = strings(field('options'));
  const labels = strings(field('option_labels'));
  const requires = field('requires');
  return {
    name: str(field('name'), 'param name'),
    type: type as ParamType,
    default: value,
    label: str(field('label'), 'param label'),
    min: numOrNull(field('min')),
    max: numOrNull(field('max')),
    step: numOrNull(field('step')),
    options,
    optionLabels: labels.length === options.length ? labels : options,
    requires: typeof requires === 'string' ? requires : null,
  };
}

function parseOutput(item: unknown): OutputInfo {
  if (!isRecord(item)) throw new Error('Unexpected indicator output');
  const field = fieldsOf<Schemas['OutputInfo']>(item);
  const plot = field('plot');
  if (!PLOTS.includes(plot as OutputInfo['plot'])) throw new Error('Unexpected plot style');
  const width = field('line_width');
  const requires = field('requires');
  return {
    name: str(field('name'), 'output name'),
    label: str(field('label'), 'output label'),
    plot: plot as OutputInfo['plot'],
    color: str(field('color'), 'output color'),
    lineWidth: typeof width === 'number' ? width : 2,
    style: stringRecord(field('style')),
    requires: typeof requires === 'string' ? requires : null,
  };
}

export function parseIndicator(item: unknown): IndicatorInfo {
  if (!isRecord(item)) throw new Error('Unexpected indicator entry');
  const field = fieldsOf<Schemas['IndicatorInfo']>(item);
  const params = field('params');
  const outputs = field('outputs');
  const levels = field('levels');
  const fill = field('level_fill');
  if (!Array.isArray(params) || !Array.isArray(outputs)) throw new Error('Unexpected indicator');
  const category = str(field('category'), 'category');
  if (!(category in CATEGORY_LABELS)) throw new Error('Unexpected indicator category');
  return {
    id: str(field('id'), 'id'),
    version: Number(field('version')),
    name: str(field('name'), 'name'),
    shortName: str(field('short_name'), 'short_name'),
    category: category as IndicatorCategory,
    overlay: field('overlay') === true,
    params: (params as unknown[]).map(parseParam),
    outputs: (outputs as unknown[]).map(parseOutput),
    levels: Array.isArray(levels)
      ? (levels as unknown[]).filter((v): v is number => typeof v === 'number')
      : [],
    levelFill:
      Array.isArray(fill) && typeof fill[0] === 'number' && typeof fill[1] === 'number'
        ? [fill[0], fill[1]]
        : null,
    learnSlug: str(field('learn_slug'), 'learn_slug'),
    description: typeof field('description') === 'string' ? (field('description') as string) : '',
  };
}

export function parseIndicatorList(body: unknown): IndicatorInfo[] {
  if (!Array.isArray(body)) throw new Error('Unexpected /api/indicators response');
  return (body as unknown[]).map(parseIndicator);
}

/** The registry; it only changes when the backend is updated. */
export function useIndicatorList() {
  return useQuery({
    queryKey: ['indicators'],
    queryFn: ({ signal }) => apiGet('/indicators', parseIndicatorList, { signal }),
    staleTime: Infinity,
  });
}

/** `params` limited to the spec's parameters, defaults filling the gaps (old saved instances). */
export function effectiveParams(spec: IndicatorInfo, params: Params): Params {
  const out: Params = {};
  for (const p of spec.params) {
    const value = params[p.name];
    out[p.name] = value !== undefined && typeof value === typeof p.default ? value : p.default;
  }
  return out;
}

export function defaultParams(spec: IndicatorInfo): Params {
  return effectiveParams(spec, {});
}

/** Display name of an enum value ("SMMA (RMA)" for "smma"); the value itself if unknown. */
export function optionLabel(param: ParamInfo, value: string): string {
  return param.optionLabels[param.options.indexOf(value)] ?? value;
}

/** False while the param that switches `item` (a param or an output) on is off (false or "none"). */
export function isActive(
  spec: IndicatorInfo,
  item: { requires: string | null },
  params: Params,
): boolean {
  const switchParam = spec.params.find((p) => p.name === item.requires);
  if (switchParam === undefined) return true;
  const value = params[switchParam.name] ?? switchParam.default;
  return value !== false && value !== 'none' && isActive(spec, switchParam, params);
}

/** One input as the legend shows it, or null to leave it out. */
function shownValue(param: ParamInfo, value: ParamValue): string | null {
  const numeric = param.type === 'int' || param.type === 'float';
  // Numbers always show (except a zero offset); a source, type or switch only when changed.
  if (value === param.default && (!numeric || param.name === 'offset')) return null;
  if (value === 'none') return null;
  if (param.type === 'bool') return value === true ? param.label : null;
  if (param.type === 'enum' && typeof value === 'string') {
    // The short form: "HMA (Hull)" -> "HMA".
    return optionLabel(param, value).split(' ')[0] ?? value;
  }
  return String(value);
}

/**
 * Short legend label: "EMA 20", "EMA 20 hl2", "MACD 12 26 9", "MA Cross HMA 9 21": every number
 * (a non-zero offset too), and other inputs only when they differ from the default.
 */
export function instanceLabel(spec: IndicatorInfo, params: Params): string {
  const shown = spec.params
    .filter((p) => isActive(spec, p, params))
    .map((p) => shownValue(p, params[p.name] ?? p.default))
    .filter((text): text is string => text !== null);
  return [spec.shortName, ...shown].join(' ');
}

export interface ComputeData {
  id: string;
  params: Params;
  time: (string | number)[];
  outputs: Record<string, (number | null)[]>;
  warmup: number;
}

export function parseCompute(body: unknown): ComputeData {
  if (!isRecord(body)) throw new Error('Unexpected compute response');
  const field = fieldsOf<Schemas['ComputeResponse']>(body);
  const time = field('time');
  const outputs = field('outputs');
  const params = field('params');
  if (!Array.isArray(time) || !isRecord(outputs) || !isRecord(params)) {
    throw new Error('Unexpected compute response');
  }
  const parsed: Record<string, (number | null)[]> = {};
  for (const [name, values] of Object.entries(outputs)) {
    if (!Array.isArray(values) || values.length !== time.length) {
      throw new Error(`Unexpected values for output ${name}`);
    }
    parsed[name] = (values as unknown[]).map(numOrNull);
  }
  return {
    id: str(field('id'), 'id'),
    params: Object.fromEntries(Object.entries(params).filter(([, v]) => isParamValue(v))) as Params,
    time: (time as unknown[]).filter(
      (t): t is string | number => typeof t === 'string' || typeof t === 'number',
    ),
    outputs: parsed,
    warmup: Number(field('warmup')),
  };
}

/** Values of `data` placed on `bars` by time; bars the response does not cover get null. */
export function alignToBars(
  bars: readonly Bar[],
  data: ComputeData,
): Record<string, (number | null)[]> {
  const index = new Map<string | number, number>();
  data.time.forEach((t, i) => index.set(t, i));
  const at = bars.map((bar) => index.get(bar.time));
  const out: Record<string, (number | null)[]> = {};
  for (const [name, values] of Object.entries(data.outputs)) {
    out[name] = at.map((i) => (i === undefined ? null : (values[i] ?? null)));
  }
  return out;
}

export interface SeriesQuery {
  symbol: string;
  interval: Interval;
  adjusted: boolean;
  transform: BarTransform;
}

export interface ComputeRequestBody {
  symbol: string;
  interval: Interval;
  id: string;
  params: Params;
  start: number;
  end: number;
  adjusted: boolean;
  transform: BarTransform;
}

/** Values over exactly the loaded bars; the backend adds the warm-up history (lookback). */
export function computeBody(
  series: SeriesQuery,
  bars: readonly Bar[],
  id: string,
  params: Params,
): ComputeRequestBody | null {
  const first = bars[0];
  const last = bars[bars.length - 1];
  if (first === undefined || last === undefined) return null;
  return {
    ...series,
    id,
    params,
    start: barSeconds(first.time),
    end: barSeconds(last.time),
  };
}

export interface ComputeResult {
  data: ComputeData | undefined;
  error: Error | null;
  isFetching: boolean;
}

// Module-level, so TanStack can keep the combined array stable while no query changes.
function toComputeResults(
  results: readonly { data: ComputeData | undefined; error: Error | null; isFetching: boolean }[],
): ComputeResult[] {
  return results.map((r) => ({ data: r.data, error: r.error, isFetching: r.isFetching }));
}

/**
 * One compute query per request (null = nothing to compute yet). The previous values stay
 * while new ones load (`keepPreviousData`), so editing a length does not blink the line.
 */
export function useIndicatorComputes(
  requests: readonly (ComputeRequestBody | null)[],
): ComputeResult[] {
  return useQueries({
    queries: requests.map((body) => ({
      queryKey: ['indicator', body],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        apiPost('/indicators/compute', body, parseCompute, { signal }),
      enabled: body !== null,
      placeholderData: keepPreviousData,
      staleTime: 60_000,
      retry: 1,
    })),
    combine: toComputeResults,
  });
}
