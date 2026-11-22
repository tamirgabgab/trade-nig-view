import {
  DEFAULT_INTERVAL,
  DEFAULT_SYMBOL,
  sanitizePersisted,
  useChartStore,
} from './chartStore.ts';

const DEFAULTS = {
  symbol: DEFAULT_SYMBOL,
  interval: DEFAULT_INTERVAL,
  chartType: 'candles',
  scaleMode: 'normal',
  autoScale: true,
  adjusted: true,
};

describe('sanitizePersisted', () => {
  it('keeps valid values', () => {
    const saved = {
      symbol: '^GSPC',
      interval: '1W',
      chartType: 'heikin_ashi',
      scaleMode: 'log',
      autoScale: false,
      adjusted: false,
    };
    expect(sanitizePersisted(saved)).toEqual(saved);
  });

  it('fills fields missing from a version-1 entry with defaults', () => {
    expect(sanitizePersisted({ symbol: 'NVDA', interval: '1h' })).toEqual({
      ...DEFAULTS,
      symbol: 'NVDA',
      interval: '1h',
    });
  });

  it('falls back to defaults for missing or malformed values', () => {
    expect(sanitizePersisted(undefined)).toEqual(DEFAULTS);
    expect(
      sanitizePersisted({ symbol: '', interval: '5m', chartType: 'renko', scaleMode: 'ln' }),
    ).toEqual(DEFAULTS);
    expect(sanitizePersisted({ symbol: 'X'.repeat(21), interval: 3 })).toEqual(DEFAULTS);
  });
});

describe('useChartStore', () => {
  beforeEach(() => {
    useChartStore.setState(useChartStore.getInitialState());
  });

  it('updates the selection and remembers display settings in localStorage', () => {
    const store = useChartStore.getState();
    store.setSymbol('NVDA');
    store.setInterval('1M');
    store.setChartType('line');
    store.toggleScaleMode('percent');

    expect(useChartStore.getState()).toMatchObject({ symbol: 'NVDA', interval: '1M' });
    const saved = JSON.parse(localStorage.getItem('chartlab.chart') ?? '{}') as {
      state: unknown;
      version: number;
    };
    expect(saved.version).toBe(2);
    expect(saved.state).toEqual({
      ...DEFAULTS,
      symbol: 'NVDA',
      interval: '1M',
      chartType: 'line',
      scaleMode: 'percent',
    });
  });

  it('keeps % and log mutually exclusive and toggles back to a normal scale', () => {
    const { toggleScaleMode } = useChartStore.getState();
    toggleScaleMode('log');
    toggleScaleMode('percent');
    expect(useChartStore.getState().scaleMode).toBe('percent');
    toggleScaleMode('percent');
    expect(useChartStore.getState().scaleMode).toBe('normal');
  });

  it('switches a range to its interval and numbers every request', () => {
    const { selectRange } = useChartStore.getState();
    selectRange('5Y');
    expect(useChartStore.getState()).toMatchObject({
      interval: '1W',
      range: '5Y',
      rangeRequest: { id: '5Y', seq: 1 },
    });
    selectRange('5Y');
    expect(useChartStore.getState().rangeRequest).toEqual({ id: '5Y', seq: 2 });
  });

  it('forgets the range when the user picks another interval or symbol', () => {
    const store = useChartStore.getState();
    store.selectRange('1Y');
    store.setSymbol(DEFAULT_SYMBOL);
    expect(useChartStore.getState().range).toBe('1Y');
    store.setSymbol('MSFT');
    expect(useChartStore.getState()).toMatchObject({ range: null, rangeRequest: null });
    store.selectRange('1Y');
    store.setInterval('1h');
    expect(useChartStore.getState()).toMatchObject({ range: null, rangeRequest: null });
  });
});
