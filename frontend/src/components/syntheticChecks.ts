import {
  MAX_BARS,
  MIN_BARS,
  NAME_PATTERN,
  type ParametricDefinition,
  type ReturnShape,
  type ShuffleDefinition,
  type SyntheticDefinition,
} from '../api/synthetic.ts';

/**
 * The synthetic symbol form's checks before a definition is sent, and the weekday arithmetic of
 * a synthetic symbol's calendar (Monday to Friday, no holidays), the same as
 * the backend's `numpy.busday_offset(first, n, roll="forward")`. Dates are 'YYYY-MM-DD' in UTC.
 */

const DAY_MS = 86_400_000;
/** Bars are day numbers since 1970-01-01 (the backend's floor too). */
export const FIRST_DAY = '1970-01-01';

export const MAX_NOISE_PCT = 5;
export const MAX_LAG = 12;

export function barsInRange(bars: number): boolean {
  return Number.isInteger(bars) && bars >= MIN_BARS && bars <= MAX_BARS;
}

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

const BARS_PROBLEM = `Bars: ${String(MIN_BARS)} to ${String(MAX_BARS)}.`;

function seedProblem(seed: number): string | null {
  return Number.isInteger(seed) && seed >= 0 && seed <= 1_000_000
    ? null
    : 'Seed: a whole number from 0 to 1,000,000.';
}

/** What is wrong with a parametric symbol's statistics, or null (the backend's own rules). */
function shapeProblem(shape: ReturnShape): string | null {
  const within = (value: number, lo: number, hi: number) =>
    Number.isFinite(value) && value >= lo && value <= hi;
  if (!within(shape.meanPct, -50, 100)) return 'Expected return: −50 to 100 % a year.';
  if (!within(shape.volPct, 1, 100)) return 'Volatility: 1 to 100 % a year.';
  // The backend checks both whatever the family (a hidden field keeps its value).
  if (!(shape.df > 2 && shape.df <= 100)) {
    return 'Degrees of freedom (Student-t): above 2, 100 at most.';
  }
  if (!within(shape.skew, -20, 20)) return 'Skew (skew-normal): −20 to 20.';
  if (!within(shape.memory, -0.9, 0.9)) return 'Memory (phi): −0.9 to 0.9.';
  if (!within(shape.jumpsPerYear, 0, 50)) return 'Jumps: 0 to 50 a year.';
  if (!within(shape.jumpMeanPct, -50, 50) || !within(shape.jumpSdPct, 0, 50)) {
    return 'Jump size: a mean of −50 to 50 % and a standard deviation of 0 to 50 %.';
  }
  if (!within(shape.garchAlpha, 0, 0.5) || !within(shape.garchBeta, 0, 0.99)) {
    return 'GARCH: alpha 0 to 0.5, beta 0 to 0.99.';
  }
  if (shape.garchAlpha + shape.garchBeta >= 1) return 'GARCH: alpha + beta must be below 1.';
  const jumpVariance =
    shape.jumpsPerYear * ((shape.jumpMeanPct / 100) ** 2 + (shape.jumpSdPct / 100) ** 2);
  if (jumpVariance >= (shape.volPct / 100) ** 2) {
    return 'The jumps carry all of the volatility or more: fewer or smaller jumps, or a larger σ.';
  }
  return null;
}

/** A dated series' length and first date (a lab scenario or a parametric symbol). */
function datedProblem(def: { bars: number; firstDate: string }, now: string): string | null {
  if (!barsInRange(def.bars)) return BARS_PROBLEM;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(def.firstDate)) return 'Pick a first date.';
  if (def.firstDate < FIRST_DAY) return 'The first date is 1970-01-01 or later.';
  const last = lastDate(def.firstDate, def.bars);
  if (last >= now) return `The last bar would be on ${last}, not before today: start earlier.`;
  return null;
}

/** Why a parametric symbol's preview cannot be drawn (its seed, length or statistics), or null. */
export function previewProblem(def: ParametricDefinition): string | null {
  return (
    seedProblem(def.seed) ?? (barsInRange(def.bars) ? null : BARS_PROBLEM) ?? shapeProblem(def)
  );
}

export const MAX_BLOCK_DAYS = 1000;

/** What is wrong with a shuffled copy's source, range or block before its preview, or null (the
 *  bars in the range are counted by the backend). */
export function shuffleProblem(def: ShuffleDefinition, now: string): string | null {
  if (def.source === '') return 'Pick the source symbol.';
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (!iso.test(def.start) || !iso.test(def.end)) return 'Pick the first and the last dates.';
  if (def.start < FIRST_DAY) return 'The first date is 1970-01-01 or later.';
  if (def.end <= def.start) return 'The last date is after the first one.';
  if (def.end >= now) return 'The last date is before today.';
  if (!Number.isInteger(def.blockDays) || def.blockDays < 1 || def.blockDays > MAX_BLOCK_DAYS) {
    return `Block: a whole number of days from 1 to ${String(MAX_BLOCK_DAYS)}.`;
  }
  return null;
}

/** What is wrong with a definition before it is sent, or null. */
export function definitionProblem(def: SyntheticDefinition, now: string): string | null {
  if (!NAME_PATTERN.test(def.name)) {
    return 'Name: 1 to 12 of A–Z, 0–9, ".", "-", "_", starting with a letter.';
  }
  if (def.fullName.trim() === '') return 'Give it a full name.';
  if (def.kind !== 'shuffle' && !(def.firstPrice > 0)) return 'The first price must be above 0.';
  const seed = seedProblem(def.seed);
  if (seed !== null) return seed;
  switch (def.kind) {
    case 'scenario':
      return datedProblem(def, now);
    case 'parametric':
      return shapeProblem(def) ?? datedProblem(def, now);
    case 'shuffle':
      return shuffleProblem(def, now);
    case 'dwelling':
      if (!(def.noisePct >= 0 && def.noisePct <= MAX_NOISE_PCT)) {
        return `Noise: 0 to ${String(MAX_NOISE_PCT)} % a day.`;
      }
      if (!Number.isInteger(def.lagMonths) || def.lagMonths < 0 || def.lagMonths > MAX_LAG) {
        return `Publication lag: 0 to ${String(MAX_LAG)} months.`;
      }
      return null;
    default: {
      const never: never = def;
      throw new Error(`Unknown kind ${String(never)}`);
    }
  }
}
