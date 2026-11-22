/**
 * Display time zone of intraday bars and the clock. Pure (Intl only), so it is unit-testable.
 *
 * lightweight-charts formats UTCTimestamp values as UTC. To show wall-clock time in another zone,
 * each intraday time is shifted by that zone's UTC offset at that instant:
 *   display_t = t + offset_zone(t)
 * The shift happens only inside the chart layer (seriesData/ChartEngine); bar data and the API
 * keep true UTC epoch seconds.
 */

/** Israel time (IST UTC+2 / IDT UTC+3). A user setting arrives in R6. */
export const DISPLAY_TIME_ZONE = 'Asia/Jerusalem';

const SECONDS_PER_DAY = 86_400;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let format = formatters.get(timeZone);
  if (format === undefined) {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatters.set(timeZone, format);
  }
  return format;
}

/** UTC offset of `timeZone` at the instant `utcSeconds`, in seconds (local minus UTC). */
export function zoneOffsetSeconds(utcSeconds: number, timeZone: string): number {
  const parts: Partial<Record<Intl.DateTimeFormatPartTypes, number>> = {};
  for (const part of formatter(timeZone).formatToParts(new Date(utcSeconds * 1000))) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value);
  }
  const wall = Date.UTC(
    parts.year ?? 1970,
    (parts.month ?? 1) - 1,
    parts.day ?? 1,
    parts.hour ?? 0,
    parts.minute ?? 0,
    parts.second ?? 0,
  );
  return Math.round(wall / 1000 - Math.floor(utcSeconds));
}

/**
 * Shift UTC epoch seconds to wall-clock seconds in `timeZone` (as if that clock were UTC).
 *
 * Offsets are looked up once per UTC day: when the offset at the day's start equals the offset at
 * its end, no transition happens that day and it applies to every time in it. On a DST day the
 * offset is computed per time, so the result is exact everywhere.
 */
export function toZoneSeconds(times: readonly number[], timeZone: string): number[] {
  const dayOffset = new Map<number, number | null>();
  return times.map((t) => {
    const day = Math.floor(t / SECONDS_PER_DAY);
    let offset = dayOffset.get(day);
    if (offset === undefined) {
      const start = zoneOffsetSeconds(day * SECONDS_PER_DAY, timeZone);
      const end = zoneOffsetSeconds((day + 1) * SECONDS_PER_DAY, timeZone);
      offset = start === end ? start : null;
      dayOffset.set(day, offset);
    }
    return t + (offset ?? zoneOffsetSeconds(t, timeZone));
  });
}

/** Offset label such as `UTC+2`, `UTC-5` or `UTC+5:30`. */
export function formatOffset(offsetSeconds: number): string {
  const sign = offsetSeconds < 0 ? '-' : '+';
  const minutes = Math.round(Math.abs(offsetSeconds) / 60);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `UTC${sign}${hours}${rest === 0 ? '' : `:${String(rest).padStart(2, '0')}`}`;
}
