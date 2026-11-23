import { create } from 'zustand';

import type { Bar } from '../api/bars.ts';

/** Replay speeds in bars per second. */
export const REPLAY_SPEEDS = [0.5, 1, 2, 5, 10] as const;
export type ReplaySpeed = (typeof REPLAY_SPEEDS)[number];

export interface ReplayState {
  /** off; picking the start bar; replaying. */
  mode: 'off' | 'picking' | 'on';
  /** Symbol the replay runs on (another symbol ends it). */
  symbol: string | null;
  /** Time of the last bar shown (the replay cursor); null until a start bar is picked. */
  cursor: Bar['time'] | null;
  playing: boolean;
  speed: ReplaySpeed;
  /** Bumped by a jump (a new start bar): the chart then scrolls to the cursor. */
  jumps: number;
  /** A start date ('YYYY-MM-DD') still to apply once the symbol's bars are in (an exercise card). */
  startDay: string | null;
  /** Pick the start bar on `symbol`; with `day`, the chart starts at its last bar on or before it. */
  start: (symbol: string, day?: string) => void;
  /** Show the bars up to and including this one; `jump`: a new start, bring it into view. */
  setCursor: (time: Bar['time'], jump?: boolean) => void;
  setPlaying: (playing: boolean) => void;
  setSpeed: (speed: ReplaySpeed) => void;
  exit: () => void;
}

/**
 * Bar replay (R7): the chart shows the history only up to the cursor, then steps forward bar by
 * bar. Not saved: a reload is back to the present.
 */
export const useReplayStore = create<ReplayState>()((set) => ({
  mode: 'off',
  symbol: null,
  cursor: null,
  playing: false,
  speed: 1,
  jumps: 0,
  startDay: null,
  start: (symbol, day) => {
    set({ mode: 'picking', symbol, cursor: null, playing: false, startDay: day ?? null });
  },
  setCursor: (cursor, jump = false) => {
    set((s) => ({ mode: 'on', cursor, jumps: jump ? s.jumps + 1 : s.jumps, startDay: null }));
  },
  setPlaying: (playing) => {
    set({ playing });
  },
  setSpeed: (speed) => {
    set({ speed });
  },
  exit: () => {
    set({ mode: 'off', symbol: null, cursor: null, playing: false, startDay: null });
  },
}));
