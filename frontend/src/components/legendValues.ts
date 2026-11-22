import type { Bar } from '../api/bars.ts';

/** Values shown in the OHLC legend for one bar. */
export interface LegendValues {
  time: Bar['time'];
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  /** Close minus the previous bar's close; null for the first bar. */
  change: number | null;
  /** Change in percent of the previous close; null for the first bar. */
  changePct: number | null;
}

/**
 * Legend values for the bar at `index` (the crosshair position), or for the last bar when the
 * crosshair is off the data. Returns null when there are no bars.
 */
export function legendValues(bars: readonly Bar[], index: number | null): LegendValues | null {
  if (bars.length === 0) return null;
  const i = index !== null && index >= 0 && index < bars.length ? index : bars.length - 1;
  const bar = bars[i];
  if (bar === undefined) return null;
  const previous = i > 0 ? bars[i - 1] : undefined;
  const change = previous === undefined ? null : bar.close - previous.close;
  const changePct =
    previous === undefined || previous.close === 0 ? null : (bar.close / previous.close - 1) * 100;
  return { ...bar, change, changePct };
}
