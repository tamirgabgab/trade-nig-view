import { clipLine, distanceToLine, distanceToRectEdge, insideRect } from './geometry.ts';
import { fibLevels } from './fib.ts';
import type { Drawing, FibLevel, Point } from './types.ts';

/**
 * What each tool looks like on screen (pixels) and where it can be grabbed: one place for the
 * renderer and the hit test, so they always agree. Pure: unit-tested without a canvas.
 */

/** How close (CSS px) the pointer must be to a line or a handle to grab it. */
const HIT_PX = 6;
export const HANDLE_RADIUS = 4.5;

export interface Size {
  width: number;
  height: number;
}

/** The price scale's mapping (Fib levels are prices: on a log scale they are not linear in y). */
export type PriceToY = (price: number) => number | null;

/** Vertical offset (px) from a channel's base line A–B to its parallel line through C. */
export function channelOffset(pts: readonly Point[]): number {
  const [a, b, c] = pts;
  if (a === undefined || b === undefined || c === undefined) return 0;
  if (a.x === b.x) return c.y - a.y;
  return c.y - (a.y + ((b.y - a.y) * (c.x - a.x)) / (b.x - a.x));
}

export interface FibLine {
  level: FibLevel;
  price: number;
  y: number;
  x1: number;
  x2: number;
}

/**
 * A Fib drawing's level lines, by ratio. A retracement spans its two anchors; an extension
 * starts at C and is as wide as A–B.
 */
export function fibLines(drawing: Drawing, pts: readonly Point[], priceToY: PriceToY): FibLine[] {
  const [a, b, c] = pts;
  if (a === undefined || b === undefined) return [];
  let x1 = Math.min(a.x, b.x);
  let x2 = Math.max(a.x, b.x);
  if (drawing.type === 'fib_extension') {
    if (c === undefined) return [];
    x1 = c.x;
    x2 = c.x + Math.abs(b.x - a.x);
  }
  return fibLevels(drawing).flatMap(({ level, price }) => {
    const y = priceToY(price);
    return y === null ? [] : [{ level, price, y, x1, x2 }];
  });
}

const RANGES: ReadonlySet<Drawing['type']> = new Set([
  'price_range',
  'date_range',
  'date_price_range',
  'return_range',
  'stats_range',
]);

/** A range tool: a box between its two anchors with a measurement label. */
export function isRange(drawing: Drawing): boolean {
  return RANGES.has(drawing.type);
}

/** A text label's box: anchor at its top-left; width estimated from the font size. */
export function textBox(drawing: Drawing, at: Point): { a: Point; b: Point } {
  const size = drawing.props.font_size ?? 14;
  const width = Math.max((drawing.props.text ?? '').length, 1) * size * 0.6 + 8;
  return { a: at, b: { x: at.x + width, y: at.y + size * 1.4 } };
}

/** Line segments to stroke for line-like tools, already clipped to the pane. */
export function strokes(
  drawing: Drawing,
  pts: readonly Point[],
  size: Size,
  priceToY: PriceToY,
): [Point, Point][] {
  const [a, b] = pts;
  if (a === undefined) return [];
  const { width, height } = size;
  const line = (p: Point, q: Point, extent: 'segment' | 'ray' | 'line') => {
    const clipped = clipLine(p, q, extent, width, height);
    return clipped === null ? [] : [clipped];
  };
  switch (drawing.type) {
    case 'trend_line':
      return b === undefined ? [] : line(a, b, 'segment');
    case 'ray':
      return b === undefined ? [] : line(a, b, 'ray');
    case 'extended_line':
      return b === undefined ? [] : line(a, b, 'line');
    case 'horizontal_line':
      return [
        [
          { x: 0, y: a.y },
          { x: width, y: a.y },
        ],
      ];
    case 'horizontal_ray':
      return [[a, { x: width, y: a.y }]];
    case 'vertical_line':
      return [
        [
          { x: a.x, y: 0 },
          { x: a.x, y: height },
        ],
      ];
    case 'fib_retracement':
    case 'fib_extension':
      return fibLines(drawing, pts, priceToY).map(({ y, x1, x2 }) => [
        { x: x1, y },
        { x: x2, y },
      ]);
    case 'parallel_channel': {
      if (b === undefined) return [];
      const dy = channelOffset(pts);
      return [
        ...line(a, b, 'segment'),
        ...line({ x: a.x, y: a.y + dy }, { x: b.x, y: b.y + dy }, 'segment'),
      ];
    }
    case 'rectangle':
    case 'text':
    case 'price_range':
    case 'date_range':
    case 'date_price_range':
    case 'return_range':
    case 'stats_range':
      return [];
  }
}

export type Hit = { kind: 'handle'; index: number } | { kind: 'body' };

/**
 * What of `drawing` is under `p`: an anchor handle (only when `withHandles`, i.e. selected), the
 * shape itself, or nothing.
 */
export function hitTest(
  drawing: Drawing,
  pts: readonly Point[],
  p: Point,
  size: Size,
  withHandles: boolean,
  priceToY: PriceToY,
): Hit | null {
  if (withHandles) {
    const index = pts.findIndex((q) => Math.hypot(q.x - p.x, q.y - p.y) <= HIT_PX + 1);
    if (index >= 0) return { kind: 'handle', index };
  }
  const [a, b] = pts;
  if (a === undefined) return null;
  if (drawing.type === 'rectangle' && b !== undefined) {
    const onEdge = distanceToRectEdge(p, a, b) <= HIT_PX;
    return onEdge || (drawing.props.fill !== false && insideRect(p, a, b))
      ? { kind: 'body' }
      : null;
  }
  if (drawing.type === 'text') {
    const box = textBox(drawing, a);
    return insideRect(p, box.a, box.b) ? { kind: 'body' } : null;
  }
  if (isRange(drawing) && b !== undefined) {
    return insideRect(p, a, b) || distanceToRectEdge(p, a, b) <= HIT_PX ? { kind: 'body' } : null;
  }
  if (drawing.type === 'parallel_channel' && b !== undefined && a.x !== b.x) {
    // Inside the band between the two lines.
    const t = (p.x - a.x) / (b.x - a.x);
    const base = a.y + t * (b.y - a.y);
    const dy = channelOffset(pts);
    if (t >= 0 && t <= 1 && (p.y - base) * (p.y - base - dy) <= 0) return { kind: 'body' };
  }
  if (drawing.type === 'fib_retracement' || drawing.type === 'fib_extension') {
    // The trend between the anchors grabs it too, so it stays reachable with every level hidden.
    const onTrend = pts.some((q, i) => {
      const prev = pts[i - 1];
      return prev !== undefined && distanceToLine(p, prev, q, 'segment') <= HIT_PX;
    });
    if (onTrend) return { kind: 'body' };
  }
  const near = strokes(drawing, pts, size, priceToY).some(
    ([s, e]) => distanceToLine(p, s, e, 'segment') <= HIT_PX,
  );
  return near ? { kind: 'body' } : null;
}

/** Points where a selected drawing shows its handles (one per anchor). */
export function handles(drawing: Drawing, pts: readonly Point[]): Point[] {
  return drawing.type === 'text' ? pts.slice(0, 1) : [...pts];
}
