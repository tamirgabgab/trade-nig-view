import type { Bar } from '../api/bars.ts';
import { distribution, rangeStats } from './returnStats.ts';

const day = (i: number) => new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10);
const t = (i: number) => Date.UTC(2024, 0, 1 + i) / 1000;
const bar = (i: number, open: number, close: number): Bar => ({
  time: day(i),
  open,
  high: Math.max(open, close),
  low: Math.min(open, close),
  close,
  volume: 1,
});

/** Golden model: the definitions written out with plain loops. */
function golden(values: number[]) {
  const n = values.length;
  let sum = 0;
  for (const v of values) sum += v;
  const mean = sum / n;
  let ss = 0;
  for (const v of values) ss += (v - mean) * (v - mean);
  return { n, mean, std: Math.sqrt(ss / (n - 1)) };
}

describe('distribution', () => {
  it('has the mean, the sample std and every value in one of ~sqrt(n) bins', () => {
    const values = [0.01, -0.02, 0.03, 0.005, -0.01, 0.02, 0, 0.015, -0.005];
    const d = distribution(values);
    expect(d).not.toBeNull();
    const g = golden(values);
    expect(d?.n).toBe(9);
    expect(d?.mean).toBeCloseTo(g.mean, 15);
    expect(d?.std).toBeCloseTo(g.std, 15);
    expect([d?.min, d?.max]).toEqual([-0.02, 0.03]);
    expect(d?.counts.length).toBe(5); // ceil(sqrt 9) = 3, at least 5
    expect(d?.counts.reduce((a, b) => a + b, 0)).toBe(9);
    expect(d?.edges[0]).toBe(-0.02);
    expect(d?.edges.at(-1)).toBeCloseTo(0.03, 15);
  });

  it('copes with one value and with none', () => {
    expect(distribution([])).toBeNull();
    const one = distribution([0.01]);
    expect(one?.std).toBeNaN();
    expect(one?.counts.reduce((a, b) => a + b, 0)).toBe(1);
  });
});

describe('rangeStats', () => {
  // Closes 100, 110, 99, 99, 108.9 (opens: the previous close, except a gap on bar 3).
  const bars = [
    bar(0, 100, 100),
    bar(1, 100, 110),
    bar(2, 110, 99),
    bar(3, 101, 99),
    bar(4, 99, 108.9),
  ];

  it('takes log returns close-to-close for the bars in the range, the first from the bar before', () => {
    const s = rangeStats(bars, t(1), t(4), 'log', 'close');
    const r = [Math.log(1.1), Math.log(0.9), 0, Math.log(1.1)];
    expect(s?.bars).toBe(4);
    expect([s?.firstTime, s?.lastTime]).toEqual([day(1), day(4)]);
    expect(s?.returns?.mean).toBeCloseTo(golden(r).mean, 14);
    expect(s?.returns?.std).toBeCloseTo(golden(r).std, 14);
    const c = r.slice(1).map((v, k) => v - (r[k] ?? Number.NaN));
    expect(s?.curvature?.n).toBe(3);
    expect(s?.curvature?.mean).toBeCloseTo(golden(c).mean, 14);
    expect(s?.curvature?.std).toBeCloseTo(golden(c).std, 14);
    // 3 intervals over 3 days.
    expect(s?.barsPerYear).toBeCloseTo(365.25, 10);
  });

  it('simple returns, open-to-close, and anchors in either order', () => {
    const s = rangeStats(bars, t(4), t(2), 'simple', 'open');
    const r = [99 / 110 - 1, 99 / 101 - 1, 108.9 / 99 - 1];
    expect(s?.returns?.n).toBe(3);
    expect(s?.returns?.mean).toBeCloseTo(golden(r).mean, 14);
  });

  it('skips the chart’s first bar (no previous close) and a range with no bars', () => {
    expect(rangeStats(bars, t(0), t(1), 'log', 'close')?.returns?.n).toBe(1);
    expect(rangeStats(bars, t(10), t(12), 'log', 'close')).toBeNull();
    expect(rangeStats(bars, t(2), t(2), 'log', 'close')?.barsPerYear).toBeNull();
  });
});
