import { isPattern, patternRatios } from './patterns.ts';
import { handles, hitTest, neckline, strokes } from './shapes.ts';
import { newDrawing } from './manager.ts';
import type { Anchor } from './types.ts';

const at = (price: number, time = 0): Anchor => ({ time, price });
const size = { width: 800, height: 400 };
const priceToY = (price: number) => 200 - price;

describe('pattern ratios', () => {
  it('reads the XABCD ratios from the legs, each on the line it labels', () => {
    // X 100 -> A 200 (XA 100); B 138.2 (AB 61.8); C 176.4 (BC 38.2); D 78.6 below A? (CD 97.8)
    const pts = [at(100), at(200), at(138.2), at(176.4), at(78.6)];
    const r = patternRatios('xabcd', pts);
    expect(r.map(({ from, to }) => [from, to])).toEqual([
      [0, 2],
      [1, 3],
      [2, 4],
      [0, 4],
    ]);
    expect(r[0]?.value).toBeCloseTo(0.618, 12); // AB / XA
    expect(r[1]?.value).toBeCloseTo(38.2 / 61.8, 12); // BC / AB
    expect(r[2]?.value).toBeCloseTo(97.8 / 38.2, 12); // CD / BC
    expect(r[3]?.value).toBeCloseTo(1.214, 12); // AD / XA
  });

  it('reads the ABCD ratios; a flat leg gives no ratio; a head and shoulders has none', () => {
    const r = patternRatios('abcd', [at(10), at(20), at(15), at(25)]);
    expect(r.map((x) => x.value)).toEqual([0.5, 2]);
    expect(Number.isNaN(patternRatios('abcd', [at(10), at(10), at(15), at(25)])[0]?.value)).toBe(
      true,
    );
    expect(patternRatios('head_shoulders', [])).toEqual([]);
    expect(isPattern('xabcd')).toBe(true);
    expect(isPattern('trend_line')).toBe(false);
  });
});

describe('pattern and icon shapes', () => {
  it('strokes a pattern as its zigzag and grabs it on a leg; a handle per point', () => {
    const d = newDrawing('abcd', [at(0), at(0), at(0), at(0)], 'p');
    const pts = [
      { x: 0, y: 100 },
      { x: 100, y: 0 },
      { x: 200, y: 50 },
      { x: 300, y: 0 },
    ];
    expect(strokes(d, pts, size, priceToY)).toHaveLength(3);
    expect(hitTest(d, pts, { x: 50, y: 50 }, size, false, priceToY)).toEqual({ kind: 'body' });
    expect(hitTest(d, pts, { x: 50, y: 150 }, size, false, priceToY)).toBeNull();
    expect(handles(d, pts)).toHaveLength(4);
  });

  it('carries the neckline through the neck points to the last point', () => {
    const pts = [0, 1, 2, 3, 4, 5, 6].map((i) => ({ x: i * 100, y: 0 }));
    pts[2] = { x: 200, y: 100 };
    pts[4] = { x: 400, y: 120 };
    expect(neckline(pts)).toEqual([
      { x: 200, y: 100 },
      { x: 600, y: 140 },
    ]);
  });

  it('grabs an icon inside its square, sized by its props', () => {
    const d = newDrawing('icon', [at(0)], 'i', { icon: 'flag', icon_size: 40 });
    expect(d.props).toEqual({ icon: 'flag', icon_size: 40 });
    const pts = [{ x: 100, y: 100 }];
    expect(hitTest(d, pts, { x: 118, y: 82 }, size, false, priceToY)).toEqual({ kind: 'body' });
    expect(hitTest(d, pts, { x: 125, y: 100 }, size, false, priceToY)).toBeNull();
  });
});
