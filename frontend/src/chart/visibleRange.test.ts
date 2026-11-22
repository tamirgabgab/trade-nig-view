import {
  barSeconds,
  firstIndexFrom,
  isRangeId,
  logicalRangeFrom,
  RANGE_INTERVAL,
  RANGES,
  rangeStart,
} from './visibleRange.ts';

const DAY = 86_400;
const utc = (iso: string) => Date.parse(iso) / 1000;

/** Hourly US session bars (13:30–19:30 UTC) for the given dates. */
function hourly(dates: string[]): number[] {
  return dates.flatMap((date) =>
    [13, 14, 15, 16, 17, 18, 19].map((h) => utc(`${date}T${String(h)}:30:00Z`)),
  );
}

describe('barSeconds', () => {
  it('reads dates as 00:00 UTC and passes intraday seconds through', () => {
    expect(barSeconds('2026-11-20')).toBe(utc('2026-11-20T00:00:00Z'));
    expect(barSeconds(1_770_301_800)).toBe(1_770_301_800);
  });
});

describe('range ids', () => {
  it('lists every button with an interval', () => {
    for (const id of RANGES) expect(RANGE_INTERVAL[id]).toBeDefined();
    expect(isRangeId('YTD')).toBe(true);
    expect(isRangeId('2Y')).toBe(false);
    expect(isRangeId(null)).toBe(false);
  });
});

describe('rangeStart', () => {
  // Mon 2026-11-16 … Fri 2026-11-20, plus the previous Thu/Fri; weekend has no bars.
  const week = hourly([
    '2026-11-12',
    '2026-11-13',
    '2026-11-16',
    '2026-11-17',
    '2026-11-18',
    '2026-11-19',
    '2026-11-20',
  ]);

  it('counts trading sessions for 1D and 5D, skipping the weekend', () => {
    expect(rangeStart('1D', week)).toBe(utc('2026-11-20T00:00:00Z'));
    expect(rangeStart('5D', week)).toBe(utc('2026-11-16T00:00:00Z'));
  });

  it('needs more history when fewer sessions are loaded than the range asks for', () => {
    expect(rangeStart('5D', hourly(['2026-11-19', '2026-11-20']))).toBe(Number.NEGATIVE_INFINITY);
  });

  it('counts calendar months back from the last bar, clamping the day to the month end', () => {
    const last = [utc('2026-05-31T00:00:00Z')];
    expect(rangeStart('1M', last)).toBe(utc('2026-04-30T00:00:00Z'));
    expect(rangeStart('3M', last)).toBe(utc('2026-02-28T00:00:00Z'));
    expect(rangeStart('6M', last)).toBe(utc('2025-11-30T00:00:00Z'));
    expect(rangeStart('1Y', last)).toBe(utc('2025-05-31T00:00:00Z'));
    expect(rangeStart('5Y', last)).toBe(utc('2021-05-31T00:00:00Z'));
  });

  it('starts YTD on 1 January and All at the first bar ever', () => {
    expect(rangeStart('YTD', [utc('2026-11-20T00:00:00Z')])).toBe(utc('2026-01-01T00:00:00Z'));
    expect(rangeStart('All', week)).toBe(Number.NEGATIVE_INFINITY);
    expect(rangeStart('1Y', [])).toBe(Number.NEGATIVE_INFINITY);
  });
});

describe('firstIndexFrom / logicalRangeFrom', () => {
  const times = [0, DAY, 2 * DAY, 3 * DAY, 4 * DAY];

  it('finds the first bar at or after the start', () => {
    expect(firstIndexFrom(times, -1)).toBe(0);
    expect(firstIndexFrom(times, DAY)).toBe(1);
    expect(firstIndexFrom(times, DAY + 1)).toBe(2);
    expect(firstIndexFrom(times, 10 * DAY)).toBe(5);
  });

  it('frames the range with half a bar on the left and the right offset', () => {
    expect(logicalRangeFrom(times, 2 * DAY, 5)).toEqual({ from: 1.5, to: 9 });
    expect(logicalRangeFrom(times, Number.NEGATIVE_INFINITY, 5)).toEqual({ from: -0.5, to: 9 });
    // A start after the last bar still shows the last bar.
    expect(logicalRangeFrom(times, 99 * DAY, 5)).toEqual({ from: 3.5, to: 9 });
    expect(logicalRangeFrom([], 0, 5)).toEqual({ from: -0.5, to: 5 });
  });
});
