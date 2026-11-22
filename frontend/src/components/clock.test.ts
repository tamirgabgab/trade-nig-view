import { formatUtcClock } from './clock.ts';

describe('formatUtcClock', () => {
  it('formats with zero padding in UTC', () => {
    expect(formatUtcClock(new Date('2026-11-22T07:05:09Z'))).toBe('07:05:09 UTC');
  });

  it('ignores the local time zone', () => {
    expect(formatUtcClock(new Date('2026-11-22T23:59:59-05:00'))).toBe('04:59:59 UTC');
  });
});
