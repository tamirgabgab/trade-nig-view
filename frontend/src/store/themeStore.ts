import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { isRecord } from '../api/client.ts';

/** The theme presets (styles/tokens.css): dark and light, and four variants of them. */
export const THEMES = ['dark', 'light', 'midnight', 'graphite', 'amber', 'paper'] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_NAMES: Record<Theme, string> = {
  dark: 'Dark',
  light: 'Light',
  midnight: 'Midnight',
  graphite: 'Graphite',
  amber: 'Amber terminal',
  paper: 'Paper',
};

/** Light-background presets (the rest are dark). */
export const isLightTheme = (theme: Theme) => theme === 'light' || theme === 'paper';

export interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  /** The top-bar sun/moon: a light preset goes to Dark, a dark one to Light. */
  toggleTheme: () => void;
}

/** Only a known preset survives from storage (anything else is the dark default). */
export function sanitizePersisted(persisted: unknown): { theme: Theme } {
  const value = isRecord(persisted) ? persisted['theme'] : undefined;
  return { theme: THEMES.find((t) => t === value) ?? 'dark' };
}

/** The theme preset (dark by default), remembered between visits. */
export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'dark',
      setTheme: (theme) => {
        set({ theme });
      },
      toggleTheme: () => {
        set((s) => ({ theme: isLightTheme(s.theme) ? 'dark' : 'light' }));
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
