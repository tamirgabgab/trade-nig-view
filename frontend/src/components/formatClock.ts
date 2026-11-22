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
