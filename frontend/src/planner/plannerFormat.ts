const WHOLE = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const PRICE = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

/** Shekels, rounded to whole ones: `₪12,345`, `−₪12,345`. */
export function shekels(value: number): string {
  const sign = value < -0.5 ? '−' : '';
  return `${sign}₪${WHOLE.format(Math.abs(value))}`;
}

/** A fraction as a percentage with two decimals (`0.0712` → `7.12%`); a dash for null. */
export function percent(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : `${(value * 100).toFixed(2)}%`;
}

/** A price or an exchange rate: 2 to 4 decimals. */
export const price = (value: number) => PRICE.format(value);

/** A difference of two rates in percentage points, signed: `+1.32`, `−0.80`, and `0.00`. */
export function points(value: number): string {
  const shown = Math.abs(value * 100).toFixed(2);
  return shown === '0.00' ? shown : `${value < 0 ? '−' : '+'}${shown}`;
}

/** A change in shekels with its sign: `+₪300,000`, `−₪340,000`; nothing stays `₪0`. */
export function signedShekels(value: number): string {
  const text = shekels(value);
  return value >= 0.5 ? `+${text}` : text;
}

/** A share as a plain percentage, with only the decimals it has: `10%`, `7.5%`, `0%`. */
export const plainPercent = (fraction: number) => `${String(Number((fraction * 100).toFixed(2)))}%`;

/** A share to the nearest whole percent: `67%`. */
export const wholePercent = (fraction: number) => `${String(Math.round(fraction * 100))}%`;

/** An option's name inside a sentence: `Apartment A` → `apartment A`. */
export const inline = (name: string) => name.charAt(0).toLowerCase() + name.slice(1);
