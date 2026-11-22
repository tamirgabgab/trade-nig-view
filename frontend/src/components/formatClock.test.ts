import { formatClock } from './formatClock.ts';

describe('formatClock', () => {
  it('shows Israel winter time as UTC+2 with zero padding', () => {
    expect(formatClock(new Date('2026-11-22T07:05:09Z'), 'Asia/Jerusalem')).toBe('09:05:09 UTC+2');
  });

  it('shows Israel summer time as UTC+3 and wraps past midnight', () => {
    expect(formatClock(new Date('2026-07-01T22:30:00Z'), 'Asia/Jerusalem')).toBe('01:30:00 UTC+3');
  });

  it('ignores the browser time zone and supports UTC', () => {
    expect(formatClock(new Date('2026-11-22T23:59:59-05:00'), 'UTC')).toBe('04:59:59 UTC+0');
  });
});
