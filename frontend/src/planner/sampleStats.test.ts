import { bins, intervalProbability, quantile, wilson } from './sampleStats.ts';

describe('sampleStats', () => {
  it('interpolates a quantile between the order statistics', () => {
    const sorted = [1, 2, 3, 4, 5];
    expect(quantile(sorted, 0.05)).toBeCloseTo(1.2, 12);
    expect(quantile(sorted, 0.5)).toBe(3);
    expect(quantile(sorted, 0.95)).toBeCloseTo(4.8, 12);
    expect(quantile(sorted, 1)).toBe(5);
    expect(quantile([], 0.5)).toBeNaN();
  });

  it('gives the Wilson interval of a share', () => {
    // Worked by hand (and by the same formula in Python): 30 of 100.
    const [low, high] = wilson(30, 100);
    expect(low).toBeCloseTo(0.2189489, 6);
    expect(high).toBeCloseTo(0.3958485, 6);
    // No hit in 50 worlds is not a chance of exactly zero: up to about 7 %.
    expect(wilson(0, 50)[0]).toBeCloseTo(0, 12);
    expect(wilson(0, 50)[1]).toBeCloseTo(0.0713476, 6);
    expect(wilson(50, 50)[0]).toBeCloseTo(0.9286524, 6);
    expect(wilson(50, 50)[1]).toBeCloseTo(1, 12);
  });

  it('counts an interval with both ends in', () => {
    const { p, low, high } = intervalProbability([1, 2, 3, 4], 2, 3);
    expect(p).toBe(0.5);
    expect(low).toBeLessThan(0.5);
    expect(high).toBeGreaterThan(0.5);
    expect(intervalProbability([1, 2, 3, 4], 10, 20).p).toBe(0);
    expect(intervalProbability([1, 2, 3, 4], 0, 9).p).toBe(1);
  });

  it('bins the values and keeps the tails in the end bins', () => {
    expect(bins([0, 0.5, 1, 2, 9, -3], 0, 2, 2)).toEqual([3, 3]);
    expect(bins([], 0, 1, 3)).toEqual([0, 0, 0]);
  });
});

// The learn page's worked example is this module's own arithmetic.
const PAGES = import.meta.glob<string>('../../../docs/indicators/risk-metrics.md', {
  query: '?raw',
  import: 'default',
  eager: true,
});

describe('the Risk metrics learn page', () => {
  it('prints the interval this module computes for 13 worlds of 20', () => {
    const [page] = Object.values(PAGES);
    const worlds = [820, 910, 950, 1010, 1040, 1080, 1120, 1150, 1190, 1230];
    worlds.push(1260, 1300, 1340, 1380, 1430, 1480, 1540, 1620, 1730, 1900);
    const { p, low, high } = intervalProbability(worlds, 1000, 1500);
    const percent = (share: number) => `${String(Math.round(share * 100))} %`;
    expect(p).toBe(13 / 20);
    expect(page).toContain(`interval of ${percent(low)} to ${percent(high)}`);
    expect(page).toContain(`5 % percentile:** ${String(quantile(worlds, 0.05))},`);
  });
});
