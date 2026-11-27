import { MAX_BARS, MIN_BARS, NAME_PATTERN, type SyntheticDefinition } from '../api/synthetic.ts';

/**
 * The synthetic symbol dialog's checks before a definition is sent, and the weekday arithmetic of
 * a synthetic symbol's calendar (Monday to Friday, no holidays), the same as
 * the backend's `numpy.busday_offset(first, n, roll="forward")`. Dates are 'YYYY-MM-DD' in UTC.
 */

const DAY_MS = 86_400_000;

function toDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isWeekday(date: Date): boolean {
  const day = date.getUTCDay();
  return day !== 0 && day !== 6;
}

function step(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** `date` rolled forward to a weekday, then `n` weekdays on (n >= 0) or back (n < 0). */
export function addWeekdays(iso: string, n: number): string {
  let date = toDate(iso);
  while (!isWeekday(date)) date = step(date, 1);
  const direction = Math.sign(n);
  for (let left = Math.abs(n); left > 0;) {
    date = step(date, direction);
    if (isWeekday(date)) left -= 1;
  }
  return toIso(date);
}

/** The date of the last of `bars` daily bars starting on `first`. */
export function lastDate(first: string, bars: number): string {
  return addWeekdays(first, bars - 1);
}

/** The first date that makes `bars` daily bars end on the last weekday before `today`. */
export function firstDateEndingBefore(today: string, bars: number): string {
  let last = step(toDate(today), -1);
  while (!isWeekday(last)) last = step(last, -1);
  return addWeekdays(toIso(last), -(bars - 1));
}

/** What is wrong with a definition before it is sent, or null. */
export function definitionProblem(def: SyntheticDefinition, now: string): string | null {
  if (!NAME_PATTERN.test(def.name)) {
    return 'Name: 1 to 12 of A–Z, 0–9, ".", "-", "_", starting with a letter.';
  }
  if (def.fullName.trim() === '') return 'Give it a full name.';
  if (!Number.isInteger(def.bars) || def.bars < MIN_BARS || def.bars > MAX_BARS) {
    return `Bars: ${String(MIN_BARS)} to ${String(MAX_BARS)}.`;
  }
  if (!(def.firstPrice > 0)) return 'The first price must be above 0.';
  if (!Number.isInteger(def.seed) || def.seed < 0 || def.seed > 1_000_000) {
    return 'Seed: a whole number from 0 to 1,000,000.';
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(def.firstDate)) return 'Pick a first date.';
  const last = lastDate(def.firstDate, def.bars);
  if (last > now) return `The last bar would be on ${last}, after today: start earlier.`;
  return null;
}
