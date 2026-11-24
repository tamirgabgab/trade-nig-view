import { DEFAULT_FORECAST, sanitizePersisted } from './structureStore.ts';

describe('structure settings from storage', () => {
  it('keep valid forecast settings and repair the rest', () => {
    const ok = sanitizePersisted({
      forecast: true,
      forecastSettings: { k: 7, model: 'a', auto: false, window: 0, ridge: 10, lags: 5 },
    });
    expect(ok.forecast).toBe(true);
    expect(ok.forecastSettings).toEqual({
      k: 7,
      model: 'a',
      auto: false,
      window: 0,
      ridge: 10,
      lags: 5,
    });
    const bad = sanitizePersisted({
      forecastSettings: { k: 99, model: 'b', window: 30, ridge: -1, lags: 0 },
    });
    expect(bad.forecast).toBe(false);
    // A window too short to train becomes the smallest that can (60).
    expect(bad.forecastSettings).toEqual({ ...DEFAULT_FORECAST, window: 60 });
  });
});
