import { equivalentReturn, rangeLabel } from './measure.ts';
import { DEFAULT_STYLE, type Drawing, type ReturnUnit } from './types.ts';

const DAY = 86_400;
const at = (days: number, price: number) => ({ time: days * DAY, price });

/** Golden model: the rate r per unit with (1 + r)^m = late / early, m = span in units. */
const golden = (ratio: number, units: number) => Math.exp(Math.log(ratio) / units) - 1;

function returnRange(days: number, from: number, to: number, unit?: ReturnUnit): Drawing {
  return {
    id: 'r',
    type: 'return_range',
    points: [at(0, from), at(days, to)],
    style: DEFAULT_STYLE,
    props: unit === undefined ? {} : { unit },
    locked: false,
    hidden: false,
    z: 0,
    created_at: '',
    updated_at: '',
  };
}

describe('equivalentReturn', () => {
  it('compounds to the same change: +21 % over two years is +10 % a year (CAGR)', () => {
    expect(equivalentReturn(at(0, 100), at(730.5, 121), null, 'year')).toBeCloseTo(0.1, 12);
  });

  it.each<[ReturnUnit, number]>([
    ['year', 1000 / 365.25],
    ['month', (1000 / 365.25) * 12],
    ['week', 1000 / 7],
    ['day', 1000],
  ])('per %s matches the golden model', (unit, units) => {
    expect(equivalentReturn(at(0, 80), at(1000, 130), null, unit)).toBeCloseTo(
      golden(130 / 80, units),
      12,
    );
  });

  it('per bar uses the bar count, whatever the calendar span', () => {
    expect(equivalentReturn(at(0, 100), at(7, 110), 5, 'bar')).toBeCloseTo(golden(1.1, 5), 12);
    expect(equivalentReturn(at(0, 100), at(7, 110), -5, 'bar')).toBeCloseTo(golden(1.1, 5), 12);
    expect(equivalentReturn(at(0, 100), at(7, 110), null, 'bar')).toBeNull();
  });

  it('reads the anchors in time order, and loses money at a negative rate', () => {
    const forward = equivalentReturn(at(0, 100), at(365.25, 81), null, 'year');
    expect(forward).toBeCloseTo(-0.19, 12);
    expect(equivalentReturn(at(365.25, 81), at(0, 100), null, 'year')).toBeCloseTo(-0.19, 12);
  });

  it('is undefined without time between the points or with a price at or below zero', () => {
    expect(equivalentReturn(at(3, 100), at(3, 110), 0, 'year')).toBeNull();
    expect(equivalentReturn(at(0, 0), at(10, 110), null, 'year')).toBeNull();
    expect(equivalentReturn(at(0, 100), at(10, -5), null, 'year')).toBeNull();
  });
});

describe('the return range label', () => {
  it('shows the change, the equivalent return per its unit and the span', () => {
    const span = { bars: 504, volume: null };
    expect(rangeLabel(returnRange(730.5, 100, 121), 2, span)).toEqual([
      '+21.00 (21.00%)',
      '≈ +10.00% / year',
      '504 bars, 730d 12h',
    ]);
    expect(rangeLabel(returnRange(730.5, 100, 121, 'bar'), 2, span)[1]).toBe(
      `≈ +${(golden(1.21, 504) * 100).toFixed(2)}% / bar`,
    );
  });

  it('caps an absurd annualised rate from a tiny span', () => {
    expect(rangeLabel(returnRange(1, 100, 150), 2, { bars: 1, volume: null })[1]).toBe(
      '≈ > +999,999% / year',
    );
  });

  it('counts a statistics range’s bars with both ends, as its panel does', () => {
    const range = { ...returnRange(10, 100, 100), type: 'stats_range' as const };
    expect(rangeLabel(range, 2, { bars: 7, volume: null })).toEqual([
      '8 bars, 10d',
      'Statistics: see the side panel',
    ]);
  });
});
