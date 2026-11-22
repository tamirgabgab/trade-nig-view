import { AAPL_BARS, barsBody } from '../test/render.tsx';
import { barsPath, isInterval, parseBars } from './bars.ts';

describe('parseBars', () => {
  it('maps the snake_case response to camelCase', () => {
    const data = parseBars({ ...barsBody('AAPL', '1D', AAPL_BARS), has_more_before: true });
    expect(data.symbol).toBe('AAPL');
    expect(data.interval).toBe('1D');
    expect(data.hasMoreBefore).toBe(true);
    expect(data.timezone).toBe('America/New_York');
    expect(data.bars).toHaveLength(3);
    expect(data.bars[2]).toEqual(AAPL_BARS[2]);
  });

  it('rejects malformed bodies and bars', () => {
    expect(() => parseBars(null)).toThrow('Unexpected /api/bars response');
    expect(() => parseBars(barsBody('AAPL', '5m', []))).toThrow('interval');
    expect(() => parseBars(barsBody('AAPL', '1D', [{ time: '2026-11-20' }]))).toThrow('open');
    expect(() =>
      parseBars(barsBody('AAPL', '1D', [{ ...AAPL_BARS[0], close: Number.NaN }])),
    ).toThrow('close');
  });
});

describe('barsPath', () => {
  it('encodes symbols with special characters', () => {
    expect(barsPath('^GSPC', '1W', 10)).toBe('/bars?symbol=%5EGSPC&interval=1W&limit=10');
  });
});

describe('isInterval', () => {
  it('accepts only the chart intervals', () => {
    expect(isInterval('1M')).toBe(true);
    expect(isInterval('1h')).toBe(false);
    expect(isInterval(7)).toBe(false);
  });
});
