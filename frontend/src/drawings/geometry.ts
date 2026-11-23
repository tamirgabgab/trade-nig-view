import type { Point } from './types.ts';

/**
 * Plane geometry for drawings, in CSS pixels. Pure functions: unit-tested, no chart library.
 */

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Distance from `p` to the line through `a` and `b`, limited to: the segment `a`–`b`
 * ("segment"), the ray from `a` through `b` ("ray"), or the whole line ("line").
 */
export function distanceToLine(
  p: Point,
  a: Point,
  b: Point,
  extent: 'segment' | 'ray' | 'line' = 'segment',
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length2 = dx * dx + dy * dy;
  if (length2 === 0) return dist(p, a);
  // Projection parameter: 0 at a, 1 at b.
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2;
  if (extent !== 'line') t = Math.max(t, 0);
  if (extent === 'segment') t = Math.min(t, 1);
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy });
}

/** Distance from `p` to the outline of the rectangle with corners `a` and `b` (0 on an edge). */
export function distanceToRectEdge(p: Point, a: Point, b: Point): number {
  const [x0, x1] = [Math.min(a.x, b.x), Math.max(a.x, b.x)];
  const [y0, y1] = [Math.min(a.y, b.y), Math.max(a.y, b.y)];
  const corners: Point[] = [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
  return Math.min(
    ...corners.map((c, i) => distanceToLine(p, c, corners[(i + 1) % 4] ?? c, 'segment')),
  );
}

/** Whether `p` is inside the rectangle with corners `a` and `b` (edges included). */
export function insideRect(p: Point, a: Point, b: Point): boolean {
  return (
    p.x >= Math.min(a.x, b.x) &&
    p.x <= Math.max(a.x, b.x) &&
    p.y >= Math.min(a.y, b.y) &&
    p.y <= Math.max(a.y, b.y)
  );
}

/**
 * The visible part of the line through `a` and `b` as drawn: the segment itself, the ray from `a`
 * through `b`, or the full line, clipped to the `width`×`height` pane (Liang–Barsky). Null when
 * nothing of it is visible.
 */
export function clipLine(
  a: Point,
  b: Point,
  extent: 'segment' | 'ray' | 'line',
  width: number,
  height: number,
): [Point, Point] | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = extent === 'line' ? -Infinity : 0;
  let t1 = extent === 'segment' ? 1 : Infinity;
  if (dx === 0 && dy === 0) return null;
  const edges: [number, number][] = [
    [-dx, a.x],
    [dx, width - a.x],
    [-dy, a.y],
    [dy, height - a.y],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
    if (t0 > t1) return null;
  }
  return [
    { x: a.x + t0 * dx, y: a.y + t0 * dy },
    { x: a.x + t1 * dx, y: a.y + t1 * dy },
  ];
}

/** `b` moved onto the nearest 45° direction from `a`, keeping its distance (Shift while drawing). */
export function snapAngle(a: Point, b: Point): Point {
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  const step = Math.PI / 4;
  const snapped = Math.round(angle / step) * step;
  const r = dist(a, b);
  return { x: a.x + r * Math.cos(snapped), y: a.y + r * Math.sin(snapped) };
}
