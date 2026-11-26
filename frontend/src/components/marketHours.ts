import { zoneOffsetSeconds } from '../chart/timeZone.ts';
import type { SymbolInfo } from '../api/market.ts';

/** Regular US cash session, for symbols without their own hours or a session spanning midnight. */
const US_CASH = '09:30-16:00';
/** Futures and forex close on Friday (and pause each weekday) at 17:00 exchange time. */
const WEEKLY_CLOSE = 17 * 60;

function minutesOf(hhmm: string): number {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Weekday (0 = Sunday) and minutes after midnight of `now` in `timeZone`. */
function localTime(now: Date, timeZone: string): { day: number; minutes: number } {
  const ms = now.getTime();
  const wall = new Date(ms + zoneOffsetSeconds(ms / 1000, timeZone) * 1000);
  return { day: wall.getUTCDay(), minutes: wall.getUTCHours() * 60 + wall.getUTCMinutes() };
}

/**
 * Whether the symbol's market is open at `now`, from trading hours only (holidays are not
 * known). Without `sessionStart`: Mon–Fri `cashHours` (09:30–16:00 by default; `fridayHours` on
 * Friday when set) in exchange time. With it (CME futures 18:00,
 * forex 17:00, ICE 20:00): from Sunday's session start to Friday 17:00, closed each weekday from
 * 17:00 until the next session starts.
 */
export function isMarketOpen(
  info: Pick<SymbolInfo, 'timezone' | 'sessionStart'> &
    Partial<Pick<SymbolInfo, 'cashHours' | 'fridayHours'>>,
  now: Date,
): boolean {
  const { day, minutes } = localTime(now, info.timezone);
  if (day === 0 || day === 6) {
    return day === 0 && info.sessionStart !== null && minutes >= minutesOf(info.sessionStart);
  }
  if (info.sessionStart === null) {
    const hours = (day === 5 ? info.fridayHours : null) ?? info.cashHours ?? US_CASH;
    const [open = '', close = ''] = hours.split('-');
    return minutes >= minutesOf(open) && minutes < minutesOf(close);
  }
  if (day === 5) return minutes < WEEKLY_CLOSE;
  return minutes < WEEKLY_CLOSE || minutes >= minutesOf(info.sessionStart);
}

/** Tooltip that states what the status is based on. */
export const MARKET_STATUS_NOTE = 'From regular trading hours; exchange holidays are not included.';
