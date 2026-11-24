import { formatPercent, formatSigned, formatVolume } from '../components/formatNumber.ts';
import type { Anchor, Drawing, ReturnUnit } from './types.ts';

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

const SECONDS_PER_DAY = 86_400;

/** The units a return range offers, in calendar days per unit ('bar': one bar of the chart). */
export const RETURN_UNITS: { unit: ReturnUnit; label: string; days: number | null }[] = [
  { unit: 'year', label: 'Year', days: 365.25 },
  { unit: 'month', label: 'Month', days: 365.25 / 12 },
  { unit: 'week', label: 'Week', days: 7 },
  { unit: 'day', label: 'Day', days: 1 },
  { unit: 'bar', label: 'Bar', days: null },
];

/**
 * The compound return per unit T equivalent to going from `from` to `to`:
 * $(P_{late}/P_{early})^{1/m} - 1$, with $m$ the span in units of T (calendar days / days per
 * unit, or bars for 'bar'). It is the constant rate per T that compounds to the same change
 * (per year: the CAGR). Null when it is undefined: a price at or below zero, or no time between.
 */
export function equivalentReturn(
  from: Anchor,
  to: Anchor,
  bars: number | null,
  unit: ReturnUnit,
): number | null {
  const [early, late] = from.time <= to.time ? [from, to] : [to, from];
  if (early.price <= 0 || late.price <= 0) return null;
  const days = RETURN_UNITS.find((u) => u.unit === unit)?.days ?? null;
  const span =
    days === null
      ? bars === null
        ? 0
        : Math.abs(bars)
      : (late.time - early.time) / SECONDS_PER_DAY / days;
  return span > 0 ? (late.price / early.price) ** (1 / span) - 1 : null;
}

/** "≈ +10.00% / year"; a rate beyond ±999,999% (a tiny span annualised) is shown as capped. */
function formatRate(rate: number | null, unit: ReturnUnit): string {
  if (rate === null || !Number.isFinite(rate)) return `— / ${unit}`;
  const pct = rate * 100;
  const text = pct >= 1e6 ? '> +999,999%' : `${formatSigned(pct, 2)}%`;
  return `≈ ${text} / ${unit}`;
}

/**
 * Label lines of a range tool, as TradingView shows them: the price change with its percent,
 * the bar count with the time span, and (date & price range) the volume. A return range adds the
 * equivalent compound return per its unit; a statistics range points to its panel.
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
    case 'return_range': {
      const unit = drawing.props.unit ?? 'year';
      return [price, formatRate(equivalentReturn(a, b, span?.bars ?? null, unit), unit), time];
    }
    case 'stats_range':
      return [time, 'Statistics: see the side panel'];
    default:
      return [];
  }
}
