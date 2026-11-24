import type { Volatility } from '../api/volatility.ts';

/** Human labels of the cone's calendar horizons. */
export const HORIZON_LABELS: Record<string, string> = {
  week: 'Week',
  month: 'Month',
  quarter: 'Quarter',
  half: 'Half year',
  year: 'Year',
};

/** A per-bar volatility (fraction) as % a year or % a bar. */
export function volScale(v: Volatility, annual: boolean): number {
  return 100 * (annual ? Math.sqrt(v.barsPerYear) : 1);
}

export const pct0 = (x: number | null) => (x === null ? '—' : `${(x * 100).toFixed(0)}%`);
export const pct1 = (x: number | null) => (x === null ? '—' : `${(x * 100).toFixed(1)}%`);
