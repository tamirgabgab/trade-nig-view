import { Pause, Play, Shuffle, StepForward, X } from 'lucide-react';
import { useState } from 'react';

import type { Bar } from '../api/bars.ts';
import { zoneOffsetSeconds } from '../chart/timeZone.ts';
import { REPLAY_SPEEDS, useReplayStore, type ReplaySpeed } from '../store/replayStore.ts';
import { formatBarTime } from './formatClock.ts';
import { IconButton } from './IconButton.tsx';
import styles from './ReplayBar.module.css';
import { useDisplayTimeZone } from './useDisplayTimeZone.ts';

const ICON = 18;
/** A random start leaves room for warm-up before it and for the replay after it. */
const RANDOM_MARGIN = 50;

/** A bar's date ('YYYY-MM-DD') as the chart shows it: daily bars as they are, intraday bars in
 *  the display time zone. */
function localDate(time: Bar['time'], zone: string): string {
  if (typeof time === 'string') return time;
  return new Date((time + zoneOffsetSeconds(time, zone)) * 1000).toISOString().slice(0, 10);
}

/**
 * Replay controls (R7), floating at the bottom of the chart. Picking: choose the start bar by a
 * click on the chart, a date or at random. Replaying: play/pause, step (Shift+→), speed, the
 * cursor's date, exit (back to the present).
 */
export function ReplayBar({
  bars,
  cursorIndex,
  onStep,
}: {
  bars: readonly Bar[];
  cursorIndex: number;
  onStep: () => void;
}) {
  const replay = useReplayStore();
  const zone = useDisplayTimeZone();
  // The date being typed; applied on Enter or when the field is left (not on every keystroke).
  const [draft, setDraft] = useState<string | null>(null);
  const first = bars[0];
  const last = bars.at(-1);
  const cursor = bars[cursorIndex];
  const startAt = (index: number) => {
    const bar = bars[Math.min(Math.max(index, 0), bars.length - 1)];
    if (bar !== undefined) replay.setCursor(bar.time, true);
  };
  const applyDraft = () => {
    const day = draft;
    setDraft(null);
    if (day === null || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
    // The last bar on or before that day; a day before the loaded history is ignored.
    const index = bars.findLastIndex((bar) => localDate(bar.time, zone) <= day);
    if (index >= 0) startAt(index);
  };

  return (
    <div className={styles.bar} role="toolbar" aria-label="Bar replay">
      {replay.mode === 'picking' ? (
        <span className={styles.hint}>Click a bar to start the replay there, or</span>
      ) : (
        <>
          <IconButton
            label={replay.playing ? 'Pause' : 'Play'}
            icon={replay.playing ? <Pause size={ICON} /> : <Play size={ICON} />}
            pressed={replay.playing}
            tooltipSide="top"
            onClick={() => {
              replay.setPlaying(!replay.playing);
            }}
          />
          <IconButton
            label="Next bar"
            shortcut="Shift+→"
            icon={<StepForward size={ICON} />}
            tooltipSide="top"
            onClick={onStep}
          />
          <select
            className={styles.speed}
            aria-label="Replay speed"
            value={replay.speed}
            onChange={(event) => {
              replay.setSpeed(Number(event.target.value) as ReplaySpeed);
            }}
          >
            {REPLAY_SPEEDS.map((speed) => (
              <option key={speed} value={speed}>
                {speed} bar/s
              </option>
            ))}
          </select>
          <span className={styles.cursor} aria-live="off">
            {cursor === undefined ? '—' : formatBarTime(cursor.time, zone)}
          </span>
        </>
      )}
      <label className={styles.date}>
        <span className="visually-hidden">Start date</span>
        <input
          type="date"
          aria-label="Start date"
          min={first === undefined ? undefined : localDate(first.time, zone)}
          max={last === undefined ? undefined : localDate(last.time, zone)}
          value={draft ?? (cursor === undefined ? '' : localDate(cursor.time, zone))}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          onBlur={applyDraft}
          onKeyDown={(event) => {
            if (event.key === 'Enter') applyDraft();
          }}
        />
      </label>
      <IconButton
        label="Start at a random bar"
        icon={<Shuffle size={ICON} />}
        tooltipSide="top"
        onClick={() => {
          const span = Math.max(bars.length - 2 * RANDOM_MARGIN, 1);
          startAt(Math.min(RANDOM_MARGIN, bars.length - 1) + Math.floor(Math.random() * span));
        }}
      />
      <span className={styles.separator} aria-hidden="true" />
      <IconButton
        label="Exit replay"
        icon={<X size={ICON} />}
        tooltipSide="top"
        onClick={replay.exit}
      />
    </div>
  );
}
