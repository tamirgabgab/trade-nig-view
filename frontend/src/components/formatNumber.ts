/** Fixed-decimal price with thousands separators, e.g. 6910.39 -> "6,910.39". */
export function formatPrice(value: number, decimals: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Percent with two decimals and a % sign, e.g. -1.9 -> "-1.90%". */
export function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

export type Direction = 'up' | 'down' | 'flat';

export function direction(change: number | null): Direction {
  if (change === null || change === 0) return 'flat';
  return change > 0 ? 'up' : 'down';
}
