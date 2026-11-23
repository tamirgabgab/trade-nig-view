/**
 * Anchor times ↔ the chart's logical bar index, so a drawing made on one interval lands on the
 * same instant on any other (ARCHITECTURE §5.2).
 *
 * `times` are the bars' open times (UTC epoch seconds, ascending). An instant inside bar i maps to
 * i + its fraction of the bar's span; before the first or after the last bar it extrapolates with
 * the neighbouring bar spacing. Gaps (weekends, holidays) belong to the bar before them.
 */

const DAY = 86_400;

function spacing(times: readonly number[], at: 'start' | 'end'): number {
  const n = times.length;
  if (n < 2) return DAY;
  const step =
    at === 'start' ? (times[1] ?? 0) - (times[0] ?? 0) : (times[n - 1] ?? 0) - (times[n - 2] ?? 0);
  return step > 0 ? step : DAY;
}

/** First index i with times[i] > t (binary search). */
function upperBound(times: readonly number[], t: number): number {
  let lo = 0;
  let hi = times.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((times[mid] ?? 0) <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Logical (fractional) bar index of instant `t`; NaN with no bars. */
export function timeToLogical(times: readonly number[], t: number): number {
  const n = times.length;
  const first = times[0];
  const last = times[n - 1];
  if (first === undefined || last === undefined) return NaN;
  if (t < first) return (t - first) / spacing(times, 'start');
  if (t >= last) return n - 1 + (t - last) / spacing(times, 'end');
  const i = upperBound(times, t) - 1;
  const open = times[i] ?? first;
  const next = times[i + 1] ?? open + spacing(times, 'end');
  return i + (t - open) / (next - open);
}

/** Instant at logical index `logical` (inverse of timeToLogical, rounded to the second). */
export function logicalToTime(times: readonly number[], logical: number): number {
  const n = times.length;
  const first = times[0];
  const last = times[n - 1];
  if (first === undefined || last === undefined) return NaN;
  if (logical < 0) return Math.round(first + logical * spacing(times, 'start'));
  if (logical >= n - 1) return Math.round(last + (logical - (n - 1)) * spacing(times, 'end'));
  const i = Math.floor(logical);
  const open = times[i] ?? first;
  const next = times[i + 1] ?? open;
  return Math.round(open + (logical - i) * (next - open));
}
