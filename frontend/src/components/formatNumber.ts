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

const COMPACT = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 2,
});

/** Volume in compact form, e.g. 45_230_000 -> "45.23M", 950 -> "950". */
export function formatVolume(value: number): string {
  return COMPACT.format(value);
}

/** Value with an explicit sign, e.g. 0.38 -> "+0.38", -1.2 -> "-1.20", 0 -> "0.00". */
export function formatSigned(value: number, decimals: number): string {
  const text = formatPrice(value, decimals);
  return value > 0 ? `+${text}` : text;
}

/** Change and change percent, as the legend and the symbol card show it: "+0.18 (+0.77%)". */
export function formatChange(change: number, changePct: number, decimals: number): string {
  return `${formatSigned(change, decimals)} (${changePct > 0 ? '+' : ''}${formatPercent(changePct)})`;
}

/** A count with its noun, e.g. (1, 'drawing') -> "1 drawing", (3, 'drawing') -> "3 drawings". */
export function plural(n: number, word: string): string {
  return `${String(n)} ${word}${n === 1 ? '' : 's'}`;
}
