import { formatPercent, formatSigned, formatVolume } from '../components/formatNumber.ts';
import type { Anchor, Drawing } from './types.ts';

/** What a range tool measures between its anchors, from the chart's bars. */
export interface Span {
  /** Bars from the first anchor's bar to the second's (negative when the second is earlier). */
  bars: number;
  /** Volume of those bars: the ones after the earlier anchor's bar, up to the later one's.
   *  Null without volume. */
  volume: number | null;
}

/**
 * The span between two fractional bar indexes. An instant belongs to the bar that contains it,
 * so each index is floored; `volume(i)` is bar i's volume (null: the symbol has none).
 */
export function spanBetween(
  from: number,
  to: number,
  volume: ((index: number) => number) | null,
): Span {
  const a = Math.floor(from);
  const b = Math.floor(to);
  let total = 0;
  for (let i = Math.min(a, b) + 1; i <= Math.max(a, b); i += 1) total += volume?.(i) ?? 0;
  return { bars: b - a, volume: volume === null ? null : total };
}

/** "32d 4h", "3h 15m", "45m": a time span in its two largest units. */
export function formatDuration(seconds: number): string {
  const sign = seconds < 0 ? '-' : '';
  let left = Math.round(Math.abs(seconds) / 60);
  const parts: string[] = [];
  for (const [unit, size] of [
    ['d', 1440],
    ['h', 60],
    ['m', 1],
  ] as const) {
    const n = Math.floor(left / size);
    left -= n * size;
    if (n > 0 || (unit === 'm' && parts.length === 0)) parts.push(`${String(n)}${unit}`);
  }
  return sign + parts.slice(0, 2).join(' ');
}

/**
 * Label lines of a range tool, as TradingView shows them: the price change with its percent,
 * the bar count with the time span, and (date & price range) the volume.
 */
export function rangeLabel(drawing: Drawing, decimals: number, span: Span | null): string[] {
  const [a, b] = drawing.points as [Anchor | undefined, Anchor | undefined];
  if (a === undefined || b === undefined) return [];
  const change = b.price - a.price;
  const price = `${formatSigned(change, decimals)} (${a.price === 0 ? '—' : formatPercent((change / a.price) * 100)})`;
  const time = `${String(span?.bars ?? '—')} bars, ${formatDuration(b.time - a.time)}`;
  switch (drawing.type) {
    case 'price_range':
      return [price];
    case 'date_range':
      return [time];
    case 'date_price_range':
      return [price, span?.volume == null ? time : `${time}, vol ${formatVolume(span.volume)}`];
    default:
      return [];
  }
}
