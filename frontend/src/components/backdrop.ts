/** Pure helpers for the chart backdrop: the day's change (Market pulse), the topographic lines and
 *  the ghost history path. */
import type { Bar } from '../api/bars.ts';
import { barSeconds } from '../chart/visibleRange.ts';
import { localDate } from './formatClock.ts';

const WEEK = 7 * 86_400;

/** A move this large (3 %) gives the strongest pulse tint. */
const FULL_PULSE = 0.03;
/** The strongest tint's opacity: a hint, never a fill. */
export const PULSE_MAX_ALPHA = 0.12;

/**
 * The latest change of the last shown bar's close: against the previous bar's close on daily and
 * longer bars (a week's or month's change there), against the last close of the previous day on
 * intraday bars. The chart's own bars, so a replay never shows a later day. Null without a
 * previous close.
 */
export function dayChange(bars: readonly Bar[], zone: string): number | null {
  const last = bars.at(-1);
  if (last === undefined) return null;
  let before: Bar | undefined;
  if (typeof last.time === 'string') {
    before = bars.at(-2);
  } else {
    const day = localDate(last.time, zone);
    before = bars.findLast((bar) => localDate(bar.time, zone) < day);
  }
  return before === undefined || before.close === 0 ? null : last.close / before.close - 1;
}

/** The pulse tint's opacity for a change: proportional, capped at a 3 % move. */
export const pulseAlpha = (change: number) =>
  Math.min(Math.abs(change) / FULL_PULSE, 1) * PULSE_MAX_ALPHA;

/** A small seeded random generator (mulberry32): the same lines on every visit. */
function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Topographic lines on a `width` x `height` box: around a few hills, nested closed rings whose
 * radius wobbles with three harmonics of the angle (the same wobble per hill, so rings never
 * cross their own neighbours). SVG path strings.
 */
export function topoPaths(width: number, height: number, seed = 7): string[] {
  const rand = random(seed);
  const paths: string[] = [];
  const POINTS = 72;
  for (let hill = 0; hill < 4; hill += 1) {
    const cx = width * (0.1 + 0.8 * rand());
    const cy = height * (0.1 + 0.8 * rand());
    const harmonics = [2, 3, 5].map((k) => ({ k, a: 0.05 + 0.12 * rand(), phase: 6.283 * rand() }));
    const rings = 7 + Math.floor(rand() * 5);
    const step = Math.min(width, height) * (0.035 + 0.02 * rand());
    for (let ring = 1; ring <= rings; ring += 1) {
      const r = ring * step;
      const points: string[] = [];
      for (let j = 0; j < POINTS; j += 1) {
        const theta = (j / POINTS) * 2 * Math.PI;
        const wobble = harmonics.reduce((sum, h) => sum + h.a * Math.sin(h.k * theta + h.phase), 1);
        const x = cx + r * wobble * Math.cos(theta);
        const y = cy + r * wobble * Math.sin(theta);
        points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
      }
      paths.push(`M${points.join('L')}Z`);
    }
  }
  return paths;
}

/**
 * The ghost history: the closes as an area over a `width` x `height` box (log price, oldest left),
 * thinned to at most `points` points. Empty with fewer than two positive closes.
 */
export function ghostPath(closes: readonly number[], width: number, height: number, points = 400) {
  const valid = closes.filter((c) => c > 0);
  if (valid.length < 2) return '';
  const stride = Math.max(1, Math.ceil(valid.length / points));
  const kept = valid.filter((_, i) => i % stride === 0 || i === valid.length - 1);
  const logs = kept.map(Math.log);
  const lo = Math.min(...logs);
  const span = Math.max(...logs) - lo || 1;
  const xy = logs.map(
    (v, i) =>
      `${((i / (logs.length - 1)) * width).toFixed(1)},${(height * (0.95 - 0.75 * ((v - lo) / span))).toFixed(1)}`,
  );
  return `M0,${String(height)}L${xy.join('L')}L${String(width)},${String(height)}Z`;
}

/**
 * The ghost history's closes: the weekly bars whose week is over by the last shown bar (a week's
 * bar carries its Friday close), then that bar's own close, so a replay never sees a later price.
 */
export function ghostCloses(weekly: readonly Bar[], last: Bar): number[] {
  const until = barSeconds(last.time);
  return [
    ...weekly.filter((b) => barSeconds(b.time) + WEEK <= until).map((b) => b.close),
    last.close,
  ];
}
