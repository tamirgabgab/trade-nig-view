import { describe, expect, it } from 'vitest';

import type { SyntheticDefinition } from '../api/synthetic.ts';
import {
  addWeekdays,
  definitionProblem,
  firstDateEndingBefore,
  lastDate,
} from './syntheticChecks.ts';

describe('synthetic symbol dates', () => {
  it('counts weekdays only, rolling a weekend start forward', () => {
    expect(addWeekdays('2024-06-01', 0)).toBe('2024-06-03'); // Saturday -> Monday
    expect(addWeekdays('2024-06-07', 1)).toBe('2024-06-10'); // Friday + 1 -> Monday
    expect(addWeekdays('2024-06-10', -1)).toBe('2024-06-07');
  });

  it('agrees with the backend on the last bar (2015-01-02 + 1000 bars)', () => {
    expect(lastDate('2015-01-02', 1000)).toBe('2018-11-01');
    expect(lastDate('2024-01-02', 1)).toBe('2024-01-02');
  });

  it('pre-fills a first date that ends on the last weekday before today', () => {
    // Monday 2026-11-30: the last weekday before it is Friday 2026-11-27.
    const first = firstDateEndingBefore('2026-11-30', 2500);
    expect(lastDate(first, 2500)).toBe('2026-11-27');
    expect(lastDate(firstDateEndingBefore('2026-11-27', 100), 100)).toBe('2026-11-26');
  });
});

describe('definition checks', () => {
  const ok: SyntheticDefinition = {
    kind: 'scenario',
    name: 'WALK1',
    fullName: 'Random walk',
    scenario: 'random_walk',
    seed: 7,
    firstDate: '2015-01-02',
    firstPrice: 50,
    bars: 1000,
    currency: 'ILS',
  };

  it('accepts a valid definition', () => {
    expect(definitionProblem(ok, '2026-11-27')).toBeNull();
    expect(definitionProblem({ ...ok, name: 'A.B-C_D' }, '2026-11-27')).toBeNull();
  });

  it.each([
    [{ name: '' }, /Name/],
    [{ name: '1ABC' }, /Name/],
    [{ name: 'ABCDEFGHIJKLM' }, /Name/],
    [{ name: 'A B' }, /Name/],
    [{ fullName: '  ' }, /full name/],
    [{ bars: 99 }, /Bars/],
    [{ bars: 10_001 }, /Bars/],
    [{ bars: Number.NaN }, /Bars/],
    [{ firstPrice: 0 }, /price/],
    [{ seed: -1 }, /Seed/],
    [{ firstDate: '' }, /first date/],
    [{ firstDate: '2026-01-01' }, /not before today/],
    // Ending today itself: today's hours are not over.
    [{ firstDate: addWeekdays('2026-11-27', -99), bars: 100 }, /not before today/],
    [{ firstDate: '1969-12-31' }, /1970/],
  ])('rejects %o', (change, message) => {
    expect(definitionProblem({ ...ok, ...change }, '2026-11-27')).toMatch(message);
  });
});

describe('dwelling definition checks', () => {
  const home: SyntheticDefinition = {
    kind: 'dwelling',
    name: 'HOME',
    fullName: 'Dwelling prices',
    seed: 1,
    firstPrice: 100,
    series: 'dwelling',
    noisePct: 0.2,
    causal: false,
    lagMonths: 2,
  };

  it('needs no dates or length (its index sets them)', () => {
    expect(definitionProblem(home, '2026-11-27')).toBeNull();
    expect(
      definitionProblem({ ...home, noisePct: 0, causal: true, lagMonths: 0 }, '2026-11-27'),
    ).toBeNull();
  });

  it.each([
    [{ noisePct: 5.1 }, /Noise/],
    [{ noisePct: -0.1 }, /Noise/],
    [{ noisePct: Number.NaN }, /Noise/],
    [{ lagMonths: 13 }, /lag/],
    [{ lagMonths: 1.5 }, /lag/],
    [{ firstPrice: 0 }, /price/],
  ])('rejects %o', (change, message) => {
    expect(definitionProblem({ ...home, ...change }, '2026-11-27')).toMatch(message);
  });
});
