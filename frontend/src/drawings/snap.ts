export type MagnetMode = 'off' | 'weak' | 'strong';

/** Weak magnet: snap only when the pointer is this close (CSS px) to a price of the bar. */
export const WEAK_MAGNET_PX = 20;

interface Ohlc {
  open: number;
  high: number;
  low: number;
  close: number;
}

/**
 * The price a drawing anchor takes under the magnet: the bar's open, high, low or close nearest
 * to the pointer (in pixels, via `toY`). Weak snaps only within WEAK_MAGNET_PX; strong always.
 */
export function magnetPrice(
  price: number,
  y: number,
  bar: Ohlc | undefined,
  mode: MagnetMode,
  toY: (price: number) => number | null,
): number {
  if (mode === 'off' || bar === undefined) return price;
  let best = price;
  let bestDistance = Infinity;
  for (const candidate of [bar.open, bar.high, bar.low, bar.close]) {
    const cy = toY(candidate);
    if (cy === null) continue;
    const d = Math.abs(cy - y);
    if (d < bestDistance) {
      bestDistance = d;
      best = candidate;
    }
  }
  return mode === 'strong' || bestDistance <= WEAK_MAGNET_PX ? best : price;
}
