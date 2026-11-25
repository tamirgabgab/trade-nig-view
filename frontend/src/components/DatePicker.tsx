import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';

import { addDays, addMonths, formatDay, monthCells, snapDay } from './calendar.ts';
import styles from './DatePicker.module.css';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

/**
 * A button showing `value` as DD/MM/YYYY that opens a month calendar above it, in which only
 * `days` (sorted, unique 'YYYY-MM-DD') can be picked. Keys: arrows move between those days
 * (←/→ the previous/next one, ↑/↓ a week), PageUp/PageDown a month, Enter picks, Esc closes.
 */
export function DatePicker({
  label,
  days,
  value,
  onPick,
  iconOnly = false,
}: {
  label: string;
  days: readonly string[];
  value: string | undefined;
  onPick: (day: string) => void;
  /** An icon-only opener (the bottom bar's Go to date); else the date as DD/MM/YYYY. */
  iconOnly?: boolean;
}) {
  // The highlighted day while open (its month is the one shown); null when closed.
  const [active, setActive] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  // Move the focus to the active day only after a key in the grid or on open, not on a select.
  const focusDay = useRef(false);
  const available = useMemo(() => new Set(days), [days]);
  const first = days[0];
  const last = days.at(-1);

  const close = (restoreFocus: boolean) => {
    setActive(null);
    if (restoreFocus) openerRef.current?.focus();
  };
  const show = (day: string | undefined, focus: boolean) => {
    if (day === undefined) return;
    focusDay.current = focus;
    setActive(day);
  };

  useEffect(() => {
    if (active === null || !focusDay.current) return;
    focusDay.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${active}"]`)?.focus();
  }, [active]);

  const open = active !== null;
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setActive(null);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open]);

  // A month button that reaches the first or last month is disabled: it hands the focus to the day.
  const showMonth = (day: string | undefined) => {
    const edge = day?.slice(0, 7);
    show(day, edge !== undefined && (edge === first?.slice(0, 7) || edge === last?.slice(0, 7)));
  };

  // The last day of the months before the active one, the first of the months after it (a month
  // with no bars is skipped).
  const previousMonth = (day: string) => snapDay(days, addDays(`${day.slice(0, 7)}-01`, -1), -1);
  const nextMonth = (day: string) => snapDay(days, addMonths(day, 1), 1);

  const onGridKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (active === null) return;
    const index = days.indexOf(active);
    const moves: Record<string, () => string | undefined> = {
      ArrowLeft: () => days[Math.max(index - 1, 0)],
      ArrowRight: () => days[Math.min(index + 1, days.length - 1)],
      ArrowUp: () => snapDay(days, addDays(active, -7), -1),
      ArrowDown: () => snapDay(days, addDays(active, 7), 1),
      PageUp: () => previousMonth(active),
      PageDown: () => nextMonth(active),
    };
    const move = moves[event.key];
    if (event.key.length === 1) event.stopPropagation(); // a typed letter is not a global hotkey
    if (move === undefined) return;
    event.preventDefault();
    show(move(), true);
  };

  const [year = 0, month = 1] = (active ?? '').split('-').map(Number);
  const years = [...new Set(days.map((day) => Number(day.slice(0, 4))))];
  const goTo = (y: number, m: number) => {
    const target = `${String(y)}-${String(m).padStart(2, '0')}-01`;
    show(snapDay(days, target, 1), false);
  };

  return (
    <div
      ref={wrapperRef}
      className={styles.wrapper}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (next !== null && !event.currentTarget.contains(next)) setActive(null);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.preventDefault();
          event.stopPropagation();
          close(true);
        }
      }}
    >
      <button
        ref={openerRef}
        type="button"
        className={iconOnly ? styles.iconOpener : styles.opener}
        aria-label={
          iconOnly ? label : `${label}: ${value === undefined ? 'none' : formatDay(value)}`
        }
        title={iconOnly ? label : undefined}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={days.length === 0}
        onClick={() => {
          if (open) close(false);
          else show(value !== undefined && available.has(value) ? value : last, true);
        }}
      >
        <CalendarDays size={iconOnly ? 16 : 14} aria-hidden="true" />
        {!iconOnly && (value === undefined ? 'DD/MM/YYYY' : formatDay(value))}
      </button>
      {active !== null && (
        <div role="dialog" aria-label={label} className={styles.popup}>
          <div className={styles.header}>
            <button
              type="button"
              className={styles.nav}
              aria-label="Previous month"
              disabled={first === undefined || active.slice(0, 7) <= first.slice(0, 7)}
              onClick={() => {
                showMonth(previousMonth(active));
              }}
            >
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            <select
              aria-label="Month"
              value={month}
              onChange={(event) => {
                goTo(year, Number(event.target.value));
              }}
            >
              {MONTHS.map((name, i) => (
                <option key={name} value={i + 1}>
                  {name}
                </option>
              ))}
            </select>
            <select
              aria-label="Year"
              value={year}
              onChange={(event) => {
                goTo(Number(event.target.value), month);
              }}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={styles.nav}
              aria-label="Next month"
              disabled={last === undefined || active.slice(0, 7) >= last.slice(0, 7)}
              onClick={() => {
                showMonth(nextMonth(active));
              }}
            >
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>
          <div
            ref={gridRef}
            className={styles.grid}
            role="group"
            aria-label={`${MONTHS[month - 1] ?? ''} ${String(year)}`}
            onKeyDown={onGridKey}
          >
            {WEEKDAYS.map((name) => (
              <span key={name} className={styles.weekday} aria-hidden="true">
                {name}
              </span>
            ))}
            {monthCells(year, month).map((day, i) =>
              day === null ? (
                <span key={`blank-${String(i)}`} />
              ) : (
                <button
                  key={day}
                  type="button"
                  data-day={day}
                  className={styles.day}
                  aria-label={formatDay(day)}
                  aria-pressed={day === value}
                  disabled={!available.has(day)}
                  tabIndex={day === active ? 0 : -1}
                  onClick={() => {
                    close(true);
                    onPick(day);
                  }}
                >
                  {Number(day.slice(8))}
                </button>
              ),
            )}
          </div>
        </div>
      )}
    </div>
  );
}
