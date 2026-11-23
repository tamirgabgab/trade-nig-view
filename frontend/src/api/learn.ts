/**
 * Learn drawer data: an indicator's learn page (Markdown) and its measured filter response.
 */
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { apiGet, apiPost, fieldsOf, isRecord, type Schemas } from './client.ts';
import type { Params } from './indicators.ts';

export interface FrequencyResponse {
  /** Cycle length in bars, log-spaced from 2 to 200. */
  period: number[];
  /** 20 log10 |H|, floored at -120 dB. */
  magnitudeDb: number[];
  /** Bars; null where |H| = 0. */
  groupDelay: (number | null)[];
}

/** One output's measured response; the linear-only fields are null for adaptive averages. */
export interface OutputResponse {
  name: string;
  label: string;
  /** Why it is not linear (no impulse / frequency response); null when it is. */
  reason: string | null;
  step: number[];
  rampLag: number | null;
  impulse: number[] | null;
  dcGain: number | null;
  lag: number | null;
  nrf: number | null;
  frequency: FrequencyResponse | null;
  truncated: boolean;
}

export interface FilterResponse {
  id: string;
  outputs: OutputResponse[];
}

function numbers(value: unknown, field: string): number[] {
  if (!Array.isArray(value)) throw new Error(`Expected numbers for ${field}`);
  return (value as unknown[]).map((v) => {
    if (typeof v !== 'number') throw new Error(`Expected numbers for ${field}`);
    return v;
  });
}

function numOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parseFrequency(value: unknown): FrequencyResponse | null {
  if (value === null) return null;
  if (!isRecord(value)) throw new Error('Unexpected frequency response');
  const field = fieldsOf<Schemas['FrequencyInfo']>(value);
  const delay = field('group_delay');
  if (!Array.isArray(delay)) throw new Error('Unexpected group delay');
  return {
    period: numbers(field('period'), 'period'),
    magnitudeDb: numbers(field('magnitude_db'), 'magnitude_db'),
    groupDelay: (delay as unknown[]).map(numOrNull),
  };
}

function parseOutput(item: unknown): OutputResponse {
  if (!isRecord(item)) throw new Error('Unexpected output response');
  const field = fieldsOf<Schemas['OutputResponseInfo']>(item);
  const name = field('name');
  const label = field('label');
  const reason = field('reason');
  const impulse = field('impulse');
  if (typeof name !== 'string' || typeof label !== 'string') throw new Error('Unexpected output');
  return {
    name,
    label,
    reason: typeof reason === 'string' ? reason : null,
    step: numbers(field('step'), 'step'),
    rampLag: numOrNull(field('ramp_lag')),
    impulse: impulse === null ? null : numbers(impulse, 'impulse'),
    dcGain: numOrNull(field('dc_gain')),
    lag: numOrNull(field('lag')),
    nrf: numOrNull(field('nrf')),
    frequency: parseFrequency(field('frequency')),
    truncated: field('truncated') === true,
  };
}

export function parseFilterResponse(body: unknown): FilterResponse {
  if (!isRecord(body)) throw new Error('Unexpected response body');
  const field = fieldsOf<Schemas['ResponseInfo']>(body);
  const id = field('id');
  const outputs = field('outputs');
  if (typeof id !== 'string' || !Array.isArray(outputs)) throw new Error('Unexpected response');
  return { id, outputs: (outputs as unknown[]).map(parseOutput) };
}

function parseLearnPage(body: unknown): string {
  if (!isRecord(body)) throw new Error('Unexpected learn page');
  const markdown = fieldsOf<Schemas['LearnPage']>(body)('markdown');
  if (typeof markdown !== 'string') throw new Error('Unexpected learn page');
  return markdown;
}

/** The learn page of `slug` (pages only change with a new version of the app). */
export function useLearnPage(slug: string) {
  return useQuery({
    queryKey: ['learn', slug],
    queryFn: ({ signal }) =>
      apiGet(`/learn/${encodeURIComponent(slug)}`, parseLearnPage, { signal }),
    staleTime: Infinity,
  });
}

/** Measured response of indicator `id` with `params`; null = nothing to measure. */
export function useFilterResponse(request: { id: string; params: Params } | null) {
  return useQuery({
    queryKey: ['response', request],
    queryFn: ({ signal }) =>
      apiPost('/indicators/response', request, parseFilterResponse, { signal }),
    enabled: request !== null,
    placeholderData: keepPreviousData,
    staleTime: Infinity,
  });
}
