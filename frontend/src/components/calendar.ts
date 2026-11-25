/** Pure helpers for the date picker. Days are 'YYYY-MM-DD' strings, which sort as dates. */

/** 'YYYY-MM-DD' → 'DD/MM/YYYY'. */
export function formatDay(day: string): string {
  const [year, month, date] = day.split('-');
  return `${date ?? ''}/${month ?? ''}/${year ?? ''}`;
}

/** The day `count` calendar days after `day` (negative: before). */
export function addDays(day: string, count: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + count * 86_400_000).toISOString().slice(0, 10);
}

/** The first day of the month `count` months after `day`'s month. */
export function addMonths(day: string, count: number): string {
  const [year = 0, month = 1] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1 + count, 1)).toISOString().slice(0, 10);
}

/** A month view, Sunday first: `null` for the blanks before the 1st, then each day. */
export function monthCells(year: number, month: number): (string | null)[] {
  const lead = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const count = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const prefix = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-`;
  return [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: count }, (_, i) => `${prefix}${String(i + 1).padStart(2, '0')}`),
  ];
}

/**
 * The available day nearest `day` in `direction`: the first on or after it (+1) or the last on or
 * before it (-1); past the end of `days` (sorted, unique), the nearest the other way.
 */
export function snapDay(
  days: readonly string[],
  day: string,
  direction: 1 | -1,
): string | undefined {
  const after = days.find((d) => d >= day);
  const before = days.findLast((d) => d <= day);
  return direction === 1 ? (after ?? before) : (before ?? after);
}
