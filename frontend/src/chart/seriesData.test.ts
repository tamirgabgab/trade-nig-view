import type { Bar } from '../api/bars.ts';
import {
  compareLine,
  chartTimes,
  crosshairIndex,
  hasIntradayTimes,
  initialRange,
  INITIAL_VISIBLE_BARS,
  prependedCount,
  priceFormat,
  RIGHT_OFFSET_BARS,
  toCandles,
  toHistogram,
  toHollowCandles,
  toLine,
  toMarkers,
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

describe('toHollowCandles', () => {
  it('colours by close vs previous close and hollows bodies that close above their open', () => {
    const points = toHollowCandles(BARS, DATES, 'up', 'down');
    // bar 0: vs its own open (11 > 10) -> up, hollow; bar 1: 10.5 < 11 -> down, filled;
    // bar 2: 10.5 == 10.5 (unchanged) -> up, close == open -> filled.
    expect(points.map((p) => p.borderColor)).toEqual(['up', 'down', 'up']);
    expect(points.map((p) => p.color)).toEqual(['rgba(0, 0, 0, 0)', 'down', 'up']);
    expect(points[1]).toMatchObject({ time: '2026-11-19', open: 11, close: 10.5 });
  });
});

describe('toLine', () => {
  it('plots closes', () => {
    expect(toLine(BARS, DATES)).toEqual([
      { time: '2026-11-18', value: 11 },
      { time: '2026-11-19', value: 10.5 },
      { time: '2026-11-20', value: 10.5 },
    ]);
  });
});

describe('prependedCount', () => {
  const older: Bar = { ...BARS[0], time: '2026-11-17' } as Bar;

  it('counts bars added in front of the same history', () => {
    expect(prependedCount(BARS, [older, ...BARS])).toBe(1);
  });

  it('is 0 for a different data set, an unchanged one, or an empty start', () => {
    expect(prependedCount(BARS, BARS)).toBe(0);
    expect(prependedCount([], BARS)).toBe(0);
    expect(prependedCount(BARS, [older, ...BARS.slice(1)])).toBe(0);
    expect(prependedCount(BARS, [older, ...BARS, older])).toBe(0);
  });
});

describe('toMarkers', () => {
  it('merges several marker outputs in time order, with up/down colours and a fallback', () => {
    const a = { values: [null, -1, 1], color: '#111111', upColor: '#00ff00' };
    const b = { values: [1, 0, -1], color: '#222222' };
    expect(toMarkers([a, b], DATES)).toEqual([
      { time: DATES[0], position: 'belowBar', shape: 'arrowUp', color: '#222222' },
      { time: DATES[1], position: 'aboveBar', shape: 'arrowDown', color: '#111111' },
      { time: DATES[2], position: 'belowBar', shape: 'arrowUp', color: '#00ff00' },
      { time: DATES[2], position: 'aboveBar', shape: 'arrowDown', color: '#222222' },
    ]);
  });

  it('draws a fixed-look source as dots on every bar with a value, shifted to the left', () => {
    // Pivots: the value of bar 2 is drawn on bar 0 (confirmed 2 bars later).
    const pivots = {
      values: [null, null, 123.5, null],
      color: '#f23645',
      shape: 'circle' as const,
      position: 'aboveBar' as const,
      shift: 2,
    };
    expect(toMarkers([pivots], DATES)).toEqual([
      { time: DATES[0], position: 'aboveBar', shape: 'circle', color: '#f23645' },
    ]);
  });

  it('ignores values past the last bar', () => {
    expect(toMarkers([{ values: [null, null, null, 1], color: '#111111' }], DATES)).toEqual([]);
  });
});

describe('toHistogram', () => {
  it('colours by sign and by direction against the previous bar', () => {
    const times = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8'];
    const colors = { up: 'U', upWeak: 'u', down: 'D', downWeak: 'd' };
    expect(toHistogram([null, 1, 2, 1, -1, -0.5, -0.5, 2], times, colors)).toEqual([
      { time: 'd1' },
      // No previous bar and an equal one count as not growing (TradingView's hist[1] < hist).
      { time: 'd2', value: 1, color: 'u' },
      { time: 'd3', value: 2, color: 'U' },
      { time: 'd4', value: 1, color: 'u' },
      { time: 'd5', value: -1, color: 'D' },
      { time: 'd6', value: -0.5, color: 'd' },
      { time: 'd7', value: -0.5, color: 'D' },
      { time: 'd8', value: 2, color: 'U' },
    ]);
  });
});

describe('compareLine', () => {
  it('keeps only the bars the chart has, so the axis gets no extra bars', () => {
    const bar = (time: string, close: number) => ({
      time,
      open: 1,
      high: 1,
      low: 1,
      close,
      volume: 0,
    });
    const other = [bar('2024-01-01', 5), bar('2024-01-02', 6), bar('2024-01-04', 8)];
    expect(compareLine(['2024-01-02', '2024-01-03', '2024-01-04'], other, 'UTC')).toEqual([
      { time: '2024-01-02', value: 6 },
      { time: '2024-01-04', value: 8 },
    ]);
  });
});
