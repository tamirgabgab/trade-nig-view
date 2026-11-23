import type { SymbolInfo } from '../api/market.ts';

/** Regular US cash session, used for symbols without a session spanning midnight. */
const OPEN = 9 * 60 + 30;
const CLOSE = 16 * 60;
/** Futures and forex close on Friday (and pause each weekday) at 17:00 exchange time. */
const WEEKLY_CLOSE = 17 * 60;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function minutesOf(hhmm: string): number {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Weekday (0 = Sunday) and minutes after midnight of `now` in `timeZone`. */
function localTime(now: Date, timeZone: string): { day: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    day: WEEKDAYS.indexOf(part('weekday')),
    minutes: Number(part('hour')) * 60 + Number(part('minute')),
  };
}

/**
 * Whether the symbol's market is open at `now`, from trading hours only (holidays are not
 * known). Without `sessionStart`: Mon–Fri 09:30–16:00 exchange time. With it (CME futures 18:00,
 * forex 17:00, ICE 20:00): from Sunday's session start to Friday 17:00, closed each weekday from
 * 17:00 until the next session starts.
 */
export function isMarketOpen(
  info: Pick<SymbolInfo, 'timezone' | 'sessionStart'>,
  now: Date,
): boolean {
  const { day, minutes } = localTime(now, info.timezone);
  if (day === 0 || day === 6) {
    return day === 0 && info.sessionStart !== null && minutes >= minutesOf(info.sessionStart);
  }
  if (info.sessionStart === null) return minutes >= OPEN && minutes < CLOSE;
  if (day === 5) return minutes < WEEKLY_CLOSE;
  return minutes < WEEKLY_CLOSE || minutes >= minutesOf(info.sessionStart);
}

/** Tooltip that states what the status is based on. */
export const MARKET_STATUS_NOTE = 'From regular trading hours; exchange holidays are not included.';
