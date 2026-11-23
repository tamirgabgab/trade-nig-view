import { INDICATORS } from '../test/render.tsx';
import {
  alignToBars,
  computeBody,
  defaultParams,
  effectiveParams,
  instanceLabel,
  parseCompute,
  parseIndicatorList,
} from './indicators.ts';

const [SMA] = parseIndicatorList(INDICATORS);
if (SMA === undefined) throw new Error('fixture');

describe('indicator registry', () => {
  it('parses the registry into camelCase specs', () => {
    const specs = parseIndicatorList(INDICATORS);
    expect(specs.map((s) => s.id)).toEqual(['sma', 'ema', 'wma', 'smma']);
    expect(SMA).toMatchObject({
      shortName: 'SMA',
      category: 'moving_averages',
      overlay: true,
      learnSlug: 'sma',
      outputs: [{ name: 'ma', label: 'SMA', plot: 'line', color: '#2962FF', lineWidth: 2 }],
    });
    expect(SMA.params[0]).toEqual({
      name: 'length',
      type: 'int',
      default: 9,
      label: 'Length',
      min: 1,
      max: 5000,
      step: 1,
      options: [],
    });
  });

  it('rejects malformed registry entries', () => {
    expect(() => parseIndicatorList({})).toThrow();
    expect(() => parseIndicatorList([{ ...INDICATORS[0], category: 'magic' }])).toThrow(/category/);
    expect(() =>
      parseIndicatorList([{ ...INDICATORS[0], params: [{ name: 'x', type: 'date' }] }]),
    ).toThrow(/param type/);
  });

  it('fills defaults, drops unknown params and ignores values of the wrong type', () => {
    expect(defaultParams(SMA)).toEqual({ source: 'close', length: 9, offset: 0 });
    expect(effectiveParams(SMA, { length: 20, gone: 1, offset: 'x' })).toEqual({
      source: 'close',
      length: 20,
      offset: 0,
    });
  });

  it('labels an instance like the TradingView legend, offset only when set', () => {
    expect(instanceLabel(SMA, { source: 'close', length: 20, offset: 0 })).toBe('SMA 20 close');
    expect(instanceLabel(SMA, { source: 'hl2', length: 5, offset: 3 })).toBe('SMA 5 hl2 3');
  });
});

describe('indicator values', () => {
  const bars = [
    { time: '2026-11-18', open: 1, high: 1, low: 1, close: 1, volume: 0 },
    { time: '2026-11-19', open: 1, high: 1, low: 1, close: 1, volume: 0 },
    { time: '2026-11-20', open: 1, high: 1, low: 1, close: 1, volume: 0 },
  ];

  it('asks for exactly the loaded bars (epoch seconds, inclusive)', () => {
    const series = { symbol: 'AAPL', interval: '1D', adjusted: true, transform: 'none' } as const;
    expect(computeBody(series, bars, 'sma', { length: 2 })).toEqual({
      ...series,
      id: 'sma',
      params: { length: 2 },
      start: Date.UTC(2026, 10, 18) / 1000,
      end: Date.UTC(2026, 10, 20) / 1000,
    });
    expect(computeBody(series, [], 'sma', {})).toBeNull();
  });

  it('parses a response and places it on the bars by time', () => {
    const data = parseCompute({
      id: 'sma',
      version: 1,
      params: { length: 2 },
      time: ['2026-11-19', '2026-11-20'],
      outputs: { ma: [null, 1.5] },
      warmup: 1,
      lookback: 250,
    });
    expect(alignToBars(bars, data)).toEqual({ ma: [null, null, 1.5] });
  });

  it('rejects outputs whose length differs from the times', () => {
    expect(() =>
      parseCompute({ id: 'sma', params: {}, time: ['2026-11-19'], outputs: { ma: [] } }),
    ).toThrow(/output ma/);
  });
});
