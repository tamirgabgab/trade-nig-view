import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type Theme = 'dark' | 'light';

export interface ThemeState {
  theme: Theme;
  toggleTheme: () => void;
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
      merge: (persisted, current) => ({
        ...current,
        theme:
          typeof persisted === 'object' &&
          persisted !== null &&
          (persisted as { theme?: unknown }).theme === 'light'
            ? 'light'
            : 'dark',
      }),
    },
  ),
);
