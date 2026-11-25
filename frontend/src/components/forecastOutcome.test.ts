import type { Bar } from '../api/bars.ts';
import type { Forecast } from '../api/forecast.ts';
import { forecastOutcomes, outcomeSummary, pitVerdict } from './forecastOutcome.ts';

const LEVELS = [0.025, 0.1, 0.25, 0.5, 0.75, 0.9, 0.975];
/** Close quantiles 100 +- a spread at LEVELS; percentiles 1..99 spread evenly over 90..110. */
const horizon = (h: number) => ({
  h,
  open: [],
  high: [],
  low: [],
  close: [90, 95, 98, 100, 102, 105, 110],
  closePercentiles: Array.from({ length: 99 }, (_, i) => 90 + ((i + 1) / 100) * 20),
  pUp: 0.5,
  expectedRange: 0.02,
});

const forecast: Forecast = {
  symbol: 'AAPL',
  model: 'c',
  auto: true,
  params: { window: 500, ridge: 100, lags: 3 },
  lastTime: '2024-01-02',
  lastClose: 100,
  levels: LEVELS,
  horizons: [1, 2, 3, 4, 5].map(horizon),
  validation: [],
  coefficients: [],
  tuning: [],
};

const bar = (time: string, close: number): Bar => ({
  time,
  open: close,
  high: close,
  low: close,
  close,
  volume: 0,
});

describe('forecastOutcomes', () => {
  it('scores each revealed bar: error, band and percentile; nothing past the shown bars', () => {
    const bars = [
      bar('2024-01-01', 99),
      bar('2024-01-02', 100),
      bar('2024-01-03', 101), // inside 50 %
      bar('2024-01-04', 104), // inside 80 %
      bar('2024-01-05', 89), // outside 95 %
    ];
    const out = forecastOutcomes(forecast, bars);
    expect(out.map((o) => o.band)).toEqual([50, 80, null]);
    expect(out[0]).toMatchObject({ h: 1, time: '2024-01-03', median: 100, actual: 101, error: 1 });
    expect(out[0]?.errorPct).toBeCloseTo(0.01, 12);
    expect(out[0]?.percentile).toBe(55); // 101 is the 55th of 1..99 % (90 + p * 20)
    expect(out[2]?.percentile).toBe(0);
    expect(outcomeSummary(out, 5)).toBe(
      '3 of 5 bars: 1 inside 50 %, 2 inside 80 %, 2 inside 95 %; mean |error| 5.33 %',
    );
  });

  it('is empty when the origin is not among the bars or nothing came after it', () => {
    expect(forecastOutcomes(forecast, [bar('2023-12-29', 1)])).toEqual([]);
    expect(forecastOutcomes(forecast, [bar('2024-01-02', 100)])).toEqual([]);
  });

  it('puts the 95 % bounds inside the 95 % band', () => {
    const out = forecastOutcomes(forecast, [bar('2024-01-02', 100), bar('2024-01-03', 110)]);
    expect(out[0]?.band).toBe(95);
  });
});

describe('pitVerdict', () => {
  it('reads heavy tails, light tails and a bias', () => {
    const flat = Array.from({ length: 10 }, () => 0.1);
    expect(pitVerdict(flat, 500)).toMatch(/the width fits\.$/);
    expect(pitVerdict([0.2, 0.08, 0.07, 0.07, 0.08, 0.08, 0.07, 0.07, 0.08, 0.2], 500)).toMatch(
      /too narrow/,
    );
    expect(pitVerdict([0.02, 0.12, 0.12, 0.12, 0.12, 0.12, 0.12, 0.12, 0.12, 0.02], 500)).toMatch(
      /too wide/,
    );
    expect(pitVerdict([0.1, 0.15, 0.15, 0.15, 0.15, 0.05, 0.05, 0.05, 0.05, 0.1], 500)).toMatch(
      /70% fell below the median: the forecast was too high/,
    );
  });
});
