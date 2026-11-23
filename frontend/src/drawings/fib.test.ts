import { DEFAULT_FIB_LEVELS, fibLevels, fibPrice } from './fib.ts';
import { formatDuration, rangeLabel } from './measure.ts';
import { DEFAULT_STYLE, type Drawing, type DrawingType } from './types.ts';

function drawing(type: DrawingType, prices: number[], times: number[] = []): Drawing {
  return {
    id: 'd',
    type,
    points: prices.map((price, i) => ({ time: times[i] ?? 0, price })),
    style: DEFAULT_STYLE,
    props: {},
    locked: false,
    hidden: false,
    z: 0,
    created_at: '',
    updated_at: '',
  };
}

describe('fibPrice', () => {
  it('retracement: 0 at the second anchor, 1 at the first', () => {
    const pts = drawing('fib_retracement', [100, 200]).points;
    expect(fibPrice('fib_retracement', pts, 0)).toBe(200);
    expect(fibPrice('fib_retracement', pts, 1)).toBe(100);
    expect(fibPrice('fib_retracement', pts, 0.618)).toBeCloseTo(138.2, 12);
    expect(fibPrice('fib_retracement', pts, 1.618)).toBeCloseTo(38.2, 12);
  });

  it('extension: C + r (B - A)', () => {
    const pts = drawing('fib_extension', [100, 150, 120]).points;
    expect(fibPrice('fib_extension', pts, 0)).toBe(120);
    expect(fibPrice('fib_extension', pts, 1)).toBe(170);
    expect(fibPrice('fib_extension', pts, 1.618)).toBeCloseTo(200.9, 12);
  });

  it('lists only visible levels, sorted by ratio', () => {
    const fib = drawing('fib_retracement', [0, 10]);
    expect(fibLevels(fib)).toHaveLength(DEFAULT_FIB_LEVELS.length);
    fib.props = {
      levels: [
        { value: 1, color: '#000000', visible: true },
        { value: 0.5, color: '#000000', visible: false },
        { value: 0, color: '#000000', visible: true },
      ],
    };
    expect(fibLevels(fib).map((l) => [l.level.value, l.price])).toEqual([
      [0, 10],
      [1, 0],
    ]);
  });
});

describe('range labels', () => {
  it('formats a duration in its two largest units', () => {
    expect(formatDuration(32 * 86_400 + 4 * 3600 + 120)).toBe('32d 4h');
    expect(formatDuration(3 * 3600 + 15 * 60)).toBe('3h 15m');
    expect(formatDuration(0)).toBe('0m');
    expect(formatDuration(-2 * 86_400)).toBe('-2d');
  });

  it('shows the change, the bars and the volume per tool', () => {
    const times = [0, 23 * 86_400];
    const span = { bars: 23, volume: 1_250_000 };
    expect(rangeLabel(drawing('price_range', [200, 212.4], times), 2, span)).toEqual([
      '+12.40 (6.20%)',
    ]);
    expect(rangeLabel(drawing('date_range', [200, 190], times), 2, span)).toEqual(['23 bars, 23d']);
    expect(rangeLabel(drawing('date_price_range', [200, 190], times), 2, span)).toEqual([
      '-10.00 (-5.00%)',
      '23 bars, 23d, vol 1.25M',
    ]);
  });
});
