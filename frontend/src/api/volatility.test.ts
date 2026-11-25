import { BODY } from '../test/volatilityBody.ts';
import { keepsPrevious } from './replayPlaceholder.ts';
import { parseVolatility, type VolatilityQuery } from './volatility.ts';

describe('parseVolatility', () => {
  it('reads every field, keeping nulls where the API has no value', () => {
    const v = parseVolatility(BODY);
    expect(v.estimator).toBe('parkinson');
    expect(v.barsPerYear).toBe(252);
    expect(v.horizons).toHaveLength(2);
    expect(v.horizons[0]?.ci).toEqual([0.015, null]);
    expect(v.horizons[0]?.forecast?.qlikeNaive).toBe(0.2);
    expect(v.horizons[1]?.forecast).toBeNull();
    expect(v.squeeze?.rank).toBeNull();
    expect(v.squeeze?.baseRate).toBe(0.1);
    expect(v.squeeze?.moveAll).toEqual([0.04, null]);
    expect(v.downside).toEqual({ window: null, history: 0.5 });
    expect(v.scores[0]?.label).toBe('HAR forecast');
  });

  it('falls back on an unknown estimator and refuses a non-object', () => {
    expect(parseVolatility({ ...BODY, estimator: 'range', squeeze: null }).estimator).toBe(
      'yang_zhang',
    );
    expect(parseVolatility({ ...BODY, squeeze: null }).squeeze).toBeNull();
    expect(() => parseVolatility(null)).toThrow('Unexpected volatility response');
  });
});

describe('keepsPrevious', () => {
  const q: VolatilityQuery = {
    symbol: 'AAPL',
    interval: '1D',
    adjusted: true,
    estimator: 'yang_zhang',
    horizon: 'month',
    threshold: 10,
    factor: 1.5,
    origin: 100,
  };
  it('keeps the last cone only on a replay step forward of the same request', () => {
    expect(keepsPrevious(q, { ...q, origin: 200 })).toBe(true);
    expect(keepsPrevious(q, { ...q, origin: null })).toBe(true); // replay ended: the present
    expect(keepsPrevious(q, { ...q, origin: 50 })).toBe(false); // a step back: the future
    expect(keepsPrevious(q, { ...q, symbol: 'MSFT', origin: 200 })).toBe(false);
    expect(keepsPrevious({ ...q, origin: null }, q)).toBe(false);
    expect(keepsPrevious(null, q)).toBe(false);
  });
});
