import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { isRecord } from '../api/client.ts';

export type Theme = 'dark' | 'light';

export interface ThemeState {
  theme: Theme;
  toggleTheme: () => void;
}

/** Only 'light' or 'dark' survive from storage (anything else is the dark default). */
export function sanitizePersisted(persisted: unknown): { theme: Theme } {
  return { theme: isRecord(persisted) && persisted['theme'] === 'light' ? 'light' : 'dark' };
}

/** Light or dark UI (dark by default), remembered between visits. */
export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'dark',
      toggleTheme: () => {
        set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' }));
      },
    }),
    {
      name: 'chartlab.theme',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ theme: state.theme }),
      migrate: (persisted) => sanitizePersisted(persisted),
      merge: (persisted, current) => ({ ...current, ...sanitizePersisted(persisted) }),
    },
  ),
);
