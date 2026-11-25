import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { isRecord } from '../api/client.ts';

/** The panels that can be widened: the right sidebar's panel and the learn drawer. */
export type Panel = 'sidebar' | 'learn';

/** Default, minimum and maximum width of each panel in px (the window also caps it). */
export const PANEL_WIDTHS: Record<Panel, { initial: number; min: number; max: number }> = {
  sidebar: { initial: 320, min: 260, max: 900 },
  learn: { initial: 580, min: 380, max: 1400 },
};

type Widths = Record<Panel, number>;

export const clampWidth = (panel: Panel, width: number) => {
  const { min, max } = PANEL_WIDTHS[panel];
  return Math.round(Math.min(Math.max(width, min), max));
};

/** Only finite widths survive from storage, clamped; anything else is the default. */
export function sanitizePersisted(persisted: unknown): Widths {
  const r = isRecord(persisted) ? persisted : {};
  const width = (panel: Panel) => {
    const v = r[panel];
    return typeof v === 'number' && Number.isFinite(v)
      ? clampWidth(panel, v)
      : PANEL_WIDTHS[panel].initial;
  };
  return { sidebar: width('sidebar'), learn: width('learn') };
}

/** The widths the user dragged the side panels to, remembered between visits. */
export const usePanelWidthStore = create<
  Widths & { setWidth: (panel: Panel, width: number) => void }
>()(
  persist(
    (set) => ({
      sidebar: PANEL_WIDTHS.sidebar.initial,
      learn: PANEL_WIDTHS.learn.initial,
      setWidth: (panel, width) => {
        set({ [panel]: clampWidth(panel, width) });
      },
    }),
    {
      name: 'chartlab.panelWidths',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s): Widths => ({ sidebar: s.sidebar, learn: s.learn }),
      migrate: (persisted) => sanitizePersisted(persisted),
      merge: (persisted, current) => ({ ...current, ...sanitizePersisted(persisted) }),
    },
  ),
);
