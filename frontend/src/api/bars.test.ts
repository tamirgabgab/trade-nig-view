import { AAPL_BARS, barsBody } from '../test/render.tsx';
import { barsPath, isInterval, mergePages, olderCursor, parseBars } from './bars.ts';

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
  const query = { symbol: '^GSPC', interval: '1W', adjusted: true, transform: 'none' } as const;

  it('encodes symbols with special characters and omits default options', () => {
    expect(barsPath(query, { limit: 10 })).toBe('/bars?symbol=%5EGSPC&interval=1W&limit=10');
  });

  it('adds the unadjusted flag, the transform and the paging cursor only when set', () => {
    expect(
      barsPath(
        { ...query, adjusted: false, transform: 'heikin_ashi' },
        { limit: 50, before: 1_700_000_000 },
      ),
    ).toBe(
      '/bars?symbol=%5EGSPC&interval=1W&limit=50&adjusted=false&transform=heikin_ashi&before=1700000000',
    );
  });
});

describe('history pages', () => {
  const page = (times: string[], hasMoreBefore: boolean) =>
    parseBars({
      ...barsBody(
        'AAPL',
        '1D',
        times.map((time) => ({ ...AAPL_BARS[0], time })),
      ),
      has_more_before: hasMoreBefore,
    });

  it('merges pages oldest first (pages are fetched newest first)', () => {
    const newest = page(['2026-11-19', '2026-11-20'], true);
    const older = page(['2026-11-17', '2026-11-18'], false);
    expect(mergePages([newest, older]).map((b) => b.time)).toEqual([
      '2026-11-17',
      '2026-11-18',
      '2026-11-19',
      '2026-11-20',
    ]);
  });

  it('pages backwards from the first bar until the server has no more history', () => {
    expect(olderCursor(page(['2026-11-19', '2026-11-20'], true))).toBe(
      Date.parse('2026-11-19T00:00:00Z') / 1000,
    );
    expect(olderCursor(page(['2026-11-19'], false))).toBeUndefined();
    expect(olderCursor(page([], true))).toBeUndefined();
  });
});

describe('isInterval', () => {
  it('accepts only the chart intervals', () => {
    expect(isInterval('1M')).toBe(true);
    expect(isInterval('4h')).toBe(true);
    expect(isInterval('5m')).toBe(false);
    expect(isInterval(7)).toBe(false);
  });
});

describe('parseBars (intraday)', () => {
  it('keeps UTC epoch seconds of intraday bars', () => {
    const bar = { time: 1_770_301_800, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 };
    expect(parseBars(barsBody('AAPL', '1h', [bar])).bars[0]).toEqual(bar);
  });

  it('rejects fractional or missing times', () => {
    const bar = { open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 };
    expect(() => parseBars(barsBody('AAPL', '1h', [{ ...bar, time: 1.5 }]))).toThrow('bar time');
    expect(() => parseBars(barsBody('AAPL', '1h', [bar]))).toThrow('bar time');
  });
});
