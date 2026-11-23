import { clipLine, distanceToLine, distanceToRectEdge, insideRect, snapAngle } from './geometry.ts';

const p = (x: number, y: number) => ({ x, y });

describe('distanceToLine', () => {
  const a = p(0, 0);
  const b = p(10, 0);
  it('measures to the segment, the ray and the full line', () => {
    expect(distanceToLine(p(5, 3), a, b)).toBe(3);
    expect(distanceToLine(p(-4, 3), a, b, 'segment')).toBe(5); // to the end point a
    expect(distanceToLine(p(-4, 3), a, b, 'ray')).toBe(5); // the ray starts at a
    expect(distanceToLine(p(20, 3), a, b, 'ray')).toBe(3); // ...and goes on past b
    expect(distanceToLine(p(-4, 3), a, b, 'line')).toBe(3);
  });
  it('treats a zero-length line as a point', () => {
    expect(distanceToLine(p(3, 4), a, a)).toBe(5);
  });
});

describe('rectangles', () => {
  it('measures to the nearest edge and tests inside, in any corner order', () => {
    expect(distanceToRectEdge(p(5, 5), p(10, 10), p(0, 0))).toBe(5);
    expect(distanceToRectEdge(p(5, 12), p(0, 0), p(10, 10))).toBe(2);
    expect(insideRect(p(5, 5), p(10, 0), p(0, 10))).toBe(true);
    expect(insideRect(p(11, 5), p(0, 0), p(10, 10))).toBe(false);
  });
});

describe('clipLine', () => {
  it('keeps a visible segment, extends rays and lines to the pane edges', () => {
    expect(clipLine(p(10, 10), p(20, 10), 'segment', 100, 50)).toEqual([p(10, 10), p(20, 10)]);
    expect(clipLine(p(10, 10), p(20, 10), 'ray', 100, 50)).toEqual([p(10, 10), p(100, 10)]);
    expect(clipLine(p(10, 10), p(20, 10), 'line', 100, 50)).toEqual([p(0, 10), p(100, 10)]);
  });
  it('drops what is outside the pane', () => {
    expect(clipLine(p(10, 80), p(20, 90), 'line', 100, 50)).toBeNull();
    expect(clipLine(p(20, 10), p(10, 10), 'ray', 100, 50)).toEqual([p(20, 10), p(0, 10)]);
  });
});

describe('snapAngle', () => {
  it('moves the end onto the nearest multiple of 45 degrees, keeping the length', () => {
    const snapped = snapAngle(p(0, 0), p(10, 1));
    expect(snapped.x).toBeCloseTo(Math.hypot(10, 1));
    expect(snapped.y).toBeCloseTo(0);
    const diagonal = snapAngle(p(0, 0), p(10, 9));
    expect(diagonal.x).toBeCloseTo(diagonal.y);
  });
});
