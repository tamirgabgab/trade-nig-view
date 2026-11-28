import { create } from 'zustand';

import type { ProfileId, Strategy } from '../api/strategies.ts';

export type StrategySource = 'saved' | 'example' | 'python';

/** The strategy the Strategy tab works on: where it came from, and its (edited) content. */
export interface CurrentStrategy {
  source: StrategySource;
  /** The saved name, the example's name or the Python file's stem. */
  name: string;
  /** The saved revision (0 for an example or a file not saved yet). */
  revision: number;
  strategy: Strategy;
}

interface StrategyState {
  profile: ProfileId;
  current: CurrentStrategy | null;
  /** Draw the current strategy's signals on the chart. */
  show: boolean;
  setProfile: (profile: ProfileId) => void;
  choose: (current: CurrentStrategy | null) => void;
  edit: (strategy: Strategy) => void;
  setShow: (show: boolean) => void;
}

/** The Strategy tab (P4 B0). Not saved: strategies themselves are saved on the backend. */
export const useStrategyStore = create<StrategyState>()((set) => ({
  profile: 'position',
  current: null,
  show: false,
  setProfile: (profile) => {
    set((s) => (s.profile === profile ? s : { profile, current: null, show: false }));
  },
  choose: (current) => {
    set({ current });
  },
  edit: (strategy) => {
    set((s) => (s.current === null ? s : { current: { ...s.current, strategy } }));
  },
  setShow: (show) => {
    set({ show });
  },
}));
