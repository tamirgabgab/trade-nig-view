import type { Anchor, Drawing, FibLevel } from './types.ts';

/** TradingView's default Fib levels and colours (TRADINGVIEW_RESEARCH §6). */
export const DEFAULT_FIB_LEVELS: readonly FibLevel[] = [
  { value: 0, color: '#787B86', visible: true },
  { value: 0.236, color: '#F23645', visible: true },
  { value: 0.382, color: '#FF9800', visible: true },
  { value: 0.5, color: '#4CAF50', visible: true },
  { value: 0.618, color: '#089981', visible: true },
  { value: 0.786, color: '#00BCD4', visible: true },
  { value: 1, color: '#787B86', visible: true },
  { value: 1.618, color: '#2962FF', visible: true },
  { value: 2.618, color: '#F23645', visible: true },
  { value: 3.618, color: '#9C27B0', visible: true },
  { value: 4.236, color: '#E91E63', visible: true },
];

/**
 * Price of Fib level `r`.
 *
 * Retracement, anchors $p_0 \to p_1$: $p(r) = p_1 - r\,(p_1 - p_0)$ (0 at the second anchor).
 * Trend-based extension, anchors A, B, C: $p(r) = C + r\,(B - A)$.
 */
export function fibPrice(type: Drawing['type'], points: readonly Anchor[], r: number): number {
  const [a, b, c] = points.map((p) => p.price);
  if (a === undefined || b === undefined) return NaN;
  if (type === 'fib_extension') return c === undefined ? NaN : c + r * (b - a);
  return b - r * (b - a);
}

/** The visible levels of a Fib drawing with their prices, by ratio. */
export function fibLevels(drawing: Drawing): { level: FibLevel; price: number }[] {
  return (drawing.props.levels ?? DEFAULT_FIB_LEVELS)
    .filter((level) => level.visible)
    .map((level) => ({ level, price: fibPrice(drawing.type, drawing.points, level.value) }))
    .sort((x, y) => x.level.value - y.level.value);
}
