import { ChevronsRight, Pause, Play, Shuffle, StepForward, X } from 'lucide-react';

import type { Bar } from '../api/bars.ts';
import { barSeconds } from '../chart/visibleRange.ts';
import { REPLAY_SPEEDS, useReplayStore, type ReplaySpeed } from '../store/replayStore.ts';
import { formatBarTime } from './formatClock.ts';
import { IconButton } from './IconButton.tsx';
import styles from './ReplayBar.module.css';
import { useDisplayTimeZone } from './useDisplayTimeZone.ts';

const ICON = 18;
/** A random start leaves room for warm-up before it and for the replay after it. */
const RANDOM_MARGIN = 50;

const isoDate = (time: Bar['time']) => new Date(barSeconds(time) * 1000).toISOString().slice(0, 10);

/**
 * Replay controls (R7), floating at the bottom of the chart. Picking: choose the start bar by a
 * click on the chart, a date or at random. Replaying: play/pause, step (Shift+→), speed, the
 * cursor's date, back to the present.
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
  const first = bars[0];
  const last = bars.at(-1);
  const cursor = bars[cursorIndex];
  const startAt = (index: number) => {
    const bar = bars[Math.min(Math.max(index, 0), bars.length - 1)];
    if (bar !== undefined) replay.setCursor(bar.time);
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
          min={first === undefined ? undefined : isoDate(first.time)}
          max={last === undefined ? undefined : isoDate(last.time)}
          value={cursor === undefined ? '' : isoDate(cursor.time)}
          onChange={(event) => {
            const day = event.target.value;
            if (day === '') return;
            // The last bar on or before that date.
            const at = Date.parse(`${day}T23:59:59Z`) / 1000;
            startAt(bars.findLastIndex((bar) => barSeconds(bar.time) <= at));
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
        label="Back to the present"
        icon={<ChevronsRight size={ICON} />}
        tooltipSide="top"
        onClick={replay.exit}
      />
      <IconButton
        label="Exit replay"
        icon={<X size={ICON} />}
        tooltipSide="top"
        onClick={replay.exit}
      />
    </div>
  );
}
