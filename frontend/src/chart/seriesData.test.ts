import type { Bar } from '../api/bars.ts';
import {
  chartTimes,
  crosshairIndex,
  hasIntradayTimes,
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

const DATES = BARS.map((bar) => bar.time);

/** Three 1h AAPL bars of 2026-02-05 (UTC epoch seconds): 09:30, 10:30, 11:30 New York. */
const HOURLY: Bar[] = [1_770_301_800, 1_770_305_400, 1_770_309_000].map((time, i) => ({
  time,
  open: 10 + i,
  high: 11 + i,
  low: 9 + i,
  close: 10.5 + i,
  volume: 100,
}));

describe('chartTimes', () => {
  it('passes session dates through', () => {
    expect(hasIntradayTimes(BARS)).toBe(false);
    expect(chartTimes(BARS, 'Asia/Jerusalem')).toEqual(DATES);
  });

  it('shifts intraday UTC seconds to the display zone (16:30 Israel = 09:30 New York)', () => {
    expect(hasIntradayTimes(HOURLY)).toBe(true);
    const times = chartTimes(HOURLY, 'Asia/Jerusalem');
    expect(times).toEqual([1_770_309_000, 1_770_312_600, 1_770_316_200]);
    expect(new Date(Number(times[0]) * 1000).toISOString()).toBe('2026-02-05T16:30:00.000Z');
    expect(chartTimes(HOURLY, 'UTC')).toEqual(HOURLY.map((bar) => bar.time));
  });

  it('handles no bars', () => {
    expect(hasIntradayTimes([])).toBe(false);
    expect(chartTimes([], 'Asia/Jerusalem')).toEqual([]);
  });
});

describe('toCandles', () => {
  it('keeps time and OHLC, drops volume', () => {
    expect(toCandles(BARS, DATES)[0]).toEqual({
      time: '2026-11-18',
      open: 10,
      high: 12,
      low: 9,
      close: 11,
    });
    expect(toCandles(BARS, DATES)).toHaveLength(3);
  });

  it('uses the given chart times', () => {
    expect(toCandles(HOURLY, [1, 2, 3]).map((point) => point.time)).toEqual([1, 2, 3]);
  });
});

describe('toVolume', () => {
  it('colors by close vs open (close == open counts as up)', () => {
    expect(toVolume(BARS, DATES, 'U', 'D')).toEqual([
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
