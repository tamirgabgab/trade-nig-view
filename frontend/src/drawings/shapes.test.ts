import { channelOffset, fibLines, handles, hitTest, strokes } from './shapes.ts';
import { DEFAULT_STYLE, type Drawing, type DrawingType } from './types.ts';

const size = { width: 200, height: 100 };
const p = (x: number, y: number) => ({ x, y });
/** A chart where y = 100 - price. */
const Y = (price: number) => 100 - price;

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
    expect(hitTest(line, pts, p(11, 11), size, true, Y)).toEqual({ kind: 'handle', index: 0 });
    expect(hitTest(line, pts, p(11, 11), size, false, Y)).toEqual({ kind: 'body' });
    expect(hitTest(line, pts, p(60, 14), size, false, Y)).toEqual({ kind: 'body' });
    expect(hitTest(line, pts, p(150, 10), size, false, Y)).toBeNull(); // past the segment's end
  });

  it('a ray and an extended line reach past their second point', () => {
    const pts = [p(10, 10), p(110, 10)];
    expect(hitTest(drawing('ray'), pts, p(150, 10), size, false, Y)).toEqual({ kind: 'body' });
    expect(hitTest(drawing('ray'), pts, p(2, 10), size, false, Y)).toBeNull();
    expect(hitTest(drawing('extended_line'), pts, p(2, 10), size, false, Y)).toEqual({
      kind: 'body',
    });
  });

  it('horizontal and vertical lines span the pane', () => {
    expect(hitTest(drawing('horizontal_line'), [p(50, 40)], p(190, 42), size, false, Y)).toEqual({
      kind: 'body',
    });
    expect(hitTest(drawing('horizontal_ray'), [p(50, 40)], p(20, 40), size, false, Y)).toBeNull();
    expect(hitTest(drawing('vertical_line'), [p(50, 40)], p(52, 95), size, false, Y)).toEqual({
      kind: 'body',
    });
  });

  it('a rectangle is grabbed on its edge, inside only when filled', () => {
    const pts = [p(20, 20), p(80, 60)];
    expect(hitTest(drawing('rectangle', { fill: false }), pts, p(50, 21), size, false, Y)).toEqual({
      kind: 'body',
    });
    expect(
      hitTest(drawing('rectangle', { fill: false }), pts, p(50, 40), size, false, Y),
    ).toBeNull();
    expect(hitTest(drawing('rectangle', { fill: true }), pts, p(50, 40), size, false, Y)).toEqual({
      kind: 'body',
    });
    // No `fill` prop: filled, as it is drawn.
    expect(hitTest(drawing('rectangle'), pts, p(50, 40), size, false, Y)).toEqual({ kind: 'body' });
  });

  it('a text label is grabbed inside its box', () => {
    const text = drawing('text', { text: 'Breakout', font_size: 14 });
    expect(hitTest(text, [p(10, 10)], p(30, 18), size, false, Y)).toEqual({ kind: 'body' });
    expect(hitTest(text, [p(10, 10)], p(30, 60), size, false, Y)).toBeNull();
  });
});

describe('strokes', () => {
  it('clips a ray to the pane', () => {
    expect(strokes(drawing('ray'), [p(10, 10), p(20, 10)], size, Y)).toEqual([
      [p(10, 10), p(200, 10)],
    ]);
  });
});

describe('Fib and channel geometry', () => {
  it('a retracement spans its anchors with 0 at the second one', () => {
    const fib = {
      ...drawing('fib_retracement'),
      points: [
        { time: 0, price: 10 },
        { time: 0, price: 90 },
      ],
    };
    const lines = fibLines(fib, [p(20, 90), p(120, 10)], Y);
    const zero = lines.find((l) => l.level.value === 0);
    const one = lines.find((l) => l.level.value === 1);
    expect(zero).toMatchObject({ price: 90, y: 10, x1: 20, x2: 120 });
    expect(one).toMatchObject({ price: 10, y: 90 });
    expect(hitTest(fib, [p(20, 90), p(120, 10)], p(70, 51), size, false, Y)).toEqual({
      kind: 'body',
    });
  });

  it('a Fib with every level hidden is still grabbed on its trend', () => {
    const fib = {
      ...drawing('fib_retracement', {
        levels: [{ value: 0.5, color: '#000000', visible: false }],
      }),
      points: [
        { time: 0, price: 10 },
        { time: 0, price: 90 },
      ],
    };
    expect(hitTest(fib, [p(20, 90), p(120, 10)], p(70, 50), size, false, Y)).toEqual({
      kind: 'body',
    });
    expect(hitTest(fib, [p(20, 90), p(120, 10)], p(70, 20), size, false, Y)).toBeNull();
  });

  it('an extension starts at C, as wide as A to B', () => {
    const ext = {
      ...drawing('fib_extension'),
      points: [
        { time: 0, price: 10 },
        { time: 0, price: 30 },
        { time: 0, price: 20 },
      ],
    };
    const lines = fibLines(ext, [p(10, 90), p(40, 70), p(60, 80)], Y);
    expect(lines.find((l) => l.level.value === 1)).toMatchObject({ price: 40, x1: 60, x2: 90 });
  });

  it('a channel is grabbed between its lines', () => {
    const pts = [p(20, 60), p(120, 40), p(70, 30)];
    expect(channelOffset(pts)).toBe(-20);
    const channel = drawing('parallel_channel');
    expect(hitTest(channel, pts, p(70, 40), size, false, Y)).toEqual({ kind: 'body' });
    expect(hitTest(channel, pts, p(70, 70), size, false, Y)).toBeNull();
    expect(strokes(channel, pts, size, Y)).toHaveLength(2);
  });

  it('a range is grabbed inside its box', () => {
    const range = drawing('date_price_range');
    expect(hitTest(range, [p(20, 20), p(80, 60)], p(50, 40), size, false, Y)).toEqual({
      kind: 'body',
    });
    expect(hitTest(range, [p(20, 20), p(80, 60)], p(150, 40), size, false, Y)).toBeNull();
  });
});

describe('trade plan', () => {
  // Entry at (10, 50), target at (110, 20) (up and 100 px later), stop clicked at (40, 70).
  const plan = drawing('trade_plan');
  const pts = [p(10, 50), p(110, 20), p(40, 70)];

  it('is grabbed inside the target or the stop box, as wide as the holding time', () => {
    expect(hitTest(plan, pts, p(60, 30), size, false, Y)).toEqual({ kind: 'body' });
    expect(hitTest(plan, pts, p(100, 65), size, false, Y)).toEqual({ kind: 'body' });
    expect(hitTest(plan, pts, p(150, 30), size, false, Y)).toBeNull();
    expect(hitTest(plan, pts, p(60, 90), size, false, Y)).toBeNull();
    expect(strokes(plan, pts, size, Y)).toEqual([]);
  });

  it('shows the stop handle on the right edge, under the target', () => {
    expect(handles(plan, pts)).toEqual([p(10, 50), p(110, 20), p(110, 70)]);
    expect(hitTest(plan, pts, p(110, 70), size, true, Y)).toEqual({ kind: 'handle', index: 2 });
  });
});
