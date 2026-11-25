import { ChevronLast, Pause, Play, Shuffle, StepForward, X } from 'lucide-react';
import { useMemo } from 'react';

import type { Bar } from '../api/bars.ts';
import { toZoneSeconds } from '../chart/timeZone.ts';
import { REPLAY_SPEEDS, useReplayStore, type ReplaySpeed } from '../store/replayStore.ts';
import { DatePicker } from './DatePicker.tsx';
import { formatBarTime, localDate } from './formatClock.ts';
import { IconButton } from './IconButton.tsx';
import styles from './ReplayBar.module.css';
import { useDisplayTimeZone } from './useDisplayTimeZone.ts';

const ICON = 18;
/** A random start leaves room for warm-up before it and for the replay after it. */
const RANDOM_MARGIN = 50;

/**
 * Replay controls (R7), floating at the bottom of the chart. Picking: choose the start bar by a
 * click on the chart, a day in the calendar (only days with bars), the last bar or at random.
 * Replaying: play/pause, step (Shift+→), speed, the cursor's date, exit (back to the present).
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
  // Each day with bars, as the chart shows it, and the index of its last bar (in date order).
  const dayEnds = useMemo(() => {
    const seconds = toZoneSeconds(
      bars.map((bar) => (typeof bar.time === 'number' ? bar.time : 0)),
      zone,
    );
    const ends = new Map<string, number>();
    bars.forEach((bar, i) => {
      const day =
        typeof bar.time === 'string'
          ? bar.time
          : new Date((seconds[i] ?? 0) * 1000).toISOString().slice(0, 10);
      ends.set(day, i); // a later bar of the same day keeps the day's place, updates its index
    });
    return ends;
  }, [bars, zone]);
  const days = useMemo(() => [...dayEnds.keys()], [dayEnds]);
  const cursor = bars[cursorIndex];
  const startAt = (index: number) => {
    const bar = bars[Math.min(Math.max(index, 0), bars.length - 1)];
    if (bar !== undefined) replay.setCursor(bar.time, true);
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
      <DatePicker
        label="Start date"
        days={days}
        value={cursor === undefined ? undefined : localDate(cursor.time, zone)}
        onPick={(day) => {
          const index = dayEnds.get(day);
          if (index !== undefined) startAt(index);
        }}
      />
      <IconButton
        label="Go to the last bar"
        icon={<ChevronLast size={ICON} />}
        tooltipSide="top"
        onClick={() => {
          startAt(bars.length - 1);
        }}
      />
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
