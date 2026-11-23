import { formatOffset, zoneOffsetSeconds } from '../chart/timeZone.ts';

/**
 * Format `date` as `HH:MM:SS UTC±H` (24h) in `timeZone`, e.g. `16:30:05 UTC+2` for Israel winter
 * time. Pure, so it is unit-testable.
 */
export function formatClock(date: Date, timeZone: string): string {
  const offset = zoneOffsetSeconds(Math.floor(date.getTime() / 1000), timeZone);
  const wall = new Date(date.getTime() + offset * 1000);
  const pad = (value: number) => String(value).padStart(2, '0');
  const hms = `${pad(wall.getUTCHours())}:${pad(wall.getUTCMinutes())}:${pad(wall.getUTCSeconds())}`;
  return `${hms} ${formatOffset(offset)}`;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * A bar's time for people: `Fri 20 Nov 2026` for a daily+ bar ('YYYY-MM-DD'), plus `16:30` in
 * `timeZone` for an intraday bar (UTC epoch seconds).
 */
export function formatBarTime(time: string | number, timeZone: string): string {
  const seconds = typeof time === 'number' ? time : Date.parse(`${time}T00:00:00Z`) / 1000;
  const shift = typeof time === 'number' ? zoneOffsetSeconds(seconds, timeZone) : 0;
  const wall = new Date((seconds + shift) * 1000);
  const pad = (value: number) => String(value).padStart(2, '0');
  const day = `${DAYS[wall.getUTCDay()] ?? ''} ${String(wall.getUTCDate())} ${MONTHS[wall.getUTCMonth()] ?? ''} ${String(wall.getUTCFullYear())}`;
  return typeof time === 'number'
    ? `${day} ${pad(wall.getUTCHours())}:${pad(wall.getUTCMinutes())}`
    : day;
}

/** A bar's date ('YYYY-MM-DD') as the chart shows it: daily bars as they are, intraday bars in
 *  the display time zone. */
export function localDate(time: string | number, zone: string): string {
  if (typeof time === 'string') return time;
  return new Date((time + zoneOffsetSeconds(time, zone)) * 1000).toISOString().slice(0, 10);
}
