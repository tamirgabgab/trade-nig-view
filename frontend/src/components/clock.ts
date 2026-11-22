/** Format `date` as `HH:MM:SS UTC` (24h). Pure, so it is unit-testable. */
export function formatUtcClock(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} UTC`;
}
