import { describe, expect, it } from 'vitest';

import type { SyntheticDefinition } from '../api/synthetic.ts';
import {
  addWeekdays,
  definitionProblem,
  firstDateEndingBefore,
  lastDate,
} from './syntheticForm.ts';

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
    [{ firstDate: '2026-01-01' }, /after today/],
  ])('rejects %o', (change, message) => {
    expect(definitionProblem({ ...ok, ...change }, '2026-11-27')).toMatch(message);
  });
});
