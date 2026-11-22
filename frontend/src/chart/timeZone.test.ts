import { DISPLAY_TIME_ZONE, formatOffset, toZoneSeconds, zoneOffsetSeconds } from './timeZone.ts';

const HOUR = 3600;
const utc = (iso: string) => Date.parse(iso) / 1000;

/** Golden model: offset per time, no day cache. */
function golden(times: readonly number[], timeZone: string): number[] {
  return times.map((t) => t + zoneOffsetSeconds(t, timeZone));
}

describe('zoneOffsetSeconds', () => {
  it('knows Israel winter (UTC+2) and summer (UTC+3) time', () => {
    expect(zoneOffsetSeconds(utc('2026-01-15T12:00:00Z'), DISPLAY_TIME_ZONE)).toBe(2 * HOUR);
    expect(zoneOffsetSeconds(utc('2026-07-15T12:00:00Z'), DISPLAY_TIME_ZONE)).toBe(3 * HOUR);
  });

  it('handles zones west of UTC, half-hour zones and UTC', () => {
    expect(zoneOffsetSeconds(utc('2026-01-15T12:00:00Z'), 'America/New_York')).toBe(-5 * HOUR);
    expect(zoneOffsetSeconds(utc('2026-01-15T12:00:00Z'), 'Asia/Kolkata')).toBe(5.5 * HOUR);
    expect(zoneOffsetSeconds(utc('2026-01-15T12:00:00Z'), 'UTC')).toBe(0);
  });

  it('switches exactly at the DST transition (Israel, 2026-03-27 02:00 local = 00:00 UTC)', () => {
    const switchAt = utc('2026-03-27T00:00:00Z');
    expect(zoneOffsetSeconds(switchAt - 1, DISPLAY_TIME_ZONE)).toBe(2 * HOUR);
    expect(zoneOffsetSeconds(switchAt, DISPLAY_TIME_ZONE)).toBe(3 * HOUR);
  });
});

describe('toZoneSeconds', () => {
  it('shows a NYSE open (14:30 UTC in winter) as 16:30 Israel time', () => {
    const [shifted] = toZoneSeconds([utc('2026-02-05T14:30:00Z')], DISPLAY_TIME_ZONE);
    expect(new Date((shifted ?? 0) * 1000).toISOString()).toBe('2026-02-05T16:30:00.000Z');
  });

  it('matches the per-time golden model across DST days in both directions', () => {
    // Hourly times around Israel's spring (Mar 27) and autumn (Oct 25) 2026 transitions and the
    // US ones (Mar 8, Nov 1), so days with and without a transition are mixed.
    const starts = ['2026-03-06', '2026-03-25', '2026-10-23', '2026-10-30'];
    for (const zone of [DISPLAY_TIME_ZONE, 'America/New_York', 'Europe/London']) {
      for (const start of starts) {
        const base = utc(`${start}T00:00:00Z`);
        const times = Array.from({ length: 24 * 5 }, (_, i) => base + i * HOUR + 30 * 60);
        expect(toZoneSeconds(times, zone)).toEqual(golden(times, zone));
      }
    }
  });

  it('keeps order and length, and handles an empty list', () => {
    const times = [utc('2026-03-26T22:00:00Z'), utc('2026-03-27T01:00:00Z')];
    const shifted = toZoneSeconds(times, DISPLAY_TIME_ZONE);
    expect(shifted).toHaveLength(2);
    expect((shifted[1] ?? 0) - (shifted[0] ?? 0)).toBe(4 * HOUR); // 3 h of time + 1 h DST jump
    expect(toZoneSeconds([], DISPLAY_TIME_ZONE)).toEqual([]);
  });
});

describe('formatOffset', () => {
  it('formats whole, negative and half-hour offsets', () => {
    expect(formatOffset(2 * HOUR)).toBe('UTC+2');
    expect(formatOffset(-5 * HOUR)).toBe('UTC-5');
    expect(formatOffset(5.5 * HOUR)).toBe('UTC+5:30');
    expect(formatOffset(0)).toBe('UTC+0');
  });
});
