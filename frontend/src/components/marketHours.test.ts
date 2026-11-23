import { isMarketOpen } from './marketHours.ts';

const STOCK = { timezone: 'America/New_York', sessionStart: null };
const FUTURE = { timezone: 'America/New_York', sessionStart: '18:00' };
const FOREX = { timezone: 'America/New_York', sessionStart: '17:00' };

/** New York local time in November (UTC-5). */
const ny = (iso: string) => new Date(`${iso}-05:00`);

describe('isMarketOpen', () => {
  it('stocks and indices: weekdays 09:30 to 16:00 New York time', () => {
    expect(isMarketOpen(STOCK, ny('2026-11-20T09:29:00'))).toBe(false); // Friday
    expect(isMarketOpen(STOCK, ny('2026-11-20T09:30:00'))).toBe(true);
    expect(isMarketOpen(STOCK, ny('2026-11-20T15:59:00'))).toBe(true);
    expect(isMarketOpen(STOCK, ny('2026-11-20T16:00:00'))).toBe(false);
    expect(isMarketOpen(STOCK, ny('2026-11-21T12:00:00'))).toBe(false); // Saturday
  });

  it('futures: Sunday 18:00 to Friday 17:00 with a daily 17:00-18:00 pause', () => {
    expect(isMarketOpen(FUTURE, ny('2026-11-22T17:59:00'))).toBe(false); // Sunday
    expect(isMarketOpen(FUTURE, ny('2026-11-22T18:00:00'))).toBe(true);
    expect(isMarketOpen(FUTURE, ny('2026-11-23T03:00:00'))).toBe(true); // Monday night
    expect(isMarketOpen(FUTURE, ny('2026-11-23T17:30:00'))).toBe(false); // daily pause
    expect(isMarketOpen(FUTURE, ny('2026-11-27T16:59:00'))).toBe(true); // Friday
    expect(isMarketOpen(FUTURE, ny('2026-11-27T18:30:00'))).toBe(false); // Friday evening
  });

  it('forex: no daily pause when the session starts at 17:00', () => {
    expect(isMarketOpen(FOREX, ny('2026-11-24T17:00:00'))).toBe(true);
    expect(isMarketOpen(FOREX, ny('2026-11-28T10:00:00'))).toBe(false); // Saturday
  });

  it('uses the exchange time zone, not the browser one', () => {
    const tokyo = { timezone: 'Asia/Tokyo', sessionStart: null };
    // 10:00 in Tokyo on a Monday is 20:00 on Sunday in New York.
    expect(isMarketOpen(tokyo, new Date('2026-11-23T10:00:00+09:00'))).toBe(true);
  });
});
