import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { apiGet, fieldsOf, isRecord, type Schemas } from './client.ts';
import type { SeriesQuery } from './indicators.ts';

/** A price gap between two bars (TRADINGVIEW_RESEARCH §6), as `/api/analysis/gaps` returns it. */
export interface Gap {
  /** The bar after the gap, in the bars' own time format. */
  time: string | number;
  /** The bar that filled it; null while it is open. */
  filledTime: string | number | null;
  direction: 'up' | 'down';
  kind: 'full' | 'partial';
  top: number;
  bottom: number;
  sizePct: number;
  /** Deepest price reached back into the zone so far; null if none. */
  fillPrice: number | null;
}

const time = (v: unknown): string | number | null =>
  typeof v === 'string' || typeof v === 'number' ? v : null;
const num = (v: unknown): number => (typeof v === 'number' ? v : NaN);

export function parseGaps(body: unknown): Gap[] {
  if (!isRecord(body) || !Array.isArray(body['gaps'])) throw new Error('Unexpected gaps response');
  return (body['gaps'] as unknown[]).flatMap((item) => {
    if (!isRecord(item)) return [];
    const field = fieldsOf<Schemas['GapInfo']>(item);
    const at = time(field('time'));
    const direction = field('direction');
    if (at === null || (direction !== 'up' && direction !== 'down')) return [];
    const fill = field('fill_price');
    return [
      {
        time: at,
        filledTime: time(field('filled_time')),
        direction,
        kind: field('kind') === 'partial' ? 'partial' : 'full',
        top: num(field('top')),
        bottom: num(field('bottom')),
        sizePct: num(field('size_pct')),
        fillPrice: typeof fill === 'number' ? fill : null,
      },
    ];
  });
}

const NO_GAPS: Gap[] = [];

/** The gaps of a series (all of its history), while `enabled`. */
export function useGaps(
  series: SeriesQuery | null,
  options: { enabled: boolean; minPct: number; partial: boolean },
): Gap[] {
  // Gaps are of the real bars: the chart type (Heikin Ashi) does not change them.
  const key = series === null ? null : [series.symbol, series.interval, series.adjusted];
  const query = useQuery({
    queryKey: ['gaps', key, options.minPct, options.partial],
    enabled: options.enabled && series !== null,
    // A new setting or symbol keeps the old zones until the new ones are in (no blank flash).
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => {
      if (series === null) return NO_GAPS;
      const params = new URLSearchParams({
        symbol: series.symbol,
        interval: series.interval,
        adjusted: String(series.adjusted),
        min_pct: String(options.minPct),
        partial: String(options.partial),
      });
      return apiGet(`/analysis/gaps?${params.toString()}`, parseGaps, { signal });
    },
  });
  return options.enabled ? (query.data ?? NO_GAPS) : NO_GAPS;
}
