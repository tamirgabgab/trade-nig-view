import {
  DEFAULT_INTERVAL,
  DEFAULT_SYMBOL,
  sanitizePersisted,
  useChartStore,
} from './chartStore.ts';

describe('sanitizePersisted', () => {
  it('keeps valid values', () => {
    expect(sanitizePersisted({ symbol: '^GSPC', interval: '1W' })).toEqual({
      symbol: '^GSPC',
      interval: '1W',
    });
  });

  it('falls back to defaults for missing or malformed values', () => {
    const defaults = { symbol: DEFAULT_SYMBOL, interval: DEFAULT_INTERVAL };
    expect(sanitizePersisted(undefined)).toEqual(defaults);
    expect(sanitizePersisted({ symbol: '', interval: '5m' })).toEqual(defaults);
    expect(sanitizePersisted({ symbol: 'X'.repeat(21), interval: 3 })).toEqual(defaults);
  });
});

describe('useChartStore', () => {
  beforeEach(() => {
    useChartStore.setState({ symbol: DEFAULT_SYMBOL, interval: DEFAULT_INTERVAL });
  });

  it('updates the selection and remembers it in localStorage', () => {
    useChartStore.getState().setSymbol('NVDA');
    useChartStore.getState().setInterval('1M');

    expect(useChartStore.getState()).toMatchObject({ symbol: 'NVDA', interval: '1M' });
    const saved = JSON.parse(localStorage.getItem('chartlab.chart') ?? '{}') as {
      state: unknown;
    };
    expect(saved.state).toEqual({ symbol: 'NVDA', interval: '1M' });
  });
});
