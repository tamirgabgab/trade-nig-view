import type { Bar } from '../api/bars.ts';
import {
  crosshairIndex,
  initialRange,
  INITIAL_VISIBLE_BARS,
  priceFormat,
  RIGHT_OFFSET_BARS,
  toCandles,
  toVolume,
} from './seriesData.ts';

const BARS: Bar[] = [
  { time: '2026-11-18', open: 10, high: 12, low: 9, close: 11, volume: 100 }, // up
  { time: '2026-11-19', open: 11, high: 11.5, low: 10, close: 10.5, volume: 200 }, // down
  { time: '2026-11-20', open: 10.5, high: 11, low: 10, close: 10.5, volume: 0 }, // doji -> up
];

describe('toCandles', () => {
  it('keeps time and OHLC, drops volume', () => {
    expect(toCandles(BARS)[0]).toEqual({
      time: '2026-11-18',
      open: 10,
      high: 12,
      low: 9,
      close: 11,
    });
    expect(toCandles(BARS)).toHaveLength(3);
  });
});

describe('toVolume', () => {
  it('colors by close vs open (close == open counts as up)', () => {
    expect(toVolume(BARS, 'U', 'D')).toEqual([
      { time: '2026-11-18', value: 100, color: 'U' },
      { time: '2026-11-19', value: 200, color: 'D' },
      { time: '2026-11-20', value: 0, color: 'U' },
    ]);
  });
});

describe('initialRange', () => {
  it('shows the last bars plus the right offset', () => {
    expect(initialRange(1000)).toEqual({
      from: 1000 - INITIAL_VISIBLE_BARS,
      to: 999 + RIGHT_OFFSET_BARS,
    });
  });

  it('shows every bar when there are fewer than the window', () => {
    expect(initialRange(20, 150, 5)).toEqual({ from: 0, to: 24 });
  });

  it('handles a single bar and an empty series', () => {
    expect(initialRange(1, 150, 5)).toEqual({ from: 0, to: 5 });
    expect(initialRange(0, 150, 5)).toEqual({ from: 0, to: 5 });
  });
});

describe('crosshairIndex', () => {
  it('rounds the logical index to the nearest bar', () => {
    expect(crosshairIndex(1.4, true, 3)).toBe(1);
    expect(crosshairIndex(1.6, true, 3)).toBe(2);
  });

  it('returns null off the data', () => {
    expect(crosshairIndex(undefined, false, 3)).toBeNull();
    expect(crosshairIndex(1, false, 3)).toBeNull();
    expect(crosshairIndex(-1, true, 3)).toBeNull();
    expect(crosshairIndex(3, true, 3)).toBeNull();
  });
});

describe('priceFormat', () => {
  it('maps decimals to precision and minimum move', () => {
    expect(priceFormat(2)).toEqual({ precision: 2, minMove: 0.01 });
    expect(priceFormat(5).minMove).toBeCloseTo(0.00001, 12);
    expect(priceFormat(0)).toEqual({ precision: 0, minMove: 1 });
  });

  it('clamps nonsense values', () => {
    expect(priceFormat(-3).precision).toBe(0);
    expect(priceFormat(20).precision).toBe(8);
  });
});
