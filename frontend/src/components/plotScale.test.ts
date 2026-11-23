import { extent, nearestIndex, niceTicks, scale } from './plotScale.ts';

describe('plot scales', () => {
  it('maps a linear domain onto a range, inverted ranges included', () => {
    const s = scale([0, 10], [100, 0]);
    expect(s(0)).toBe(100);
    expect(s(2.5)).toBe(75);
    expect(s(10)).toBe(0);
  });

  it('maps a log domain so that each decade gets the same width', () => {
    const s = scale([2, 200], [0, 100], true);
    expect(s(2)).toBeCloseTo(0, 12);
    expect(s(20)).toBeCloseTo(50, 12);
    expect(s(200)).toBeCloseTo(100, 12);
  });

  it('does not divide by zero on a flat domain', () => {
    expect(scale([3, 3], [0, 10])(3)).toBe(0);
  });

  it('picks round ticks of 1, 2 or 5 x 10^k and a clean zero', () => {
    expect(niceTicks(0, 10, 5)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(niceTicks(-0.3, 0.3, 4)).toEqual([-0.2, 0, 0.2]);
    expect(niceTicks(-40, 6, 4)).toEqual([-40, -20, 0]);
    expect(niceTicks(5, 5)).toEqual([5]);
  });

  it('pads the extent, ignores gaps and widens a flat series', () => {
    expect(extent([0, null, 10, Number.NaN])).toEqual([-0.8, 10.8]);
    expect(extent([4, 4])).toEqual([3, 5]);
    expect(extent([null])).toEqual([0, 1]);
  });

  it('finds the nearest x', () => {
    const xs = [2, 4, 8, 16];
    expect(nearestIndex(xs, 0)).toBe(0);
    expect(nearestIndex(xs, 5.9)).toBe(1);
    expect(nearestIndex(xs, 6.1)).toBe(2);
    expect(nearestIndex(xs, 99)).toBe(3);
    expect(nearestIndex([7], 1)).toBe(0);
  });
});
