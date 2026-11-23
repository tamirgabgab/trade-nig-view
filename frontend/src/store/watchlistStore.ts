import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface WatchlistStoreState {
  /** The watchlist shown (falls back to the first one when it no longer exists). */
  active: string;
  setActive: (name: string) => void;
  /** The section the section dialogs act on (not saved). */
  editingSection: number;
}

/** Which watchlist is shown, remembered between visits. */
export const useWatchlistStore = create<WatchlistStoreState>()(
  persist(
    (set) => ({
      active: 'Default',
      editingSection: 0,
      setActive: (active) => {
        set({ active });
      },
    }),
    {
      name: 'chartlab.watchlist',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ active: s.active }),
      merge: (persisted, current) => {
        const active = (persisted as { active?: unknown } | null)?.active;
        return { ...current, ...(typeof active === 'string' && active !== '' ? { active } : {}) };
      },
    },
  ),
);
