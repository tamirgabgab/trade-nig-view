import { DEFAULT_VOLATILITY, sanitizeVolatility, useVolatilityStore } from './volatilityStore.ts';

describe('volatilityStore', () => {
  it('keeps well-formed settings and replaces the rest with the defaults', () => {
    expect(sanitizeVolatility(undefined)).toEqual(DEFAULT_VOLATILITY);
    expect(
      sanitizeVolatility({
        estimator: 'close',
        horizon: 'quarter',
        threshold: 20,
        factor: 2,
        annual: false,
      }),
    ).toEqual({ estimator: 'close', horizon: 'quarter', threshold: 20, factor: 2, annual: false });
    expect(
      sanitizeVolatility({ estimator: 'range', horizon: 'year', threshold: 15, factor: 1.75 }),
    ).toEqual(DEFAULT_VOLATILITY);
  });

  it('merges a change into the settings', () => {
    useVolatilityStore.getState().setPrefs({ annual: false, threshold: 5 });
    expect(useVolatilityStore.getState().prefs).toMatchObject({ annual: false, threshold: 5 });
    useVolatilityStore.getState().setPrefs(DEFAULT_VOLATILITY);
  });
});
