import { historyDepth } from './historyDepth.ts';

const NY = 'America/New_York';
const OCT_1_1330_UTC = Date.UTC(2026, 9, 1, 13, 30) / 1000;

describe('historyDepth', () => {
  it('gives the first date, the days covered and the provider window', () => {
    const last = OCT_1_1330_UTC + 56 * 86_400;
    expect(historyDepth('5m', OCT_1_1330_UTC, 60, last, NY)).toBe(
      '5m data since 2026-10-01 (56 days); the provider keeps ~60 days',
    );
  });

  it('says one day, and no data before the first bar', () => {
    expect(historyDepth('1m', OCT_1_1330_UTC, 30, OCT_1_1330_UTC + 600, NY)).toContain('(1 day)');
    expect(historyDepth('1m', null, 30, undefined, NY)).toBe(
      '1m: no data yet; the provider keeps ~30 days',
    );
  });

  it('leaves out the provider window when there is none (offline fixtures)', () => {
    const last = OCT_1_1330_UTC + 2 * 86_400;
    expect(historyDepth('1h', OCT_1_1330_UTC, null, last, NY)).toBe(
      '1h data since 2026-10-01 (2 days)',
    );
  });

  it('uses the display time zone for the date', () => {
    const lateEvening = Date.UTC(2026, 9, 2, 2, 0) / 1000; // 22:00 on Oct 1 in New York
    expect(historyDepth('1m', lateEvening, 30, lateEvening + 86_400, NY)).toContain('2026-10-01');
  });
});
