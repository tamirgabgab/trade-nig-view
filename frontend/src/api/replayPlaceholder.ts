/**
 * A replay-aware placeholder: the previous result may stay on screen while the next loads only
 * if it is the same request at an earlier (or the same) origin, i.e. a replay step forward.
 * Another symbol's result, or a later one (a step back would show the future), must never show.
 */
export function keepsPrevious<Q extends { origin: number | null }>(
  previous: Q | null,
  next: Q,
): boolean {
  if (previous === null) return false;
  const { origin: a, ...rest } = previous;
  const { origin: b, ...nextRest } = next;
  const same = (Object.keys(rest) as (keyof typeof rest)[]).every((k) => rest[k] === nextRest[k]);
  return same && a !== null && (b === null || a <= b);
}
