import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { LayoutState } from '../api/layouts.ts';

export const DEFAULT_LAYOUT = 'Unnamed';

export type LayoutStatus = 'loading' | 'saved' | 'saving' | 'error';

export interface LayoutStoreState {
  /** The open layout (saved to automatically). */
  name: string;
  /** Its revision on the backend (0 = not saved yet). */
  revision: number;
  status: LayoutStatus;
  /** Visible range and pane sizes of a layout just opened, applied once its bars are in. */
  pending: Pick<LayoutState, 'visibleRange' | 'stretches' | 'symbol' | 'interval'> | null;
}

/** Which layout is open (remembered between visits) and how its saving goes. */
export const useLayoutStore = create<LayoutStoreState>()(
  persist(
    (): LayoutStoreState => ({
      name: DEFAULT_LAYOUT,
      revision: 0,
      status: 'loading',
      pending: null,
    }),
    {
      name: 'chartlab.layout',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ name: s.name }),
      merge: (persisted, current) => {
        const name = (persisted as { name?: unknown } | null)?.name;
        return {
          ...current,
          name: typeof name === 'string' && name !== '' ? name : DEFAULT_LAYOUT,
        };
      },
    },
  ),
);
