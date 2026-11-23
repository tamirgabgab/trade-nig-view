import { clipLine, distanceToLine, distanceToRectEdge, insideRect } from './geometry.ts';
import type { Drawing, Point } from './types.ts';

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

/** A text label's box: anchor at its top-left; width estimated from the font size. */
export function textBox(drawing: Drawing, at: Point): { a: Point; b: Point } {
  const size = drawing.props.font_size ?? 14;
  const width = Math.max((drawing.props.text ?? '').length, 1) * size * 0.6 + 8;
  return { a: at, b: { x: at.x + width, y: at.y + size * 1.4 } };
}

/** Line segments to stroke for line-like tools, already clipped to the pane. */
export function strokes(drawing: Drawing, pts: readonly Point[], size: Size): [Point, Point][] {
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
    case 'rectangle':
    case 'text':
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
  const near = strokes(drawing, pts, size).some(
    ([s, e]) => distanceToLine(p, s, e, 'segment') <= HIT_PX,
  );
  return near ? { kind: 'body' } : null;
}

/** Points where a selected drawing shows its handles (one per anchor). */
export function handles(drawing: Drawing, pts: readonly Point[]): Point[] {
  return drawing.type === 'text' ? pts.slice(0, 1) : [...pts];
}
