import { hitTest, strokes } from './shapes.ts';
import { DEFAULT_STYLE, type Drawing, type DrawingType } from './types.ts';

const size = { width: 200, height: 100 };
const p = (x: number, y: number) => ({ x, y });

function drawing(type: DrawingType, props: Drawing['props'] = {}): Drawing {
  return {
    id: 'd',
    type,
    points: [],
    style: DEFAULT_STYLE,
    props,
    locked: false,
    hidden: false,
    z: 0,
    created_at: '',
    updated_at: '',
  };
}

describe('hitTest', () => {
  it('grabs a handle first when selected, then the line', () => {
    const line = drawing('trend_line');
    const pts = [p(10, 10), p(110, 10)];
    expect(hitTest(line, pts, p(11, 11), size, true)).toEqual({ kind: 'handle', index: 0 });
    expect(hitTest(line, pts, p(11, 11), size, false)).toEqual({ kind: 'body' });
    expect(hitTest(line, pts, p(60, 14), size, false)).toEqual({ kind: 'body' });
    expect(hitTest(line, pts, p(150, 10), size, false)).toBeNull(); // past the segment's end
  });

  it('a ray and an extended line reach past their second point', () => {
    const pts = [p(10, 10), p(110, 10)];
    expect(hitTest(drawing('ray'), pts, p(150, 10), size, false)).toEqual({ kind: 'body' });
    expect(hitTest(drawing('ray'), pts, p(2, 10), size, false)).toBeNull();
    expect(hitTest(drawing('extended_line'), pts, p(2, 10), size, false)).toEqual({ kind: 'body' });
  });

  it('horizontal and vertical lines span the pane', () => {
    expect(hitTest(drawing('horizontal_line'), [p(50, 40)], p(190, 42), size, false)).toEqual({
      kind: 'body',
    });
    expect(hitTest(drawing('horizontal_ray'), [p(50, 40)], p(20, 40), size, false)).toBeNull();
    expect(hitTest(drawing('vertical_line'), [p(50, 40)], p(52, 95), size, false)).toEqual({
      kind: 'body',
    });
  });

  it('a rectangle is grabbed on its edge, inside only when filled', () => {
    const pts = [p(20, 20), p(80, 60)];
    expect(hitTest(drawing('rectangle', { fill: false }), pts, p(50, 21), size, false)).toEqual({
      kind: 'body',
    });
    expect(hitTest(drawing('rectangle', { fill: false }), pts, p(50, 40), size, false)).toBeNull();
    expect(hitTest(drawing('rectangle', { fill: true }), pts, p(50, 40), size, false)).toEqual({
      kind: 'body',
    });
  });

  it('a text label is grabbed inside its box', () => {
    const text = drawing('text', { text: 'Breakout', font_size: 14 });
    expect(hitTest(text, [p(10, 10)], p(30, 18), size, false)).toEqual({ kind: 'body' });
    expect(hitTest(text, [p(10, 10)], p(30, 60), size, false)).toBeNull();
  });
});

describe('strokes', () => {
  it('clips a ray to the pane', () => {
    expect(strokes(drawing('ray'), [p(10, 10), p(20, 10)], size)).toEqual([
      [p(10, 10), p(200, 10)],
    ]);
  });
});
